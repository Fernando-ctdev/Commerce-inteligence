import assert from "node:assert/strict";
import { test } from "node:test";
import draft from "./full-e6/draft.json";
import rubric from "./full-e6/rubrics.json";
import { buildFullE6Report, prepareFullE6, prepareFullE6Assignments, preflightFullE6, summarizeFullE6Arm, verifyFullE6Draft, FULL_E6_OPERATIONAL_METRICS, type FullE6Observation, type FullE6Annotation } from "./full-e6";
import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";

test("E6 draft cobre seis formas de compra e boundary N10, mas não habilita coleta live", () => {
  const first = verifyFullE6Draft();
  assert.equal(first.eligibleForLiveCollection, false);
  assert.equal(first.caseHashes.length, draft.cases.length);
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
});

const observation = (arm: "baseline" | "candidate"): FullE6Observation => ({
  caseId: draft.cases[0]!.caseId, arm, evidenceClass: "OFFLINE", inputHash: verifyFullE6Draft().caseHashes[0]!.inputHash,
  jobSeed: sha256Hex(canonicalSerialization([draft.arms.jobSeedDerivation, draft.cases[0]!.caseId, verifyFullE6Draft().caseHashes[0]!.inputHash])), controlsHash: "a".repeat(64), provenanceHash: "b".repeat(64),
  status: "SUCCEEDED_PARTIAL", delivered: 3, requested: 5, hardFailures: 2, sceneFailures: 1,
  judge: { executed: 1, notExecuted: 1, failed: 1, notApplicable: 0 },
  calls: [{ capability: "CONTENT_BRIEF_GENERATION", tier: "MID", attempt: 1, retry: false, repair: false,
    tokens: { input: 100, output: 50, cache: null, reasoning: null }, cost: { amount: 0.03, currency: "USD", pricingHash: "c".repeat(64) }, latencyMs: 200 }],
  totalLatencyMs: 400,
});

test("preparation never invents collected outputs or promotes a draft", () => {
  const prepared = prepareFullE6();
  assert.deepEqual(prepared.observations, []);
  assert.equal(prepared.preflight.status, "BLOCKED");
  assert.ok(prepared.preflight.blockers.includes("THRESHOLDS_NOT_APPROVED"));
  assert.deepEqual(preflightFullE6(), prepared.preflight);
});

test("offline observations cannot become live cost, latency or subjective evidence", () => {
  const report = buildFullE6Report([observation("baseline"), observation("candidate")]);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.acceptanceStatus, "V2_DEFAULT_PENDING_ACCEPTANCE");
  assert.equal(report.pairs[0]!.architecture.baseline!.cost.state, "UNAVAILABLE");
  assert.equal(report.pairs[0]!.architecture.baseline!.latency.state, "UNAVAILABLE");
  assert.ok(report.subjective.every((item) => item.state === "NOT_ANNOTATED"));
  assert.deepEqual(report, buildFullE6Report([observation("baseline"), observation("candidate")]));
});

