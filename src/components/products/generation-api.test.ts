import assert from "node:assert/strict";
import test from "node:test";
import { GenerationApiError, completeMissingGeneration, isRetryableGeneration, normalizeGeneration, cancelGeneration, getCurrentGenerationForProduct, startGeneration } from "./generation-api";
import { partialModel } from "./generation-ui-model";

test("normaliza estados e stage canônicos sem aceitar status desconhecido", () => {
  const job = normalizeGeneration({ id: "job-1", productId: "product-1", status: "RUNNING", stage: "BUILDING_STRATEGY", targetContentCount: 3 });
  assert.equal(job.status, "RUNNING");
  assert.equal(job.stage, "BUILDING_STRATEGY");
  assert.equal(job.readiness, "ANALYZING");
  assert.throws(() => normalizeGeneration({ status: "UNKNOWN" }), GenerationApiError);
});

test("busca o envelope completo após o 202 mínimo de início", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    requests.push(request);
    const body = request.url.endsWith("/api/generations") ? { id: "job-1", status: "QUEUED", stage: "UNDERSTANDING_PRODUCT" } : { id: "job-1", productId: "product-1", status: "QUEUED", stage: "UNDERSTANDING_PRODUCT", targetContentCount: 2 };
    return new Response(JSON.stringify(body), { status: request.url.endsWith("/api/generations") ? 202 : 200 });
  };
  try {
    const result = await startGeneration("product-1", "client-key");
    assert.equal(result.id, "job-1");
    assert.equal(requests[0].headers.get("Idempotency-Key"), "client-key");
    assert.deepEqual(await requests[0].clone().json(), { productId: "product-1" });
    assert.equal(requests[1].url, "http://localhost/api/generations/job-1");
  } finally { globalThis.fetch = originalFetch; }
});

test("gerar faltantes chama /complete do parcial com chave idempotente e recarrega envelope", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    requests.push(request);
    const novoJob = { id: "job-2", productId: "product-1", status: "QUEUED", stage: "GENERATING_BRIEFS", targetContentCount: 1 };
    const body = novoJob;
    return new Response(JSON.stringify(body), { status: request.url.endsWith("/complete") ? 202 : 200 });
  };
  try {
    const result = await completeMissingGeneration("job-1", "client-key");
  assert.equal(result.status, "QUEUED");
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "http://localhost/api/generations/job-1/complete");
    assert.equal(requests[0].headers.get("Idempotency-Key"), "client-key");
    assert.deepEqual(await requests[0].clone().json(), {});
  } finally { globalThis.fetch = originalFetch; }
});

test("aceita SUCCEEDED com bullets separados e preserva a projeção canônica de cenas", () => {
  const scenes = { status: "AVAILABLE", generated: 2, dropped: 0, scenes: [{ description: "Demonstre o produto" }, { description: "Mostre o detalhe" }] };
  const job = normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: { objective: "Vender" }, plan: { targetContentCount: 1 }, contents: [{ id: "content-1", angle: "Demonstração", hook: "Veja isto", development: ["Mostre o produto", "Destaque o produto"], script: "Mostre o produto", scenes, cta: "Confira agora" }] });
  assert.equal(job.readiness, "READY");
  assert.equal(job.contents.length, job.targetContentCount);
  assert.deepEqual(job.contents[0].development, ["Mostre o produto", "Destaque o produto"]);
  assert.deepEqual(job.contents[0].scenes, scenes);
});

test("aceita SUCCEEDED_PARTIAL com D de N prontos, motivos por item e readiness READY", () => {
  const brief = { id: "content-1", angle: "a", hook: "h", development: ["ponto 1", "ponto 2"], script: "s", cta: "c" };
  const job = normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED_PARTIAL", targetContentCount: 3, expectedCount: 3, deliveredCount: 2, failedCount: 1, strategy: {}, plan: {}, contents: [brief, { ...brief, id: "content-2" }], missing: [{ position: 3, reasonCode: "unverified_claim" }, { reasonCode: " " }, 42] });
  assert.equal(job.status, "SUCCEEDED_PARTIAL");
  assert.equal(job.readiness, "READY");
  assert.equal(job.deliveredCount, 2);
  assert.equal(job.failedCount, 1);
  assert.equal(job.expectedCount, 3);
  assert.deepEqual(job.missing, [{ position: 3, reasonCode: "unverified_claim" }]);
});

test("rejeita SUCCEEDED_PARTIAL sem deliveredCount consistente e mantém retry só em FAILED/CANCELLED", () => {
  const brief = { angle: "a", hook: "h", development: ["ponto 1", "ponto 2"], script: "s", cta: "c" };
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED_PARTIAL", targetContentCount: 2, strategy: {}, plan: {}, contents: [brief] }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED_PARTIAL", targetContentCount: 2, deliveredCount: 2, strategy: {}, plan: {}, contents: [brief] }), GenerationApiError);
  assert.equal(isRetryableGeneration("SUCCEEDED_PARTIAL"), false);
});

test("sanitiza erro público sem expor controle de workflow", () => {
  assert.equal(normalizeGeneration({ id: "job-1", productId: "product-1", status: "FAILED", targetContentCount: 1, error: "provider\nfalhou\u0000" }).error, "provider falhou");
});

