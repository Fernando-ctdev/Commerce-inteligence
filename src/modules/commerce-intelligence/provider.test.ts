import test from "node:test";
import assert from "node:assert/strict";
import { createHttpProvider, PRODUCT_UNDERSTANDING_INSTRUCTION, UNDERSTANDING_CARDINALITY } from "./provider";
import { CARDINALITY_POLICY } from "./contract";
import { GenerationError } from "./errors";

function mockProviderFetch(models: string[]) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => { models.push(JSON.parse(init.body).model); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } }); }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}
test("preserves typed schema errors from provider output (no GEN-PROVIDER wrap)", async () => {
  const restore = mockProviderFetch([]);
  globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tenantId: "forbidden", status: "X" }) } }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    assert.ok(error instanceof GenerationError, "expected GenerationError");
    assert.equal(error.code, "GEN-SCHEMA");
  } finally { restore(); }
});

test("routes by tier: MID→BALANCED, HIGH→QUALITY, LOW→FAST with existing variables only", async () => {
  const models: string[] = [];
  const restore = mockProviderFetch(models);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast-model", MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    await provider.complete("CONTENT_BRIEF_GENERATION", { trustedContext: {} });
    await provider.complete("STRATEGY_SYNTHESIS", { trustedContext: {} });
    await provider.complete("CONTENT_PLAN_GENERATION", { trustedContext: {} });
  } finally { restore(); }
  assert.deepEqual(models, ["balanced-model", "balanced-model", "quality-model", "quality-model"]);
});

test("falls back only between existing configured variables (BALANCED→FAST→none)", async () => {
  const models: string[] = [];
  const restore = mockProviderFetch(models);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast-model", MID: "fast-model" }, timeoutMs: 5000 });
  try {
    await provider.complete("CONTENT_BRIEF_GENERATION", { trustedContext: {} });
    assert.equal(models[0], "fast-model");
    try {
      await provider.complete("STRATEGY_SYNTHESIS", { trustedContext: {} });
      assert.fail("should have thrown");
    } catch (error) {
      assert.ok(error instanceof GenerationError);
      assert.equal((error as GenerationError).code, "GEN-PROVIDER");
      assert.deepEqual((error as GenerationError).detail, { task: "STRATEGY_SYNTHESIS" });
    }
  } finally { restore(); }
});

