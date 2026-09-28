// Etapa 6 — agregador, relatório hasheado e approval gate.
// Métricas com denominadores explícitos (SPEC §8-9): qualidade conta SOMENTE
// conteúdo com judge EXECUTED; NOT_EXECUTED entra na cobertura, nunca vira
// PASS/REVIEW; custo/latência ausentes são UNAVAILABLE — nunca zero inventado.
// O relatório é determinístico e hasheado; aprovação é ato explícito separado
// (artifact próprio), e APPROVED sem thresholds é rejeitado fail-closed.
import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";
import { EvalContractError, REPORT_VERSION, type AnnotationCoverageV1, type ApprovalArtifactV1, type ArmMetricsV1, type EvalCategoryMetricsV1, type EvalPairResultV1, type EvalProvenanceV1, type EvalReportV1, type ThresholdPolicyV1 } from "./types";

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const percentile = (values: number[], rank: number): number | "UNAVAILABLE" => {
  if (values.length === 0) return "UNAVAILABLE";
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * rank) - 1)]!;
};

function categoryMetrics(pairs: readonly EvalPairResultV1[]): Record<string, EvalCategoryMetricsV1> {
  const grouped = new Map<string, EvalPairResultV1[]>();
  for (const pair of pairs) grouped.set(pair.category, [...(grouped.get(pair.category) ?? []), pair]);
  return Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([category, items]) => {
    const baseline = items.map((item) => item.arms.baseline);
    const candidate = items.map((item) => item.arms.candidate);
    const caseMetrics = items.map((item) => item.caseMetrics);
    return [category, {
      cases: items.length,
      targetContents: sum(baseline.map((arm) => arm.delivery.expected)),
      deliveredContents: { baseline: sum(baseline.map((arm) => arm.delivery.delivered)), candidate: sum(candidate.map((arm) => arm.delivery.delivered)) },
      judge: {
        baselineExecuted: sum(baseline.map((arm) => arm.quality.executedContents)),
        baselineNotExecuted: sum(baseline.map((arm) => arm.invocation.notExecutedContents)),
        candidateExecuted: sum(candidate.map((arm) => arm.quality.executedContents)),
        candidateNotExecuted: sum(candidate.map((arm) => arm.invocation.notExecutedContents)),
        baselineCalls: sum(baseline.map((arm) => arm.invocation.judgeCalls)),
        candidateCalls: sum(candidate.map((arm) => arm.invocation.judgeCalls)),
      },
      gates: {
        pass: sum(caseMetrics.map((metrics) => metrics.gates.pass)),
        repair: sum(caseMetrics.map((metrics) => metrics.gates.repair)),
        reject: sum(caseMetrics.map((metrics) => metrics.gates.reject)),
      },
      scenes: {
        available: sum(caseMetrics.map((metrics) => metrics.scenes.available)),
        filtered: sum(caseMetrics.map((metrics) => metrics.scenes.filtered)),
        error: sum(caseMetrics.map((metrics) => metrics.scenes.error)),
      },
      repairs: sum(caseMetrics.map((metrics) => metrics.repairs)),
      retries: sum(caseMetrics.map((metrics) => metrics.retries)),
      partialSuccessCases: items.filter((item) => item.scenario === "PARTIAL" && item.deliveredContentIds.length > 0).length,
      latencyMs: {
        baseline: { p50: percentile(baseline.flatMap((arm) => arm.latency.latencyMs === undefined ? [] : [arm.latency.latencyMs]), 0.5), p95: percentile(baseline.flatMap((arm) => arm.latency.latencyMs === undefined ? [] : [arm.latency.latencyMs]), 0.95) },
        candidate: { p50: percentile(candidate.flatMap((arm) => arm.latency.latencyMs === undefined ? [] : [arm.latency.latencyMs]), 0.5), p95: percentile(candidate.flatMap((arm) => arm.latency.latencyMs === undefined ? [] : [arm.latency.latencyMs]), 0.95) },
      },
      costMinor: {
        baseline: baseline.every((arm) => arm.cost.state === "OBSERVED") ? sum(baseline.map((arm) => arm.cost.judgeCostMinor ?? 0)) : "UNAVAILABLE",
        candidate: candidate.every((arm) => arm.cost.state === "OBSERVED") ? sum(candidate.map((arm) => arm.cost.judgeCostMinor ?? 0)) : "UNAVAILABLE",
      },
    }];
  }));
}

