import assert from "node:assert/strict";
import { test } from "node:test";
import draft from "./full-e6/draft.json";
import rubric from "./full-e6/rubrics.json";
import { buildFullE6Report, prepareFullE6, prepareFullE6Assignments, preflightFullE6, summarizeFullE6Arm, verifyFullE6Draft, FULL_E6_OPERATIONAL_METRICS, type FullE6Observation, type FullE6ExecutedObservation, type FullE6Annotation } from "./full-e6";
import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";

const RECURRENT_CASE = "e6-memory-01";

test("E6 draft cobre população, declara recurrence NOT_EXECUTED e não habilita coleta live", () => {
  const first = verifyFullE6Draft();
  assert.equal(first.eligibleForLiveCollection, false);
  assert.equal(first.caseHashes.length, draft.cases.length);
  assert.deepEqual(first.capabilityAvailability, [
    { caseId: RECURRENT_CASE, generation: "RECURRENT", status: "NOT_EXECUTED", reason: "DEPENDENCY_SLICE_008", requiredForAcceptance: true },
  ]);
  assert.deepEqual(first, verifyFullE6Draft(), "hashes estáveis para os mesmos bytes canônicos");
});

test("E6 rejeita case adulterado, rubrica incompleta e promoção sem threshold", () => {
  const changed = structuredClone(draft);
  changed.cases[0]!.product.description = "https://example.com/produto";
  assert.throws(() => verifyFullE6Draft(changed, rubric), /URL ou credencial/);
  const duplicate = structuredClone(draft);
  duplicate.cases[1]!.caseId = duplicate.cases[0]!.caseId;
  assert.throws(() => verifyFullE6Draft(duplicate, rubric), /duplicado/);
  const missing = structuredClone(rubric);
  missing.dimensions.pop();
  assert.throws(() => verifyFullE6Draft(draft, missing), /rubrica incompleta/);
  const promoted = structuredClone(draft);
  promoted.status = "FROZEN";
  assert.throws(() => verifyFullE6Draft(promoted, rubric), /thresholds aprovados/);
  const withoutRecurrence = structuredClone(draft);
  withoutRecurrence.cases = withoutRecurrence.cases.filter((item) => item.generation !== "RECURRENT");
  assert.throws(() => verifyFullE6Draft(withoutRecurrence, rubric), /população incompleta/);
});

const observation = (arm: "baseline" | "candidate"): FullE6ExecutedObservation => ({
  executionStatus: "EXECUTED", caseId: draft.cases[0]!.caseId, arm, evidenceClass: "OFFLINE",
  inputHash: verifyFullE6Draft().caseHashes[0]!.inputHash,
  jobSeed: sha256Hex(canonicalSerialization([draft.arms.jobSeedDerivation, draft.cases[0]!.caseId, verifyFullE6Draft().caseHashes[0]!.inputHash])),
  controlsHash: "a".repeat(64), provenanceHash: "b".repeat(64),
  status: "SUCCEEDED_PARTIAL", delivered: 3, requested: 5, hardFailures: 2, sceneFailures: 1,
  judge: { executed: 1, notExecuted: 1, failed: 1, notApplicable: 0 },
  calls: [{ capability: "CONTENT_BRIEF_GENERATION", tier: "MID", attempt: 1, retry: false, repair: false,
    provider: "OFFLINE_FIXTURE", model: "not-a-live-model", parametersHash: "0".repeat(64),
    tokens: { input: 100, output: 50, cache: null, reasoning: null },
    cost: { amountMinor: "3", currency: "USD", pricingHash: "c".repeat(64), source: "REPORTED", complete: true, evidenceRef: "attempt-1" },
    latencyMs: 200 }],
  totalLatencyMs: 400,
});

const notExecuted = (arm: "baseline" | "candidate"): FullE6Observation => ({
  executionStatus: "NOT_EXECUTED", caseId: RECURRENT_CASE, arm, reason: "DEPENDENCY_SLICE_008", requiredForAcceptance: true,
});

test("preparation v2 nunca inventa coleta e pré-flight bloqueia por dependência, não por placeholder", () => {
  const prepared = prepareFullE6();
  assert.equal(prepared.artifactVersion, "full-e6-preparation.v2");
  assert.deepEqual(prepared.observations, []);
  assert.equal(prepared.preflight.status, "BLOCKED");
  assert.ok(prepared.preflight.blockers.includes("RECURRENCE_DEPENDS_ON_SLICE_008"));
  assert.equal(prepared.preflight.blockers.includes("RECURRENT_INPUT_SNAPSHOT_NOT_FROZEN"), false);
  assert.equal(prepared.preflight.blockers.includes("THRESHOLDS_NOT_APPROVED"), true);
  assert.deepEqual(preflightFullE6(), prepared.preflight);
  const plan = prepared.collectionPlan.find((entry) => entry.caseId === RECURRENT_CASE)!;
  assert.equal(plan.executionPolicy, "DEFERRED");
  assert.equal(plan.dependency, "SLICE_008");
  assert.equal(plan.requiredForAcceptance, true);
  const ordinary = prepared.collectionPlan.find((entry) => entry.caseId === "e6-utility-01")!;
  assert.equal(ordinary.executionPolicy, "REQUIRED");
  assert.equal(ordinary.dependency, null);
});

test("offline observations cannot become live cost, latency or subjective evidence", () => {
  const report = buildFullE6Report([observation("baseline"), observation("candidate")]);
  assert.equal(report.reportVersion, "full-e6-report.v2");
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.acceptanceStatus, "V2_DEFAULT_PENDING_ACCEPTANCE");
  assert.equal(report.pairs[0]!.architecture.baseline!.cost.state, "UNAVAILABLE");
  assert.equal(report.pairs[0]!.architecture.baseline!.latency.state, "UNAVAILABLE");
  assert.ok(report.subjective.every((item) => item.state === "NOT_ANNOTATED"));
  assert.deepEqual(report, buildFullE6Report([observation("baseline"), observation("candidate")]));
});

test("architecture ratios use physical calls, delivered contents and exact minor-unit cost", () => {
  const item = observation("candidate");
  item.evidenceClass = "LIVE_PROVIDER";
  const metrics = summarizeFullE6Arm(item, 2);
  assert.equal(metrics.calls, 1);
  assert.equal(metrics.contentsPerCall, 3);
  assert.equal(metrics.cost.state, "OBSERVED");
  assert.equal(metrics.cost.amountMinor, "3");
  assert.equal(metrics.cost.pricingHash, "c".repeat(64));
  assert.equal(metrics.cost.perDeliveredContent, "0.01");
  assert.equal(typeof metrics.cost.perDeliveredContent, "string");
  assert.equal(metrics.cost.roundingPolicy, "ISO_MINOR_UNIT_SCALE_BIGINT_HALF_UP");
  assert.equal(metrics.latency.contentsPerSecond, 7.5);
  item.calls[0]!.cost = null;
  assert.equal(summarizeFullE6Arm(item).cost.state, "UNAVAILABLE");
  item.delivered = 0;
  item.status = "FAILED";
  item.judge = { executed: 0, notExecuted: 0, failed: 0, notApplicable: 0 };
  item.calls[0]!.cost = { amountMinor: "3", currency: "USD", pricingHash: "c".repeat(64), source: "REPORTED", complete: true, evidenceRef: "attempt-1" };
  assert.equal(summarizeFullE6Arm(item).cost.perDeliveredContent, null);
});

