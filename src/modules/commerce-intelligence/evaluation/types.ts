// Etapa 6 — contratos OFFLINE do harness de golden evals (SPEC etapa-6-golden-evals
// §5-9; nota canônica "Plano de recalibração da commerce inteligence" é a autoridade).
// Nada aqui é runtime de produção: sem provider, rede, Prisma, Job, quota ou relógio.
// Falha de hash/shape/assignment é fail-closed (EvalContractError), nunca coerção.
export class EvalContractError extends Error {
  constructor(public readonly code: "EVAL-MANIFEST" | "EVAL-CASE" | "EVAL-FIXTURE" | "EVAL-RUBRIC" | "EVAL-POLICY" | "EVAL-ASSIGNMENT" | "EVAL-ANNOTATION" | "EVAL-REPLAY" | "EVAL-REPORT" | "EVAL-APPROVAL", message: string) {
    super(message);
    this.name = "EvalContractError";
  }
}

// Estados de missing permitidos (SPEC §8). Custo/latência ausentes são
// UNAVAILABLE — nunca zero inventado.
export const MISSING_STATES = ["MISSING", "NOT_APPLICABLE", "UNAVAILABLE", "PARTIAL", "NOT_EXECUTED", "FAILED", "NOT_ANNOTATED", "INVALID"] as const;
export type MissingState = (typeof MISSING_STATES)[number];

export const SEED_DERIVATION_VERSION = "eval-job-seed.v1";
export const PROTOCOL_VERSION = "eval-protocol.v1";
export const REPORT_VERSION = "eval-report.v1";
export const SCHEMA_VERSION = "golden-case.v1";
export const DATASET_ID = "commerce-intelligence-golden" as const;

//SPEC §5.1
export type FixtureRefV1 = { fixtureId: string; fixtureVersion: string; contentHash: string; encoding: "canonical-json-utf8" };
export type GoldenDatasetManifestV1 = {
  datasetId: typeof DATASET_ID;
  datasetVersion: string;
  schemaVersion: typeof SCHEMA_VERSION;
  rubricVersion: string;
  thresholdPolicyVersion: string;
  hashAlgorithm: "SHA-256";
  manifestHash: string;
  caseIds: readonly string[];
  categories: readonly string[];
  status: "DRAFT" | "FROZEN" | "RETIRED";
};

export const GOLDEN_SCENARIOS = ["HAPPY_PATH", "BOUNDARY", "ADVERSARIAL", "HARD_FAILURE", "SCENE_FAILURE", "PARTIAL", "TECHNICAL_RETRY", "MISSING_DATA"] as const;
export type GoldenScenario = (typeof GOLDEN_SCENARIOS)[number];
// Matriz mínima de categorias (.gstack/etapa6-requisitos.md §"Categorias e cobertura").
export const GOLDEN_CATEGORIES = ["FACTUALITY", "HARD_GATES", "SCENES", "VARIETY", "NATURALNESS", "TEMPLATING", "SEMANTIC_COHERENCE", "RISK", "PARTIAL_RETRY", "COST_LATENCY", "TENANT_IDEMPOTENCY"] as const;
export type GoldenCategory = (typeof GOLDEN_CATEGORIES)[number];
export type GoldenCaseV1 = {
  caseId: string;
  datasetVersion: string;
  category: string;
  scenario: GoldenScenario;
  request: { targetContentCount: number; briefBatchSize: number; productId: string; jobId: string };
  policyRefs: Record<string, string>;
  expected: { deliveredContentIds: readonly string[] };
  fixtureRefs: { evidence: FixtureRefV1; creatorContext: FixtureRefV1; providerResponses: readonly FixtureRefV1[] };
  inputHash: string;
  caseHash: string;
};

