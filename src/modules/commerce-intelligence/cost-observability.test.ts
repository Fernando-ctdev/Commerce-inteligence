import test from "node:test";
import assert from "node:assert/strict";
import { buildCapabilityUsageCosts, attachCapabilityCosts, aggregateRunCosts, type RunCostInputEvent, type PriceSnapshot } from "./cost-observability";

import type { LogicalTask, ProviderTokenUsage } from "./model-router";

type AttachableAttempt = { usage?: ProviderTokenUsage; retry?: number; pricing?: { versionId: string | null; currency: string | null }; cost?: { amountMinor: string | null; completeness: string } };
type AttachableEvent = Omit<RunCostInputEvent, "attempts"> & { attempts?: AttachableAttempt[]; pricing?: { versionId: string | null; currency: string | null }; cost?: { amountMinor: string | null; completeness: string } };

const BRL: PriceSnapshot = {
  versionId: "price-1",
  version: 2,
  currency: "BRL",
  inputPerMillionMinor: "1000000",
  outputPerMillionMinor: "2000000",
  reasoningPerMillionMinor: null,
  cachedPerMillionMinor: null,
};

const USD: PriceSnapshot = { ...BRL, versionId: "price-usd", currency: "USD" };

const usage = (overrides: Partial<RunCostInputEvent["usage"]>) => ({ inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null, ...overrides });

function resolverByCurrency(currency: string) {
  const calls: Array<[string | undefined, string | undefined]> = [];
  return {
    calls,
    resolve: async (provider: string | undefined, model: string | undefined) => {
      calls.push([provider, model]);
      return currency === "BRL" ? BRL : USD;
    },
  };
}

test("builds one record per effective attempt from attempts[] (fallback não perde a sacrificada)", async () => {
  const { resolve, calls } = resolverByCurrency("BRL");
  const events: RunCostInputEvent[] = [{
    task: "CONTENT_BRIEF_GENERATION",
    provider: "openai-compatible",
    model: "m1",
    attempt: 1,
    retry: 1,
    usage: usage({ inputTokens: 1000, outputTokens: 500 }),
    attempts: [
      { usage: usage({ inputTokens: 800, outputTokens: 0 }), retry: 0 },
      { usage: usage({ inputTokens: 1000, outputTokens: 500 }), retry: 1 },
    ],
  }];
  const records = await buildCapabilityUsageCosts(events, resolve);
  assert.equal(records.length, 2, "duas tentativas efetivas, dois registros");
  // sacrificada: retry 0, custo próprio
  assert.equal(records[0]?.retry, 0);
  assert.equal(records[0]?.cost.amountMinor, "800");
  assert.equal(records[0]?.cost.completeness, "COMPLETE");
  // final: retry 1
  assert.equal(records[1]?.retry, 1);
  assert.equal(records[1]?.cost.amountMinor, "2000");
  assert.deepEqual(records[1]?.pricing, { versionId: "price-1", currency: "BRL" });
  assert.equal(calls.length, 1, "resolução de preço memoizada por provider/model");
});

test("eventos sem attempts caem para usage do evento (compatível com metadata antiga em runtime novo)", async () => {
  const records = await buildCapabilityUsageCosts(
    [{ task: "PRODUCT_UNDERSTANDING", provider: "p", model: "m", attempt: 1, retry: 0, usage: usage({ outputTokens: 400 }) }],
    resolverByCurrency("BRL").resolve,
  );
  assert.equal(records.length, 1);
  assert.equal(records[0]?.cost.amountMinor, "800");
});

test("tentativas sem usage não criam custo; usage todo-nulo persiste UNAVAILABLE", async () => {
  const records = await buildCapabilityUsageCosts(
    [
      { task: "STRATEGY_SYNTHESIS", attempt: 1, retry: 0, attempts: [{ usage: undefined, retry: 0 }, { usage: usage({}), retry: 1 }] },
    ],
    resolverByCurrency("BRL").resolve,
  );
  assert.equal(records.length, 1, "só a tentativa com usage (nulo) persiste");
  assert.equal(records[0]?.pricing.versionId, "price-1");
  assert.equal(records[0]?.pricing.currency, "BRL");
  assert.equal(records[0]?.cost.amountMinor, null);
  assert.equal(records[0]?.cost.completeness, "UNAVAILABLE");
});

