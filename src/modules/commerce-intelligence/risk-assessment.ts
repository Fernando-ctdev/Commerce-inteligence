import { ContractError } from "./contract";
import { gatePolicyAuthority, type GateReport } from "./gates";
import { QUALITY_PARTS } from "./semantic-quality";

export const RISK_ASSESSMENT_CONTRACT_VERSION = "risk-assessment.v1" as const;
export const JUDGE_EXECUTIONS = ["EXECUTED", "NOT_EXECUTED", "FAILED", "NOT_APPLICABLE"] as const;
export type JudgeExecution = (typeof JUDGE_EXECUTIONS)[number];
export type RiskDomain = "FACTUALITY" | "STRUCTURE" | "VARIETY" | "SCENE" | "SEMANTIC" | "OPERATIONAL";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";
export type RiskBand = "NONE" | RiskSeverity;

// Única fonte de códigos/mensagens. Integrações só podem referenciar estes IDs.
export const RISK_FINDING_REGISTRY = Object.freeze({
  HARD_FACTUALITY: { domain: "FACTUALITY", severity: "HIGH", source: "HARD_GATE", messageCode: "risk.hard_factuality" },
  HARD_STRUCTURE: { domain: "STRUCTURE", severity: "HIGH", source: "HARD_GATE", messageCode: "risk.hard_structure" },
  HARD_VARIETY: { domain: "VARIETY", severity: "MEDIUM", source: "HARD_GATE", messageCode: "risk.hard_variety" },
  SCENE_FILTERED: { domain: "SCENE", severity: "MEDIUM", source: "HARD_GATE", messageCode: "risk.scene_filtered" },
  SCENE_ERROR: { domain: "SCENE", severity: "HIGH", source: "HARD_GATE", messageCode: "risk.scene_error" },
  JUDGE_FAILED: { domain: "OPERATIONAL", severity: "MEDIUM", source: "OPERATIONAL_SIGNAL", messageCode: "risk.judge_failed" },
  BLUEPRINT_NOT_EXECUTED: { domain: "OPERATIONAL", severity: "LOW", source: "OPERATIONAL_SIGNAL", messageCode: "risk.blueprint_not_executed" },
} as const);
export type RiskFindingCode = keyof typeof RISK_FINDING_REGISTRY;
export type RiskMessageCode = (typeof RISK_FINDING_REGISTRY)[RiskFindingCode]["messageCode"];
export type RiskFindingV1 = {
  code: RiskFindingCode;
  domain: RiskDomain;
  severity: RiskSeverity;
  source: "HARD_GATE" | "SEMANTIC_RUBRIC" | "OPERATIONAL_SIGNAL";
  evidenceRefs: string[];
  messageCode: RiskMessageCode;
};
export type JudgeExecutionRecord = { contentId: string; round: number; execution: JudgeExecution; parts: unknown[]; errorCode?: "GEN-SCHEMA" | "GEN-PROVIDER" };
export type RiskAssessmentV1 = {
  contractVersion: typeof RISK_ASSESSMENT_CONTRACT_VERSION;
  policyVersion: string;
  assessmentStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  subject: { jobId: string; contentId?: string; part?: string };
  riskBand: RiskBand;
  findings: RiskFindingV1[];
  sources: { hardGate: "AVAILABLE" | "NOT_EXECUTED" | "UNAVAILABLE"; judge: JudgeExecution; blueprintFixture: "EXECUTED" | "NOT_EXECUTED" | "NOT_APPLICABLE" };
};
export type RiskAssessmentInput = {
  policyVersion: string;
  subject: RiskAssessmentV1["subject"];
  evidenceRefs: readonly string[];
  hardGate: { status: RiskAssessmentV1["sources"]["hardGate"]; reports: readonly GateReport[] };
  judge: { execution: JudgeExecution; records: readonly JudgeExecutionRecord[] };
  blueprintFixture: RiskAssessmentV1["sources"]["blueprintFixture"];
  scenes: readonly { status: string; causes?: readonly string[] }[];
};

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContractError("GEN-SCHEMA", "Risk assessment inválido");
  return value as Record<string, unknown>;
};
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)))
    throw new ContractError("GEN-SCHEMA", "Risk assessment contém campos inválidos");
};
const nonEmpty = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) throw new ContractError("GEN-SCHEMA", `${field} inválido`, field);
  return value;
};
const finding = (code: RiskFindingCode, evidenceRefs: readonly string[] = []): RiskFindingV1 => ({ code, ...RISK_FINDING_REGISTRY[code], evidenceRefs: [...evidenceRefs] });
const severityRank: Record<RiskSeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export function validateJudgeExecutionRecord(value: unknown): JudgeExecutionRecord {
  const item = record(value); exactKeys(item, item.errorCode === undefined ? ["contentId", "round", "execution", "parts"] : ["contentId", "round", "execution", "parts", "errorCode"]);
  const execution = item.execution;
  if (!JUDGE_EXECUTIONS.includes(execution as JudgeExecution) || !Number.isInteger(item.round) || (item.round as number) < 1 || !Array.isArray(item.parts))
    throw new ContractError("GEN-SCHEMA", "JudgeExecutionRecord inválido");
  if (execution === "EXECUTED" ? item.errorCode !== undefined : item.parts.length !== 0)
    throw new ContractError("GEN-SCHEMA", "JudgeExecutionRecord inconsistente");
  if (execution === "FAILED" && item.errorCode !== undefined && item.errorCode !== "GEN-SCHEMA" && item.errorCode !== "GEN-PROVIDER")
    throw new ContractError("GEN-SCHEMA", "errorCode do judge inválido");
  if (execution !== "FAILED" && item.errorCode !== undefined)
    throw new ContractError("GEN-SCHEMA", "errorCode só é permitido para judge FAILED");
  return { contentId: nonEmpty(item.contentId, "contentId"), round: item.round as number, execution: execution as JudgeExecution, parts: item.parts, ...(item.errorCode === undefined ? {} : { errorCode: item.errorCode as "GEN-SCHEMA" | "GEN-PROVIDER" }) };
}

