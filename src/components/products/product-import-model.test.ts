import assert from "node:assert/strict";
import test from "node:test";

import { candidateCanBeConfirmed, contentPreparationPreferencesAreValid, productImportAllowsManualFallback, productImportCanResume, productImportErrorMessage, productImportShouldPoll, productImportShowsInteractiveBrowser, productImportStateLabel, validateCandidateDraft, validateProductImportUrl } from "./product-import-model";

test("valida URL de importação sem permitir credenciais", () => {
  assert.equal(validateProductImportUrl(""), "Cole a URL do produto do TikTok Shop.");
  assert.equal(validateProductImportUrl("ftp://tiktok.com/item"), "Use uma URL http ou https.");
  assert.equal(validateProductImportUrl("https://user:pass@tiktok.com/item"), "A URL não pode conter credenciais.");
  assert.equal(validateProductImportUrl("https://example.com/product"), "Use uma URL reconhecida do TikTok Shop.");
  assert.equal(validateProductImportUrl("https://www.tiktok.com/@creator/product/1"), null);
});

const completeCandidate = {
  name: "Produto",
  description: "Descrição",
  category: "Categoria",
  brand: "Marca",
  seller: "Seller",
  price: "10",
  currency: "BRL",
  features: "Característica",
  variants: "Variante",
  images: "https://example.com/product.jpg",
  sourceUrl: "https://shop.tiktok.com/product/1",
};

test("Candidate pode confirmar com fatos opcionais ausentes", () => {
  assert.equal(candidateCanBeConfirmed({ ...completeCandidate, sourceUrl: "" }, { requireCompleteFacts: true, validateSourceUrl: false }), true);
  assert.equal(candidateCanBeConfirmed({ ...completeCandidate, category: "", brand: "", seller: "", price: "", currency: "", features: "", variants: "", images: "" }, { requireCompleteFacts: true, validateSourceUrl: false }), true);
  assert.equal(candidateCanBeConfirmed({ ...completeCandidate, name: "" }, { requireCompleteFacts: true, validateSourceUrl: false }), false);
  assert.equal(candidateCanBeConfirmed({ ...completeCandidate, description: "" }, { requireCompleteFacts: true, validateSourceUrl: false }), false);
  assert.equal(validateCandidateDraft({ ...completeCandidate, sourceUrl: "" }, { requireCompleteFacts: true, validateSourceUrl: false }).sourceUrl, undefined);
  assert.equal(productImportStateLabel("LOGIN_REQUIRED"), "Faça login no TikTok nesta janela para continuar");
});

test("fatos opcionais não bloqueiam a confirmação", () => {
  const options = { ignoreHiddenFields: true, requireCompleteFacts: true, validateSourceUrl: false };
  const candidateWithoutHiddenFields = { ...completeCandidate, seller: "", variants: "", images: "" };
  assert.deepEqual(validateCandidateDraft(candidateWithoutHiddenFields, options), {});
  assert.equal(candidateCanBeConfirmed(candidateWithoutHiddenFields, options), true);
  assert.equal(validateCandidateDraft({ ...candidateWithoutHiddenFields, brand: "" }, options).brand, undefined);
  assert.equal(validateCandidateDraft({ ...candidateWithoutHiddenFields, features: "" }, options).features, undefined);
});

test("valida preferências de preparação conforme o contrato", () => {
  assert.equal(contentPreparationPreferencesAreValid({ targetContentCount: 1, creatorPresence: "on_camera" }), true);
  assert.equal(contentPreparationPreferencesAreValid({ targetContentCount: 50, creatorPresence: "hands_only_product", constraints: "a".repeat(300) }), true);
  assert.equal(contentPreparationPreferencesAreValid({ targetContentCount: 0, creatorPresence: "either" }), false);
  assert.equal(contentPreparationPreferencesAreValid({ targetContentCount: 20.5, creatorPresence: "either" }), false);
  assert.equal(contentPreparationPreferencesAreValid({ targetContentCount: 20, creatorPresence: "either", constraints: "a".repeat(301) }), false);
});