test("perDeliveredContent usa minorUnitExponent ISO com BigInt exato (USD2/JPY0/KWD3) e half-up em minor units", () => {
  const usd = observation("candidate");
  usd.evidenceClass = "LIVE_PROVIDER";
  assert.equal(summarizeFullE6Arm(usd, 2).cost.perDeliveredContent, "0.01");
  const jpy = observation("candidate");
  jpy.evidenceClass = "LIVE_PROVIDER";
  jpy.calls[0]!.cost!.amountMinor = "5000";
  assert.equal(summarizeFullE6Arm(jpy, 0).cost.perDeliveredContent, "1667", "5000/3 half-up em yen inteiro");
  const kwd = observation("candidate");
  kwd.evidenceClass = "LIVE_PROVIDER";
  kwd.calls[0]!.cost!.amountMinor = "1234567";
  assert.equal(summarizeFullE6Arm(kwd, 3).cost.perDeliveredContent, "411.522", "1234567/3 half-up em 3 casas");
  const large = observation("candidate");
  large.evidenceClass = "LIVE_PROVIDER";
  large.calls[0]!.cost!.amountMinor = "1000000000000000001";
  assert.equal(
    summarizeFullE6Arm(large, 2).cost.perDeliveredContent,
    "3333333333333333.34",
    "acima de MAX_SAFE_INTEGER — formatação por BigInt/string, sem Number",
  );
});

test("sem freeze utilizável não há escala presumida: JPY nunca vira 16.67 — perDeliveredContent é null", () => {
  // Review: summarize sem minorUnitExponent configurado (freeze utilizável)
  // NÃO formata — inferir escala 2 do currency code inventaria 16.67 para JPY.
  const jpyNoExponent = observation("candidate");
  jpyNoExponent.evidenceClass = "LIVE_PROVIDER";
  jpyNoExponent.calls[0]!.cost!.currency = "JPY";
  jpyNoExponent.calls[0]!.cost!.amountMinor = "5000";
  assert.equal(summarizeFullE6Arm(jpyNoExponent).cost.perDeliveredContent, null);
  const jpyBaseline = observation("baseline");
  jpyBaseline.evidenceClass = "LIVE_PROVIDER";
  jpyBaseline.calls[0]!.cost!.currency = "JPY";
  jpyBaseline.calls[0]!.cost!.amountMinor = "3";
  const report = buildFullE6Report([jpyBaseline, jpyNoExponent]);
  assert.equal(report.pairs[0]!.architecture.baseline!.cost.perDeliveredContent, null);
  assert.equal(report.pairs[0]!.architecture.candidate!.cost.perDeliveredContent, null);
  assert.equal(report.pairs[0]!.delta!.cost, "4997");
});

test("partial cost completeness, foreign source and fabricated amounts are rejected or unavailable", () => {
  const item = observation("candidate");
  item.evidenceClass = "LIVE_PROVIDER";
  item.calls.push({ ...item.calls[0]!, attempt: 2, retry: true, tokens: null, cost: null });
  assert.equal(summarizeFullE6Arm(item).cost.state, "UNAVAILABLE");
  item.calls[1]!.cost = { amountMinor: "3", currency: "USD", pricingHash: "c".repeat(64), source: "REPORTED", complete: false, evidenceRef: "attempt-2" };
  assert.equal(summarizeFullE6Arm(item).cost.state, "UNAVAILABLE");
  item.calls[1]!.cost!.complete = true;
  item.calls[1]!.cost!.amountMinor = "-5";
  assert.throws(() => summarizeFullE6Arm(item), /E6-INVALID/);
  item.calls[1]!.cost!.amountMinor = "1.5";
  assert.throws(() => summarizeFullE6Arm(item), /E6-INVALID/);
  item.calls[1]!.cost!.amountMinor = "7";
  const exact = summarizeFullE6Arm(item);
  assert.equal(exact.cost.amountMinor, "10");
  assert.equal(exact.cost.currency, "USD");
});

test("paired controls mismatch and duplicate arms are invalid rather than silently excluded", () => {
  const baseline = observation("baseline");
  const candidate = observation("candidate");
  candidate.controlsHash = "d".repeat(64);
  assert.equal(buildFullE6Report([baseline, candidate]).pairs[0]!.state, "INVALID");
  assert.throws(() => buildFullE6Report([baseline, baseline]), /duplicate/i);
  candidate.inputHash = "d".repeat(64);
  assert.throws(() => buildFullE6Report([candidate]), /inputHash/);
});

test("missing arm preserves category denominator without synthetic zero deltas", () => {
  const report = buildFullE6Report([observation("baseline")]);
  assert.equal(report.pairs[0]!.state, "MISSING");
  assert.equal(report.pairs[0]!.delta, null);
  assert.equal(report.byCategory.UTILITY!.expectedPairs, draft.cases.filter((item) => item.category === "UTILITY").length);
  assert.equal(report.byCategory.UTILITY!.validPairs, 0);
});

test("mixed execution statuses are fail-closed: unreachable same-case, isolated cross-case", () => {
  // Same case, mixed statuses: verifyObservation rejeita antes do pareamento
  // (EXECUTED em caso deferred e NOT_EXECUTED em caso executável são stale) —
  // o check de invariante no report/assignments é defesa em profundidade.
  const executedMemory = observation("candidate");
  const target = draft.cases.find((item) => item.generation === "RECURRENT")!;
  executedMemory.caseId = target.caseId;
  executedMemory.inputHash = verifyFullE6Draft().caseHashes.find((entry) => entry.caseId === target.caseId)!.inputHash;
  assert.throws(() => buildFullE6Report([notExecuted("baseline"), executedMemory]), /E6-INVALID/);
  assert.throws(() => prepareFullE6Assignments([notExecuted("baseline"), executedMemory]), /E6-INVALID/);
  // Braços de cases distintos nunca formam par: deferred segue NOT_EXECUTED,
  // executado órfão segue MISSING — sem casamento por posição.
  const report = buildFullE6Report([observation("baseline"), notExecuted("candidate")]);
  assert.equal(report.pairs.find((entry) => entry.caseId === RECURRENT_CASE)!.state, "NOT_EXECUTED");
  assert.equal(report.pairs.find((entry) => entry.caseId === "e6-utility-01")!.state, "MISSING");
});

