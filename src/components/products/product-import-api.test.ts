import assert from "node:assert/strict";
import test from "node:test";

import { confirmProductImport, getProductImport } from "./product-import-api";

test("normaliza ImportView server-side e confirma no contrato Product", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });
    const body = requests.length === 1
      ? {
          id: "attempt-1",
          status: "ready",
          uiState: "READY",
          sourceUrl: "https://shop.tiktok.com/item/1",
          candidate: {
            id: "candidate-1",
            version: 7,
            facts: {
              name: "Produto",
              description: "Descrição",
              priceCents: 1050,
              priceCurrency: "BRL",
              features: ["Leve"],
              imageRefs: ["https://cdn.tiktokcdn.com/image.jpg"],
              variants: null,
              sourceUrl: "https://shop.tiktok.com/item/1",
            },
            gaps: ["category"],
          },
        }
      : { id: "product-1", version: 1 };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const record = await getProductImport("attempt-1");
    assert.equal(record.state, "READY");
    assert.equal(record.version, 7);
    assert.equal(record.candidate?.name, "Produto");
    assert.equal(record.candidate?.price?.amount, 10.5);
    assert.deepEqual(record.candidate?.images, ["https://cdn.tiktokcdn.com/image.jpg"]);

    const result = await confirmProductImport(record.id, record.version, record.candidate!);
    assert.equal(result.productId, "product-1");
    assert.equal(String(requests[1].input), "/api/products/confirm");
    const sent = JSON.parse(String(requests[1].init?.body)) as Record<string, unknown>;
    assert.equal(sent.attemptId, "attempt-1");
    assert.equal(sent.expectedCandidateVersion, 7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
