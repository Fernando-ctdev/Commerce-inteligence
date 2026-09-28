// Etapa 4 V2 — contrato BackDev ↔ runtime (nota canônica "Etapa4-V2 Contrato BackDev").
// Pin: projeção allowlisted de realização (sem catálogo literal/selectedPatterns/IDs),
// leitor versionado v2/v1/legacy por developmentSchemaVersion, e cenas transitórias
// como SceneSetOutcome (persistem somente ContentSceneSet; NUNCA no brief).
import assert from "node:assert/strict";
import test from "node:test";
import {
  BRIEF_GENERATION_POLICY_V2,
  ENGINE_V2_SKILL_BINDING,
  buildRealizationContext,
  buildSceneSkeleton,
  buildRealizationInput,
  buildSceneSkeletonSets,
  evidenceRefCatalog,
  evidenceRefFor,
  readBriefPayload,
} from "./engine-v2";
import { GATE_POLICY_VERSION } from "./gates";
import { buildRiskAssessment, validateRiskAssessment, type RiskAssessmentInput } from "./risk-assessment";
import { PLANNER_MEMORY_SIGNALS_V1 } from "./planner-harness/types";
import type { PlannedOpportunityV2 } from "./planner-harness/types";
import { briefPayloadForPersistence } from "./worker";

// Contração do vocabulário de erro GEN-* sem cast inline (narrowing por `in`).
const codeOf = (error: unknown): unknown => (error && typeof error === "object" && "code" in error ? error.code : undefined);

const evidence = {
  facts: ["Camiseta", "tecido respirável", "costura reforçada"],
  refs: ["product:name", "product:description", "product:features"],
};

const planned: PlannedOpportunityV2 = {
  opportunityContractVersion: "2",
  candidateKey: "candidate-1",
  position: 1,
  sourceOpportunityId: "source-1",
  evidenceRefs: [evidenceRefFor("product:description", "tecido respirável")],
  commercialObjective: "Apresentar o conforto",
  angle: "Conforto diário",
  coreMessage: "Tecido respirável para o dia a dia",
  desiredViewerResponse: "Conhecer o produto",
  noveltyTargets: ["conforto"],
  hookMechanism: "demonstration",
  blueprint: {
    blueprintContractVersion: "1",
    creativeSystemVersion: ENGINE_V2_SKILL_BINDING.creativeSystemVersion,
    platformSkillVersion: ENGINE_V2_SKILL_BINDING.platformSkillVersion,
    blueprint: {
      attentionMechanisms: ["curiosity"],
      psychologicalEffects: ["identification"],
      format: "pov",
      narrativeMoves: ["setup", "payoff"],
      productRole: "solution",
    },
  },
};

const brief = {
  contentId: "content-1",
  briefVersionId: "brief-1",
  version: 1 as const,
  angle: "Conforto diário",
  hook: "Veja o tecido respirável",
  development: [
    "Mostre o tecido respirável para explicar o conforto",
    "Destaque a costura reforçada para mostrar o acabamento",
  ],
  script: "Mostre os detalhes da camiseta.",
  cta: "Confira o produto.",
};

const bullets = [
  { text: brief.development[0]!, action: "Mostre", rationale: "para explicar o conforto", factRefs: ["product:description"], cta: "Confira o produto." },
  { text: brief.development[1]!, action: "Destaque", rationale: "para mostrar o acabamento", factRefs: ["product:features"], cta: "Confira o produto." },
];

// Memória com armadilha: nenhum campo arbitrário pode cruzar a projeção.
const memoryTrap = { quota: 9, selectedPatterns: ["não pode vazar"], tenantId: "t1", status: "RUNNING" };

