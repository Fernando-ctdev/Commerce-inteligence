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