test("executing a capability-deferred case is rejected before any pairing", () => {
  const executed = observation("candidate");
  const target = draft.cases.find((item) => item.generation === "RECURRENT")!;
  executed.caseId = target.caseId;
  executed.inputHash = verifyFullE6Draft().caseHashes.find((entry) => entry.caseId === target.caseId)!.inputHash;
  executed.jobSeed = sha256Hex(canonicalSerialization([draft.arms.jobSeedDerivation, target.caseId, executed.inputHash]));
  assert.throws(() => buildFullE6Report([executed]), /capability/i);
});

test("deferred case stays NOT_EXECUTED with explicit coverage, UNAVAILABLE metrics and pending acceptance", () => {
  const report = buildFullE6Report([notExecuted("baseline"), notExecuted("candidate")]);
  const pair = report.pairs.find((entry) => entry.caseId === RECURRENT_CASE)!;
  assert.equal(pair.state, "NOT_EXECUTED");
  assert.equal(pair.reason, "DEPENDENCY_SLICE_008");
  assert.equal(pair.requiredForAcceptance, true);
  assert.equal(pair.provenanceStatus, "NOT_EXECUTED");
  assert.equal(pair.delta, null);
  assert.equal(pair.architecture.baseline, null);
  const category = report.byCategory.PERCEIVED_VALUE!;
  assert.equal(category.expectedPairs, draft.cases.filter((item) => item.category === "PERCEIVED_VALUE").length);
  assert.equal(category.notExecutedPairs, 1);
  assert.equal(category.byArm.candidate.observedCases, 0);
  assert.equal(category.byArm.candidate.expectedCases, category.expectedPairs);
  assert.equal(report.aggregate.architecture.cost!.missing, draft.cases.length);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.acceptanceStatus, "V2_DEFAULT_PENDING_ACCEPTANCE");
  assert.deepEqual(report.acceptanceBlockers, ["RECURRENCE_DEPENDS_ON_SLICE_008"]);
  assert.deepEqual(report.nonExecutedCases, [
    { caseId: RECURRENT_CASE, generation: "RECURRENT", reason: "DEPENDENCY_SLICE_008", requiredForAcceptance: true, expectedUnits: 103, expectedAssignments: 206 },
  ]);
  assert.ok(report.missingData.some((entry) => entry.caseId === RECURRENT_CASE && entry.state === "NOT_EXECUTED" && entry.reason === "DEPENDENCY_SLICE_008"));
  assert.ok(report.limitations.some((line) => line.includes("RECURRENCE") && line.includes("Slice 008")));
  assert.ok(
    report.limitations.some((line) => line.includes("ISO minor-unit scale")),
    "limitação declara formatação por escala ISO do freeze da moeda",
  );
  assert.equal(report.pairs.find((entry) => entry.caseId !== RECURRENT_CASE)!.state, "MISSING");
  assert.deepEqual(report, buildFullE6Report([notExecuted("baseline"), notExecuted("candidate")]));
});

test("deferred case emits no human assignments or blind views; others keep their units", () => {
  const inputs = [withContents("baseline"), withContents("candidate"), notExecuted("baseline"), notExecuted("candidate")];
  const prepared = prepareFullE6Assignments(inputs);
  assert.equal(prepared.assignments.some((entry) => entry.caseId === RECURRENT_CASE), false);
  assert.equal(prepared.views.some((entry) => entry.caseId === RECURRENT_CASE), false);
  assert.deepEqual(prepared.nonExecutedCases.map((entry) => entry.caseId), [RECURRENT_CASE]);
  const ordinary = prepareFullE6Assignments([withContents("baseline"), withContents("candidate")]);
  assert.equal(ordinary.assignments.length, prepared.assignments.length);
  assert.ok(ordinary.assignments.length > 0);
});

const notExecutedAlone = (arm: "baseline" | "candidate") => {
  const deferred = draft.cases.find((item) => item.generation === "RECURRENT")!;
  const fixture = { ...notExecuted(arm) };
  void deferred;
  return fixture;
};

test("summarize rejects non-executed observations instead of inventing metrics", () => {
  assert.throws(() => summarizeFullE6Arm(notExecutedAlone("candidate")), /E6-INVALID/);
});

test("blind human conflicts remain unresolved until independent hashed adjudication", () => {
  const baseline = observation("baseline");
  const candidate = observation("candidate");
  baseline.evidenceClass = candidate.evidenceClass = "LIVE_PROVIDER";
  for (const item of [baseline, candidate]) item.contents = [1, 2, 3].map((position) => ({
    position, angle: "Uso concreto", hook: "Veja a tampa", development: ["Rosquear a tampa"], script: "Fecho e levo.",
    cta: "Veja os detalhes", scenes: ["Fechar a tampa"], creativeMode: "RECIPE_BACKED",
    blueprint: { attentionMechanisms: ["demonstration"], psychologicalEffects: ["trust"], format: "pov", narrativeMoves: ["setup", "payoff"], productRole: "solution" },
  }));
  const blind = prepareFullE6Assignments([baseline, candidate]);
  const group = blind.assignments.filter((item) => item.caseId === baseline.caseId && item.dimension === "NATURALNESS" && item.unitId.endsWith(":1"));
  const annotations: FullE6Annotation[] = group.map((assignment, index) => {
    const base = { assignmentHash: assignment.assignmentHash, annotatorId: assignment.opaqueAnnotatorId,
      label: index === 0 ? "LEFT_BETTER" : "RIGHT_BETTER", evidence: "A fala tem ritmo mais natural." };
    return { ...base, annotationHash: sha256Hex(canonicalSerialization(base)) };
  });
  const before = buildFullE6Report([baseline, candidate], annotations);
  assert.equal(before.subjective.find((unit) => unit.unitId === group[0]!.unitId && unit.dimension === "NATURALNESS")!.state, "CONFLICT");
  const base = { unitId: group[0]!.unitId, dimension: "NATURALNESS", caseId: baseline.caseId,
    annotationHashes: annotations.map((note) => note.annotationHash), adjudicatorId: "adjudicator-1", label: "EQUIVALENT", reason: "Sem diferença material." };
  const adjudication = { ...base, adjudicationHash: sha256Hex(canonicalSerialization(base)) };
  const after = buildFullE6Report([baseline, candidate], annotations, [adjudication]);
  const unit = after.subjective.find((entry) => entry.unitId === group[0]!.unitId && entry.dimension === "NATURALNESS")!;
  assert.equal(unit.state, "ADJUDICATED");
  assert.equal(unit.score, 0);
  assert.equal(after.byCategory.UTILITY!.subjective.NATURALNESS!.mean, 0);
  assert.throws(() => buildFullE6Report([baseline, candidate], [...annotations, annotations[0]!]), /independence/);
  const view = blind.views[0]!;
  assert.equal("leftArm" in view, false);
  assert.equal("provenanceHash" in view, false);
  assert.equal("calls" in view, false);
});

