import test from "node:test";
import assert from "node:assert/strict";
import { attemptDeadlineMsFor, briefPayloadForPersistence, callBudget, fallbackCallBudget, fenceMatches, heartbeatAction, internalFailureMetadata, mergeMemorySignals, projectFailureDiagnostics, runMetadata, sceneBackfillLimitFor, sceneCallBudget, semanticQualityCallBudget } from "./worker";
import { ENGINE_VERSION } from "./engine";
import { GATE_POLICY_VERSION } from "./gates";
import { collectJobEvents, emitJobEvent, resetJobEvents } from "./observability";

// Review: IntelligenceRun.metadata registra gateVersion junto do engineVersion.
test("run metadata carries engineVersion and gateVersion snapshots", () => {
  const metadata = runMetadata(1, () => ({ provider: "p", model: "m", instructionVersion: "i" }), [], 0, 1, [], [], [{ field: "cta", replacedWithId: "cta-x", reason: "função promo sem pattern deliverable" }], [], [], [{ field: "purchaseBarriers", received: 9, kept: 8 }]);
  assert.equal(metadata.engineVersion, ENGINE_VERSION);
  assert.equal(metadata.gateVersion, GATE_POLICY_VERSION);
  assert.deepEqual(metadata.patternReplacements, [{ field: "cta", replacedWithId: "cta-x", reason: "função promo sem pattern deliverable" }]);
  assert.deepEqual(metadata.understandingReductions, [{ field: "purchaseBarriers", received: 9, kept: 8 }]);
});
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
test("failure metadata projects semantic quality failures without the gate sanitizer", () => {
  const metadata = internalFailureMetadata("GEN-REPAIR-EXHAUSTED", "GENERATING_BRIEFS", {
    rejected: [{ contentId: "job-content-1", part: "hook", round: 2, status: "REPAIR", criterion: "hook_clarity", reason: "unclear", raw: "do not persist" }],
  });
  assert.deepEqual(metadata.qualityFailures, [{ contentId: "job-content-1", part: "hook", round: 2, status: "REPAIR", criterion: "hook_clarity", reason: "unclear" }]);
  assert.equal("gateReports" in metadata, false);
  assert.ok(!JSON.stringify(metadata).includes("do not persist"));
});
test("terminal failure event keeps semantic allowlist separate from deterministic gate reports", () => {
  const diagnostics = projectFailureDiagnostics([
    { contentId: "job-content-1", part: "hook", round: 2, status: "REPAIR", criterion: "hook_clarity", reason: "unclear", raw: "drop" },
    { briefId: "job-content-2:job-brief-2", factualStatus: "UNSUPPORTED", decision: "REPAIR", issues: ["claim sem suporte"] },
  ]);
  resetJobEvents();
  emitJobEvent("job.terminal", { errorCode: "GEN-REPAIR-EXHAUSTED", qualityFailures: diagnostics.qualityFailures, gateReports: diagnostics.gateReports });
  const event = JSON.parse(collectJobEvents()[0]) as Record<string, unknown>;
  assert.deepEqual(event.qualityFailures, [{ contentId: "job-content-1", part: "hook", round: 2, status: "REPAIR", criterion: "hook_clarity", reason: "unclear" }]);
  assert.deepEqual((event.gateReports as Array<Record<string, unknown>>).map(({ briefId }) => briefId), ["job-content-2:job-brief-2"]);
  assert.ok(!JSON.stringify(event).includes("raw"));
  resetJobEvents();
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
test("attempt budget covers all semantic judge/part repairs and selected scene backfill", () => {
  const count = 10;
  const configuredTimeout = Number(process.env.GENERATION_PROVIDER_TIMEOUT_MS ?? 180000);
  const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 180000;
  const configuredMargin = Number(process.env.GENERATION_FINALIZE_MARGIN_MS ?? 120000);
  const margin = Number.isFinite(configuredMargin) && configuredMargin > 0 ? configuredMargin : 120000;
  assert.equal(semanticQualityCallBudget(count), 210);
  assert.equal(sceneBackfillLimitFor(1), 10);
  assert.equal(sceneBackfillLimitFor(count), 10);
  assert.equal(sceneCallBudget(1), 33);
  assert.equal(sceneCallBudget(count), 60);
  for (const targetCount of [1, count]) {
    const required = (callBudget(targetCount) + fallbackCallBudget(targetCount) + semanticQualityCallBudget(targetCount) + 2 * targetCount + sceneCallBudget(targetCount)) * timeout + margin;
    assert.ok(attemptDeadlineMsFor(targetCount) >= required, `deadline covers provider calls for count=${targetCount}`);
  }
});

test("mergeMemorySignals acumula com dedupe e não substitui histórico (ADR-021)", () => {
  const previous = {
    generatedCount: 4,
    deliveredHookMechanisms: ["demonstração direta", "prova social"],
    deliveredCtaFunctions: ["promo", "checkout"],
    deliveredAngles: ["a1"],
  };
  const merged = mergeMemorySignals(previous, {
    generatedCount: 2,
    deliveredHookMechanisms: ["prova social", "objeção respondida"],
    deliveredCtaFunctions: ["promo"],
    deliveredAngles: ["a2"],
  });
  assert.deepEqual(merged.deliveredHookMechanisms, ["demonstração direta", "prova social", "objeção respondida"]);
  assert.deepEqual(merged.deliveredCtaFunctions, ["promo", "checkout"]);
  assert.deepEqual(merged.deliveredAngles, ["a1", "a2"]);
  assert.equal(merged.generatedCount, 6, "contagem entregue é acumulada");
});

test("mergeMemorySignals sem snapshot anterior inicia o histórico", () => {
  const merged = mergeMemorySignals(undefined, {
    generatedCount: 2,
    deliveredHookMechanisms: ["prova social"],
    deliveredCtaFunctions: ["promo"],
    deliveredAngles: ["a1"],
  });
  assert.deepEqual(merged.deliveredHookMechanisms, ["prova social"]);
  assert.equal(merged.generatedCount, 2);
});