test("never reads LLM_MODEL_BRIEF: env cannot influence routing through configFromEnv", async () => {
  const saved: Record<string, string | undefined> = { LLM_MODEL_BRIEF: process.env.LLM_MODEL_BRIEF, LLM_MODEL_BALANCED: process.env.LLM_MODEL_BALANCED, LLM_MODEL_FAST: process.env.LLM_MODEL_FAST, LLM_MODEL_QUALITY: process.env.LLM_MODEL_QUALITY, LLM_BASE_URL: process.env.LLM_BASE_URL, LLM_API_KEY: process.env.LLM_API_KEY, GENERATION_PROVIDER_URL: process.env.GENERATION_PROVIDER_URL, GENERATION_PROVIDER_API_KEY: process.env.GENERATION_PROVIDER_API_KEY };
  process.env.LLM_MODEL_BRIEF = "forbidden-brief-model";
  process.env.LLM_MODEL_BALANCED = "balanced-model";
  delete process.env.LLM_MODEL_FAST;
  process.env.LLM_MODEL_QUALITY = "quality-model";
  process.env.LLM_BASE_URL = "http://localhost:1/v1";
  process.env.LLM_API_KEY = "k";
  delete process.env.GENERATION_PROVIDER_URL;
  delete process.env.GENERATION_PROVIDER_API_KEY;
  const models: string[] = [];
  const restoreFetch = mockProviderFetch(models);
  const restore = () => { restoreFetch(); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
  try {
    const provider = createHttpProvider();
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    await provider.complete("CONTENT_BRIEF_GENERATION", { trustedContext: {} });
    assert.deepEqual(models, ["balanced-model", "balanced-model"]);
  } finally { restore(); }
});
test("sends fixed reasoning effort by logical capability", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } }); }) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} });
    await provider.complete("STRATEGY_SYNTHESIS", { trustedContext: {} });
    await provider.complete("CONTENT_PLAN_GENERATION", { trustedContext: {} });
    await provider.complete("CONTENT_BRIEF_GENERATION", { trustedContext: {} });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(bodies.length, 5);
  assert.deepEqual(bodies.map((body) => body.reasoning), [
    { effort: "low" },
    { effort: "medium" },
    { effort: "high" },
    { effort: "high" },
    { effort: "medium" },
  ]);
});
test("brief provider gets separate selected hook and CTA patterns in a compact context", async () => {
  const originalFetch = globalThis.fetch;
  let request: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    request = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  try {
    await provider.complete("CONTENT_BRIEF_GENERATION", { trustedContext: { selectedPatterns: [{ opportunityId: "o1", hook: { id: "problem", guidance: "Comece pelo problema observável." }, cta: { id: "details", guidance: "Convide a conferir detalhes." } }] } });
  } finally { globalThis.fetch = originalFetch; }
  assert.ok(request);
  const messages = request.messages as Array<{ content: string }>;
  assert.ok(messages[0].content.includes("selectedPatterns.hook somente para formular hook"));
  const context = JSON.parse(messages[1].content).trustedContext;
  assert.equal(context.selectedPatterns[0].hook.id, "problem");
  assert.equal(context.selectedPatterns[0].cta.id, "details");
  assert.equal("scenes" in context, false);
  assert.equal("captions" in context, false);
});

