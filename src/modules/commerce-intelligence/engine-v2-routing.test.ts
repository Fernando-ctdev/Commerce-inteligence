// Etapa 4 V2 — testes de roteamento do runFirstGeneration (Engine V2 é o
// call graph default; ADR-033). Cobre: Planner determinístico no lugar de
// CONTENT_PLAN_GENERATION, contexto real do provider allowlisted (sem IDs/
// catálogo/selectedPatterns), Scene Skeleton no lugar de CONTENT_SCENE_IDEAS,
// handoff no EngineResult e fail-closed de pré-condições com telemetria
// sanitizada (sem fallback V1 neste checkout).
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { runPlannerV2 } from "./engine-v2";
import { collectJobEvents, resetJobEvents } from "./observability";
import { CREATIVE_CATALOG } from "./creative-catalog";

const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "v2" });
const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

// Bullets comprovados contra os gates objetivos (mesmos dos stubs V1); itens
// distintos variam ordem dos bullets/hook/ângulo/script/CTA raiz — nunca
// sufixos numéricos, que quebram o predicate de ação+razão.
const briefVariants = [
  {
    angle: "a1",
    hook: "h1",
    development: [
      { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
      { text: "Destaque o tecido respiravel para conectar o tecido respiravel ao uso cotidiano", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
    ],
    script: "Mostre o Produto",
    cta: "Confira o produto na página.",
  },
  {
    angle: "a2",
    hook: "h2",
    development: [
      { text: "Comente o tecido respiravel para conectar o tecido respiravel ao uso cotidiano", action: "Comente", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
      { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
    ],
    script: "Apresente o Produto",
    cta: "Conheça os detalhes do produto.",
  },
];

const qualityPassAudit = { parts: [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
] };

function stubRouter(handlers: {
  onBrief?: (context: Record<string, unknown>) => void;
  briefResponse?: () => unknown;
  plan?: number | boolean;
}) {
  return {
    describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      if (task === "PRODUCT_UNDERSTANDING")
        return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING")
        return { discoveryContractVersion: "2", hypotheses: [
          { commercialObjective: "gerar desejo", angle: "praticidade", coreMessage: "leve para o dia a dia", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["desejo"], evidenceRefs: ["product:description"], confidence: 0.9 },
          { commercialObjective: "quebrar objeção", angle: "durabilidade", coreMessage: "durabilidade real", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["confiança"], evidenceRefs: ["product:description"], confidence: 0.8 },
        ] };
      if (task === "STRATEGY_SYNTHESIS")
        return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
      if (task === "CONTENT_PLAN_GENERATION") {
        if (!handlers.plan) throw new Error("capability proibida no caminho V2: CONTENT_PLAN_GENERATION");
        const count = typeof handlers.plan === "number" ? handlers.plan : 1;
        return { opportunities: Array.from({ length: count }, (_v, index) => ({ commercialObjective: "c", angle: `a${index + 1}`, coreMessage: "m", hookMechanism: index % 2 === 0 ? "demonstration" : "discovery", noveltyTargets: ["n"] })) };
      }
      if (task === "CONTENT_BRIEF_GENERATION") {
        const context = recordOf(input?.trustedContext) ?? {};
        handlers.onBrief?.(context);
        const requested = Array.isArray(context.realizations)
          ? context.realizations.length
          : Array.isArray(context.opportunities)
            ? context.opportunities.length
            : 1;
        if (handlers.briefResponse) return handlers.briefResponse();
        return {
          developmentSchemaVersion: 2,
          items: Array.from({ length: Math.max(1, requested) }, (_v, index) => briefVariants[index % briefVariants.length]!),
        };
      }
      if (task === "CONTENT_SCENE_IDEAS") {
        // Caminho V1 (fallback): cenas por Content respondem normalmente; no
        // caminho V2 esta capability jamais é chamada (assert nos testes).
        const brief = recordOf(recordOf(input?.trustedContext)?.brief);
        const detail = Array.isArray(brief?.development) && typeof brief.development[0] === "string"
          ? brief.development[0]
          : String(brief?.hook ?? "produto");
        return { scenes: [{ description: `Mostre ${detail}` }, { description: `Pegue o produto e mostre ${detail}` }] };
      }
      if (task === "CONTENT_QUALITY_JUDGE") {
        const items = recordOf(input?.trustedContext)?.items;
        const list = Array.isArray(items) ? (items as Array<{ contentId: string }>) : [];
        return { audits: list.map(({ contentId }) => ({ contentId, parts: qualityPassAudit.parts })) };
      }
      if (task === "CONTENT_PART_REPAIR" || task === "CONTENT_BRIEF_REPAIR") return { items: [] };
      return {};
    },
  };
}

const FORBIDDEN_IN_PROVIDER_CONTEXT = [
  "selectedPatterns", "creativeCatalog", "creativeDirection", "jobId", "contentId",
  "briefVersionId", "productId", "productReference", "tenantId", "quota", "status",
  "instruction", "skillSlice", "developmentRequirements", "repairContrast",
];

test("V2 default-on: planner determinístico, contexto allowlisted e Scene Skeleton — sem plano nem cena por provider", async () => {
  resetJobEvents();
  const seenContexts: Record<string, unknown>[] = [];
  const taskCalls: string[] = [];
  const base = stubRouter({ onBrief: (context) => seenContexts.push(context) });
  const router = {
    describe: base.describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      taskCalls.push(task);
      return base.complete(task, input);
    },
  };
  const productId = randomUUID();
  const result = await runFirstGeneration({
    productId,
    jobId: "j-v2",
    name: "Produto",
    description: "Tecido respirável",
    targetContentCount: 1,
    creatorContext: { recordsAlone: true, tone: "natural" },
    router,
  });
  assert.equal(result.briefs.length, 1, "exact-N entregue pelo Planner V2");
  assert.ok(result.plannedV2 && result.plannedV2.length === 1, "handoff V2 presente no EngineResult");
  assert.equal(result.plannedV2[0]?.opportunityContractVersion, "2", "contrato V2 canônico");
  assert.equal(result.plannedV2[0]?.blueprint.blueprintContractVersion, "1", "envelope do blueprint no handoff");
  assert.ok(result.plannedV2[0]?.blueprint.blueprint, "blueprint resolvido presente");
  assert.ok(result.plannedV2[0]?.creativeDirection, "creativeDirection resolvida no handoff");
  assert.ok(result.sceneSets.every((set) => set.status === "AVAILABLE" && set.scenes.length >= 2), "skeleton cobre a função de cenas");
  assert.equal(taskCalls.includes("CONTENT_PLAN_GENERATION"), false, "Plano V1 não executa no caminho V2");
  assert.equal(taskCalls.includes("CONTENT_SCENE_IDEAS"), false, "cenas por provider não executam no caminho V2");
  // E5/Review: cobertura Judge EXECUTED apenas para itens julgados; itens fora
  // do hard subset permanecem NOT_EXECUTED (round mínimo 1).
  const executedRecords = result.judgeExecutionRecords.filter((record) => record.execution === "EXECUTED");
  const notExecutedRecords = result.judgeExecutionRecords.filter((record) => record.execution === "NOT_EXECUTED");
  assert.ok(result.judgeExecutionRecords.length >= 1, "cobertura registrada para todos os candidatos");
  assert.equal(executedRecords.length, result.briefs.length, "todos os entregues foram julgados");
  assert.equal(notExecutedRecords.length + executedRecords.length, result.judgeExecutionRecords.length, "nenhum estado sintético");
  assert.equal(
    result.sceneSets.every((set) => "scenes" in ({ ...set } as Record<string, unknown>) && !("scenes" in result.briefs[0])),
    true,
    "cenas permanecem fora do brief (ContentSceneSet separado)",
  );

  // Contexto EFETIVO enviado ao provider: allowlist sem IDs/catálogo/estilo.
  assert.ok(seenContexts.length > 0, "brief provider foi invocado");
  for (const context of seenContexts) {
    const serialized = JSON.stringify(context);
    for (const forbidden of FORBIDDEN_IN_PROVIDER_CONTEXT)
      assert.equal(serialized.includes(forbidden), false, `${forbidden} não cruza o contexto V2`);
    assert.equal(serialized.includes(productId), false, "productId persistente não cruza o contexto V2");
    const realizations = context.realizations as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(realizations) && realizations.length > 0, "realizações por oportunidade presentes");
    for (const realization of realizations) {
      assert.ok(recordOf(realization.blueprint), "blueprint resolvido presente na realização");
      assert.ok(Array.isArray(realization.validatedEvidenceRefs), "evidenceRefs validadas presentes");
    }
    for (const pattern of [...CREATIVE_CATALOG.hooks, ...CREATIVE_CATALOG.ctas]) {
      const text = String((pattern as { text?: unknown }).text ?? "");
      if (text.trim()) assert.equal(serialized.includes(text.slice(0, 40)), false, "texto literal do catálogo não cruza o contexto");
    }
  }

  const events = collectJobEvents().map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(events.some((event) => event.event === "v2.planner.completed"), "telemetria do Planner V2 presente");
  assert.equal(events.some((event) => event.event === "v2.fallback"), false, "sem fallback no caminho principal");
});

test("pool V2 sem diversidade é fail-closed (sem fallback V1)", async () => {
  const taskCalls: string[] = [];
  const base = stubRouter({});
  const router = {
    describe: base.describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      taskCalls.push(task);
      // Evidência fora do catálogo do Planner V2: pré-condição incompatível
      // → fail-closed (cutover removeu o fallback V1). Fixture em envelope V2:
      // benefits/commercialEffects idênticos ⇒ pool sem diversidade.
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING")
        return { discoveryContractVersion: "2", hypotheses: [
          { commercialObjective: "c1", angle: "a1", coreMessage: "s1", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["mesmo benefício"], proofOptions: ["product:description"], commercialEffects: ["mesmo efeito"], evidenceRefs: ["product:description"], confidence: 0.9 },
          { commercialObjective: "c2", angle: "a2", coreMessage: "s2", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["mesmo benefício"], proofOptions: ["product:description"], commercialEffects: ["mesmo efeito"], evidenceRefs: ["product:description"], confidence: 0.9 },
        ] };
      return base.complete(task, input);
    },
  };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-v2-failclosed", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router }),
    (error: unknown) => (error as { code?: string }).code === "GEN-PLANNER-DIVERSITY",
  );
  assert.equal(taskCalls.includes("CONTENT_PLAN_GENERATION"), false, "nenhum plano V1 no caminho V2");
});

