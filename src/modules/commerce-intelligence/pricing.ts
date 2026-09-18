// Preço versionado + cálculo exato de custo (Slice 010 / design 2026-09-18).
// Aritmética exclusivamente BigInt em unidades menores escaladas; float proibido.
// O custo é observabilidade: nenhum erro aqui pode alterar geração, quota ou estado do job.
import type { Prisma } from "@prisma/client";

export type PriceCompleteness = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

// Estruturalmente idêntico a ProviderTokenUsage (provider.ts) para desacoplar pricing de provider.
export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
};

export type PriceBook = {
  currency: string | null;
  inputPerMillionMinor: string | null;
  outputPerMillionMinor: string | null;
  reasoningPerMillionMinor: string | null;
  cachedPerMillionMinor: string | null;
};

export type ResolvedPrice = PriceBook & { versionId: string; version: number };

export type CostEstimate = {
  currency: string | null;
  amountMinor: string | null;
  completeness: PriceCompleteness;
};

// Injeção do delegate Prisma: testes unitários herméticos sem banco (padrão Pick do repo).
export type PriceReader = Pick<Prisma.TransactionClient, "providerModelPrice">;

// Catálogo do operador inconsistente (vigências sobrepostas / moedas ambíguas): falha explícita;
// o chamador degrada para UNAVAILABLE em vez de inventar preço.
export class PriceCatalogError extends Error {}

const SCALE = 1_000_000n; // 6 casas decimais de rate × "por milhão de tokens" compartilham 10^6

const RATE_FIELDS = ["inputPerMillionMinor", "outputPerMillionMinor", "reasoningPerMillionMinor", "cachedPerMillionMinor"] as const;
type RateField = (typeof RATE_FIELDS)[number];

// Decimal(20,6) chega como string/Decimal; aceita apenas dígitos com ≤6 casas, nunca negativo.
function parseRate(value: string | null): bigint | null {
  if (value == null) return null;
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * SCALE + BigInt((match[2] ?? "").padEnd(6, "0"));
}

// Usage fora do domínio (negativo, fracionário, não-inteiro) vira dimensão desconhecida, nunca 0.
function safeTokens(value: number | null | undefined): bigint | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
}

// Bucket não sobreposto base-subset; subconjunto maior que a base é inconsistência (gap), não negativo.
function nonOverlapping(base: bigint | null, subset: bigint | null): { value: bigint | null; inconsistent: boolean } {
  if (base == null) return { value: null, inconsistent: false };
  if (subset != null && subset > base) return { value: 0n, inconsistent: true };
  return { value: base - (subset ?? 0n), inconsistent: false };
}

// Semântica documentada (design aprovado): cached ⊆ input; reasoning ⊆ output.
// - cached reportado sem cachedPerMillionMinor → PARTIAL (dimensão desconhecida; sem fallback p/ input).
// - reasoning reportado sem rate próprio anda dentro do output precificado (sem dupla contagem);
//   sem base de output determinável → gap.
// - buckets computáveis são somados escalados e arredondados uma única vez (half-up).
export function calculateCost(usage: TokenUsage | null, price: PriceBook | null): CostEstimate {
  if (!price || price.currency == null) return { currency: null, amountMinor: null, completeness: "UNAVAILABLE" };
  const currency = price.currency;
  const input = safeTokens(usage?.inputTokens ?? null);
  const output = safeTokens(usage?.outputTokens ?? null);
  const reasoning = safeTokens(usage?.reasoningTokens ?? null);
  const cached = safeTokens(usage?.cachedTokens ?? null);
  if (input == null && output == null && reasoning == null && cached == null) {
    return { currency, amountMinor: null, completeness: "UNAVAILABLE" };
  }

  const rIn = parseRate(price.inputPerMillionMinor);
  const rOut = parseRate(price.outputPerMillionMinor);
  const rReason = parseRate(price.reasoningPerMillionMinor);
  const rCached = parseRate(price.cachedPerMillionMinor);

  let scaled = 0n; // micro-menor acumulado
  let buckets = 0;
  let gap = false;

  if (cached != null) {
    if (rCached != null) { scaled += cached * rCached; buckets += 1; } else { gap = true; }
    if (input == null) gap = true; // base input necessariamente existiu e não foi reportada
  }
  const inputRest = nonOverlapping(input, cached);
  if (inputRest.inconsistent) gap = true;
  // Ausência da dimensão (inputTokens null) não é lacuna cobrável; só gap com usage presente e sem rate.
  if (rIn != null && inputRest.value != null) { scaled += inputRest.value * rIn; buckets += 1; } else if (inputRest.value != null && rIn == null) { gap = true; }
  const outputRest = nonOverlapping(output, rReason != null ? reasoning : null);
  if (outputRest.inconsistent) gap = true;
  if (reasoning != null && rReason != null) {
    scaled += reasoning * rReason; buckets += 1;
  } else if (reasoning != null && rReason == null && !(output != null && rOut != null)) {
    gap = true; // sem rate próprio e sem output precificado: base não determinável
  }
  if (output != null) {
    if (rOut != null && outputRest.value != null) { scaled += outputRest.value * rOut; buckets += 1; } else if (rOut == null) { gap = true; }
  }

  if (buckets === 0) return { currency, amountMinor: null, completeness: "UNAVAILABLE" };
  // scaled = custoMinor × 10^12 (rate ×10^6 para casas decimais, tokens "por milhão" ×10^6).
  const SCALED = SCALE * SCALE;
  const amountMinor = (scaled + SCALED / 2n) / SCALED; // half-up único no fechamento
  return { currency, amountMinor: amountMinor.toString(), completeness: gap ? "PARTIAL" : "COMPLETE" };
}

// Resolve a versão ativa em `at` (vigência [effectiveFrom, effectiveTo)). Sem moeda preferida,
// exige exatamente uma moeda ativa; sobreposição de vigências na moeda escolhida rejeita.
export async function resolveProviderModelPrice(
  db: PriceReader,
  provider: string,
  model: string,
  at: Date,
  preferredCurrency?: string | null,
): Promise<ResolvedPrice | null> {
  const currency = preferredCurrency?.trim().toUpperCase() || null;
  const rows = await db.providerModelPrice.findMany({
    where: {
      provider,
      model,
      ...(currency ? { currency } : {}),
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
  });
  if (rows.length === 0) return null;
  if (!currency) {
    const currencies = new Set(rows.map((row) => row.currency));
    if (currencies.size > 1) throw new PriceCatalogError(`moedas ativas ambíguas para ${provider}/${model}`);
  }
  if (rows.length > 1) throw new PriceCatalogError(`vigências de preço sobrepostas para ${provider}/${model}`);
  const row = rows[0]!;
  const rates = Object.fromEntries(RATE_FIELDS.map((field: RateField) => [field, row[field] == null ? null : String(row[field])]));
  return {
    versionId: row.id,
    version: row.version,
    currency: row.currency,
    ...rates,
  } as ResolvedPrice;
}
