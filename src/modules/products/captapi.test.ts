import assert from "node:assert/strict";
import test from "node:test";
import { CaptApiImportError, fetchCaptApiProduct, validateTikTokShopUrl } from "./captapi";

const productUrl = "https://shop.tiktok.com/br/pdp/produto/1735872517465343013?source=feed";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("valida somente URLs públicas de produto sem credenciais embutidas", () => {
  assert.equal(validateTikTokShopUrl(productUrl).hostname, "shop.tiktok.com");
  assert.equal(validateTikTokShopUrl("https://www.tiktok.com/br/pdp/produto/1735872517465343013").hostname, "www.tiktok.com");
  const officialViewUrl = validateTikTokShopUrl("https://shop.tiktok.com/view/product/1735872517465343013?source=feed");
  assert.equal(officialViewUrl.pathname, "/view/product/1735872517465343013");
  assert.equal(officialViewUrl.search, "?source=feed");
  for (const invalid of [
    "https://shop.tiktok.com/",
    "https://shop.tiktok.com/br/category/1735872517465343013",
    "https://shop.tiktok.com/account/pdp/falso/123",
    "https://shop.tiktok.com/arbitrary/pdp/falso/123",
    "https://www.tiktok.com/video/1735872517465343013",
    "https://user:pass@shop.tiktok.com/br/pdp/produto/1735872517465343013",
    "https://attacker.example/br/pdp/produto/1735872517465343013",
  ]) {
    assert.throws(() => validateTikTokShopUrl(invalid), { code: "IMPORT-URL-INVALID" });
  }
});

test("mapeia produto BR da CaptAPI sem expor segredo e envia região", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  let requested: URL | undefined;
  let authorization = "";
  try {
    const product = await fetchCaptApiProduct(productUrl, async (input, init) => {
      requested = new URL(input.toString());
      authorization = String(init?.headers && new Headers(init.headers).get("authorization"));
      return response({ success: true, data: { title: "Tripé", description: "Tripé retrátil", price: 39.9, currency: "BRL", url: productUrl, categories: [{ name: "Eletrônicos" }], saleProperties: [{ values: [{ name: "Preto" }] }], images: ["https://cdn.example/image.jpg"], discount: "10%" } });
    });
    assert.equal(requested?.searchParams.get("region"), "BR");
    assert.equal(requested?.searchParams.get("url"), productUrl);
    assert.equal(authorization, "Bearer configured");
    assert.deepEqual(product, { name: "Tripé", description: "Tripé retrátil", category: "Eletrônicos", features: ["Preto", "Eletrônicos"], price: "39.9", priceCurrency: "R$", imageRefs: ["https://cdn.example/image.jpg"], sourceUrl: productUrl, gaps: [], discountType: "PERCENTAGE", discountValue: "10" });
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});

test("falhas da CaptAPI são recuperáveis e não fazem nova tentativa escondida", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  try {
    await assert.rejects(() => fetchCaptApiProduct("https://example.com/pdp/1", async () => response({})), { code: "IMPORT-URL-INVALID" });
    const partial = await fetchCaptApiProduct(productUrl, async () => response({ success: true, data: { title: "Sem preço", images: Array.from({ length: 8 }, (_, index) => `https://cdn.example/image-${index}.jpg`), salesCount: 120, ratingValue: 4.8, reviewCount: 33, seller: "Não deve sair", variants: [{ name: "não deve sair" }] } }));
    assert.equal(partial.name, "Sem preço");
    assert.equal(partial.price, undefined);
    assert.deepEqual(partial.imageRefs, ["https://cdn.example/image-0.jpg"]);
    assert.ok(partial.gaps.includes("price"));
    assert.deepEqual(partial.signals, { salesCount: 120, ratingValue: 4.8, reviewCount: 33 });
    assert.equal("seller" in partial, false);
    assert.equal("variants" in partial, false);
    await assert.rejects(() => fetchCaptApiProduct(productUrl, async () => response({ success: true })), { code: "IMPORT-SHAPE-INCOMPLETE" });
    await assert.rejects(() => fetchCaptApiProduct(productUrl, async () => response({ success: true, data: { title: "Produto", description: "Descrição", price: 10, currency: "BRL", categories: [{ name: "Categoria" }], discount: "101%" } })), { code: "IMPORT-SHAPE-INCOMPLETE" });
    await assert.rejects(() => fetchCaptApiProduct(productUrl, async () => ({ ok: true, body: null, text: async () => { throw new Error("text() must not be called"); } } as unknown as Response)), { code: "IMPORT-JSON-INVALID" });
    await assert.rejects(() => fetchCaptApiProduct(productUrl, async () => response({}, 503)), { code: "IMPORT-PROVIDER-ERROR" });
    await assert.rejects(() => fetchCaptApiProduct(productUrl, async () => { throw new Error("offline"); }), { code: "IMPORT-NETWORK" });
    await assert.rejects(() => fetchCaptApiProduct("https://www.tiktok.com/video/1", async () => response({})), { code: "IMPORT-URL-INVALID" });
    await assert.rejects(() => fetchCaptApiProduct(productUrl, async () => response("x".repeat(1_000_001))), { code: "IMPORT-RESPONSE-TOO-LARGE" });
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});