test("views cegas só existem com evidência disponível; coordinator assignments preservam reconciliação", () => {
  // Bug confirmado: views com left/right/target=null eram distribuídas ao
  // annotator (CLI assign gerava 1.264 tarefas sem evidência). Coordinator
  // assignments continuam existindo para reconciliação/denominadores.
  const empty = prepareFullE6Assignments([]);
  assert.ok(empty.assignments.length > 0, "coordinator assignments preservados");
  assert.equal(empty.views.length, 0, "sem evidência: nenhuma blind view distribuível");
  const offline = prepareFullE6Assignments([withContents("baseline", false), withContents("candidate", false)]);
  assert.ok(offline.assignments.length > 0);
  assert.equal(offline.views.length, 0, "conteúdo offline não gera view");
  const live = prepareFullE6Assignments([withContents("baseline"), withContents("candidate")]);
  assert.ok(live.views.length > 0, "views live paired/unary preservadas");
  assert.equal(
    live.views.length,
    live.assignments.filter((entry) => entry.evidenceAvailable).length,
    "uma view por assignment com evidência disponível",
  );
});

test("annotations cannot resolve a missing output by calling it equivalent", () => {
  const assignment = prepareFullE6Assignments([]).assignments[0]!;
  const base = { assignmentHash: assignment.assignmentHash, annotatorId: assignment.opaqueAnnotatorId, label: "EQUIVALENT", evidence: "Não disponível." };
  assert.throws(() => buildFullE6Report([], [{ ...base, annotationHash: sha256Hex(canonicalSerialization(base)) }]), /evidence/);
});

const withContents = (arm: "baseline" | "candidate", live = true): FullE6ExecutedObservation => ({
  ...observation(arm), evidenceClass: live ? "LIVE_PROVIDER" : "OFFLINE",
  contents: [1, 2, 3].map((position) => ({
    position, angle: "Uso concreto", hook: "Veja a tampa", development: ["Rosquear a tampa"], script: "Fecho e levo.",
    cta: "Veja os detalhes", scenes: ["Fechar a tampa"],
    creativeMode: arm === "candidate" ? "RECIPE_BACKED" : "UNAVAILABLE",
    blueprint: arm === "candidate" ? { attentionMechanisms: ["demonstration"], psychologicalEffects: ["trust"],
      format: "pov", narrativeMoves: ["setup", "payoff"], productRole: "solution" } : null,
  })),
});
const notesFor = (observations: FullE6Observation[], dimension: string, label: string): FullE6Annotation[] =>
  prepareFullE6Assignments(observations).assignments.filter((entry) => entry.caseId === observations[0]!.caseId
    && entry.dimension === dimension && entry.unitId.endsWith(":1")).map((entry) => {
      const base = { assignmentHash: entry.assignmentHash, annotatorId: entry.opaqueAnnotatorId, label, evidence: "A ação realiza a direção." };
      return { ...base, annotationHash: sha256Hex(canonicalSerialization(base)) };
    });

test("offline content cannot supply subjective evidence even with hashed human notes", () => {
  const inputs = [withContents("baseline", false), withContents("candidate", false)];
  const notes = notesFor(inputs, "NATURALNESS", "EQUIVALENT");
  assert.throws(() => buildFullE6Report(inputs, notes), /evidence/);
  const report = buildFullE6Report(inputs);
  const aggregateNaturalness = report.aggregate.subjective.NATURALNESS!;
  assert.equal(aggregateNaturalness.mean, null);
  assert.equal(aggregateNaturalness.resolvedUnits, 0);
  assert.equal(aggregateNaturalness.missingUnits, aggregateNaturalness.expectedUnits - aggregateNaturalness.notExecutedUnits);
  assert.equal(aggregateNaturalness.notExecutedUnits, 10, "recurrence deferida explica o gap sem virar zero");
  assert.ok(report.missingData.some((entry) => entry.metric === "NATURALNESS" && entry.reason === "OFFLINE_NOT_LIVE_EVIDENCE"));
});

test("ordinary paired views hide planning metadata and unary scores do not imply baseline equivalence", () => {
  const inputs = [withContents("baseline"), withContents("candidate")];
  const prepared = prepareFullE6Assignments(inputs);
  const view = prepared.views.find((entry) => entry.caseId === inputs[0]!.caseId && entry.dimension === "NATURALNESS")!;
  for (const content of [view.left, view.right]) {
    assert.equal("blueprint" in (content as object), false);
    assert.equal("creativeMode" in (content as object), false);
  }
  const unary = prepared.views.find((entry) => entry.caseId === inputs[0]!.caseId && entry.dimension === "BLUEPRINT_REALIZATION")!;
  assert.ok(unary.target);
  assert.equal(unary.left, null);
  assert.equal(unary.right, null);
  assert.equal("recipeId" in (unary.direction as object), false);
  assert.equal("arm" in unary, false);
  const report = buildFullE6Report(inputs, notesFor(inputs, "BLUEPRINT_REALIZATION", "SATISFIED"));
  assert.equal(report.aggregate.candidateOnly.BLUEPRINT_REALIZATION!.mean, 1);
  assert.equal("BLUEPRINT_REALIZATION" in report.aggregate.subjective, false);
  assert.equal("BLUEPRINT_REALIZATION" in report.macroCategory, false);
  assert.equal(report.aggregate.candidateOnly.BLUEPRINT_REALIZATION!.resolvedUnits, 1);
  assert.throws(() => buildFullE6Report(inputs, notesFor(inputs, "BLUEPRINT_REALIZATION", "EQUIVALENT")), /evidence/);
  const recipe = buildFullE6Report([inputs[1]!], notesFor([inputs[1]!], "RECIPE_COHERENCE", "NOT_SATISFIED"));
  assert.equal(recipe.aggregate.candidateOnly.RECIPE_COHERENCE!.mean, 0);
  inputs[1]!.contents![0]!.creativeMode = "FREE_COMPOSITION";
  const free = buildFullE6Report([inputs[1]!], notesFor([inputs[1]!], "FREE_COMPOSITION_COHERENCE", "SATISFIED"));
  assert.equal(free.aggregate.candidateOnly.FREE_COMPOSITION_COHERENCE!.mean, 1);
});

test("matching arbitrary seeds violate the frozen collection plan", () => {
  const inputs = [observation("baseline"), observation("candidate")];
  for (const entry of inputs) entry.jobSeed = "matching-but-not-planned";
  assert.throws(() => buildFullE6Report(inputs), /seed/i);
  assert.equal(prepareFullE6().collectionPlan[0]!.seed, sha256Hex(canonicalSerialization([draft.arms.jobSeedDerivation, draft.cases[0]!.caseId, verifyFullE6Draft().caseHashes[0]!.inputHash])));
});

