import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceCatalog, runFirstGeneration } from "./engine";
import type { ProviderCallMetrics } from "./model-router";
const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });
test("fails closed when provider understanding violates contract", async () => { const router = { describe, complete: async () => ({ tenantId: "forbidden" }) }; await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), /Resposta inválida/); });
test("includes non-empty string arrays as stable fact evidence", () => {
  const catalog = buildEvidenceCatalog({ facts: { features: ["Leve", "Compacto"], empty: [], mixed: ["Veloz", 3] } });
  assert.deepEqual(catalog.refs, ["fact:features"]);
  assert.deepEqual(catalog.facts, ["Leve", "Compacto"]);
});
test("repairs mapping envelope without opportunities via a second contract-true call", async () => {
  let mappingCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls++; if (mappingCalls === 1) return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], analysis: "prosa sem opportunities" }; return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] }; }
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["s1", "s2"], cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(mappingCalls, 2, "mapping retried once when envelope lacked opportunities");
  assert.equal((result.strategy as { opportunities: unknown[] }).opportunities.length, 1);
});
test("repairs content plan array root via one contract-true retry, then fail-closed", async () => {
  let planCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") { planCalls++; if (planCalls === 1) return [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }]; return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] }; }
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["s1", "s2"], cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(planCalls, 2, "plan retried once when root was an array");
  assert.equal(result.briefs.length, 1);
});
test("plan retry exhausted yields typed GEN-SCHEMA without fabricating opportunities", async () => {
  let planCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") { planCalls++; return [1, 2]; }
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["s1", "s2"], cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string }; return e?.code === "GEN-SCHEMA"; });
  assert.equal(planCalls, 2, "exactly one retry before failing closed");
});
test("repairs brief batch cardinality divergence via one retry preserving exact-N", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; if (briefCalls === 1) return { items: [] }; return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["s1", "s2"], cta: "c" }] }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(briefCalls, 2, "batch retried once on cardinality divergence");
  assert.equal(result.briefs.length, 1, "exact-N preserved after repair");
});
test("brief batch retry exhausted yields typed GEN-SCHEMA without publishing", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["s1", "s2"], cta: "c" }, { angle: "a2", hook: "h2", script: "Mostre o Produto de novo", scenes: ["s1", "s2"], cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string }; return e?.code === "GEN-SCHEMA"; });
  assert.equal(briefCalls, 2, "exactly one retry before failing closed");
});
test("repairs invalid brief item scenes via one contract retry preserving exact-N", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; if (briefCalls === 1) return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["só uma"], cta: "c" }] }; return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["abertura", "demonstração"], cta: "c" }] }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(briefCalls, 2, "batch retried once when item scenes violated schema");
  assert.equal(result.briefs.length, 1, "exact-N preserved");
});
test("brief item scenes invalid after retry yields typed GEN-SCHEMA with sanitized detail", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string; detail?: Record<string, unknown> }; return e?.code === "GEN-SCHEMA" && e?.detail?.task === "CONTENT_BRIEF_GENERATION" && e?.detail?.retried === true; });
  assert.equal(briefCalls, 2, "exactly one retry before failing closed");
});
test("GEN-REPAIR-EXHAUSTED carries sanitized gate summary without brief payload", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", script: "SEGREDO_DO_BRIEFING suporta 7 kg comprovados", scenes: ["s1", "s2"], cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => {
    const e = error as { code?: string; detail?: Record<string, unknown> };
    assert.equal(e.code, "GEN-REPAIR-EXHAUSTED");
    assert.equal(e.detail?.task, "CONTENT_BRIEF_GENERATION");
    assert.equal(typeof e.detail?.rounds, "number");
    assert.equal(e.detail?.expected, 1);
    const rejected = e.detail?.rejected as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(rejected) && rejected.length === 1);
    assert.ok(["UNSUPPORTED", "INFERRED_BUT_SAFE"].includes(String(rejected[0].factualStatus)));
    assert.ok(Array.isArray(rejected[0].issues));
    assert.ok(!JSON.stringify(e.detail).includes("SEGREDO_DO_BRIEFING"), "resumo não pode conter conteúdo do briefing");
    return true;
  });
});
test("capabilities carry provider metrics allowlist for IntelligenceRun metadata", async () => {
  const router = { describe: () => ({ provider: "test", model: "mid-model", instructionVersion: "slice-003" }), modelFor: (task: string) => task === "STRATEGY_SYNTHESIS" || task === "CONTENT_PLAN_GENERATION" ? "high-model" : "mid-model", complete: async (task: string, _input: unknown, _signal: unknown, onMetrics?: (metrics: ProviderCallMetrics) => void) => {
    onMetrics?.({ model: task === "STRATEGY_SYNTHESIS" ? "high-model" : "mid-model", reasoning: "low", providerStatus: 200, requestBytes: 1200, trustedContextBytes: 600, externalBytes: 2, responseBytes: 50, durationMs: 5 });
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], communicationRisks: ["r"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"], communicationRisks: ["cr"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", scenes: ["s1", "s2"], cta: "c" }] };
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  const strategyCap = result.capabilities.find((cap) => cap.task === "STRATEGY_SYNTHESIS");
  assert.equal(strategyCap?.model, "high-model", "modelo efetivo por capability");
  assert.equal(strategyCap?.reasoning, "low");
  assert.equal(strategyCap?.providerStatus, 200);
  assert.equal(strategyCap?.requestBytes, 1200);
  assert.equal(strategyCap?.trustedContextBytes, 600);
  assert.equal(strategyCap?.externalBytes, 2);
  assert.ok(typeof strategyCap?.durationMs === "number");
});
test("requires a provider outside explicit test fallback", async () => { await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1 }), /Provider não configurado/); });