import test from "node:test";
import assert from "node:assert/strict";
import { createHttpProvider } from "./provider";
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
test("sends reasoning effort low explicitly on every capability call", async () => {
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
  for (const body of bodies) assert.deepEqual(body.reasoning, { effort: "low" });
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
