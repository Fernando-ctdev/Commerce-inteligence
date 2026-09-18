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
  const payload = briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: ["Ponto de desenvolvimento", "Ponto de desenvolvimento"], script: "Roteiro oral", cta: "CTA", scenes: ["cena antiga"] } as never);
  assert.deepEqual(payload.development, ["Ponto de desenvolvimento", "Ponto de desenvolvimento"]);
  assert.equal("scenes" in payload, false);
});
test("brief persistence rejects missing development", () => {
  assert.throws(() => briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", script: "Roteiro oral", cta: "CTA" } as never), /development/);
});
test("brief persistence rejects empty, oversized, or non-string development bullets", () => {
  const base = { contentId: "c1", briefVersionId: "b1", version: 1 as const, angle: "a", hook: "h", script: "Roteiro oral", cta: "CTA" };
  for (const development of [[], ["1", "2", "3", "4", "5", "6", "7"], ["válido", 2]]) {
    assert.throws(() => briefPayloadForPersistence({ ...base, development } as never), /development/);
  }
});
test("failure metadata persists internal code, current stage and sanitized causes per brief", () => {
  const metadata = internalFailureMetadata("GEN-REPAIR-EXHAUSTED", "GENERATING_BRIEFS", {
    task: "CONTENT_BRIEF_GENERATION",
    rejected: [{ briefId: "job-content-2:job-brief-2", factualStatus: "UNSUPPORTED", claimType: "objetivo", structuralStatus: "FAIL", platformStatus: "PASS", varietyStatus: "PASS", decision: "REPAIR", issues: ["claim sem suporte", "development invalido"], script: "raw brief must not be persisted" }],
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
    { briefId: "job-content-2:job-brief-2", factualStatus: "UNSUPPORTED", claimType: "objetivo", structuralStatus: "FAIL", platformStatus: "PASS", varietyStatus: "PASS", decision: "REPAIR", issues: ["claim sem suporte"] },
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
test("objective gate guard: semantic-shaped record with briefId and issues is not projected", () => {
  const diagnostics = projectFailureDiagnostics([
    { briefId: "job-content-1:job-brief-1", contentId: "job-content-1", part: "hook", round: 2, status: "REVIEW", criterion: "hook_clarity", reason: "unclear", issues: ["style"] },
  ]);
  assert.deepEqual(diagnostics.gateReports, []);
  assert.deepEqual(diagnostics.causes, []);
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

// ---- Task 3 (design 2026-09-18): diagnósticos redigidos por item no partial ----

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

test("failedItems carregam developmentDiagnostics e qualityDiagnostics allowlisted, sem texto de draft", async () => {
  const understanding = { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
  const envelope = { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [
    { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] },
    { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s2", confidence: 0.9, evidenceRefs: ["product:name"] },
    { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s3", confidence: 0.9, evidenceRefs: ["product:name"] },
  ] };
  const strategy = { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
  const badBullet = { text: "Prova os 999 kg de carga para o", action: "Prova", factRef: "product:description", rationale: "para o" };
  const goodBullet = { text: "Destaque o tecido respiravel para explicar o conforto no uso diario", action: "Destaque", factRef: "product:description", rationale: "para explicar o conforto no uso diario" };
  const judgeBatchPass = (input?: { trustedContext?: unknown }) => {
    const items = recordOf(input?.trustedContext)?.items;
    const list = Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
    return { audits: list.map(({ contentId }) => ({
      contentId,
      parts: [
        { part: "hook", status: Number(String(contentId).slice(-1)) === 2 ? "REVIEW" : "PASS", criterion: "hook_clarity", reason: Number(String(contentId).slice(-1)) === 2 ? "unclear" : "meets_criteria" },
        { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
        { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
        { part: "cta", status: "PASS", criterion: "cta_tiktok_native", reason: "meets_criteria" },
        { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
      ],
    })) };
  };
  const router = { describe: () => ({ provider: "test", model: "m", instructionVersion: "i" }), complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategy;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: envelope.opportunities.map((_opportunity, index) => ({ commercialObjective: `c${index + 1}`, angle: `a${index + 1}`, coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [
      { angle: "a1", hook: "h1", development: [badBullet, badBullet], script: "Fale sobre o produto", cta: "c1" },
      { angle: "a2", hook: "h2", development: [goodBullet, goodBullet], script: "Fale sobre o produto", cta: "c2" },
      { angle: "a3", hook: "h3", development: [goodBullet, goodBullet], script: "Fale sobre o produto", cta: "c3" },
    ] };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o produto nas maos" }, { description: "Pegue o produto e aproxime do tecido" }] };
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    if (task === "CONTENT_PART_REPAIR") return { items: (recordOf(input?.trustedContext)?.items as Array<{ contentId: string }> ?? []).map(({ contentId }) => ({ contentId, content: "Suporta 999 kg" })) };
    return {};
  } };
  const { runFirstGeneration } = await import("./engine");
  const result = await runFirstGeneration({ productId: "p", jobId: "j-diag", name: "Produto", description: "Tecido respirável", targetContentCount: 3, router });
  assert.ok(result.partial, "parcial declarado (ADR-021)");
  assert.equal(result.partial.expectedCount, 3);
  const byContent = new Map(result.partial.failedItems.map((f) => [f.contentId, f]));
  const devFailed = byContent.get("j-diag-content-1")!;
  assert.equal(devFailed.reason, "HARD_GATE");
  assert.ok(Array.isArray(devFailed.developmentDiagnostics) && devFailed.developmentDiagnostics.length === 2, "diagnóstico por bullet presente");
  assert.equal(devFailed.developmentDiagnostics![0]!.rationaleGroundingMatched, 0);
  assert.equal(devFailed.developmentDiagnostics![0]!.connectorPresent, true, "conector presente; a falha é grounding abaixo do mínimo");
  assert.ok(devFailed.issues.includes("feature_list") && devFailed.issues.includes("unverified_claim"), "rótulos fixos da cascata presentes");
  assert.ok(devFailed.issues.every((issue) => ["feature_list", "unverified_claim", "gate_issue"].includes(issue)), "issues apenas rótulos fixos");
  const qualityFailed = byContent.get("j-diag-content-2")!;
  assert.ok(Array.isArray(qualityFailed.qualityDiagnostics) && qualityFailed.qualityDiagnostics.length > 0, "diagnóstico de qualidade allowlisted presente");
  assert.deepEqual(qualityFailed.qualityDiagnostics![0], { part: "hook", criterion: "hook_clarity", status: "REVIEW", reason: "unclear" });
  const serialized = JSON.stringify(result.partial.failedItems);
  for (const sentinel of ["Destaque o tecido", "Tecido respirável", "Suporta 999 kg", "para explicar o conforto", "999 kg"]) {
    assert.ok(!serialized.includes(sentinel), `sem texto de draft/fato no metadata: ${sentinel}`);
  }
});
