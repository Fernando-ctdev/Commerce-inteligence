// Etapa 6 — testes permanentes do harness offline: matriz mínima de categorias/
// cenários/bordas, fail-closed de hashes, assignment cego, annotations cegas com
// adjudicação, provenança completa do par, invariante single-variable do A/B,
// métricas D/N por categoria, relatório hasheado e approval gate explícito.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCaseFile, buildManifest, loadDataset, verifyCaseFile, verifyManifest } from "./artifacts";
import { buildProvenance, deriveJobSeed, pairFingerprint, replayCase, runArms } from "./replay";
import { annotatorView, armMapping, deriveAssignments, verifyAssignment } from "./assignment";
import { consolidateAnnotations, verifyAdjudication, verifyAnnotation } from "./annotations";
import { approveReport, buildReport, redactionMarkers, verifyReportHash } from "./report";
import { EvalContractError, GOLDEN_CATEGORIES, GOLDEN_SCENARIOS, type AdjudicationRecordV1, type EvalProvenanceV1, type GoldenAnnotationV1, type ThresholdPolicyV1 } from "./types";
import { PARTIAL_FAILURE_CAP } from "../contract";

const DATASET_DIR = fileURLToPath(new URL("./golden-dataset/", import.meta.url));
const dataset = loadDataset(DATASET_DIR);
const caseFile = dataset.cases[0]!;
const provenance = buildProvenance({ rubricHash: dataset.rubricAndPolicyHashes.rubricsHash, policyHash: dataset.rubricAndPolicyHashes.policyHash, creatorContext: {}, observedResponses: dataset.cases.map((file) => file.fixture.judgePool) });
const pairs = dataset.cases.map((file) => runArms(file, replayCase(file), dataset.policy, dataset.manifest.manifestHash, provenance));
const datasetTexts = dataset.cases.flatMap((file) => file.fixture.contents.flatMap((content) => [content.brief.angle, content.brief.hook, ...content.brief.development, content.brief.script, content.brief.cta]));
const consolidated = consolidateAnnotations({ caseFiles: dataset.cases, rubric: dataset.rubrics[0]!, policy: dataset.policy, annotations: annotationsOf("golden-006"), adjudications: adjudicationsOf("golden-006") });
const reportInput = { datasetVersion: dataset.manifest.datasetVersion, manifestHash: dataset.manifest.manifestHash, rubricVersion: dataset.manifest.rubricVersion, policy: dataset.policy, pairs, annotation: consolidated.coverage, provenance, missing: missingOf(), datasetTexts };
const report = buildReport(reportInput);

function missingOf() {
  return dataset.cases.flatMap((caseFile) => [
    ...(caseFile.fixture.judgeCallCostMinor === undefined ? [{ caseId: caseFile.case.caseId, field: "judgeCallCostMinor", state: "UNAVAILABLE" as const }] : []),
    ...(caseFile.fixture.judgeLatencyMs === undefined ? [{ caseId: caseFile.case.caseId, field: "judgeLatencyMs", state: "UNAVAILABLE" as const }] : []),
  ]);
}

