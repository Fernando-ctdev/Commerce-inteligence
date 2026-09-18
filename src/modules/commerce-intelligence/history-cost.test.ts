import test from "node:test";
import assert from "node:assert/strict";
import { projectProductHistory } from "./history-cost";

// Fixtures mínimas: os campos extras das rows do Prisma são irrelevantes à projeção.
type Row = { id: string; jobId: string; status: "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED" | "CANCELLED"; createdAt: Date; finishedAt: Date | null; targetContentCount: number };

const job = (overrides: Partial<Row>): Row => ({
  id: "job-1",
  jobId: "job-1",
  status: "SUCCEEDED",
  createdAt: new Date("2026-09-18T10:00:00Z"),
  finishedAt: new Date("2026-09-18T10:05:00Z"),
  targetContentCount: 2,
  ...overrides,
});

const record = (overrides: Record<string, unknown>) => ({
  task: "CONTENT_BRIEF_GENERATION",
  attempt: 1,
  retry: 0,
  pricing: { versionId: "p1", currency: "BRL" },
  cost: { amountMinor: "100", completeness: "COMPLETE" },
  ...overrides,
});

test("projeta job COMPLETE somando capabilities; datas ISO e contagem pedida", () => {
  const result = projectProductHistory(
    [job({})],
    [{ id: "c1", jobId: "job-1", position: 1 }, { id: "c2", jobId: "job-1", position: 2 }],
    [{ jobId: "job-1", metadata: { capabilities: [
      record({}),
      record({ contentId: "c1" }),
      record({ contentId: "c2", cost: { amountMinor: "250", completeness: "COMPLETE" } }),
    ] } }],
  );
  assert.equal(result.jobs.length, 1);
  const projected = result.jobs[0]!;
  assert.equal(projected.status, "SUCCEEDED");
  assert.equal(projected.createdAt, "2026-09-18T10:00:00.000Z");
  assert.equal(projected.finishedAt, "2026-09-18T10:05:00.000Z");
  assert.equal(projected.requestedContents, 2);
  assert.deepEqual(projected.cost, { currency: "BRL", amountMinor: "450", completeness: "COMPLETE" });
  assert.deepEqual(projected.contents, [
    { position: 1, cost: { currency: "BRL", amountMinor: "100", completeness: "COMPLETE" } },
    { position: 2, cost: { currency: "BRL", amountMinor: "250", completeness: "COMPLETE" } },
  ]);
});

test("PARTIAL sozinho mantém PARTIAL com valor; conteúdo sem registro é UNAVAILABLE", () => {
  const result = projectProductHistory(
    [job({ status: "SUCCEEDED_PARTIAL" })],
    [{ id: "c1", jobId: "job-1", position: 1 }, { id: "c2", jobId: "job-1", position: 2 }],
    [{ jobId: "job-1", metadata: { capabilities: [record({ contentId: "c1", cost: { amountMinor: "50", completeness: "PARTIAL" } })] } }],
  );
  const projected = result.jobs[0]!;
  assert.deepEqual(projected.cost, { currency: "BRL", amountMinor: "50", completeness: "PARTIAL" });
  assert.deepEqual(projected.contents[1], { position: 2, cost: { currency: null, amountMinor: null, completeness: "UNAVAILABLE" } });
});

test("job FAILED sem run e run sem metadata projetam UNAVAILABLE (compatibilidade legado)", () => {
  const failed = projectProductHistory([job({ status: "FAILED", finishedAt: null })], [], []);
  assert.deepEqual(failed.jobs[0]?.cost, { currency: null, amountMinor: null, completeness: "UNAVAILABLE" });
  assert.equal(failed.jobs[0]?.finishedAt, null);
  assert.deepEqual(failed.jobs[0]?.contents, []);
  const legacy = projectProductHistory([job({})], [{ id: "c1", jobId: "job-1", position: 1 }], [{ jobId: "job-1", metadata: { capabilities: [{ task: "PRODUCT_UNDERSTANDING", durationMs: 10 }] } }]);
  assert.equal(legacy.jobs[0]?.cost.completeness, "UNAVAILABLE");
  assert.equal(legacy.jobs[0]?.contents[0]?.cost.completeness, "UNAVAILABLE");
});

test("múltiplos jobs preservam a ordem recebida (createdAt desc da query) e agregados por job", () => {
  const result = projectProductHistory(
    [job({ id: "job-new", jobId: "job-new", createdAt: new Date("2026-09-18T12:00:00Z") }), job({ id: "job-old", jobId: "job-old", createdAt: new Date("2026-09-17T12:00:00Z") })],
    [{ id: "c1", jobId: "job-old", position: 1 }],
    [{ jobId: "job-old", metadata: { capabilities: [record({})] } }],
  );
  assert.deepEqual(result.jobs.map((entry) => entry.createdAt), ["2026-09-18T12:00:00.000Z", "2026-09-17T12:00:00.000Z"]);
  assert.equal(result.jobs[0]?.contents.length, 0);
  assert.equal(result.jobs[1]?.cost.amountMinor, "100");
});

test("resposta não contém IDs técnicos nem campos internos", () => {
  const result = projectProductHistory(
    [job({})],
    [{ id: "c1", jobId: "job-1", position: 1 }],
    [{ jobId: "job-1", metadata: { capabilities: [record({ contentId: "c1", usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: null, cachedTokens: null } })] } }],
  );
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("job-1"), "jobId nunca cruza a fronteira");
  assert.ok(!serialized.includes('"c1"'), "contentId nunca cruza a fronteira");
  for (const forbidden of ["metadata", "provider", "model", "usage", "task", "attempt", "retry", "versionId", "pricing", "id", "jobId", "contentId"]) {
    assert.ok(!serialized.includes(`"${forbidden}"`), `campo técnico "${forbidden}" ausente`);
  }
  assert.ok(serialized.includes("amountMinor"));
});
