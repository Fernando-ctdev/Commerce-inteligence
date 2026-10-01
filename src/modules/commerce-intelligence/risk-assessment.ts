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

// ─── Stage 5: Risk Detector pré-Judge (ADR-033 / SPEC Etapa 5 §7) ───────────
// PreJudgeRiskAssessmentV2 é 100% determinístico e SÓ roteia: nunca entrega,
// nunca cria copy/repair/faltante. Registry fechado e versionado; sinais que o
// código não determina viram fonte PARTIAL/UNAVAILABLE e o fail-safe SEMPRE
// seleciona o Judge (nunca pula avaliação em silêncio). V1 acima permanece
// read-only como registro histórico pós-Judge.
import type { CreativeBlueprint } from "./creative-system";
import { normalizeForVariety } from "./contract";
import { DEVELOPMENT_ACTION_STEMS, developmentGroundingTerms } from "./gates";
import { classifyHookMechanism } from "./platform-skill";

export const PRE_JUDGE_RISK_CONTRACT_VERSION = "risk-assessment.v2" as const;
export const JUDGE_SELECTION_DECISION_VERSION = "judge-selection.v1" as const;
// Baseline de seleção pré-registrada (E6 threshold-policy: judgeIfRiskBandAtLeast
// MEDIUM, source risk-assessment.v1). Reutilizada como DEFAULT da policy — isto
// NÃO constitui aprovação E6; a policy versionada do chamador é a autoridade.
export const JUDGE_SELECTION_BASELINE_BAND = "MEDIUM" as const;

export type PreJudgeRiskBand = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type PreJudgeFindingCode =
  | "GENERIC_HOOK" | "WEAK_PRODUCT_INTEGRATION" | "CTA_GOAL_MISMATCH" | "PAYOFF_ABSENT"
  | "ATTENTION_MECHANISM_REPEAT" | "COMMERCIAL_EFFECT_REPEAT" | "PSYCHOLOGICAL_EFFECT_REPEAT"
  | "RECIPE_SATURATION" | "STRUCTURE_REPEAT" | "SCRIPT_TOO_LONG" | "PRODUCTION_UNCERTAIN"
  | "BLUEPRINT_INCOMPLETE" | "BLUEPRINT_UNREALIZED";
export const FAILSAFE_PARTIAL_TRIGGER = "RISK_PARTIAL_FAILSAFE" as const;
export const FAILSAFE_UNAVAILABLE_TRIGGER = "RISK_UNAVAILABLE_FAILSAFE" as const;
export type JudgeSelectionTriggerCode = PreJudgeFindingCode | typeof FAILSAFE_PARTIAL_TRIGGER | typeof FAILSAFE_UNAVAILABLE_TRIGGER;

// Severidades versionadas do registry fechado (ADR-033 "registry mínimo").
export const PRE_JUDGE_RISK_REGISTRY: Record<PreJudgeFindingCode, { domain: RiskDomain; severity: RiskSeverity }> = {
  GENERIC_HOOK: { domain: "SEMANTIC", severity: "LOW" },
  WEAK_PRODUCT_INTEGRATION: { domain: "SEMANTIC", severity: "MEDIUM" },
  CTA_GOAL_MISMATCH: { domain: "SEMANTIC", severity: "MEDIUM" },
  PAYOFF_ABSENT: { domain: "SEMANTIC", severity: "HIGH" },
  ATTENTION_MECHANISM_REPEAT: { domain: "VARIETY", severity: "LOW" },
  COMMERCIAL_EFFECT_REPEAT: { domain: "VARIETY", severity: "LOW" },
  PSYCHOLOGICAL_EFFECT_REPEAT: { domain: "VARIETY", severity: "LOW" },
  RECIPE_SATURATION: { domain: "VARIETY", severity: "LOW" },
  STRUCTURE_REPEAT: { domain: "VARIETY", severity: "LOW" },
  SCRIPT_TOO_LONG: { domain: "STRUCTURE", severity: "MEDIUM" },
  PRODUCTION_UNCERTAIN: { domain: "OPERATIONAL", severity: "MEDIUM" },
  BLUEPRINT_INCOMPLETE: { domain: "SEMANTIC", severity: "MEDIUM" },
  BLUEPRINT_UNREALIZED: { domain: "SEMANTIC", severity: "MEDIUM" },
};

