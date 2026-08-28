import { test } from "node:test";
import assert from "node:assert/strict";

import type { ActiveAttempt, ImportView } from "./import-contracts";
import {
  MAX_POLL_ERRORS,
  initialImportFlowState,
  mapImportError,
  pollDelayMs,
  reduceImportFlow,
  type ImportFlowState,
} from "./product-import-view-model";

const QUANTITY = 10;

function state(overrides: Partial<ImportFlowState> = {}): ImportFlowState {
  return { ...initialImportFlowState(undefined, QUANTITY), ...overrides };
}

function view(overrides: Partial<ImportView> & { importId?: string }): ImportView {
  return {
    importId: "attempt-1",
    status: "EXTRACTING",
    ...overrides,
  };
}

function attempt(overrides: Partial<ActiveAttempt>): ActiveAttempt {
  return {
    importId: "attempt-1",
    status: "EXTRACTING",
    createdAt: "2026-08-28T10:00:00Z",
    submittedUrlHostPath: "loja.example.com/p/1",
    ...overrides,
  };
}

function candidateView(importId: string): ImportView {
  return view({
    importId,
    status: "CANDIDATE_READY",
    candidate: {
      name: "Escova de dentes",
      features: [],
      images: [],
      submittedUrl: "https://loja.example.com/p/1",
      sourceUrl: "https://loja.example.com/p/1",
      gaps: ["brand"],
    },
  });
}

test("estado inicial hidrata por ?import= ou entra na URL", () => {
  assert.equal(initialImportFlowState("attempt-9", QUANTITY).mode, "hydrating");
  assert.equal(initialImportFlowState(undefined, QUANTITY).mode, "entry");
});

test("submissão de URL valida vazio e comprimento antes do POST", () => {
  const empty = reduceImportFlow(state(), { type: "urlSubmitRequested" });
  assert.equal(empty.urlError, "Cole a URL do produto.");
  assert.equal(empty.mode, "entry");

  const tooLong = reduceImportFlow(state({ url: "h".repeat(2049) }), { type: "urlSubmitRequested" });
  assert.equal(tooLong.urlError, "A URL deve ter no máximo 2.048 caracteres.");

  const valid = reduceImportFlow(state({ url: "  https://loja.example.com/p/1  " }), { type: "urlSubmitRequested" });
  assert.equal(valid.mode, "starting");
  assert.equal(valid.url, "https://loja.example.com/p/1");
  assert.equal(valid.urlError, undefined);
});

test("URL alterada limpa erro e aviso", () => {
  const withError = reduceImportFlow(state({ urlError: "Cole a URL do produto." }), { type: "urlChanged", url: "h" });
  assert.equal(withError.urlError, undefined);
  assert.equal(withError.notice, undefined);
});

test("falha do POST mapeia 400 junto ao campo, 429 como aviso na entrada e demais como falha", () => {
  const invalid = reduceImportFlow(state({ mode: "starting" }), {
    type: "importStartFailed",
    status: 400,
    code: "INVALID_URL",
    message: "URL inválida.",
  });
  assert.equal(invalid.mode, "entry");
  assert.equal(invalid.urlError, "URL inválida.");

  const busy = reduceImportFlow(state({ mode: "starting" }), { type: "importStartFailed", status: 429, code: "IMPORT_BUSY" });
  assert.equal(busy.mode, "entry");
  assert.equal(busy.notice?.actionKind, "retry");
  assert.match(busy.notice?.message ?? "", /análises em andamento/);

  const broken = reduceImportFlow(state({ mode: "starting" }), { type: "importStartFailed", status: 0 });
  assert.equal(broken.mode, "failed");
  assert.equal(broken.failed.actionKind, "retry");
});