// Denominador único de entrega: targetContentCount do case. `agreement` compara
// D observado (validado no replay) com D declarado no expected do case.
function armAggregate(arms: readonly ArmMetricsV1[]): EvalReportV1["aggregate"]["baseline"] & { costMinor: number | "UNAVAILABLE" } {
  const costStates = arms.map((arm) => arm.cost.state);
  const costMinor = costStates.every((state) => state === "OBSERVED") ? sum(arms.map((arm) => arm.cost.judgeCostMinor ?? 0)) : "UNAVAILABLE";
  return {
    judgeCalls: sum(arms.map((arm) => arm.invocation.judgeCalls)),
    executedContents: sum(arms.map((arm) => arm.quality.executedContents)),
    notExecutedContents: sum(arms.map((arm) => arm.invocation.notExecutedContents)),
    costMinor,
  };
}

export function thresholdVerdict(pairs: readonly EvalPairResultV1[], policy: ThresholdPolicyV1, annotation: AnnotationCoverageV1): EvalReportV1["thresholdVerdict"] {
  const violations: string[] = [];
  const baselineCalls = sum(pairs.map((pair) => pair.arms.baseline.invocation.judgeCalls));
  const candidateCalls = sum(pairs.map((pair) => pair.arms.candidate.invocation.judgeCalls));
  const agreement = pairs.every((pair) => pair.arms.baseline.delivery.agreement && pair.arms.candidate.delivery.agreement && pair.arms.baseline.delivery.delivered === pair.arms.candidate.delivery.delivered);
  if (pairs.length === 0 || !agreement) violations.push("delivered_agreement_below_min");
  if (baselineCalls > 0 && (baselineCalls - candidateCalls) / baselineCalls < policy.thresholds.minJudgeCallReductionShare) violations.push("judge_call_reduction_below_min");
  const missedTotal = sum(pairs.map((pair) => pair.arms.candidate.quality.missedReviewContents.length));
  const skippedTotal = sum(pairs.map((pair) => pair.arms.candidate.invocation.notExecutedContents));
  const missedShare = skippedTotal === 0 ? 0 : missedTotal / skippedTotal;
  if (missedShare > policy.thresholds.maxMissedReviewShare) violations.push("missed_review_share_above_max");
  // Anotação cega: assignments da categoria exigida precisam estar anotados e
  // adjudicados (conflito sem adjudicação é violação) — qualidade de anotação
  // NUNCA vem do judge.
  if (annotation.assignments > 0 && (annotation.annotated < annotation.assignments || annotation.conflicts > annotation.adjudications)) violations.push("annotation_coverage_incomplete");
  // Invariante single-variable: metadados idênticos nos braços em todo par.
  for (const pair of pairs) {
    if (canonicalSerialization(pair.arms.baseline.metadata) !== canonicalSerialization(pair.arms.candidate.metadata)) violations.push(`metadata_drift:${pair.caseId}`);
  }
  return { meetsThresholds: violations.length === 0, violations };
}

// Marcadores proibidos no relatório: prefixos das instruções do provider e
// QUALQUER texto literal de fixture (hooks/scripts/cenas). O relatório carrega
// apenas ids, contadores, estados e hashes — o scan é a invariância enforceada.
export function redactionMarkers(datasetTexts: readonly string[]): readonly string[] {
  return ["curadoria semântica INTERNA", "Retorne um objeto JSON raiz", "CreativeBlueprint", ...datasetTexts];
}