test("browser interativo existe somente enquanto há bloqueio humano", () => {
  const interactiveUrl = "/v1/browser-sessions/session-1/interactive/token/vnc.html";
  assert.equal(productImportShowsInteractiveBrowser("LOGIN_REQUIRED", interactiveUrl), true);
  assert.equal(productImportShowsInteractiveBrowser("EXTRACTING", interactiveUrl), false);
  assert.equal(productImportShowsInteractiveBrowser("READY", interactiveUrl), false);
  assert.equal(productImportShowsInteractiveBrowser("ERROR", interactiveUrl), false);
  assert.equal(productImportStateLabel("EXTRACTING"), "Extraindo dados…");
});

test("polling automático só existe durante abertura ou extração", () => {
  assert.equal(productImportShouldPoll("OPENING"), true);
  assert.equal(productImportShouldPoll("EXTRACTING"), true);
  assert.equal(productImportShouldPoll("LOGIN_REQUIRED"), false);
  assert.equal(productImportShouldPoll("PAUSED"), false);
  assert.equal(productImportShouldPoll("READY"), false);
});

test("retomada respeita handoff expirado e erro de contrato tem mensagem", () => {
  assert.equal(productImportCanResume({ state: "LOGIN_REQUIRED", handoffExpired: false, canResume: true }), true);
  assert.equal(productImportCanResume({ state: "LOGIN_REQUIRED", handoffExpired: true, canResume: true }), false);
  assert.equal(productImportCanResume({ state: "LOGIN_REQUIRED", handoffExpired: false, canResume: false }), false);
  assert.notEqual(productImportErrorMessage("CANDIDATE_EXPIRED"), "");
});

test("handoff expirado mantém fallback manual direto", () => {
  assert.equal(productImportAllowsManualFallback("LOGIN_REQUIRED", true), true);
  assert.equal(productImportAllowsManualFallback("PAUSED", true), true);
  assert.equal(productImportAllowsManualFallback("PAUSED", false), false);
});

test("valida fatos editados do Candidate antes de confirmar", () => {
  const errors = validateCandidateDraft({ ...completeCandidate, price: "-5" }, { requireCompleteFacts: true, validateSourceUrl: false });
  assert.equal(errors.price, "Informe um preço não negativo com até duas casas.");
  assert.equal(validateCandidateDraft({ ...completeCandidate, currency: "" }, { requireCompleteFacts: true, validateSourceUrl: false }).currency, "Informe a moeda quando houver preço.");
});

test("gate valida limites dos fatos opcionais", () => {
  const errors = validateCandidateDraft({ ...completeCandidate, seller: "a".repeat(201), variants: Array.from({ length: 21 }, () => "variante").join("\n"), images: "not-a-url" }, { requireCompleteFacts: true, validateSourceUrl: false });
  assert.equal(errors.seller, "Máximo de 200 caracteres.");
  assert.equal(errors.variants, "Máximo de 20 itens.");
  assert.equal(errors.images, "Use somente URLs http(s) sem credenciais.");
});

test("manual mantém sourceUrl opcional, mas valida quando informado", () => {
  const manualCandidate = { ...completeCandidate, category: "", brand: "", seller: "", price: "", currency: "", features: "", variants: "", images: "", sourceUrl: "" };
  assert.deepEqual(validateCandidateDraft(manualCandidate, { requireCompleteFacts: false }), {});
  assert.equal(candidateCanBeConfirmed(manualCandidate, { requireCompleteFacts: false }), true);
  const errors = validateCandidateDraft({ ...manualCandidate, currency: "real", sourceUrl: "https://user:pass@example.com/product/1" }, { requireCompleteFacts: false });
  assert.equal(errors.currency, "Moeda inválida: use 3 letras (ex.: BRL, USD).");
  assert.equal(errors.sourceUrl, "Use uma URL http(s) sem credenciais.");
});

test("categoria importada aceita texto livre até o limite do contrato", () => {
  assert.equal(validateCandidateDraft({ ...completeCandidate, category: "Casa e organização" }, { requireCompleteFacts: true, validateSourceUrl: false }).category, undefined);
  assert.equal(validateCandidateDraft({ ...completeCandidate, category: "a".repeat(121) }, { requireCompleteFacts: true, validateSourceUrl: false }).category, "Máximo de 120 caracteres.");
});
