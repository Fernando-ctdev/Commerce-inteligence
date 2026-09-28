// Etapa 6 — anotação cega offline e adjudicação (bloqueio 2 da revisão).
// Labels cegas da rubric são AUTORIDADE PRÓPRIA e NUNCA são substituídas por
// veredito do CONTENT_QUALITY_JUDGE nem por RiskAssessment. Tudo tipado,
// hasheado e fail-closed: drift de hash, assignment desconhecido, rubric não
// cega, label fora do vocabulário e adjudicação sem conflito real são rejeitados.
import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";
import { EvalContractError, type AdjudicationRecordV1, type GoldenAnnotationV1, type GoldenCaseFileV1, type GoldenRubricV1, type ThresholdPolicyV1 } from "./types";
import { deriveAssignments } from "./assignment";
import { deriveJobSeed } from "./replay";

// assignmentSeed é por (case, par de braços) — anotadores DIFERENTES anotam o
// MESMO assignment cego; a diferença fica só em opaqueAnnotatorId.
export function assignmentsForCase(caseFile: GoldenCaseFileV1, rubric: GoldenRubricV1, annotatorIds: readonly string[]) {
  const jobSeed = deriveJobSeed(caseFile.case.datasetVersion, caseFile.case.caseId);
  return annotatorIds.map((annotatorId) => deriveAssignments({ caseId: caseFile.case.caseId, jobSeed, rubric, annotatorId })).flat();
}

const base = (annotation: GoldenAnnotationV1): Omit<GoldenAnnotationV1, "annotationHash"> => {
  const { annotationHash: _omitted, ...rest } = annotation;
  return rest;
};

export function verifyAnnotation(annotation: GoldenAnnotationV1, rubric: GoldenRubricV1, validAssignments: ReadonlyArray<{ assignment: { assignmentId: string; caseId: string; opaqueArmId: string; rubricVersion: string; assignmentHash: string } }>, caseContents: readonly string[]): void {
  if (sha256Hex(canonicalSerialization(base(annotation))) !== annotation.annotationHash) throw new EvalContractError("EVAL-ANNOTATION", `annotationHash divergente: ${annotation.annotationId}`);
  const match = validAssignments.find((item) => item.assignment.assignmentHash === annotation.assignmentHash && item.assignment.opaqueArmId === annotation.opaqueArmId && item.assignment.assignmentId === annotation.annotationId.split("@")[0]);
  if (!match) throw new EvalContractError("EVAL-ANNOTATION", `Annotation referencia assignment inexistente: ${annotation.annotationId}`);
  if (!rubric.blind) throw new EvalContractError("EVAL-ANNOTATION", "Rubric da annotation não é cega");
  if (annotation.rubricVersion !== rubric.rubricVersion) throw new EvalContractError("EVAL-ANNOTATION", "rubricVersion da annotation divergente");
  if (annotation.labels.length === 0) throw new EvalContractError("EVAL-ANNOTATION", `Annotation sem labels: ${annotation.annotationId}`);
  for (const item of annotation.labels) {
    if (!rubric.labels.includes(item.label)) throw new EvalContractError("EVAL-ANNOTATION", `Label fora do vocabulário da rubric: ${item.label}`);
    if (!caseContents.includes(item.contentId)) throw new EvalContractError("EVAL-ANNOTATION", `contentId fora do case: ${item.contentId}`);
  }
}

export function verifyAdjudication(record: AdjudicationRecordV1, rubric: GoldenRubricV1, annotations: readonly GoldenAnnotationV1[]): void {
  const { adjudicationHash, ...rest } = record;
  if (sha256Hex(canonicalSerialization(rest)) !== adjudicationHash) throw new EvalContractError("EVAL-ANNOTATION", `adjudicationHash divergente: ${record.caseId}:${record.opaqueArmId}`);
  const pair = annotations.filter((item) => item.caseId === record.caseId && item.opaqueArmId === record.opaqueArmId && item.assignmentHash === record.assignmentHash);
  if (pair.length !== 2) throw new EvalContractError("EVAL-ANNOTATION", "Adjudicação exige exatamente duas annotations do assignment");
  if (!record.conflictBetween.every((id) => pair.some((item) => item.annotationId === id))) throw new EvalContractError("EVAL-ANNOTATION", "conflictBetween não referencia as annotations do par");
  const differing = pair[0]!.labels.filter((label, index) => pair[1]!.labels[index]?.label !== undefined && pair[1]!.labels[index]!.label !== label.label);
  if (differing.length === 0) throw new EvalContractError("EVAL-ANNOTATION", "Adjudicação sem conflito real é proibida");
  if (!rubric.labels.includes(record.label)) throw new EvalContractError("EVAL-ANNOTATION", `Label adjudicado fora do vocabulário: ${record.label}`);
  if (!record.adjudicator.trim() || !record.reason.trim()) throw new EvalContractError("EVAL-ANNOTATION", "Adjudicação sem adjudicator/reason");
}

