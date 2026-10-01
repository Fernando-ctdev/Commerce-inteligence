import assert from "node:assert/strict";
import test from "node:test";
import { buildRiskAssessment, validateJudgeExecutionRecord, validateRiskAssessment } from "./risk-assessment";

const report = { briefId: "c:b", gateVersion: 3, factualStatus: "UNSUPPORTED" as const, claimType: "objetivo" as const, evidenceRefs: ["fact:description"], structuralStatus: "PASS" as const, platformStatus: "PASS" as const, varietyStatus: "PASS" as const, issues: ["claim sem suporte"], decision: "REPAIR" as const };

test("risk assessment é interno, deduplicado, ordenado e deriva banda", () => {
  const assessment = buildRiskAssessment({ policyVersion: "e5", subject: { jobId: "job-1", contentId: "content-1" }, evidenceRefs: ["fact:description"], hardGate: { status: "AVAILABLE", reports: [report, report] }, judge: { execution: "FAILED", records: [{ contentId: "content-1", round: 1, execution: "FAILED", parts: [], errorCode: "GEN-PROVIDER" }] }, blueprintFixture: "NOT_EXECUTED", scenes: [{ status: "ERROR" }, { status: "ERROR" }] });
  assert.equal(assessment.contractVersion, "risk-assessment.v1");
  assert.equal(assessment.assessmentStatus, "PARTIAL");
  assert.equal(assessment.riskBand, "HIGH");
  assert.deepEqual(assessment.findings.map(({ code }) => code), ["HARD_FACTUALITY", "BLUEPRINT_NOT_EXECUTED", "JUDGE_FAILED", "SCENE_ERROR"]);
  assert.deepEqual(validateRiskAssessment(assessment, ["fact:description"]), assessment);
});

test("risk assessment falha fechado para extras, enums e refs desconhecidas", () => {
  const base = buildRiskAssessment({ policyVersion: "e5", subject: { jobId: "job-1" }, evidenceRefs: ["fact:description"], hardGate: { status: "AVAILABLE", reports: [report] }, judge: { execution: "EXECUTED", records: [] }, blueprintFixture: "EXECUTED", scenes: [{ status: "ERROR" }] });
  assert.throws(() => validateRiskAssessment({ ...base, extra: true }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, subject: { ...base.subject, part: "inventado" } }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [{ ...base.findings[0], code: "INVENTADO" }] }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [{ ...base.findings[0], messageCode: "risk.inventado" }] }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [{ ...base.findings[0], domain: "INVENTADO" }] }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [{ ...base.findings[0], severity: "INVENTADO" }] }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [{ ...base.findings[0], source: "INVENTADO" }] }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [{ ...base.findings[0], evidenceRefs: ["fact:unknown"] }] }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [...base.findings, ...base.findings] }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, findings: [...base.findings].reverse() }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, assessmentStatus: "PARTIAL" }, ["fact:description"]));
  assert.throws(() => validateRiskAssessment({ ...base, riskBand: "LOW" }, ["fact:description"]));
});

test("JudgeExecutionRecord permite audit apenas quando executado e falha fechado", () => {
  assert.equal(validateJudgeExecutionRecord({ contentId: "content-1", round: 1, execution: "FAILED", parts: [], errorCode: "GEN-PROVIDER" }).execution, "FAILED");
  assert.throws(() => validateJudgeExecutionRecord({ contentId: "content-1", round: 1, execution: "FAILED", parts: [{}] }));
  assert.throws(() => validateJudgeExecutionRecord({ contentId: "content-1", round: 1, execution: "NOT_EXECUTED", parts: [], errorCode: "GEN-PROVIDER" }));
});

// ─── Stage 5: PreJudgeRiskAssessmentV2 + JudgeSelectionDecisionV1 ────────────
// SPEC Etapa 5 §7: assessment pré-Judge determinístico; Risk SÓ roteia (nunca
// entrega); PARTIAL/UNAVAILABLE seleciona Judge (fail-safe, nunca pula em
// silêncio); decisão persistível e reproduzível. Registry fechado ADR-033.
import { buildPreJudgeRiskAssessment, selectForJudge, validateJudgeSelectionDecision, type PreJudgeRiskInputV2 } from "./risk-assessment";

