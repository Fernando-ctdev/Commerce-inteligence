import { test } from "node:test";
import assert from "node:assert/strict";

import { loadPublishedContents } from "./published-contents-api";
import { ProductApiError } from "../../shared/product-api";

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

function mockFetch(
  body: unknown,
  status = 200,
  behavior: "respond" | "reject" = "respond",
) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    if (behavior === "reject") throw new TypeError("Falha de rede");
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

function linkedContentsPage() {
  return {
    productId: "prod/1",
    externalProductId: "1736673359055521380",
    videos: [
      {
        itemId: "7685499159243230472",
        productIds: ["1736673359055521380"],
        business: { productTitle: "Conjunto Batinha" },
        metrics: { views: 1200 },
      },
    ],
    page: 2,
    pageSize: 10,
    total: 11,
    hasMore: true,
  };
}

test("carrega página com query e credenciais same-origin", async () => {
  const mock = mockFetch(linkedContentsPage());

  try {
    const result = await loadPublishedContents("prod/1", 2, 10);

    assert.equal(
      mock.calls[0].input,
      "/api/products/prod%2F1/linked-contents?page=2&pageSize=10",
    );
    assert.equal(mock.calls[0].init?.credentials, "same-origin");
    assert.deepEqual(mock.calls[0].init?.headers, {
      Accept: "application/json",
    });
    assert.equal(result.page, 2);
    assert.equal(result.pageSize, 10);
    assert.equal(result.total, 11);
    assert.equal(result.hasMore, true);
    assert.equal(result.videos[0].itemId, "7685499159243230472");
    assert.deepEqual(result.videos[0].metrics, { views: 1200 });
  } finally {
    mock.restore();
  }
});

test("usa página 1 e pageSize 20 quando ausentes", async () => {
  const mock = mockFetch({ ...linkedContentsPage(), page: 1, pageSize: 20 });

  try {
    await loadPublishedContents("prod/1");

    assert.equal(
      mock.calls[0].input,
      "/api/products/prod%2F1/linked-contents?page=1&pageSize=20",
    );
  } finally {
    mock.restore();
  }
});

test("erro não-2xx vira ProductApiError preservando status e code", async () => {
  const mock = mockFetch(
    {
      error: "Produto não encontrado.",
      code: "PRODUCT-NOT-FOUND",
    },
    404,
  );

  try {
    await assert.rejects(
      loadPublishedContents("prod/1", 1, 20),
      (error: unknown) => {
        assert.ok(error instanceof ProductApiError);
        assert.equal(error.status, 404);
        assert.equal(error.code, "PRODUCT-NOT-FOUND");
        assert.equal(error.message, "Produto não encontrado.");
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("falha de rede vira ProductApiError com status zero", async () => {
  const mock = mockFetch(null, 200, "reject");

  try {
    await assert.rejects(
      loadPublishedContents("prod/1", 1, 20),
      (error: unknown) => {
        assert.ok(error instanceof ProductApiError);
        assert.equal(error.status, 0);
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("payload 2xx sem videos é rejeitado em vez de projetado", async () => {
  const mock = mockFetch({ page: 1, pageSize: 20, total: 0, hasMore: false });

  try {
    await assert.rejects(
      loadPublishedContents("prod/1", 1, 20),
      (error: unknown) => {
        assert.ok(error instanceof ProductApiError);
        assert.equal(error.status, 0);
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("payload 2xx sem paginação completa é rejeitado", async () => {
  const mock = mockFetch({
    productId: "prod/1",
    externalProductId: "ext-1",
    videos: [],
    page: 1,
    pageSize: 20,
    total: 0,
  });

  try {
    await assert.rejects(loadPublishedContents("prod/1", 1, 20), ProductApiError);
  } finally {
    mock.restore();
  }
});