export type PreJudgeRiskFindingV2 = { code: PreJudgeFindingCode; domain: RiskDomain; severity: RiskSeverity };
export type PreJudgeRiskAssessmentV2 = {
  contractVersion: typeof PRE_JUDGE_RISK_CONTRACT_VERSION;
  policyVersion: string;
  subject: { jobId: string; contentId: string };
  assessmentStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  riskBand: PreJudgeRiskBand;
  findings: readonly PreJudgeRiskFindingV2[];
  sources: { hardGate: "AVAILABLE"; blueprint: "AVAILABLE" | "UNAVAILABLE"; scenes: "AVAILABLE" | "FILTERED" | "ERROR"; memory: "AVAILABLE" | "EMPTY" | "UNAVAILABLE" };
};
export type JudgeSelectionPolicyV1 = { version: string; judgeIfRiskBandAtLeast: "LOW" | "MEDIUM" | "HIGH"; scriptMaxChars: number };
export type JudgeSelectionDecisionV1 = { policyVersion: string; contentId: string; selected: boolean; triggerCodes: readonly JudgeSelectionTriggerCode[] };
export const PRE_JUDGE_SELECTION_POLICY_V2: JudgeSelectionPolicyV1 = Object.freeze({
  version: "risk-policy.prejudge.v2",
  judgeIfRiskBandAtLeast: "MEDIUM",
  scriptMaxChars: 400,
});

export type PreJudgeRiskInputV2 = {
  policyVersion: string;
  subject: { jobId: string; contentId: string };
  brief: { hook: string; development: readonly string[]; script: string; cta: string };
  blueprint: (Readonly<Omit<CreativeBlueprint, "attentionMechanisms" | "psychologicalEffects" | "narrativeMoves">>
    & { readonly attentionMechanisms: readonly string[]; readonly psychologicalEffects: readonly string[]; readonly narrativeMoves: readonly string[] }) | undefined;
  blueprintStructureCovered: boolean | undefined;
  scenes: { status: "AVAILABLE" | "FILTERED" | "ERROR" };
  // commercialEffects do candidato = IDs da própria hipótese Discovery;
  // ausente ⇒ detector de repetição comercial inaplicável (nunca inventa).
  commercialEffects?: readonly string[];
  memory: { status: "AVAILABLE" | "EMPTY" | "UNAVAILABLE"; priorMechanisms?: readonly string[]; priorEffects?: readonly string[]; priorCommercialEffects?: readonly string[]; priorRecipes?: readonly string[]; priorStructures?: readonly string[] };
  productTerms: readonly string[] | undefined;
  production: { signals: readonly string[] } | undefined;
  selectionPolicy: JudgeSelectionPolicyV1;
};

const fold = (value: string): string => value.toLocaleLowerCase("pt-BR");
const addFinding = (found: PreJudgeRiskFindingV2[], code: PreJudgeFindingCode): void => {
  if (!found.some((item) => item.code === code)) found.push({ code, ...PRE_JUDGE_RISK_REGISTRY[code] });
};

// ponytail: cues lexicais são indícios de roteamento, não prova semântica.
// Classificadores existentes + ações/grounding observados cobrem narrativas
// faladas simples; humor, qualidade do payoff e realização visual não são
// provados. Move/atenção sem cue => UNKNOWN/Judge; nunca gate ou template.
function hasLowRiskRealizationCues(input: PreJudgeRiskInputV2): boolean {
  const { blueprint, brief, productTerms } = input;
  if (!blueprint || input.blueprintStructureCovered !== true || !productTerms?.length) return false;
  if (!blueprint.attentionMechanisms.length || !blueprint.narrativeMoves.length) return false;
  const terms = new Set(productTerms.flatMap(developmentGroundingTerms));
  const hookMatches = developmentGroundingTerms(brief.hook).filter((term) => terms.has(term));
  if (hookMatches.length < 2) return false;
  const script = normalizeForVariety(brief.script);
  const clauses = script.split(/[.!?;]+/).map((clause) => clause.trim())
    .filter((clause) => clause && clause !== normalizeForVariety(brief.cta).replace(/[.!?;]+$/, ""));
  if (clauses.length < 2) return false;
  const buckets = clauses.map(classifyHookMechanism);
  const failure = buckets.includes("problem");
  const reaction = buckets.includes("discovery");
  const contrast = buckets.includes("objection") && reaction;
  const groundedClauses = clauses.filter((clause) => developmentGroundingTerms(clause).filter((term) => terms.has(term)).length >= 2);
  const productEntry = groundedClauses.some((clause) => clause.split(/\s+/)
    .some((word) => DEVELOPMENT_ACTION_STEMS.some((stem) => word.startsWith(stem))));
  const payoff = groundedClauses.includes(clauses[clauses.length - 1]!);
  const attentionObserved = blueprint.attentionMechanisms.every((attention) => {
    switch (attention) {
      case "curiosity": return brief.hook.trim().endsWith("?") || classifyHookMechanism(brief.hook) === "discovery";
      case "failure": return classifyHookMechanism(brief.hook) === "problem" && failure;
      case "reaction": return reaction;
      case "pattern_interrupt":
      case "contrast": return contrast;
      default: return false;
    }
  });
  return attentionObserved && blueprint.narrativeMoves.every((move) => {
    switch (move) {
      case "setup": return brief.hook.trim().length > 0;
      case "failure": return failure;
      case "reaction": return reaction;
      case "product_entry": return productEntry;
      case "resolution": return productEntry && groundedClauses.length >= 2;
      case "payoff": return payoff;
      default: return false;
    }
  });
}

