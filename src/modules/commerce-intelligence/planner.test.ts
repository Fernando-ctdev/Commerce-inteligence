import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanSkeleton, PLAN_POLICY_VERSION } from "./planner";
import { ContractError } from "./contract";

const BASE = {
  jobId: "job-1",
  productId: "prod-1",
  targetContentCount: 5,
  deliverableHookMechanisms: ["problem", "demonstration", "objection", "discovery", "price-value", "other"],
  memory: {},
};

test("PLAN_POLICY_VERSION é 1", () => {
  assert.equal(PLAN_POLICY_VERSION, 1);
});

test("output estável: mesma entrada produz skeleton idêntico", () => {
  const a = buildPlanSkeleton(BASE);
  const b = buildPlanSkeleton(BASE);
  assert.deepEqual(a, b);
  assert.equal(a.policyVersion, 1);
  assert.equal(a.slots.length, 5);
});

test("posições 1..n e IDs estáveis derivados do jobId", () => {
  const { slots } = buildPlanSkeleton(BASE);
  assert.deepEqual(slots.map((slot) => slot.position), [1, 2, 3, 4, 5]);
  assert.deepEqual(slots.map((slot) => slot.contentId), [
    "job-1-content-1",
    "job-1-content-2",
    "job-1-content-3",
    "job-1-content-4",
    "job-1-content-5",
  ]);
  assert.deepEqual(slots.map((slot) => slot.opportunityId), [
    "job-1-opportunity-1",
    "job-1-opportunity-2",
    "job-1-opportunity-3",
    "job-1-opportunity-4",
    "job-1-opportunity-5",
  ]);
});

test("maxPerBucket = ceil(target/buckets) e allowlist em ordem estável de catálogo", () => {
  const { slots } = buildPlanSkeleton({ ...BASE, targetContentCount: 5 });
  assert.deepEqual(slots.map((slot) => slot.maxPerBucket), [1, 1, 1, 1, 1]);
  const three = buildPlanSkeleton({ ...BASE, targetContentCount: 5, deliverableHookMechanisms: ["demonstration", "problem"] });
  assert.deepEqual(three.slots.map((slot) => slot.maxPerBucket), [3, 3, 3, 3, 3]);
  assert.deepEqual(three.slots[0]!.eligibleHookMechanisms, ["demonstration", "problem"], "ordem do catálogo preservada, deduplicada");
});

test("filtros do allowlist: duplicatas e mecanismos fora da lista não são inventados", () => {
  const { slots } = buildPlanSkeleton({ ...BASE, deliverableHookMechanisms: ["problem", "problem", "demonstration"] });
  assert.deepEqual(slots[0]!.eligibleHookMechanisms, ["problem", "demonstration"]);
});

test("memory constraints: mecanismos já entregues são excluídos", () => {
  const { slots } = buildPlanSkeleton({
    ...BASE,
    deliverableHookMechanisms: ["problem", "demonstration", "objection"],
    memory: { deliveredHookMechanisms: ["problem", "Demonstration"] },
  });
  assert.deepEqual(slots[0]!.eligibleHookMechanisms, ["objection"], "entregues (fold) saem do allowlist");
  assert.deepEqual(slots.map((slot) => slot.maxPerBucket), [5, 5, 5, 5, 5]);
});

test("nenhum mecanismo elegível após memória falha GEN-PATTERN (fail-closed)", () => {
  assert.throws(
    () => buildPlanSkeleton({ ...BASE, memory: { deliveredHookMechanisms: BASE.deliverableHookMechanisms } }),
    (error: unknown) => error instanceof ContractError && error.code === "GEN-PATTERN",
  );
  assert.throws(
    () => buildPlanSkeleton({ ...BASE, deliverableHookMechanisms: [] }),
    (error: unknown) => error instanceof ContractError && error.code === "GEN-PATTERN",
  );
});
