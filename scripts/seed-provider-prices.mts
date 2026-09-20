// Seed do catálogo de preços do operador (design 2026-09-18): catálogo SOMENTE fornecido por operador.
// Catálogo vazio/ausente é válido → custo em runtime fica UNAVAILABLE; nunca inventar rates.
// Append-only: insere apenas versões novas; nunca atualiza nem apaga versões existentes.
import { loadDotEnvFile } from "../src/modules/env-loader";
import { prisma } from "../src/modules/db";
import type { Prisma } from "@prisma/client";

loadDotEnvFile(".env");

type CatalogEntry = {
  provider: string;
  model: string;
  currency: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  inputPerMillionMinor?: string | null;
  outputPerMillionMinor?: string | null;
  reasoningPerMillionMinor?: string | null;
  cachedPerMillionMinor?: string | null;
};

const RATE_FIELDS = ["inputPerMillionMinor", "outputPerMillionMinor", "reasoningPerMillionMinor", "cachedPerMillionMinor"] as const;
type RateField = (typeof RATE_FIELDS)[number];

const RATE_RE = /^\d+(\.\d{1,6})?$/;

function fail(message: string): never {
  console.error(`[seed-provider-prices] ${message}`);
  process.exit(1);
}

function parseCatalog(raw: string): CatalogEntry[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return fail("PROVIDER_PRICE_CATALOG_JSON não é JSON válido"); }
  if (!Array.isArray(parsed)) return fail("PROVIDER_PRICE_CATALOG_JSON deve ser um array");
  return parsed as CatalogEntry[];
}

function validate(entries: CatalogEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.provider}|${entry.model}|${entry.currency}|${entry.version}`;
    if (seen.has(key)) fail(`versão duplicada no catálogo: ${key}`);
    seen.add(key);
    if (!entry.provider || !entry.model || !entry.currency || !Number.isInteger(entry.version) || entry.version < 1) {
      fail(`entrada inválida (provider/model/currency/version obrigatórios): ${key}`);
    }
    if (!entry.effectiveFrom) fail(`effectiveFrom obrigatório: ${key}`);
    for (const field of RATE_FIELDS) {
      const rate = entry[field];
      if (rate == null) continue;
      if (!RATE_RE.test(String(rate).trim())) fail(`rate inválida (esperado decimal ≥ 0 com ≤6 casas): ${key}.${field}=${String(rate)}`);
    }
  }
  // Vigências não sobrepostas por (provider, model, currency): [from, to) ordenado não pode cruzar.
  const byFamily = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const family = `${entry.provider}|${entry.model}|${entry.currency}`;
    const list = byFamily.get(family) ?? [];
    list.push(entry);
    byFamily.set(family, list);
  }
  for (const [family, list] of byFamily) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => Date.parse(a.effectiveFrom) - Date.parse(b.effectiveFrom));
    for (let i = 1; i < sorted.length; i += 1) {
      const previousTo = sorted[i - 1]!.effectiveTo == null ? Infinity : Date.parse(sorted[i - 1]!.effectiveTo!);
      if (previousTo > Date.parse(sorted[i]!.effectiveFrom)) fail(`vigências sobrepostas em ${family}`);
    }
  }
}

async function main(): Promise<void> {
  const raw = process.env.PROVIDER_PRICE_CATALOG_JSON?.trim() ?? "";
  if (raw === "") {
    console.log("[seed-provider-prices] catálogo ausente/vazio: válido; custo em runtime ficará UNAVAILABLE");
    return;
  }
  const entries = parseCatalog(raw);
  validate(entries);
  let inserted = 0;
  let skipped = 0;
  for (const entry of entries) {
    const currency = entry.currency.trim().toUpperCase();
    const existing = await prisma.providerModelPrice.findUnique({
      where: { provider_model_currency_version: { provider: entry.provider, model: entry.model, currency, version: entry.version } },
      select: { id: true },
    });
    if (existing) { skipped += 1; continue; }
    const rates: Partial<Record<RateField, Prisma.Decimal | null>> = {};
    for (const field of RATE_FIELDS) rates[field] = entry[field] == null ? null : String(entry[field]).trim();
    await prisma.providerModelPrice.create({
      data: {
        provider: entry.provider,
        model: entry.model,
        currency,
        version: entry.version,
        ...rates,
        effectiveFrom: new Date(entry.effectiveFrom),
        effectiveTo: entry.effectiveTo == null ? null : new Date(entry.effectiveTo),
      },
    });
    inserted += 1;
  }
  console.log(`[seed-provider-prices] inseridas=${inserted} já-existentes(skip)=${skipped}`);
}

main()
  .catch((error: unknown) => { console.error("[seed-provider-prices] falhou", error instanceof Error ? error.message : error); process.exit(1); })
  .finally(() => prisma.$disconnect());
