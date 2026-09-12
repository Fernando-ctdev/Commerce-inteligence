import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildManualProductPayload,
  buildProductPayload,
  digitsToPrice,
  commissionAmountCents,
  formatCommission,
  formatPriceWithCurrency,
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
        currency: "R$",
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
        currency: "R$X",
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
        currency: "R$",
        characteristics: "cerdas",
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
        characteristics: "cerdas macias\n\n cabo leve",
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
      features: ["cerdas macias", "cabo leve"],
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

test("preço manual 23,44 com moeda padrão R$ é válido", () => {
  const draft = {
    name: "Escova",
    description: "Cabelos",
    category: "Beleza",
    price: "23,44",
    currency: "R$",
    characteristics: "cerdas",
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
        currency: "R$",
        characteristics: "cerdas",
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

test("comissão: calcula % sobre o preço e valor fixo; sem preço % fica só percentual", () => {
  assert.equal(commissionAmountCents("PERCENT", "10", "89,90"), 899);
  assert.equal(commissionAmountCents("AMOUNT", "4,50", "89,90"), 450);
  assert.equal(commissionAmountCents("PERCENT", "7,5", "200"), 1500);
  assert.equal(commissionAmountCents("PERCENT", "10", ""), null);
  assert.equal(commissionAmountCents("PERCENT", "", "89,90"), null);
  assert.equal(commissionAmountCents("", "10", "89,90"), null);
  assert.equal(commissionAmountCents("PERCENT", "0", "89,90"), null);
  assert.equal(formatCommission("PERCENT", "10", "89,90", "R$"), "R$ 8,99");
  assert.equal(formatCommission("AMOUNT", "4,50", "89,90", "USD"), "$ 4,50");
  assert.equal(formatCommission("PERCENT", "10", "", "R$"), "10%");
  assert.equal(formatCommission("", "10", "89,90", "R$"), null);
});

test("comissão: validação exige par, formato e faixa percentual", () => {
  const base = {
    ...emptyProductDraft(),
    name: "Produto",
    description: "Descrição",
    category: "Categoria",
    price: "89.90",
    currency: "USD",
    characteristics: "característica",
    commissionType: "",
    commission: "",
  };
  assert.deepEqual(
    validateProductManualDraft({ ...base, commission: "10" }, ""),
    { commissionType: "Escolha se a comissão é % ou valor." },
  );
  assert.deepEqual(
    validateProductManualDraft({ ...base, commissionType: "PERCENT" }, ""),
    { commission: "Informe o valor da comissão." },
  );
  assert.deepEqual(
    validateProductManualDraft({ ...base, commissionType: "PERCENT", commission: "100,01" }, ""),
    { commission: "A comissão percentual deve estar entre 0 e 100." },
  );
  assert.deepEqual(
    validateProductManualDraft({ ...base, commissionType: "FIXA", commission: "1" }, ""),
    { commissionType: "Informe um tipo de comissão válido." },
  );
  const valido = validateProductManualDraft({ ...base, commissionType: "AMOUNT", commission: "4,50" }, "");
  assert.equal(valido.commission, undefined);
  assert.equal(valido.commissionType, undefined);
});

test("comissão: payload envia tipo e valor normalizado apenas quando o par está completo", () => {
  const preparation = { targetContentCount: 1, creatorPresence: "either" } as const;
  const comComissao = buildManualProductPayload(
    { ...emptyProductDraft(), name: "P", description: "D", category: "C", price: "89.90", currency: "R$", characteristics: "x", commissionType: "PERCENT", commission: "10,5" },
    preparation,
  );
  assert.equal(comComissao.commissionType, "PERCENT");
  assert.equal(comComissao.commissionValue, "10,50");

  const semComissao = buildManualProductPayload(
    { ...emptyProductDraft(), name: "P", description: "D", category: "C", price: "89.90", currency: "R$", characteristics: "x" },
    preparation,
  );
  assert.equal(semComissao.commissionType, undefined);
  assert.equal(semComissao.commissionValue, undefined);

  const edicao = buildProductPayload({
    ...emptyProductDraft(),
    commissionType: "AMOUNT",
    commission: "5",
  });
  assert.equal(edicao.commissionValue, "5,00");
});

test("desconto percentual é opcional, normalizado e validado", () => {
  const base = {
    ...emptyProductDraft(),
    name: "P",
    description: "D",
    category: "C",
    price: "89.90",
    currency: "R$",
    characteristics: "x",
  };
  assert.deepEqual(validateProductManualDraft({ ...base, discountPercentage: "100,01" }, ""), {
    discountPercentage: "O desconto deve estar entre 0 e 100%.",
  });
  const payload = buildManualProductPayload(
    { ...base, discountPercentage: "12,50" },
    { targetContentCount: 1, creatorPresence: "either" },
    "idempotency-key",
  );
  assert.equal(payload.discountPercentage, "12.5");
  assert.equal(payload.idempotency_key, "idempotency-key");
  assert.equal(
    buildManualProductPayload(
      { ...base, discountPercentage: "" },
      { targetContentCount: 1, creatorPresence: "either" },
    ).discountPercentage,
    null,
  );
});
