import assert from "node:assert/strict";
import test from "node:test";
import { GenerationApiError, normalizeGeneration, cancelGeneration, getCurrentGenerationForProduct, startGeneration } from "./generation-api";

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

test("aceita SUCCEEDED com bullets separados e remove scenes legadas da resposta", () => {
  const job = normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: { objective: "Vender" }, plan: { targetContentCount: 1 }, contents: [{ id: "content-1", angle: "Demonstração", hook: "Veja isto", development: ["Mostre o produto"], script: "Mostre o produto", scenes: ["legado"], cta: "Confira agora" }] });
  assert.equal(job.readiness, "READY");
  assert.equal(job.contents.length, job.targetContentCount);
  assert.deepEqual(job.contents[0].development, ["Mostre o produto"]);
  assert.equal("scenes" in job.contents[0], false);
});

test("sanitiza erro público sem expor controle de workflow", () => {
  assert.equal(normalizeGeneration({ id: "job-1", productId: "product-1", status: "FAILED", targetContentCount: 1, error: "provider\nfalhou\u0000" }).error, "provider falhou");
});

test("rejeita envelope sem ownership válido, quantidade inválida ou briefing incompleto", () => {
  assert.throws(() => normalizeGeneration({ id: "", productId: "product-1", status: "QUEUED", targetContentCount: 1 }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "QUEUED", targetContentCount: 0 }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: {}, plan: {}, contents: [{ id: "content-1" }] }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: {}, plan: {}, contents: [{ angle: "a", hook: "h", development: "bullet", script: "oral", cta: "cta" }] }), GenerationApiError);
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
