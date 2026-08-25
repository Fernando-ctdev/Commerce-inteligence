import { test } from "node:test";
import assert from "node:assert/strict";

import { buildProductPayload, emptyProductDraft, validateProductDraft, visibleProductFieldErrors } from "./product-form-model";
import { productPathForCreatedProduct } from "./product-create-model";
import { firstProductErrorField, productProgressLabel, shouldMonitorEnrichment } from "./product-ui-model";

test("valida nome e descrição obrigatórios", () => {
  assert.deepEqual(validateProductDraft({ name: " ", description: "" }), {
    name: "Informe o nome do produto.",
    description: "Informe uma descrição do produto.",
  });
});

test("mantém validação neutra até submit e preserva erro server-side", () => {
  const draft = emptyProductDraft();
  const serverError = { name: "Já existe um produto com este nome." };

  assert.deepEqual(visibleProductFieldErrors(draft, {}, false), {});
  assert.deepEqual(visibleProductFieldErrors(draft, {}, true), {
    name: "Informe o nome do produto.",
    description: "Informe uma descrição do produto.",
  });
  assert.deepEqual(visibleProductFieldErrors(draft, serverError, false), serverError);
  assert.deepEqual(visibleProductFieldErrors(draft, serverError, true), {
    name: "Já existe um produto com este nome.",
    description: "Informe uma descrição do produto.",
  });
});

test("monta payload com listas e contexto pt-BR normalizados", () => {
  assert.deepEqual(
    buildProductPayload(
      {
        name: " Escova ",
        description: " Para cabelos ",
        category: " Beleza ",
        price: " 39,90 ",
        characteristics: "cerdas macias\n\n cabo leve",
        imageReferences: "https://example.com/image.jpg",
        observations: " Uso diário ",
        url: " https://example.com/product ",
        objective: "Vender mais",
        audience: "Pessoas ocupadas",
        style: "Demonstração",
        presence: "Sim",
        experience: "Já usei",
        restrictions: "Sem promessas médicas",
        market: "Brasil",
        contextObservations: "Gravar em casa",
      },
      "idempotency-key",
    ),
    {
      name: "Escova",
      description: "Para cabelos",
      category: "Beleza",
      price: "39,90",
      features: ["cerdas macias", "cabo leve"],
      imageRefs: ["https://example.com/image.jpg"],
      notes: "Uso diário",
      url: "https://example.com/product",
      idempotency_key: "idempotency-key",
      context: {
        locale: "pt-BR",
        goal: "Vender mais",
        audience: "Pessoas ocupadas",
        style: "Demonstração",
        creatorPresence: "Sim",
        experience: "Já usei",
        constraints: "Sem promessas médicas",
        market: "Brasil",
        notes: "Gravar em casa",
      },
    },
  );
});

test("lista só exibe pronto para Strategy depois do contexto salvo", () => {
  assert.equal(productProgressLabel(false), "Completar contexto");
  assert.equal(productProgressLabel(true), "Produto pronto para Strategy");
});

test("foco de erro escolhe o primeiro campo na ordem do formulário", () => {
  assert.equal(firstProductErrorField({ description: "Obrigatória", name: "Obrigatório" }), "name");
  assert.equal(firstProductErrorField({ contextObservations: "Inválida", market: "Inválido" }), "market");
  assert.equal(firstProductErrorField({}), undefined);
});

test("enrichment só é monitorado quando há URL pendente", () => {
  assert.equal(shouldMonitorEnrichment({ url: "https://example.com/product", enrichmentStatus: "pending" }), true);
  assert.equal(shouldMonitorEnrichment({ url: "", enrichmentStatus: "pending" }), false);
  assert.equal(shouldMonitorEnrichment({ url: "https://example.com/product", enrichmentStatus: "completed" }), false);
});

test("navegação após criação aponta para o Product criado", () => {
  assert.equal(productPathForCreatedProduct("product/id"), "/products/product%2Fid");
});
