// Etapa 4 V2 — testes de roteamento do runFirstGeneration (Engine V2 é o
// call graph default; ADR-033). Cobre: Planner determinístico no lugar de
// CONTENT_PLAN_GENERATION, contexto real do provider allowlisted (sem IDs/
// catálogo/selectedPatterns), Scene Skeleton no lugar de CONTENT_SCENE_IDEAS,
// handoff no EngineResult e fail-closed de pré-condições com telemetria
// sanitizada (sem fallback V1 neste checkout).
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration, discoveryPoolFromSelectedV2 } from "./engine";
import { buildPlannerInputV2, runPlannerV2, validateV2DevelopmentBullets } from "./engine-v2";
import { planPortfolio } from "./planner-harness/plan-portfolio";
import type { PlannerInput } from "./planner-harness/types";
import { canonicalSerialization, sha256Hex } from "./planner-harness/canonical";
import { loadCreativeSystem } from "./creative-system";
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
  let judgeContext: Record<string, unknown> | undefined;
  const taskCalls: string[] = [];
  const base = stubRouter({ onBrief: (context) => seenContexts.push(context) });
  const router = {
    describe: base.describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      taskCalls.push(task);
      if (task === "CONTENT_QUALITY_JUDGE") judgeContext = recordOf(input?.trustedContext);
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
  const judged = (judgeContext?.items as Array<Record<string, unknown>> | undefined)?.[0];
  assert.ok(judged, "risco seletivo envia item ao Judge");
  assert.deepEqual(judged.blueprint, result.plannedV2[0]?.blueprint.blueprint);
  assert.ok((judged.triggerCodes as string[]).includes("WEAK_PRODUCT_INTEGRATION"));
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

test("scene gate objetivo bloqueia Judge mesmo quando Risk selecionaria", async () => {
  const calls: string[] = [];
  const base = stubRouter({});
  const router = {
    describe: base.describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      calls.push(task);
      return base.complete(task, input);
    },
  };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "scene-invalid", name: "Produto [fact:foo]",
      description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => (error as { code?: string }).code === "GEN-REPAIR-EXHAUSTED",
  );
  assert.equal(calls.includes("CONTENT_BRIEF_GENERATION"), true);
  assert.equal(calls.includes("CONTENT_QUALITY_JUDGE"), false);
});

test("setup/test automático com script genérico seleciona Judge por semântica desconhecida", async () => {
  let judgeCalls = 0;
  const base = stubRouter({ briefResponse: () => ({ developmentSchemaVersion: 2, items: [{
    ...briefVariants[0], hook: "Tecido respirável", script: "Este produto tem tecido respirável.",
    development: briefVariants[0]!.development.map((bullet) => ({ ...bullet, text: bullet.text.replaceAll("respiravel", "respirável") })),
  }] }) });
  const result = await runFirstGeneration({
    productId: "p", jobId: "risk-setup-test", name: "Produto", description: "Tecido respirável",
    targetContentCount: 1, creatorContext: { allowedFormats: ["comparison"], allowedProductRoles: ["transformer"] },
    router: { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
      if (task === "CONTENT_QUALITY_JUDGE") judgeCalls++;
      return base.complete(task, input);
    } },
  });
  const moves = result.plannedV2![0]!.blueprint.blueprint.narrativeMoves;
  assert.ok(moves.includes("setup") && moves.includes("test"), "planner determinístico realmente selecionou setup/test");
  assert.equal(result.sceneSets[0]!.status, "AVAILABLE");
  assert.equal(result.preJudgeRiskAssessments[0]!.assessmentStatus, "PARTIAL");
  assert.equal(result.preJudgeRiskAssessments[0]!.riskBand, "NONE");
  assert.deepEqual(result.judgeSelectionDecisions[0]!.triggerCodes, ["RISK_PARTIAL_FAILSAFE"]);
  assert.equal(result.judgeSelectionDecisions[0]!.selected, true);
  assert.equal(judgeCalls, 1);
  assert.equal(result.judgeExecutionRecords[0]!.execution, "EXECUTED");
  assert.equal(result.briefs[0]!.script, "Este produto tem tecido respirável.");
});