// Fixture redacted do case: geração fixa (briefs + gate objetivo + cenas) e pool
// fixturado de vereditos do judge. IDs são estáveis de fixture, nunca de produção.
export type RedactedBriefV1 = { angle: string; hook: string; development: readonly string[]; script: string; cta: string };
export type RedactedGateV1 = {
  briefId: string;
  gateVersion: number;
  factualStatus: "SUPPORTED" | "INFERRED_BUT_SAFE" | "UNSUPPORTED" | "CONTRADICTED";
  claimType: "objetivo" | "subjetivo";
  evidenceRefs: readonly string[];
  structuralStatus: "PASS" | "FAIL";
  platformStatus: "PASS" | "FAIL";
  varietyStatus: "PASS" | "FAIL";
  issues: readonly string[];
  decision: "PASS" | "REPAIR" | "REJECT";
};
export type RedactedSceneSetV1 = { status: "AVAILABLE" | "FILTERED" | "ERROR"; kept: number; dropped: number; descriptions: readonly string[] };
export type RedactedJudgeVerdictV1 = { contentId: string; round: number; parts: ReadonlyArray<{ part: string; status: "PASS" | "REVIEW"; criterion: string; reason: string }>; retries?: number; latencyMs?: number };
export type GoldenCaseFixtureV1 = {
  evidence: { facts: readonly string[]; refs: readonly string[] };
  creatorContext: Readonly<Record<string, unknown>>;
  // Obrigatório quando category=TENANT_IDEMPOTENCY: refs de fixture estáveis
  // (nunca IDs de produção) provando isolamento e replay idempotente.
  platform?: { tenantRef: string; idempotencyRef: string };
  contents: ReadonlyArray<{ contentId: string; brief: RedactedBriefV1; gate: RedactedGateV1; scenes: RedactedSceneSetV1 }>;
  judgePool: readonly RedactedJudgeVerdictV1[];
  judgeCallCostMinor?: number;
  judgeLatencyMs?: number;
};
export type GoldenCaseFileV1 = { case: Omit<GoldenCaseV1, "inputHash" | "caseHash">; fixture: GoldenCaseFixtureV1; inputHash: string; caseHash: string };

//SPEC §5.4
export type GoldenRubricV1 = {
  rubricId: string;
  rubricVersion: string;
  dimension: "FACTUALITY" | "HARD_GATE" | "SCENE" | "VARIETY" | "NATURALNESS" | "TEMPLATING" | "SEMANTIC_COHERENCE" | "RISK";
  unit: "CASE" | "CONTENT" | "PART" | "CLAIM" | "SCENE" | "JOB";
  labels: readonly string[];
  evidenceRequired: boolean;
  blind: boolean;
  adjudicationPolicyVersion: string;
};

// Pré-registro de thresholds: valores vivem AQUI (artefato versionado + hash),
// não na SPEC. Denominadores e regra de missing explícitos (SPEC §8-9).
export type ThresholdPolicyV1 = {
  thresholdPolicyVersion: string;
  datasetVersion: string;
  baselineRef: string;
  candidateJudgeRule: { source: "risk-assessment.v1"; judgeIfRiskBandAtLeast: "LOW" | "MEDIUM" | "HIGH" };
  thresholds: { minDeliveredAgreement: number; maxMissedReviewShare: number; minJudgeCallReductionShare: number };
  denominators: { quality: "JUDGE_EXECUTED_CONTENTS"; delivery: "CASE_TARGET_CONTENT_COUNT" };
  // Anotação cega: valor pré-registrado aqui (não inventado em SPEC/scratch).
  annotationPolicy: { category: "NATURALNESS"; rubricDimension: "NATURALNESS"; annotators: number; mode: "ADJUDICATED" };
  missingRule: string;
};

//SPEC §7.1
export type BlindAssignmentV1 = {
  assignmentId: string;
  caseId: string;
  opaqueArmId: string;
  opaqueAnnotatorId: string;
  rubricVersion: string;
  assignmentSeed: string;
  assignmentHash: string;
  status: "ASSIGNED" | "ANNOTATED" | "ADJUDICATED" | "INVALID";
};
// Visão do anotador: NUNCA contém braço, provider, modelo, tier, risco, veredito
// ou resultado esperado (SPEC §7.1). O mapeamento opaque→arm fica fora desta view.
export type AnnotatorViewV1 = { assignmentId: string; caseId: string; opaqueArmId: string; rubricVersion: string; labels: readonly string[] };

// ─── Replay e braços A/B ─────────────────────────────────────────────────────
export type JudgeExecution = "EXECUTED" | "NOT_EXECUTED" | "FAILED" | "NOT_APPLICABLE";
export type ReplayContentV1 = {
  contentId: string;
  riskBand: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  delivered: boolean;
  gateDecision: "PASS" | "REPAIR" | "REJECT";
  sceneStatus: "AVAILABLE" | "FILTERED" | "ERROR";
};
export type ReplayArtifactV1 = {
  caseId: string;
  jobSeed: string;
  replayHash: string;
  contents: readonly ReplayContentV1[];
  deliveredContentIds: readonly string[];
  judgeEligibleContentIds: readonly string[];
};