test("polling segue em QUEUED/EXTRACTING com backoff e vai à revisão em CANDIDATE_READY", () => {
  let current = reduceImportFlow(state({ mode: "starting" }), { type: "importStarted", importId: "attempt-1", status: "QUEUED" });
  assert.equal(current.mode, "analyzing");
  assert.equal(current.resumed, false);
  assert.equal(pollDelayMs(current.polls), 0);

  current = reduceImportFlow(current, { type: "pollResolved", view: view({ status: "QUEUED" }) });
  assert.equal(current.mode, "analyzing");
  assert.equal(pollDelayMs(current.polls), 1000);

  current = reduceImportFlow(current, { type: "pollResolved", view: view({ status: "EXTRACTING" }) });
  assert.equal(pollDelayMs(current.polls), 2000);

  current = reduceImportFlow(current, { type: "pollResolved", view: candidateView("attempt-1") });
  assert.equal(current.mode, "review");
  assert.equal(current.candidate?.name, "Escova de dentes");
  assert.deepEqual(current.gaps, ["brand"]);
});

test("polling tolera falhas transitórias e falha de forma recuperável no limite", () => {
  let current = state({ mode: "analyzing", importId: "attempt-1", polls: 1 });
  current = reduceImportFlow(current, { type: "pollFailed", status: 0 });
  assert.equal(current.mode, "analyzing");
  assert.equal(current.pollErrors, 1);

  current = reduceImportFlow(current, { type: "pollFailed", status: 0 });
  assert.equal(current.pollErrors, MAX_POLL_ERRORS - 1);
  assert.equal(current.mode, "analyzing");

  current = reduceImportFlow(current, { type: "pollFailed", status: 0 });
  assert.equal(current.mode, "failed");
  assert.equal(current.failed.actionKind, "retry");
});

test("GET resolvido com FAILED apresenta mensagem do servidor e caminhos de recuperação", () => {
  const failed = reduceImportFlow(state({ mode: "analyzing", importId: "attempt-1" }), {
    type: "pollResolved",
    view: view({ status: "FAILED", error: { code: "IMPORT_FAILED", message: "A página não pôde ser analisada." } }),
  });
  assert.equal(failed.mode, "failed");
  assert.equal(failed.failed.message, "A página não pôde ser analisada.");
});

test("reidratação por ?import= cobre os três ramos de UX-AC1", () => {
  const analyzing = reduceImportFlow(state({ mode: "hydrating", importId: "attempt-1" }), {
    type: "hydrateResolved",
    view: view({ status: "EXTRACTING" }),
  });
  assert.equal(analyzing.mode, "analyzing");
  assert.equal(analyzing.resumed, true);

  const review = reduceImportFlow(state({ mode: "hydrating", importId: "attempt-1" }), {
    type: "hydrateResolved",
    view: candidateView("attempt-1"),
  });
  assert.equal(review.mode, "review");

  const failed = reduceImportFlow(state({ mode: "hydrating", importId: "attempt-1" }), {
    type: "hydrateResolved",
    view: view({ status: "FAILED", error: { message: "Análise expirada. Inicie uma nova análise ou adicione manualmente." } }),
  });
  assert.equal(failed.mode, "failed");
  assert.match(failed.failed.message, /expirada/);
});

test("reidratação sem id usa ?active=true: mais recente em análise, demais na lista", () => {
  const attempts = [
    attempt({ importId: "a1", createdAt: "2026-08-28T10:00:00Z", status: "EXTRACTING" }),
    attempt({ importId: "a2", createdAt: "2026-08-28T09:00:00Z", status: "QUEUED" }),
    attempt({ importId: "a3", createdAt: "2026-08-28T08:00:00Z", status: "CANDIDATE_READY" }),
  ];
  const resumed = reduceImportFlow(state(), { type: "hydrateListResolved", attempts });
  assert.equal(resumed.mode, "analyzing");
  assert.equal(resumed.importId, "a1");
  assert.equal(resumed.resumed, true);
  assert.deepEqual(resumed.others.map((item) => item.importId), ["a2", "a3"]);

  const reviewLatest = reduceImportFlow(state(), {
    type: "hydrateListResolved",
    attempts: [attempt({ importId: "a3", status: "CANDIDATE_READY" })],
  });
  assert.equal(reviewLatest.mode, "hydrating");
  assert.equal(reviewLatest.importId, "a3");

  const empty = reduceImportFlow(state(), { type: "hydrateListResolved", attempts: [] });
  assert.equal(empty.mode, "entry");

  const listingFailed = reduceImportFlow(state(), { type: "hydrateListFailed" });
  assert.equal(listingFailed.mode, "entry");
});

