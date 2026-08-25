import assert from "node:assert/strict";
import test from "node:test";

import { generationHealth } from "./health.js";

test("health separa liveness/readiness e falha fechado sem config, banco ou fila", async () => {
  const config = { leaseTtlMs: 1000, maxAttempts: 2, retryBackoffMs: 100, stuckJobAfterMs: 5000 };
  const ready = await generationHealth({
    now: new Date("2026-08-25T12:00:00.000Z"),
    heartbeatAt: new Date("2026-08-25T11:59:59.500Z"),
    config,
    checkDatabase: async () => undefined,
    checkQueue: async () => undefined,
  });
  assert.deepEqual(ready, { status: "ok", liveness: true, readiness: true, checks: { database: true, queue: true, configuration: true } });

  const stale = await generationHealth({
    now: new Date("2026-08-25T12:00:00.000Z"),
    heartbeatAt: new Date("2026-08-25T11:59:00.000Z"),
    config,
    checkDatabase: async () => undefined,
    checkQueue: async () => { throw new Error("queue"); },
  });
  assert.equal(stale.status, "not_ready");
  assert.equal(stale.liveness, false);
  assert.equal(stale.readiness, false);
  assert.equal(stale.checks.queue, false);
});