// Avaliação PURA: findings derivam deterministicamente dos insumos; nada de
// provider, relógio ou aleatoriedade. Indeterminável ⇒ PARTIAL; Blueprint
// ausente ⇒ UNAVAILABLE; ambos falham SAFE para seleção do Judge.
export function buildPreJudgeRiskAssessment(input: PreJudgeRiskInputV2): { assessment: PreJudgeRiskAssessmentV2; blueprintSource: "AVAILABLE" | "UNAVAILABLE" } {
  const findings: PreJudgeRiskFindingV2[] = [];
  const { brief, blueprint, selectionPolicy } = input;
  const blueprintSource: "AVAILABLE" | "UNAVAILABLE" = blueprint === undefined ? "UNAVAILABLE" : "AVAILABLE";

  if (blueprint) {
    const incomplete = blueprint.attentionMechanisms.length === 0 || blueprint.narrativeMoves.length === 0 || ("recipeId" in blueprint && blueprint.recipeId !== undefined && !String(blueprint.recipeId).trim());
    if (incomplete) addFinding(findings, "BLUEPRINT_INCOMPLETE");
    if (input.blueprintStructureCovered === false) addFinding(findings, "BLUEPRINT_UNREALIZED");
  }

  const terms = input.productTerms;
  if (terms !== undefined && terms.length > 0) {
    const hook = fold(brief.hook);
    const script = fold(brief.script);
    if (!terms.some((term) => hook.includes(fold(term)))) addFinding(findings, "GENERIC_HOOK");
    if (!terms.some((term) => script.includes(fold(term)))) addFinding(findings, "WEAK_PRODUCT_INTEGRATION");
    if (!script.includes(fold(brief.cta)) && brief.cta.trim() === brief.hook.trim()) addFinding(findings, "CTA_GOAL_MISMATCH");
  }

  if (!brief.script.trim()) addFinding(findings, "PAYOFF_ABSENT");
  else if (brief.script.length > selectionPolicy.scriptMaxChars) addFinding(findings, "SCRIPT_TOO_LONG");

  if (input.memory.status === "AVAILABLE" && blueprint) {
    const prior = (list?: readonly string[]) => new Set((list ?? []).map(fold));
    const priorMechanisms = prior(input.memory.priorMechanisms);
    const priorEffects = prior(input.memory.priorEffects);
    const priorRecipes = prior(input.memory.priorRecipes);
    const priorStructures = prior(input.memory.priorStructures);
    if (blueprint.attentionMechanisms.some((mechanism) => priorMechanisms.has(fold(mechanism)))) addFinding(findings, "ATTENTION_MECHANISM_REPEAT");
    // priorEffects é o espaço PSICOLÓGICO (mesmo espaço do Blueprint);
    // priorCommercialEffects é o espaço comercial (hipóteses Discovery).
    if (blueprint.psychologicalEffects.some((effect) => priorEffects.has(fold(effect)))) addFinding(findings, "PSYCHOLOGICAL_EFFECT_REPEAT");
    const priorCommercial = prior(input.memory.priorCommercialEffects);
    if (input.commercialEffects?.some((effect) => priorCommercial.has(fold(effect)))) addFinding(findings, "COMMERCIAL_EFFECT_REPEAT");
    const recipeId = (blueprint as { recipeId?: string }).recipeId;
    if (recipeId && priorRecipes.has(fold(recipeId))) addFinding(findings, "RECIPE_SATURATION");
    const structureKey = blueprint.narrativeMoves.join(">");
    if (structureKey && priorStructures.has(fold(structureKey))) addFinding(findings, "STRUCTURE_REPEAT");
  }

  const production = input.production;
  if (production === undefined) addFinding(findings, "PRODUCTION_UNCERTAIN");
  else if (production.signals.length > 0) addFinding(findings, "PRODUCTION_UNCERTAIN");

  const undetermined =
    blueprintSource === "UNAVAILABLE" ? "UNAVAILABLE"
      : !hasLowRiskRealizationCues(input) || terms === undefined || production === undefined || input.memory.status === "UNAVAILABLE"
        ? "PARTIAL" : "AVAILABLE";
  const ordered = [...findings].sort((a, b) => a.code.localeCompare(b.code));
  const riskBand = ordered.reduce<PreJudgeRiskBand>((band, item) => band === "NONE" || severityRank[item.severity] > severityRank[band] ? item.severity : band, "NONE");
  const assessment: PreJudgeRiskAssessmentV2 = {
    contractVersion: PRE_JUDGE_RISK_CONTRACT_VERSION,
    policyVersion: input.policyVersion,
    subject: { jobId: input.subject.jobId, contentId: input.subject.contentId },
    assessmentStatus: undetermined,
    riskBand: riskBand,
    findings: ordered,
    sources: { hardGate: "AVAILABLE", blueprint: blueprintSource, scenes: input.scenes.status, memory: input.memory.status },
  };
  return { assessment, blueprintSource };
}