test("rejeita envelope sem ownership válido, quantidade inválida ou briefing incompleto", () => {
  assert.throws(() => normalizeGeneration({ id: "", productId: "product-1", status: "QUEUED", targetContentCount: 1 }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "QUEUED", targetContentCount: 0 }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: {}, plan: {}, contents: [{ id: "content-1" }] }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: {}, plan: {}, contents: [{ angle: "a", hook: "h", development: ["um", "dois", "três", "quatro", "cinco", "seis", "sete"], script: "oral", cta: "cta" }] }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: {}, plan: {}, contents: [{ angle: "a", hook: "h", development: ["único"], script: "oral", cta: "cta" }] }), GenerationApiError);
});

test("consulta o estado atual escopado ao Product e aceita resposta vazia", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    requests.push(request);
    return new Response("null", { status: 200 });
  };
  try {
    assert.equal(await getCurrentGenerationForProduct("product-1"), null);
    assert.equal(requests[0].url, "http://localhost/api/generations/current?productId=product-1");
  } finally { globalThis.fetch = originalFetch; }
});

test("cancela apenas com POST no endpoint do job e normaliza o terminal", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    requests.push(request);
    return new Response(JSON.stringify({ id: "job-1", productId: "product-1", status: "CANCELLED", targetContentCount: 1 }), { status: 200 });
  };
  try {
    const job = await cancelGeneration("job-1");
    assert.equal(job.status, "CANCELLED");
    assert.equal(job.readiness, "FAILED");
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "http://localhost/api/generations/job-1/cancel");
  } finally { globalThis.fetch = originalFetch; }
});

// Gate 3 item 6 (rev. 3) — envelope degradado GEN-PROJECTION (RI-003-20): terminal
// positivo não projetável chega com strategy/plan {} e contents vazio/parcial. O
// cliente preserva `code` e `status`, trata como consumível (não GEN-SCHEMA) e mantém
// as ações coerentes: SUCCEEDED degradado = sem retry; parcial degradado = /complete
// disponível, retry não.
const envelopeDegradado = (status: "SUCCEEDED" | "SUCCEEDED_PARTIAL") => ({
  id: "job-degraded",
  productId: "product-1",
  status,
  stage: "FINALIZING",
  targetContentCount: 2,
  error: "Não foi possível carregar o resultado desta análise.",
  code: "GEN-PROJECTION",
  readiness: "FAILED",
  strategy: {},
  plan: {},
  contents: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:01.000Z",
  finishedAt: "2026-01-01T00:00:02.000Z",
  attempt: 1,
  ...(status === "SUCCEEDED_PARTIAL" ? { expectedCount: 2, deliveredCount: 1, failedCount: 1, missing: [{ position: 2, reasonCode: "HARD_GATE" }] } : {}),
});

test("SUCCEEDED degradado GEN-PROJECTION é consumido com status preservado e SEM retry", () => {
  const job = normalizeGeneration(envelopeDegradado("SUCCEEDED"));
  assert.equal(job.code, "GEN-PROJECTION"); // code preservado para a UI
  assert.equal(job.status, "SUCCEEDED"); // status persistido nunca mascarado
  assert.equal(job.readiness, "FAILED");
  assert.deepEqual(job.contents, []);
  assert.deepEqual(job.strategy, {});
  // Ação: sem "Tentar novamente" — a UI deriva retry de job.status
  // (use-generation-job: isRetryableGeneration(job.status)) e /retry responderia
  // 404 (SUCCEEDED fora da partição).
  assert.equal(isRetryableGeneration(job.status), false);
});

test("SUCCEEDED_PARTIAL degradado preserva contagens/missing e mantém /complete, sem retry", () => {
  const job = normalizeGeneration(envelopeDegradado("SUCCEEDED_PARTIAL"));
  assert.equal(job.code, "GEN-PROJECTION");
  assert.equal(job.status, "SUCCEEDED_PARTIAL");
  assert.equal(job.readiness, "FAILED");
  assert.equal(job.deliveredCount, 1);
  assert.equal(job.failedCount, 1);
  assert.deepEqual(job.missing, [{ position: 2, reasonCode: "HARD_GATE" }]);
  // Ações: "Gerar faltantes" segue disponível (recuperação dos faltantes não depende
  // da projeção); "Tentar novamente" não é oferecido (retry responderia 404).
  assert.equal(isRetryableGeneration(job.status), false);
  const partial = { status: job.status, targetContentCount: job.targetContentCount, deliveredCount: job.deliveredCount, contents: job.contents, missing: job.missing };
  assert.notEqual(partialModel(partial), null);
  assert.equal(partialModel(partial)?.delivered, 1);
});

test("terminal positivo NÃO degradado continua fail-fast (GEN-SCHEMA sem contents)", () => {
  const semConteudo = envelopeDegradado("SUCCEEDED");
  delete (semConteudo as Record<string, unknown>).code;
  assert.throws(() => normalizeGeneration(semConteudo), (error: unknown) => error instanceof GenerationApiError && error.code === "GEN-SCHEMA");
});
