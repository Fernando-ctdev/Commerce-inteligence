import test from "node:test";
import assert from "node:assert/strict";
import { CONTENT_BRIEF_GENERATION_INSTRUCTION, CONTENT_BRIEF_REPAIR_INSTRUCTION, CONTENT_PART_REPAIR_INSTRUCTION, CONTENT_QUALITY_JUDGE_INSTRUCTION, JUDGE_EDITORIAL_GUIDANCE, PART_REPAIR_EDITORIAL_GUIDANCE, createHttpProvider, dollarsLexemeToMinor, extractReportedCostLexeme, normalizeProviderUsage, PRODUCT_UNDERSTANDING_INSTRUCTION, UNDERSTANDING_CARDINALITY, UNDERSTANDING_FIELDS } from "./provider";
import { CARDINALITY_POLICY } from "./contract";
import { GenerationError } from "./errors";
import { ROUTER_MAP } from "./model-router";

function mockProviderFetch(models: string[]) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => { models.push(JSON.parse(init.body).model); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } }); }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}

// Type guard local (sem inline cast) para leitura do body capturado.
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
test("preserves typed schema errors from provider output (no GEN-PROVIDER wrap)", async () => {
  const restore = mockProviderFetch([]);
  globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tenantId: "forbidden", status: "X" }) } }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
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
    await provider.complete("CONTENT_SCENE_IDEAS", { trustedContext: {} });
    await provider.complete("CONTENT_QUALITY_JUDGE", { trustedContext: {} });
  } finally { restore(); }
  assert.deepEqual(models, ["quality-model", "quality-model", "quality-model", "quality-model", "quality-model", "quality-model"], "capabilities críticas usam QUALITY");
});

test("falls back only between existing configured variables (BALANCED→FAST→none)", async () => {
  const models: string[] = [];
  const restore = mockProviderFetch(models);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast-model", MID: "fast-model" }, timeoutMs: 5000 });
  try {
    await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} });
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
    assert.deepEqual(models, ["quality-model", "quality-model"], "BRIEF roteado a HIGH");
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
    await provider.complete("CONTENT_SCENE_IDEAS", { trustedContext: {} });
    await provider.complete("CONTENT_QUALITY_JUDGE", { trustedContext: {} });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(bodies.length, 7);
  assert.deepEqual(bodies.map((body) => body.reasoning), [
    { effort: "low" },
    { effort: "medium" },
    { effort: "high" },
    { effort: "high" },
    { effort: "medium" },
    { effort: "high" },
    { effort: "high" },
  ]);
});
test("brief provider gets separate selected hook and CTA patterns in a compact context", async () => {
  const originalFetch = globalThis.fetch;
  let request: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    request = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { HIGH: "m" }, timeoutMs: 5000 });
  try {
    await provider.complete("CONTENT_BRIEF_GENERATION", { trustedContext: { productReference: { name: "Calça" }, selectedPatterns: [{ opportunityId: "o1", hook: { id: "problem", text: "Eu não acredito que isso custa tão pouco" }, cta: { id: "details", text: "Confira os detalhes disponíveis" } }] } });
  } finally { globalThis.fetch = originalFetch; }
  assert.ok(request);
  const messages = request.messages as Array<{ content: string }>;
  assert.ok(messages[1].content.includes("Eu não acredito que isso custa tão pouco"));
  assert.ok(messages[1].content.includes("Confira os detalhes disponíveis"));
  assert.ok(messages[1].content.includes('"productReference":{"name":"Calça"}'));
});

