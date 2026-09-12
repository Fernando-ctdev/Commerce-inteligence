import test from "node:test";
import assert from "node:assert/strict";
import { briefPayloadForPersistence, fenceMatches, heartbeatAction } from "./worker";
test("brief persistence keeps development bullets and strips legacy scenes", () => {
  const payload = briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: ["Ponto de desenvolvimento"], script: "Roteiro oral", cta: "CTA", scenes: ["cena antiga"] } as never);
  assert.deepEqual(payload.development, ["Ponto de desenvolvimento"]);
  assert.equal("scenes" in payload, false);
});
test("brief persistence rejects missing development", () => {
  assert.throws(() => briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", script: "Roteiro oral", cta: "CTA" } as never), /development/);
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