test("resolver que lança degrada para UNAVAILABLE sem versionId nem moeda", async () => {
  const records = await buildCapabilityUsageCosts(
    [{ task: "PRODUCT_UNDERSTANDING", attempt: 1, retry: 0, usage: usage({ inputTokens: 10 }) }],
    async () => { throw new Error("vigências sobrepostas"); },
  );
  assert.deepEqual(records[0]?.pricing, { versionId: null, currency: null });
  assert.equal(records[0]?.cost.completeness, "UNAVAILABLE");
});

test("dedupe é POR EVENTO: retry duplicado no mesmo evento não duplica; eventos repetidos são chamadas distintas", async () => {
  // mesmo evento com attempts repetindo retry 0 → um único registro
  const duplicated: RunCostInputEvent = { task: "CONTENT_BRIEF_REPAIR", contentId: "c1", attempt: 2, retry: 0, attempts: [{ usage: usage({ inputTokens: 100 }), retry: 0 }, { usage: usage({ inputTokens: 100 }), retry: 0 }] };
  const single = await buildCapabilityUsageCosts([duplicated], resolverByCurrency("BRL").resolve);
  assert.equal(single.length, 1);
  // chunks repetidos da mesma task sem contentId são chamadas legítimas → N registros
  const chunk: RunCostInputEvent = { task: "CONTENT_BRIEF_GENERATION", attempt: 1, retry: 0, usage: usage({ inputTokens: 100 }) };
  const repeated = await buildCapabilityUsageCosts([chunk, { ...chunk }, { ...chunk }], resolverByCurrency("BRL").resolve);
  assert.equal(repeated.length, 3, "eventos repetidos não se deduplicam entre si");
});

test("attach cruza registros por fila: eventos repetidos recebem seus próprios custos", async () => {
  const events: AttachableEvent[] = [
    { task: "CONTENT_BRIEF_GENERATION", provider: "p", model: "m", attempt: 1, retry: 0, usage: usage({ inputTokens: 100 }) },
    { task: "CONTENT_BRIEF_GENERATION", provider: "p", model: "m", attempt: 1, retry: 0, usage: usage({ inputTokens: 300 }) },
  ];
  const records = await attachCapabilityCosts(events, resolverByCurrency("BRL").resolve);
  assert.equal(records.length, 2);
  assert.equal(events[0]?.cost?.amountMinor, "100");
  assert.equal(events[1]?.cost?.amountMinor, "300", "segundo evento recebe o próprio registro");
});

test("attach define event.cost da última tentativa mesmo após consumir a fila dos attempts", async () => {
  const event: AttachableEvent = { task: "CONTENT_BRIEF_GENERATION", provider: "p", model: "m", attempt: 1, retry: 1, attempts: [{ usage: usage({ inputTokens: 800 }), retry: 0 }, { usage: usage({ inputTokens: 1000, outputTokens: 500 }), retry: 1 }] };
  const records = await attachCapabilityCosts([event], resolverByCurrency("BRL").resolve);
  assert.equal(records.length, 2);
  assert.equal(event.attempts?.[0]?.cost?.amountMinor, "800");
  assert.equal(event.attempts?.[1]?.cost?.amountMinor, "2000");
  assert.equal(event.cost?.amountMinor, "2000", "evento recebe o custo da tentativa final");
  assert.equal(event.cost?.completeness, "COMPLETE");
  assert.deepEqual(event.pricing, { versionId: "price-1", currency: "BRL" });
});

test("contentId só aparece quando atribuído", async () => {
  const records = await buildCapabilityUsageCosts(
    [
      { task: "CONTENT_SCENE_IDEAS", contentId: "j-content-1", attempt: 1, retry: 0, usage: usage({ inputTokens: 100 }) },
      { task: "CONTENT_BRIEF_GENERATION", attempt: 1, retry: 0, usage: usage({ inputTokens: 100 }) },
    ],
    resolverByCurrency("BRL").resolve,
  );
  assert.equal(records[0]?.contentId, "j-content-1");
  assert.equal(records[1]?.contentId, undefined);
});