test("cost requires the same pricing snapshot within attempts and across paired arms", () => {
  const baseline = withContents("baseline");
  const candidate = withContents("candidate");
  baseline.calls.push({ ...baseline.calls[0]!, attempt: 2, cost: { amountMinor: "100", currency: "USD", pricingHash: "d".repeat(64), source: "REPORTED", complete: true, evidenceRef: "attempt-2" } });
  assert.equal(summarizeFullE6Arm(baseline).cost.state, "UNAVAILABLE");
  baseline.calls.pop();
  candidate.calls[0]!.cost!.pricingHash = "d".repeat(64);
  const report = buildFullE6Report([baseline, candidate]);
  assert.equal(report.pairs[0]!.delta!.cost, null);
  assert.equal(report.aggregate.architecture.cost!.mean, null);
  assert.equal(report.aggregate.architecture.cost!.n, 0);
  assert.ok(report.missingData.some((entry) => entry.metric === "COST_DELTA"));
});

const freezeFixture = () => {
  const verified = verifyFullE6Draft();
  // Review: política de roteamento é IGUAL entre braços (somente o
  // campo arm difere) — alvos idênticos; divergência rejeita no parity.
  const routeTarget = {
    primary: { provider: "OFFLINE_FIXTURE", model: "not-a-live-model", parametersHash: "2".repeat(64), priceId: "price-shared" },
    fallbacks: [{ provider: "OFFLINE_FIXTURE", model: "not-a-live-model", parametersHash: "3".repeat(64), priceId: "price-shared-fallback" }],
  };
  const routingManifest = {
    schemaVersion: "full-e6-routing.v2",
    routes: (["baseline", "candidate"] as const).map((arm) => ({
      arm, capability: "CONTENT_BRIEF_GENERATION", tier: "MID", ...structuredClone(routeTarget),
    })),
  };
  const pricingManifest = {
    schemaVersion: "full-e6-pricing.v2", currency: "USD", minorUnitExponent: 2,
    prices: [
      { priceId: "price-shared", provider: "OFFLINE_FIXTURE", model: "not-a-live-model", sourceRef: "fixture-local-001", rates: { input: { numerator: "100", denominator: "1000000" }, output: { numerator: "200", denominator: "1000000" }, cache: null, reasoning: null } },
      { priceId: "price-shared-fallback", provider: "OFFLINE_FIXTURE", model: "not-a-live-model", sourceRef: "fixture-local-002", rates: { input: { numerator: "120", denominator: "1000000" }, output: { numerator: "240", denominator: "1000000" }, cache: null, reasoning: null } },
    ],
  };
  const arm = { commit: "1".repeat(40), engineVersion: "offline-fixture" };
  const plan = {
    schemaVersion: "full-e6-freeze.v2", status: "FROZEN", evidenceClass: "OFFLINE_INPUT_ONLY",
    protocolHash: sha256Hex(canonicalSerialization(draft)), datasetHash: verified.datasetHash, rubricHash: verified.rubricHash,
    aggregationHash: verified.aggregationHash, registeredAt: "2026-01-01T00:00:00.000Z",
    collectionNotBefore: "2026-01-03T00:00:00.000Z", arms: { baseline: arm, candidate: { commit: "4".repeat(40), engineVersion: "offline-fixture" } },
    routingManifest, routingManifestHash: sha256Hex(canonicalSerialization(routingManifest)),
    pricingManifest, pricingHash: sha256Hex(canonicalSerialization(pricingManifest)),
    cases: draft.cases.map((item) => ({ caseId: item.caseId, inputHash: sha256Hex(canonicalSerialization(item)),
      jobSeed: sha256Hex(canonicalSerialization([draft.arms.jobSeedDerivation, item.caseId, sha256Hex(canonicalSerialization(item))])),
      controlsHash: "5".repeat(64), baselinePromptContextHash: "6".repeat(64), candidatePromptContextHash: "7".repeat(64),
      executionPolicy: item.generation === "RECURRENT" ? "DEFERRED" : "REQUIRED",
      dependency: item.generation === "RECURRENT" ? "SLICE_008" : null,
      requiredForAcceptance: item.generation === "RECURRENT",
      memorySnapshotHash: null as string | null, reusedStrategyHash: null as string | null })),
    thresholds: Object.fromEntries(rubric.dimensions.map((entry) => [entry.id, { minimum: 0, maximumRegression: 0 }])),
    metricPolicy: Object.fromEntries(Object.entries(FULL_E6_OPERATIONAL_METRICS).map(([metric, unit]) =>
      [metric, { unit, direction: ["delivered", "deliveryCoverage", "judgeCoverage", "contentsPerCall"].includes(metric) ? "HIGHER_IS_BETTER" : "LOWER_IS_BETTER",
        maximumRegression: 0, missingRule: "BLOCK_ACCEPTANCE" }])),
    minimumCategoryCoverage: Object.fromEntries(draft.categories.map((category) => [category, 1])),
  };
  const freezeHash = sha256Hex(canonicalSerialization(plan));
  return { ...plan, freezeHash, approvals: { frozenPlanHash: freezeHash, approvedAt: "2026-01-02T00:00:00.000Z",
    architectReviewHash: "a".repeat(64), userCollectionApprovalHash: "d".repeat(64) } };
};

const boundToFreeze = (input: FullE6ExecutedObservation, frozen: ReturnType<typeof freezeFixture>): FullE6ExecutedObservation => {
  const entry = frozen.cases.find((item) => item.caseId === input.caseId)!;
  const route = frozen.routingManifest.routes.find((item) => item.arm === input.arm)!;
  input.controlsHash = entry.controlsHash;
  input.provenanceHash = sha256Hex(canonicalSerialization({ arm: frozen.arms[input.arm], input: entry }));
  input.calls[0]!.provider = route.primary.provider;
  input.calls[0]!.model = route.primary.model;
  input.calls[0]!.parametersHash = route.primary.parametersHash;
  input.calls[0]!.cost!.pricingHash = frozen.pricingHash;
  input.calls[0]!.cost!.currency = frozen.pricingManifest.currency;
  return input;
};

const rehash = (frozen: ReturnType<typeof freezeFixture>) => {
  const plan = Object.fromEntries(Object.entries(frozen).filter(([key]) => key !== "approvals" && key !== "freezeHash"));
  frozen.freezeHash = sha256Hex(canonicalSerialization(plan));
  frozen.approvals.frozenPlanHash = frozen.freezeHash;
  return frozen;
};

test("external preregistered freeze stays blocked while recurrence is deferred, without accepting", () => {
  const result = preflightFullE6(freezeFixture());
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.eligibleForLiveCollection, false);
  assert.ok(result.blockers.includes("RECURRENCE_DEPENDS_ON_SLICE_008"));
  assert.equal(result.executionEvidence, false);
  assert.equal(result.acceptanceStatus, "V2_DEFAULT_PENDING_ACCEPTANCE");
  assert.equal(preflightFullE6().status, "BLOCKED");
});

