import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceCatalog, runFirstGeneration } from "./engine";
import { ctaTextFactualIssues, validDevelopmentPoint } from "./gates";
import { CARDINALITY_POLICY_VERSION } from "./contract";
import { collectJobEvents, resetJobEvents } from "./observability";
import type { ModelRouter, ProviderCallMetrics } from "./model-router";
import { GenerationError } from "./errors";
import { TIKTOK_COMMERCE_SKILL, type PlatformSkill } from "./platform-skill";
const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });

// Fixtures compartilhadas dos testes de PU/retry (ADR-020 adendo 5).
const puBase = (over: Record<string, unknown> = {}) => ({
  productId: "p", category: undefined, coreUseCases: ["uso"], capabilities: ["cap"],
  functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"],
  desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"],
  purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"], ...over,
});
const briefOk = { angle: "demonstração", hook: "Veja", development: ["Mostre o tecido respirável para explicar como o tecido respirável afeta o uso"], script: "Tecido respirável", cta: "c" };
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const qualityPass = { parts: [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
] };
const judgeItems = (input?: { trustedContext?: unknown }): Array<Record<string, unknown>> => {
  const items = recordOf(input?.trustedContext)?.items;
  return Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
};
function withInternalCuration(router: ModelRouter): ModelRouter {
  return {
    ...router,
    complete: async (task, input, signal, onMetrics) => {
      if (task === "CONTENT_QUALITY_JUDGE") return { audits: judgeItems(input).map(({ contentId }) => ({ contentId, parts: qualityPass.parts })) };
      if (task === "CONTENT_SCENE_IDEAS") {
        const context = recordOf(input?.trustedContext);
        const brief = recordOf(context?.brief);
        const detail = Array.isArray(brief?.development) && typeof brief.development[0] === "string"
          ? brief.development[0]
          : String(brief?.hook ?? "produto");
        return { scenes: [{ description: `Mostre ${detail}` }, { description: `Pegue o produto e mostre ${detail}` }] };
      }
      return router.complete(task, input, signal, onMetrics);
    },
  };
}
test("fails closed when provider understanding violates contract", async () => { const router = { describe, complete: async () => ({ tenantId: "forbidden" }) }; await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), /Resposta inválida/); });
test("Product Understanding normalizes cardinality before validation", async () => {
  resetJobEvents();
  let puCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") {
      puCalls += 1;
      return puBase({ purchaseBarriers: Array.from({ length: 9 }, (_, index) => `barrier-${index}`), evidenceRefs: ["product:name"] });
    }
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [briefOk] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-contract", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(puCalls, 1, "cardinality overflow is reduced without a provider retry");
  assert.deepEqual(result.understandingReductions, [{ field: "purchaseBarriers", received: 9, kept: 8 }]);
  const events = collectJobEvents().map((line) => JSON.parse(line) as Record<string, unknown>);
  const puEvents = events.filter((event) => event.task === "PRODUCT_UNDERSTANDING" && event.event === "capability.completed");
  assert.equal(puEvents.length, 1);
});
test("includes non-empty string arrays as stable fact evidence with 1:1 facts-to-refs", () => {
  const catalog = buildEvidenceCatalog({ facts: { features: ["Leve", "Compacto"], empty: [], mixed: ["Veloz", 3] } });
  assert.deepEqual(catalog.refs, ["fact:features", "fact:features:2"]);
  assert.deepEqual(catalog.facts, ["Leve", "Compacto"]);
  assert.equal(catalog.facts.length, catalog.refs.length, "cada fato tem exatamente uma ref na mesma posição");
});
test("repairs mapping envelope without opportunities via a second contract-true call", async () => {
  let mappingCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls++; if (mappingCalls === 1) return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], analysis: "prosa sem opportunities" }; return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] }; }
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(mappingCalls, 2, "mapping retried once when envelope lacked opportunities");
  assert.equal((result.strategy as { opportunities: unknown[] }).opportunities.length, 1);
});
test("repairs content plan array root via one contract-true retry, then fail-closed", async () => {
  let planCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") { planCalls++; if (planCalls === 1) return [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }]; return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] }; }
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(planCalls, 2, "plan retried once when root was an array");
  assert.equal(result.briefs.length, 1);
});
test("plan retry exhausted yields typed GEN-SCHEMA without fabricating opportunities", async () => {
  let planCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") { planCalls++; return [1, 2]; }
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string }; return e?.code === "GEN-SCHEMA"; });
  assert.equal(planCalls, 2, "exactly one retry before failing closed");
});
test("repairs brief batch cardinality divergence via one retry preserving exact-N", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; if (briefCalls === 1) return { items: [] }; return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: "c" }] }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(briefCalls, 2, "batch retried once on cardinality divergence");
  assert.equal(result.briefs.length, 1, "exact-N preserved after repair");
});
test("brief batch retry exhausted yields typed GEN-SCHEMA without publishing", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: "c" }, { angle: "a2", hook: "h2", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto de novo", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string }; return e?.code === "GEN-SCHEMA"; });
  assert.equal(briefCalls, 2, "exactly one retry before failing closed");
});
test("provider scene data is not persisted in the brief", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", scenes: ["legado"], cta: "c" }] }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(briefCalls, 1, "unknown provider fields do not affect the brief contract");
  assert.equal(result.briefs.length, 1, "exact-N preserved");
  assert.equal("scenes" in result.briefs[0], false);
});
test("development remains required in the brief contract", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string; detail?: Record<string, unknown> }; return e?.code === "GEN-SCHEMA" && e?.detail?.task === "CONTENT_BRIEF_GENERATION" && e?.detail?.retried === true; });
  assert.equal(briefCalls, 2, "missing development retries once");
});
test("GEN-REPAIR-EXHAUSTED carries sanitized gate summary without brief payload", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["SEGREDO_DO_BRIEFING em uso"], script: "SEGREDO_DO_BRIEFING suporta 7 kg comprovados", cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => {
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
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: "c" }] };
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  const strategyCap = result.capabilities.find((cap) => cap.task === "STRATEGY_SYNTHESIS");
  assert.equal(strategyCap?.model, "high-model", "modelo efetivo por capability");
  assert.equal(strategyCap?.reasoning, "low");
  assert.equal(strategyCap?.providerStatus, 200);
  assert.equal(strategyCap?.requestBytes, 1200);
  assert.equal(strategyCap?.trustedContextBytes, 600);
  assert.equal(strategyCap?.externalBytes, 2);
  assert.ok(typeof strategyCap?.durationMs === "number");
});
test("requires a provider outside explicit test fallback", async () => { await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1 }), /Provider não configurado/); });
test("repair of many rejected briefs is per-item on CONTENT_BRIEF_REPAIR/HIGH preserving positions and ids", async () => {
  let genCalls = 0;
  let repairCalls = 0;
  const router = { describe, complete: async (task: string, input?: unknown) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: Array.from({ length: 10 }, (_, i) => ({ commercialObjective: `c${i}`, angle: `a${i}`, coreMessage: `m${i}`, hookMechanism: "h", noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      genCalls++;
      const batch = input as { trustedContext?: { opportunities?: unknown[] } } | undefined;
      const n = batch?.trustedContext?.opportunities?.length ?? 1;
      // Rodada inicial: claim numérico sem evidência → todos os itens exigem repair factual.
      return { items: Array.from({ length: n }, () => ({ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Suporta 999 kg", cta: "c" })) };
    }
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls++;
      // Repair por item: saída única, campos distintos por chamada (variedade do conjunto).
      return { angle: `ang ${repairCalls}`, hook: `hook ${repairCalls}`, development: [{ "text": `Destaque o tecido respiravel ${repairCalls} para explicar como o tecido respiravel ${repairCalls} afeta o uso`, "action": "Destaque", "factRef": "product:description", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }], script: `script distinto ${repairCalls}`, cta: `cta distinto ${repairCalls}` };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 10, router: withInternalCuration(router) });
  assert.equal(genCalls, 3, "3 batches iniciais (4/4/2)");
  assert.equal(repairCalls, 10, "10 itens reprovados, uma chamada por item; round 2 desnecessário");
  assert.equal(result.briefs.length, 10, "exact-N preservado");
  assert.deepEqual(result.briefs.map((b) => b.contentId), Array.from({ length: 10 }, (_, i) => `j-content-${i + 1}`), "posição/IDs estáveis após repair per-item");
  assert.ok(result.reports.every((report) => report.decision === "PASS"));
  assert.equal(result.repairs, 10);
  const repairEvents = result.capabilities.filter((cap) => cap.task === "CONTENT_BRIEF_REPAIR");
  assert.equal(repairEvents.length, 10, "cada chamada de repair é um CapabilityEvent próprio");
  assert.ok(repairEvents.every((cap) => cap.tier === "HIGH"), "repair roteado em HIGH");
});
test("capability events carry cardinality policy version on success", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.ok(result.capabilities.length >= 5);
  assert.ok(result.capabilities.every((cap) => cap.cardinalityPolicyVersion === CARDINALITY_POLICY_VERSION), "todo CapabilityEvent persistido carrega a versão da política");
});
test("failed capability record and event carry cardinality policy version", async () => {
  resetJobEvents();
  const router = { describe, complete: async () => { throw new Error("boom"); } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }));
  const failed = collectJobEvents().map((line) => JSON.parse(line) as Record<string, unknown>).find((event) => event.event === "capability.failed");
  assert.equal(failed?.cardinalityPolicyVersion, CARDINALITY_POLICY_VERSION, "falha de capability registra a versão da política");
});
test("PRODUCT_UNDERSTANDING retries other GEN-SCHEMA and normalizes the retry response", async () => {
  let puCalls = 0;
  const retryContexts: unknown[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") {
      puCalls += 1;
      retryContexts.push(input?.trustedContext);
      return puCalls === 1
        ? puBase({ purchaseBarriers: "inválido" })
        : puBase({ purchaseBarriers: Array.from({ length: 9 }, (_, i) => `b${i}`) });
    }
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }, { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }, { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "prova", noveltyTargets: ["angle"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [briefOk] };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostra o produto em uso no ambiente do creator" }, { description: "Pega o produto e aproxima do celular para close" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-pu1", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(puCalls, 2, "exactly one contract retry for PU");
  const repairField = recordOf(recordOf(retryContexts[1])?.contractRepair);
  assert.equal(repairField?.field, "purchaseBarriers");
  assert.equal(repairField?.max, 8);
  assert.equal(repairField?.received, null);
  assert.equal((result.productUnderstanding as { purchaseBarriers: string[] }).purchaseBarriers.length, 8);
  assert.deepEqual(result.understandingReductions, [{ field: "purchaseBarriers", received: 9, kept: 8 }]);
  assert.equal(result.briefs.length, 1);
  const puEvents = result.capabilities.filter((cap) => cap.task === "PRODUCT_UNDERSTANDING");
  assert.equal(puEvents.length, 2, "separate capability event per attempt");
  assert.ok(puEvents.every((event) => event.tier === "HIGH"), "ADR-020 adendo 3: PU roteado em HIGH");
  assert.equal(puEvents[0].ok, false);
  assert.equal(puEvents[1].ok, true);
});

test("GEN-FACT from understanding does not retry", async () => {
  let puCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") {
      puCalls += 1;
      return { ...puBase({ evidenceRefs: ["product:name"] }), evidenceRefs: ["fact-inexistente"] };
    }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j-pu3", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }));
  assert.equal(puCalls, 1, "GEN-FACT is fail-closed without retry");
});

test("GenerationError GEN-SCHEMA from provider does not retry PU (fail-closed, single call)", async () => {
  let puCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") {
      puCalls += 1;
      throw new GenerationError("GEN-SCHEMA", "Resposta do provider deve ser um objeto JSON");
    }
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-pu4", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => {
      const e = error as { code?: string; message?: string };
      assert.equal(e.code, "GEN-SCHEMA");
      assert.match(e.message ?? "", /provider/);
      return true;
    },
  );
  assert.equal(puCalls, 1, "provider GEN-SCHEMA is fail-closed without retry");
});

