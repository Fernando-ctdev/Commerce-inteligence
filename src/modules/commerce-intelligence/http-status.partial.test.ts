// ADR-021: contrato envelope http-status → normalize da UI (partialModel).
// Prova o alinhamento real: missing sanitizado (position/reasonCode) com rótulo
// pt-BR resolvido; nenhum payload/diagnóstico vaza no envelope público.
import test from "node:test";
import assert from "node:assert/strict";
import { envelope, projectJobEnvelope, partialMissing, RETRY_ALLOWED_STATUSES, COMPLETE_ALLOWED_STATUSES } from "./http-status";
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

// Gate 6 item 7: F que o /complete usa como targetContentCount (reserva dos
// faltantes). metadata do job parcial é a fonte; fallbacks preservam N−0.
test("partialMissing deriva F do metadata do parcial; fora do parcial é indefinido", () => {
  // D=2 de N=3 → /complete cria job com targetContentCount=1.
  assert.equal(partialMissing({ status: "SUCCEEDED_PARTIAL", targetContentCount: 3, metadata: baseJob.metadata }), 1);
  // Sem metadata (legado): fallback expected=N, delivered=0 → N.
  assert.equal(partialMissing({ status: "SUCCEEDED_PARTIAL", targetContentCount: 3, metadata: null }), 3);
  // Nada faltante ou fora do parcial: /complete responde GEN-NOTHING-TO-COMPLETE (missing < 1) e undefined.
  assert.equal(partialMissing({ status: "SUCCEEDED_PARTIAL", targetContentCount: 2, metadata: { expectedCount: 2, deliveredCount: 2 } }), 0);
  assert.equal(partialMissing({ status: "SUCCEEDED", targetContentCount: 2, metadata: {} }), undefined);
  assert.equal(partialMissing({ status: "FAILED", targetContentCount: 2, metadata: {} }), undefined);
});

test("fora de SUCCEEDED_PARTIAL o normalize devolve null e envelope não expõe missing", async () => {
  const view = await envelope({ ...baseJob, status: "SUCCEEDED" }) as Record<string, unknown>;
  assert.equal("missing" in view, false);
  assert.equal(partialModel({ ...baseJob, status: "SUCCEEDED", deliveredCount: 3, contents: [], missing: [] }), null);
});

test("GET de job com payload persistido inválido retorna envelope degradado terminal, não 500", async () => {
  const corrompido = { ...baseJob, status: "SUCCEEDED", contents: [{ id: "c1", briefs: [{ payload: { angle: "a", hook: "h", development: [], script: "s", cta: "c" } }] }] } as unknown as Parameters<typeof projectJobEnvelope>[0];
  const view = (await projectJobEnvelope(corrompido)) as Record<string, unknown>;
  assert.equal(view.status, "SUCCEEDED");
  assert.equal(view.readiness, "FAILED");
  assert.equal(view.code, "GEN-PROJECTION");
  assert.equal(view.error, "Não foi possível carregar o resultado desta análise.");
  assert.deepEqual(view.contents, []);
  assert.deepEqual(view.strategy, {});
});

test("GET de job válido usa o envelope cheio (sem degradação)", async () => {
  const view = (await projectJobEnvelope(baseJob)) as Record<string, unknown>;
  assert.equal(view.status, "SUCCEEDED_PARTIAL");
  assert.equal(view.readiness, "READY");
  assert.equal("code" in view, false);
});

// Gate 3 item 4 — terminal positivo sem conteúdos persistidos (exact-N / D>0,
// ADR-021) degrada fail-closed GEN-PROJECTION sem mascarar o status persistido.
test("SUCCEEDED e SUCCEEDED_PARTIAL sem conteúdos degradam GEN-PROJECTION, não READY vazio", async () => {
  for (const status of ["SUCCEEDED", "SUCCEEDED_PARTIAL"] as const) {
    const vazio = { ...baseJob, status, contents: [] } as unknown as Parameters<typeof projectJobEnvelope>[0];
    const view = (await projectJobEnvelope(vazio)) as Record<string, unknown>;
    assert.equal(view.status, status, "status persistido preservado");
    assert.equal(view.readiness, "FAILED");
    assert.equal(view.code, "GEN-PROJECTION");
    assert.equal(view.error, "Não foi possível carregar o resultado desta análise.");
    assert.deepEqual(view.contents, []);
    assert.deepEqual(view.strategy, {});
    assert.deepEqual(view.plan, {});
  }
});