test("matriz mínima: categorias, cenários e bordas N/F/batch", () => {
  assert.deepEqual([...dataset.manifest.categories].sort(), [...GOLDEN_CATEGORIES].sort());
  const scenarios = new Set(dataset.cases.map((file) => file.case.scenario));
  for (const scenario of GOLDEN_SCENARIOS) assert.ok(scenarios.has(scenario), `cenário ausente: ${scenario}`);
  const targets = dataset.cases.map((file) => file.case.request.targetContentCount);
  assert.ok(targets.includes(1), "borda N=1 ausente");
  assert.ok(targets.includes(10), "borda N=10 ausente");
  for (const file of dataset.cases) {
    const failures = file.case.request.targetContentCount - file.case.expected.deliveredContentIds.length;
    assert.ok(file.case.request.briefBatchSize >= 4 && file.case.request.briefBatchSize <= 8);
    if (failures > PARTIAL_FAILURE_CAP) assert.deepEqual(file.case.expected.deliveredContentIds, [], `F>CAP deve reprovar o job inteiro: ${file.case.caseId}`);
  }
  const atCap = dataset.cases.find((file) => file.case.request.targetContentCount - file.case.expected.deliveredContentIds.length === PARTIAL_FAILURE_CAP);
  const aboveCap = dataset.cases.find((file) => file.case.request.targetContentCount - file.case.expected.deliveredContentIds.length > PARTIAL_FAILURE_CAP);
  assert.ok(atCap, "case com F no CAP ausente");
  assert.ok(aboveCap, "case com F acima do CAP ausente");
  assert.ok(dataset.cases.some((file) => file.case.expected.deliveredContentIds.length === 0), "case com job reprovado inteiro ausente");
  const tenant = dataset.cases.find((file) => file.case.category === "TENANT_IDEMPOTENCY")!;
  assert.ok(tenant.fixture.platform?.tenantRef && tenant.fixture.platform?.idempotencyRef);
});

