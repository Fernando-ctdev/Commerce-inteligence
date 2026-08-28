import assert from "node:assert/strict";
import test from "node:test";
import { deferred } from "./deferred.js";
import { createApp } from "./index.js";

test("GET /health responde 200 {status:'ok'} e rota desconhecida 404", async () => {
  const server = createApp();
  const listening = deferred<void>();
  server.listen(0, "127.0.0.1", () => listening.resolve());
  await listening.promise;
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const missing = await fetch(`${base}/nope`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
