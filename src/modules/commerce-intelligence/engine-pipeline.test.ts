import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { loadPlatformSkill } from "./platform-skill";
const understanding = { productId: "p", category: undefined, coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["preço"], evidenceRefs: ["fact-1"] };
const commercial = { relevantCapabilities: ["cap"], benefits: ["benefício"], proofOptions: ["fact-1"], sellingArgument: "argumento", confidence: 0.9, evidenceRefs: ["fact-1"] };
const strategyPayload = { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", primaryPositioning: "posicionamento", audiences: ["público"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["arg"], priorityAngles: ["ângulo"], communicationPrinciples: ["cp"] };
// Evidência suficiente (≥3 refs distintas nos fixtures) exige o mínimo de 3 oportunidades.
const envelope = { audiences: ["público"], situations: ["situação"], pains: ["dor"], desires: ["desejo"], objections: ["objeção"], opportunities: [commercial, commercial, commercial] };
const contentOpportunity = { commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "prova", noveltyTargets: ["angle"] };
const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });
test("composes validated provider outputs into the pipeline (4 foundational + batched briefs)", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "demonstração", hook: "Veja", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "Confira" }] }; return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  const strategy = result.strategy as { opportunities: Array<{ id: string }> };
  const plan = result.plan as { opportunities: Array<{ id: string }> };
  assert.equal(plan.opportunities[0].id, "j-opportunity-1");
  assert.equal(strategy.opportunities[0].id, "j-commercial-1");
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[0].briefVersionId, "j-brief-1");
  assert.deepEqual(calls, ["PRODUCT_UNDERSTANDING", "COMMERCIAL_OPPORTUNITY_MAPPING", "STRATEGY_SYNTHESIS", "CONTENT_PLAN_GENERATION", "CONTENT_BRIEF_GENERATION"]);
});
test("repairs only rejected briefs via causal CONTENT_BRIEF_GENERATION, preserving ids", async () => {
  const briefCalls: string[] = [];
  let briefGenCount = 0;
  const router = { describe, hash: () => "h", complete: async (task: string) => { if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") { briefGenCount++; const causes = briefCalls.push("gen") > 0; void causes; if (briefGenCount === 1) return { items: [{ angle: "x", hook: "h", development: ["Carga de 999 kg em teste"], script: "testado com 999 kg de carga", cta: "c" }] }; return { items: [{ angle: "dem", hook: "Veja", development: ["Produto real em uso"], script: "Mostre o Produto na prática", cta: "Confira" }] }; } return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(briefGenCount, 2, "rejected item regenerated causally");
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[0].briefVersionId, "j-brief-1");
  assert.equal(result.reports[0].decision, "PASS");
  assert.equal(result.repairs, 1);
});
test("batches brief generation sequentially with server-derived ids", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity, contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Produto com demonstração", cta: "c" }, { angle: "a2", hook: "h2", development: ["Produto real em uso"], script: "Produto na prática", cta: "c2" }] }; return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 2, router });
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
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Produto na prática", cta: "c" }] };
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", facts: { features: ["x"], rawAggregate: ["não enviar"], memoryHistory: ["nada"], discountPercentage: "20% de desconto" }, targetContentCount: 1, router });
  assert.ok(capturedContext);
  const keys = Object.keys(capturedContext).sort();
  // Slice 011: creatorContext (projeção allowlisted) entra no contexto do mapping (ADR-018).
  assert.deepEqual(keys, ["creatorContext", "evidenceRefsCatalog", "maxOpportunities", "product", "productId", "understanding"]);
  assert.ok(!("facts" in capturedContext));
  assert.ok(!("strategy" in capturedContext));
  assert.ok(!("skill" in capturedContext));
  assert.ok(!("memory" in capturedContext));
  // discountPercentage entra no allowlist do contexto (fato do desconto); campos
  // ausentes permanecem undefined — a chave existe, o valor não é inventado.
  assert.deepEqual((capturedContext as { product: Record<string, unknown> }).product, { name: "Produto", description: "Descrição", category: undefined, brand: undefined, priceAmount: undefined, priceCurrency: undefined, discountPercentage: "20% de desconto" });
});
test("Meu estilo: creatorContext completo (tone, recordsAlone, restrictions, executionStyle) chega íntegro ao Brief Generator", async () => {
  let briefContext: Record<string, unknown> | undefined;
  const router = { describe, complete: async (task: string, input: { trustedContext: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefContext = input.trustedContext as Record<string, unknown>; return { items: [{ angle: "a", hook: "h", development: ["Produto"], script: "Produto na prática", cta: "c" }] }; }
    return {};
  } };
  const meuEstilo = { tone: "bem-humorado", executionStyle: "natural-venda", recordsAlone: true, restrictions: ["Cenas difíceis de gravar"], recordingEquipment: ["camera"], recordingSupport: ["tripod"] };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", creatorContext: meuEstilo, targetContentCount: 1, router });
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
    if (task === "CONTENT_BRIEF_GENERATION") { briefContext = input.trustedContext as Record<string, unknown>; return { items: [{ angle: "a", hook: "h", development: ["Calça"], script: "Calça na prática", cta: "c" }] }; }
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Calça", description: "Descrição", facts: { features: ["fato"], rawAggregate: ["não enviar"] }, creatorContext: { tone: "direto" }, targetContentCount: 1, router });
  if (!planContext || !briefContext) throw new Error("contextos não capturados");
  assert.ok(!("strategy" in planContext));
  assert.ok(planContext.strategySlice);
  assert.equal(planContext.targetContentCount, 1);
  assert.deepEqual(planContext.memoryConstraints, {});
  assert.ok(!("name" in briefContext) && !("description" in briefContext) && !("facts" in briefContext));
  assert.ok(briefContext.relevantFacts && briefContext.evidence && briefContext.strategySlice);
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
  assert.ok(loadPlatformSkill().operationalRepertoire.hookPatterns.some(({ id }) => id === "demonstration"), "legacy mechanism fallback remains available when no catalog category matches");
  assert.ok(selectedPatterns[0].cta.category && selectedPatterns[0].cta.source && selectedPatterns[0].cta.text);
  assert.ok(!("creativeCatalog" in briefContext), "full catalog must stay local");
  assert.ok(!("scenes" in briefContext) && !("caption" in briefContext) && !("captions" in briefContext));
  assert.ok(!("hookPatterns" in (briefContext.skillSlice as Record<string, unknown>)));
  assert.ok(!("ctaPatterns" in (briefContext.skillSlice as Record<string, unknown>)));
  assert.ok(!("scenes" in briefContext) && !("caption" in briefContext) && !("captions" in briefContext));
  assert.ok(!("hookPatterns" in (planContext.plannerSkillSlice as Record<string, unknown>)));
  assert.ok(!("ctaPatterns" in (planContext.plannerSkillSlice as Record<string, unknown>)));
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
      if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Produto na prática", cta: "c" }] };
      return {};
    },
  };
  await runFirstGeneration({
    productId: "p",
    jobId: "j",
    name: "Produto",
    description: "Descrição",
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