export type ArmMetricsV1 = {
  arm: "BASELINE" | "CANDIDATE";
  judgeCoverage: "ALL" | "RISK_GATED";
  metadata: { provider: "fixture-replay"; model: "fixture-replay"; tier: "HIGH"; platformSkillVersion: string };
  invocation: { judgeContents: number; notExecutedContents: number; judgeCalls: number };
  quality: { executedContents: number; passContents: number; reviewContents: number; missedReviewContents: readonly string[] };
  delivery: { expected: number; delivered: number; agreement: boolean };
  cost: { state: "OBSERVED" | "UNAVAILABLE"; judgeCostMinor?: number };
  latency: { state: "OBSERVED" | "UNAVAILABLE"; latencyMs?: number };
};
export type EvalCategoryMetricsV1 = {
  cases: number;
  targetContents: number;
  deliveredContents: { baseline: number; candidate: number };
  judge: { baselineExecuted: number; baselineNotExecuted: number; candidateExecuted: number; candidateNotExecuted: number; baselineCalls: number; candidateCalls: number };
  gates: { pass: number; repair: number; reject: number };
  scenes: { available: number; filtered: number; error: number };
  repairs: number;
  retries: number;
  partialSuccessCases: number;
  latencyMs: { baseline: { p50: number | "UNAVAILABLE"; p95: number | "UNAVAILABLE" }; candidate: { p50: number | "UNAVAILABLE"; p95: number | "UNAVAILABLE" } };
  costMinor: { baseline: number | "UNAVAILABLE"; candidate: number | "UNAVAILABLE" };
};
export type EvalPairResultV1 = {
  caseId: string;
  category: string;
  scenario: GoldenScenario;
  jobSeed: string;
  pairFingerprint: string;
  deliveredContentIds: readonly string[];
  caseMetrics: {
    gates: { pass: number; repair: number; reject: number };
    scenes: { available: number; filtered: number; error: number };
    repairs: number;
    retries: number;
  };
  arms: { baseline: ArmMetricsV1; candidate: ArmMetricsV1 };
};

// ─── Provenança do par (revisão E6: fingerprint completo) ────────────────────
export type EvalProvenanceV1 = {
  engineRef: string;
  schemaRef: string;
  cardinalityRef: string;
  gateRef: string;
  rubricHash: string;
  policyHash: string;
  promptContextHash: string;
  adapterRef: string;
  timeoutRetryRef: string;
  quotaRef: string;
  persistenceRef: string;
  seedRef: string;
  observedResponseHash: string;
};

// ─── Anotação cega e adjudicação (revisão E6: offline, separada do Judge) ────
export type GoldenAnnotationV1 = {
  annotationId: string;
  caseId: string;
  opaqueArmId: string;
  assignmentHash: string;
  rubricVersion: string;
  opaqueAnnotatorId: string;
  labels: ReadonlyArray<{ contentId: string; label: string }>;
  annotationHash: string;
};
export type AdjudicationRecordV1 = {
  caseId: string;
  opaqueArmId: string;
  assignmentHash: string;
  label: string;
  adjudicator: string;
  reason: string;
  conflictBetween: readonly string[];
  adjudicationHash: string;
};
export type AnnotationCoverageV1 = {
  assignments: number;
  annotated: number;
  agreements: number;
  conflicts: number;
  adjudications: number;
};

// ─── Relatório hasheado + aprovação explícita ────────────────────────────────
export type EvalReportV1 = {
  reportVersion: typeof REPORT_VERSION;
  protocolVersion: typeof PROTOCOL_VERSION;
  datasetId: typeof DATASET_ID;
  datasetVersion: string;
  manifestHash: string;
  rubricVersion: string;
  thresholdPolicyVersion: string;
  baselineRef: string;
  constantMetadata: { tier: "HIGH"; platformSkillVersion: string; seedDerivationVersion: string };
  provenance: EvalProvenanceV1;
  pairs: readonly EvalPairResultV1[];
  aggregate: {
    baseline: { judgeCalls: number; executedContents: number; notExecutedContents: number };
    candidate: { judgeCalls: number; executedContents: number; notExecutedContents: number };
    judgeCallReductionShare: number;
    missedReviewShare: number | "UNAVAILABLE";
    deliveredAgreementRate: number;
    totalCostMinor: { baseline: number | "UNAVAILABLE"; candidate: number | "UNAVAILABLE" };
  };
  quality: {
    baseline: { passContents: number; reviewContents: number };
    candidate: { passContents: number; reviewContents: number };
  };
  creativeSystem: { mode: "FIXTURE_ONLY"; cases: number; deliveredContents: number };
  byCategory: Readonly<Record<string, EvalCategoryMetricsV1>>;
  thresholdVerdict: { meetsThresholds: boolean; violations: readonly string[] };
  annotation: AnnotationCoverageV1;
  missing: ReadonlyArray<{ caseId: string; field: string; state: MissingState }>;
  redactionScan: { passed: boolean; checkedMarkers: number };
  reportHash: string;
};
export type ApprovalArtifactV1 = {
  reportHash: string;
  decision: "APPROVED" | "REJECTED";
  approver: string;
  reason: string;
  approvalHash: string;
};
