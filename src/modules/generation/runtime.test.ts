import assert from "node:assert/strict";
import test from "node:test";

import {
  assertGenerationTransition,
  isTerminalGenerationStatus,
  readGenerationRuntimeConfig,
  type GenerationStatus,
} from "./runtime.js";

test("gate operacional exige configuração server-side completa", () => {
  assert.throws(() => readGenerationRuntimeConfig({}), /configuração operacional/i);
  const config = readGenerationRuntimeConfig({
    GENERATION_LEASE_TTL_MS: "1000",
    GENERATION_MAX_ATTEMPTS: "3",
    GENERATION_RETRY_BACKOFF_MS: "250",
    GENERATION_STUCK_JOB_AFTER_MS: "2000",
  });
  assert.deepEqual(config, { leaseTtlMs: 1000, maxAttempts: 3, retryBackoffMs: 250, stuckJobAfterMs: 2000 });
});

test("transições terminais e cancelamento são explícitos", () => {
  assertGenerationTransition("queued", "running");
  assertGenerationTransition("running", "failed");
  assertGenerationTransition("queued", "cancelled");
  for (const status of ["succeeded", "failed", "cancelled"] as GenerationStatus[]) assert.equal(isTerminalGenerationStatus(status), true);
  assert.throws(() => assertGenerationTransition("succeeded", "queued"), /transição/i);
  assert.throws(() => assertGenerationTransition("queued", "succeeded"), /transição/i);
});
