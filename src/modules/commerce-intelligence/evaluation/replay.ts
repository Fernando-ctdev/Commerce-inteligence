// Etapa 6 — replayer offline determinístico + estágio de judge OWNED pelo harness.
// A geração fixa do case é reproduzida idêntica para os DOIS braços; a ÚNICA
// variável é invocação/cobertura de CONTENT_QUALITY_JUDGE: BASELINE julga 100% do
// pool elegível; CANDIDATE julga só o que o risk-assessment determinístico (E5,
// sinais objetivos pré-judge) marcar >= threshold de banda. Conteúdo pulado é
// NOT_EXECUTED — nunca PASS/REVIEW sintético — e sai do denominador de qualidade.
// D/N é idêntico nos braços: ausência de judge não cria F nem muda entrega.
import { JUDGE_BATCH_MAX } from "../semantic-quality";
import { ENGINE_VERSION } from "../engine";
import { buildRiskAssessment, RISK_ASSESSMENT_CONTRACT_VERSION, type RiskBand } from "../risk-assessment";
import { CONTENT_QUALITY_JUDGE_INSTRUCTION } from "../provider";
import { CARDINALITY_POLICY_VERSION, PARTIAL_FAILURE_CAP } from "../contract";
import { GATE_POLICY_VERSION } from "../gates";
import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";
import { EvalContractError, SEED_DERIVATION_VERSION, type ArmMetricsV1, type EvalPairResultV1, type EvalProvenanceV1, type GoldenCaseFileV1, type ReplayArtifactV1, type RedactedJudgeVerdictV1, type ThresholdPolicyV1 } from "./types";

const SEVERITY_RANK: Record<RiskBand, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

// Provenança completa do par (bloqueio 3 da revisão): refs/hashes explícitos de
// engine, schema/cardinalidade, gate, rubric/policy, prompt/contexto, adapter,
// timeout/retry, quota, persistência, seed e resposta observada. Constantes
// REAIS do runtime onde existem; contratos nomeados onde são contratos.
export function buildProvenance(parts: { rubricHash: string; policyHash: string; creatorContext: unknown; observedResponses: unknown }): EvalProvenanceV1 {
  return {
    engineRef: `engine@v${ENGINE_VERSION}`,
    schemaRef: `golden-case.v1+cardinality-policy-v${CARDINALITY_POLICY_VERSION}`,
    cardinalityRef: `CARDINALITY_POLICY_VERSION=${CARDINALITY_POLICY_VERSION}`,
    gateRef: `GATE_POLICY_VERSION=${GATE_POLICY_VERSION}`,
    rubricHash: parts.rubricHash,
    policyHash: parts.policyHash,
    promptContextHash: sha256Hex(canonicalSerialization({ instruction: sha256Hex(CONTENT_QUALITY_JUDGE_INSTRUCTION), creatorContext: parts.creatorContext })),
    adapterRef: `risk-assessment@${RISK_ASSESSMENT_CONTRACT_VERSION}`,
    timeoutRetryRef: `PARTIAL_FAILURE_CAP=${PARTIAL_FAILURE_CAP};judge-batch-max=${JUDGE_BATCH_MAX}`,
    quotaRef: "adr-021-quota.v1",
    persistenceRef: "brief-payload-v2+content-scene-set.v1",
    seedRef: SEED_DERIVATION_VERSION,
    observedResponseHash: sha256Hex(canonicalSerialization(parts.observedResponses)),
  };
}

// Seed do par derivado do jobId lógico do case — sem timestamp/Math.random/UUID.
// O MESMO jobSeed alimenta os dois braços (SPEC §6).
export function deriveJobSeed(datasetVersion: string, caseId: string): string {
  return sha256Hex(`${SEED_DERIVATION_VERSION}\0${datasetVersion}\0${caseId}`);
}

// Entrega é propriedade objetiva do fixture: gate PASS + scene set AVAILABLE>=2
// (ADR-019/ADR-021). Divergência do `expected` declarado é drift → fail-closed.
function deliveredOf(fixture: GoldenCaseFileV1["fixture"]): Set<string> {
  const delivered = new Set<string>();
  for (const content of fixture.contents) {
    if (content.gate.decision === "PASS" && content.scenes.status === "AVAILABLE" && content.scenes.kept >= 2) delivered.add(content.contentId);
  }
  return delivered;
}

