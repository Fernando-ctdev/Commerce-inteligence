// Gate 3 item 6 (rev. 5) — teste de renderização da view (react-dom/server, sem jsdom):
// GenerationStatusCard para terminal degradado GEN-PROJECTION (RI-003-20) comunica a
// anomalia (role alert), NÃO oferece "Revisar conteúdos" nem "Tentar novamente" e
// mantém "Gerar faltantes" apenas no parcial. Positivo sem code segue como sucesso.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GenerationRecord } from "./generation-api";

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

const conteudoValido = (position: number) => ({ id: `c${position}`, position, status: "DRAFT", angle: "a", hook: "h", development: ["ponto completo"], script: "s", cta: "c" });

const stateOf = (job: GenerationRecord) => ({
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

const renderCard = async (envelope: unknown) => {
  const [{ GenerationStatusCard }, { normalizeGeneration }] = await Promise.all([import("./generation-views"), import("./generation-api")]);
  return renderToStaticMarkup(
    React.createElement(GenerationStatusCard, {
      productName: "Produto",
      targetContentCount: 2,
      readiness: "FAILED",
      state: stateOf(normalizeGeneration(envelope)),
      onOpenContents: () => {},
      onGenerateMissing: () => {},
    }),
  );
};

test("SUCCEEDED degradado: anomalia em role alert, sem Revisar conteúdos e sem Tentar novamente", async () => {
  const html = await renderCard(envelopeDegradado("SUCCEEDED"));
  assert.match(html, /role="alert"/);
  assert.match(html, /Resultado da análise indisponível/);
  assert.match(html, /Não foi possível carregar o resultado desta análise/);
  assert.doesNotMatch(html, /Revisar conteúdos/);
  assert.doesNotMatch(html, /Tentar novamente/);
  assert.doesNotMatch(html, /Gerar faltantes/);
});

test("SUCCEEDED_PARTIAL degradado: anomalia com Gerar faltantes, sem Revisar e sem Tentar novamente", async () => {
  const html = await renderCard(envelopeDegradado("SUCCEEDED_PARTIAL"));
  assert.match(html, /role="alert"/);
  assert.match(html, /Resultado da análise indisponível/);
  assert.match(html, /Gerar faltantes/);
  assert.doesNotMatch(html, /Revisar conteúdos/);
  assert.doesNotMatch(html, /Tentar novamente/);
});

test("SUCCEEDED sem code segue como sucesso: Revisar conteúdos presente, sem alert de anomalia", async () => {
  const html = await renderCard({
    ...envelopeDegradado("SUCCEEDED"),
    code: undefined,
    error: null,
    readiness: "READY",
    strategy: { primaryPositioning: "p" },
    plan: { targetContentCount: 2 },
    contents: [conteudoValido(1), conteudoValido(2)],
  });
  assert.match(html, /Revisar conteúdos/);
  assert.doesNotMatch(html, /Resultado da análise indisponível/);
});
