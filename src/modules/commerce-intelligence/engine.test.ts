// Suite de regressão V1 (ADR-029): roteamento fixado em ENGINE_V2=0 — o
// caminho V2 tem suíte própria (engine-v2-routing / engine-v2-contract).

import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceCatalog, createCapabilityTracker, runFirstGeneration } from "./engine";
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
const briefOk = { angle: "demonstração", hook: "Veja", development: [{ text: "Mostre o tecido respirável para explicar como o tecido respirável afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Mostre o tecido respirável para explicar como o tecido respirável afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Tecido respirável", cta: "c" };
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
      return router.complete(task, input, signal, onMetrics);
    },
  };
}
test.beforeEach(() => { process.env.ENGINE_V2 = "0"; });
test.afterEach(() => { process.env.ENGINE_V2 = "0"; });

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
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [briefOk] };
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
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.equal(mappingCalls, 2, "mapping retried once when envelope lacked opportunities");
  assert.equal((result.strategy as { opportunities: unknown[] }).opportunities.length, 1);
});
// AC Etapa 2 14 (Tarefa 5): retry dos faltantes com reuseStrategy pula
// STRATEGY_SYNTHESIS, re-canonicaliza a Strategy ACTIVE para o novo jobId e
// planeja apenas os faltantes (memória exclui mecanismos já entregues).



test("repairs brief batch cardinality divergence via one retry preserving exact-N", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; if (briefCalls === 1) return { items: [] }; return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }] }; }
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }, { angle: "a2", hook: "h2", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto de novo", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string }; return e?.code === "GEN-SCHEMA"; });
  assert.equal(briefCalls, 2, "exactly one retry before failing closed");
});