test("atenção e resposta sustentadas no script permitem zero seleções reais sem Judge universal", async () => {
  let judgeCalls = 0;
  const script = "Pegue o tecido respirável. Repare no tecido porque o tecido respirável é o detalhe da peça.";
  const base = stubRouter({ briefResponse: () => ({ developmentSchemaVersion: 2, items: [{
    ...briefVariants[0], hook: "Por que olhar o tecido respirável?", script,
    development: briefVariants[0]!.development.map((bullet) => ({ ...bullet, text: bullet.text.replaceAll("respiravel", "respirável") })),
  }] }) });
  const result = await runFirstGeneration({
    productId: "p", jobId: "risk-supported-skip", name: "Produto", description: "Tecido respirável",
    targetContentCount: 1, creatorContext: { allowedFormats: ["pov"], allowedProductRoles: ["object_of_desire"] },
    router: { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
      if (task === "CONTENT_QUALITY_JUDGE") judgeCalls++;
      return base.complete(task, input);
    } },
  });
  assert.equal(result.preJudgeRiskAssessments[0]!.assessmentStatus, "AVAILABLE");
  assert.equal(result.preJudgeRiskAssessments[0]!.riskBand, "NONE");
  assert.deepEqual(result.judgeSelectionDecisions.map(({ selected, triggerCodes }) => ({ selected, triggerCodes })),
    [{ selected: false, triggerCodes: [] }]);
  assert.equal(judgeCalls, 0);
  assert.equal(result.judgeExecutionRecords[0]!.execution, "NOT_EXECUTED");
  assert.deepEqual(result.qualityAudits, []);
  assert.equal(result.briefs[0]!.script, script);
});

test("planner default mantém skip seletivo em recipe comum sustentada sem conector", async () => {
  let judgeCalls = 0;
  const script = "Eu achava que era só falar. O problema era essa apresentação. Que surpresa ao olhar de perto! Pegue o tecido respirável. Agora apresente o tecido respirável. O tecido respirável é o detalhe que eu queria destacar.";
  const base = stubRouter({ briefResponse: () => ({ developmentSchemaVersion: 2, items: [{
    ...briefVariants[0], hook: "Cansado de falar só do tecido respirável?", script,
    development: briefVariants[0]!.development.map((bullet) => ({ ...bullet, text: bullet.text.replaceAll("respiravel", "respirável") })),
  }] }) });
  const result = await runFirstGeneration({
    productId: "p", jobId: "risk-default-supported", name: "Produto", description: "Tecido respirável",
    targetContentCount: 1,
    router: { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
      if (task === "CONTENT_QUALITY_JUDGE") judgeCalls++;
      return base.complete(task, input);
    } },
  });
  assert.ok(result.plannedV2![0]!.blueprint.blueprint.attentionMechanisms.length > 1,
    "seletividade exercitada com attention composta escolhida pelo planner default");
  assert.equal(result.preJudgeRiskAssessments[0]!.assessmentStatus, "AVAILABLE");
  assert.equal(result.preJudgeRiskAssessments[0]!.policyVersion, "risk-policy.prejudge.v2");
  assert.deepEqual(result.judgeSelectionDecisions.map(({ selected, triggerCodes, policyVersion }) => ({ selected, triggerCodes, policyVersion })),
    [{ selected: false, triggerCodes: [], policyVersion: "risk-policy.prejudge.v2" }]);
  assert.equal(judgeCalls, 0);
  assert.equal(result.judgeExecutionRecords[0]!.execution, "NOT_EXECUTED");
  assert.equal(result.briefs[0]!.script, script);
});