const blueprintOk = { attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], format: "pov", narrativeMoves: ["setup", "product_entry", "payoff"], productRole: "solution" };
const policy = { version: "risk-policy.prejudge.v2", judgeIfRiskBandAtLeast: "MEDIUM" as const, scriptMaxChars: 400 };
const briefOk = { hook: "Por que olhar o tecido respirável?", development: ["Mostre o tecido respirável no calor"], script: "Pegue o tecido respirável. Repare no tecido porque o tecido respirável é o detalhe da peça.", cta: "Confira o tecido na página." };
const baseInput: PreJudgeRiskInputV2 = {
  policyVersion: "risk-policy.prejudge.v2",
  subject: { jobId: "job-1", contentId: "content-1" },
  brief: briefOk,
  blueprint: blueprintOk,
  blueprintStructureCovered: true,
  scenes: { status: "AVAILABLE" },
  memory: { status: "EMPTY" },
  productTerms: ["tecido", "respirável", "calor"],
  production: { signals: [] },
  selectionPolicy: policy,
};

test("pré-Judge V2: script sem payoff é HIGH e seleciona; repetição isolada é LOW e não seleciona", () => {
  const high = buildPreJudgeRiskAssessment({ ...baseInput, brief: { ...briefOk, script: "   " } });
  assert.equal(high.assessment.contractVersion, "risk-assessment.v2");
  assert.equal(high.assessment.assessmentStatus, "PARTIAL");
  assert.equal(high.assessment.riskBand, "HIGH");
  assert.ok(high.assessment.findings.some(({ code }) => code === "PAYOFF_ABSENT"));
  const highDecision = selectForJudge(high.assessment, policy);
  assert.equal(highDecision.selected, true);
  assert.deepEqual(highDecision.triggerCodes, ["PAYOFF_ABSENT", "RISK_PARTIAL_FAILSAFE", "WEAK_PRODUCT_INTEGRATION"]);
  assert.deepEqual(validateJudgeSelectionDecision(highDecision), highDecision);

  const low = buildPreJudgeRiskAssessment({ ...baseInput, memory: { status: "AVAILABLE", priorMechanisms: ["curiosity"] } });
  assert.equal(low.assessment.riskBand, "LOW");
  assert.ok(low.assessment.findings.some(({ code }) => code === "ATTENTION_MECHANISM_REPEAT"));
  const lowDecision = selectForJudge(low.assessment, policy);
  assert.equal(lowDecision.selected, false, "LOW < MEDIUM baseline: não seleciona");
  assert.deepEqual(lowDecision.triggerCodes, ["ATTENTION_MECHANISM_REPEAT"]);
});

test("pré-Judge V2: Blueprint ausente é UNAVAILABLE com fail-safe selecionando", () => {
  const missing = buildPreJudgeRiskAssessment({ ...baseInput, blueprint: undefined });
  assert.equal(missing.assessment.sources.blueprint, "UNAVAILABLE");
  assert.equal(missing.assessment.assessmentStatus, "UNAVAILABLE");
  const decision = selectForJudge(missing.assessment, policy);
  assert.equal(decision.selected, true, "fail-safe: UNAVAILABLE nunca pula o Judge");
  assert.ok(decision.triggerCodes.includes("RISK_UNAVAILABLE_FAILSAFE"));
});

test("pré-Judge V2: fonte indeterminada é PARTIAL e fail-safe seleciona; determinável AVAILABLE não", () => {
  const partial = buildPreJudgeRiskAssessment({ ...baseInput, blueprintStructureCovered: undefined });
  assert.equal(partial.assessment.assessmentStatus, "PARTIAL");
  const partialDecision = selectForJudge(partial.assessment, policy);
  assert.equal(partialDecision.selected, true, "fail-safe: PARTIAL seleciona Judge");
  assert.ok(partialDecision.triggerCodes.includes("RISK_PARTIAL_FAILSAFE"));
  assert.deepEqual(selectForJudge(partial.assessment, policy), partialDecision, "decisão reproduzível (mesma entrada → mesma decisão)");

  const available = buildPreJudgeRiskAssessment(baseInput);
  assert.equal(available.assessment.assessmentStatus, "AVAILABLE");
  assert.equal(available.assessment.riskBand, "NONE");
  assert.equal(selectForJudge(available.assessment, policy).selected, false);
  assert.deepEqual(validateJudgeSelectionDecision(selectForJudge(available.assessment, policy)).triggerCodes, []);
  assert.deepEqual(available.assessment.findings, []);
});

