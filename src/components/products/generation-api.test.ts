import assert from "node:assert/strict";
import test from "node:test";

import { GenerationApiError, getLatestGeneration, normalizeGeneration, retryGeneration, startGeneration } from "./generation-api";

const responseBody = {
  id: "run-1",
  productId: "product-1",
  status: "queued",
  quantity: 2,
  objective: "Aumentar conversão",
  previousRunId: null,
  queuedAt: "2026-08-25T12:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  attemptCount: 1,
  error: null,
  strategy: null,
  plan: null,
  contents: [],
  provenance: null,
};

test("sends the client idempotency key and request fields for a generation intent", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    return new Response(JSON.stringify(responseBody), { headers: { "Content-Type": "application/json" }, status: 202 });
  };

  try {
    const result = await startGeneration("product-1", 2, "Aumentar conversão", "client-key-1");
    assert.equal(result.id, "run-1");
    assert.equal(request?.headers.get("Idempotency-Key"), "client-key-1");
    assert.deepEqual(JSON.parse(await request!.text()), { productId: "product-1", quantity: 2, objective: "Aumentar conversão" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends a new retry intent key to the canonical retry endpoint", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    return new Response(JSON.stringify({ ...responseBody, id: "run-2", previousRunId: "run-1" }), { headers: { "Content-Type": "application/json" }, status: 202 });
  };

  try {
    const result = await retryGeneration("run-1", "retry-key-1");
    assert.equal(result.previousRunId, "run-1");
    assert.equal(request?.url, "http://localhost/api/generations/run-1/retry");
    assert.equal(request?.headers.get("Idempotency-Key"), "retry-key-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects succeeded responses without a complete result and sanitizes terminal errors", () => {
  assert.throws(
    () => normalizeGeneration({ ...responseBody, status: "succeeded", strategy: {}, plan: {}, contents: [{ id: "content-1" }] }),
    (error: unknown) => error instanceof GenerationApiError && error.code === "generation_incomplete",
  );
  assert.equal(normalizeGeneration({ ...responseBody, status: "failed", error: "provider\nfalhou\u0000" }).error, "provider falhou");
});

test("rejects an unknown generation status at the response boundary", () => {
  assert.throws(
    () => normalizeGeneration({ ...responseBody, status: "unknown" }),
    (error: unknown) => error instanceof GenerationApiError && error.message === "Resposta de Generation inválida.",
  );
});

test("restores the persisted Product run through the real run endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const stored = new Map([["commerce-intelligence:generation-run:product-1", "run-1"]]);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => stored.get(key) ?? null, removeItem: (key: string) => stored.delete(key), setItem: (key: string, value: string) => stored.set(key, value) } } });
  let url = "";
  globalThis.fetch = async (input, init) => {
    const request = new Request(typeof input === "string" ? new URL(input, "http://localhost") : input, init);
    url = request.url;
    return new Response(JSON.stringify(responseBody), { headers: { "Content-Type": "application/json" }, status: 200 });
  };

  try {
    const result = await getLatestGeneration("product-1");
    assert.equal(result?.id, "run-1");
    assert.equal(url, "http://localhost/api/generations/run-1");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});
