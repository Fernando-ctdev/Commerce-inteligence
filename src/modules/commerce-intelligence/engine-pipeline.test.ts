import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
const understanding = { productId: "p", category: undefined, coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["preço"], communicationRisks: ["não exagerar"], evidenceRefs: ["fact-1"] };
const commercial = { relevantCapabilities: ["cap"], benefits: ["benefício"], proofOptions: ["fact-1"], sellingArgument: "argumento", confidence: 0.9, evidenceRefs: ["fact-1"] };
const strategyPayload = { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", primaryPositioning: "posicionamento", audiences: ["público"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["arg"], priorityAngles: ["ângulo"], communicationPrinciples: ["cp"], communicationRisks: ["r"] };
// Evidência suficiente (≥3 refs distintas nos fixtures) exige o mínimo de 3 oportunidades.
const envelope = { audiences: ["público"], situations: ["situação"], pains: ["dor"], desires: ["desejo"], objections: ["objeção"], opportunities: [commercial, commercial, commercial] };
const contentOpportunity = { commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "prova", noveltyTargets: ["angle"] };
const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });
test("composes validated provider outputs into the pipeline (4 foundational + batched briefs)", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "demonstração", hook: "Veja", script: "Mostre o Produto", scenes: ["a", "b"], cta: "Confira" }] }; return {}; } };
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
  const router = { describe, hash: () => "h", complete: async (task: string) => { if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") { briefGenCount++; const causes = briefCalls.push("gen") > 0; void causes; if (briefGenCount === 1) return { items: [{ angle: "x", hook: "h", script: "testado com 999 kg de carga", scenes: ["a", "b"], cta: "c" }] }; return { items: [{ angle: "dem", hook: "Veja", script: "Mostre o Produto na prática", scenes: ["a", "b"], cta: "Confira" }] }; } return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(briefGenCount, 2, "rejected item regenerated causally");
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[0].briefVersionId, "j-brief-1");
  assert.equal(result.reports[0].decision, "PASS");
  assert.equal(result.repairs, 1);
});
test("batches brief generation sequentially with server-derived ids", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "STRATEGY_SYNTHESIS") return strategyPayload; if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity, contentOpportunity] }; if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", script: "Produto com demonstração", scenes: ["a", "b"], cta: "c" }, { angle: "a2", hook: "h2", script: "Produto na prática", scenes: ["a", "b"], cta: "c2" }] }; return {}; } };
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
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", script: "Produto na prática", scenes: ["a", "b"], cta: "c" }] };
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", facts: { features: ["x"], rawAggregate: ["não enviar"], memoryHistory: ["nada"] }, targetContentCount: 1, router });
  assert.ok(capturedContext);
  const keys = Object.keys(capturedContext).sort();
  assert.deepEqual(keys, ["evidenceRefsCatalog", "maxOpportunities", "product", "productId", "understanding"]);
  assert.ok(!("facts" in capturedContext));
  assert.ok(!("strategy" in capturedContext));
  assert.ok(!("skill" in capturedContext));
  assert.ok(!("memory" in capturedContext));
  assert.deepEqual((capturedContext as { product: Record<string, unknown> }).product, { name: "Produto", description: "Descrição", category: undefined, brand: undefined, priceAmount: undefined, priceCurrency: undefined });
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
      if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", script: "Produto na prática", scenes: ["a", "b"], cta: "c" }] };
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