test("brief repair context carries per-item repairChecklist (Duna c1/c3 distinct)", async () => {
  let briefCalls = 0;
  let repairCalls = 0;
  const captured: unknown[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }, { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }, { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 2, opportunities: [{ commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "prova", noveltyTargets: ["angle"] }, { commercialObjective: "vender", angle: "objeção", coreMessage: "ajuste", hookMechanism: "demonstração", noveltyTargets: ["angle"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      return { items: [
        { angle: "a", hook: "h1", development: ["Cós elástico com cordão para ajuste"], script: "s1", cta: "c1" },
        { angle: "b", hook: "h2", development: ["Mostre o cós elástico com cordão para explicar como o cós elástico com cordão ajuda no ajuste"], script: "s2", cta: "Aproveita o frete grátis que apareceu na sua conta." },
      ] };
    }
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls += 1;
      captured.push(recordOf(input?.trustedContext)?.repairChecklist);
      const structuredDuna = [{ "text": "Mostre o cós elástico com cordão da calça para conectar o cordão do cós ao ajuste na cintura", "action": "Mostre", "factRef": "fact:features", "rationale": "para conectar o cordão do cós ao ajuste na cintura", "context": "na cintura" }];
      return repairCalls === 1
        ? { angle: "a", hook: "h1b", development: structuredDuna, script: "s1b", cta: "Confira as condições atuais na página do produto." }
        : { angle: "b", hook: "h2b", development: structuredDuna, script: "s2b", cta: "Vale dar uma olhada na página do produto para comparar." };
    }
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j-rc", name: "Calça Duna", description: "Calça Duna, cós elástico com cordão", facts: { features: ["cós elástico com cordão"] }, targetContentCount: 2, router: withInternalCuration(router) });
  assert.ok(repairCalls >= 2, "repair round happened via CONTENT_BRIEF_REPAIR");
  assert.deepEqual(recordOf(captured[0]), { developmentAction: true }, "c1: checklist por item (development declarativo)");
  assert.deepEqual(recordOf(captured[1]), { removeUnsupportedClaim: true }, "c3: checklist por item (frete grátis sem evidência)");
});
test("ADR-020: pre-selection never delivers CTA patterns the evidence does not support", async () => {
  let genContext: Record<string, unknown> | undefined;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 3, opportunities: Array.from({ length: 3 }, (_, i) => ({ commercialObjective: `c${i}`, angle: `a${i}`, coreMessage: `m${i}`, hookMechanism: "h", noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      genContext = recordOf(input?.trustedContext);
      return { items: Array.from({ length: 3 }, (_, i) => ({ angle: `a${i}`, hook: `h${i}`, development: ["Mostre o cós elástico com cordão para explicar como o cós elástico com cordão ajuda no ajuste"], script: `s${i}`, cta: `cta seguro ${i}` })) };
    }
    if (task === "CONTENT_BRIEF_REPAIR") return { angle: "r", hook: "hr", development: [{ "text": "Mostre o cós elástico com cordão para explicar como o cós elástico com cordão ajuda no ajuste", "action": "Mostre", "factRef": "fact:features", "rationale": "para explicar como o cós elástico com cordão ajuda no ajuste", "context": "no ajuste" }], script: "sr", cta: "cta seguro r" };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-safe", name: "Calça Duna", description: "Calça Duna, cós elástico com cordão", facts: { features: ["cós elástico com cordão"] }, targetContentCount: 3, router: withInternalCuration(router) });
  assert.equal(result.briefs.length, 3);
  const selected = recordOf(genContext)?.selectedPatterns as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(selected) && selected.length === 3);
  const facts = recordOf(genContext)?.relevantFacts as Array<{ value: string; ref: string }>;
  const snapshot = { facts: facts.map(({ value }) => value), refs: facts.map(({ ref }) => ref) };
  for (const pattern of selected) {
    const report = ctaTextFactualIssues(String((pattern.cta as Record<string, unknown>).text), snapshot);
    assert.equal(report.decision, "deliverable", String((pattern.cta as Record<string, unknown>).text));
  }
});
test("ADR-020/mechanism: mecanismo sem repertório deliverable falha no PLANO antes da LLM (zero chamadas de brief)", async () => {
  let planCalls = 0;
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") { planCalls += 1; return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "quebra de objeção de tamanho", noveltyTargets: ["n"] }] }; }
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls += 1; return { items: [] }; }
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-hook-genpattern", name: "Calça Duna", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => {
      const e = error as { code?: string; field?: string; message?: string };
      assert.equal(e.code, "GEN-VARIETY");
      assert.equal(e.field, "hookMechanism");
      assert.match(e.message ?? "", /repertório deliverable/);
      return true;
    },
  );
  assert.equal(planCalls, 2, "retry causal do plano recebe a causa");
  assert.equal(briefCalls, 0, "zero chamadas de briefing");
});
test("ADR-020/blocker: replacement de CTA registra id+reason no EngineResult sem texto original", async () => {
  let genContext: Record<string, unknown> | undefined;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 3, opportunities: Array.from({ length: 3 }, (_, i) => ({ commercialObjective: `c${i}`, angle: `a${i}`, coreMessage: `m${i}`, hookMechanism: "h", noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      genContext = recordOf(input?.trustedContext);
      return { items: Array.from({ length: 3 }, (_, i) => ({ angle: `a${i}`, hook: `h${i}`, development: ["Mostre o cós elástico com cordão para explicar como o cós elástico com cordão ajuda no ajuste"], script: `s${i}`, cta: `cta seguro ${i}` })) };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-repl", name: "Calça Duna", description: "Calça Duna, cós elástico com cordão", targetContentCount: 3, router: withInternalCuration(router) });
  assert.equal(result.briefs.length, 3);
  // Posição 3 (índice 2) quer o bucket promo, sem frete na evidência → replacement.
  const replacements = result.patternReplacements;
  assert.ok(replacements.length >= 1, "promo sem evidência é substituído");
  assert.ok(replacements.every((replacement) => replacement.field === "cta" && replacement.replacedWithId && replacement.reason.length > 0));
  assert.ok(!JSON.stringify(replacements).includes("frete"), "nunca texto original no metadata");
  assert.ok(replacements.every((replacement) => /^cta-/.test(replacement.replacedWithId)), "replacement identifica id do catálogo");
  const selected = recordOf(genContext)?.selectedPatterns as Array<Record<string, unknown>>;
  const delivered = selected.map((pattern) => String((pattern.cta as Record<string, unknown>).text));
  assert.ok(delivered.every((text) => ctaTextFactualIssues(text, { facts: ["Calça Duna"], refs: ["product:name"] }).decision === "deliverable"), "todo CTA entregue é deliverable (cap de variedade sobre pool filtrado)");
});
test("ADR-020/mechanism: planner objection sem repertório → retry causal para bucket deliverable", async () => {
  let planCalls = 0;
  const retryContexts: unknown[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") {
      planCalls += 1;
      const trusted = recordOf(input?.trustedContext);
      if (planCalls === 1) {
        assert.ok(Array.isArray(trusted?.deliverableHookMechanisms));
        assert.ok(!(trusted?.deliverableHookMechanisms as string[]).includes("objection"), "contexto exclui objection no catálogo atual");
        return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "quebra de objeção de tamanho", noveltyTargets: ["n"] }] };
      }
      assert.ok((trusted?.varietyCauses as string[]).some((cause) => cause.includes("repertório deliverable")), "retry recebe a causa");
      return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "demonstração", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
    }
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Mostre o cós elástico com cordão para explicar como o cós elástico com cordão ajuda no ajuste"], script: "s", cta: "Confira as condições atuais na página do produto." }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-mech1", name: "Calça Duna", description: "Calça Duna, cós elástico com cordão", facts: { features: ["cós elástico com cordão"] }, targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(planCalls, 2, "exactly one causal plan retry");
  assert.equal(result.briefs.length, 1);
  assert.equal(result.reports[0].decision, "PASS");
});

