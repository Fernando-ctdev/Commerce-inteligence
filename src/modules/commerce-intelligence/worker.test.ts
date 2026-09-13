import test from "node:test";
import assert from "node:assert/strict";
import { briefPayloadForPersistence, fenceMatches, heartbeatAction, internalFailureMetadata } from "./worker";
test("brief persistence keeps development bullets and strips legacy scenes", () => {
  const payload = briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: ["Ponto de desenvolvimento"], script: "Roteiro oral", cta: "CTA", scenes: ["cena antiga"] } as never);
  assert.deepEqual(payload.development, ["Ponto de desenvolvimento"]);
  assert.equal("scenes" in payload, false);
});
test("brief persistence rejects missing development", () => {
  assert.throws(() => briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", script: "Roteiro oral", cta: "CTA" } as never), /development/);
});
test("brief persistence rejects empty, oversized, or non-string development bullets", () => {
  const base = { contentId: "c1", briefVersionId: "b1", version: 1 as const, angle: "a", hook: "h", script: "Roteiro oral", cta: "CTA" };
  for (const development of [[], ["1", "2", "3", "4", "5"], ["válido", 2]]) {
    assert.throws(() => briefPayloadForPersistence({ ...base, development } as never), /development/);
  }
});
test("failure metadata persists internal code, current stage and sanitized causes per brief", () => {
  const metadata = internalFailureMetadata("GEN-REPAIR-EXHAUSTED", "GENERATING_BRIEFS", {
    task: "CONTENT_BRIEF_GENERATION",
    rejected: [{ briefId: "job-content-2:job-brief-2", factualStatus: "UNSUPPORTED", decision: "REPAIR", issues: ["claim sem suporte", "development invalido"], script: "raw brief must not be persisted" }],
  });
  assert.equal(metadata.code, "GEN-REPAIR-EXHAUSTED");
  assert.equal(metadata.stage, "GENERATING_BRIEFS");
  assert.deepEqual(metadata.causes, [{ briefId: "job-content-2:job-brief-2", causes: ["claim sem suporte", "development invalido"] }]);
  assert.ok(!JSON.stringify(metadata).includes("raw brief"));
});
test("internal failure metadata retains sanitized ContractError identity and field", () => {
  const metadata = internalFailureMetadata("GEN-SCHEMA", "UNDERSTANDING_PRODUCT", {
    errorName: "ContractError",
    message: "cardinalidade de purchaseBarriers fora da politica (min 1, max 8)",
    field: "purchaseBarriers",
  });
  assert.equal(metadata.code, "GEN-SCHEMA");
  assert.equal(metadata.stage, "UNDERSTANDING_PRODUCT");
  assert.deepEqual(metadata.detail, {
    issue: "cardinalidade de purchaseBarriers fora da politica (min 1, max 8)",
    field: "purchaseBarriers",
    errorName: "ContractError",
  });
});
test("rejects result writes from a reclaimed owner", () => { const current = { leaseOwnerId: "new-owner", attempt: 2 }; assert.equal(fenceMatches(current, "old-owner", 1), false); assert.equal(fenceMatches(current, "new-owner", 2), true); });
// Coração do bloqueio 2 do Review: o heartbeat deve INTERROMPER a renovação e ABORTAR a
// tentativa no attemptDeadlineAt, cobrindo até provider que ignora o AbortSignal.
test("heartbeat renews only before the attempt deadline, aborts at it, skips after fence loss", () => {
  assert.equal(heartbeatAction(1_000, 10_000, false), "renew");
  assert.equal(heartbeatAction(9_999, 10_000, false), "renew");
  assert.equal(heartbeatAction(10_000, 10_000, false), "abort");
  assert.equal(heartbeatAction(60_000, 10_000, false), "abort");
  assert.equal(heartbeatAction(1_000, 10_000, true), "skip");
  assert.equal(heartbeatAction(60_000, 10_000, true), "skip");
});
