import test from "node:test";
import assert from "node:assert/strict";
import { attemptDeadlineMsFor, briefPayloadForPersistence, callBudget, fallbackCallBudget, fenceMatches, heartbeatAction, internalFailureMetadata, mergeMemorySignals, projectEngineFacts, projectFailureDiagnostics, runMetadata, sceneBackfillLimitFor, sceneCallBudget, semanticQualityCallBudget } from "./worker";
import { ENGINE_VERSION } from "./engine";
import { GATE_POLICY_VERSION } from "./gates";
import { collectJobEvents, emitJobEvent, resetJobEvents } from "./observability";

// Gate 5 (item 3): o worker projeta o desconto SOMENTE do tipado, na chave
// "discount" — a mesma chave que a engine lê na projeção do mappingContext.
test("engineFacts projeta o desconto do tipado, sem fallback de discountPercentage", () => {
  const base = {
    id: "p1",
    name: "Produto",
    description: "D",
    category: "C",
    brand: null,
    priceAmount: null,
    priceCurrency: "R$",
    discountType: null,
    discountValue: null,
    discountPercentage: null,
    features: ["x"],
    variants: null,
    images: [],
    seller: null,
    sourceUrl: null,
  };
  // PERCENTAGE → string percentual na chave "discount".
  assert.equal(projectEngineFacts({ ...base, discountType: "PERCENTAGE", discountValue: "15.5" }).discount, "15.5% de desconto");
  // FIXED → valor na moeda do produto.
  assert.equal(projectEngineFacts({ ...base, discountType: "FIXED", discountValue: "10.00", priceCurrency: "R$" }).discount, "R$ 10.00 de desconto");
  // Sem desconto → undefined: valor nunca inventado.
  assert.equal(projectEngineFacts(base).discount, undefined);
  // Resquício legado sem tipado → undefined (contrato exclusivamente tipado).
  assert.equal(projectEngineFacts({ ...base, discountPercentage: { toString: () => "25.5" } } as never).discount, undefined);
  // A chave projetada é a mesma lida pela engine no mappingContext.
  const facts = projectEngineFacts({ ...base, discountType: "PERCENTAGE", discountValue: "15.5" });
  assert.deepEqual(Object.keys(facts).sort(), ["brand", "category", "description", "discount", "features", "images", "name", "priceAmount", "priceCurrency", "productId", "seller", "sourceUrl", "variants"]);
});

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
test("failure metadata keeps semantic REVIEW out: no qualityFailures, no gateReports from semantic shapes", () => {
  const metadata = internalFailureMetadata("GEN-REPAIR-EXHAUSTED", "GENERATING_BRIEFS", {
    rejected: [{ contentId: "job-content-1", part: "hook", round: 2, status: "REVIEW", criterion: "hook_clarity", reason: "unclear", raw: "do not persist" }],
  });
  assert.equal("qualityFailures" in metadata, false);
  assert.equal("gateReports" in metadata, false);
  assert.ok(!JSON.stringify(metadata).includes("REVIEW"));
  assert.ok(!JSON.stringify(metadata).includes("do not persist"));
});
test("terminal failure event carries only objective gate reports, never qualityFailures", () => {
  const diagnostics = projectFailureDiagnostics([
    { contentId: "job-content-1", part: "hook", round: 2, status: "REVIEW", criterion: "hook_clarity", reason: "unclear", raw: "drop" },
    { briefId: "job-content-2:job-brief-2", factualStatus: "UNSUPPORTED", decision: "REPAIR", issues: ["claim sem suporte"] },
  ]);
  assert.equal("qualityFailures" in diagnostics, false);
  resetJobEvents();
  emitJobEvent("job.terminal", { errorCode: "GEN-REPAIR-EXHAUSTED", gateReports: diagnostics.gateReports });
  const event = JSON.parse(collectJobEvents()[0]) as Record<string, unknown>;
  assert.equal("qualityFailures" in event, false);
  assert.deepEqual((event.gateReports as Array<Record<string, unknown>>).map(({ briefId }) => briefId), ["job-content-2:job-brief-2"]);
  assert.ok(!JSON.stringify(event).includes("raw"));
  assert.ok(!JSON.stringify(event).includes("REVIEW"));
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
