import assert from "node:assert/strict";
import test from "node:test";
import { GenerationApiError, normalizeGeneration, startGeneration } from "./generation-api";

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
test("aceita SUCCEEDED somente com Strategy, Plan e exact-N Briefings completos", () => {
  const job = normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: { objective: "Vender" }, plan: { targetContentCount: 1 }, contents: [{ id: "content-1", angle: "Demonstração", hook: "Veja isto", script: "Mostre o produto", scenes: ["Cena 1", "Cena 2"], cta: "Confira agora" }] });
  assert.equal(job.readiness, "READY");
  assert.equal(job.contents.length, job.targetContentCount);
});

test("sanitiza erro público sem expor controle de workflow", () => {
  assert.equal(normalizeGeneration({ id: "job-1", productId: "product-1", status: "FAILED", targetContentCount: 1, error: "provider\nfalhou\u0000" }).error, "provider falhou");
});
test("rejeita envelope sem ownership válido, quantidade inválida ou briefing incompleto", () => {
  assert.throws(() => normalizeGeneration({ id: "", productId: "product-1", status: "QUEUED", targetContentCount: 1 }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "QUEUED", targetContentCount: 0 }), GenerationApiError);
  assert.throws(() => normalizeGeneration({ id: "job-1", productId: "product-1", status: "SUCCEEDED", targetContentCount: 1, strategy: {}, plan: {}, contents: [{ id: "content-1" }] }), GenerationApiError);
});
