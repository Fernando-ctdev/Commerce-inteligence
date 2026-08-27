import assert from "node:assert/strict";
import test from "node:test";
import {
  BrowserSessionNotFoundError,
  createBrowserClient,
  resolveBrowserServiceConfig,
} from "./client.js";

test("resolveBrowserServiceConfig falha fechado sem token suficiente", () => {
  const invalidEnv = { ...process.env, BROWSER_SERVICE_URL: "http://127.0.0.1:8081", BROWSER_SERVICE_TOKEN: "short" };
  const validEnv = { ...process.env, BROWSER_SERVICE_URL: "http://127.0.0.1:8081/", BROWSER_SERVICE_TOKEN: "0123456789abcdef" };
  assert.throws(() => resolveBrowserServiceConfig(invalidEnv), /Error/);
  assert.deepEqual(resolveBrowserServiceConfig(validEnv), {
    baseUrl: "http://127.0.0.1:8081",
    token: "0123456789abcdef",
  });
});

test("client lê o corpo uma vez e sanitiza erros do serviço", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ sessionId: "s", profileId: "p", sourceUrl: "https://shop.tiktok.com/item/1", state: "OPENING" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const client = createBrowserClient({ baseUrl: "http://browser.test", token: "0123456789abcdef" });
    const view = await client.get("s");
    assert.equal(view.state, "OPENING");

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: "SESSION_NOT_FOUND", message: "internal details" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    await assert.rejects(client.get("missing"), BrowserSessionNotFoundError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
