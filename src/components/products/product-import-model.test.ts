import assert from "node:assert/strict";
import test from "node:test";

import { candidateCanBeConfirmed, productImportShowsInteractiveBrowser, productImportStateLabel, validateCandidateDraft, validateProductImportUrl } from "./product-import-model";

test("valida URL de importação sem permitir credenciais", () => {
  assert.equal(validateProductImportUrl(""), "Cole a URL do produto do TikTok Shop.");
  assert.equal(validateProductImportUrl("ftp://tiktok.com/item"), "Use uma URL http ou https.");
  assert.equal(validateProductImportUrl("https://user:pass@tiktok.com/item"), "A URL não pode conter credenciais.");
  assert.equal(validateProductImportUrl("https://example.com/product"), "Use uma URL reconhecida do TikTok Shop.");
  assert.equal(validateProductImportUrl("https://www.tiktok.com/@creator/product/1"), null);
});

test("Candidate só pode confirmar com nome e descrição", () => {
  assert.equal(candidateCanBeConfirmed({ name: "Produto", description: "Descrição" }), true);
  assert.equal(candidateCanBeConfirmed({ name: "Produto", description: "" }), false);
  assert.equal(productImportStateLabel("LOGIN_REQUIRED"), "Faça login no TikTok nesta janela para continuar");
});

test("browser interativo existe somente enquanto há bloqueio humano", () => {
  const interactiveUrl = "/v1/browser-sessions/session-1/interactive/token/vnc.html";
  assert.equal(productImportShowsInteractiveBrowser("LOGIN_REQUIRED", interactiveUrl), true);
  assert.equal(productImportShowsInteractiveBrowser("EXTRACTING", interactiveUrl), false);
  assert.equal(productImportShowsInteractiveBrowser("READY", interactiveUrl), false);
  assert.equal(productImportShowsInteractiveBrowser("ERROR", interactiveUrl), false);
  assert.equal(productImportStateLabel("EXTRACTING"), "Extraindo dados…");
});

test("valida fatos editados do Candidate antes de confirmar", () => {
  const errors = validateCandidateDraft({ name: "Produto", description: "Descrição", category: "", brand: "", seller: "", price: "-5", currency: "", features: "", variants: "", images: "", sourceUrl: "https://shop.tiktok.com/product/1" });
  assert.equal(errors.price, "Informe um preço não negativo com até duas casas.");
  assert.equal(validateCandidateDraft({ name: "Produto", description: "Descrição", category: "", brand: "", seller: "", price: "10", currency: "", features: "", variants: "", images: "", sourceUrl: "https://shop.tiktok.com/product/1" }).currency, "Informe a moeda quando houver preço.");
});