export function buildReport(parts: {
  datasetVersion: string;
  manifestHash: string;
  rubricVersion: string;
  policy: ThresholdPolicyV1;
  pairs: readonly EvalPairResultV1[];
  annotation: AnnotationCoverageV1;
  provenance: EvalProvenanceV1;
  missing: EvalReportV1["missing"];
  datasetTexts: readonly string[];
}): EvalReportV1 {
  const { policy, pairs } = parts;
  const baseline = armAggregate(pairs.map((pair) => pair.arms.baseline));
  const candidate = armAggregate(pairs.map((pair) => pair.arms.candidate));
  const missedTotal = sum(pairs.map((pair) => pair.arms.candidate.quality.missedReviewContents.length));
  const skippedTotal = candidate.notExecutedContents;
  const report: Omit<EvalReportV1, "reportHash"> = {
    reportVersion: REPORT_VERSION,
    protocolVersion: "eval-protocol.v1",
    datasetId: "commerce-intelligence-golden",
    datasetVersion: parts.datasetVersion,
    manifestHash: parts.manifestHash,
    rubricVersion: parts.rubricVersion,
    thresholdPolicyVersion: policy.thresholdPolicyVersion,
    baselineRef: policy.baselineRef,
    constantMetadata: { tier: "HIGH", platformSkillVersion: "tiktok-commerce@1.2", seedDerivationVersion: "eval-job-seed.v1" },
    provenance: parts.provenance,
    pairs,
    aggregate: {
      baseline: { judgeCalls: baseline.judgeCalls, executedContents: baseline.executedContents, notExecutedContents: baseline.notExecutedContents },
      candidate: { judgeCalls: candidate.judgeCalls, executedContents: candidate.executedContents, notExecutedContents: candidate.notExecutedContents },
      judgeCallReductionShare: baseline.judgeCalls === 0 ? 0 : (baseline.judgeCalls - candidate.judgeCalls) / baseline.judgeCalls,
      missedReviewShare: skippedTotal === 0 ? "UNAVAILABLE" : missedTotal / skippedTotal,
      deliveredAgreementRate: pairs.length === 0 ? 0 : pairs.filter((pair) => pair.arms.candidate.delivery.agreement && pair.arms.baseline.delivery.agreement).length / pairs.length,
      totalCostMinor: { baseline: baseline.costMinor, candidate: candidate.costMinor },
    },
    quality: {
      baseline: { passContents: sum(pairs.map((pair) => pair.arms.baseline.quality.passContents)), reviewContents: sum(pairs.map((pair) => pair.arms.baseline.quality.reviewContents)) },
      candidate: { passContents: sum(pairs.map((pair) => pair.arms.candidate.quality.passContents)), reviewContents: sum(pairs.map((pair) => pair.arms.candidate.quality.reviewContents)) },
    },
    creativeSystem: { mode: "FIXTURE_ONLY", cases: pairs.length, deliveredContents: sum(pairs.map((pair) => pair.deliveredContentIds.length)) },
    byCategory: categoryMetrics(pairs),
    thresholdVerdict: thresholdVerdict(pairs, policy, parts.annotation),
    annotation: parts.annotation,
    missing: parts.missing,
    redactionScan: { passed: false, checkedMarkers: 0 },
  };
  const markers = redactionMarkers(parts.datasetTexts);
  const serialized = canonicalSerialization(report);
  const leaked = markers.filter((marker) => serialized.includes(marker));
  if (leaked.length > 0) throw new EvalContractError("EVAL-REPORT", `Relatório vazaria conteúdo proibido: ${leaked.join(", ")}`);
  const scanned: Omit<EvalReportV1, "reportHash"> = { ...report, redactionScan: { passed: true, checkedMarkers: markers.length } };
  return { ...scanned, reportHash: sha256Hex(canonicalSerialization(scanned)) };
}

// Aprovação é ATO EXPLÍCITO: decision APPROVED exige meetsThresholds=true e
// relatório hasheado íntegro; REJECTED é sempre permitido. O artifact carrega o
// reportHash — a aprovação nunca muta o relatório.
export function approveReport(report: EvalReportV1, decision: { decision: "APPROVED" | "REJECTED"; approver: string; reason: string }): ApprovalArtifactV1 {
  if (!verifyReportHash(report)) throw new EvalContractError("EVAL-APPROVAL", "reportHash divergente — relatório não é íntegro");
  if (!decision.approver.trim() || !decision.reason.trim()) throw new EvalContractError("EVAL-APPROVAL", "Aprovação sem approver/reason explícitos");
  if (decision.decision === "APPROVED" && !report.thresholdVerdict.meetsThresholds) {
    throw new EvalContractError("EVAL-APPROVAL", `APPROVED proibido: thresholds não atendidos (${report.thresholdVerdict.violations.join(", ")})`);
  }
  const artifact = { reportHash: report.reportHash, decision: decision.decision, approver: decision.approver, reason: decision.reason };
  return { ...artifact, approvalHash: sha256Hex(canonicalSerialization(artifact)) };
}

export function verifyReportHash(report: EvalReportV1): boolean {
  const { reportHash, ...rest } = report;
  if (rest.redactionScan.passed !== true) return false;
  return sha256Hex(canonicalSerialization(rest)) === reportHash;
}