// Seleção persistível e reproduzível: função pura do assessment + policy.
// Baseline judgeIfRiskBandAtLeast=MEDIUM (E6 threshold-policy) como default —
// pré-registro, NÃO aprovação E6. Fail-safe: PARTIAL/UNAVAILABLE selecionam.
export function selectForJudge(assessment: PreJudgeRiskAssessmentV2, policy: JudgeSelectionPolicyV1): JudgeSelectionDecisionV1 {
  const failsafe = assessment.assessmentStatus === "UNAVAILABLE" ? FAILSAFE_UNAVAILABLE_TRIGGER : assessment.assessmentStatus === "PARTIAL" ? FAILSAFE_PARTIAL_TRIGGER : undefined;
  const threshold = policy.judgeIfRiskBandAtLeast ?? JUDGE_SELECTION_BASELINE_BAND;
  const severityRankFor = (band: PreJudgeRiskBand): number => band === "NONE" ? 0 : severityRank[band];
  const selected = failsafe !== undefined || severityRankFor(assessment.riskBand) >= severityRankFor(threshold);
  const triggerCodes = [...new Set<JudgeSelectionTriggerCode>([...assessment.findings.map(({ code }) => code), ...(failsafe ? [failsafe] : [])])].sort();
  return { policyVersion: policy.version, contentId: assessment.subject.contentId, selected, triggerCodes };
}

const TRIGGER_CODES: Record<string, true> = Object.fromEntries([...Object.keys(PRE_JUDGE_RISK_REGISTRY), FAILSAFE_PARTIAL_TRIGGER, FAILSAFE_UNAVAILABLE_TRIGGER].map((code) => [code, true]));
export function validateJudgeSelectionDecision(value: unknown): JudgeSelectionDecisionV1 {
  const root = record(value); exactKeys(root, ["policyVersion", "contentId", "selected", "triggerCodes"]);
  if (typeof root.selected !== "boolean") throw new ContractError("GEN-SCHEMA", "selected inválido");
  if (!Array.isArray(root.triggerCodes) || (root.selected && root.triggerCodes.length === 0) || root.triggerCodes.some((code) => typeof code !== "string" || !TRIGGER_CODES[code])) throw new ContractError("GEN-SCHEMA", "triggerCodes inválidos");
  const codes = [...new Set(root.triggerCodes as string[])].sort();
  if (codes.length !== (root.triggerCodes as string[]).length) throw new ContractError("GEN-SCHEMA", "triggerCodes duplicados");
  return { policyVersion: nonEmpty(root.policyVersion, "policyVersion"), contentId: nonEmpty(root.contentId, "contentId"), selected: root.selected, triggerCodes: codes as JudgeSelectionTriggerCode[] };
}
