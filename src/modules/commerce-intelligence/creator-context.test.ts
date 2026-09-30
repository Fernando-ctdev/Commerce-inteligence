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
  assert.deepEqual(projectCreatorContext("CONTENT_BRIEF_GENERATION", creatorFull), BRIEF);
});

test("projectCreatorContext tolera contexto ausente ou inválido", () => {
  for (const invalido of [undefined, null, [creatorFull], "lixo", 42])
    assert.deepEqual(projectCreatorContext("CONTENT_BRIEF_GENERATION", invalido), {});
});

// Fixtures do pipeline (mesmas do engine-pipeline): evidência suficiente exige 3 oportunidades.
const understanding = { productId: "p", category: undefined, coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["preço"], evidenceRefs: ["fact-1"] };
const commercial = { commercialObjective: "argumento", angle: "benefício", coreMessage: "argumento", relevantCapabilities: ["cap"], benefits: ["benefício"], proofOptions: ["fact-1"], commercialEffects: ["argumento"], evidenceRefs: ["fact-1"], confidence: 0.9 };
// Fixture V2: pools legados (audiences/situations/...) não são vinculados a
// hipótese — opcionais por hipótese ficam ausentes (sem inferência).
const envelope = { discoveryContractVersion: "2", hypotheses: [commercial, { ...commercial, angle: "confiança" }, { ...commercial, angle: "resultado" }] };
const qualityAudit = { parts: [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
] };
const sceneIdeas = { scenes: [{ description: "Mostre o tecido duna leve e macio em uso" }, { description: "Pegue o tecido duna leve e macio e aproxime para demonstrar" }] };

test("pipeline entrega a projeção exata por capability, sem creatorContext no understanding", async () => {
  // Cutover V2: CONTENT_PLAN_GENERATION foi removido do engine (Planner
  // determinístico); a projeção pura da allowlist continua pinada no teste 1.
  const expected: Record<string, Record<string, unknown>> = {
    COMMERCIAL_OPPORTUNITY_MAPPING: MAPPING,
    CONTENT_BRIEF_GENERATION: BRIEF,
  };
  const contexts = new Map<string, Record<string, unknown>>();
  const router = {
    describe: () => ({ provider: "test", model: "test-model", instructionVersion: "slice-011" }),
    complete: async (task: string, input: { trustedContext: unknown }) => {
      contexts.set(task, input.trustedContext as Record<string, unknown>);
      if (task === "PRODUCT_UNDERSTANDING") return understanding;
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
      if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido duna leve e macio porque o toque do tecido duna macio importa no uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Destaque o tecido duna leve e macio porque o toque do tecido duna macio importa no uso", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "O tecido duna leve e macio", cta: "c" }] };
      if (task === "CONTENT_QUALITY_JUDGE") {
        // ADR-025: judge em lote — o fake ecoa o conjunto exato de contentIds recebidos.
        const items = ((input.trustedContext as { items?: Array<{ contentId: string }> }).items ?? []);
        return { audits: items.map(({ contentId }) => ({ contentId, parts: qualityAudit.parts })) };
      }
      return {};
    },
  };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido duna leve e macio", creatorContext: creatorFull, targetContentCount: 1, router });
  assert.equal("creatorContext" in (contexts.get("PRODUCT_UNDERSTANDING") ?? {}), false);
  for (const [task, expectedCreator] of Object.entries(expected)) {
    const context = contexts.get(task);
    assert.ok(context, `contexto de ${task} não capturado`);
    assert.deepEqual(context.creatorContext, expectedCreator);
  }
});