function hardFinding(report: GateReport): RiskFindingCode | undefined {
  if (report.factualStatus === "UNSUPPORTED" || report.factualStatus === "CONTRADICTED") return "HARD_FACTUALITY";
  if (report.varietyStatus === "FAIL") return "HARD_VARIETY";
  if (report.structuralStatus === "FAIL") return "HARD_STRUCTURE";
  if (report.issues.some((issue) => /factref|bullet.*cta|claim sem evidência|claim factual/i.test(issue)) && gatePolicyAuthority("factRefAllowed") === "HARD") return "HARD_STRUCTURE";
  if (report.issues.some((issue) => /shot.?list|lista de features/i.test(issue)) && gatePolicyAuthority("shotList") === "HARD") return "HARD_STRUCTURE";
  return undefined;
}

export function buildRiskAssessment(input: RiskAssessmentInput): RiskAssessmentV1 {
  const knownRefs = new Set(input.evidenceRefs);
  input.judge.records.forEach(validateJudgeExecutionRecord);
  const findings: RiskFindingV1[] = [];
  if (input.hardGate.status === "AVAILABLE") for (const report of input.hardGate.reports) {
    const code = hardFinding(report);
    if (code) findings.push(finding(code, report.evidenceRefs.filter((ref) => knownRefs.has(ref))));
  }
  for (const scene of input.scenes) {
    if (scene.status === "FILTERED") findings.push(finding("SCENE_FILTERED"));
    if (scene.status === "ERROR") findings.push(finding("SCENE_ERROR"));
  }
  if (input.judge.execution === "FAILED" || input.judge.records.some(({ execution }) => execution === "FAILED")) findings.push(finding("JUDGE_FAILED"));
  if (input.blueprintFixture === "NOT_EXECUTED") findings.push(finding("BLUEPRINT_NOT_EXECUTED"));
  const unique = new Map<string, RiskFindingV1>();
  for (const item of findings) {
    const refs = [...new Set(item.evidenceRefs)].sort();
    const normalized = { ...item, evidenceRefs: refs };
    unique.set(`${item.domain}|${item.code}|${item.severity}|${refs.join(",")}`, normalized);
  }
  const ordered = [...unique.values()].sort((a, b) =>
    `${a.domain}|${a.code}|${a.severity}|${a.evidenceRefs.join(",")}`.localeCompare(`${b.domain}|${b.code}|${b.severity}|${b.evidenceRefs.join(",")}`));
  const unavailable = input.hardGate.status === "UNAVAILABLE" && input.judge.execution === "NOT_APPLICABLE" && input.blueprintFixture === "NOT_APPLICABLE";
  const partial = !unavailable && (input.hardGate.status !== "AVAILABLE" || input.judge.execution !== "EXECUTED" || input.blueprintFixture === "NOT_EXECUTED");
  const result: RiskAssessmentV1 = {
    contractVersion: RISK_ASSESSMENT_CONTRACT_VERSION,
    policyVersion: input.policyVersion,
    assessmentStatus: unavailable ? "UNAVAILABLE" : partial ? "PARTIAL" : "AVAILABLE",
    subject: input.subject,
    riskBand: ordered.reduce<RiskBand>((band, item) => band === "NONE" || severityRank[item.severity] > severityRank[band] ? item.severity : band, "NONE"),
    findings: ordered,
    sources: { hardGate: input.hardGate.status, judge: input.judge.execution, blueprintFixture: input.blueprintFixture },
  };
  return validateRiskAssessment(result, input.evidenceRefs);
}

