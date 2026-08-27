import assert from "node:assert/strict";
import test from "node:test";
import { candidateAmountToCents, candidateCurrency, normalizeCandidate } from "./normalize.js";

const raw = {
  name: "  Produto   com   espaço ",
  description: "Descrição",
  price: { amount: 12.5, currency: "brl" },
  features: ["  Uma feature  ", "", "x".repeat(400)],
  images: ["https://cdn.example/img.jpg", "javascript:alert(1)"],
  seller: " Loja ",
  sourceUrl: "https://shop.tiktok.com/item/1",
};

test("normalizeCandidate limpa fatos, limita listas e registra lacunas", () => {
  const candidate = normalizeCandidate(raw, 9_999_999_999);
  assert.ok(candidate);
  assert.equal(candidate.facts.name, "Produto com espaço");
  assert.equal(candidate.facts.priceCents, 1250);
  assert.equal(candidate.facts.priceCurrency, "BRL");
  assert.deepEqual(candidate.facts.features, ["Uma feature", "x".repeat(300)]);
  assert.deepEqual(candidate.facts.imageRefs, ["https://cdn.example/img.jpg"]);
  assert.ok(candidate.gaps.includes("category"));
  assert.ok(candidate.gaps.includes("brand"));
  assert.ok(candidate.gaps.includes("variants"));
  assert.equal(candidate.provenance.name, "browser-extraction");
});

test("normalizeCandidate rejeita nome ausente e preço com mais de duas casas", () => {
  assert.equal(normalizeCandidate({ ...raw, name: "   " }, 9_999_999_999), null);
  assert.equal(candidateAmountToCents(1.234), null);
  assert.equal(candidateAmountToCents(-1), null);
});

test("candidateCurrency aceita somente três letras", () => {
  assert.equal(candidateCurrency("usd"), "USD");
  assert.equal(candidateCurrency("US"), null);
  assert.equal(candidateCurrency(""), null);
});