test("development remains required in the brief contract", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", script: "Mostre o Produto", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string; detail?: Record<string, unknown> }; return e?.code === "GEN-SCHEMA" && e?.detail?.task === "CONTENT_BRIEF_GENERATION" && e?.detail?.retried === true; });
  assert.equal(briefCalls, 2, "missing development retries once");
});
test("GEN-REPAIR-EXHAUSTED carries sanitized gate summary without brief payload", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o uso do produto para explicar o uso no dia a dia", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o uso do produto para explicar o uso no dia a dia", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "SEGREDO_DO_BRIEFING suporta 7 kg comprovados", cta: "c" }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 10 }, (_, k) => ({ relevantCapabilities: ["cap"], benefits: [`benefício distinto ${k + 1}`], proofOptions: ["product:description"], sellingArgument: `argumento ${k + 1}`, confidence: 0.9, evidenceRefs: ["product:description"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: Array.from({ length: 10 }, (_, i) => ({ commercialObjective: `c${i}`, angle: `a${i}`, coreMessage: `m${i}`, hookMechanism: ["demonstration", "discovery", "problem", "price-value", "other"][i % 5], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      genCalls++;
      const batch = input as { trustedContext?: { realizations?: unknown[] } } | undefined;
      const n = Array.isArray(batch?.trustedContext?.realizations) ? batch!.trustedContext!.realizations.length : 1;
      // Rodada inicial: claim numérico sem evidência → todos os itens exigem repair factual.
      return { developmentSchemaVersion: 2, items: Array.from({ length: n }, () => ({ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Suporta 999 kg", cta: "c" })) };
    }
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls++;
      // Repair por item: saída única, campos distintos por chamada (variedade do conjunto).
      return { developmentSchemaVersion: 2, angle: `ang ${repairCalls}`, hook: `hook ${repairCalls}`, development: [{ "text": `Destaque o tecido respiravel ${repairCalls} para explicar como o tecido respiravel ${repairCalls} afeta o uso`, "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel afeta o uso" }, { "text": `Destaque o tecido respiravel ${repairCalls} para explicar como o tecido respiravel ${repairCalls} afeta o uso`, "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel afeta o uso" }], script: `script distinto ${repairCalls}`, cta: `cta distinto ${repairCalls}` };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-repair-many", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 10, router: withInternalCuration(router) });
  assert.equal(genCalls, 3, "3 batches iniciais (4/4/2)");
  assert.equal(repairCalls, 10, "10 itens reprovados, uma chamada por item; round 2 desnecessário");
  assert.equal(result.briefs.length, 10, "exact-N preservado");
  assert.deepEqual(result.briefs.map((b) => b.contentId), Array.from({ length: 10 }, (_, i) => `j-repair-many-content-${i + 1}`), "posição/IDs estáveis após repair per-item");
  assert.ok(result.reports.every((report) => report.decision === "PASS"));
  assert.equal(result.repairs, 10);
  const repairEvents = result.capabilities.filter((cap) => cap.task === "CONTENT_BRIEF_REPAIR");
  assert.equal(repairEvents.length, 10, "cada chamada de repair é um CapabilityEvent próprio");
  assert.ok(repairEvents.every((cap) => cap.tier === "HIGH"), "repair roteado em HIGH");
});
test("capability events carry cardinality policy version on success", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }] };
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
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "demonstration", noveltyTargets: ["angle"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [briefOk] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [
        { relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] },
      ] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 2, opportunities: [{ commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "demonstration", noveltyTargets: ["angle"] }, { commercialObjective: "vender", angle: "objeção", coreMessage: "ajuste", hookMechanism: "discovery", noveltyTargets: ["angle"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      return { developmentSchemaVersion: 2, items: [
        { angle: "a", hook: "h1", development: [{ text: "Destaque o cós elástico com cordão na câmera para explicar o ajuste na cintura", action: "Destaque", rationale: "para mostrar o ajuste na cintura", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o cós elástico com cordão na câmera para explicar o ajuste na cintura", action: "Destaque", rationale: "para mostrar o ajuste na cintura", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "s1", cta: "c1" },
        { angle: "b", hook: "h2", development: [{ text: "Mostre o cós elástico com cordão, ajuste a cintura para explicar o uso", action: "Mostre", rationale: "para mostrar o ajuste na cintura", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Mostre o cós elástico com cordão, ajuste a cintura para explicar o uso", action: "Mostre", rationale: "para mostrar o ajuste na cintura", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "s2", cta: "Aproveita o frete grátis que apareceu na sua conta." },
      ] };
    }
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls += 1;
      captured.push(recordOf(input?.trustedContext)?.repairChecklist);
      const structuredDuna = [{ "text": "Mostre o cós elástico com cordão da calça para conectar o cordão do cós elástico", "action": "Mostre", "factRefs": ["fact:features"], "cta": "Confira o produto na página.", "rationale": "para conectar o cordão e mostrar o cós elástico" }, { "text": "Destaque o cordão do cós elástico para explicar o ajuste", "action": "Destaque", "factRefs": ["fact:features"], "cta": "Confira o produto na página.", "rationale": "para mostrar o cordão e o cós elástico" }];
      return repairCalls === 1
        ? { developmentSchemaVersion: 2, angle: "a", hook: "h1b", development: structuredDuna, script: "s1b", cta: "Confira o produto na página." }
        : { developmentSchemaVersion: 2, angle: "b", hook: "h2b", development: structuredDuna, script: "s2b", cta: "Vale dar uma olhada na página do produto para comparar." };
    }
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j-rc", name: "Calça Duna", description: "Calça Duna, cós elástico com cordão", facts: { features: ["cós elástico com cordão"] }, creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 2, router: withInternalCuration(router) });
  // E5: ambos os itens seguem repair por motivos HARD — c1: shotList (câmera
  // no texto, matriz E5) e c3: frete grátis sem evidência (CTA factual).
  // Desenvolvimento declarativo sozinho seria apenas advisory.
  assert.equal(repairCalls, 2, "dois itens HARD vão a repair (shotList + claim)");
  assert.deepEqual(recordOf(captured[0]), { developmentAction: true }, "c1: checklist (shotList hard)");
  assert.deepEqual(recordOf(captured[1]), { removeUnsupportedClaim: true }, "c3: checklist por item (frete grátis sem evidência)");
});







test("ADR-020 adendo 2 + ADR-021: factRef fora do snapshot → GEN-SCHEMA por item, não substitui, parcial publica somente PASS (D=2/F=1)", async () => {
  let repairCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 3, opportunities: [
        { relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] },
      ] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [
      { angle: "a1", hook: "h1", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Suporta 999 kg", cta: "c1" },
      { angle: "a2", hook: "h2", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Tecido respiravel", cta: "c2" },
      { angle: "a3", hook: "h3", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Tecido respiravel", cta: "c3" },
    ] };
    if (task === "CONTENT_BRIEF_REPAIR") { repairCalls += 1; return { angle: "a1", hook: "h2", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRefs": ["fact-inexistente"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }, { "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRefs": ["fact-inexistente"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }], script: "Tecido respiravel", cta: "c2" }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-factref", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 3, router: withInternalCuration(router) });
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
  // V2: mecanismos entregues derivam do Planner (não de seed fixa) — os itens
  // D são as posições 2..3 do portfolio (content-1 falha por factRef órfã).
  const expectedMechanisms = result.plannedV2!.slice(1, 3).map((item) => item.hookMechanism).sort();
  assert.deepEqual([...(result.memorySignals.deliveredHookMechanisms as string[])].sort(), expectedMechanisms, "mecanismos canônicos dos D entregues para o planner evitar repetição");
  assert.equal((result.memorySignals.deliveredCtaFunctions as string[]).length, 2);
  const expectedAngles = result.plannedV2!.slice(1, 3).map((item) => item.angle).sort();
  assert.deepEqual([...(result.memorySignals.deliveredAngles as string[])].sort(), expectedAngles, "ângulos entregues derivam das oportunidades planejadas");
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
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
      if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
      if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: count, opportunities: Array.from({ length: count }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstration", "problem", "discovery", "price-value", "other"][i % 5], noveltyTargets: ["n"] })) };
      if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: Array.from({ length: count }, (_, i) => ({
        angle: `a${i + 1}`,
        hook: `h${i + 1}`,
        development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }],
        script: i < failing ? "Suporta 999 kg" : "Tecido respiravel",
        cta: `c${i + 1}`,
      })) };
      if (task === "CONTENT_BRIEF_REPAIR") return { developmentSchemaVersion: 2, angle: "a", hook: "h2", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel afeta o uso" }, { "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel afeta o uso" }], script: "Suporta 999 kg", cta: "c2" };
      return {};
    },
  });
  // F == teto: D=1, F=2 → SUCCEEDED_PARTIAL declarado (dentro do teto).
  const dentro = await runFirstGeneration({ productId: "p", jobId: "j-cap-2", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 3, router: withInternalCuration(pipelineRouter(3, 2)) });
  assert.equal(dentro.briefs.length, 1);
  assert.ok(dentro.partial, "F == PARTIAL_FAILURE_CAP ainda fecha parcial");
  assert.equal(dentro.partial?.expectedCount, 3);
  assert.equal(dentro.partial?.deliveredCount, 1);
  assert.equal(dentro.partial?.failedCount, 2);
  assert.equal(dentro.partial?.failedItems.length, 2);
  // F > teto: D=1, F=3 → FAILED GEN-REPAIR-EXHAUSTED, nunca parcial.
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-cap-3", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 4, router: withInternalCuration(pipelineRouter(4, 3)) }),
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
    hook: ["O problema do tecido respiravel no uso diario", "Descubra o conforto do tecido respiravel", "Demonstre como o tecido respiravel funciona", "Veja o valor pratico do tecido respiravel", "Um novo angulo para usar o tecido respiravel"][position - 1],
    development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }],
    script: "Tecido respiravel",
    cta: position === 1 ? checkoutCtas[0] : position === 5 ? "Confira os detalhes do produto antes de decidir." : `cta ${position}`,
  });
  const judgeReview = {
    parts: qualityPass.parts.map((part) => part.part === "script" ? { ...part, status: "REVIEW", reason: "unclear" } : part),
  };
  let briefCalls = 0;
  const judgedReview: unknown[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstration", "problem", "discovery", "price-value", "other"][i], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { developmentSchemaVersion: 2, items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
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
          if (contentId === "j-content-1") judgedReview.push(contentId);
          return { contentId, parts: contentId === "j-content-1" ? judgeReview.parts : qualityPass.parts };
        }),
      };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 5, router });
  assert.equal(briefCalls, 2, "batches 4+1");
  assert.equal(judgedReview.length, 1, "judge marca exatamente o item alvo como REVIEW");
  assert.equal(result.briefs.length, 5, "REVIEW sem repair não remove o item");
  assert.equal(result.partial, null, "fallback semântico não cria partial");
  assert.equal(result.qualityAudits.length, 5);
});