test("brief provider instruction makes development strategic, evidence-grounded, and keeps CTA separate", () => {
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("selectedPatterns[index].hook.text como hook"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("variação curta de até 12 palavras"));
  assert.ok(!CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("productReference.category"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Use categoria no hook somente se explícita em relevantFacts"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Development contém 2 a 6 bullets"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("cada bullet precisa combinar ação de comunicação, razão significativa ligada ao fato e o fato específico de relevantFacts"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("'para contextualizar', 'para explicar esse detalhe' e outras frases sem ligação concreta não contam"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Não faça lista de features nem instrução de câmera/gravação"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Use relevantFacts como única fonte de fatos técnicos em development e script"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("angle e mecanismo da oportunidade orientam o recorte, mas não são fonte de fatos"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("todo fato técnico no script deve estar em relevantFacts e representado em development"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("não retorne scenes nem qualquer campo de cena"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Use selectedPatterns[index].cta.text literalmente como cta"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Mantenha cta separado de hook, development e script"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Bom:"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("Ruim:"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("causes[index]"));
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("repairContrast[index]"));
});

test("non-2xx captures allowlisted rate headers in detail without body leakage", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("TOKEN_SEGREDO_corpo_nao_lido", { status: 429, headers: { "content-type": "application/json", "retry-after": "7", "x-ratelimit-reset": "30", "x-ratelimit-remaining": "0", "x-ratelimit-limit": "5", "authorization": "should-not-be-captured" } })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
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
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "sk-secret-key-valor", models: { MID: "modelo-efetivo", HIGH: "modelo-efetivo" }, timeoutMs: 5000 });
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
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "sk-secret-key-valor", models: { MID: "modelo-efetivo", HIGH: "modelo-efetivo" }, timeoutMs: 5000 });
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
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
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
  const provider = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
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
  const provider2 = createHttpProvider({ baseUrl: "https://api.exemplo/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
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
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
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
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
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
    await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }, undefined, (m) => { captured = m; });
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
      await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} });
      assert.deepEqual(models, ["balanced-model", "quality-model"], `${status} deve cair em fallback`);
    } finally { restore(); }
  }
  const models: string[] = [];
  const restore = mockSequenceFetch(models, [() => new Response("bad request", { status: 400 }), okResponse]);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  try {
    await assert.rejects(provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }), (error: GenerationError) => error.code === "GEN-PROVIDER");
    assert.deepEqual(models, ["balanced-model"], "400 (config) não re-solicita");
  } finally { restore(); }
});

test("fallback de conexão: fetch falha uma vez e HIGH responde; retry=1 com reason connection", async () => {
  const models: string[] = [];
  const restore = mockSequenceFetch(models, [() => { throw new TypeError("fetch failed"); }, okResponse]);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  let captured: FallbackMetrics | undefined;
  try {
    await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }, undefined, (m) => { captured = m; });
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
    await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }, undefined, (m) => { captured = m; });
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
    await assert.rejects(provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }, controller.signal), (error: GenerationError) => error.code === "GEN-PROVIDER");
    assert.deepEqual(models, ["balanced-model"], "abort externo não re-solicita");
  } finally { globalThis.fetch = originalFetch; }
});

test("sinal já abortado não inicia chamada nem fallback", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return okResponse();
  }) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  const controller = new AbortController();
  controller.abort();
  try {
    await assert.rejects(provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }, controller.signal), (error: GenerationError) => error.code === "GEN-PROVIDER");
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("GEN-SCHEMA e tarefa HIGH nunca caem em fallback; modelo repetido não re-solicita", async () => {
  // GEN-SCHEMA: conteúdo sem contrato JSON não re-solicita.
  const schemaModels: string[] = [];
  const restoreSchema = mockSequenceFetch(schemaModels, [() => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }), okResponse]);
  const schemaProvider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "balanced-model", HIGH: "quality-model" }, timeoutMs: 5000 });
  try {
    await assert.rejects(schemaProvider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }), (error: GenerationError) => error.code === "GEN-SCHEMA");
    assert.deepEqual(schemaModels, ["quality-model"], "schema nunca cai em fallback");
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
    await assert.rejects(sameProvider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }), (error: GenerationError) => error.code === "GEN-PROVIDER");
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
  // Fail-closed por item: sem ancora em fato autorizado o campo aceita [], nunca hipótese
  // (causa do excedente de purchaseBarriers: objeções genéricas inferidas pelo modelo).
  assert.ok(PRODUCT_UNDERSTANDING_INSTRUCTION.includes("nunca inclua hipóteses"));
  assert.ok(PRODUCT_UNDERSTANDING_INSTRUCTION.includes("[] em vez de inventar"));
});
// ADR-020 adendo 4: PU usa response_format json_schema (maxItems derivados de
// UNDERSTANDING_CARDINALITY); demais tasks permanecem json_object.
function captureProviderBodies(bodies: Array<Record<string, unknown>>, responder?: (body: Record<string, unknown>) => Response) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    bodies.push(body);
    return responder
      ? responder(body)
      : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return () => { globalThis.fetch = originalFetch; };
}