test("adapter V2: restrições explícitas do creator sustentam multi-seleção determinística", () => {
  const evidence = { facts: ["Produto", "Tecido respirável"], refs: ["product:name", "product:description"] };
  const opportunities = Array.from({ length: 4 }, (_v, index) => ({
    id: `o${index + 1}`,
    relevantCapabilities: ["cap"],
    benefits: [`benefício distinto ${index + 1}`],
    proofOptions: ["p"],
    sellingArgument: `argumento ${index + 1}`,
    confidence: 0.9,
    evidenceRefs: ["product:description"],
  })) as never;
  const result = runPlannerV2({
    jobId: "j-constraints",
    productId: "p",
    targetContentCount: 2,
    commercialOpportunities: opportunities,
    evidence,
    creatorConstraints: { allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"], disallowedFormats: [], disallowedProductRoles: [] },
  });
  assert.equal(result.planned.length, 2, "multi-seleção exata com pool suportado");
  assert.ok(result.planned.every((item) => item.blueprint.blueprint && item.evidenceRefs.length > 0), "blueprint + evidência por oportunidade");
});

// ─── Contrato de resposta V2 fail-closed: marker + allowlists exatas ────────
// Cada violação consome o retry único do lote e depois falha fechado
// (GEN-SCHEMA), sem projeção silenciosa.
const validEnvelope = () => ({
  developmentSchemaVersion: 2,
  items: [{ angle: "a", hook: "h", development: [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Comente o tecido respiravel para conectar o tecido respiravel ao uso cotidiano", action: "Comente", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." }], script: "Mostre o Produto", cta: "Confira o produto na página." }],
});