export function validateRiskAssessment(value: unknown, allowedEvidenceRefs: readonly string[] = []): RiskAssessmentV1 {
  const root = record(value); exactKeys(root, ["contractVersion", "policyVersion", "assessmentStatus", "subject", "riskBand", "findings", "sources"]);
  if (root.contractVersion !== RISK_ASSESSMENT_CONTRACT_VERSION) throw new ContractError("GEN-SCHEMA", "contractVersion de risco inválido");
  const subject = record(root.subject); if (Object.keys(subject).some((key) => !["jobId", "contentId", "part"].includes(key))) throw new ContractError("GEN-SCHEMA", "subject de risco inválido");
  if (subject.part !== undefined && (!QUALITY_PARTS.includes(subject.part as (typeof QUALITY_PARTS)[number])))
    throw new ContractError("GEN-SCHEMA", "part de risco inválido", "part");
  const normalizedSubject = { jobId: nonEmpty(subject.jobId, "jobId"), ...(subject.contentId === undefined ? {} : { contentId: nonEmpty(subject.contentId, "contentId") }), ...(subject.part === undefined ? {} : { part: subject.part as string }) };
  if (!["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(String(root.assessmentStatus)) || !["NONE", "LOW", "MEDIUM", "HIGH"].includes(String(root.riskBand)) || !Array.isArray(root.findings)) throw new ContractError("GEN-SCHEMA", "estado de risco inválido");
  const refs = new Set(allowedEvidenceRefs);
  const findings = root.findings.map((raw) => {
    const item = record(raw); exactKeys(item, ["code", "domain", "severity", "source", "evidenceRefs", "messageCode"]);
    if (typeof item.code !== "string" || !(item.code in RISK_FINDING_REGISTRY)) throw new ContractError("GEN-SCHEMA", "RiskFindingCode inválido");
    const registry = RISK_FINDING_REGISTRY[item.code as RiskFindingCode];
    if (item.domain !== registry.domain || item.severity !== registry.severity || item.source !== registry.source || item.messageCode !== registry.messageCode || !Array.isArray(item.evidenceRefs) || item.evidenceRefs.some((ref) => typeof ref !== "string" || !refs.has(ref))) throw new ContractError("GEN-SCHEMA", "RiskFinding inválido");
    return { code: item.code as RiskFindingCode, ...registry, evidenceRefs: [...item.evidenceRefs] };
  });
  const findingKey = (item: RiskFindingV1) => `${item.domain}|${item.code}|${item.severity}|${item.evidenceRefs.join(",")}`;
  const keys = findings.map(findingKey);
  if (new Set(keys).size !== keys.length || keys.some((key, index) => index > 0 && key < keys[index - 1]!))
    throw new ContractError("GEN-SCHEMA", "RiskFindings devem ser únicos e ordenados");
  const sources = record(root.sources); exactKeys(sources, ["hardGate", "judge", "blueprintFixture"]);
  if (!["AVAILABLE", "NOT_EXECUTED", "UNAVAILABLE"].includes(String(sources.hardGate)) || !JUDGE_EXECUTIONS.includes(sources.judge as JudgeExecution) || !["EXECUTED", "NOT_EXECUTED", "NOT_APPLICABLE"].includes(String(sources.blueprintFixture))) throw new ContractError("GEN-SCHEMA", "sources de risco inválidos");
  const highest = findings.reduce<RiskBand>((band, item) => band === "NONE" || severityRank[item.severity] > severityRank[band] ? item.severity : band, "NONE");
  if (root.riskBand !== highest) throw new ContractError("GEN-SCHEMA", "riskBand não é derivado dos findings");
  const unavailable = sources.hardGate === "UNAVAILABLE" && sources.judge === "NOT_APPLICABLE" && sources.blueprintFixture === "NOT_APPLICABLE";
  const partial = !unavailable && (sources.hardGate !== "AVAILABLE" || sources.judge !== "EXECUTED" || sources.blueprintFixture === "NOT_EXECUTED");
  const assessmentStatus = unavailable ? "UNAVAILABLE" : partial ? "PARTIAL" : "AVAILABLE";
  if (root.assessmentStatus !== assessmentStatus) throw new ContractError("GEN-SCHEMA", "assessmentStatus não é derivado das sources");
  return { contractVersion: RISK_ASSESSMENT_CONTRACT_VERSION, policyVersion: nonEmpty(root.policyVersion, "policyVersion"), assessmentStatus, subject: normalizedSubject, riskBand: highest, findings, sources: { hardGate: sources.hardGate as RiskAssessmentV1["sources"]["hardGate"], judge: sources.judge as JudgeExecution, blueprintFixture: sources.blueprintFixture as RiskAssessmentV1["sources"]["blueprintFixture"] } };
}
