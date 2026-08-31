import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildManualProductPayload,
  buildProductPayload,
  digitsToPrice,
  emptyProductDraft,
  preparationIsWithinLimits,
  validateProductManualDraft,
  validateProductDraft,
  visibleProductFieldErrors,
} from "./product-form-model";
import { productPathForCreatedProduct } from "./product-create-model";
import { firstProductErrorField } from "./product-ui-model";

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
  assert.deepEqual(
    visibleProductFieldErrors(draft, serverError, false),
    serverError,
  );
  assert.deepEqual(visibleProductFieldErrors(draft, serverError, true), {
    name: "Já existe um produto com este nome.",
    description: "Informe uma descrição do produto.",
  });
});

test("monta payload manual com fatos normalizados", () => {
  assert.deepEqual(
    buildProductPayload(
      {
        name: " Escova ",
        description: " Para cabelos ",
        category: " Beleza ",
        seller: " Loja oficial ",
        variants: " Preto \n\n Branco ",
        price: " 39,90 ",
        characteristics: "cerdas macias\n\n cabo leve",
        imageReferences: "https://example.com/image.jpg",
        observations: " Uso diário ",
        url: " https://example.com/product ",
      },
      "idempotency-key",
    ),
    {
      name: "Escova",
      description: "Para cabelos",
      category: "Beleza",
      seller: "Loja oficial",
      variants: ["Preto", "Branco"],
      price: "39,90",
      features: ["cerdas macias", "cabo leve"],
      imageRefs: ["https://example.com/image.jpg"],
      notes: "Uso diário",
      url: "https://example.com/product",
      idempotency_key: "idempotency-key",
    },
  );
});

test("foco de erro escolhe o primeiro campo na ordem do formulário", () => {
  assert.equal(
    firstProductErrorField({ description: "Obrigatória", name: "Obrigatório" }),
    "name",
  );
  assert.equal(
    firstProductErrorField({ url: "Inválida", category: "Inválida" }),
    "category",
  );
  assert.equal(firstProductErrorField({}), undefined);
});

test("navegação após criação aponta para o Product criado", () => {
  assert.equal(
    productPathForCreatedProduct("product/id"),
    "/products/product%2Fid",
  );
});

test("máscara de preço converte dígitos em valor com duas casas", () => {
  assert.equal(digitsToPrice("1290"), "12.90");
  assert.equal(digitsToPrice("0009"), "0.09");
  assert.equal(digitsToPrice(""), "");
});

test("valida cadastro manual: todos os campos obrigatórios e formatos", () => {
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: " ",
        description: "",
        category: "",
        price: "",
        currency: "",
        characteristics: "",
      },
      "",
    ),
    {
      name: "Informe o nome do produto.",
      description: "Informe uma descrição do produto.",
      category: "Informe a categoria do produto.",
      price: "Informe o preço do produto.",
      currency: "Informe a moeda do produto.",
      characteristics: "Informe ao menos uma característica.",
    },
  );
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "-1",
        currency: "BRL",
        characteristics: "cerdas",
      },
      "notas",
    ),
    { price: "Informe um preço não negativo com até duas casas." },
  );
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "39.90",
        currency: "BRLX",
        characteristics: "cerdas",
      },
      "notas",
    ),
    { currency: "Informe uma moeda válida." },
  );
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "39.90",
        currency: "BRL",
        characteristics: "cerdas",
      },
      "sem gírias",
    ),
    {},
  );
});

test("preparação aceita default 20 e rejeita fora de 1–30 ou notas acima de 300", () => {
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 20,
      creatorPresence: "either",
    }),
    true,
  );
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 1,
      creatorPresence: "on_camera",
      constraints: "sem gírias",
    }),
    true,
  );
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 0,
      creatorPresence: "either",
    }),
    false,
  );
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 31,
      creatorPresence: "either",
    }),
    false,
  );
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 20,
      creatorPresence: "hands_only_product",
      constraints: "a".repeat(301),
    }),
    false,
  );
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 2.5,
      creatorPresence: "either",
    }),
    false,
  );
});

test("monta payload manual com fatos normalizados, preparação e chave", () => {
  assert.deepEqual(
    buildManualProductPayload(
      {
        name: " Escova ",
        description: " Para cabelos ",
        category: " Beleza ",
        price: " 39.90 ",
        currency: " BRL ",
        characteristics: "cerdas macias\n\n cabo leve",
        imageReferences: "https://example.com/image.jpg",
        url: " https://example.com/product ",
      },
      {
        targetContentCount: 20,
        creatorPresence: "either",
        constraints: " Sem gírias ",
      },
      "idempotency-key",
    ),
    {
      name: "Escova",
      description: "Para cabelos",
      category: "Beleza",
      price: "39,90",
      priceCurrency: "BRL",
      features: ["cerdas macias", "cabo leve"],
      imageRefs: ["https://example.com/image.jpg"],
      url: "https://example.com/product",
      targetContentCount: 20,
      creatorPresence: "either",
      constraints: "Sem gírias",
      idempotency_key: "idempotency-key",
    },
  );
});

test("par preço/moeda vazio fica nulo e constraints omitidas somem do payload", () => {
  const payload = buildManualProductPayload(
    {
      name: "Escova",
      description: "Cabelos",
      category: "",
      price: "",
      currency: "",
      characteristics: "",
    },
    { targetContentCount: 10, creatorPresence: "on_camera" },
  );
  assert.deepEqual(payload, {
    name: "Escova",
    description: "Cabelos",
    category: null,
    price: null,
    priceCurrency: null,
    features: [],
    targetContentCount: 10,
    creatorPresence: "on_camera",
  });
});

test("preço manual 23,44 com moeda padrão BRL é válido", () => {
  const draft = {
    name: "Escova",
    description: "Cabelos",
    category: "Beleza",
    price: "23,44",
    currency: "BRL",
    characteristics: "cerdas",
  };

  assert.deepEqual(validateProductManualDraft(draft, "notas"), {});
  assert.equal(
    buildManualProductPayload(draft, {
      targetContentCount: 20,
      creatorPresence: "either",
    }).priceCurrency,
    "BRL",
  );
});

test("preço vazio com moeda padrão BRL é rejeitado como obrigatório", () => {
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "",
        currency: "BRL",
        characteristics: "cerdas",
      },
      "notas",
    ),
    { price: "Informe o preço do produto." },
  );
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "23,44",
        currency: "",
        characteristics: "cerdas",
      },
      "notas",
    ),
    { currency: "Informe a moeda do produto." },
  );
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "23,44",
        currency: "BRL",
        characteristics: "cerdas",
      },
      " ",
    ),
    {},
  );
});
