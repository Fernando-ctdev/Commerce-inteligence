import { test } from "node:test";
import assert from "node:assert/strict";

import {
  candidateSignalsForDisplay,
  candidateState,
  gapLabels,
  importDisabled,
  importStatusAnnouncement,
  mergeImportedCandidate,
  type ProductImportCandidate,
} from "./product-import-model";
import type { ProductManualDraft } from "./product-form-model";

const manualDraft: ProductManualDraft = {
  name: "Produto manual",
  description: "Descrição manual",
  category: "Pet shop",
  price: "50.00",
  currency: "USD",
  imageReferences: "https://exemplo.com/minha.jpg",
  url: "",
  discountType: "PERCENTAGE",
  discountValue: "10",
};

/* features segue no candidato só como contrato externo transitório do
   importer (ADR-030): nunca é mapeado para o draft nem vira gap acionável. */
function candidate(overrides: Partial<ProductImportCandidate>): ProductImportCandidate {
  return { features: [], imageRefs: [], sourceUrl: "https://shop.tiktok.com/x", gaps: [], ...overrides };
}

test("merge preserva os dados manuais quando o candidato não traz o fato", () => {
  const merged = mergeImportedCandidate(manualDraft, candidate({}));
  assert.deepEqual(merged, {
    ...manualDraft,
    url: "https://shop.tiktok.com/x",
  });
});

test("merge substitui nome, descrição, categoria e preço presentes no candidato", () => {
  const merged = mergeImportedCandidate(
    manualDraft,
    candidate({
      name: "Escova Alisadora",
      description: "Alisa em minutos",
      category: "Beleza e cuidados pessoais",
      price: "89.90",
      priceCurrency: "R$",
      features: ["Cerdas macias"],
    }),
  );
  assert.equal(merged.name, "Escova Alisadora");
  assert.equal(merged.description, "Alisa em minutos");
  assert.equal(merged.category, "Beleza e cuidados pessoais");
  assert.equal(merged.price, "89.90");
  assert.equal(merged.currency, "R$");
  /* features do candidato não cruza para o draft: sem campo no formulário. */
  assert.equal("characteristics" in merged, false);
});

test("merge preserva imagens manuais e aplica a importada só em formulário sem imagem", () => {
  /* Review blocker: imagem manual/upload do creator tem prioridade —
     a importada não substitui o que já existe. */
  const withManual = mergeImportedCandidate(
    manualDraft,
    candidate({ imageRefs: ["https://img/1.jpg", "https://img/2.jpg"] }),
  );
  assert.equal(withManual.imageReferences, manualDraft.imageReferences);

  /* Fluxo URL-first com imagens vazias: primeira imagem importada apenas. */
  const emptyImageDraft: ProductManualDraft = { ...manualDraft, imageReferences: "" };
  const applied = mergeImportedCandidate(
    emptyImageDraft,
    candidate({ imageRefs: ["https://img/1.jpg", "https://img/2.jpg"] }),
  );
  assert.equal(applied.imageReferences, "https://img/1.jpg");

  const untouched = mergeImportedCandidate(emptyImageDraft, candidate({}));
  assert.equal(untouched.imageReferences, "");
});

test("merge aceita somente moedas suportadas e desconto PERCENTAGE com valor", () => {
  const unsupportedCurrency = mergeImportedCandidate(
    manualDraft,
    candidate({ priceCurrency: "BRL", price: "89.90" }),
  );
  assert.equal(unsupportedCurrency.currency, "USD");

  const withDiscount = mergeImportedCandidate(
    manualDraft,
    candidate({ discountType: "PERCENTAGE", discountValue: "20" }),
  );
  assert.equal(withDiscount.discountValue, "20");
  assert.equal(withDiscount.discountType, "PERCENTAGE");

  const withoutDiscount = mergeImportedCandidate(manualDraft, candidate({}));
  assert.equal(withoutDiscount.discountValue, manualDraft.discountValue);
});

test("estado do candidato: ready sem gaps e partial com qualquer gap, na ordem recebida", () => {
  assert.equal(candidateState(candidate({ gaps: [] })), "candidate-ready");
  assert.equal(
    candidateState(candidate({ gaps: ["description", "name"] })),
    "candidate-partial",
  );
  assert.deepEqual(gapLabels(["description", "name"]), ["Descrição", "Nome"]);
  assert.deepEqual(gapLabels(["price", "seller"]), ["Preço"]);
});

test("sinais viram exibição somente leitura formatada em pt-BR", () => {
  assert.deepEqual(
    candidateSignalsForDisplay({ salesCount: 1234, ratingValue: 4.8, reviewCount: 56 }),
    [
      { label: "Vendas", value: "1.234" },
      { label: "Nota média", value: "4,8" },
      { label: "Avaliações", value: "56" },
    ],
  );
  assert.deepEqual(candidateSignalsForDisplay({}), []);
  assert.deepEqual(candidateSignalsForDisplay(undefined), []);
});

test("status de importação tem anúncio para cada estado visível", () => {
  assert.match(importStatusAnnouncement("importing"), /Importando/);
  assert.match(importStatusAnnouncement("ready"), /Confira e salve/);
  assert.match(importStatusAnnouncement("partial"), /parcial/i);
  assert.match(importStatusAnnouncement("fallback"), /manual/i);
  assert.equal(importStatusAnnouncement("idle"), "");
  // Mensagem do servidor sanitizada tem prioridade no fallback.
  assert.equal(
    importStatusAnnouncement("fallback", "Consulta indisponível agora."),
    "Consulta indisponível agora.",
  );
});

test("importar fica desabilitado durante a consulta e durante o salvamento", () => {
  assert.equal(importDisabled(true, false), true);
  assert.equal(importDisabled(false, true), true);
  assert.equal(importDisabled(false, false), false);
});