test("dois REVIEW: repair inválido deixa somente o candidato objetivo inválido no partial", async () => {
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [
        { relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] },
        { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] },
      ] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 2, opportunities: [
      { commercialObjective: "c", angle: "a1", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] },
      { commercialObjective: "c", angle: "a2", coreMessage: "m", hookMechanism: "discovery", noveltyTargets: ["n"] },
    ] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [1, 2].map((i) => ({ angle: `a${i}`, hook: `Gancho ${i}`, development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Tecido respiravel", cta: `cta ${i}` })) };
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
  const result = await runFirstGeneration({ creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, productId: "p", jobId: "j-two-review", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router });
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
    development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  let judgeCalls = 0;
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstration", "problem", "discovery", "price-value", "other"][i], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { developmentSchemaVersion: 2, items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
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
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 5, router });
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
    development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstration", "problem", "discovery", "price-value", "other"][i], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { developmentSchemaVersion: 2, items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
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
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 5, router });
  assert.deepEqual(judgeCallSizes, [3, 2], "judge único em chunks de 3 e 2");
  assert.deepEqual(repairCallSizes, [3, 2], "hook em chunks de 3 e 2 (REPAIR_BATCH_MAX.hook)");
  assert.equal(result.briefs.length, 5, "todos os itens reparados e aprovados");
  assert.ok(!result.partial, "SUCCEEDED completo");
  assert.ok(result.briefs.every(({ hook }) => String(hook).startsWith("Gancho reparado do j-content-")));
  assert.deepEqual(
    result.briefs.map(({ development, script, cta }) => ({ development, script, cta })),
    Array.from({ length: 5 }, (_, i) => ({ development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Tecido respiravel", cta: `cta ${i + 1}` })),
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
    development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstration", "problem", "discovery", "price-value", "other"][i], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { developmentSchemaVersion: 2, items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
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
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 5, router });
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
    development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }],
    script: "Tecido respiravel",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 3, opportunities: Array.from({ length: 3 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstration", "problem", "discovery"][i], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: Array.from({ length: 3 }, (_, offset) => briefFor(offset + 1)) };
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
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 3, router });
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
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Tecido respiravel", cta: "c" }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], sellingArgument: "durabilidade real", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], sellingArgument: "conforto em qualquer hora", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], sellingArgument: "leve para carregar todo dia", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], sellingArgument: "carrega sem esforço", confidence: 0.9, evidenceRefs: ["product:description"] }, { relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], sellingArgument: "pronto em segundos", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstration", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Suporta 999 kg", cta: "c" }] };
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls += 1;
      // Partes coerentes, mas o TEXT continua com claim objetivo sem evidência:
      // o gate deve continuar rejeitando o item (nunca autorizado pelas partes).
      return { angle: "a", hook: "h2", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel suporta 999 kg", "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel suporta 999 kg", "context": "no uso" }, { "text": "Destaque o tecido respiravel para explicar como o tecido respiravel suporta 999 kg", "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": "para explicar como o tecido respiravel suporta 999 kg", "context": "no uso" }], script: "s", cta: "c2" };
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





// ---- Usage real por tentativa (design 2026-09-18): tracker copia provider/usage do metrics ----

test("createCapabilityTracker copia provider/usage no evento de sucesso e de falha, por tentativa", async () => {
  const metricsWithUsage = { provider: "openai-compatible", model: "m1", reasoning: "low", providerStatus: 200, requestBytes: 10, trustedContextBytes: 5, externalBytes: 0, responseBytes: 20, durationMs: 5, usage: { inputTokens: 100, outputTokens: 40, reasoningTokens: 10, cachedTokens: 25 }, retry: 1 };
  let calls = 0;
  const router: ModelRouter = {
    describe,
    complete: async (_task, _input, _signal, onMetrics) => {
      calls += 1;
      if (onMetrics) onMetrics(calls === 1 ? { ...metricsWithUsage, retry: 0 } : { ...metricsWithUsage, providerStatus: 503, usage: undefined });
      if (calls === 2) throw new GenerationError("GEN-PROVIDER", "falha com usage ausente");
      return { ok: true };
    },
  };
  const tracker = createCapabilityTracker({ jobId: "j-usage", attempt: 1, router });
  await tracker.track("PRODUCT_UNDERSTANDING", {}, (onMetrics) => router.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, onMetrics));
  await tracker.track("PRODUCT_UNDERSTANDING", {}, (onMetrics) => router.complete("PRODUCT_UNDERSTANDING", { trustedContext: {} }, undefined, onMetrics)).catch(() => undefined);
  assert.equal(tracker.capabilities.length, 2, "uma tentativa efetiva por track");
  const success = tracker.capabilities[0]!;
  assert.equal(success.ok, true);
  assert.equal(success.provider, "openai-compatible");
  assert.deepEqual(success.usage, { inputTokens: 100, outputTokens: 40, reasoningTokens: 10, cachedTokens: 25 });
  assert.equal(success.retry, 0);
  const failure = tracker.capabilities[1]!;
  assert.equal(failure.ok, false);
  assert.equal(failure.usage, undefined, "falha sem usage do provider não inventa contadores");
  assert.equal(failure.provider, "openai-compatible");
});