test("manifesto e case com hash divergente falham fechado", () => {
  assert.throws(() => verifyCaseFile({ ...caseFile, caseHash: "0".repeat(64) }, "golden-001"), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-CASE");
  assert.throws(() => verifyManifest({ ...dataset.manifest, manifestHash: "0".repeat(64) }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-MANIFEST");
  assert.throws(() => buildCaseFile({ case: { ...caseFile.case, scenario: "NAO_E_CENARIO" }, fixture: caseFile.fixture }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-CASE");
  assert.throws(() => buildCaseFile({ case: { ...caseFile.case, category: "NAO_E_CATEGORIA" }, fixture: caseFile.fixture }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-CASE");
  assert.throws(() => buildCaseFile({ case: { ...caseFile.case, request: { ...caseFile.case.request, briefBatchSize: 9 } }, fixture: caseFile.fixture }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-CASE");
});

test("manifesto DRAFT não é elegível para eval; FROZEN é", () => {
  const temp = mkdtempSync(join(tmpdir(), "eval-golden-"));
  try {
    mkdirSync(join(temp, "cases"));
    copyFileSync(join(DATASET_DIR, "rubrics.json"), join(temp, "rubrics.json"));
    copyFileSync(join(DATASET_DIR, "threshold-policy.json"), join(temp, "threshold-policy.json"));
    for (const file of dataset.cases) copyFileSync(`${DATASET_DIR}cases/${file.case.caseId}.json`, join(temp, "cases", `${file.case.caseId}.json`));
    writeFileSync(join(temp, "manifest.json"), JSON.stringify({ ...dataset.manifest, status: "DRAFT" }));
    assert.throws(() => loadDataset(temp), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-MANIFEST");
    writeFileSync(join(temp, "manifest.json"), JSON.stringify(dataset.manifest));
    assert.equal(loadDataset(temp).manifest.status, "FROZEN");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("replay, seed e fingerprint são determinísticos e sensíveis a drift", () => {
  const artifact = replayCase(caseFile);
  assert.equal(artifact.replayHash, replayCase(caseFile).replayHash);
  assert.equal(deriveJobSeed(dataset.manifest.datasetVersion, "golden-001"), artifact.jobSeed);
  const fingerprintParts = { datasetVersion: dataset.manifest.datasetVersion, manifestHash: dataset.manifest.manifestHash, caseHash: caseFile.caseHash, inputHash: caseFile.inputHash, baselineRef: dataset.policy.baselineRef, thresholdPolicyVersion: dataset.policy.thresholdPolicyVersion, jobSeed: artifact.jobSeed, replayHash: artifact.replayHash, provenance };
  const fingerprint = pairFingerprint(fingerprintParts);
  assert.equal(fingerprint, pairs[0]!.pairFingerprint);
  // Cada campo de provenança participa: qualquer mutação invalida o par.
  for (const key of Object.keys(provenance) as Array<keyof EvalProvenanceV1>) {
    const mutated: EvalProvenanceV1 = { ...provenance, [key]: `drift-${String(provenance[key])}` };
    assert.notEqual(pairFingerprint({ ...fingerprintParts, provenance: mutated }), fingerprint, `provenança ${key} não participa do fingerprint`);
  }
  assert.notEqual(pairFingerprint({ ...fingerprintParts, baselineRef: "adr-029@tiktok-commerce@1.3" }), fingerprint);
  assert.notEqual(pairFingerprint({ ...fingerprintParts, replayHash: "0".repeat(64) }), fingerprint);
});

test("assignment cego: braço compartilhado entre anotadores, view sem vazamento, drift é INVALID", () => {
  const rubric = dataset.rubrics[0]!;
  const a1 = deriveAssignments({ caseId: "golden-006", jobSeed: deriveJobSeed(dataset.manifest.datasetVersion, "golden-006"), rubric, annotatorId: "annotator-1" });
  const a2 = deriveAssignments({ caseId: "golden-006", jobSeed: deriveJobSeed(dataset.manifest.datasetVersion, "golden-006"), rubric, annotatorId: "annotator-2" });
  assert.equal(a1.length, 2);
  assert.deepEqual(a1.map((item) => item.assignment.assignmentHash), a2.map((item) => item.assignment.assignmentHash), "anotadores distintos devem compartilhar o assignment do braço");
  assert.notEqual(a1[0]!.assignment.opaqueArmId, a1[1]!.assignment.opaqueArmId);
  armMapping(a1);
  assert.throws(() => armMapping([...a1, a1[0]!]), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-ASSIGNMENT");
  const view = annotatorView(a1[0]!.assignment, rubric);
  const serialized = JSON.stringify(view).toLowerCase();
  for (const forbidden of ["baseline", "candidate", "provider", "model", "tier", "risk", "verdict", "expected"]) assert.equal(serialized.includes(forbidden), false, `view cega vazou: ${forbidden}`);
  verifyAssignment(a1[0]!.assignment);
  assert.throws(() => verifyAssignment({ ...a1[0]!.assignment, caseId: "golden-002" }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-ASSIGNMENT");
});

test("annotations cegas: cobertura 2/2 com 1 conflito adjudicado e 1 concordância", () => {
  assert.deepEqual(consolidated.coverage, { assignments: 2, annotated: 2, agreements: 1, conflicts: 1, adjudications: 1 });
  const naturalnessCase = dataset.cases.find((file) => file.case.category === "NATURALNESS")!;
  const rubric = dataset.rubrics[0]!;
  const annotations = JSON.parse(JSON.stringify(annotationsOf(naturalnessCase.case.caseId))) as GoldenAnnotationV1[];
  const valid = [{ assignment: { assignmentId: annotations[0]!.annotationId.split("@")[0]!, caseId: annotations[0]!.caseId, opaqueArmId: annotations[0]!.opaqueArmId, rubricVersion: rubric.rubricVersion, assignmentHash: annotations[0]!.assignmentHash } }];
  verifyAnnotation(annotations[0]!, rubric, valid, naturalnessCase.fixture.contents.map((content) => content.contentId));
  assert.throws(() => verifyAnnotation({ ...annotations[0]!, annotationHash: "0".repeat(64) }, rubric, valid, []), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-ANNOTATION");
  assert.throws(() => verifyAnnotation({ ...annotations[0]!, labels: [{ contentId: "golden-006-content-1", label: "PERFEITO" }] }, rubric, valid, naturalnessCase.fixture.contents.map((content) => content.contentId)), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-ANNOTATION");
  const records = JSON.parse(JSON.stringify(adjudicationsOf(naturalnessCase.case.caseId))) as AdjudicationRecordV1[];
  const group = annotations.filter((item) => item.opaqueArmId === records[0]!.opaqueArmId);
  verifyAdjudication(records[0]!, rubric, group);
  assert.throws(() => verifyAdjudication({ ...records[0]!, adjudicationHash: "0".repeat(64) }, rubric, group), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-ANNOTATION");
  assert.throws(() => verifyAdjudication(records[0]!, rubric, [group[0]!]), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-ANNOTATION", "adjudicação sem par é proibida");
  // Sem adjudicação, conflito é violação de cobertura no relatório.
  const withoutAdjudication = buildReport({ ...reportInput, annotation: { ...consolidated.coverage, adjudications: 0 } });
  assert.ok(withoutAdjudication.thresholdVerdict.violations.includes("annotation_coverage_incomplete"));
});

function annotationsOf(caseId: string): GoldenAnnotationV1[] {
  // Leitura dos artefatos commitados (mesma origem do CLI).
  return (JSON.parse(readFileSync(`${DATASET_DIR}annotations/${caseId}.json`, "utf8")) as { annotations: GoldenAnnotationV1[] }).annotations;
}
function adjudicationsOf(caseId: string): AdjudicationRecordV1[] {
  return (JSON.parse(readFileSync(`${DATASET_DIR}annotations/${caseId}.json`, "utf8")) as { adjudications: AdjudicationRecordV1[] }).adjudications;
}

test("A/B de variável única: entrega idêntica, metadados idênticos, só cobertura do judge difere", () => {
  for (const pair of pairs) {
    assert.deepEqual(pair.arms.baseline.delivery, pair.arms.candidate.delivery);
    assert.deepEqual(pair.arms.baseline.metadata, pair.arms.candidate.metadata);
    assert.equal(pair.arms.baseline.metadata.platformSkillVersion, "tiktok-commerce@1.2");
    assert.equal(pair.arms.candidate.judgeCoverage, "RISK_GATED");
    assert.ok(pair.arms.candidate.invocation.judgeContents <= pair.arms.baseline.invocation.judgeContents);
  }
  const technicalRetry = pairs.find((pair) => pair.caseId === "golden-012")!;
  assert.equal(technicalRetry.arms.baseline.invocation.judgeCalls, 2, "retry técnico soma chamada extra");
  assert.ok(technicalRetry.arms.candidate.invocation.judgeCalls <= technicalRetry.arms.baseline.invocation.judgeCalls);
});

test("NOT_EXECUTED nunca vira PASS e sai do denominador de qualidade", () => {
  for (const pair of pairs) {
    assert.equal(pair.arms.candidate.quality.executedContents, pair.arms.candidate.invocation.judgeContents);
    assert.equal(pair.arms.candidate.quality.passContents + pair.arms.candidate.quality.reviewContents, pair.arms.candidate.quality.executedContents);
  }
  assert.deepEqual(pairs.find((pair) => pair.caseId === "golden-007")!.arms.candidate.quality.missedReviewContents, ["golden-007-content-1"], "conteúdo pulado com REVIEW fixturado é missed review");
});

test("métricas D/N por categoria refletem expected, incluem job reprovado e CAP", () => {
  assert.equal(new Set(pairs.map((pair) => pair.category)).size, GOLDEN_CATEGORIES.length);
  for (const pair of pairs) {
    const origin = dataset.cases.find((file) => file.case.caseId === pair.caseId)!;
    assert.deepEqual([...pair.deliveredContentIds].sort(), [...origin.case.expected.deliveredContentIds].sort());
    assert.equal(pair.arms.baseline.delivery.delivered, origin.case.expected.deliveredContentIds.length);
  }
  assert.deepEqual(pairs.find((pair) => pair.caseId === "golden-010")!.deliveredContentIds, [], "F acima do CAP reprova o job inteiro");
  assert.equal(pairs.find((pair) => pair.caseId === "golden-009")!.deliveredContentIds.length, 2, "F no CAP permite parcial");
});

test("custo/latência ausentes são UNAVAILABLE; relatório é hasheado e determinístico", () => {
  assert.equal(report.aggregate.totalCostMinor.baseline, "UNAVAILABLE");
  assert.ok(report.missing.some((item) => item.caseId === "golden-011" && item.field === "judgeCallCostMinor" && item.state === "UNAVAILABLE"));
  assert.ok(Object.keys(report.provenance).length >= 13, "provenança completa deve estar no relatório");
  const again = buildReport(reportInput);
  assert.equal(again.reportHash, report.reportHash, "buildReport é determinístico para o mesmo input");
  assert.ok(verifyReportHash(report));
  assert.equal(verifyReportHash({ ...report, aggregate: { ...report.aggregate, judgeCallReductionShare: 0 } }), false);
  assert.equal(report.thresholdVerdict.meetsThresholds, true);
  assert.deepEqual(report.thresholdVerdict.violations, []);
});

test("aprovação é explícita: APPROVED exige thresholds; REJECTED sempre; drift invalida", () => {
  const approved = approveReport(report, { decision: "APPROVED", approver: "usuario", reason: "gate E6 conforme policy pré-registrada" });
  assert.equal(approved.decision, "APPROVED");
  assert.equal(approved.reportHash, report.reportHash);
  assert.equal(approveReport(report, { decision: "REJECTED", approver: "usuario", reason: "sem efeito" }).decision, "REJECTED");
  assert.throws(() => approveReport(report, { decision: "APPROVED", approver: "", reason: "x" }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-APPROVAL");
  assert.throws(() => approveReport({ ...report, reportHash: "0".repeat(64) }, { decision: "APPROVED", approver: "usuario", reason: "x" }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-APPROVAL");
  const failingPolicy: ThresholdPolicyV1 = { ...dataset.policy, thresholds: { ...dataset.policy.thresholds, minJudgeCallReductionShare: 0.9 } };
  const failing = buildReport({ ...reportInput, policy: failingPolicy });
  assert.equal(failing.thresholdVerdict.meetsThresholds, false);
  assert.ok(failing.thresholdVerdict.violations.includes("judge_call_reduction_below_min"));
  assert.throws(() => approveReport(failing, { decision: "APPROVED", approver: "usuario", reason: "x" }), (error: unknown) => error instanceof EvalContractError && error.code === "EVAL-APPROVAL");
});

test("relatório não vaza prompt, payload, Blueprint nem texto de fixture", () => {
  const serialized = JSON.stringify(report);
  for (const text of datasetTexts) assert.equal(serialized.includes(text), false, "texto literal de fixture vazou no relatório");
  for (const marker of redactionMarkers([])) assert.equal(serialized.includes(marker), false);
  assert.equal(report.redactionScan.passed, true);
  assert.ok(report.redactionScan.checkedMarkers >= 50);
});

test("relatório persiste métricas por categoria e dimensões E6", () => {
  assert.equal(Object.keys(report.byCategory).length, GOLDEN_CATEGORIES.length);
  assert.equal(report.creativeSystem.mode, "FIXTURE_ONLY");
  assert.ok(report.quality.baseline.passContents + report.quality.baseline.reviewContents > 0);
  const costCategory = report.byCategory.COST_LATENCY!;
  assert.equal(costCategory.costMinor.baseline, "UNAVAILABLE");
  assert.equal(costCategory.latencyMs.baseline.p50, "UNAVAILABLE");
  const retryCategory = report.byCategory.TENANT_IDEMPOTENCY!;
  assert.ok(retryCategory.retries >= 0);
  assert.ok(Object.values(report.byCategory).some((metrics) => metrics.repairs > 0));
  assert.ok(Object.values(report.byCategory).every((metrics) => Number.isInteger(metrics.repairs)));
  assert.ok(Object.values(report.byCategory).some((metrics) => metrics.partialSuccessCases > 0));
});

test("manifest build é estável e cobre cases/categorias", () => {
  const { manifestHash: _omitted, ...rest } = dataset.manifest;
  assert.equal(buildManifest(rest).manifestHash, dataset.manifest.manifestHash);
  assert.equal(rest.caseIds.length, dataset.cases.length);
});
