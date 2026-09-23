import { test } from "node:test";
import assert from "node:assert/strict";

import { importProduct, ProductApiError } from "./product-api";
import { URL_IMPORT_ENABLED } from "../../modules/products/import-config";

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

function mockFetch(body: unknown, status = 200) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const IMPORT_URL = "https://shop.tiktok.com/view/product/12345";

test("importação desativada não dispara requisição e falha com erro sanitizado", async () => {
  const mock = mockFetch({
    candidate: { features: [], imageRefs: [], sourceUrl: IMPORT_URL, gaps: [] },
  });

  try {
    await assert.rejects(
      importProduct(IMPORT_URL, "chave-123"),
      (caught: unknown) => caught instanceof ProductApiError,
    );
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("importação envia somente { url } no corpo e a chave de idempotência no header", { skip: !URL_IMPORT_ENABLED && "importação por URL desativada" }, async () => {
  const mock = mockFetch({
    candidate: { features: [], imageRefs: [], sourceUrl: IMPORT_URL, gaps: [] },
    partial: true,
    gaps: ["name"],
    message: "Importação parcial.",
  });

  try {
    await importProduct(IMPORT_URL, "chave-123");
    assert.equal(mock.calls.length, 1);
    const { input, init } = mock.calls[0];
    assert.equal(input, "/api/products/import");
    assert.equal(init?.method, "POST");
    assert.equal((init?.body as string), JSON.stringify({ url: IMPORT_URL }));
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["Idempotency-Key"], "chave-123");
  } finally {
    mock.restore();
  }
});

test("candidato completo é reduzido ao contrato público, sem seller/brand/variants/payload bruto", { skip: !URL_IMPORT_ENABLED && "importação por URL desativada" }, async () => {
  const mock = mockFetch({
    candidate: {
      name: "Escova Alisadora",
      description: "Alisa em minutos",
      category: "Beleza e cuidados pessoais",
      price: "89.90",
      priceCurrency: "R$",
      features: ["Cerdas macias", "Cabo leve"],
      imageRefs: ["https://img.example/1.jpg", "https://img.example/2.jpg"],
      sourceUrl: IMPORT_URL,
      discountType: "PERCENTAGE",
      discountValue: "15",
      gaps: [],
      signals: { salesCount: 1234, ratingValue: 4.8, reviewCount: 56 },
      seller: "Loja X",
      brand: "Marca Y",
      variants: ["Preto", "Branco"],
      rawPayload: { authorization: "Bearer segredo" },
    },
    partial: false,
    gaps: [],
    message: "Dados importados.",
    id: "produto-1",
    version: 3,
    replay: true,
  });

  try {
    const result = await importProduct(IMPORT_URL, "chave-123");
    assert.deepEqual(result.candidate, {
      name: "Escova Alisadora",
      description: "Alisa em minutos",
      category: "Beleza e cuidados pessoais",
      price: "89.90",
      priceCurrency: "R$",
      features: ["Cerdas macias", "Cabo leve"],
      // Somente a primeira imagem cruza o contrato do cliente.
      imageRefs: ["https://img.example/1.jpg"],
      sourceUrl: IMPORT_URL,
      discountType: "PERCENTAGE",
      discountValue: "15",
      gaps: [],
      signals: { salesCount: 1234, ratingValue: 4.8, reviewCount: 56 },
    });
    assert.equal(result.partial, false);
    assert.equal(result.message, "Dados importados.");
    // Importação nunca representa Product salvo.
    assert.equal("id" in result, false);
    assert.equal("version" in result, false);
    assert.equal("replay" in result, false);
    assert.equal("productId" in result, false);
  } finally {
    mock.restore();
  }
});

test("fatos vazios ou nulos ficam ausentes; gaps e sinais inválidos são filtrados", { skip: !URL_IMPORT_ENABLED && "importação por URL desativada" }, async () => {
  const mock = mockFetch({
    candidate: {
      name: "Produto parcial",
      description: "",
      category: null,
      price: null,
      priceCurrency: null,
      features: [],
      imageRefs: [
        "https://img.example/1.jpg",
        "https://img.example/2.jpg",
        "https://img.example/3.jpg",
      ],
      sourceUrl: IMPORT_URL,
      gaps: ["price", "priceCurrency", "seller", "brand", "variants"],
      signals: { salesCount: "12", ratingValue: 4.8, reviewCount: -3 },
    },
    partial: true,
    gaps: ["price", "priceCurrency", "seller"],
    message: "Alguns dados não foram encontrados.",
  });

  try {
    const result = await importProduct(IMPORT_URL, "chave-123");
    assert.equal("price" in result.candidate, false);
    assert.equal("priceCurrency" in result.candidate, false);
    assert.equal("category" in result.candidate, false);
    assert.deepEqual(result.candidate.features, []);
    assert.deepEqual(result.candidate.imageRefs, ["https://img.example/1.jpg"]);
    assert.deepEqual(result.candidate.gaps, ["price", "priceCurrency"]);
    assert.deepEqual(result.gaps, ["price", "priceCurrency"]);
    assert.equal(result.partial, true);
    // Somente números válidos aparecem; texto e negativo são descartados.
    assert.deepEqual(result.candidate.signals, { ratingValue: 4.8 });
  } finally {
    mock.restore();
  }
});

test("zero é sinal válido e sinais nulos ficam ausentes", { skip: !URL_IMPORT_ENABLED && "importação por URL desativada" }, async () => {
  const mock = mockFetch({
    candidate: {
      features: [],
      imageRefs: [],
      sourceUrl: IMPORT_URL,
      gaps: [],
      signals: { salesCount: 0, ratingValue: null, reviewCount: "muitas" },
    },
    partial: false,
    gaps: [],
    message: "ok",
  });

  try {
    const result = await importProduct(IMPORT_URL, "chave-123");
    assert.deepEqual(result.candidate.signals, { salesCount: 0 });
  } finally {
    mock.restore();
  }
});

test("sourceUrl ausente cai na URL consultada e mensagem ausente usa texto padrão", { skip: !URL_IMPORT_ENABLED && "importação por URL desativada" }, async () => {
  const mock = mockFetch({
    candidate: { features: [], imageRefs: [], gaps: [] },
    partial: true,
    gaps: [],
  });

  try {
    const result = await importProduct(IMPORT_URL, "chave-123");
    assert.equal(result.candidate.sourceUrl, IMPORT_URL);
    assert.match(result.message, /Confira os dados importados/);
  } finally {
    mock.restore();
  }
});

test("resposta de erro sanitizada vira ProductApiError sem expor segredo", { skip: !URL_IMPORT_ENABLED && "importação por URL desativada" }, async () => {
  const mock = mockFetch(
    { error: "URL inválida para importação.", code: "INVALID_URL" },
    400,
  );

  try {
    await assert.rejects(
      importProduct(IMPORT_URL, "chave-123"),
      (caught: unknown) => {
        assert.ok(caught instanceof ProductApiError);
        assert.equal(caught.status, 400);
        assert.equal(caught.code, "INVALID_URL");
        assert.equal(caught.message, "URL inválida para importação.");
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("falha de rede preserva dados manuais com erro recuperável", { skip: !URL_IMPORT_ENABLED && "importação por URL desativada" }, async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    await assert.rejects(
      importProduct(IMPORT_URL, "chave-123"),
      (caught: unknown) => {
        assert.ok(caught instanceof ProductApiError);
        assert.equal(caught.status, 0);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});