// Replay determinístico do case: valida coerência do fixture, deriva risco
// objetivo pré-judge por conteúdo (E5) e hashea o artefato (replayHash).
export function replayCase(caseFile: GoldenCaseFileV1): ReplayArtifactV1 {
  const { case: goldenCase, fixture } = caseFile;
  const delivered = deliveredOf(fixture);
  const expectedIds = [...goldenCase.expected.deliveredContentIds];
  if (expectedIds.length !== delivered.size || !expectedIds.every((id) => delivered.has(id))) {
    throw new EvalContractError("EVAL-REPLAY", `Drift de entrega declarada vs derivada no case ${goldenCase.caseId}`);
  }
  const target = goldenCase.request.targetContentCount;
  if (fixture.contents.length !== target) {
    throw new EvalContractError("EVAL-REPLAY", `Case ${goldenCase.caseId} declara ${target} conteúdos mas o fixture tem ${fixture.contents.length}`);
  }
  // Borda ADR-021: F acima do CAP reprova o job inteiro (delivered = 0);
  // F no CAP ou abaixo permite parcial; F=0 exige entrega integral.
  const failures = target - delivered.size;
  if (failures > PARTIAL_FAILURE_CAP && delivered.size > 0) {
    throw new EvalContractError("EVAL-REPLAY", `Case ${goldenCase.caseId} com F=${failures} acima do CAP=${PARTIAL_FAILURE_CAP} não pode declarar entrega parcial`);
  }
  const knownRefs = new Set(fixture.evidence.refs);
  const contents = [...fixture.contents].sort((a, b) => a.contentId.localeCompare(b.contentId)).map((content) => {
    if (content.gate.briefId !== `${content.contentId}:brief-1`) {
      throw new EvalContractError("EVAL-REPLAY", `briefId inconsistente no case ${goldenCase.caseId}: ${content.contentId}`);
    }
    if (!content.gate.evidenceRefs.every((ref) => knownRefs.has(ref))) {
      throw new EvalContractError("EVAL-REPLAY", `evidenceRef órfã no case ${goldenCase.caseId}: ${content.contentId}`);
    }
    // Decisão de cobertura do braço candidato é PRÉ-judge: judge=NOT_EXECUTED,
    // blueprint N/A (@1.2; fixture-only). riskBand vem só de gate + cenas.
    const gateReport = { ...content.gate, evidenceRefs: [...content.gate.evidenceRefs], issues: [...content.gate.issues] };
    const assessment = buildRiskAssessment({
      policyVersion: "eval-candidate-rule.v1",
      subject: { jobId: goldenCase.request.jobId, contentId: content.contentId },
      evidenceRefs: fixture.evidence.refs,
      hardGate: { status: "AVAILABLE", reports: [gateReport] },
      judge: { execution: "NOT_EXECUTED", records: [] },
      blueprintFixture: "NOT_APPLICABLE",
      scenes: [content.scenes],
    });
    return {
      contentId: content.contentId,
      riskBand: assessment.riskBand,
      delivered: delivered.has(content.contentId),
      gateDecision: content.gate.decision,
      sceneStatus: content.scenes.status,
    };
  });
  const judgeEligible = contents.filter((content) => content.gateDecision !== "REJECT").map((content) => content.contentId);
  const poolIds = new Set(fixture.judgePool.map((verdict) => verdict.contentId));
  if (!judgeEligible.every((id) => poolIds.has(id))) {
    throw new EvalContractError("EVAL-REPLAY", `judgePool não cobre o pool elegível no case ${goldenCase.caseId}`);
  }
  const jobSeed = deriveJobSeed(goldenCase.datasetVersion, goldenCase.caseId);
  const artifactBase = { caseId: goldenCase.caseId, jobSeed, contents, deliveredContentIds: [...delivered].sort(), judgeEligibleContentIds: [...judgeEligible].sort() };
  return { ...artifactBase, replayHash: sha256Hex(canonicalSerialization(artifactBase)) };
}

const bandAtLeast = (band: RiskBand, minimum: string): boolean => SEVERITY_RANK[band] >= SEVERITY_RANK[minimum as RiskBand];
const verdictHasReview = (verdict: RedactedJudgeVerdictV1 | undefined): boolean => Boolean(verdict?.parts.some((part) => part.status === "REVIEW"));

