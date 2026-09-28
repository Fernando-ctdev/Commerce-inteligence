// Etapa 6 — assignment cego (SPEC §7.1): o anotador recebe view sem braço,
// provider, modelo, tier, risco, veredito ou resultado esperado. O mapeamento
// opaqueArmId→arm fica fora da view (adjudicação). Duplicidade de (case, arm)
// e drift de hash tornam o assignment INVALID.
import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";
import { EvalContractError, type AnnotatorViewV1, type BlindAssignmentV1, type GoldenRubricV1 } from "./types";

const ARMS = ["BASELINE", "CANDIDATE"] as const;
export type EvalArm = (typeof ARMS)[number];

// Seed do assignment é por (case, par de braços): anotadores diferentes
// compartilham o MESMO assignment cego (mesmo opaqueArmId); o anotador só
// aparece em opaqueAnnotatorId — nunca na identidade do braço.
export function deriveAssignments(parts: { caseId: string; jobSeed: string; rubric: GoldenRubricV1; annotatorId: string }): Array<{ assignment: BlindAssignmentV1; arm: EvalArm }> {
  if (!parts.caseId.trim() || !parts.jobSeed.trim() || !parts.annotatorId.trim()) throw new EvalContractError("EVAL-ASSIGNMENT", "Assignment com campos vazios");
  if (!parts.rubric.blind) throw new EvalContractError("EVAL-ASSIGNMENT", "Assignment exige rubric blind");
  const assignmentSeed = sha256Hex(`eval-assignment.v1\0${parts.jobSeed}`);
  return ARMS.map((arm) => {
    const opaqueArmId = sha256Hex(`${assignmentSeed}\0arm\0${arm}`).slice(0, 16);
    const base = { assignmentId: `${parts.caseId}:${opaqueArmId}`, caseId: parts.caseId, opaqueArmId, opaqueAnnotatorId: parts.annotatorId, rubricVersion: parts.rubric.rubricVersion, assignmentSeed, status: "ASSIGNED" as const };
    // assignmentHash é identidade do BRAÇO cego (sem anotador): anotadores
    // diferentes do mesmo braço compartilham o hash — é o que permite
    // agreement/conflict entre anotações do MESMO assignment.
    const assignmentHash = sha256Hex(canonicalSerialization({ assignmentId: base.assignmentId, caseId: base.caseId, opaqueArmId: base.opaqueArmId, rubricVersion: base.rubricVersion, assignmentSeed: base.assignmentSeed }));
    const assignment: BlindAssignmentV1 = { ...base, assignmentHash };
    return { assignment, arm };
  });
}

// Mapeamento adjudicador: opaqueArmId → braço real. Nunca entra na view cega.
export function armMapping(assignments: ReadonlyArray<{ assignment: BlindAssignmentV1; arm: EvalArm }>): Readonly<Record<string, EvalArm>> {
  const mapping: Record<string, EvalArm> = {};
  for (const { assignment, arm } of assignments) {
    if (mapping[assignment.opaqueArmId] !== undefined) throw new EvalContractError("EVAL-ASSIGNMENT", `opaqueArmId duplicado: ${assignment.opaqueArmId}`);
    mapping[assignment.opaqueArmId] = arm;
  }
  const seenCases: Record<string, true> = {};
  for (const { assignment, arm } of assignments) {
    const key = `${assignment.caseId}:${arm}`;
    if (seenCases[key]) throw new EvalContractError("EVAL-ASSIGNMENT", `Assignment duplicado para ${key}`);
    seenCases[key] = true;
  }
  return mapping;
}

// A única projeção que o anotador vê (SPEC §7.1). Labels vêm da rubric.
// Scan por TOKEN JSON ('"arm":') — a chave contratual opaqueArmId é legítima e
// não pode false-positivar; valores de braço/risco/veredito seguem proibidos.
export function annotatorView(assignment: BlindAssignmentV1, rubric: GoldenRubricV1): AnnotatorViewV1 {
  const view = { assignmentId: assignment.assignmentId, caseId: assignment.caseId, opaqueArmId: assignment.opaqueArmId, rubricVersion: assignment.rubricVersion, labels: [...rubric.labels] };
  const serialized = canonicalSerialization(view).toLowerCase();
  for (const forbidden of ['"arm":', '"coverage":', '"provider"', '"model"', '"tier"', '"risk"', '"verdict"', '"expected"', "baseline", "candidate", "execut"]) {
    if (serialized.includes(forbidden)) throw new EvalContractError("EVAL-ASSIGNMENT", `View cega vazou campo proibido: ${forbidden}`);
  }
  return view;
}

// Drift de assignment: hash divergente → INVALID (fail-closed). Mesma fórmula
// arm-level do deriveAssignments (identidade do braço, sem o anotador).
export function verifyAssignment(assignment: BlindAssignmentV1): void {
  const expected = sha256Hex(canonicalSerialization({ assignmentId: assignment.assignmentId, caseId: assignment.caseId, opaqueArmId: assignment.opaqueArmId, rubricVersion: assignment.rubricVersion, assignmentSeed: assignment.assignmentSeed }));
  if (expected !== assignment.assignmentHash) throw new EvalContractError("EVAL-ASSIGNMENT", `assignmentHash divergente: ${assignment.assignmentId}`);
}