test("external freeze rejects tampering, fabricated deferred inputs and unbound approvals", () => {
  const tampered = freezeFixture();
  tampered.routingManifest.routes[0]!.primary.model = "changed";
  assert.ok(preflightFullE6(tampered).blockers.includes("FREEZE_HASH_MISMATCH"));
  const fabricated = freezeFixture();
  const deferredEntry = fabricated.cases.find((entry) => entry.caseId === RECURRENT_CASE)!;
  deferredEntry.memorySnapshotHash = "8".repeat(64);
  assert.ok(preflightFullE6(fabricated).blockers.includes("INVALID_FREEZE_SHAPE"));
  const misplaced = rehash((() => {
    const misplaced = freezeFixture();
    const ordinaryEntry = misplaced.cases.find((entry) => entry.caseId === "e6-utility-01")!;
    ordinaryEntry.executionPolicy = "DEFERRED";
    ordinaryEntry.dependency = "SLICE_008";
    return misplaced;
  })());
  assert.ok(preflightFullE6(misplaced).blockers.includes("FREEZE_POLICY_CONFLICT"));
  const unbound = freezeFixture();
  unbound.approvals.frozenPlanHash = "f".repeat(64);
  assert.ok(preflightFullE6(unbound).blockers.includes("APPROVAL_NOT_BOUND_TO_FREEZE"));
  assert.ok(preflightFullE6({ ...freezeFixture(), unexpected: true }).blockers.includes("INVALID_FREEZE_SHAPE"));
});

test("unary semantic directions reject provenance metadata and annotation tampering", () => {
  const inputs = [withContents("candidate")];
  const notes = notesFor(inputs, "BLUEPRINT_REALIZATION", "SATISFIED");
  notes[0]!.label = "NOT_SATISFIED";
  assert.throws(() => buildFullE6Report(inputs, notes), /hash/);
  Object.assign(inputs[0]!.contents![0]!.blueprint!, { recipeId: "candidate-recipe", engineVersion: "v2" });
  assert.throws(() => prepareFullE6Assignments(inputs), /allowlisted/);
});

test("aggregate cost excludes otherwise valid pairs captured under different pricing snapshots", () => {
  const first = [withContents("baseline"), withContents("candidate")];
  const second = first.map((entry) => {
    const next = structuredClone(entry);
    const target = draft.cases[1]!;
    next.caseId = target.caseId;
    next.inputHash = sha256Hex(canonicalSerialization(target));
    next.jobSeed = sha256Hex(canonicalSerialization([draft.arms.jobSeedDerivation, target.caseId, next.inputHash]));
    next.calls[0]!.cost!.pricingHash = "d".repeat(64);
    return next;
  });
  const report = buildFullE6Report([...first, ...second]);
  assert.equal(report.pairs[0]!.delta!.cost, "0");
  assert.equal(report.pairs[1]!.delta!.cost, "0");
  assert.equal(typeof report.pairs[0]!.delta!.cost, "string");
  assert.equal(report.aggregate.architecture.cost!.mean, null);
  assert.equal(report.aggregate.architecture.cost!.n, 0);
  assert.equal(report.aggregate.architecture.cost!.incompatiblePricingSnapshots, true);
  assert.equal(report.aggregate.architecture.cost!.missing, draft.cases.length);
});

test("cost deltas stay exact minor-unit strings beyond MAX_SAFE_INTEGER, negative included", () => {
  const huge = "9007199254740993"; // 2^53 + 1 — inexato como Number
  const above = withContents("baseline");
  above.calls[0]!.cost!.amountMinor = "0";
  const aboveCandidate = withContents("candidate");
  aboveCandidate.calls[0]!.cost!.amountMinor = huge;
  const up = buildFullE6Report([above, aboveCandidate]);
  assert.equal(up.pairs[0]!.delta!.cost, huge);
  assert.equal(typeof up.pairs[0]!.delta!.cost, "string");
  assert.equal(up.aggregate.architecture.cost!.mean, huge);

  const anchor = withContents("baseline");
  anchor.calls[0]!.cost!.amountMinor = huge;
  const belowCandidate = withContents("candidate");
  belowCandidate.calls[0]!.cost!.amountMinor = "50000";
  const down = buildFullE6Report([anchor, belowCandidate]);
  assert.equal(down.pairs[0]!.delta!.cost, "-9007199254690993");
  assert.equal(typeof down.pairs[0]!.delta!.cost, "string");
  assert.equal(down.aggregate.architecture.cost!.mean, "-9007199254690993");
});

test("deferred recurrence requires requiredForAcceptance=true in the freeze", () => {
  const falsy = freezeFixture();
  const entry = falsy.cases.find((item) => item.caseId === RECURRENT_CASE)!;
  entry.requiredForAcceptance = false;
  const plan = Object.fromEntries(Object.entries(falsy).filter(([key]) => key !== "approvals" && key !== "freezeHash"));
  falsy.freezeHash = sha256Hex(canonicalSerialization(plan));
  falsy.approvals.frozenPlanHash = falsy.freezeHash;
  const result = preflightFullE6(falsy);
  assert.ok(result.blockers.includes("INVALID_FREEZE_SHAPE"));
  assert.equal(result.eligibleForLiveCollection, false);
});

test("freeze v1 artifacts fail closed as FREEZE_VERSION_UNSUPPORTED without silent migration", () => {
  const legacy = freezeFixture();
  legacy.schemaVersion = "full-e6-freeze.v1";
  // v1 real: sem root manifests; braços com scalars da época; cases sem v2.
  delete (legacy as Record<string, unknown>).routingManifest;
  delete (legacy as Record<string, unknown>).routingManifestHash;
  delete (legacy as Record<string, unknown>).pricingManifest;
  delete (legacy as Record<string, unknown>).pricingHash;
  for (const entry of legacy.cases) {
    delete (entry as Record<string, unknown>).executionPolicy;
    delete (entry as Record<string, unknown>).dependency;
    delete (entry as Record<string, unknown>).requiredForAcceptance;
  }
  legacy.arms = ({
    baseline: { commit: "1".repeat(40), engineVersion: "offline-fixture", provider: "OFFLINE_FIXTURE", model: "baseline-model", parametersHash: "2".repeat(64), pricingHash: "3".repeat(64), routingManifestHash: "e".repeat(64) },
    candidate: { commit: "4".repeat(40), engineVersion: "offline-fixture", provider: "OFFLINE_FIXTURE", model: "candidate-model", parametersHash: "2".repeat(64), pricingHash: "3".repeat(64), routingManifestHash: "e".repeat(64) },
  }) as unknown as typeof legacy.arms;
  const plan = Object.fromEntries(Object.entries(legacy).filter(([key]) => key !== "approvals" && key !== "freezeHash"));
  legacy.freezeHash = sha256Hex(canonicalSerialization(plan));
  legacy.approvals.frozenPlanHash = legacy.freezeHash;
  const result = preflightFullE6(legacy);
  assert.ok(result.blockers.includes("FREEZE_VERSION_UNSUPPORTED"), "v1 detectado antes de exigir campos v2");
  assert.equal(result.eligibleForLiveCollection, false);
  assert.equal(result.blockers.includes("INVALID_FREEZE_SHAPE"), false, "sem migração silenciosa nem ruído de shape v2");
  assert.equal(result.blockers.includes("PROTOCOL_NOT_FROZEN"), false);
});