// Estágio de judge OWNED pelo harness sobre o MESMO replay: cobertura ALL vs
// regra candidata; vereditos vêm do pool fixturado; pulados são NOT_EXECUTED.
export function runArms(caseFile: GoldenCaseFileV1, artifact: ReplayArtifactV1, policy: ThresholdPolicyV1, manifestHash: string, provenance: EvalProvenanceV1): EvalPairResultV1 {
  const { fixture } = caseFile;
  const verdictByContent = new Map(fixture.judgePool.map((verdict) => [verdict.contentId, verdict]));
  const bandByContent = new Map(artifact.contents.map((content) => [content.contentId, content.riskBand]));
  const minimum = policy.candidateJudgeRule.judgeIfRiskBandAtLeast;
  const judgeCandidate = (contentId: string): boolean => bandAtLeast(bandByContent.get(contentId) ?? "NONE", minimum);
  const metadata = { provider: "fixture-replay", model: "fixture-replay", tier: "HIGH", platformSkillVersion: "tiktok-commerce@1.2" } as const;

  const armMetrics = (arm: ArmMetricsV1["arm"], coverage: ArmMetricsV1["judgeCoverage"], judged: Set<string>): ArmMetricsV1 => {
    const executed = artifact.judgeEligibleContentIds.filter((id) => judged.has(id));
    const notExecuted = artifact.judgeEligibleContentIds.length - executed.length;
    const reviews = executed.filter((id) => verdictHasReview(verdictByContent.get(id)));
    const passes = executed.length - reviews.length;
    const skipped = artifact.judgeEligibleContentIds.filter((id) => !judged.has(id));
    const missedReviews = arm === "CANDIDATE" ? skipped.filter((id) => verdictHasReview(verdictByContent.get(id))) : [];
    const cost = fixture.judgeCallCostMinor === undefined
      ? { state: "UNAVAILABLE" as const }
      : { state: "OBSERVED" as const, judgeCostMinor: Math.ceil(executed.length / JUDGE_BATCH_MAX) * fixture.judgeCallCostMinor };
    // Chamadas efetivas: lotes ceil(executed/JUDGE_BATCH_MAX) + retries fixturados
    // dos conteúdos julgados (TECHNICAL_RETRY: judge FAILED re-executado).
    const retriedCalls = executed.reduce((total, id) => total + (verdictByContent.get(id)?.retries ?? 0), 0);
    return {
      arm,
      judgeCoverage: coverage,
      metadata: { ...metadata },
      invocation: { judgeContents: executed.length, notExecutedContents: notExecuted, judgeCalls: Math.ceil(executed.length / JUDGE_BATCH_MAX) + retriedCalls },
      quality: { executedContents: executed.length, passContents: passes, reviewContents: reviews.length, missedReviewContents: [...missedReviews].sort() },
      delivery: { expected: artifact.deliveredContentIds.length, delivered: artifact.deliveredContentIds.length, agreement: true },
      cost,
      latency: fixture.judgeLatencyMs === undefined ? { state: "UNAVAILABLE" as const } : { state: "OBSERVED" as const, latencyMs: fixture.judgeLatencyMs },
    };
  };

  const baseline = armMetrics("BASELINE", "ALL", new Set(artifact.judgeEligibleContentIds));
  const candidate = armMetrics("CANDIDATE", "RISK_GATED", new Set(artifact.judgeEligibleContentIds.filter(judgeCandidate)));
  const gateCounts = caseFile.fixture.contents.reduce((counts, content) => {
    counts[content.gate.decision.toLowerCase() as "pass" | "repair" | "reject"] += 1;
    return counts;
  }, { pass: 0, repair: 0, reject: 0 });
  const sceneCounts = caseFile.fixture.contents.reduce((counts, content) => {
    counts[content.scenes.status.toLowerCase() as "available" | "filtered" | "error"] += 1;
    return counts;
  }, { available: 0, filtered: 0, error: 0 });
  const retries = fixture.judgePool.reduce((total, verdict) => total + (verdict.retries ?? 0), 0);
  return {
    caseId: caseFile.case.caseId,
    category: caseFile.case.category,
    scenario: caseFile.case.scenario,
    jobSeed: artifact.jobSeed,
    pairFingerprint: pairFingerprint({
      datasetVersion: caseFile.case.datasetVersion,
      manifestHash,
      caseHash: caseFile.caseHash,
      inputHash: caseFile.inputHash,
      baselineRef: policy.baselineRef,
      thresholdPolicyVersion: policy.thresholdPolicyVersion,
      jobSeed: artifact.jobSeed,
      replayHash: artifact.replayHash,
      provenance,
    }),
    deliveredContentIds: artifact.deliveredContentIds,
    caseMetrics: {
      gates: gateCounts,
      scenes: sceneCounts,
      repairs: gateCounts.repair,
      retries,
    },
    arms: { baseline, candidate },
  };
}

// Fingerprint do par (SPEC §6 adaptado offline): dataset/case/input/replay/
// baseline/policy/seed — serialização canônica + SHA-256. Qualquer drift muda o
// fingerprint e invalida o par antes do resultado.
export function pairFingerprint(parts: { datasetVersion: string; manifestHash: string; caseHash: string; inputHash: string; baselineRef: string; thresholdPolicyVersion: string; jobSeed: string; replayHash: string; provenance: EvalProvenanceV1 }): string {
  return sha256Hex(canonicalSerialization({
    protocolVersion: "eval-protocol.v1",
    seedDerivationVersion: SEED_DERIVATION_VERSION,
    skillBinding: { platformSkillVersion: "tiktok-commerce@1.2" },
    tier: "HIGH",
    ...parts,
  }));
}