test("architecture ratios use physical calls, delivered contents and missing denominators", () => {
  const item = observation("candidate");
  item.evidenceClass = "LIVE_PROVIDER";
  const metrics = summarizeFullE6Arm(item);
  assert.equal(metrics.calls, 1);
  assert.equal(metrics.contentsPerCall, 3);
  assert.equal(metrics.cost.amount, 0.03);
  assert.equal(metrics.cost.pricingHash, "c".repeat(64));
  assert.equal(metrics.cost.perDeliveredContent, 0.01);
  assert.equal(metrics.latency.contentsPerSecond, 7.5);
  item.calls[0]!.cost = null;
  assert.equal(summarizeFullE6Arm(item).cost.state, "UNAVAILABLE");
  item.delivered = 0;
  item.status = "FAILED";
  item.judge = { executed: 0, notExecuted: 0, failed: 0, notApplicable: 0 };
  item.calls[0]!.cost = { amount: 0.03, currency: "USD", pricingHash: "c".repeat(64) };
  assert.equal(summarizeFullE6Arm(item).cost.perDeliveredContent, null);
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

test("missing usage and incompatible currencies never become zero or summed cost", () => {
  const item = observation("baseline");
  item.evidenceClass = "LIVE_PROVIDER";
  item.calls.push({ ...item.calls[0]!, attempt: 2, retry: true, tokens: null,
    cost: { amount: 1, currency: "BRL", pricingHash: "c".repeat(64) } });
  const metrics = summarizeFullE6Arm(item);
  assert.equal(metrics.cost.state, "UNAVAILABLE");
  assert.equal(metrics.tokens.input, null);
  assert.equal(metrics.retryRate, .5);
  assert.equal(metrics.contentsPerCall, 1.5);
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

test("annotations cannot resolve a missing output by calling it equivalent", () => {
  const assignment = prepareFullE6Assignments([]).assignments[0]!;
  const base = { assignmentHash: assignment.assignmentHash, annotatorId: assignment.opaqueAnnotatorId, label: "EQUIVALENT", evidence: "Não disponível." };
  assert.throws(() => buildFullE6Report([], [{ ...base, annotationHash: sha256Hex(canonicalSerialization(base)) }]), /evidence/);
});

const withContents = (arm: "baseline" | "candidate", live = true): FullE6Observation => ({
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
  assert.equal(report.aggregate.subjective.NATURALNESS!.mean, null);
  assert.equal(report.aggregate.subjective.NATURALNESS!.resolvedUnits, 0);
  assert.equal(report.aggregate.subjective.NATURALNESS!.missingUnits, report.aggregate.subjective.NATURALNESS!.expectedUnits);
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
  assert.equal(prepareFullE6().collectionPlan[0]!.seed, observation("baseline").jobSeed);
});

test("cost requires the same pricing snapshot within attempts and across paired arms", () => {
  const baseline = withContents("baseline");
  const candidate = withContents("candidate");
  baseline.calls.push({ ...baseline.calls[0]!, attempt: 2, cost: { amount: 1, currency: "USD", pricingHash: "d".repeat(64) } });
  assert.equal(summarizeFullE6Arm(baseline).cost.amount, null);
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
  const arm = { commit: "1".repeat(40), engineVersion: "offline-fixture", provider: "OFFLINE_FIXTURE",
    model: "not-a-live-model", parametersHash: "2".repeat(64), pricingHash: "3".repeat(64) };
  const plan = {
    schemaVersion: "full-e6-freeze.v1", status: "FROZEN", evidenceClass: "OFFLINE_INPUT_ONLY",
    protocolHash: sha256Hex(canonicalSerialization(draft)), datasetHash: verified.datasetHash, rubricHash: verified.rubricHash,
    aggregationHash: verified.aggregationHash, registeredAt: "2026-01-01T00:00:00.000Z",
    collectionNotBefore: "2026-01-03T00:00:00.000Z", arms: { baseline: arm, candidate: { ...arm, commit: "4".repeat(40) } },
    cases: draft.cases.map((item) => ({ caseId: item.caseId, inputHash: sha256Hex(canonicalSerialization(item)),
      jobSeed: sha256Hex(canonicalSerialization([draft.arms.jobSeedDerivation, item.caseId, sha256Hex(canonicalSerialization(item))])),
      controlsHash: "5".repeat(64), baselinePromptContextHash: "6".repeat(64), candidatePromptContextHash: "7".repeat(64),
      memorySnapshotHash: item.generation === "RECURRENT" ? "8".repeat(64) : null,
      reusedStrategyHash: item.generation === "RECURRENT" ? "9".repeat(64) : null })),
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

test("external preregistered freeze can be ready without collecting or accepting V2", () => {
  const result = preflightFullE6(freezeFixture());
  assert.equal(result.status, "READY_FOR_USER_COLLECTION");
  assert.equal(result.eligibleForLiveCollection, true);
  assert.equal(result.executionEvidence, false);
  assert.equal(result.acceptanceStatus, "V2_DEFAULT_PENDING_ACCEPTANCE");
  assert.equal(preflightFullE6().status, "BLOCKED");
});

test("external freeze rejects tampering, missing recurrent inputs and unbound approvals", () => {
  const tampered = freezeFixture();
  tampered.arms.candidate.model = "changed";
  assert.ok(preflightFullE6(tampered).blockers.includes("FREEZE_HASH_MISMATCH"));
  const missing = freezeFixture();
  missing.cases.find((entry) => entry.caseId === "e6-memory-01")!.memorySnapshotHash = null;
  const plan = Object.fromEntries(Object.entries(missing).filter(([key]) => key !== "approvals" && key !== "freezeHash"));
  missing.freezeHash = sha256Hex(canonicalSerialization(plan));
  missing.approvals.frozenPlanHash = missing.freezeHash;
  assert.ok(preflightFullE6(missing).blockers.includes("RECURRENT_INPUT_SNAPSHOT_NOT_FROZEN"));
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
  assert.equal(report.pairs[0]!.delta!.cost, 0);
  assert.equal(report.pairs[1]!.delta!.cost, 0);
  assert.equal(report.aggregate.architecture.cost!.mean, null);
  assert.equal(report.aggregate.architecture.cost!.n, 0);
  assert.equal(report.aggregate.architecture.cost!.incompatiblePricingSnapshots, true);
  assert.equal(report.aggregate.architecture.cost!.missing, draft.cases.length);
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
  const inputs = [withContents("baseline"), withContents("candidate")];
  for (const input of inputs) {
    input.controlsHash = frozen.cases[0]!.controlsHash;
    input.provenanceHash = sha256Hex(canonicalSerialization({ arm: frozen.arms[input.arm], input: frozen.cases[0]! }));
    input.calls[0]!.cost!.pricingHash = frozen.arms[input.arm].pricingHash;
  }
  assert.equal(buildFullE6Report(inputs, [], [], frozen).pairs[0]!.provenanceStatus, "FROZEN_MATCH");
  const unbound = buildFullE6Report(inputs);
  assert.equal(unbound.pairs[0]!.provenanceStatus, "UNVERIFIED");
  for (const input of inputs) input.controlsHash = "f".repeat(64);
  const bad = buildFullE6Report(inputs, [], [], frozen);
  assert.equal(bad.pairs[0]!.state, "INVALID");
  assert.equal(bad.pairs[0]!.delta, null);
  assert.equal(bad.aggregate.subjective.NATURALNESS!.mean, null);
});