test("subjective denominators include deferred recurrence as notExecutedUnits without assignments", () => {
  const report = buildFullE6Report([]);
  const naturalness = report.aggregate.subjective.NATURALNESS!;
  assert.equal(naturalness.notExecutedUnits, 10);
  assert.ok(naturalness.expectedUnits >= naturalness.notExecutedUnits);
  const psychological = report.aggregate.subjective.PSYCHOLOGICAL_DIVERSITY!;
  assert.equal(psychological.notExecutedUnits, 1);
  assert.equal(report.byCategory.PERCEIVED_VALUE!.subjective.PSYCHOLOGICAL_DIVERSITY!.notExecutedUnits, 1);
  assert.equal(report.byCategory.UTILITY!.subjective.NATURALNESS!.notExecutedUnits, 0);
  const perceivedNaturalness = report.byCategory.PERCEIVED_VALUE!.subjective.NATURALNESS!;
  assert.equal(perceivedNaturalness.expectedUnits, 15, "5 emitidos (e6-value-01) + 10 deferidos (e6-memory-01)");
  const prepared = prepareFullE6Assignments([]);
  assert.equal(prepared.assignments.some((entry) => entry.caseId === RECURRENT_CASE), false);
});

test("missingData reports per-arm operational metrics unavailable for the deferred case", () => {
  const report = buildFullE6Report([notExecuted("baseline"), notExecuted("candidate")]);
  for (const arm of ["baseline", "candidate"] as const)
    for (const metric of Object.keys(FULL_E6_OPERATIONAL_METRICS))
      assert.ok(report.missingData.some((entry) => entry.caseId === RECURRENT_CASE && entry.arm === arm
        && entry.metric === metric && entry.state === "UNAVAILABLE" && entry.reason === "DEPENDENCY_SLICE_008"), `${arm}/${metric}`);
});
test("resumo byArm sem métricas é null/unavailable, nunca zero inventado", () => {
  const report = buildFullE6Report([notExecuted("baseline"), notExecuted("candidate")]);
  const byArm = report.byCategory.PERCEIVED_VALUE!.byArm.candidate;
  assert.equal(byArm.observedCases, 0);
  assert.equal(byArm.expectedCases, 2);
  assert.equal(byArm.requested, null);
  assert.equal(byArm.delivered, null);
  assert.equal(byArm.calls, null);
  assert.equal(byArm.deliveryCoverage, null);
  assert.equal(byArm.judgeExecuted, null);
  assert.equal(byArm.judgeCoverage, null);
  assert.equal(byArm.contentsPerCall, null);
  assert.equal(byArm.retryRate, null);
  assert.equal(byArm.repairRate, null);
  assert.equal(byArm.hardGateFailureRate, null);
  assert.equal(byArm.sceneFailureRate, null);
  assert.equal(byArm.partialSuccessRate, null);
});

test("freeze policy rejects missing operational criteria and future collection start", () => {
  const frozen = freezeFixture();
  assert.equal(preflightFullE6(frozen, Date.parse("2026-01-02T12:00:00Z")).eligibleForLiveCollection, false);
  assert.ok(preflightFullE6(frozen, Date.parse("2026-01-02T12:00:00Z")).blockers.includes("COLLECTION_NOT_YET_ALLOWED"));
  const incomplete = structuredClone(frozen);
  delete (incomplete.metricPolicy as Record<string, unknown>).cost;
  assert.ok(preflightFullE6(incomplete).blockers.includes("INVALID_FREEZE_SHAPE"));
});

test("imported live observations must match external preregistered controls and arm provenance", () => {
  const frozen = freezeFixture();
  const inputs = [withContents("baseline"), withContents("candidate")].map((input) => boundToFreeze(input, frozen));
  assert.equal(buildFullE6Report(inputs, [], [], frozen).pairs[0]!.provenanceStatus, "FROZEN_MATCH");
  const unbound = buildFullE6Report(inputs);
  assert.equal(unbound.pairs[0]!.provenanceStatus, "UNVERIFIED");
  for (const input of inputs) input.controlsHash = "f".repeat(64);
  const bad = buildFullE6Report(inputs, [], [], frozen);
  assert.equal(bad.pairs[0]!.state, "INVALID");
  assert.equal(bad.pairs[0]!.delta, null);
  assert.equal(bad.aggregate.subjective.NATURALNESS!.mean, null);
});

test("effective routing per attempt is mandatory and bound to validated shapes", () => {
  const missingRouting = observation("candidate");
  delete (missingRouting.calls[0] as Record<string, unknown>).provider;
  assert.throws(() => summarizeFullE6Arm(missingRouting), /E6-INVALID/);
  const badHash = observation("candidate");
  (badHash.calls[0] as Record<string, unknown>).parametersHash = "not-a-hash";
  assert.throws(() => summarizeFullE6Arm(badHash), /E6-INVALID/);
  const noManifest = freezeFixture();
  delete (noManifest as Record<string, unknown>).routingManifestHash;
  assert.ok(preflightFullE6(noManifest).blockers.includes("INVALID_FREEZE_SHAPE"));
  const divergent = rehash((() => {
    const divergent = freezeFixture();
    // Review: divergência de alvo entre braços (removido somente o
    // campo arm na projeção canônica) rejeita — política é idêntica.
    const candidateRoute = divergent.routingManifest.routes.find(
      (route) => route.arm === "candidate",
    )!;
    candidateRoute.primary.model = "changed-without-pair";
    return divergent;
  })());
  assert.ok(preflightFullE6(divergent).blockers.includes("PAIRED_PROVIDER_OR_PRICING_MISMATCH"));
});

test("manifests não vazios, targets únicos por tuple e saída sem attempts falham fechado", () => {
  const noRoutes = rehash((() => {
    const noRoutes = freezeFixture();
    noRoutes.routingManifest.routes = [];
    return noRoutes;
  })());
  assert.ok(preflightFullE6(noRoutes).blockers.includes("INVALID_FREEZE_SHAPE"));
  const noPrices = rehash((() => {
    const noPrices = freezeFixture();
    noPrices.pricingManifest.prices = [];
    return noPrices;
  })());
  assert.ok(preflightFullE6(noPrices).blockers.includes("INVALID_FREEZE_SHAPE"));
  const duplicated = rehash((() => {
    const duplicated = freezeFixture();
    const route = duplicated.routingManifest.routes.find(
      (item) => item.arm === "candidate",
    )!;
    route.fallbacks.push({ ...route.primary });
    return duplicated;
  })());
  assert.ok(preflightFullE6(duplicated).blockers.includes("INVALID_FREEZE_SHAPE"), "targets únicos por (provider,model,parametersHash)");
  const noAttempts = observation("candidate");
  noAttempts.calls = [];
  assert.throws(() => summarizeFullE6Arm(noAttempts), /E6-INVALID/);
  assert.throws(() => buildFullE6Report([observation("baseline"), noAttempts]), /E6-INVALID/);
});