test("PU request carries json_schema with maxItems per UNDERSTANDING_CARDINALITY", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const restore = captureProviderBodies(bodies);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast", MID: "balanced", HIGH: "quality" }, timeoutMs: 5000 });
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} });
  } finally { restore(); }
  const format = recordOf(bodies[0].response_format);
  assert.equal(format?.type, "json_schema");
  const envelope = recordOf(format?.json_schema);
  assert.equal(envelope?.strict, true, "QA7: strict é o único modo que garante maxItems");
  const schema = recordOf(envelope?.schema);
  assert.equal(schema?.additionalProperties, false);
  const properties = recordOf(schema?.properties);
  assert.ok(properties);
  // QA7: category omitida do schema (opcional no validador; additionalProperties:false
  // impede emissão) — propriedades são EXATAMENTE productId + UNDERSTANDING_FIELDS.
  assert.deepEqual(Object.keys(properties).sort(), ["productId", ...UNDERSTANDING_FIELDS].sort());
  const required = Array.isArray(schema?.required) ? schema.required.map(String) : [];
  assert.deepEqual(required.sort(), ["productId", ...UNDERSTANDING_FIELDS].sort());
  for (const [field, max] of Object.entries(UNDERSTANDING_CARDINALITY)) {
    assert.equal(recordOf(properties[field])?.maxItems, max, field);
  }
});

test("provider adapter caps only PU cardinality arrays before returning output", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const payload = {
    productId: "p",
    purchaseBarriers: Array.from({ length: CARDINALITY_POLICY.purchaseBarriers.max + 1 }, (_, i) => `barrier-${i}`),
    extraArray: Array.from({ length: CARDINALITY_POLICY.purchaseBarriers.max + 1 }, (_, i) => `extra-${i}`),
  };
  const restore = captureProviderBodies(bodies, () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200, headers: { "content-type": "application/json" } }));
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast", MID: "balanced", HIGH: "quality" }, timeoutMs: 5000 });
  try {
    const understanding = recordOf(await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }));
    assert.deepEqual(understanding?.purchaseBarriers, payload.purchaseBarriers.slice(0, CARDINALITY_POLICY.purchaseBarriers.max));
    assert.equal((understanding?.extraArray as string[]).length, payload.extraArray.length, "campos fora da policy não são reduzidos");
    const brief = recordOf(await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} }));
    assert.equal((brief?.purchaseBarriers as string[]).length, payload.purchaseBarriers.length, "outras tasks mantêm a saída intacta");
  } finally { restore(); }
  assert.equal(bodies.length, 2);
});

// Job 149034bc (causa raiz): o plano era o único ponto crítico sem json_schema
// estrito; o retry único consumido por GEN-VARIETY deixou a violação de
// cardinalidade de noveltyTargets (GEN-SCHEMA) como falha terminal. O schema
// estrutura a saída no provider; o validador do contrato permanece inalterado.
test("CONTENT_PLAN_GENERATION request carries strict json_schema with noveltyTargets 1..4", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const restore = captureProviderBodies(bodies);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast", MID: "balanced", HIGH: "quality" }, timeoutMs: 5000 });
  try {
    await provider.complete("CONTENT_PLAN_GENERATION", { trustedContext: { targetContentCount: 5 } });
  } finally { restore(); }
  const format = recordOf(bodies[0].response_format);
  assert.equal(format?.type, "json_schema");
  const envelope = recordOf(format?.json_schema);
  assert.equal(envelope?.strict, true, "strict é o único modo que garante minItems/maxItems");
  assert.equal(envelope?.name, "content_plan");
  const schema = recordOf(envelope?.schema);
  assert.equal(schema?.additionalProperties, false);
  const properties = recordOf(schema?.properties);
  assert.ok(properties);
  assert.deepEqual(Object.keys(properties).sort(), ["opportunities"]);
  const opportunities = recordOf(properties?.opportunities);
  const opportunityItems = recordOf(opportunities?.items);
  const opportunitySchema = recordOf(opportunityItems);
  assert.equal(opportunitySchema?.additionalProperties, false);
  const opportunityProperties = recordOf(opportunitySchema?.properties);
  const noveltyTargets = recordOf(opportunityProperties?.noveltyTargets);
  assert.equal(noveltyTargets?.minItems, CARDINALITY_POLICY.noveltyTargets.min, "mínimo derivado da CARDINALITY_POLICY");
  assert.equal(noveltyTargets?.maxItems, CARDINALITY_POLICY.noveltyTargets.max, "máximo derivado da CARDINALITY_POLICY");
  const required = Array.isArray(opportunitySchema?.required) ? opportunitySchema.required.map(String) : [];
  assert.deepEqual(required.sort(), ["angle", "commercialObjective", "coreMessage", "hookMechanism", "noveltyTargets"].sort());
});

