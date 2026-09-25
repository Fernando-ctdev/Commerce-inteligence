// Gate 3 item 6 (rev. 6) — teste de renderização da view (react-dom/server, sem jsdom):
// GenerationActions (bloco de ações da aba Conteúdos, sem card "Próxima ação"): PENDING
// sem job oferece "Analisar produto" (com bloqueio preventivo), FAILED/CANCELLED oferece
// "Tentar novamente", SUCCEEDED_PARTIAL oferece "Revisar conteúdos" + "Gerar faltantes",
// sucesso pleno não renderiza ação e o terminal degradado GEN-PROJECTION (RI-003-20)
// comunica a anomalia (role alert) sem "Revisar conteúdos" nem "Tentar novamente",
// mantendo "Gerar faltantes" apenas no parcial.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GenerationRecord } from "./generation-api";
import type { ProductHistoryResponse } from "./history-api";

// generation-views importa .module.css, que o node puro não carrega — stub mínimo
// antes de qualquer import da view (o tsx resolve o .tsx via require/CJS).
const nodeRequire = createRequire(import.meta.url);
(nodeRequire.extensions as unknown as Record<string, (module: unknown) => unknown>)[".css"] = () => ({});

const envelopeDegradado = (status: "SUCCEEDED" | "SUCCEEDED_PARTIAL") => ({
  id: "job-degraded",
  productId: "product-1",
  status,
  stage: "FINALIZING",
  targetContentCount: 2,
  error: "Não foi possível carregar o resultado desta análise.",
  code: "GEN-PROJECTION",
  readiness: "FAILED",
  strategy: {},
  plan: {},
  contents: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:01.000Z",
  finishedAt: "2026-01-01T00:00:02.000Z",
  attempt: 1,
  ...(status === "SUCCEEDED_PARTIAL" ? { expectedCount: 2, deliveredCount: 1, failedCount: 1, missing: [{ position: 2, reasonCode: "HARD_GATE" }] } : {}),
});

const conteudoValido = (position: number) => ({ id: `c${position}`, position, status: "DRAFT", angle: "a", hook: "h", development: ["ponto completo", "ponto completo de apoio"], script: "s", cta: "c" });

const stateOf = (job: GenerationRecord | null) => ({
  job,
  busy: false,
  error: null,
  active: false,
  failed: false,
  blockedByOther: false,
  start: async () => {},
  cancel: async () => true,
  retry: async () => {},
});

const renderContents = async (envelope: unknown) => {
  const [{ ContentsView }, { normalizeGeneration }] = await Promise.all([import("./generation-views"), import("./generation-api")]);
  return renderToStaticMarkup(
    React.createElement(ContentsView, { job: normalizeGeneration(envelope) as GenerationRecord, active: false }),
  );
};

const envelopeParcial = () => ({
  ...envelopeDegradado("SUCCEEDED_PARTIAL"),
  code: undefined,
  error: null,
  readiness: "READY",
  targetContentCount: 5,
  expectedCount: 5,
  deliveredCount: 4,
  failedCount: 1,
  missing: [{ position: 3, reasonCode: "HARD_GATE" }],
  contents: [conteudoValido(1), conteudoValido(2), conteudoValido(4), conteudoValido(5)],
});

test("escopo editorial: SUCCEEDED_PARTIAL publica os D itens sem exigir exato-N", async () => {
  const html = await renderContents(envelopeParcial());
  assert.match(html, /Conteúdos/);
  assert.doesNotMatch(html, /4 de 5 conteúdos/);
  assert.doesNotMatch(html, /ainda não estão prontos/);
});

const renderContentsJob = async (job: GenerationRecord) => {
  // Import dinâmico é pré-condição do stub do .module.css registrado acima.
  const { ContentsView } = await import("./generation-views");
  return renderToStaticMarkup(React.createElement(ContentsView, { job, active: false }));
};

test("SUCCEEDED pleno continua exato-N: mismatch mantém o guard de publicação", async () => {
  const job = {
    id: "job-mismatch", productId: "product-1", status: "SUCCEEDED", stage: "FINALIZING",
    targetContentCount: 6, expectedCount: 6, deliveredCount: 4, failedCount: 2,
    error: null, code: undefined, readiness: "READY", strategy: {}, plan: {},
    contents: [conteudoValido(1), conteudoValido(2), conteudoValido(4), conteudoValido(5)],
    createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:01.000Z", finishedAt: "2026-01-01T00:00:02.000Z", attempt: 1,
  } as unknown as GenerationRecord;
  const html = await renderContentsJob(job);
  assert.match(html, /ainda não estão prontos/);
});

const renderContentsActive = async (envelope: unknown) => {
  const [{ ContentsView }, { normalizeGeneration }] = await Promise.all([import("./generation-views"), import("./generation-api")]);
  return renderToStaticMarkup(
    React.createElement(ContentsView, { job: normalizeGeneration(envelope) as GenerationRecord, active: true }),
  );
};