test("parity é ordenada: mesmas rotas em ordem trocada entre braços é inválido", () => {
  const swapped = rehash((() => {
    const swapped = freezeFixture();
    const template = {
      capability: "CONTENT_BRIEF_GENERATION",
      primary: { provider: "OFFLINE_FIXTURE", model: "not-a-live-model", parametersHash: "2".repeat(64), priceId: "price-shared" },
      fallbacks: [{ provider: "OFFLINE_FIXTURE", model: "not-a-live-model", parametersHash: "3".repeat(64), priceId: "price-shared-fallback" }],
    };
    const route = (arm: "baseline" | "candidate", tier: "LOW" | "MID") => ({ arm, tier, ...structuredClone(template) });
    // Mesmas rotas individuais (alvos idênticos), ordem trocada entre braços:
    // baseline [LOW, MID] vs candidate [MID, LOW] — SPEC §13.2 exige ordem.
    swapped.routingManifest.routes = [
      route("baseline", "LOW"),
      route("baseline", "MID"),
      route("candidate", "MID"),
      route("candidate", "LOW"),
    ];
    return swapped;
  })());
  const result = preflightFullE6(swapped);
  assert.ok(
    result.blockers.includes("PAIRED_PROVIDER_OR_PRICING_MISMATCH"),
    "ordem trocada entre braços é divergência (SPEC §13.2)",
  );
});

test("sourceRef é metadado local opaco: URL-like rejeitado, identificador local aceito", () => {
  const redacted = rehash((() => {
    const frozen = freezeFixture();
    frozen.pricingManifest.prices[0]!.sourceRef = "redacted://offline-fixture/shared";
    return frozen;
  })());
  assert.ok(
    preflightFullE6(redacted).blockers.includes("INVALID_FREEZE_SHAPE"),
    "scheme redacted:// é URL-like e não é metadado local opaco",
  );
  const https = rehash((() => {
    const frozen = freezeFixture();
    frozen.pricingManifest.prices[1]!.sourceRef = "https://internal/rates";
    return frozen;
  })());
  assert.ok(preflightFullE6(https).blockers.includes("INVALID_FREEZE_SHAPE"), "https:// é URL-like");
  const opaque = rehash((() => {
    const frozen = freezeFixture();
    frozen.pricingManifest.prices[0]!.sourceRef = "fixture-local-001";
    frozen.pricingManifest.prices[1]!.sourceRef = "fixture-local-002";
    return frozen;
  })());
  const result = preflightFullE6(opaque);
  assert.equal(
    result.blockers.includes("INVALID_FREEZE_SHAPE"),
    false,
    "identificador local opaco é aceito sem resolução de URL",
  );
});

test("freeze v2 validates manifests: unique routes, resolvable priceId, canonical rates and currency exponent", () => {
  const duplicateRoute = freezeFixture();
  duplicateRoute.routingManifest.routes.push(structuredClone(duplicateRoute.routingManifest.routes[0]!));
  assert.ok(preflightFullE6(duplicateRoute).blockers.includes("INVALID_FREEZE_SHAPE"));
  const unresolvedPrice = rehash((() => {
    const frozen = freezeFixture();
    frozen.routingManifest.routes[0]!.primary.priceId = "price-inexistente";
    return frozen;
  })());
  assert.ok(preflightFullE6(unresolvedPrice).blockers.includes("PROVIDER_MODEL_PARAMETERS_NOT_FROZEN"));
  const mismatchedPrice = rehash((() => {
    const frozen = freezeFixture();
    frozen.pricingManifest.prices[0]!.model = "outro-model";
    return frozen;
  })());
  assert.ok(preflightFullE6(mismatchedPrice).blockers.includes("PROVIDER_MODEL_PARAMETERS_NOT_FROZEN"));
  const badRate = rehash((() => {
    const frozen = freezeFixture();
    frozen.pricingManifest.prices[0]!.rates.input!.numerator = "1.5";
    return frozen;
  })());
  assert.ok(preflightFullE6(badRate).blockers.includes("INVALID_FREEZE_SHAPE"));
  const badExponent = rehash((() => {
    const frozen = freezeFixture();
    frozen.pricingManifest.minorUnitExponent = 3;
    return frozen;
  })());
  assert.ok(preflightFullE6(badExponent).blockers.includes("INVALID_FREEZE_SHAPE"));
  const badCurrency = freezeFixture();
  badCurrency.pricingManifest.currency = "FAKE";
  assert.ok(preflightFullE6(badCurrency).blockers.includes("INVALID_FREEZE_SHAPE"));
  const priceHashDrift = freezeFixture();
  priceHashDrift.pricingHash = "f".repeat(64);
  assert.ok(preflightFullE6(priceHashDrift).blockers.includes("PROVIDER_MODEL_PARAMETERS_NOT_FROZEN"));
});

test("imported calls must bind to frozen routes and pricing; allowed fallback is accepted", () => {
  const frozen = freezeFixture();
  const inputs = [withContents("baseline"), withContents("candidate")];
  for (const input of inputs) inputs[inputs.indexOf(input)] = boundToFreeze(input, frozen);
  const bound = buildFullE6Report([...inputs], [], [], frozen);
  assert.equal(bound.pairs[0]!.provenanceStatus, "FROZEN_MATCH");
  assert.equal(bound.pairs[0]!.state, "PAIRED");
  const fallback = withContents("baseline");
  boundToFreeze(fallback, frozen);
  const route = frozen.routingManifest.routes.find((item) => item.arm === "baseline")!;
  fallback.calls[0]!.provider = route.fallbacks[0]!.provider;
  fallback.calls[0]!.model = route.fallbacks[0]!.model;
  const withFallback = buildFullE6Report([fallback, inputs[1]!], [], [], frozen);
  assert.equal(withFallback.pairs[0]!.state, "PAIRED", "fallback declarado é rota válida");
  const offRoute = withContents("baseline");
  boundToFreeze(offRoute, frozen);
  offRoute.calls[0]!.model = "modelo-fora-do-manifesto";
  const invalid = buildFullE6Report([offRoute, inputs[1]!], [], [], frozen);
  assert.equal(invalid.pairs[0]!.state, "INVALID");
  assert.equal(invalid.pairs[0]!.reason, "FROZEN_CONTROL_OR_PROVENANCE_MISMATCH");
  const wrongCurrency = withContents("baseline");
  boundToFreeze(wrongCurrency, frozen);
  wrongCurrency.calls[0]!.cost!.currency = "BRL";
  assert.equal(buildFullE6Report([wrongCurrency, inputs[1]!], [], [], frozen).pairs[0]!.state, "INVALID");
  const unbound = buildFullE6Report(inputs);
  assert.equal(unbound.pairs[0]!.provenanceStatus, "UNVERIFIED");
});