test("non-PU tasks keep generic json_object response_format", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const restore = captureProviderBodies(bodies);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast", MID: "balanced", HIGH: "quality" }, timeoutMs: 5000 });
  try {
    await provider.complete("COMMERCIAL_OPPORTUNITY_MAPPING", { trustedContext: {} });
  } finally { restore(); }
  assert.deepEqual(bodies[0].response_format, { type: "json_object" });
});

// Task 2 (simplify-semantic-judge): o Judge semântico emite somente PASS|REVIEW,
// sem status terminal, sem motivo factual e sem segunda passada de avaliação.
test("CONTENT_QUALITY_JUDGE instruction contracts PASS|REVIEW only, without REJECT or unsupported_persuasion", () => {
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("bullets {text, action, factRefs, rationale, cta}"), "contexto do judge carrega contrato v2");
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("status ∈ PASS|REVIEW"));
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("reason ∈ meets_criteria|unclear|style_mismatch|not_tiktok_native|weak_product_link|incoherent|weak_commercial_value|not_actionable|misaligned_scenes"));
  assert.ok(!CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("REJECT"), "sem opção de saída REJECT");
  assert.ok(!CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("REPAIR"), "sem opção de saída REPAIR");
  assert.ok(!CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("unsupported_persuasion"), "motivo factual removido do Judge");
  // Uma avaliação inicial única e independente por content/parte; nada que implique re-Judge.
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("UMA ÚNICA avaliação inicial"));
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("decisões de um item nunca influenciam os irmãos"));
  // A autoridade factual permanece no hard gate objetivo; estilo/configuração só quando declarada.
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("autoridade factual é do hard gate objetivo"));
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("nunca autorize, corrija ou reclassifique claims"));
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("estilo/configuração do creator apenas quando declarada"));
  // Cardinalidade/batch shape preservados (ADR-025).
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("até 3 Contents homogêneos"));
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("EXATAMENTE um audit para cada contentId recebido"));
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("exatamente um item por parte"));
});

