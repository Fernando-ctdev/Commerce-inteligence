// Slice 011 (ADR-018/SPEC): contratos da projeção CreatorContext por capability.
// Prova chaves exatas por capability e que userId, tenantId, quota, targetContentCount
// e comissão nunca chegam ao provider. Executar: npx tsx --test src/modules/commerce-intelligence/creator-context.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration, projectCreatorContext } from "./engine";

const creatorFull = {
  language: "pt-BR",
  market: "Brasil",
  appearsOnCamera: true,
  prefersVoiceOver: false,
  preferredDurationSeconds: 45,
  tone: "direto",
  executionStyle: "demonstração",
  recordingEquipment: ["phone", "camera"],
  recordingSupport: ["tripod", "handheld"],
  restrictions: ["sem gírias"],
  notes: ["foco no benefício"],
  // Campos que NUNCA podem chegar ao provider:
  userId: "u-1",
  tenantId: "t-1",
  targetContentCount: 5,
  commissionType: "PERCENT",
  quota: 99,
};

const MAPPING = { language: "pt-BR", market: "Brasil", tone: "direto", executionStyle: "demonstração", restrictions: ["sem gírias"] };
const STRATEGY = { ...MAPPING, notes: ["foco no benefício"] };
const PLAN = { language: "pt-BR", market: "Brasil", preferredDurationSeconds: 45, executionStyle: "demonstração", restrictions: ["sem gírias"] };
// Slice 011: arrays de enums do Brief preservados intactos pela projeção allowlisted.
const BRIEF = { ...PLAN, appearsOnCamera: true, prefersVoiceOver: false, tone: "direto", recordingEquipment: ["phone", "camera"], recordingSupport: ["tripod", "handheld"], notes: ["foco no benefício"] };

test("projectCreatorContext devolve exatamente a allowlist de cada capability", () => {
  assert.deepEqual(projectCreatorContext("PRODUCT_UNDERSTANDING", creatorFull), {});
  assert.deepEqual(projectCreatorContext("COMMERCIAL_OPPORTUNITY_MAPPING", creatorFull), MAPPING);
  assert.deepEqual(projectCreatorContext("STRATEGY_SYNTHESIS", creatorFull), STRATEGY);
  assert.deepEqual(projectCreatorContext("CONTENT_PLAN_GENERATION", creatorFull), PLAN);
  assert.deepEqual(projectCreatorContext("CONTENT_BRIEF_GENERATION", creatorFull), BRIEF);
});

test("projectCreatorContext tolera contexto ausente ou inválido", () => {
  for (const invalido of [undefined, null, [creatorFull], "lixo", 42])
    assert.deepEqual(projectCreatorContext("CONTENT_BRIEF_GENERATION", invalido), {});
});

// Fixtures do pipeline (mesmas do engine-pipeline): evidência suficiente exige 3 oportunidades.
const understanding = { productId: "p", category: undefined, coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["preço"], evidenceRefs: ["fact-1"] };
const commercial = { relevantCapabilities: ["cap"], benefits: ["benefício"], proofOptions: ["fact-1"], sellingArgument: "argumento", confidence: 0.9, evidenceRefs: ["fact-1"] };
const envelope = { audiences: ["público"], situations: ["situação"], pains: ["dor"], desires: ["desejo"], objections: ["objeção"], opportunities: [commercial, commercial, commercial] };
const strategyPayload = { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", primaryPositioning: "posicionamento", audiences: ["público"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["arg"], priorityAngles: ["ângulo"], communicationPrinciples: ["cp"] };
const contentOpportunity = { commercialObjective: "vender", angle: "demonstração", coreMessage: "benefício", hookMechanism: "prova", noveltyTargets: ["angle"] };

test("pipeline entrega a projeção exata por capability, sem creatorContext no understanding", async () => {
  const expected: Record<string, Record<string, unknown>> = {
    COMMERCIAL_OPPORTUNITY_MAPPING: MAPPING,
    STRATEGY_SYNTHESIS: STRATEGY,
    CONTENT_PLAN_GENERATION: PLAN,
    CONTENT_BRIEF_GENERATION: BRIEF,
  };
  const contexts = new Map<string, Record<string, unknown>>();
  const router = {
    describe: () => ({ provider: "test", model: "test-model", instructionVersion: "slice-011" }),
    complete: async (task: string, input: { trustedContext: unknown }) => {
      contexts.set(task, input.trustedContext as Record<string, unknown>);
      if (task === "PRODUCT_UNDERSTANDING") return understanding;
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
      if (task === "STRATEGY_SYNTHESIS") return strategyPayload;
      if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [contentOpportunity] };
      if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Produto na prática", cta: "c" }] };
      return {};
    },
  };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", creatorContext: creatorFull, targetContentCount: 1, router });
  assert.equal("creatorContext" in (contexts.get("PRODUCT_UNDERSTANDING") ?? {}), false);
  for (const [task, expectedCreator] of Object.entries(expected)) {
    const context = contexts.get(task);
    assert.ok(context, `contexto de ${task} não capturado`);
    assert.deepEqual(context.creatorContext, expectedCreator);
  }
});