// Gate 3 item 5 — scene set corrente presente e inválido (mesmo critério do
// engine: != AVAILABLE ou < 2 cenas) degrada GEN-PROJECTION; ausência de scene
// set é legado ADR-019 e projeta scenes null sem degradação.
test("cenas inválidas degradam GEN-PROJECTION; legado sem scene set projeta null", async () => {
  const comCenas = (status: string, scenes: unknown[]) =>
    ({ ...baseJob, status: "SUCCEEDED", contents: [{ id: "c1", briefs: [persistedBrief], currentBriefVersionId: "bv1", sceneSets: [{ briefVersionId: "bv1", status, payload: { scenes } }] }] }) as unknown as Parameters<typeof projectJobEnvelope>[0];
  for (const [label, job] of [
    ["status não AVAILABLE", comCenas("FAILED", [{ description: "a" }, { description: "b" }])],
    ["uma única cena", comCenas("AVAILABLE", [{ description: "a" }])],
    ["duas descrições vazias/só espaços", comCenas("AVAILABLE", [{ description: "   " }, { description: "" }])],
  ] as const) {
    const view = (await projectJobEnvelope(job)) as Record<string, unknown>;
    assert.equal(view.code, "GEN-PROJECTION", label);
    assert.equal(view.readiness, "FAILED", label);
    assert.equal(view.status, "SUCCEEDED", label);
  }
  const legado = { ...baseJob, status: "SUCCEEDED", contents: [{ id: "c1", briefs: [persistedBrief], currentBriefVersionId: null, sceneSets: [] }] } as unknown as Parameters<typeof projectJobEnvelope>[0];
  const viewLegado = (await projectJobEnvelope(legado)) as Record<string, unknown>;
  assert.equal(viewLegado.readiness, "READY");
  assert.equal(viewLegado.code, undefined);
});

// Gate 3 item 6 — CANCELLED (resposta do /cancel via projectJobEnvelope) tem o
// MESMO shape do envelope: strategy/plan {} (nunca null), contents [], readiness
// FAILED, sem code e sem payload interno exposto.
test("CANCELLED projeta o shape canônico do envelope (strategy/plan {}, readiness FAILED)", async () => {
  const view = (await projectJobEnvelope({ ...baseJob, status: "CANCELLED" })) as Record<string, unknown>;
  assert.equal(view.readiness, "FAILED");
  assert.deepEqual(view.strategy, {});
  assert.deepEqual(view.plan, {});
  assert.deepEqual(view.contents, []);
  assert.equal(view.code, undefined);
  assert.equal(view.error ?? null, null);
});

// Gate 3 item 6 (rev. 2) — GEN-PROJECTION só ocorre em terminal POSITIVO
// (gatilhos avaliam com publish=true), e as partições de recuperação excluem
// esses status: /retry e /complete respondem 404. A projeção preserva o status
// persistido (nunca o transforma) e o cliente não oferece "Tentar novamente".
test("terminal degradado GEN-PROJECTION não tem recuperação /retry nem /complete", async () => {
  const view = (await projectJobEnvelope({ ...baseJob, status: "SUCCEEDED", contents: [] })) as Record<string, unknown>;
  assert.equal(view.code, "GEN-PROJECTION");
  assert.equal(view.status, "SUCCEEDED"); // status persistido preservado, nunca transformado
  assert.equal(view.readiness, "FAILED");
  const retryStatuses = RETRY_ALLOWED_STATUSES as readonly string[];
  const completeStatuses = COMPLETE_ALLOWED_STATUSES as readonly string[];
  // /retry: 404 para ambos os positivos — recuperação integral indisponível.
  for (const status of ["SUCCEEDED", "SUCCEEDED_PARTIAL"])
    assert.equal(retryStatuses.includes(status), false, `retry não aceita ${status}`);
  // /complete: indisponível para SUCCEEDED; para parcial degradado permanece
  // disponível (recuperação dos faltantes não depende da projeção de cenas).
  assert.equal(completeStatuses.includes("SUCCEEDED"), false, "complete não aceita SUCCEEDED");
  assert.equal(completeStatuses.includes("SUCCEEDED_PARTIAL"), true, "complete aceita SUCCEEDED_PARTIAL");
});