// Task 2: repair é seletivo (somente a parte marcada), tentativa única com fallback
// no engine, e mantém o envelope de IDs exato e os shapes por parte.
test("CONTENT_PART_REPAIR instruction stays single-attempt, marked-part-only, with engine-owned fallback", () => {
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("Repare somente a parte indicada"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("preservando integralmente as demais partes"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("UMA ÚNICA tentativa de reparo"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("preservar o original é responsabilidade do engine"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("contexto declarado"));
  assert.ok(!CONTENT_PART_REPAIR_INSTRUCTION.includes("REJECT"));
  assert.ok(!CONTENT_PART_REPAIR_INSTRUCTION.includes("unsupported_persuasion"));
  // Exact-ID e batch shape por parte preservados (ADR-025).
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("MESMA parte e do MESMO round"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("EXATAMENTE um item para cada contentId recebido"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("string para hook/script/cta"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("array de 2 a 6 OBJETOS estruturados {text, action, rationale, factRefs, cta} para development"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("strings não são aceitas"));
  assert.ok(CONTENT_PART_REPAIR_INSTRUCTION.includes("array de 2 a 6 objetos {description} para scenes"));
});

// Task 2: tasks semânticas permanecem HIGH no ROUTER_MAP e com envelope json_object
// genérico — nenhuma task lógica nova, nenhum formato estrito adicional.
test("semantic tasks keep HIGH routing and generic json_object envelope", async () => {
  assert.equal(ROUTER_MAP.CONTENT_QUALITY_JUDGE, "HIGH");
  assert.equal(ROUTER_MAP.CONTENT_PART_REPAIR, "HIGH");
  const bodies: Array<Record<string, unknown>> = [];
  const restore = captureProviderBodies(bodies);
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast", MID: "balanced", HIGH: "quality" }, timeoutMs: 5000 });
  try {
    await provider.complete("CONTENT_QUALITY_JUDGE", { trustedContext: {} });
    await provider.complete("CONTENT_PART_REPAIR", { trustedContext: {} });
  } finally { restore(); }
  assert.deepEqual(bodies.map((body) => body.response_format), [{ type: "json_object" }, { type: "json_object" }]);
});

test("provider without schema support (HTTP 400) stays fail-closed: explicit error, no silent downgrade", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const statuses: number[] = [];
  const restore = captureProviderBodies(bodies, () => new Response(JSON.stringify({ error: { message: "response_format json_schema unsupported" } }), { status: 400, headers: { "content-type": "application/json" } }));
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { LOW: "fast", MID: "balanced", HIGH: "quality" }, timeoutMs: 5000 });
  try {
    await assert.rejects(() => provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }));
  } finally { restore(); }
  assert.equal(bodies.length, 1, "uma única chamada: sem downgrade silencioso para json_object");
  const format400 = recordOf(bodies[0].response_format);
  assert.equal(format400?.type, "json_schema", "sem downgrade silencioso de formato");
});

// ---- Contrato estruturado de development (design 2026-09-18) ----

test("instruções de brief exigem bullets estruturados text/factRefs/cta e proíbem locators", () => {
  for (const field of ["text", "factRefs", "cta"]) {
    assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes(field), `geração inicial exige campo estruturado ${field}`);
    assert.ok(CONTENT_BRIEF_REPAIR_INSTRUCTION.includes(field), `repair exige campo estruturado ${field}`);
  }
  assert.ok(!CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("\"action\""), "geração não exige campo action");
  assert.ok(!CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("\"rationale\""), "geração não exige campo rationale");
  assert.ok(CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("apenas como campos estruturados"), "factRef apenas como campos estruturados");
  assert.ok(CONTENT_BRIEF_REPAIR_INSTRUCTION.includes("apenas como campos estruturados"), "factRef apenas como campos estruturados no repair");
  assert.ok(!CONTENT_BRIEF_GENERATION_INSTRUCTION.includes("development como lista de textos"), "geração não aceita mais development em texto plano");
});

test("instrução do judge recebe development estruturado e proíbe avaliação factual/grounding/gate", () => {
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("development estruturado"), "judge recebe bullets estruturados");
  for (const proibido of ["factRef", "ancoragem", "conector", "cardinalidade", "gate"]) {
    assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes(proibido), `judge proíbe avaliar ${proibido}`);
  }
  assert.ok(CONTENT_QUALITY_JUDGE_INSTRUCTION.includes("não valida"), "judge não valida factualidade");
});

test("escopo editorial: judge/repair guidance cobre weak_commercial_value, coerência intra-brief e cena visual-only", () => {
  assert.ok(JUDGE_EDITORIAL_GUIDANCE.includes("weak_commercial_value"), "ângulo banal de categoria é REVIEW do judge");
  assert.ok(JUDGE_EDITORIAL_GUIDANCE.includes("incoherent"), "coerência intra-brief é REVIEW do judge");
  assert.ok(JUDGE_EDITORIAL_GUIDANCE.includes("misaligned_scenes"), "cena com fala é REVIEW do judge");
  assert.ok(JUDGE_EDITORIAL_GUIDANCE.includes("bolso de calça"), "exemplo de ângulo banal explícito");
  assert.ok(PART_REPAIR_EDITORIAL_GUIDANCE.includes("coerência intra-brief"));
  assert.ok(PART_REPAIR_EDITORIAL_GUIDANCE.includes("perguntas como formato de hook permanecem válidas"));
});

// ---- Usage real do provider (design 2026-09-18): allowlist; null quando desconhecido ----

test("normalizeProviderUsage lê envelope OpenAI-compatível completo (cached/reasoning em details)", () => {
  assert.deepEqual(
    normalizeProviderUsage({ usage: { prompt_tokens: 1200, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 250 }, completion_tokens_details: { reasoning_tokens: 100 } } }),
    { inputTokens: 1200, outputTokens: 400, reasoningTokens: 100, cachedTokens: 250 },
  );
});

test("normalizeProviderUsage aceita naming alternativo input_tokens/output_tokens e paths planos", () => {
  assert.deepEqual(
    normalizeProviderUsage({ usage: { input_tokens: 500, output_tokens: 200, cached_tokens: 50, reasoning_tokens: 30 } }),
    { inputTokens: 500, outputTokens: 200, reasoningTokens: 30, cachedTokens: 50 },
  );
});