// Resultado consolidado por assignment: labels adjudicados (ou concordantes).
export type AdjudicatedAssignment = { caseId: string; opaqueArmId: string; labels: ReadonlyArray<{ contentId: string; label: string }>; outcome: "AGREEMENT" | "ADJUDICATED" };

export function consolidateAnnotations(parts: { caseFiles: readonly GoldenCaseFileV1[]; rubric: GoldenRubricV1; policy: ThresholdPolicyV1; annotations: readonly GoldenAnnotationV1[]; adjudications: readonly AdjudicationRecordV1[] }): { coverage: { assignments: number; annotated: number; agreements: number; conflicts: number; adjudications: number }; adjudicated: ReadonlyArray<AdjudicatedAssignment> } {
  const { rubric, policy } = parts;
  if (!rubric.blind || rubric.dimension !== policy.annotationPolicy.rubricDimension) throw new EvalContractError("EVAL-ANNOTATION", "Rubric não corresponde à annotationPolicy");
  const requiredCases = parts.caseFiles.filter((file) => file.case.category === policy.annotationPolicy.category);
  const annotatorIds = Array.from({ length: policy.annotationPolicy.annotators }, (_unused, index) => `annotator-${index + 1}`);  // Fail-closed primeiro: toda annotation é verificada (hash, assignment, vocabulário)
  // e só anotadores pré-registrados na policy são aceitos.
  for (const annotation of parts.annotations) {
    if (!annotatorIds.includes(annotation.opaqueAnnotatorId)) throw new EvalContractError("EVAL-ANNOTATION", `Anotador fora da policy: ${annotation.opaqueAnnotatorId}`);
    const caseFile = parts.caseFiles.find((file) => file.case.caseId === annotation.caseId);
    if (!caseFile) throw new EvalContractError("EVAL-ANNOTATION", `Annotation para case inexistente: ${annotation.caseId}`);
    verifyAnnotation(annotation, rubric, assignmentsForCase(caseFile, rubric, annotatorIds), caseFile.fixture.contents.map((content) => content.contentId));
  }
  let agreements = 0;
  let conflicts = 0;
  const adjudicated: AdjudicatedAssignment[] = [];
  let assignments = 0;
  let annotated = 0;
  for (const caseFile of requiredCases) {
    // Assignments são POR BRAÇO (arm-level): dois anotadores compartilham o
    // mesmo assignment — dedupe por assignmentHash, não por anotador.
    const arms = new Map<string, { assignmentHash: string; opaqueArmId: string; assignmentId: string; caseId: string }>();
    for (const { assignment } of assignmentsForCase(caseFile, rubric, annotatorIds)) {
      if (!arms.has(assignment.assignmentHash)) arms.set(assignment.assignmentHash, { assignmentHash: assignment.assignmentHash, opaqueArmId: assignment.opaqueArmId, assignmentId: assignment.assignmentId, caseId: assignment.caseId });
    }
    assignments += arms.size;
    for (const arm of arms.values()) {
      const group = parts.annotations.filter((item) => item.assignmentHash === arm.assignmentHash && item.opaqueArmId === arm.opaqueArmId);
      if (group.length > 0) annotated += 1;
      if (group.length !== policy.annotationPolicy.annotators) continue;
      const same = group[0]!.labels.every((label, index) => group.every((item) => item.labels[index]?.label === label.label));
      if (same) {
        agreements += 1;
        adjudicated.push({ caseId: arm.caseId, opaqueArmId: arm.opaqueArmId, labels: group[0]!.labels, outcome: "AGREEMENT" });
        continue;
      }
      conflicts += 1;
      const record = parts.adjudications.find((item) => item.assignmentHash === arm.assignmentHash && item.opaqueArmId === arm.opaqueArmId);
      if (!record) continue;
      verifyAdjudication(record, rubric, group);
      // Adjudicação resolve SOMENTE as posições conflitantes; concordantes ficam.
      const resolved = group[0]!.labels.map((label, index) => ({ contentId: label.contentId, label: group.every((item) => item.labels[index]?.label === label.label) ? label.label : record.label }));
      adjudicated.push({ caseId: arm.caseId, opaqueArmId: arm.opaqueArmId, labels: resolved, outcome: "ADJUDICATED" });
    }
  }
  return { coverage: { assignments, annotated, agreements, conflicts, adjudications: parts.adjudications.length }, adjudicated };
}