test("ADR-020/mechanism: objection persistente → GEN-VARIETY fail-closed sem chamadas de brief", async () => {
  let planCalls = 0;
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") {
      planCalls += 1;
      return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "quebra de objeção de tamanho", noveltyTargets: ["n"] }] };
    }
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls += 1; return { items: [] }; }
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-mech2", name: "Calça Duna", description: "Calça Duna, cós elástico com cordão", facts: { features: ["cós elástico com cordão"] }, targetContentCount: 1, router }),
    (error: unknown) => {
      const e = error as { code?: string };
      assert.equal(e.code, "GEN-VARIETY");
      return true;
    },
  );
  assert.equal(planCalls, 2, "exactly one plan retry before failing closed");
  assert.equal(briefCalls, 0, "nenhuma chamada de briefing");
});
test("ADR-020/blocker2: pool elegível vazio (skill controlada) → GEN-PATTERN field hookMechanism antes de plano e brief", async () => {
  let planCalls = 0;
  let briefCalls = 0;
  // Skill controlada: único hook elegível carrega claim técnico sem evidência →
  // pool elegível sem NENHUM hook deliverable. Catálogo divergente do global é
  // coberto pela mesma lista (eligibleHookPatterns computada uma vez).
  const emptyHookSkill = {
    ...TIKTOK_COMMERCE_SKILL,
    creativeCatalog: {
      version: "test-empty-1",
      hooks: [{ id: "hook-test-empty", type: "hook", category: "general", categoryScope: "global", source: "test", text: "Aguenta 5 kg em qualquer uso." }],
      ctas: TIKTOK_COMMERCE_SKILL.creativeCatalog.ctas,
    },
  } as unknown as PlatformSkill;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") { return puBase({ evidenceRefs: ["product:name"] }); }
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) }; }
    if (task === "STRATEGY_SYNTHESIS") { return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] }; }
    if (task === "CONTENT_PLAN_GENERATION") { planCalls += 1; return {}; }
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls += 1; return {}; }
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-empty-pool", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router, skill: emptyHookSkill }),
    (error: unknown) => {
      const e = error as { code?: string; field?: string };
      assert.equal(e.code, "GEN-PATTERN");
      assert.equal(e.field, "hookMechanism");
      return true;
    },
  );
  assert.equal(planCalls, 0, "zero chamadas CONTENT_PLAN_GENERATION");
  assert.equal(briefCalls, 0, "zero chamadas CONTENT_BRIEF_GENERATION");
});
test("ADR-020 adendo 2 + ADR-021: factRef fora do snapshot → GEN-SCHEMA por item, não substitui, parcial publica somente PASS (D=2/F=1)", async () => {
  let repairCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, (_, i) => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: `s${i}`, confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 3, opportunities: [
      { commercialObjective: "c", angle: "a1", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] },
      { commercialObjective: "c", angle: "a2", coreMessage: "m", hookMechanism: "teste demonstrativo do tecido", noveltyTargets: ["n"] },
      { commercialObjective: "c", angle: "a3", coreMessage: "m", hookMechanism: "mostrando o resultado no tecido", noveltyTargets: ["n"] },
    ] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [
      { angle: "a1", hook: "h1", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Suporta 999 kg", cta: "c1" },
      { angle: "a2", hook: "h2", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Tecido respiravel", cta: "c2" },
      { angle: "a3", hook: "h3", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Tecido respiravel", cta: "c3" },
    ] };
    if (task === "CONTENT_BRIEF_REPAIR") { repairCalls += 1; return { angle: "a1", hook: "h2", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRef": "fact-inexistente", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }], script: "Tecido respiravel", cta: "c2" }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-factref", name: "Produto", description: "Tecido respirável", targetContentCount: 3, router: withInternalCuration(router) });
  assert.equal(repairCalls, 2, "2 rounds, cada um tentando o item");
  assert.equal(result.briefs.length, 2, "somente itens PASS são entregues");
  assert.ok(result.partial, "job fecha SUCCEEDED_PARTIAL");
  assert.equal(result.partial?.expectedCount, 3);
  assert.equal(result.partial?.deliveredCount, 2);
  assert.equal(result.partial?.failedCount, 1);
  assert.equal(result.partial?.failedItems.length, 1);
  assert.equal(result.partial?.failedItems[0].reason, "HARD_GATE");
  assert.equal(result.partial?.failedItems[0].position, 1);
  assert.ok(result.partial?.failedItems[0].checkCodes.includes("unverified_claim"), "claim sem evidência gera unverified_claim");
  assert.deepEqual(result.briefOpportunityPositions, [1, 2], "entregues mantêm as oportunidades originais");
  assert.deepEqual(result.memorySignals.deliveredHookMechanisms, ["teste demonstrativo do tecido", "mostrando o resultado no tecido"], "mecanismos dos D entregues para o planner evitar repetição");
  assert.equal((result.memorySignals.deliveredCtaFunctions as string[]).length, 2);
  assert.deepEqual(result.memorySignals.deliveredAngles, ["a2", "a3"]);
  const repairedEvents = collectJobEvents().map((line) => JSON.parse(line) as Record<string, unknown>).filter((event) => event.event === "capability.failed" && event.task === "CONTENT_BRIEF_REPAIR");
  assert.ok(repairedEvents.length >= 2, "falhas do repair por item ficam na telemetria");
});

// Gate 6 (item 4): fronteira do teto de falhas — F == PARTIAL_FAILURE_CAP (2)
// fecha SUCCEEDED_PARTIAL declarado; F > teto falha fechado (SPEC slice-003:213),
// mesmo com itens aprovados. Repair determinístico nunca converge os itens
// reprovados (claim "Suporta 999 kg" persiste após CONTENT_BRIEF_REPAIR).
test("PARTIAL_FAILURE_CAP: F == 2 fecha parcial declarado; F == 3 falha GEN-REPAIR-EXHAUSTED mesmo com aprovados", async () => {
  const pipelineRouter = (count: number, failing: number) => ({
    describe,
    complete: async (task: string) => {
      if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: count }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
      if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
      if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: count, opportunities: Array.from({ length: count }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstração direta", "teste demonstrativo do tecido", "mostrando o resultado no tecido", "prova de resistência do tecido"][i % 4], noveltyTargets: ["n"] })) };
      if (task === "CONTENT_BRIEF_GENERATION") return { items: Array.from({ length: count }, (_, i) => ({
        angle: `a${i + 1}`,
        hook: `h${i + 1}`,
        development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"],
        script: i < failing ? "Suporta 999 kg" : "Tecido respiravel",
        cta: `c${i + 1}`,
      })) };
      if (task === "CONTENT_BRIEF_REPAIR") return { angle: "a", hook: "h2", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRef": "product:description", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }], script: "Suporta 999 kg", cta: "c2" };
      return {};
    },
  });
  // F == teto: D=1, F=2 → SUCCEEDED_PARTIAL declarado (dentro do teto).
  const dentro = await runFirstGeneration({ productId: "p", jobId: "j-cap-2", name: "Produto", description: "Tecido respirável", targetContentCount: 3, router: withInternalCuration(pipelineRouter(3, 2)) });
  assert.equal(dentro.briefs.length, 1);
  assert.ok(dentro.partial, "F == PARTIAL_FAILURE_CAP ainda fecha parcial");
  assert.equal(dentro.partial?.expectedCount, 3);
  assert.equal(dentro.partial?.deliveredCount, 1);
  assert.equal(dentro.partial?.failedCount, 2);
  assert.equal(dentro.partial?.failedItems.length, 2);
  // F > teto: D=1, F=3 → FAILED GEN-REPAIR-EXHAUSTED, nunca parcial.
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-cap-3", name: "Produto", description: "Tecido respirável", targetContentCount: 4, router: withInternalCuration(pipelineRouter(4, 3)) }),
    (error: unknown) => {
      const e = error as { code?: string; detail?: { expected?: number; received?: number; task?: string } };
      assert.equal(e.code, "GEN-REPAIR-EXHAUSTED");
      assert.equal(e.detail?.expected, 4);
      assert.equal(e.detail?.received, 1);
      assert.notEqual(e.detail?.task, "CONTENT_QUALITY_JUDGE");
      assert.equal(e.detail?.task, "HARD_GATE");
      return true;
    },
  );
});

// Semantic REVIEW is advisory: an unsuccessful repair falls back to the
// original part and does not create a partial result.
test("semantic REVIEW sem repair preserva o item e mantém DRAFT completo", async () => {
  const checkoutCtas = ["Entra no carrinho e confere as condições atuais.", "Toque no carrinho para ver o pedido completo."];
  const briefFor = (position: number) => ({
    angle: `a${position}`,
    hook: `Gancho ${position}`,
    development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"],
    script: "Tecido respiravel",
    cta: position === 1 ? checkoutCtas[0] : position === 5 ? checkoutCtas[1] : `cta ${position}`,
  });
  const judgeReview = {
    parts: qualityPass.parts.map((part) => part.part === "script" ? { ...part, status: "REVIEW", reason: "unclear" } : part),
  };
  let briefCalls = 0;
  const judgedReview: unknown[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 6 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 6, opportunities: Array.from({ length: 6 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstração direta", "teste demonstrativo do tecido", "mostrando o resultado no tecido", "prova de resistência do tecido"][i % 4], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 2][briefCalls - 1];
      return { items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
    }
    if (task === "CONTENT_SCENE_IDEAS") {
      const trusted = recordOf(input?.trustedContext);
      const brief = recordOf(trusted?.brief);
      const detail = Array.isArray(brief?.development) && typeof brief.development[0] === "string"
        ? brief.development[0]
        : String(brief?.hook ?? "produto");
      return { scenes: [{ description: `Mostre ${detail}` }, { description: `Pegue o produto e mostre ${detail}` }] };
    }
    if (task === "CONTENT_QUALITY_JUDGE") {
      return {
        audits: judgeItems(input).map(({ contentId }) => {
          if (contentId === "j-content-6") judgedReview.push(contentId);
          return { contentId, parts: contentId === "j-content-6" ? judgeReview.parts : qualityPass.parts };
        }),
      };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 6, router });
  assert.equal(briefCalls, 2, "batches 4+2");
  assert.equal(judgedReview.length, 1, "judge marca exatamente o item alvo como REVIEW");
  assert.equal(result.briefs.length, 6, "REVIEW sem repair não remove o item");
  assert.equal(result.partial, null, "fallback semântico não cria partial");
  assert.equal(result.qualityAudits.length, 6);
});

test("dois REVIEW: repair inválido deixa somente o candidato objetivo inválido no partial", async () => {
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [
      { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] },
      { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] },
    ] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 2, opportunities: [
      { commercialObjective: "c", angle: "a1", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] },
      { commercialObjective: "c", angle: "a2", coreMessage: "m", hookMechanism: "prova de resistência do tecido", noveltyTargets: ["n"] },
    ] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [1, 2].map((i) => ({ angle: `a${i}`, hook: `Gancho ${i}`, development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Tecido respiravel", cta: `cta ${i}` })) };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE") {
      const items = recordOf(input?.trustedContext)?.items as Array<Record<string, unknown>>;
      return { audits: items.map(({ contentId }) => ({ contentId, parts: qualityPass.parts.map((part) => part.part === "hook" ? { ...part, status: "REVIEW", reason: "unclear" } : part) })) };
    }
    if (task === "CONTENT_PART_REPAIR") {
      const items = recordOf(input?.trustedContext)?.items as Array<Record<string, unknown>>;
      return { items: items.map(({ contentId }) => ({ contentId, content: String(contentId).endsWith("content-1") ? "Suporta 999 kg" : "Gancho reparado" })) };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-two-review", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router });
  assert.deepEqual(result.briefs.map(({ contentId }) => contentId), ["j-two-review-content-2"]);
  assert.equal(result.partial?.failedCount, 1);
  assert.deepEqual(result.partial?.failedItems.map(({ contentId }) => contentId), ["j-two-review-content-1"]);
  assert.equal(result.partial?.failedItems[0].reason, "HARD_GATE");
  assert.deepEqual(result.partial?.failedItems[0].issues, ["composition_rejected"]);
});

// ADR-025 §2: judge em lote — 5 Contents viram 2 chamadas (chunks de 3 e 2,
// JUDGE_BATCH_MAX); a identidade da resposta é o contentId (ordem embaralhada é
// aceita) e um lote malformado preserva os itens sem criar partial.
test("ADR-025: judge em lote (3+2) com identidade por contentId; lote malformado faz fallback", async () => {
  const briefFor = (position: number) => ({
    angle: `a${position}`,
    hook: `Gancho ${position}`,
    development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  let judgeCalls = 0;
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 5 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstração direta", "teste demonstrativo do tecido", "mostrando o resultado no tecido", "prova de resistência do tecido"][i % 4], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
    }
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE") {
      judgeCalls += 1;
      const items = judgeItems(input);
      judgeCallSizes.push(items.length);
      if (judgeCalls === 2) return { audits: [...items.map(({ contentId }) => ({ contentId, parts: qualityPass.parts })), { contentId: "j-content-extra", parts: qualityPass.parts }] };
      // ordem embaralhada: identidade é o contentId, não a posição
      return { audits: [...items].reverse().map(({ contentId }) => ({ contentId, parts: qualityPass.parts })) };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 5, router });
  assert.deepEqual(judgeCallSizes, [3, 2], "chunks de 3 e 2 (JUDGE_BATCH_MAX)");
  assert.equal(result.briefs.length, 5, "lote malformado mantém os 2 itens em fallback");
  assert.equal(result.partial, null, "falha semântica de lote não cria partial");
});

// ADR-025 §3: repair em lote agrupa SOMENTE a mesma QualityPart (hook:
// 3+2 por REPAIR_BATCH_MAX), o conjunto exato de contentIds é ecoado, os itens
// reparados não voltam ao judge e o job fecha SUCCEEDED.
test("ADR-025: repair em lote da mesma parte (hook 3+2), sem re-judge", async () => {
  const briefFor = (position: number) => ({
    angle: `a${position}`,
    hook: `Gancho ${position}`,
    development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 5 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstração direta", "teste demonstrativo do tecido", "mostrando o resultado no tecido", "prova de resistência do tecido"][i % 4], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
    }
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE") {
      const items = judgeItems(input);
      judgeCallSizes.push(items.length);
      const parts = qualityPass.parts.map((part) => part.part === "hook" ? { ...part, status: "REVIEW", reason: "unclear" } : part);
      return { audits: items.map(({ contentId }) => ({ contentId, parts })) };
    }
    if (task === "CONTENT_PART_REPAIR") {
      const context = recordOf(input?.trustedContext);
      const items = Array.isArray(context?.items) ? context.items as Array<Record<string, unknown>> : [];
      repairCallSizes.push(items.length);
      return { items: items.map(({ contentId }) => ({ contentId, content: `Gancho reparado do ${contentId}` })) };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 5, router });
  assert.deepEqual(judgeCallSizes, [3, 2], "judge único em chunks de 3 e 2");
  assert.deepEqual(repairCallSizes, [3, 2], "hook em chunks de 3 e 2 (REPAIR_BATCH_MAX.hook)");
  assert.equal(result.briefs.length, 5, "todos os itens reparados e aprovados");
  assert.ok(!result.partial, "SUCCEEDED completo");
  assert.ok(result.briefs.every(({ hook }) => String(hook).startsWith("Gancho reparado do j-content-")));
  assert.deepEqual(
    result.briefs.map(({ development, script, cta }) => ({ development, script, cta })),
    Array.from({ length: 5 }, (_, i) => ({ development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Tecido respiravel", cta: `cta ${i + 1}` })),
    "somente a parte marcada é reparada; partes PASS permanecem intactas",
  );
  assert.equal(result.qualityRepairs.filter(({ part }) => part === "hook").length, 5);
});

// ADR-025 §1/§3: envelope de repair malformado (ID extra) NÃO aprova os itens
// do lote nem derruba os irmãos — as partes originais permanecem e publicam.
test("ADR-025: envelope de repair malformado preserva fallback sem partial", async () => {
  const briefFor = (position: number) => ({
    angle: `a${position}`,
    hook: `Gancho ${position}`,
    development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 5 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstração direta", "teste demonstrativo do tecido", "mostrando o resultado no tecido", "prova de resistência do tecido"][i % 4], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
    }
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE") {
      const items = judgeItems(input);
      judgeCallSizes.push(items.length);
      return {
        audits: items.map(({ contentId }) => ({
          contentId,
          parts: Number(String(contentId).slice(-1)) <= 3
            ? qualityPass.parts
            : qualityPass.parts.map((part) => part.part === "hook" ? { ...part, status: "REVIEW", reason: "unclear" } : part),
        })),
      };
    }
    if (task === "CONTENT_PART_REPAIR") {
      const context = recordOf(input?.trustedContext);
      const items = Array.isArray(context?.items) ? context.items as Array<Record<string, unknown>> : [];
      repairCallSizes.push(items.length);
      return { items: [...items.map(({ contentId }) => ({ contentId, content: `Gancho do ${contentId}` })), { contentId: "j-content-extra", content: "extra" }] };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 5, router });
  assert.deepEqual(judgeCallSizes, [3, 2]);
  assert.deepEqual(repairCallSizes, [2], "uma tentativa de repair para o lote REVIEW");
  assert.equal(result.briefs.length, 5, "fallback preserva os itens 4 e 5");
  assert.equal(result.partial, null, "falha semântica não cria partial");
});

// ADR-025 §3: limites por parte — development agrupa no máximo 2 (chunks 2+1)
// e scenes é sempre individual (1 por chamada), mesmo com 3 itens pendentes.
test("ADR-025: repair de development agrupa 2+1 e scenes é individual", async () => {
  const briefFor = (position: number) => ({
    angle: `a${position}`,
    hook: `Gancho ${position}`,
    development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 3, opportunities: Array.from({ length: 3 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstração direta", "teste demonstrativo do tecido", "mostrando o resultado no tecido"][i], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: Array.from({ length: 3 }, (_, offset) => briefFor(offset + 1)) };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE") {
      const items = judgeItems(input);
      judgeCallSizes.push(items.length);
      const parts = qualityPass.parts.map((part) => part.part === "development" || part.part === "scenes" ? { ...part, status: "REVIEW", reason: "unclear" } : part);
      return { audits: items.map(({ contentId }) => ({ contentId, parts })) };
    }
    if (task === "CONTENT_PART_REPAIR") {
      const context = recordOf(input?.trustedContext);
      const items = Array.isArray(context?.items) ? context.items as Array<Record<string, unknown>> : [];
      repairCallSizes.push(items.length);
      return {
        items: items.map(({ contentId }) => ({
          contentId,
          content: String(context?.part) === "scenes"
            ? [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }]
            : ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"],
        })),
      };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 3, router });
  assert.deepEqual(judgeCallSizes, [3], "judge único");
  assert.deepEqual(repairCallSizes, [2, 1, 1, 1, 1], "development em 2+1 (REPAIR_BATCH_MAX.development); scenes sempre 1");
  assert.equal(result.briefs.length, 3);
  assert.ok(!result.partial);
});

// B-003-11/ADR-025: erro tipado porém FATAL no lote do judge (não provider/schema)
// repropaga e falha o job — nunca vira SUCCEEDED_PARTIAL silencioso.
test("ADR-025: erro fatal do judge (não isolável) repropaga fail-closed", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Tecido respiravel", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE") throw Object.assign(new Error("falha de datasource no judge"), { code: "GEN-DATASOURCE" });
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => error instanceof GenerationError && error.code === "GEN-DATASOURCE",
  );
});
test("ADR-020 adendo 2: partes plausíveis NÃO autorizam texto falho (gate é a autoridade)", async () => {
  let repairCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Suporta 999 kg", cta: "c" }] };
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls += 1;
      // Partes coerentes, mas o TEXT continua com claim objetivo sem evidência:
      // o gate deve continuar rejeitando o item (nunca autorizado pelas partes).
      return { angle: "a", hook: "h2", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel suporta 999 kg", "action": "Destaque", "factRef": "product:description", "rationale": "para explicar como o tecido respiravel suporta 999 kg", "context": "no uso" }], script: "s", cta: "c2" };
    }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j-parts-lie", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) }), (error: unknown) => {
    const e = error as { code?: string };
    assert.equal(e.code, "GEN-REPAIR-EXHAUSTED");
    return true;
  });
  assert.equal(repairCalls, 2);
  assert.ok(collectJobEvents().some((line) => JSON.parse(line).gateReports?.[0]?.decision === "REPAIR" && JSON.parse(line).gateReports?.[0]?.issues?.includes("claim sem suporte em evidência")));
});

