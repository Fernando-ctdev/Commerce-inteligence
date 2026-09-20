// Task 1 — deterministic plan skeleton (Blueprint): alocação determinística do
// plano sai do provider. O provider recebe slots (um por conteúdo) e retorna
// SOMENTE campos criativos; server-owned fields são injetados pelo engine.
import { ContractError } from "./contract";

export const PLAN_POLICY_VERSION = 1;

export type PlanSlot = {
  position: number;
  contentId: string;
  opportunityId: string;
  eligibleHookMechanisms: string[];
  maxPerBucket: number;
};

export type PlanSkeleton = {
  policyVersion: number;
  slots: PlanSlot[];
};

// Restrição de memória existente (ADR-004): mecanismos já entregues não repetem
// enquanto houver alternativa — sem inventar mecanismos fora do repertório.
const deliveredMechanisms = (memory: Record<string, unknown>): ReadonlySet<string> => {
  const delivered = (memory as { deliveredHookMechanisms?: unknown }).deliveredHookMechanisms;
  return new Set(
    Array.isArray(delivered)
      ? delivered.filter((mechanism): mechanism is string => typeof mechanism === "string").map((mechanism) => mechanism.toLowerCase())
      : [],
  );
};

export function buildPlanSkeleton(input: {
  jobId: string;
  productId: string;
  targetContentCount: number;
  deliverableHookMechanisms: readonly string[];
  memory: Record<string, unknown>;
}): PlanSkeleton {
  // Ordem estável do catálogo: deliverableHookMechanisms já chega em ordem
  // canônica de buckets — deduplicar preserva essa ordem.
  const eligible = [...new Set(input.deliverableHookMechanisms)];
  const delivered = deliveredMechanisms(input.memory);
  const allowed = eligible.filter((mechanism) => !delivered.has(mechanism.toLowerCase()));
  // Fail-closed existente: ausência de pattern deliverable é GEN-PATTERN.
  // GEN-VARIETY permanece no gate do plano (validateContentPlan), após geração.
  if (allowed.length === 0)
    throw new ContractError("GEN-PATTERN", "Nenhum mecanismo de hook deliverable restante após constraints de memória", "hookMechanism");
  const maxPerBucket = Math.ceil(input.targetContentCount / allowed.length);
  const slots: PlanSlot[] = Array.from({ length: input.targetContentCount }, (_, index) => ({
    position: index + 1,
    contentId: `${input.jobId}-content-${index + 1}`,
    opportunityId: `${input.jobId}-opportunity-${index + 1}`,
    eligibleHookMechanisms: [...allowed],
    maxPerBucket,
  }));
  return { policyVersion: PLAN_POLICY_VERSION, slots };
}
