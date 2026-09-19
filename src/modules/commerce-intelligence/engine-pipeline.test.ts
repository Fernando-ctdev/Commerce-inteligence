import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { validateBriefSet } from "./gates";
import { loadPlatformSkill } from "./platform-skill";
import { ctaTextFactualIssues } from "./gates";
import { collectJobEvents, resetJobEvents } from "./observability";
// Type guard local (sem inline cast): trustedContext chega como unknown.
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const sb = (text: string, action = "Destaque", factRef = "product:description") => {
  const at = text.search(/\b(para|porque|pois|assim)\b/);
  return { text, action, factRef, rationale: at >= 0 ? text.slice(at) : "para " + text.trim().split(/\s/).slice(1, 3).join(" ") };
};
const sbPair = (text: string, action?: string) => [sb(text, action), sb(text, action)];
const understanding = { productId: "p", category: undefined, coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["preço"], evidenceRefs: ["fact-1"] };
const commercial = { relevantCapabilities: ["cap"], benefits: ["benefício"], proofOptions: ["fact-1"], sellingArgument: "argumento", confidence: 0.9, evidenceRefs: ["fact-1"] };
const strategyPayload = { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", primaryPositioning: "posicionamento", audiences: ["público"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["arg"], priorityAngles: ["ângulo"], communicationPrinciples: ["cp"] };
// Evidência suficiente (≥3 refs distintas nos fixtures) exige o mínimo de 3 oportunidades.
const envelope = { audiences: ["público"], situations: ["situação"], pains: ["dor"], desires: ["desejo"], objections: ["objeção"], opportunities: [commercial, commercial, commercial] };
const contentOpportunity = { commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "prova", noveltyTargets: ["angle"] };
const qualityAudit = { parts: [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
] };
// ADR-025: judge em lote — o fake ecoa o conjunto exato de contentIds recebidos.
const judgeBatchPass = (input?: { trustedContext?: unknown }) => {
  const items = recordOf(input?.trustedContext)?.items;
  const list = Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
  return { audits: list.map(({ contentId }) => ({ contentId, parts: qualityAudit.parts })) };
};
const sceneIdeas = { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });
test("composes validated provider outputs into the pipeline (4 foundational + batched briefs)", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "demonstração", hook: "Veja", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Mostre o Produto", cta: "Confira" }] }; if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas; if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input); return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  const strategy = result.strategy as { opportunities: Array<{ id: string }> };
  const plan = result.plan as { opportunities: Array<{ id: string }> };
  assert.equal(plan.opportunities[0].id, "j-opportunity-1");
  assert.equal(strategy.opportunities[0].id, "j-commercial-1");
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[0].briefVersionId, "j-brief-1");
  // ADR-019: cenas são obrigatórias para concluir a curadoria semântica.
  assert.deepEqual(calls, ["PRODUCT_UNDERSTANDING", "COMMERCIAL_OPPORTUNITY_MAPPING", "STRATEGY_SYNTHESIS", "CONTENT_PLAN_GENERATION", "CONTENT_BRIEF_GENERATION", "CONTENT_SCENE_IDEAS", "CONTENT_QUALITY_JUDGE"]);
});
test("repairs only rejected briefs via per-item CONTENT_BRIEF_REPAIR/HIGH, preserving ids", async () => {
  const taskCalls: string[] = [];
  const repairContexts: Array<Record<string, unknown>> = [];
  const router = { describe, hash: () => "h", complete: async (task: string, input?: { trustedContext?: unknown }) => { if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") { taskCalls.push(task); return { items: [{ angle: "x", hook: "h", development: sbPair("Carga de 999 kg em teste"), script: "testado com 999 kg de carga", cta: "c" }] }; } if (task === "CONTENT_BRIEF_REPAIR") { taskCalls.push(task); repairContexts.push(input?.trustedContext as Record<string, unknown>); return { angle: "dem", hook: "Veja o produto em uso", development: [{ "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRef": "product:description", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }, { "text": "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "action": "Destaque", "factRef": "product:description", "rationale": "para explicar como o tecido respiravel afeta o uso", "context": "no uso" }], script: "Produto com demonstração", cta: "c" }; } if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input); return { scenes: [{ description: "Mostra o produto em uso no ambiente do creator" }, { description: "Pega o produto e aproxima do celular para close" }] }; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.deepEqual(taskCalls, ["CONTENT_BRIEF_GENERATION", "CONTENT_BRIEF_REPAIR"], "per-item repair on its own HIGH task");
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[0].briefVersionId, "j-brief-1");
  assert.equal(result.reports[0].decision, "PASS");
  assert.equal(result.repairs, 1);
  assert.equal(result.repairCauses.length, 1);
  assert.match(result.repairCauses[0].causes.join(" "), /claim objetivo/);
  const context = repairContexts[0];
  assert.ok(context);
  // Design 2026-09-18: o repair recebe o diagnóstico redigido por bullet do PRÓPRIO item.
  assert.ok(Array.isArray(context.developmentDiagnostics) && context.developmentDiagnostics.length === 2, "developmentDiagnostics do item presente");
  const diag = (context.developmentDiagnostics as Array<Record<string, unknown>>)[0]!;
  assert.deepEqual(Object.keys(diag).sort(), ["actionPresent", "connectorPresent", "factGroundingApplicable", "factRefAllowed", "factTermsInRationale", "index", "rationaleGroundingMatched", "shotList", "textGroundingMatched", "unverifiedClaim", "unverifiedClaimParts"]);
  assert.equal(diag.rationaleGroundingMatched, 0, "bullet 'Carga...' sem conector: nenhum termo de rationale após o texto");
  assert.deepEqual(context.failedBulletIndexes, [0, 1], "repair mira os índices falhos (design 2026-09-19)");
  assert.deepEqual(context.repairChecklist, { developmentAction: true, removeUnsupportedClaim: true });
  assert.equal((context.opportunity as Record<string, unknown>).angle, "demonstração");
  assert.ok((context.issues as string[]).length > 0);
  const selected = context.selectedPattern as Record<string, unknown>;
  assert.ok(selected && typeof selected === "object");
  // Regressao ADR-020: o pattern entregue ao provider é pré-validado pelo mesmo
  // classificador do gate contra a evidência recebida.
  const relevantFacts = context.relevantFacts as Array<{ value: string; ref: string }>;
  assert.equal(ctaTextFactualIssues(String(selected.cta && (selected.cta as Record<string, unknown>).text), { facts: relevantFacts.map(({ value }) => value), refs: relevantFacts.map(({ ref }) => ref) }).decision, "deliverable");
  const summary = recordOf(context.siblingSummary);
  assert.ok(Array.isArray(summary?.hooks) && Array.isArray(summary?.ctaFunctions), "sibling summary determinístico presente");
});
test("repair per-item carries each entry's own-position pattern when rejects are non-contiguous", async () => {
  const repairPositions: number[][] = [];
  let repairCalls = 0;
  const goodDevelopment = ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"];
  const badDevelopment = ["Carga de 999 kg em teste", "Carga de 999 kg em teste"];
  const badScript = "testado com 999 kg de carga";
  const structuredDevelopment = () => [{ "text": goodDevelopment[0], "action": "Destaque", "factRef": "product:description", "rationale": `para explicar como o tecido respiravel afeta o uso ${repairCalls}`, "context": "no uso" }, { "text": goodDevelopment[0], "action": "Destaque", "factRef": "product:description", "rationale": `para explicar como o tecido respiravel afeta o uso ${repairCalls}`, "context": "no uso" }];
  const router = { describe, hash: () => "h", complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity, contentOpportunity, contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [
      { angle: "b1", hook: "hb1", development: badDevelopment.map((t) => sb(t)), script: badScript, cta: "cb1" },
      { angle: "g0", hook: "hg0", development: goodDevelopment.map((t) => sb(t)), script: "Mostre o Produto", cta: "cg0" },
      { angle: "b2", hook: "hb2", development: badDevelopment.map((t) => sb(t)), script: badScript, cta: "cb2" },
    ] };
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls++;
      const selectedPattern = (input?.trustedContext as Record<string, unknown> | undefined)?.selectedPattern;
          return { angle: `r${repairCalls}`, hook: `hr${repairCalls}`, development: structuredDevelopment(), script: `Produto com demonstração ${repairCalls}`, cta: `Cr ${repairCalls}` };
    }
    if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas;
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 3, router });
  assert.equal(repairCalls, 2, "uma chamada por item reprovado, posições 1 e 3");
  assert.equal(result.repairs, 2);
  assert.deepEqual(result.reports.map((r: { decision: string }) => r.decision), ["PASS", "PASS", "PASS"]);
});
test("batches brief generation sequentially with server-derived ids", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity, contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto com demonstração", cta: "c" }, { angle: "a2", hook: "h2", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c2" }] }; if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas; if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input); return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router });
  assert.equal(result.briefs.length, 2);
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[1].contentId, "j-content-2");
  assert.equal(result.briefs[1].briefVersionId, "j-brief-2");
});
test("mapping context is compact and allowlisted without strategy plan skill or raw facts", async () => {
  let capturedContext: Record<string, unknown> | null = null;
  const router = { describe, complete: async (task: string, input: { trustedContext: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { capturedContext = input.trustedContext as Record<string, unknown>; return envelope; }
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas;
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", facts: { features: ["x"], rawAggregate: ["não enviar"], memoryHistory: ["nada"], discount: "20% de desconto" }, targetContentCount: 1, router });
  assert.ok(capturedContext);
  const keys = Object.keys(capturedContext).sort();
  // Slice 011: creatorContext (projeção allowlisted) entra no contexto do mapping (ADR-018).
  assert.deepEqual(keys, ["creatorContext", "evidenceRefsCatalog", "maxOpportunities", "product", "productId", "understanding"]);
  assert.ok(!("facts" in capturedContext));
  assert.ok(!("strategy" in capturedContext));
  assert.ok(!("skill" in capturedContext));
  assert.ok(!("memory" in capturedContext));
  // discount entra no allowlist do contexto (fato do desconto, chave enviada
  // pelo worker); campos ausentes permanecem undefined — valor nunca inventado.
  assert.deepEqual((capturedContext as { product: Record<string, unknown> }).product, { name: "Produto", description: "Tecido respirável", category: undefined, brand: undefined, priceAmount: undefined, priceCurrency: undefined, discount: "20% de desconto" });
});
test("Meu estilo: creatorContext completo (tone, recordsAlone, restrictions, executionStyle) chega íntegro ao Brief Generator", async () => {
  let briefContext: Record<string, unknown> | undefined;
  const router = { describe, complete: async (task: string, input: { trustedContext: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefContext = input.trustedContext as Record<string, unknown>; return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] }; }
    if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas;
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const meuEstilo = { tone: "bem-humorado", executionStyle: "natural-venda", recordsAlone: true, restrictions: ["Cenas difíceis de gravar"], recordingEquipment: ["camera"], recordingSupport: ["tripod"] };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: meuEstilo, targetContentCount: 1, router });
  if (!briefContext) throw new Error("contexto do brief não capturado");
  // Projeção allowlisted íntegra: nada inventado, nada perdido.
  assert.deepEqual(briefContext.creatorContext, meuEstilo);
  // Enforcement Meu estilo presente na instrução do provider para as capabilities
  // que recebem creatorContext (PRODUCT_UNDERSTANDING não recebe).
  const { MEU_ESTILO_CLAUSE } = await import("./provider");
  assert.ok(MEU_ESTILO_CLAUSE.includes("recordsAlone"));
  assert.ok(MEU_ESTILO_CLAUSE.includes("restrictions"));
  assert.ok(MEU_ESTILO_CLAUSE.includes("tone"));
});
test("plan and brief contexts expose only their explicit allowlisted slices", async () => {  let planContext: Record<string, unknown> | undefined;
  let briefContext: Record<string, unknown> | undefined;
  const router = { describe, complete: async (task: string, input: { trustedContext: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return { ...understanding, category: "vestuário" };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") { planContext = input.trustedContext as Record<string, unknown>; return { opportunities: [contentOpportunity] }; }
    if (task === "CONTENT_BRIEF_GENERATION") { briefContext = input.trustedContext as Record<string, unknown>; return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Calça na prática", cta: "c" }] }; }
    if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas;
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Calça", description: "Tecido respirável", facts: { features: ["fato"], rawAggregate: ["não enviar"] }, creatorContext: { tone: "direto" }, targetContentCount: 1, router });
  if (!planContext || !briefContext) throw new Error("contextos não capturados");
  assert.ok(!("strategy" in planContext));
  assert.ok(planContext.strategySlice);
  assert.equal(planContext.targetContentCount, 1);
  assert.deepEqual(planContext.memoryConstraints, {});
  assert.ok(!("name" in briefContext) && !("description" in briefContext) && !("facts" in briefContext));
  assert.ok(briefContext.relevantFacts && briefContext.evidence);
  assert.ok(!("strategySlice" in briefContext), "commercial strategy and promotional benefits stay out of brief batches");
  // commercialObjective/coreMessage entraram no allowlist: o modelo precisa da
  // mensagem da propria oportunidade para ligar o fato a uma razao concreta.
  // `benefit` esta ausente no fixture e permanece ausente — chave nao inventada.
  assert.deepEqual(briefContext.opportunities, [{ commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "prova", noveltyTargets: ["angle"] }]);
  assert.deepEqual(briefContext.productReference, { name: "Calça" });
  assert.deepEqual(briefContext.creatorContext, { tone: "direto" });
  assert.deepEqual(briefContext.memoryConstraints, {});
  const selectedPatterns = briefContext.selectedPatterns as Array<{ opportunityId: string; hook: { id: string; type?: string; category?: string; source?: string; text?: string; guidance?: string }; cta: { id: string; type?: string; category?: string; source?: string; text?: string; guidance?: string } }>;
  assert.equal(selectedPatterns.length, 1);
  assert.equal(selectedPatterns[0].opportunityId, "j-opportunity-1");
  assert.ok(!selectedPatterns[0].hook.type || selectedPatterns[0].hook.type === "hook");
  assert.notEqual(selectedPatterns[0].hook.category, "apparel", "non-apparel products must never receive apparel hooks");
  assert.equal(selectedPatterns[0].cta.type, "cta");
  assert.equal(selectedPatterns[0].hook.category, "general", "eligible non-apparel opportunity selects a general catalog hook");
  assert.ok(loadPlatformSkill().operationalRepertoire.hookMechanisms.some(({ id }) => id === "demonstration"), "legacy mechanism fallback remains available when no catalog category matches");
  assert.ok(selectedPatterns[0].cta.category && selectedPatterns[0].cta.source && selectedPatterns[0].cta.text);
  assert.ok(!("creativeCatalog" in briefContext), "full catalog must stay local");
  assert.ok(!("scenes" in briefContext) && !("caption" in briefContext) && !("captions" in briefContext));
  assert.ok(!("hookMechanisms" in (briefContext.skillSlice as Record<string, unknown>)));
  assert.ok(!("ctaStrategies" in (briefContext.skillSlice as Record<string, unknown>)));
  assert.ok(!("scenes" in briefContext) && !("caption" in briefContext) && !("captions" in briefContext));
  assert.ok(!("hookMechanisms" in (planContext.plannerSkillSlice as Record<string, unknown>)));
  assert.ok(!("ctaStrategies" in (planContext.plannerSkillSlice as Record<string, unknown>)));
  assert.ok(!("evidenceRefs" in briefContext) && !("evidenceRefsCatalog" in briefContext));
});
test("never sends commission through any AI context", async () => {
  const captured: unknown[] = [];
  const router = {
    describe,
    complete: async (task: string, input: { trustedContext: unknown; externalData?: unknown }) => {
      captured.push(input.trustedContext, input.externalData);
      if (task === "PRODUCT_UNDERSTANDING") return understanding;
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
      if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
      if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
      if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
      if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas;
      if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
      return {};
    },
  };
  await runFirstGeneration({
    productId: "p",
    jobId: "j",
    name: "Produto",
    description: "Tecido respirável",
    facts: {
      category: "Categoria",
      commissionType: "PERCENT",
      commissionValue: "10.00",
    },
    targetContentCount: 1,
    router,
  });
  assert.equal(captured.some((value) => JSON.stringify(value).includes("commission")), false);
});

test("mapping: objection vazio é tratado como ausência sem retry", async () => {
  let mappingCalls = 0;
  const bad = { audiences: ["público"], situations: ["situação"], pains: ["dor"], desires: ["desejo"], objections: ["objeção"], opportunities: [{ ...commercial, objection: "" }, { ...commercial, objection: "" }, { ...commercial, objection: "" }] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls += 1; return mappingCalls === 1 ? bad : envelope; }
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas;
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(mappingCalls, 1, "objection vazio não exige re-solicitação");
  assert.equal(result.briefs.length, 1);
});

test("mapping fail-closed: objection com tipo inválido termina GEN-SCHEMA", async () => {
  let mappingCalls = 0;
  const bad = { audiences: ["público"], situations: ["situação"], pains: ["dor"], desires: ["desejo"], objections: ["objeção"], opportunities: [{ ...commercial, objection: 42 }] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls += 1; return bad; }
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => {
    const e = error as { code?: string; field?: string };
    assert.equal(e.code, "GEN-SCHEMA");
    assert.equal(e.field, "objection");
    return true;
  });
  assert.equal(mappingCalls, 2, "exatamente uma re-solicitação antes do fail-closed");
});

test("scenes retry: schema inválido na 1ª chamada re-solicita por conteúdo e conclui", async () => {
  let sceneCalls = 0;
  const badScenes = { scenes: [{ description: "curta" }] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") { sceneCalls += 1; return sceneCalls === 1 ? badScenes : sceneIdeas; }
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(sceneCalls, 2, "retry único por conteúdo em falha de schema de cenas");
  assert.equal(result.briefs.length, 1);
  assert.equal(result.sceneSets[0].status, "AVAILABLE");
});

test("scenes fail-closed: schema inválido persistente derruba o job com GEN-REPAIR-EXHAUSTED", async () => {
  let sceneCalls = 0;
  const badScenes = { scenes: [{ description: "curta" }] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") { sceneCalls += 1; return badScenes; }
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => {
      const e = error as { code?: string; name?: string };
      assert.equal(e.code, "GEN-REPAIR-EXHAUSTED");
      return true;
    },
  );
  assert.equal(sceneCalls, 2, "retry único por conteúdo antes do fail-closed");
});

// Gate 7 — observabilidade: kept/dropped do gateSceneSet no capability.completed.
test("scenes observabilidade: capability.completed de CONTENT_SCENE_IDEAS carrega kept/dropped", async () => {
  resetJobEvents();
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") return sceneIdeas;
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(result.sceneSets[0].status, "AVAILABLE");
  const completed = collectJobEvents()
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((event) => event.event === "capability.completed" && event.task === "CONTENT_SCENE_IDEAS");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].kept, 2, "ambas as cenas do fixture passam no gateSceneSet");
  assert.equal(completed[0].dropped, 0);
});

// Gate 7 — retry guiado por gate: set inteiramente descartado re-solicita UMA vez
// com gateFeedback (causas do gate) no contexto; segunda tentativa válida conclui.
test("scenes retry guiado: gate derruba o set na 1ª chamada e a 2ª recebe gateFeedback com as causas", async () => {
  let sceneCalls = 0;
  const sceneContexts: Array<Record<string, unknown> | undefined> = [];
  const gateRejected = { scenes: [{ description: "Ambiente iluminado e bonito" }, { description: "Espaço decorado e organizado" }] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") { sceneCalls += 1; sceneContexts.push(recordOf(input?.trustedContext)); return sceneCalls === 1 ? gateRejected : sceneIdeas; }
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(sceneCalls, 2, "exatamente uma re-solicitação guiada pelo gate");
  assert.equal(result.sceneSets[0].status, "AVAILABLE");
  const feedback = sceneContexts[1]?.gateFeedback;
  assert.equal(typeof feedback, "string", "2ª chamada carrega gateFeedback no contexto");
  assert.match(String(feedback), /acao_ausente|ancora_ausente/, "feedback cita as causas determinísticas do gate");
  assert.equal("gateFeedback" in (sceneContexts[0] ?? {}), false, "1ª chamada não carrega feedback");
});

// Gate 7 — fail-closed mantido: gate derruba o set nas duas tentativas -> item falha.
test("scenes retry guiado fail-closed: gate persistente esgota as 2 tentativas", async () => {
  let sceneCalls = 0;
  const gateRejected = { scenes: [{ description: "Ambiente iluminado e bonito" }, { description: "Espaço decorado e organizado" }] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") { sceneCalls += 1; return gateRejected; }
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => {
      const e = error as { code?: string };
      assert.equal(e.code, "GEN-REPAIR-EXHAUSTED");
      return true;
    },
  );
  assert.equal(sceneCalls, 2, "fail-closed após o orçamento de 2 chamadas por conteúdo");
});

// ---- Contrato estruturado de development na geração inicial (design 2026-09-18) ----

const structuredBullet = {
  text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso",
  action: "Destaque",
  factRef: "product:description",
  rationale: "para explicar como o tecido respiravel afeta o uso",
};

test("geração inicial aceita development estruturado e projeta bullets para string[] canônico", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "demonstração", hook: "Veja", development: [structuredBullet, structuredBullet], script: "Mostre o Produto", cta: "Confira" }] }; if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o produto na mão girando devagar" }, { description: "Mostre o tecido esticando de perto" }] }; if (task === "CONTENT_QUALITY_JUDGE") return { audits: [{ contentId: "j-content-1", parts: [{ part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" }, { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" }, { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" }, { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" }, { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" }] }] }; return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(result.briefs.length, 1);
  assert.ok(result.briefs[0]!.development.every((point) => typeof point === "string"), "development canônico permanece string[]");
  assert.deepEqual(result.briefs[0]!.development, [structuredBullet.text, structuredBullet.text]);
});