const envelopeRodando = () => ({
  id: "job-running",
  productId: "product-1",
  status: "RUNNING",
  stage: "GENERATING_BRIEFS",
  targetContentCount: 4,
  error: null,
  readiness: "ANALYZING",
  strategy: {},
  plan: {},
  contents: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:01.000Z",
  finishedAt: null,
  attempt: 1,
});

test("RUNNING: estado vivo anuncia etapa real, sem percentual/ETA nem conteúdo parcial", async () => {
  const html = await renderContentsActive(envelopeRodando());
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Seus Briefings estão sendo preparados/);
  assert.match(html, /Analisando/);
  assert.match(html, /Preparando os Briefings/);
  assert.match(html, /nenhum conteúdo parcial é exibido/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /%/);
});

test("QUEUED sem stage: estado vivo mostra apenas o status da fila", async () => {
  const html = await renderContentsActive({ ...envelopeRodando(), status: "QUEUED", stage: null });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Na fila/);
  assert.doesNotMatch(html, /Preparando os Briefings/);
});

const renderActions = async (
  envelope: unknown | null,
  opts: { readiness?: GenerationRecord["readiness"]; failed?: boolean; generationAction?: { state: "BLOCKED"; reason: "GEN-ACTIVE"; nextAction: "VIEW_ACTIVE_ANALYSIS" } } = {},
) => {
  const [{ GenerationActions }, { normalizeGeneration }] = await Promise.all([import("./generation-views"), import("./generation-api")]);
  return renderToStaticMarkup(
    React.createElement(GenerationActions, {
      generationAction: opts.generationAction,
      onGenerateMissing: () => {},
      readiness: opts.readiness ?? "FAILED",
      state: envelope
        ? { ...stateOf(normalizeGeneration(envelope)), failed: opts.failed ?? false }
        : stateOf(null),
    }),
  );
};

const envelopeFalha = () => ({
  ...envelopeDegradado("SUCCEEDED"),
  status: "FAILED",
  code: undefined,
  error: "O provedor de análise não respondeu.",
  readiness: "FAILED",
});

test("PENDING sem job: Analisar produto habilitado e única ação", async () => {
  const html = await renderActions(null, { readiness: "PENDING" });
  assert.match(html, /Analisar produto/);
  assert.doesNotMatch(html, /disabled=""/);
  assert.doesNotMatch(html, /Tentar novamente|Gerar faltantes|Revisar conteúdos/);
});

test("PENDING com bloqueio preventivo: botão desabilitado com nota", async () => {
  const html = await renderActions(null, { readiness: "PENDING", generationAction: { state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: "VIEW_ACTIVE_ANALYSIS" } });
  assert.match(html, /disabled=""/);
  assert.match(html, /Uma análise já está em andamento/);
});

test("FAILED: Tentar novamente em role alert, sem Analisar produto", async () => {
  const html = await renderActions(envelopeFalha(), { readiness: "FAILED", failed: true });
  assert.match(html, /role="alert"/);
  assert.match(html, /Tentar novamente/);
  assert.doesNotMatch(html, /Analisar produto/);
});

test("SUCCEEDED_PARTIAL: somente Gerar faltantes na aba Conteúdos", async () => {
  const html = await renderActions(envelopeParcial(), { readiness: "READY" });
  assert.match(html, /4 de 5 conteúdos prontos/);
  assert.match(html, /Gerar faltantes/);
  assert.doesNotMatch(html, /Revisar conteúdos/);
  assert.doesNotMatch(html, /Tentar novamente/);
});

test("SUCCEEDED degradado: anomalia em role alert, sem Revisar conteúdos e sem Tentar novamente", async () => {
  const html = await renderActions(envelopeDegradado("SUCCEEDED"));
  assert.match(html, /role="alert"/);
  assert.match(html, /Não foi possível carregar o resultado desta análise/);
  assert.doesNotMatch(html, /Revisar conteúdos/);
  assert.doesNotMatch(html, /Tentar novamente/);
  assert.doesNotMatch(html, /Gerar faltantes/);
});

test("SUCCEEDED_PARTIAL degradado: anomalia com Gerar faltantes, sem Revisar e sem Tentar novamente", async () => {
  const html = await renderActions(envelopeDegradado("SUCCEEDED_PARTIAL"));
  assert.match(html, /role="alert"/);
  assert.match(html, /Gerar faltantes/);
  assert.doesNotMatch(html, /Revisar conteúdos/);
  assert.doesNotMatch(html, /Tentar novamente/);
});

test("SUCCEEDED pleno: bloco não renderiza nenhuma ação", async () => {
  const html = await renderActions({
    ...envelopeDegradado("SUCCEEDED"),
    code: undefined,
    error: null,
    readiness: "READY",
    strategy: { primaryPositioning: "p" },
    plan: { targetContentCount: 2 },
    contents: [conteudoValido(1), conteudoValido(2)],
  });
  assert.equal(html, "");
});