test("V2 realiza somente a projeção allowlisted, sem catálogo, padrões literais ou IDs", () => {
  const input = buildRealizationInput(planned, evidence, memoryTrap);
  const context = buildRealizationContext(input);
  const serialized = JSON.stringify({ input, context });

  // Allowlist fechada CANÔNICA (nota §4.2): qualquer campo novo no envelope quebra aqui.
  const allowlist = ["angle", "blueprint", "commercialObjective", "coreMessage", "creatorConstraints", "desiredViewerResponse", "hookMechanism", "memoryConstraints", "platformRules", "productFacts", "validatedEvidenceRefs"].sort();
  assert.deepEqual(Object.keys(input).sort(), allowlist);
  assert.deepEqual(Object.keys(context).sort(), allowlist);

  for (const forbidden of ["selectedPatterns", "creativeCatalog", "hooks", "ctas", "creativeDirection", "contentId", "briefVersionId", "jobId", "quota", "status", "tenantId", "instruction"]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} não cruza o contexto de realização`);
  }
  // Memória legada sem envelope de sinais projeta []; envelope canônico válido
  // projeta só o marcador (com armadilha selectedPatterns que não vaza).
  assert.deepEqual(buildRealizationInput(planned, evidence, memoryTrap).memoryConstraints, []);
  assert.deepEqual(
    buildRealizationInput(planned, evidence, {
      ...memoryTrap,
      signalsSchemaVersion: PLANNER_MEMORY_SIGNALS_V1,
      signals: [{ signalsSchemaVersion: PLANNER_MEMORY_SIGNALS_V1, attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], narrativeShape: ["setup"] }],
    }).memoryConstraints,
    ["signalsSchemaVersion:PLANNER_MEMORY_SIGNALS_V1"],
  );
  // Campos canônicos: productFacts projetado da evidência (sem IDs), constraints
  // neutras do Creative System e platformRules tipadas.
  assert.equal(input.productFacts.fixtureProductRef, "product");
  assert.deepEqual(input.productFacts.fields, { name: "Camiseta", description: "tecido respirável", features: "costura reforçada" });
  assert.deepEqual(input.productFacts.evidenceRefs, evidenceRefCatalog(evidence));
  assert.deepEqual(input.creatorConstraints.disallowedFormats, []);
  assert.deepEqual(input.creatorConstraints.disallowedProductRoles, []);
  assert.ok(input.creatorConstraints.allowedFormats.includes("pov"));
  assert.ok(input.creatorConstraints.allowedProductRoles.includes("solution"));
  assert.equal(typeof input.platformRules, "object");
  // hookMechanism é bucket opaco; refs validadas Ecoam as EvidenceRef tipadas da oportunidade.
  assert.equal(input.hookMechanism, "demonstration");
  assert.deepEqual(input.validatedEvidenceRefs, planned.evidenceRefs);
  assert.equal(BRIEF_GENERATION_POLICY_V2, "BRIEF_GENERATION_POLICY_V1");
});

test("reader V2/V1/legacy discrimina por developmentSchemaVersion, preserva bullets V2 e falha fechado", () => {
  const v2 = readBriefPayload({ ...brief, version: 2, developmentSchemaVersion: 2, development: bullets });
  assert.equal(v2.schema, "v2");
  assert.deepEqual(v2.brief.development, brief.development);
  assert.deepEqual(v2.brief.bullets, bullets, "bullets canônicos permanecem disponíveis no runtime");
  assert.equal("scenes" in v2.brief, false);

  const v1 = readBriefPayload({ ...brief, version: 1 });
  assert.equal(v1.schema, "v1");
  assert.deepEqual(v1.brief.development, brief.development);

  const legacy = readBriefPayload({ ...brief, scenes: ["não persistir no brief"], bullets });
  assert.equal(legacy.schema, "legacy");
  assert.equal("scenes" in legacy.brief, false, "scenes legadas são strip na leitura");
  assert.equal(legacy.brief.bullets, undefined, "bullets órfãos sem version não são readoptados");

  // v2 exige AMBOS os marcadores (nota: version===2 && developmentSchemaVersion===2).
  assert.throws(
    () => readBriefPayload({ ...brief, version: 2, development: bullets }),
    (error: unknown) => codeOf(error) === "GEN-SCHEMA",
    "V2 sem developmentSchemaVersion=2 é inválido",
  );
  assert.throws(
    () => readBriefPayload({ ...brief, version: 2, developmentSchemaVersion: 2, development: bullets.map(({ factRefs: _factRefs, ...rest }) => rest) }),
    (error: unknown) => codeOf(error) === "GEN-SCHEMA",
    "bullet V2 sem factRefs é inválido",
  );
  assert.throws(() => readBriefPayload({ ...brief, development: ["só um"] }), (error: unknown) => codeOf(error) === "GEN-SCHEMA");
  assert.throws(() => readBriefPayload(null), (error: unknown) => codeOf(error) === "GEN-SCHEMA");
});

test("writer↔reader: payload de persistência V2 é lido de volta como v2 com development projetado", () => {
  const persisted = briefPayloadForPersistence(brief, bullets);
  assert.equal(persisted.version, 2);
  assert.equal(persisted.developmentSchemaVersion, 2);
  assert.equal("scenes" in persisted, false, "cenas nunca voltam ao payload do brief");
  const round = readBriefPayload(persisted);
  assert.equal(round.schema, "v2");
  assert.deepEqual(round.brief.development, brief.development);
});

test("cenas V2 são sets transitórios determinísticos separados do brief (sem LLM: chamada pura, sem router)", () => {
  const first = buildSceneSkeletonSets([brief], evidence, {});
  const second = buildSceneSkeletonSets([brief], evidence, {});
  assert.deepEqual(first, second, "skeleton é determinístico");
  const set = first[0]!;
  assert.equal(set.contentId, brief.contentId);
  assert.equal(set.briefVersionId, brief.briefVersionId);
  assert.equal(set.status, "AVAILABLE", "skeleton derivado de evidência passa no gateSceneSet vigente");
  assert.ok(set.scenes.length >= 2 && set.scenes.length <= 6);
  assert.equal(set.generated, set.scenes.length);
  assert.equal(set.backfilled, false);
  // E5/Review: generated é o tamanho do skeleton ANTES do gate; dropped é o
  // remainder — nunca kept.length.
  const rawSkeleton = buildSceneSkeleton(brief, evidence);
  assert.equal(set.generated, rawSkeleton.length, "generated conta o skeleton pré-gate");
  assert.equal(set.dropped, rawSkeleton.length - set.scenes.length);
  const policy = "gatePolicyVersion" in set ? set.gatePolicyVersion : undefined;
  assert.equal(policy, GATE_POLICY_VERSION);
  assert.equal("scenes" in brief, false, "ContentBriefVersion não recebe cenas");
});

// ─── E5: contrato JudgeExecutionRecord (round inteiro >= 1 em todos) ────────
test("JudgeExecutionRecord: round >= 1 em todos os estados; round 0 rejeitado", () => {
  const record = (execution: RiskAssessmentInput["judge"]["execution"], round: number, extra: Record<string, unknown> = {}): RiskAssessmentInput => ({
    policyVersion: "risk-policy.v1",
    subject: { jobId: "j-judge", contentId: "c1" },
    evidenceRefs: [],
    hardGate: { status: "NOT_EXECUTED", reports: [] },
    blueprintFixture: "NOT_APPLICABLE",
    scenes: [],
    judge: { execution: "NOT_APPLICABLE", records: [{ contentId: "c1", round, execution, parts: [], ...extra }] },
  });

  // Estados sem auditoria: round 1 aceito.
  assert.doesNotThrow(() => validateRiskAssessment(buildRiskAssessment(record("NOT_APPLICABLE", 1)), []));
  assert.doesNotThrow(() => validateRiskAssessment(buildRiskAssessment(record("NOT_EXECUTED", 1)), []));
  // FAILED: round 1 + errorCode permitido.
  assert.doesNotThrow(() => validateRiskAssessment(buildRiskAssessment(record("FAILED", 1, { errorCode: "GEN-PROVIDER" })), []));
  // EXECUTED: round 1 (audit interno 0-based convertido) sem errorCode.
  assert.doesNotThrow(() => validateRiskAssessment(buildRiskAssessment(record("EXECUTED", 1)), []));

  // Round 0 é rejeitado em qualquer estado — sem masking.
  for (const execution of ["NOT_APPLICABLE", "NOT_EXECUTED", "FAILED", "EXECUTED"] as const) {
    assert.throws(() => validateRiskAssessment(buildRiskAssessment(record(execution, 0)), []));
  }
});