test("non-2xx captures allowlisted rate headers in detail without body leakage", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("TOKEN_SEGREDO_corpo_nao_lido", { status: 429, headers: { "content-type": "application/json", "retry-after": "7", "x-ratelimit-reset": "30", "x-ratelimit-remaining": "0", "x-ratelimit-limit": "5", "authorization": "should-not-be-captured" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    assert.ok(error instanceof GenerationError);
    assert.equal(error.code, "GEN-PROVIDER");
    const detail = error.detail as { providerStatus: number; errorKind: string; rate: Record<string, string>; task: string };
    assert.equal(detail.providerStatus, 429);
    assert.equal(detail.errorKind, "http_status");
    assert.equal(detail.task, "PRODUCT_UNDERSTANDING");
    assert.deepEqual(detail.rate, { "retry-after": "7", "x-ratelimit-reset": "30", "x-ratelimit-remaining": "0", "x-ratelimit-limit": "5" });
    assert.ok(!JSON.stringify(error).includes("TOKEN_SEGREDO"), "corpo nunca entra no erro/detail");
    assert.ok(!("authorization" in detail.rate), "apenas headers allowlisted");
  } finally { globalThis.fetch = originalFetch; }
});
test("non-2xx without rate headers omits rate but keeps errorKind and providerStatus", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 503 })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
  try {
    await provider.complete("STRATEGY_SYNTHESIS", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    const detail = (error as GenerationError).detail as { providerStatus: number; errorKind: string; rate?: unknown };
    assert.equal(detail.providerStatus, 503);
    assert.equal(detail.errorKind, "http_status");
    assert.equal(detail.rate, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test("ADR-017: 429 carrega telemetria sanitizada (modelo/endpoint/request-id/status) sem expor a API key", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("rate limited", { status: 429, headers: { "x-request-id": "req_abc123", "x-ratelimit-remaining": "0" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "sk-secret-key-valor", models: { MID: "modelo-efetivo" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    const detail = (error as GenerationError).detail as { providerStatus: number; model: string; endpoint: string; providerRequestId?: string; providerRequestIdSource?: string; rate?: Record<string, string>; errorKind: string };
    assert.equal(detail.providerStatus, 429);
    assert.equal(detail.errorKind, "http_status");
    assert.equal(detail.model, "modelo-efetivo", "modelo efetivo registrado na falha");
    assert.equal(detail.endpoint, "https://api.exemplo", "origem do endpoint registrada, sem caminho/query");
    assert.equal(detail.providerRequestId, "req_abc123", "request-id para correlação com portal");
    assert.equal(detail.providerRequestIdSource, "header");
    assert.equal(detail.rate?.["x-ratelimit-remaining"], "0");
    const serialized = JSON.stringify({ detail, message: (error as Error).message });
    assert.equal(serialized.includes("sk-secret-key-valor"), false, "API key nunca vaza em erro/telemetria");
  } finally { globalThis.fetch = originalFetch; }
});

test("ADR-017: 429 com header x-request-id — header precede body.id e nada do corpo vaza", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "gen-body-111", error: { message: "Mensagem-interna-de-rate-limit-NAO-PERSISTIR" } }), { status: 429, headers: { "x-request-id": "req_header_001" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "sk-secret-key-valor", models: { MID: "modelo-efetivo" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    const detail = (error as GenerationError).detail as { providerRequestId?: string; providerRequestIdSource?: string };
    assert.equal(detail.providerRequestId, "req_header_001");
    assert.equal(detail.providerRequestIdSource, "header");
    const serialized = JSON.stringify(error);
    assert.equal(serialized.includes("gen-body-111"), false, "body.id ignorado quando header presente");
    assert.equal(serialized.includes("NAO-PERSISTIR"), false, "mensagem do corpo nunca persistida");
    assert.equal(serialized.includes("sk-secret-key-valor"), false, "API key nunca vaza");
  } finally { globalThis.fetch = originalFetch; }
});

test("ADR-017: 429 sem header cai para body.id (chave raiz JSON, validado)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "gen-1788464706-UnG9QGb0YH53nkPWhJXC", error: { message: "rate-limited" } }), { status: 429 })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    const detail = (error as GenerationError).detail as { providerRequestId?: string; providerRequestIdSource?: string };
    assert.equal(detail.providerRequestId, "gen-1788464706-UnG9QGb0YH53nkPWhJXC");
    assert.equal(detail.providerRequestIdSource, "body.id");
  } finally { globalThis.fetch = originalFetch; }
});

test("ADR-017: valores inválidos são omitidos (header inválido não cai para body; body não-JSON ok)", async () => {
  const originalFetch = globalThis.fetch;
  // Header presente porém inválido (>200 inviabiliza? aqui caracteres proibidos) — omitido, sem fallback.
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "gen-valido" }), { status: 429, headers: { "x-request-id": "id com espaço!!!" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    const detail = (error as GenerationError).detail as { providerRequestId?: string; providerRequestIdSource?: string };
    assert.equal(detail.providerRequestId, undefined);
    assert.equal(detail.providerRequestIdSource, undefined);
  } finally { globalThis.fetch = originalFetch; }

  // Corpo não-JSON em erro: omitido sem lançar exceção de parse.
  globalThis.fetch = (async () => new Response("gateway timeout html<>", { status: 503 })) as typeof fetch;
  const provider2 = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  try {
    await provider2.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
    assert.fail("should have thrown");
  } catch (error) {
    const detail = (error as GenerationError).detail as { providerRequestId?: string; providerRequestIdSource?: string };
    assert.equal(detail.providerRequestId, undefined);
    assert.equal(detail.providerRequestIdSource, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test("ADR-017: sucesso 200 expõe providerRequestId via onMetrics (body.id quando sem header)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "gen-ok-987", choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  let captured: { providerRequestId?: string; providerRequestIdSource?: string } | undefined;
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (metrics) => { captured = metrics; });
    assert.equal(captured?.providerRequestId, "gen-ok-987");
    assert.equal(captured?.providerRequestIdSource, "body.id");
  } finally { globalThis.fetch = originalFetch; }
});

test("ADR-017: id raiz não-string ou ausente é omitido", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: 42, choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m" }, timeoutMs: 5000 });
  let captured: { providerRequestId?: string; providerRequestIdSource?: string } | undefined;
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (metrics) => { captured = metrics; });
    assert.equal(captured?.providerRequestId, undefined);
    assert.equal(captured?.providerRequestIdSource, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

// Fallback em cadeia LOW→MID→HIGH: uma vez por tier, apenas disponibilidade, com registro
// de retry/custo nas métricas (que alimentam o CapabilityEvent; job.attempt não muda).
type FallbackMetrics = { model: string; retry?: number; fallback?: { from: string; reason: string; providerStatus: number | null; requestBytes: number; durationMs: number } };
function mockSequenceFetch(models: string[], responses: Array<() => Response | Promise<never>>) {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    models.push(JSON.parse(init.body).model);
    const respond = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return respond();
  }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}
const okResponse = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200 });

