import test from "node:test";
import assert from "node:assert/strict";
import { providerRuntimeConfig, createHttpProvider } from "./provider";
test("reports configured OpenAI-compatible provider without exposing credentials", () => {
  const result = providerRuntimeConfig({
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "secret",
    models: { MID: "model" },
    timeoutMs: 1000,
  });
  assert.deepEqual(result, {
    configured: true,
    baseUrl: "https://openrouter.ai",
    modelConfigured: true,
    timeoutMs: 1000,
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});
test("sanitizes unavailable provider smoke error", async () => {
  await assert.rejects(
    () =>
      createHttpProvider({
        baseUrl: "http://127.0.0.1:1/v1",
        apiKey: "secret",
        models: { MID: "model" },
        timeoutMs: 50,
      }).complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Provider indisponível" &&
      !error.message.includes("secret"),
  );
});
