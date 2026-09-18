import assert from "node:assert/strict";
import test from "node:test";
import { historyViewModel, type ProductHistoryResponse } from "./history-ui-model";

const cost = (amountMinor: string | null, completeness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE", currency = "BRL") => ({
  currency,
  amountMinor,
  completeness,
});

const history = (overrides: Partial<ProductHistoryResponse["jobs"][number]> = {}): ProductHistoryResponse => ({
  jobs: [{
    jobId: "job-1",
    status: "SUCCEEDED",
    createdAt: "2026-09-18T12:30:00.000Z",
    finishedAt: "2026-09-18T12:31:00.000Z",
    requestedContents: 3,
    cost: cost("1234", "COMPLETE"),
    contents: [{ contentId: "content-1", position: 1, cost: cost("234", "COMPLETE") }],
    ...overrides,
  }],
});

test("formata custo completo com moeda e preserva valor agregado", () => {
  const model = historyViewModel(history());
  assert.equal(model.jobs[0]?.cost.label, "R$ 12,34");
  assert.equal(model.jobs[0]?.cost.completenessLabel, "Completo");
  assert.equal(model.jobs[0]?.requestedContentsLabel, "3 conteúdos solicitados");
});

test("expõe rótulos explícitos para parcial e indisponível", () => {
  const model = historyViewModel(history({ cost: cost("100", "PARTIAL"), contents: [{ contentId: "c", position: 2, cost: cost(null, "UNAVAILABLE") }] }));
  assert.equal(model.jobs[0]?.cost.label, "R$ 1,00");
  assert.equal(model.jobs[0]?.cost.completenessLabel, "Parcial");
  assert.equal(model.jobs[0]?.contents[0]?.cost.label, "Custo indisponível");
  assert.equal(model.jobs[0]?.contents[0]?.cost.completenessLabel, "Indisponível");
});

test("mantém múltiplos jobs, histórico vazio e datas inválidas sem quebrar", () => {
  const model = historyViewModel({ jobs: [
    ...history().jobs,
    { ...history().jobs[0]!, jobId: "job-2", status: "FAILED", createdAt: "invalid", contents: [] },
  ] });
  assert.equal(model.jobs.length, 2);
  assert.equal(model.jobs[1]?.dateLabel, "Data indisponível");
  assert.deepEqual(historyViewModel({ jobs: [] }), { jobs: [] });
});

test("modelo creator-facing não contém campos técnicos", () => {
  const serialized = JSON.stringify(historyViewModel(history()));
  for (const field of ["provider", "model", "tier", "tokens", "prompt", "latency", "jobId", "contentId", "logs"]) {
    assert.equal(serialized.includes(field), false, field);
  }
});