test("fallback MID→HIGH: 503 na tentativa MID re-solicita uma vez em HIGH e registra retry/custo", async () => {
  const models: string[] = [];
  const restore = mockSequenceFetch(models, [() => new Response("boom", { status: 503 }), okResponse]);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  let captured: FallbackMetrics | undefined;
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (m) => { captured = m; });
  } finally { restore(); }
  assert.deepEqual(models, ["balanced-model", "quality-model"]);
  assert.equal(captured?.retry, 1);
  assert.equal(captured?.model, "quality-model");
  assert.equal(captured?.fallback?.from, "balanced-model");
  assert.equal(captured?.fallback?.reason, "http_status");
  assert.equal(captured?.fallback?.providerStatus, 503);
  assert.ok((captured?.fallback?.requestBytes ?? 0) > 0, "custo da tentativa sacrifada registrado");
  assert.ok((captured?.fallback?.durationMs ?? -1) >= 0);
});

test("fallback cobre somente status de disponibilidade (408/429/502/503/504); 4xx config nunca cai", async () => {
  for (const status of [408, 429, 502, 503, 504]) {
    const models: string[] = [];
    const restore = mockSequenceFetch(models, [() => new Response("err", { status }), okResponse]);
    const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
    try {
      await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
      assert.deepEqual(models, ["balanced-model", "quality-model"], `${status} deve cair em fallback`);
    } finally { restore(); }
  }
  const models: string[] = [];
  const restore = mockSequenceFetch(models, [() => new Response("bad request", { status: 400 }), okResponse]);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  try {
    await assert.rejects(provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }), (error: GenerationError) => error.code === "GEN-PROVIDER");
    assert.deepEqual(models, ["balanced-model"], "400 (config) não re-solicita");
  } finally { restore(); }
});

test("fallback de conexão: fetch falha uma vez e HIGH responde; retry=1 com reason connection", async () => {
  const models: string[] = [];
  const restore = mockSequenceFetch(models, [() => { throw new TypeError("fetch failed"); }, okResponse]);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  let captured: FallbackMetrics | undefined;
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (m) => { captured = m; });
  } finally { restore(); }
  assert.deepEqual(models, ["balanced-model", "quality-model"]);
  assert.equal(captured?.retry, 1);
  assert.equal(captured?.fallback?.reason, "connection");
});

test("fallback por timeout próprio do provider: reason timeout", async () => {
  const models: string[] = [];
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    models.push(JSON.parse((init as { body: string }).body).model);
    if (call === 0) {
      call += 1;
      await new Promise((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("hang")), 5000);
        init.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); }, { once: true });
      });
    }
    call += 1;
    return okResponse();
  }) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 30 });
  let captured: FallbackMetrics | undefined;
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (m) => { captured = m; });
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(models, ["balanced-model", "quality-model"]);
  assert.equal(captured?.retry, 1);
  assert.equal(captured?.fallback?.reason, "timeout");
});

