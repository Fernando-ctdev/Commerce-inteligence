import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildManualProductPayload,
  buildProductPayload,
  digitsToPrice,
  formatPriceWithCurrency,
  emptyProductDraft,
  preparationIsWithinLimits,
  validateProductManualDraft,
  validateProductDraft,
  visibleProductFieldErrors,
} from "./product-form-model";
import { productPathForCreatedProduct } from "../create/product-create-model";
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
      },
      "",
    ),
    {
      name: "Informe o nome do produto.",
      description: "Informe uma descrição do produto.",
      category: "Informe a categoria do produto.",
      price: "Informe o preço do produto.",
      currency: "Informe a moeda do produto.",
    },
  );
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "-1",
        currency: "R$",
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
        currency: "R$X",
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
        currency: "R$",
      },
      "sem gírias",
    ),
    {},
  );
});

test("preparação aceita default 5 e rejeita fora de 1–10 ou notas acima de 300", () => {
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 5,
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
      targetContentCount: 11,
      creatorPresence: "either",
    }),
    false,
  );
  assert.equal(
    preparationIsWithinLimits({
      targetContentCount: 5,
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
        currency: " R$ ",
        imageReferences: "https://example.com/image.jpg",
        url: " https://example.com/product ",
      },
      {
        targetContentCount: 5,
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
      priceCurrency: "R$",
      imageRefs: ["https://example.com/image.jpg"],
      url: "https://example.com/product",
      targetContentCount: 5,
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
    },
    { targetContentCount: 10, creatorPresence: "on_camera" },
  );
  assert.deepEqual(payload, {
    name: "Escova",
    description: "Cabelos",
    category: null,
    price: null,
    priceCurrency: null,
    targetContentCount: 10,
    creatorPresence: "on_camera",
  });
});

test("preço manual 23,44 com moeda padrão R$ é válido", () => {
  const draft = {
    name: "Escova",
    description: "Cabelos",
    category: "Beleza",
    price: "23,44",
    currency: "R$",
  };

  assert.deepEqual(validateProductManualDraft(draft, "notas"), {});
  assert.equal(
    buildManualProductPayload(draft, {
      targetContentCount: 5,
      creatorPresence: "either",
    }).priceCurrency,
    "R$",
  );
});

test("preço vazio com moeda padrão R$ é rejeitado como obrigatório", () => {
  assert.deepEqual(
    validateProductManualDraft(
      {
        name: "Escova",
        description: "Cabelos",
        category: "Beleza",
        price: "",
        currency: "R$",
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
        currency: "R$",
      },
      " ",
    ),
    {},
  );
});

test("exibe preço com símbolo da moeda, não o código", () => {
  assert.equal(formatPriceWithCurrency("29.9", "R$"), "R$ 29,90");
  assert.equal(formatPriceWithCurrency("23.44", "USD"), "$ 23,44");
  assert.equal(formatPriceWithCurrency("12", "EUR"), "€ 12,00");
  assert.equal(formatPriceWithCurrency("10,00", "BRL"), "R$ 10,00");
  assert.equal(formatPriceWithCurrency("5", null), "5,00");
  assert.equal(formatPriceWithCurrency("", "R$"), null);
  assert.equal(formatPriceWithCurrency(null, "USD"), null);
});

test("comissão/features (ADR-030): payload nunca as envia, mesmo com draft legado", () => {
  const preparation = { targetContentCount: 1, creatorPresence: "either" } as const;
  const payload = buildManualProductPayload(
    { ...emptyProductDraft(), name: "P", description: "D", category: "C", price: "89.90", currency: "R$" },
    preparation,
  );
  assert.equal("commissionType" in payload, false);
  assert.equal("commissionValue" in payload, false);
  assert.equal("features" in payload, false);

  const edicao = buildProductPayload({ ...emptyProductDraft() });
  assert.equal("commissionType" in edicao, false);
  assert.equal("commissionValue" in edicao, false);
  assert.equal("features" in edicao, false);
});

test("desconto não é contrato: draft legado não emite campos no payload manual (ADR-031)", () => {
  const base = {
    ...emptyProductDraft(),
    name: "P",
    description: "D",
    category: "C",
    price: "89.90",
    currency: "R$",
  };
  const emptyPayload = buildManualProductPayload(
    base,
    { targetContentCount: 1, creatorPresence: "either" },
  );
  assert.equal("discountType" in emptyPayload, false);
  assert.equal("discountValue" in emptyPayload, false);
  // Campos legados presentes no draft (linha antiga/estado em memória) não
  // vazam para o payload; validação não rejeita por causa deles.
  const legacyDraft = { ...base, discountType: "PERCENTAGE", discountValue: "12,50" };
  const payload = buildManualProductPayload(
    legacyDraft,
    { targetContentCount: 1, creatorPresence: "either" },
    "idempotency-key",
  );
  assert.equal("discountType" in payload, false);
  assert.equal("discountValue" in payload, false);
  assert.deepEqual(validateProductManualDraft(legacyDraft, ""), {});
  assert.equal(payload.idempotency_key, "idempotency-key");
});

test("payload manual nunca carrega metadados de importação, provenância forjada nem atributos legados", () => {
  const payload = buildManualProductPayload(
    { ...emptyProductDraft(), name: "P", description: "D", category: "C", price: "89.90", currency: "R$", imageReferences: "https://img/1.jpg\nhttps://img/2.jpg" },
    { targetContentCount: 1, creatorPresence: "either" },
    "chave",
  );
  for (const forbidden of ["candidate", "gaps", "signals", "seller", "variants", "rawPayload", "sourceUrl", "provenanceOrigin", "commissionType", "commissionValue", "features"] as const) {
    assert.equal(forbidden in payload, false, `payload não deve conter ${forbidden}`);
  }
  // O payload carrega exatamente as linhas do draft; a regra de primeira
  // imagem vive no merge do candidato (product-import-model.test).
  assert.deepEqual(payload.imageRefs, ["https://img/1.jpg", "https://img/2.jpg"]);
});