test("normalizeProviderUsage sem usage/envelope malformado devolve nulos (nunca 0 inferido)", () => {
  assert.deepEqual(normalizeProviderUsage({}), { inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null });
  assert.deepEqual(normalizeProviderUsage({ usage: "1200 tokens" }), { inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null });
  assert.deepEqual(normalizeProviderUsage(null), { inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null });
});

test("normalizeProviderUsage: valor presente porém inválido (negativo/fracionário) vira null nessa dimensão", () => {
  assert.deepEqual(
    normalizeProviderUsage({ usage: { prompt_tokens: -5, completion_tokens: 1.5 } }),
    { inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null },
  );
  // details malformado cai para caminho plano; chave primária presente decide antes do alternate
  assert.deepEqual(
    normalizeProviderUsage({ usage: { prompt_tokens: 10, prompt_tokens_details: "x", cached_tokens: 7 } }),
    { inputTokens: 10, outputTokens: null, reasoningTokens: null, cachedTokens: 7 },
  );
});

test("normalizeProviderUsage preserva zero reportado como zero", () => {
  assert.deepEqual(
    normalizeProviderUsage({ usage: { prompt_tokens: 0, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } }),
    { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 },
  );
});

test("normalizeProviderUsage: nested sem a chave cai para o campo plano; chave nested inválida não cai", () => {
  // nested objeto presente SEM cached_tokens → fallback plano
  assert.deepEqual(
    normalizeProviderUsage({ usage: { prompt_tokens: 10, prompt_tokens_details: {}, cached_tokens: 7 } }),
    { inputTokens: 10, outputTokens: null, reasoningTokens: null, cachedTokens: 7 },
  );
  // chave nested PRESENTE porém inválida decide (null), sem fallback ao plano
  assert.deepEqual(
    normalizeProviderUsage({ usage: { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: "x" }, cached_tokens: 7 } }),
    { inputTokens: 10, outputTokens: null, reasoningTokens: null, cachedTokens: null },
  );
  // mesmo contrato para reasoning em completion_tokens_details
  assert.deepEqual(
    normalizeProviderUsage({ usage: { completion_tokens: 5, completion_tokens_details: {}, reasoning_tokens: 3 } }),
    { inputTokens: null, outputTokens: 5, reasoningTokens: 3, cachedTokens: null },
  );
});

test("onMetrics carrega provider + usage no sucesso e provider identity é sempre openai-compatible", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "gen-usage-1", usage: { prompt_tokens: 120, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 10 } }, choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200 })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
  let captured: Record<string, unknown> | undefined;
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (metrics) => { captured = metrics as unknown as Record<string, unknown>; });
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(captured?.provider, "openai-compatible");
  assert.deepEqual(captured?.usage, { inputTokens: 120, outputTokens: 40, reasoningTokens: 10, cachedTokens: 20 });
});

test("usage do envelope sobrevive a GEN-SCHEMA e chega no report de falha; sem usage, campo ausente", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ usage: { prompt_tokens: 90, completion_tokens: 10 }, choices: [{ message: { content: "not-json" } }] }), { status: 200 })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
  const captured: Array<Record<string, unknown>> = [];
  try {
    await assert.rejects(provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (metrics) => { captured.push(metrics as unknown as Record<string, unknown>); }), (error: GenerationError) => error.code === "GEN-SCHEMA");
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(captured.length, 1, "report único no finally");
  assert.deepEqual(captured[0]?.usage, { inputTokens: 90, outputTokens: 10, reasoningTokens: null, cachedTokens: null });
  assert.ok(!JSON.stringify(captured[0]).includes("not-json"), "usage não vira log de payload");
});

// ---- Custo relatado pelo provider (Blueprint 456f525): usage.cost exato, sem float ----