test("abort externo (fencing) nunca cai em fallback", async () => {
  const models: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    models.push(JSON.parse((init as { body: string }).body).model);
    await new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    return okResponse();
  }) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  try {
    await assert.rejects(provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, controller.signal), (error: GenerationError) => error.code === "GEN-PROVIDER");
    assert.deepEqual(models, ["balanced-model"], "abort externo não re-solicita");
  } finally { globalThis.fetch = originalFetch; }
});

test("GEN-SCHEMA e tarefa HIGH nunca caem em fallback; modelo repetido não re-solicita", async () => {
  // GEN-SCHEMA: conteúdo sem contrato JSON não re-solicita.
  const schemaModels: string[] = [];
  const restoreSchema = mockSequenceFetch(schemaModels, [() => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }), okResponse]);
  const schemaProvider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  try {
    await assert.rejects(schemaProvider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }), (error: GenerationError) => error.code === "GEN-SCHEMA");
    assert.deepEqual(schemaModels, ["balanced-model"], "schema nunca cai em fallback");
  } finally { restoreSchema(); }
  // Tarefa HIGH: 503 falha fechado, sem re-solicitação.
  const highModels: string[] = [];
  const restoreHigh = mockSequenceFetch(highModels, [() => new Response("boom", { status: 503 }), okResponse]);
  const highProvider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  try {
    await assert.rejects(highProvider.complete("STRATEGY_SYNTHESIS", { trustedContext: {} }), (error: GenerationError) => error.code === "GEN-PROVIDER");
    assert.deepEqual(highModels, ["quality-model"], "HIGH é topo da cadeia");
  } finally { restoreHigh(); }
  // MID e HIGH configurados com o mesmo modelo efetivo: sem re-solicitação inútil.
  const sameModels: string[] = [];
  const restoreSame = mockSequenceFetch(sameModels, [() => new Response("boom", { status: 503 }), okResponse]);
  const sameProvider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
  try {
    await assert.rejects(sameProvider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }), (error: GenerationError) => error.code === "GEN-PROVIDER");
    assert.deepEqual(sameModels, ["m"], "modelo efetivo igual não re-solicita");
  } finally { restoreSame(); }
});

test("PRODUCT_UNDERSTANDING instruction declares exactly the active CARDINALITY_POLICY maxima", () => {
  // Guarda anti-drift: os limites do prompt derivam da política (fonte única de verdade).
  // Se a política mudar e o prompt voltar a texto manual divergente, este teste falha.
  for (const field of Object.keys(UNDERSTANDING_CARDINALITY))
    assert.ok(field in CARDINALITY_POLICY, `${field} deve existir na CARDINALITY_POLICY`);
  for (const [field, rule] of Object.entries(CARDINALITY_POLICY)) {
    if (!(field in UNDERSTANDING_CARDINALITY)) continue;
    assert.equal(UNDERSTANDING_CARDINALITY[field], rule.max, `limite derivado de ${field}`);
    assert.ok(
      PRODUCT_UNDERSTANDING_INSTRUCTION.includes(`${field}: ≤ ${rule.max}`),
      `instrução não declara o limite vigente de ${field}`,
    );
  }
  assert.equal(PRODUCT_UNDERSTANDING_INSTRUCTION.includes("productId"), true);
});

test("PRODUCT_UNDERSTANDING instruction never contradicts the limit with a no-trimming directive", () => {
  // Causa do GEN-SCHEMA observado: "sem truncar" conflitava com o máximo e o modelo em
  // reasoning low resolvia o conflito excedendo purchaseBarriers/emotionalBenefits.
  assert.equal(PRODUCT_UNDERSTANDING_INSTRUCTION.includes("sem truncar"), false);
  assert.ok(PRODUCT_UNDERSTANDING_INSTRUCTION.includes("até o limite"));
});
