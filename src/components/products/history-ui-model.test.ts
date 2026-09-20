import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductHistory } from "./history-api";
import type { ProductHistoryResponse } from "./history-api";
import { historyViewModel } from "./history-ui-model";

const cost = (amountMinor: string | null, completeness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE", currency = "BRL") => ({
  currency,
  amountMinor,
  completeness,
});
const history = (overrides: Partial<ProductHistoryResponse["jobs"][number]> = {}): ProductHistoryResponse => ({
  jobs: [{
    status: "SUCCEEDED",
    createdAt: "2026-09-18T12:30:00.000Z",
    finishedAt: "2026-09-18T12:31:00.000Z",
    requestedContents: 3,
    cost: cost("1234", "COMPLETE"),
    contents: [{ position: 1, cost: cost("234", "COMPLETE") }],
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
  const model = historyViewModel(history({ cost: cost("100", "PARTIAL"), contents: [{ position: 2, cost: cost(null, "UNAVAILABLE") }] }));
  assert.equal(model.jobs[0]?.cost.label, "R$ 1,00");
  assert.equal(model.jobs[0]?.cost.completenessLabel, "Parcial");
  assert.equal(model.jobs[0]?.contents[0]?.cost.label, "Custo indisponível");
  assert.equal(model.jobs[0]?.contents[0]?.cost.completenessLabel, "Indisponível");
});

test("mantém múltiplos jobs, histórico vazio e datas inválidas sem quebrar", () => {
  const model = historyViewModel({ jobs: [
    ...history().jobs,
    { ...history().jobs[0]!, status: "FAILED", createdAt: "invalid", contents: [] },
  ] });
  assert.equal(model.jobs.length, 2);
  assert.equal(model.jobs[1]?.dateLabel, "Data indisponível");
  assert.deepEqual(historyViewModel({ jobs: [] }), { jobs: [] });
});

test("normaliza o DTO público sem identificadores técnicos", () => {
  const normalized = normalizeProductHistory({
    jobs: [{
      status: "SUCCEEDED",
      createdAt: "2026-09-18T12:30:00.000Z",
      finishedAt: null,
      requestedContents: 1,
      cost: cost("1234", "COMPLETE"),
      contents: [{ position: 1, cost: cost("234", "COMPLETE") }],
    }],
  });
  assert.equal("jobId" in normalized.jobs[0]!, false);
  assert.equal("contentId" in normalized.jobs[0]!.contents[0]!, false);
});

test("modelo creator-facing não contém campos técnicos", () => {
  const serialized = JSON.stringify(historyViewModel(history()));
  for (const field of ["provider", "model", "tier", "tokens", "prompt", "latency", "logs"]) {
    assert.equal(serialized.includes(field), false, field);
  }
});