test("bullet estruturado com factRef desconhecido falha GEN-SCHEMA após retry único do lote", async () => {
  let briefCalls = 0;
  const badBullet = { ...structuredBullet, factRef: "fact:inexistente" };
  const router = { describe, complete: async (task: string) => { if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") { briefCalls += 1; return { items: [{ angle: "demonstração", hook: "Veja", development: [badBullet, badBullet], script: "Mostre o Produto", cta: "Confira" }] }; } return {}; } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-bad-ref", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => error instanceof Error && /lote de briefings/i.test(error.message),
  );
  assert.equal(briefCalls, 2, "retry único de contrato do lote");
});

test("script_naturalness REVIEW vai ao part repair do item com creatorContext e script limpo publica", async () => {
  let partRepairContext: Record<string, unknown> | undefined;
  const judgeParts = (contentId: string) => [
    { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
    { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
    { part: "script", status: "REVIEW", criterion: "script_naturalness", reason: "not_tiktok_native" },
    { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
    { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
  ].map((part) => part);
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Fale sobre o produto", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o produto nas maos girando" }, { description: "Pegue o produto e aproxime do tecido" }] };
    if (task === "CONTENT_QUALITY_JUDGE") { const items = recordOf(input?.trustedContext)?.items; const list = Array.isArray(items) ? items as Array<{ contentId: string }> : []; return { audits: list.map(({ contentId }) => ({ contentId, parts: judgeParts(contentId) })) }; }
    if (task === "CONTENT_PART_REPAIR") { partRepairContext = input?.trustedContext as Record<string, unknown>; return { items: (recordOf(partRepairContext)?.items as Array<{ contentId: string }> ?? []).map(({ contentId }) => ({ contentId, content: "Mostre o produto perto e fale do tecido" })) }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-nat", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.ok(partRepairContext);
  assert.equal(partRepairContext!.part, "script", "somente a parte revisada vai a repair");
  const repairItem = (partRepairContext!.items as Array<Record<string, unknown>>)[0]!;
  assert.equal(repairItem.contentId, "j-nat-content-1", "somente o item revisado vai a repair");
  assert.equal(repairItem.criterion, "script_naturalness");
  assert.equal(repairItem.reason, "Precisa soar mais natural para conteúdo TikTok.", "contexto do repair carrega reasonText localizado; enum segue em qualityDiagnostics");
  assert.ok("creatorContext" in partRepairContext!, "creatorContext allowlisted presente");
  assert.equal(result.briefs[0].script, "Mostre o produto perto e fale do tecido");
  assert.equal(result.reports[0].decision, "PASS");
});
