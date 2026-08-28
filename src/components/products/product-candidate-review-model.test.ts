import { test } from "node:test";
import assert from "node:assert/strict";

import type { ImportCandidate } from "./import-contracts";
import {
  QUANTITY_MESSAGE,
  buildReviewFacts,
  firstReviewErrorField,
  formatPriceAmount,
  mapServerFieldErrors,
  parsePriceInput,
  reviewDraftFromCandidate,
  reviewOrigin,
  validateQuantity,
  validateReviewDraft,
  type ReviewDraft,
} from "./product-candidate-review-model";

const candidate: ImportCandidate = {
  name: "Escova de dentes",
  description: "Escova com cerdas macias.",
  category: "Beleza",
  brand: "Marca X",
  price: { amount: 39.9, currency: "BRL" },
  features: ["cerdas macias", "cabo leve"],
  variants: [{ name: "Cor", value: "Preto" }],
  images: ["https://img.example.com/1.jpg"],
  seller: "Loja Oficial",
  submittedUrl: "https://loja.example.com/p/1",
  sourceUrl: "https://loja.example.com/p/1",
  gaps: ["seller"],
};

function draft(overrides: Partial<ReviewDraft> = {}): ReviewDraft {
  return { ...reviewDraftFromCandidate(candidate, 20), ...overrides };
}

test("rascunho inicial vem do candidate com quantidade resolvida server-side", () => {
  const initial = reviewDraftFromCandidate(candidate, 20);
  assert.equal(initial.name, "Escova de dentes");
  assert.equal(initial.price, "39,90");
  assert.equal(initial.quantity, "20");
  assert.deepEqual(initial.features, ["cerdas macias", "cabo leve"]);
  assert.deepEqual(initial.variants, [{ name: "Cor", value: "Preto" }]);
});

test("facts contêm apenas as correções do creator", () => {
  const corrected = draft({ name: "Escova de dentes premium", brand: "Marca Y" });
  const facts = buildReviewFacts(corrected, candidate);
  assert.deepEqual(facts, { name: "Escova de dentes premium", brand: "Marca Y" });
});

test("campos intocados e limpos não geram facts", () => {
  assert.deepEqual(buildReviewFacts(reviewDraftFromCandidate(candidate, 20), candidate), {});
  const cleared = draft({ category: "  " });
  assert.deepEqual(buildReviewFacts(cleared, candidate), {});
});

test("preço corrigido vai como valor e moeda", () => {
  const facts = buildReviewFacts(draft({ price: "49,90" }), candidate);
  assert.deepEqual(facts.price, { amount: 49.9, currency: "BRL" });
});

test("listas editadas vão completas, inclusive vazias", () => {
  const withoutFeatures = draft({ features: [] });
  assert.deepEqual(buildReviewFacts(withoutFeatures, candidate).features, []);

  const withNewFeature = draft({ features: ["cerdas macias", "cabo leve", "silent"] });
  assert.deepEqual(buildReviewFacts(withNewFeature, candidate).features, ["cerdas macias", "cabo leve", "silent"]);
});

test("quantidade nunca entra em facts", () => {
  const facts = buildReviewFacts(draft({ quantity: "30" }), candidate);
  assert.equal(facts.quantity, undefined);
  assert.equal("targetContentCount" in facts, false);
});

test("validação cobre nome obrigatório, limites, preço e quantidade", () => {
  const errors = validateReviewDraft(draft({ name: " ", price: "abc", quantity: "51", images: ["javascript:alert(1)"] }));
  assert.match(errors.name ?? "", /Informe o nome/);
  assert.match(errors.price ?? "", /preço válido/);
  assert.equal(errors.quantity, QUANTITY_MESSAGE);
  assert.match(errors.images ?? "", /http/);

  const longName = validateReviewDraft(draft({ name: "x".repeat(301) }));
  assert.match(longName.name ?? "", /300 caracteres/);
});

test("quantidade aceita inteiros entre 1 e 50", () => {
  assert.equal(validateQuantity("1"), null);
  assert.equal(validateQuantity("50"), null);
  assert.equal(validateQuantity("0"), QUANTITY_MESSAGE);
  assert.equal(validateQuantity("51"), QUANTITY_MESSAGE);
  assert.equal(validateQuantity("12,5"), QUANTITY_MESSAGE);
  assert.equal(validateQuantity(""), QUANTITY_MESSAGE);
});

test("origem por fato: extraída, lacuna explícita ou confirmada por você", () => {
  const untouched = reviewDraftFromCandidate(candidate, 20);
  assert.equal(reviewOrigin("brand", untouched, candidate, untouched === untouched ? candidate.gaps : []), "extracted");
  assert.equal(reviewOrigin("seller", untouched, candidate, candidate.gaps), "gap");
  assert.equal(reviewOrigin("name", draft({ name: "Novo nome" }), candidate, candidate.gaps), "confirmed");
  assert.equal(reviewOrigin("seller", draft({ seller: "Nova loja" }), candidate, candidate.gaps), "confirmed");
  assert.equal(reviewOrigin("brand", untouched, candidate, candidate.gaps), "extracted");
});

test("foco vai ao primeiro campo com erro na ordem do formulário", () => {
  assert.equal(firstReviewErrorField({ name: "x", description: "y" }), "name");
  assert.equal(firstReviewErrorField({ description: "y", quantity: "z" }), "description");
  assert.equal(firstReviewErrorField({ quantity: QUANTITY_MESSAGE }), "quantity");
  assert.equal(firstReviewErrorField({}), undefined);
});

test("erros de server-side mapeiam targetContentCount para quantity", () => {
  const mapped = mapServerFieldErrors({ targetContentCount: "Escolha entre 1 e 50.", name: "Erro" });
  assert.equal(mapped.quantity, "Escolha entre 1 e 50.");
  assert.equal("targetContentCount" in mapped, false);
  assert.equal(mapped.name, "Erro");
});

test("preço em formato pt-BR é parseado com segurança", () => {
  assert.equal(parsePriceInput("39,90"), 39.9);
  assert.equal(parsePriceInput("1.299,90"), 1299.9);
  assert.equal(parsePriceInput("0"), null);
  assert.equal(parsePriceInput("-5"), null);
  assert.equal(parsePriceInput("  "), null);
  assert.equal(formatPriceAmount(39.9), "39,90");
  assert.equal(formatPriceAmount(100), "100,00");
});