test("lista descarta tentativas terminais (UX-AC2)", () => {
  const terminalStatus = "FAILED" as ActiveAttempt["status"];
  const resolved = reduceImportFlow(state(), {
    type: "hydrateListResolved",
    attempts: [
      attempt({ importId: "a1", status: "CANDIDATE_READY" }),
      attempt({ importId: "terminal-1", status: "CONFIRMED" as ActiveAttempt["status"] }),
      attempt({ importId: "terminal-2", status: terminalStatus }),
    ],
  });
  assert.equal(resolved.mode, "hydrating");
  assert.equal(resolved.importId, "a1");
  assert.deepEqual(resolved.others, []);
});

test("abrir outra tentativa da lista hidrata o importId escolhido", () => {
  const switched = reduceImportFlow(
    state({ mode: "analyzing", importId: "a1", others: [attempt({ importId: "a2" })] }),
    { type: "switchAttempt", importId: "a2" },
  );
  assert.equal(switched.mode, "hydrating");
  assert.equal(switched.importId, "a2");
  assert.deepEqual(switched.others, []);
});

test("alternância URL↔manual preserva os dois rascunhos (UX-AC7)", () => {
  const draft = { ...state().manual, name: "Escova", description: "Para cabelos." };
  const onManual = reduceImportFlow(
    state({ url: "https://loja.example.com/p/1", manual: draft }),
    { type: "manualToggled" },
  );
  assert.equal(onManual.screen, "manual");
  assert.equal(onManual.url, "https://loja.example.com/p/1");

  const backToUrl = reduceImportFlow(onManual, { type: "manualDraftChanged", draft });
  const toggledBack = reduceImportFlow(backToUrl, { type: "manualToggled" });
  assert.equal(toggledBack.screen, "url");
  assert.equal(toggledBack.manual.name, "Escova");
  assert.equal(toggledBack.url, "https://loja.example.com/p/1");
});

test("mapeamento de erros cobre os status e códigos de UX-AC6", () => {
  assert.equal(mapImportError(400, "INVALID_URL", "URL inválida.").message, "URL inválida.");
  assert.equal(mapImportError(400).actionKind, undefined);
  assert.equal(mapImportError(401).actionKind, "login");
  assert.equal(mapImportError(403, "PRODUCT_LIMIT_REACHED").actionKind, undefined);
  assert.match(mapImportError(403, "PRODUCT_LIMIT_REACHED").message, /limite/);
  assert.match(mapImportError(403, "ENTITLEMENT_MISCONFIGURED").message, /configuração/);
  assert.equal(mapImportError(404).actionKind, "new-analysis");
  assert.equal(mapImportError(409, "IMPORT_ALREADY_CONFIRMED").actionKind, "new-analysis");
  assert.equal(mapImportError(409, "IMPORT_NOT_READY").actionKind, "update");
  assert.equal(mapImportError(429, "IMPORT_BUSY").actionKind, "retry");
  assert.equal(mapImportError(0).actionKind, "retry");
  assert.match(mapImportError(429).message, /Aguarde/);
});

test("confirmação preserva dados e restaura estado em erro", () => {
  const confirming = reduceImportFlow(state({ mode: "review", importId: "a1" }), { type: "confirmRequested" });
  assert.equal(confirming.confirming, true);

  const failed = reduceImportFlow(confirming, {
    type: "confirmFailed",
    status: 403,
    code: "PRODUCT_LIMIT_REACHED",
    message: "Limite atingido.",
  });
  assert.equal(failed.confirming, false);
  assert.equal(failed.mode, "review");
  assert.equal(failed.confirmMessage, "Limite atingido.");
});

test("backoff curto de polling tem teto em 3s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(pollDelayMs), [0, 1000, 2000, 3000, 3000, 3000]);
});