test("job: entradas COMPLETE mesma moeda somam COMPLETE; PARTIAL sozinha mantém PARTIAL com valor", () => {
  const metadata = { capabilities: [
    { task: "PRODUCT_UNDERSTANDING", pricing: { currency: "BRL" }, cost: { amountMinor: "100", completeness: "COMPLETE" } },
    { task: "CONTENT_BRIEF_GENERATION", contentId: "c1", pricing: { currency: "BRL" }, cost: { amountMinor: "200", completeness: "COMPLETE" } },
  ] };
  const result = aggregateRunCosts(metadata);
  assert.deepEqual(result.job, { currency: "BRL", amountMinor: "300", completeness: "COMPLETE" });
  assert.deepEqual(result.contents, [{ contentId: "c1", total: { currency: "BRL", amountMinor: "200", completeness: "COMPLETE" } }]);
  assert.equal(result.capabilities.length, 2);
});

test("job: PARTIAL com valor conhecido é PARTIAL mesmo sozinho", () => {
  const result = aggregateRunCosts({ capabilities: [{ task: "STRATEGY_SYNTHESIS", pricing: { currency: "BRL" }, cost: { amountMinor: "50", completeness: "PARTIAL" } }] });
  assert.deepEqual(result.job, { currency: "BRL", amountMinor: "50", completeness: "PARTIAL" });
});

test("job: entrada com valor + entrada sem valor é PARTIAL; só sem valor é UNAVAILABLE", () => {
  const mixed = aggregateRunCosts({ capabilities: [
    { task: "PRODUCT_UNDERSTANDING", pricing: { currency: "BRL" }, cost: { amountMinor: "100", completeness: "COMPLETE" } },
    { task: "CONTENT_PLAN_GENERATION", cost: { amountMinor: null, completeness: "UNAVAILABLE" } },
  ] });
  assert.equal(mixed.job.completeness, "PARTIAL");
  assert.equal(mixed.job.amountMinor, "100");
  const empty = aggregateRunCosts({ capabilities: [{ task: "CONTENT_PLAN_GENERATION", cost: { amountMinor: null, completeness: "UNAVAILABLE" } }] });
  assert.deepEqual(empty.job, { currency: null, amountMinor: null, completeness: "UNAVAILABLE" });
});

test("job: moedas mistas não somam — UNAVAILABLE", () => {
  const result = aggregateRunCosts({ capabilities: [
    { task: "PRODUCT_UNDERSTANDING", pricing: { currency: "BRL" }, cost: { amountMinor: "100", completeness: "COMPLETE" } },
    { task: "CONTENT_BRIEF_GENERATION", contentId: "c1", pricing: { currency: "USD" }, cost: { amountMinor: "100", completeness: "COMPLETE" } },
  ] });
  assert.deepEqual(result.job, { currency: null, amountMinor: null, completeness: "UNAVAILABLE" });
});

test("metadata legado sem capabilities ou sem campos novos projeta UNAVAILABLE sem lançar", () => {
  assert.equal(aggregateRunCosts(null).job.completeness, "UNAVAILABLE");
  assert.equal(aggregateRunCosts({}).job.completeness, "UNAVAILABLE");
  const legacy = aggregateRunCosts({ capabilities: [{ task: "PRODUCT_UNDERSTANDING", durationMs: 10 }] });
  assert.deepEqual(legacy.job, { currency: null, amountMinor: null, completeness: "UNAVAILABLE" });
  assert.equal((legacy.capabilities[0]?.total.completeness), "UNAVAILABLE");
});

test("completeness do registro é preservado como está (tipos válidos apenas)", () => {
  const result = aggregateRunCosts({ capabilities: [{ task: "PRODUCT_UNDERSTANDING", cost: { completeness: "INVÁLIDO" } }] });
  assert.equal(result.capabilities[0]?.total.completeness, "UNAVAILABLE");
});