const responseCases: Array<[string, () => unknown]> = [
  ["marker ausente", () => { const { developmentSchemaVersion: _dsv, ...rest } = validEnvelope(); return rest; }],
  ["marker errado", () => ({ ...validEnvelope(), developmentSchemaVersion: 1 })],
  ["chave extra no envelope", () => ({ ...validEnvelope(), extra: true })],
  ["chave extra no item", () => { const env = validEnvelope(); (env.items[0] as Record<string, unknown>).scenes = []; return env; }],
  ["chave extra no bullet", () => { const env = validEnvelope(); const dev = env.items[0] as { development: Array<Record<string, unknown>> }; dev.development = [{ ...dev.development[0]!, origem: "x" }, dev.development[1]!]; return env; }],
];

for (const [label, build] of responseCases) {
  test(`resposta V2 fail-closed: ${label} → retry único e GEN-SCHEMA`, async () => {
    let briefCalls = 0;
    const base = stubRouter({ briefResponse: () => { briefCalls += 1; return build(); } });
    const router = { describe: base.describe, complete: async (task: string, input?: { trustedContext?: unknown }) => base.complete(task, input) };
    await assert.rejects(
      () => runFirstGeneration({ productId: randomUUID(), jobId: `j-v2-envelope-${briefCalls}-${label.length}`, name: "Produto", description: "Tecido respirável", targetContentCount: 1, creatorContext: {}, router }),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
    );
    assert.equal(briefCalls, 2, "retry único antes do fail-closed");
  });
}