test("extractReportedCostLexeme casa a chave exata cost e, na ausência dela, cost_details.upstream_inference_cost (Blueprint)", () => {
  assert.equal(extractReportedCostLexeme('{"usage":{"cost":0.009,"cost_details":{"upstream_inference_cost":19}}}'), "0.009");
  assert.equal(extractReportedCostLexeme('{"usage":{"prompt_tokens":5}}'), null);
  // Blueprint: cost_details.upstream_inference_cost é fallback quando cost direto ausente.
  assert.equal(extractReportedCostLexeme('{"usage":{"cost_details":{"upstream_inference_cost":19}}}'), "19");
  // Ausência total de custo → null (nunca USD 0 inventado).
  assert.equal(extractReportedCostLexeme('{"usage":{"cost_details":{"prompt_tokens":5}}}'), null);
  assert.equal(extractReportedCostLexeme('{"usage":{"input_tokens":10,"tokens":0}}'), null);
  // notação científica é rejeitada por inteiro — sem captura de prefixo numérico
  assert.equal(extractReportedCostLexeme('{"usage":{"cost":1e-3}}'), null, "1e-3 não pode virar 1");
  assert.equal(extractReportedCostLexeme('{"usage":{"cost":0.5e1}}'), null, "0.5e1 não pode virar 0.5");
  assert.equal(extractReportedCostLexeme('{"usage":{"cost":1.5e1}}'), null, "1.5e1 não pode virar 1 (backtrack sobre '.' bloqueado)");
  assert.equal(extractReportedCostLexeme('{"usage":{"cost_details":{"upstream_inference_cost":2e1}}}'), null, "científica em cost_details também é rejeitada");
});

test("extractReportedCostLexeme ignora cost dentro do conteúdo gerado (string escapada) e só lê usage de topo", () => {
  // conteúdo gerado contendo {"cost":123} — sem usage no envelope → null
  const contentOnly = '{"choices":[{"message":{"content":"{\\"cost\\":123,\\"items\\":[]}"}}]}';
  assert.equal(extractReportedCostLexeme(contentOnly), null, "cost do conteúdo nunca é custo do provider");
  // conteúdo com cost + usage.cost presente → captura o do usage
  const both = '{"usage":{"cost":0.009},"choices":[{"message":{"content":"{\\"cost\\":123}"}}]}';
  assert.equal(extractReportedCostLexeme(both), "0.009");
  // "usage" citado dentro do conteúdo não confunde o scanner string-aware
  const usageInContent = '{"choices":[{"message":{"content":"{\\"usage\\":{\\"cost\\":99}}"}},{"usage":{"cost":0.5}}]}';
  assert.equal(extractReportedCostLexeme(usageInContent), null, "usage fora do nível-raiz é ignorado pelo contrato");
});

test("extractReportedCostLexeme aceita apenas usage no nível 0 do envelope (choices[].usage não conta)", () => {
  // usage aninhado em choices sem usage de topo → null
  assert.equal(extractReportedCostLexeme('{"choices":[{"usage":{"cost":99}}]}'), null);
  // usage de topo prevalece sobre usage aninhado em choices
  assert.equal(extractReportedCostLexeme('{"choices":[{"usage":{"cost":99}}],"usage":{"cost":0.5}}'), "0.5");
});

test("dollarsLexemeToMinor converte decimal exato para cents com HALF_UP documentado", () => {
  assert.equal(dollarsLexemeToMinor("0.009"), "1", "contrato: 0.009 → 1 centavo (HALF_UP)");
  assert.equal(dollarsLexemeToMinor("0.95"), "95");
  assert.equal(dollarsLexemeToMinor("1.005"), "101");
  assert.equal(dollarsLexemeToMinor("2"), "200");
  assert.equal(dollarsLexemeToMinor("0.004"), "0", "abaixo de meio centavo → 0 válido");
  assert.equal(dollarsLexemeToMinor("-1"), null, "negativo não é lexeme válido");
  assert.equal(dollarsLexemeToMinor("1.5e3"), null, "notação científica não é lexeme válido");
});

test("onMetrics carrega reportedCost (USD) no sucesso; falha com cost também reporta", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.009 }, choices: [{ message: { content: JSON.stringify({ ok: true }) } }] }), { status: 200 })) as typeof fetch;
  const provider = createHttpProvider({ baseUrl: "http://localhost:1/v1", apiKey: "k", models: { MID: "m", HIGH: "m" }, timeoutMs: 5000 });
  let captured: Record<string, unknown> | undefined;
  try {
    await provider.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, (metrics) => { captured = metrics as unknown as Record<string, unknown>; });
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(captured?.reportedCost, { amountMinor: "1", currency: "USD", completeness: "COMPLETE" });
});
