// ADR-021: contrato envelope http-status → normalize da UI (partialModel).
// Prova o alinhamento real: missing sanitizado (position/reasonCode) com rótulo
// pt-BR resolvido; nenhum payload/diagnóstico vaza no envelope público.
import test from "node:test";
import assert from "node:assert/strict";
import { envelope, RETRY_ALLOWED_STATUSES, COMPLETE_ALLOWED_STATUSES } from "./http-status";
import { partialModel } from "@/components/products/generation-ui-model";

const persistedBrief = { payload: { angle: "a", hook: "h", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Tecido respiravel", cta: "c" } };
const baseJob = {
  id: "j-partial", productId: "p", status: "SUCCEEDED_PARTIAL", stage: "FINALIZING",
  targetContentCount: 3, publicErrorMessage: null,
  metadata: {
    expectedCount: 3, deliveredCount: 2, failedCount: 1,
    failedItems: [
      { contentId: "j-partial-content-1", position: 1, reason: "HARD_GATE", checkCodes: ["unverified_claim", "grounding_below_min"], issues: ["claim sem evidência autorizada"], diagnostic: { minGroundingMatched: 0 } },
      { contentId: "j-partial-content-2", position: 2, reason: "JUDGE", checkCodes: [], issues: [], quality: [{ part: "hook", round: 2, criterion: "hook_clarity", reason: "unclear" }] },
    ],
  },
  createdAt: new Date("2026-09-14T00:00:00Z"), startedAt: new Date("2026-09-14T00:00:01Z"), finishedAt: new Date("2026-09-14T00:00:02Z"),

  attempt: 1, strategies: [], plan: null, contents: [{ id: "c2", briefs: [persistedBrief] }, { id: "c3", briefs: [persistedBrief] }],
} as unknown as Parameters<typeof envelope>[0];

test("envelope expõe missing sanitizado (position/reasonCode) e normalize da UI resolve rótulos", async () => {
  const view = await envelope(baseJob) as Record<string, unknown>;
  assert.equal(view.status, "SUCCEEDED_PARTIAL");
  assert.equal(view.readiness, "READY");
  assert.equal(view.deliveredCount, 2);
  assert.equal(view.expectedCount, 3);
  assert.deepEqual(view.missing, [
    { position: 1, reasonCode: "unverified_claim" },
    { position: 2, reasonCode: "JUDGE" },
  ]);
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes("valoriza"), "sem payload bruto");
  assert.ok(!serialized.includes("minGroundingMatched"), "sem diagnóstico interno");
  assert.ok(!serialized.includes("issues"), "sem issues livres");
  const model = partialModel(view as never);
  assert.deepEqual(model, {
    delivered: 2,
    expected: 3,
    missing: [
      { position: 1, reason: "continha informação não confirmada nos dados do produto" },
      { position: 2, reason: "não convergiu nos critérios de qualidade" },
    ],
  });
});

test("partições ADR-021: /retry nunca aceita parcial; /complete somente parcial", () => {
  assert.deepEqual(RETRY_ALLOWED_STATUSES, ["FAILED", "CANCELLED"]);
  assert.deepEqual(COMPLETE_ALLOWED_STATUSES, ["SUCCEEDED_PARTIAL"]);
});

test("fora de SUCCEEDED_PARTIAL o normalize devolve null e envelope não expõe missing", async () => {
  const view = await envelope({ ...baseJob, status: "SUCCEEDED" }) as Record<string, unknown>;
  assert.equal("missing" in view, false);
  assert.equal(partialModel({ ...baseJob, status: "SUCCEEDED", deliveredCount: 3, contents: [], missing: [] }), null);
});
