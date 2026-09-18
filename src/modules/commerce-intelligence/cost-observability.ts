// Custo por tentativa efetiva (design 2026-09-18): transformação determinística dos
// CapabilityEvents em registros sanitizados + agregação capability/Content/job.
// Fonte canônica: IntelligenceRun.metadata.capabilities[]; nada de totais duplicados.
import { calculateCost, type PriceCompleteness, type ResolvedPrice } from "./pricing";
import type { LogicalTask, ProviderTokenUsage } from "./model-router";

export type CapabilityUsageCost = {
  task: LogicalTask;
  contentId?: string;
  attempt: number;
  retry: number;
  usage: ProviderTokenUsage;
  pricing: { versionId: string | null; currency: string | null };
  cost: { amountMinor: string | null; completeness: PriceCompleteness };
};

// Subconjunto lido do CapabilityEvent: events com attempts[] geram um registro por callback
// efetiva do provider; events legados (sem attempts) caem para o usage do próprio evento.
export type RunCostInputEvent = {
  task: LogicalTask;
  provider?: string;
  model?: string;
  contentId?: string;
  attempt: number;
  retry: number;
  usage?: ProviderTokenUsage;
  attempts?: Array<{ usage?: ProviderTokenUsage; retry?: number }>;
};

// Snapshot imutável do preço aplicável no momento da resolução: o próprio ResolvedPrice
// do pricing (fonte única; sem drift de forma entre módulos).
export type PriceSnapshot = ResolvedPrice;

// Resolve o snapshot de preço por (provider, model); null = catálogo sem versão aplicável.
export type PriceSnapshotResolver = (provider: string | undefined, model: string | undefined) => Promise<PriceSnapshot | null>;

// Chave lógica de unicidade: job (contexto do array) + capability + tentativa + retry.
const recordKey = (record: { task: LogicalTask; contentId?: string; attempt: number; retry: number }): string =>
  `${record.task}|${record.contentId ?? ""}|${record.attempt}|${record.retry}`;

export async function buildCapabilityUsageCosts(
  events: RunCostInputEvent[],
  resolvePrice: PriceSnapshotResolver,
): Promise<CapabilityUsageCost[]> {
  const records: CapabilityUsageCost[] = [];
  const priceCache = new Map<string, PriceSnapshot | null>();
  for (const event of events) {
    const perAttempt = event.attempts?.length
      ? event.attempts.map((attempt) => ({ usage: attempt.usage, retry: attempt.retry ?? 0 }))
      : event.usage
        ? [{ usage: event.usage, retry: event.retry }]
        : [];
    // Dedupe POR EVENTO (chave retry): callbacks distintas do mesmo evento são tentativas
    // efetivas distintas; eventos repetidos (chunks da mesma task sem contentId) são
    // chamadas legítimas e NUNCA se deduplicam entre si.
    const seenRetries = new Set<number>();
    for (const attempt of perAttempt) {
      // Tentativa sem usage do provider não cria custo (nunca inferido de bytes/texto).
      const usage = attempt.usage ?? null;
      if (!usage) continue;
      if (seenRetries.has(attempt.retry)) continue;
      seenRetries.add(attempt.retry);
      let price: PriceSnapshot | null = null;
      try {
        price = await resolvePriceCached(event.provider, event.model, resolvePrice, priceCache);
      } catch {
        price = null; // catálogo inconsistente degrada para UNAVAILABLE; custo nunca derruba o job
      }
      const estimate = calculateCost(usage, price);
      const record: CapabilityUsageCost = {
        task: event.task,
        contentId: event.contentId,
        attempt: event.attempt,
        retry: attempt.retry,
        usage,
        pricing: { versionId: price?.versionId ?? null, currency: estimate.currency },
        cost: { amountMinor: estimate.amountMinor, completeness: estimate.completeness },
      };
      records.push(record);
    }
  }
  return records;
}

// Resolução memoizada por (provider, model): todas as tentativas do run compartilham
// a versão ativa na finalização — preço é append-only e nunca retroage.
async function resolvePriceCached(
  provider: string | undefined,
  model: string | undefined,
  resolvePrice: PriceSnapshotResolver,
  cache: Map<string, PriceSnapshot | null>,
): Promise<PriceSnapshot | null> {
  const cacheKey = `${provider ?? ""}|${model ?? ""}`;
  if (!cache.has(cacheKey)) cache.set(cacheKey, await resolvePrice(provider, model));
  return cache.get(cacheKey)!;
}