test("pré-Judge V2: repetições de mechanism/effect/recipe/structure viram findings deduplicados; integração fraca e script longo são MEDIUM", () => {
  const repeats = buildPreJudgeRiskAssessment({
    ...baseInput,
    blueprint: { ...blueprintOk, recipeId: "recipe-1" },
    commercialEffects: ["desejo"],
    memory: { status: "AVAILABLE", priorMechanisms: ["curiosity"], priorEffects: ["identification"], priorCommercialEffects: ["desejo"], priorRecipes: ["recipe-1"], priorStructures: ["setup>product_entry>payoff"] },
  });
  const codes = repeats.assessment.findings.map(({ code }) => code);
  for (const expected of ["ATTENTION_MECHANISM_REPEAT", "COMMERCIAL_EFFECT_REPEAT", "PSYCHOLOGICAL_EFFECT_REPEAT", "RECIPE_SATURATION", "STRUCTURE_REPEAT"] as const) {
    assert.ok(codes.includes(expected), `esperado ${expected}`);
  }
  assert.equal(new Set(codes).size, codes.length, "findings deduplicados");
  assert.deepEqual(codes, [...codes].sort(), "findings ordenados");

  const weak = buildPreJudgeRiskAssessment({ ...baseInput, brief: { ...briefOk, development: ["Mostre o diferencial na prática"], script: "Veja como funciona na prática." } });
  assert.ok(weak.assessment.findings.some(({ code, severity }) => code === "WEAK_PRODUCT_INTEGRATION" && severity === "MEDIUM"));

  const onlyInInstructions = buildPreJudgeRiskAssessment({ ...baseInput, brief: { ...briefOk, script: "Mostre o produto." } });
  assert.ok(onlyInInstructions.assessment.findings.some(({ code }) => code === "WEAK_PRODUCT_INTEGRATION"), "produto na instrução de desenvolvimento não prova integração no script");

  const long = buildPreJudgeRiskAssessment({ ...baseInput, brief: { ...briefOk, script: "x".repeat(401) } });
  assert.ok(long.assessment.findings.some(({ code }) => code === "SCRIPT_TOO_LONG"));

  const decision = selectForJudge(weak.assessment, policy);
  assert.equal(decision.policyVersion, "risk-policy.prejudge.v2");
  assert.equal(decision.contentId, "content-1");
  assert.equal(decision.selected, true);
  assert.throws(() => validateJudgeSelectionDecision({ ...decision, extra: true }));
  assert.throws(() => validateJudgeSelectionDecision({ ...decision, triggerCodes: ["INVENTADO"] }));
});

test("pré-Judge V2: repetição estrutural preserva a sequência narrativa, não apenas seus moves", () => {
  const memory = { status: "AVAILABLE" as const, priorStructures: ["payoff>gancho"] };
  const exact = buildPreJudgeRiskAssessment({
    ...baseInput,
    blueprint: { ...blueprintOk, narrativeMoves: ["payoff", "gancho"] },
    memory,
  }).assessment;
  const reversed = buildPreJudgeRiskAssessment({ ...baseInput, memory }).assessment;
  assert.ok(exact.findings.some(({ code }) => code === "STRUCTURE_REPEAT"));
  assert.equal(reversed.findings.some(({ code }) => code === "STRUCTURE_REPEAT"), false);
});