test("pool V2 com menos origens que N falha fechado (sem fallback V1)", async () => {
  const taskCalls: string[] = [];
  const base = stubRouter({});
  const router = {
    describe: base.describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      taskCalls.push(task);
      // Duas origens Discovery para N=3: a composição V2 não deve inventar
      // terceira origem nem cair no planner legado.
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING")
        return { discoveryContractVersion: "2", hypotheses: [
          { commercialObjective: "c1", angle: "a1", coreMessage: "s1", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["mesmo benefício"], proofOptions: ["product:description"], commercialEffects: ["mesmo efeito"], evidenceRefs: ["product:description"], confidence: 0.9 },
          { commercialObjective: "c2", angle: "a2", coreMessage: "s2", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["mesmo benefício"], proofOptions: ["product:description"], commercialEffects: ["mesmo efeito"], evidenceRefs: ["product:description"], confidence: 0.9 },
        ] };
      return base.complete(task, input);
    },
  };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-v2-failclosed", name: "Produto", description: "Tecido respirável", targetContentCount: 3, router }),
    (error: unknown) => (error as { code?: string }).code === "GEN-PLANNER-DIVERSITY",
  );
  assert.equal(taskCalls.includes("CONTENT_PLAN_GENERATION"), false, "nenhum plano V1 no caminho V2");
});

test("adapter V2: restrições explícitas do creator sustentam multi-seleção determinística", () => {
  const evidence = { facts: ["Produto", "Tecido respirável"], refs: ["product:name", "product:description"] };
  // Etapa 3: pool EXATO da Discovery — hipóteses com sourceOpportunityId
  // server-owned; Strategy seleciona 2 dos 4 na ordem persistida.
  const hypotheses = Array.from({ length: 4 }, (_v, index) => ({
    sourceOpportunityId: `o${index + 1}`,
    commercialObjective: `argumento ${index + 1}`,
    angle: `benefício distinto ${index + 1}`,
    coreMessage: `argumento ${index + 1}`,
    relevantCapabilities: ["cap"],
    benefits: [`benefício distinto ${index + 1}`],
    proofOptions: ["p"],
    commercialEffects: [`argumento ${index + 1}`],
    evidenceRefs: ["product:description"],
    confidence: 0.9,
  }));
  const envelope = { discoveryContractVersion: "2" as const, hypotheses };
  const discoveryPool = discoveryPoolFromSelectedV2(envelope, ["o1", "o2", "o3", "o4"], evidence);
  const source = {
    jobId: "j-constraints",
    productId: "p",
    targetContentCount: 2,
    discoveryPool,
    evidence,
    creatorConstraints: { allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"], disallowedFormats: [], disallowedProductRoles: [] },
  };
  const plannerInput = buildPlannerInputV2(source);
  assert.equal(plannerInput.creativeSystemHash, sha256Hex(canonicalSerialization(loadCreativeSystem(plannerInput.skillBinding.platformSkillVersion))));
  for (const mismatch of [
    { compatibilityPolicyVersion: "CREATIVE_COMPATIBILITY_V1" },
    { creativeSystemHash: "0".repeat(64) },
    { compatibilityPolicyVersion: undefined },
    { creativeSystemHash: undefined },
  ]) {
    const rejected = planPortfolio({ ...plannerInput, ...mismatch } as unknown as PlannerInput);
    assert.equal(rejected.ok, false, "proveniência divergente ou ausente falha fechado");
    if (!rejected.ok) assert.equal(rejected.error.code, "GEN-CS-VERSION");
  }
  const result = runPlannerV2(source);
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

test("V2 aceita comunicação natural sem ação/conector e mantém bullets legíveis após persistência", async () => {
  let calls = 0;
  const router = stubRouter({ briefResponse: () => {
    calls += 1;
    const envelope = validEnvelope();
    envelope.items[0]!.development = [
      { text: "Tecido respirável na rotina.", action: "", rationale: "", factRefs: ["product:description"], cta: "Confira o produto na página." },
      { text: "O tecido respirável é o detalhe deste produto.", action: "", rationale: "", factRefs: ["product:description"], cta: "Confira o produto na página." },
    ];
    return envelope;
  } });
  const result = await runFirstGeneration({ productId: randomUUID(), jobId: "j-natural-no-connector", name: "Produto", description: "Tecido respirável", targetContentCount: 1, creatorContext: {}, router });
  assert.equal(calls, 1, "sinal advisory não provoca retry");
  assert.equal(result.briefs.length, 1);
  const bullets = result.developmentBullets?.[0]?.bullets;
  assert.ok(bullets);
  assert.deepEqual(validateV2DevelopmentBullets(bullets), bullets, "reader preserva comunicação sem inventar rationale");
  assert.ok(bullets.every((bullet) => bullet.rationale === ""));
});