// Anexa pricing/cost por tentativa diretamente nos eventos que entram no run metadata
// (capabilities continua canônica): attempts[i] recebe o custo da própria tentativa;
// o evento recebe o custo da tentativa final (última callback). Idempotente por chave.
export async function attachCapabilityCosts(
  events: RunCostInputEvent[],
  resolvePrice: PriceSnapshotResolver,
): Promise<CapabilityUsageCost[]> {
  const records = await buildCapabilityUsageCosts(events, resolvePrice);
  // Fila por chave: eventos repetidos (mesma task/contentId/attempt/retry) são chamadas
  // distintas e consomem registros distintos na ordem de produção, sem trocar custos.
  const queueByKey = new Map<string, CapabilityUsageCost[]>();
  for (const record of records) {
    const queue = queueByKey.get(recordKey(record)) ?? [];
    queue.push(record);
    queueByKey.set(recordKey(record), queue);
  }
  const take = (key: string): CapabilityUsageCost | undefined => queueByKey.get(key)?.shift();
  for (const event of events) {
    const attach = (target: Record<string, unknown>, record: CapabilityUsageCost | undefined) => {
      if (!record) return;
      Object.assign(target, {
        pricing: { versionId: record.pricing.versionId, currency: record.pricing.currency },
        cost: { amountMinor: record.cost.amountMinor, completeness: record.cost.completeness },
      });
    };
    if (event.attempts?.length) {
      for (const attempt of event.attempts) {
        if (!attempt.usage) continue;
        attach(attempt, take(recordKey({ task: event.task, contentId: event.contentId, attempt: event.attempt, retry: attempt.retry ?? 0 })));
      }
      attach(event, take(recordKey({ task: event.task, contentId: event.contentId, attempt: event.attempt, retry: event.attempts[event.attempts.length - 1]?.retry ?? event.retry })));
    } else {
      attach(event, take(recordKey({ task: event.task, contentId: event.contentId, attempt: event.attempt, retry: event.retry })));
    }
  }
  return records;
}

export type CostTotal = { currency: string | null; amountMinor: string | null; completeness: PriceCompleteness };

export type RunCostAggregates = {
  job: CostTotal;
  contents: Array<{ contentId: string; total: CostTotal }>;
  capabilities: Array<{ task: LogicalTask; contentId?: string; total: CostTotal }>;
};

type CostRecordLike = {
  task?: unknown;
  contentId?: unknown;
  attempts?: unknown;
  pricing?: { currency?: unknown; versionId?: unknown };
  cost?: { amountMinor?: unknown; completeness?: unknown };
};

const recordTotal = (record: CostRecordLike): CostTotal => ({
  currency: typeof record.pricing?.currency === "string" ? record.pricing.currency : null,
  amountMinor: typeof record.cost?.amountMinor === "string" ? record.cost.amountMinor : null,
  completeness: record.cost?.completeness === "COMPLETE" || record.cost?.completeness === "PARTIAL" ? record.cost.completeness : "UNAVAILABLE",
});

// Regras aprovadas: nenhum custo calculável = UNAVAILABLE; qualquer entrada com valor
// conhecido e algo faltando (ou moeda mista, que não soma) = PARTIAL/UNAVAILABLE conforme
// abaixo; COMPLETE somente com ≥1 entrada e TODAS COMPLETE na mesma moeda.
function summarize(entries: CostTotal[]): CostTotal {
  const withAmount = entries.filter((entry) => entry.amountMinor != null);
  if (withAmount.length === 0) {
    return { currency: entries.find((entry) => entry.currency)?.currency ?? null, amountMinor: null, completeness: "UNAVAILABLE" };
  }
  const currencies = new Set(withAmount.map((entry) => entry.currency));
  if (currencies.size > 1) return { currency: null, amountMinor: null, completeness: "UNAVAILABLE" };
  const amountMinor = withAmount.reduce((total, entry) => total + BigInt(entry.amountMinor!), 0n).toString();
  const allComplete = withAmount.length === entries.length && entries.every((entry) => entry.completeness === "COMPLETE");
  return { currency: withAmount[0]!.currency, amountMinor, completeness: allComplete ? "COMPLETE" : "PARTIAL" };
}

export function aggregateRunCosts(metadata: unknown): RunCostAggregates {
  const raw = (metadata as { capabilities?: unknown } | null)?.capabilities;
  const entries: CostRecordLike[] = Array.isArray(raw) ? (raw as CostRecordLike[]) : [];
  // Flatten canônico: eventos com attempts[] contam cada tentativa que TEM custo
  // (tentativa sem usage nunca criou custo); eventos legados contam o próprio custo.
  const records: CostRecordLike[] = [];
  for (const entry of entries) {
    const attempts = Array.isArray(entry.attempts) ? (entry.attempts as CostRecordLike[]) : [];
    if (attempts.length > 0) {
      for (const attempt of attempts) if (attempt.cost) records.push({ task: entry.task, contentId: entry.contentId, pricing: attempt.pricing, cost: attempt.cost });
    } else {
      // Legado (sem attempts): a entrada sempre projeta — sem cost/completeness é UNAVAILABLE.
      records.push(entry);
    }
  }
  const byContent = new Map<string, CostTotal[]>();
  const totals: Array<{ task: LogicalTask; contentId?: string; total: CostTotal }> = [];
  for (const record of records) {
    const total = recordTotal(record);
    totals.push({ task: record.task as LogicalTask, contentId: typeof record.contentId === "string" ? record.contentId : undefined, total });
    if (typeof record.contentId === "string") {
      const list = byContent.get(record.contentId) ?? [];
      list.push(total);
      byContent.set(record.contentId, list);
    }
  }
  return {
    job: summarize(totals.map((entry) => entry.total)),
    contents: [...byContent.entries()].map(([contentId, list]) => ({ contentId, total: summarize(list) })),
    capabilities: totals,
  };
}
