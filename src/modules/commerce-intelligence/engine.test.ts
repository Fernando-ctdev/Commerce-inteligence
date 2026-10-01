import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceCatalog, createCapabilityTracker, runFirstGeneration } from "./engine";
import { ctaTextFactualIssues, validDevelopmentPoint } from "./gates";
import { CARDINALITY_POLICY_VERSION } from "./contract";
import { collectJobEvents, resetJobEvents } from "./observability";
import type { ModelRouter, ProviderCallMetrics } from "./model-router";
import { GenerationError } from "./errors";
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls++; if (mappingCalls === 1) return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], analysis: "prosa sem opportunities" }; return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "s", angle: "b", coreMessage: "s", relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], commercialEffects: ["s"], evidenceRefs: ["product:name"], confidence: 0.9 }] }; }
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", script: "Mostre o Produto", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string; detail?: Record<string, unknown> }; return e?.code === "GEN-SCHEMA" && e?.detail?.task === "CONTENT_BRIEF_GENERATION" && e?.detail?.retried === true; });
  assert.equal(briefCalls, 2, "missing development retries once");
});
test("GEN-REPAIR-EXHAUSTED carries sanitized gate summary without brief payload", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
    return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }] };
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  // V2: Strategy/Plan são determinísticos — métricas provider por capability LLM viva.
  const mappingCap = result.capabilities.find((cap) => cap.task === "COMMERCIAL_OPPORTUNITY_MAPPING");
  assert.equal(mappingCap?.model, "mid-model", "modelo efetivo por capability");
  assert.equal(mappingCap?.reasoning, "low");
  assert.equal(mappingCap?.providerStatus, 200);
  assert.equal(mappingCap?.requestBytes, 1200);
  assert.equal(mappingCap?.trustedContextBytes, 600);
  assert.equal(mappingCap?.externalBytes, 2);
  assert.ok(typeof mappingCap?.durationMs === "number");
});
test("requires a provider outside explicit test fallback", async () => { await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1 }), /Provider não configurado/); });
test("repair of many rejected briefs is per-item on CONTENT_BRIEF_REPAIR/HIGH preserving positions and ids", async () => {
  let genCalls = 0;
  let repairCalls = 0;
  const router = { describe, complete: async (task: string, input?: unknown) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: Array.from({ length: 4 }, (_, k) => ({ commercialObjective: `argumento ${k + 1}`, angle: `benefício distinto ${k + 1}`, coreMessage: `argumento ${k + 1}`, relevantCapabilities: ["cap"], benefits: [`benefício distinto ${k + 1}`], proofOptions: ["product:description"], commercialEffects: [`argumento ${k + 1}`], evidenceRefs: ["product:description"], confidence: 0.9 })) };
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
  const result = await runFirstGeneration({ productId: "p", jobId: "j-repair-many", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 4, router: withInternalCuration(router) });
  assert.equal(genCalls, 1, "1 batch inicial (4 itens = batch único)");
  assert.equal(repairCalls, 4, "4 itens reprovados, uma chamada por item; round 2 desnecessário");
  assert.equal(result.briefs.length, 4, "exact-N preservado");
  assert.deepEqual(result.briefs.map((b) => b.contentId), Array.from({ length: 4 }, (_, i) => `j-repair-many-content-${i + 1}`), "posição/IDs estáveis após repair per-item");
  assert.ok(result.reports.every((report) => report.decision === "PASS"));
  assert.equal(result.repairs, 4);
  const repairEvents = result.capabilities.filter((cap) => cap.task === "CONTENT_BRIEF_REPAIR");
  assert.equal(repairEvents.length, 4, "cada chamada de repair é um CapabilityEvent próprio");
  assert.ok(repairEvents.every((cap) => cap.tier === "HIGH"), "repair roteado em HIGH");
});
test("capability events carry cardinality policy version on success", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: withInternalCuration(router) });
  assert.deepEqual([...new Set(result.capabilities.map((cap) => cap.task))].sort(), ["COMMERCIAL_OPPORTUNITY_MAPPING", "CONTENT_BRIEF_GENERATION", "CONTENT_QUALITY_JUDGE"]);
  assert.ok(result.capabilities.every((cap) => cap.cardinalityPolicyVersion === CARDINALITY_POLICY_VERSION), "todo CapabilityEvent persistido carrega a versão da política");
});
test("failed capability record and event carry cardinality policy version", async () => {
  resetJobEvents();
  const router = { describe, complete: async () => { throw new Error("boom"); } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }));
  const failed = collectJobEvents().map((line) => JSON.parse(line) as Record<string, unknown>).find((event) => event.event === "capability.failed");
  assert.equal(failed?.cardinalityPolicyVersion, CARDINALITY_POLICY_VERSION, "falha de capability registra a versão da política");
});

test("brief repair context carries per-item repairChecklist (Duna c1/c3 distinct)", async () => {
  let briefCalls = 0;
  let repairCalls = 0;
  const captured: unknown[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [
        { commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
        { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 },
        { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 },
        { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
      ] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
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
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
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
    script: "Mostre o Produto",
    cta: position === 1 ? checkoutCtas[0] : position === 5 ? "Confira os detalhes do produto antes de decidir." : `cta ${position}`,
  });
  const judgeReview = {
    parts: qualityPass.parts.map((part) => part.part === "script" ? { ...part, status: "REVIEW", reason: "unclear" } : part),
  };
  let briefCalls = 0;
  const judgedReview: unknown[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [
        { commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
        { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 },
        { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 },
        { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
      ] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [1, 2].map((i) => ({ angle: `a${i}`, hook: `Gancho ${i}`, development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: `cta ${i}` })) };
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
    script: "Mostre o Produto",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  let judgeCalls = 0;
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { developmentSchemaVersion: 2, items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
    }
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
    script: "Mostre o Produto",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { developmentSchemaVersion: 2, items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
    }
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
    Array.from({ length: 5 }, (_, i) => ({ development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Mostre o Produto", cta: `cta ${i + 1}` })),
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
    script: "Mostre o Produto",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { developmentSchemaVersion: 2, items: Array.from({ length: size }, (_, offset) => briefFor((briefCalls - 1) * 4 + offset + 1)) };
    }
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
    script: "Mostre o Produto",
    cta: `cta ${position}`,
  });
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return puBase({ evidenceRefs: ["product:name"] });
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: Array.from({ length: 3 }, (_, offset) => briefFor(offset + 1)) };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "s", angle: "b", coreMessage: "s", relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], commercialEffects: ["s"], evidenceRefs: ["product:name"], confidence: 0.9 }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "c" }] };
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
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "carrega sem esforço", angle: "peso leve no bolso", coreMessage: "carrega sem esforço", relevantCapabilities: ["cap"], benefits: ["peso leve no bolso"], proofOptions: ["product:description"], commercialEffects: ["carrega sem esforço"], evidenceRefs: ["product:description"], confidence: 0.9 }, { commercialObjective: "pronto em segundos", angle: "montagem rápida", coreMessage: "pronto em segundos", relevantCapabilities: ["cap"], benefits: ["montagem rápida"], proofOptions: ["product:description"], commercialEffects: ["pronto em segundos"], evidenceRefs: ["product:description"], confidence: 0.9 }] };
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