test("pré-Judge V2: espaços de IDs distintos nunca cruzam; comercial repetido dispara COMMERCIAL_EFFECT_REPEAT", () => {
  // priorEffects é espaço psicológico; priorCommercialEffects é comercial.
  const repeated = buildPreJudgeRiskAssessment({
    ...baseInput,
    commercialEffects: ["desejo"],
    memory: { status: "AVAILABLE", priorEffects: ["identification"], priorCommercialEffects: ["desejo"] },
  });
  const repeatedCodes = repeated.assessment.findings.map(({ code }) => code);
  assert.ok(repeatedCodes.includes("PSYCHOLOGICAL_EFFECT_REPEAT"));
  assert.ok(repeatedCodes.includes("COMMERCIAL_EFFECT_REPEAT"));

  const disjoint = buildPreJudgeRiskAssessment({
    ...baseInput,
    commercialEffects: ["desejo"],
    memory: { status: "AVAILABLE", priorEffects: ["aspiration"], priorCommercialEffects: ["urgência"] },
  });
  const disjointCodes = disjoint.assessment.findings.map(({ code }) => code);
  assert.equal(disjointCodes.some((code) => code.endsWith("_REPEAT")), false, "IDs de espaços distintos não geram falso positivo");

  const absent = buildPreJudgeRiskAssessment({
    ...baseInput,
    memory: { status: "AVAILABLE", priorCommercialEffects: ["desejo"] },
  });
  assert.equal(absent.assessment.findings.some(({ code }) => code === "COMMERCIAL_EFFECT_REPEAT"), false, "sem commercialEffects do candidato o detector é inaplicável");
});

test("cenas automáticas não sustentam realização: setup/test sem teste é PARTIAL, não rejeição lexical", () => {
  const generic = { ...briefOk, hook: "Tecido respirável no calor", script: "Sinta o tecido respirável no uso." };
  const input = { ...baseInput, brief: generic, blueprint: { ...blueprintOk, narrativeMoves: ["setup", "test"] } };
  const { assessment } = buildPreJudgeRiskAssessment(input);
  assert.equal(assessment.sources.scenes, "AVAILABLE");
  assert.equal(assessment.assessmentStatus, "PARTIAL");
  assert.equal(assessment.riskBand, "NONE");
  assert.deepEqual(assessment.findings, []);
  assert.deepEqual(selectForJudge(assessment, policy).triggerCodes, ["RISK_PARTIAL_FAILSAFE"]);
  assert.equal(selectForJudge(assessment, policy).selected, true);
});

test("indício de baixo risco exige atenção e resposta no script, não apenas no development", () => {
  for (const brief of [
    { ...briefOk, hook: "Tecido respirável" },
    { ...briefOk, development: [briefOk.script], script: "Pegue o tecido respirável." },
  ]) {
    const { assessment } = buildPreJudgeRiskAssessment({ ...baseInput, brief });
    assert.equal(assessment.assessmentStatus, "PARTIAL");
    assert.equal(selectForJudge(assessment, policy).selected, true);
  }
});

test("recipe comum composta tem indícios sem exigir conector ou atenção única", () => {
  const blueprint = { ...blueprintOk, attentionMechanisms: ["failure", "pattern_interrupt"],
    narrativeMoves: ["setup", "failure", "reaction", "product_entry", "resolution", "payoff"] };
  const brief = { ...briefOk, hook: "Cansado de falar só do tecido respirável?",
    script: "Eu achava que era só falar. O problema era essa apresentação. Que surpresa ao olhar de perto! Pegue o tecido respirável. Agora apresente o tecido respirável. O tecido respirável é o detalhe que eu queria destacar." };
  const { assessment } = buildPreJudgeRiskAssessment({ ...baseInput, blueprint, brief });
  assert.equal(assessment.assessmentStatus, "AVAILABLE");
  assert.equal(selectForJudge(assessment, policy).selected, false);
  const missingReaction = buildPreJudgeRiskAssessment({ ...baseInput, blueprint,
    brief: { ...brief, script: brief.script.replace("Que surpresa ao olhar de perto!", "") } }).assessment;
  assert.equal(missingReaction.assessmentStatus, "PARTIAL");
  assert.equal(selectForJudge(missingReaction, policy).selected, true);
});