test("ADR-020 adendo 2: developmentRequirements chegam ao brief MID e ao repair HIGH; repairContrast passa no predicate", async () => {
  const contexts: Array<{ task: string; trusted: Record<string, unknown> }> = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    const trusted = recordOf(input?.trustedContext);
    if (task === "CONTENT_BRIEF_GENERATION" || task === "CONTENT_BRIEF_REPAIR")
      contexts.push({ task, trusted: trusted ?? {} });
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Suporta 999 kg", cta: "c" }] };
    if (task === "CONTENT_BRIEF_REPAIR") return { angle: "a", hook: "h2", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRef": "product:description", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }], script: "s", cta: "c2" };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-reqs", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(result.reports[0].decision, "PASS");
  for (const { task, trusted } of contexts) {
    const requirements = recordOf(trusted.developmentRequirements);
    assert.ok(requirements, `requirements presentes em ${task}`);
    assert.ok(Array.isArray(requirements.allowedActionStems) && requirements.allowedActionStems.includes("destac"));
    assert.deepEqual(requirements.connectors, ["para", "porque", "pois", "assim"]);
    assert.equal(requirements.noShotList, true);
    const factRefs = requirements.factRefs as Array<Record<string, unknown>>;
    assert.ok(factRefs.every((fact) => typeof fact.ref === "string" && Array.isArray(fact.terms)));
    assert.ok(!factRefs.some(({ ref }) => ref === "product:name"));
  }
  const repair = contexts.find(({ task }) => task === "CONTENT_BRIEF_REPAIR");
  if (!repair) throw new Error("contexto do repair não capturado");
  const contrast = recordOf(repair.trusted.repairContrast);
  assert.ok(contrast, "repairContrast per-item presente");
  assert.equal(validDevelopmentPoint(String(contrast.actionWithReason), buildEvidenceCatalog({ name: "Produto", description: "Tecido respirável", facts: {} })), true, "contraste pré-validado pelo predicado do gate");
});

test("ADR-020 adendo 2: saída inicial permanece string[] com exact-N e IDs estáveis", async () => {
  let genCalls = 0;
  let repairCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 2, opportunities: [{ commercialObjective: "c1", angle: "a1", coreMessage: "m1", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }, { commercialObjective: "c2", angle: "a2", coreMessage: "m2", hookMechanism: "descoberta", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { genCalls += 1; return { items: [{ angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Suporta 999 kg", cta: "c" }, { angle: "b", hook: "h2", development: ["Mostre o cós elástico com cordão para explicar como o cós elástico com cordão ajuda no ajuste"], script: "Suporta 999 kg", cta: "c2" }] }; }
    if (task === "CONTENT_BRIEF_REPAIR") { repairCalls += 1; return { angle: "r", hook: `hr ${repairCalls}`, development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRef": "product:description", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }], script: `s ${repairCalls}`, cta: `cta seguro ${repairCalls}` }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-strings", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router: withInternalCuration(router) });
  assert.equal(genCalls, 1);
  assert.equal(repairCalls, 2, "dois itens reprovados, um repair por item");
  assert.equal(result.briefs.length, 2);
  assert.deepEqual(result.briefs.map((brief) => brief.contentId), ["j-strings-content-1", "j-strings-content-2"]);
  assert.ok(result.briefs.every((brief) => Array.isArray(brief.development) && brief.development.every((point) => typeof point === "string")), "development canônico permanece string[]");
  assert.ok(result.reports.every((report) => report.decision === "PASS"));
});