test("Histórico mostra apenas custo agregado e revela custos de Conteúdo sob demanda", async () => {
  const { HistoryView } = await import("./generation-views");
  const history: ProductHistoryResponse = {
    jobs: [{
      status: "SUCCEEDED",
      createdAt: "2026-09-18T12:30:00.000Z",
      finishedAt: "2026-09-18T12:31:00.000Z",
      requestedContents: 2,
      cost: { currency: "BRL", amountMinor: "1234", completeness: "COMPLETE" },
      contents: [{ position: 1, cost: { currency: "BRL", amountMinor: "234", completeness: "PARTIAL" } }],
    }],
  };
  const html = renderToStaticMarkup(React.createElement(HistoryView, { history, loading: false, error: null }));
  assert.match(html, /R\$ 12,34/);
  assert.match(html, /Completo/);
  assert.match(html, /Ver custos por Conteúdo/);
  assert.match(html, /Conteúdo 1/);
  assert.match(html, /Parcial/);
  for (const field of ["provider", "model", "tier", "prompt", "latency"]) {
    assert.doesNotMatch(html, new RegExp(field, "i"));
  }
});

test("Histórico expõe jobId, conclusão e uso com indisponíveis explícitos quando o DTO não os traz", async () => {
  // Static import não funciona aqui: o stub de .module.css precisa existir antes do primeiro import da view (ver cabeçalho do arquivo).
  const { HistoryView } = await import("./generation-views");
  const base = {
    status: "SUCCEEDED" as const,
    createdAt: "2026-09-18T12:30:00.000Z",
    finishedAt: null,
    requestedContents: 1,
    cost: { currency: null, amountMinor: null, completeness: "UNAVAILABLE" as const },
    contents: [],
  };
  const withoutMeta = renderToStaticMarkup(React.createElement(HistoryView, { history: { jobs: [base] }, loading: false, error: null }));
  assert.match(withoutMeta, /Job indisponível/);
  assert.match(withoutMeta, /Concluída em/);
  assert.match(withoutMeta, /Uso indisponível/);

  const withMeta = renderToStaticMarkup(React.createElement(HistoryView, {
    history: { jobs: [{ ...base, jobId: "job-42", usage: { inputTokens: 1200, outputTokens: 340 } }] },
    loading: false,
    error: null,
  }));
  assert.match(withMeta, /job-42/);
  assert.match(withMeta, /1\.200 entrada · 340 saída \(tokens\)/);
});

test("Resumo operacional expõe Dados da execução com jobId e indisponíveis explícitos, sem dados técnicos", async () => {
  // Static import não funciona aqui: o stub de .module.css precisa existir antes do primeiro import da view (ver cabeçalho do arquivo).
  const { OperationalSummaryCard } = await import("./generation-views");
  const job = {
    id: "job-obs",
    productId: "product-1",
    status: "SUCCEEDED",
    stage: null,
    targetContentCount: 1,
    error: null,
    code: null,
    strategy: {},
    plan: {},
    contents: [],
    readiness: "READY",
    createdAt: "2026-09-18T12:30:00.000Z",
    startedAt: "2026-09-18T12:30:01.000Z",
    finishedAt: "2026-09-18T12:31:00.000Z",
    expectedCount: 1,
    deliveredCount: 1,
    failedCount: 0,
    missing: [],
  } as GenerationRecord;
  const html = renderToStaticMarkup(React.createElement(OperationalSummaryCard, { job, readiness: "READY" }));
  assert.match(html, /Dados da execução/);
  assert.match(html, /job-obs/);
  assert.match(html, /Solicitada em/);
  assert.match(html, /Iniciada em/);
  assert.match(html, /Concluída em/);
  assert.match(html, /Uso indisponível/);
  assert.match(html, /Custo indisponível/);
  for (const field of ["provider", "model", "tier", "prompt", "latency", "logs"]) {
    assert.doesNotMatch(html, new RegExp(field, "i"));
  }
});

// Slice 013 Task 5 — separação de deep-links das abas do Product: o conteúdo
// gerado interno continua sob Roteiros (#generated-contents) e a leitura
// externa de conteúdos publicados tem alvo próprio (#published-contents).
test("deep-link: #generated-contents abre Roteiros (conteúdo interno), nunca Conteúdos", async () => {
  const { hashToTab } = await import("../detail/product-detail");
  assert.equal(hashToTab("#generated-contents"), "strategy");
});

test("deep-link: #published-contents abre Conteúdos (leitura externa)", async () => {
  const { hashToTab } = await import("../detail/product-detail");
  assert.equal(hashToTab("#published-contents"), "contents");
  assert.equal(hashToTab(""), null);
  assert.equal(hashToTab("#outra-ancora"), null);
});

test("troca de aba escreve o hash correspondente", async () => {
  const { tabToHash } = await import("../detail/product-detail");
  assert.equal(tabToHash("contents"), "#published-contents");
  assert.equal(tabToHash("strategy"), "#generated-contents");
  assert.equal(tabToHash("history"), "");
});
