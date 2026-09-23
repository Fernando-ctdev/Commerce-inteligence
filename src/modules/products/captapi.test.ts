import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { setImmediate as setImmediatePromise } from "node:timers/promises";
import { CaptApiImportError, fetchCaptApiProduct, validateTikTokShopUrl } from "./captapi";

const productUrl = "https://shop.tiktok.com/br/pdp/produto/1735872517465343013?source=feed";
const shortUrl = "https://vt.tiktok.com/ZGkLmNpq?_r=1&u=TiktokShop";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("aceita short link vt/vm.tiktok.com com um único segmento não vazio", () => {
  assert.equal(validateTikTokShopUrl(shortUrl).hostname, "vt.tiktok.com");
  assert.equal(validateTikTokShopUrl("https://vm.tiktok.com/ZGkLmNpq").hostname, "vm.tiktok.com");
  assert.equal(validateTikTokShopUrl("https://vt.tiktok.com/ZGkLmNpq").search, "");
  for (const invalid of [
    "https://vt.tiktok.com/",
    "https://vt.tiktok.com",
    "https://vm.tiktok.com/ZGkLmNpq/extra",
    "http://vt.tiktok.com/ZGkLmNpq",
    "https://user:pass@vt.tiktok.com/ZGkLmNpq",
    "https://vt.tiktok.com.evil.example/ZGkLmNpq",
    "https://vt-tiktok.com/ZGkLmNpq",
    "https://www.tiktok.com/ZGkLmNpq",
  ]) {
    assert.throws(() => validateTikTokShopUrl(invalid), { code: "IMPORT-URL-INVALID" });
  }
});

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

type FetchCall = { url: URL; redirect?: string };

function fetchByHost(handlers: Record<string, (url: URL) => Response>, calls: FetchCall[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input.toString());
    calls.push({ url, redirect: init?.redirect });
    const handler = handlers[url.hostname];
    if (!handler) throw new Error(`fetch inesperado: ${url.hostname}${url.pathname}`);
    return handler(url);
  };
}

const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
const finalProductUrl = "https://shop.tiktok.com/br/pdp/produto/1735872517465343013";

test("resolve short link vt/vm server-side e envia somente a URL final à CaptAPI", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  const calls: FetchCall[] = [];
  try {
    const product = await fetchCaptApiProduct("https://vt.tiktok.com/ZGkLmNpq", fetchByHost({
      "vt.tiktok.com": () => redirect("https://vm.tiktok.com/ponte?x=1"),
      "vm.tiktok.com": (url) => url.pathname === "/ponte" ? redirect("/etapa-2", 307) : redirect(finalProductUrl),
      "shop.tiktok.com": () => new Response(null, { status: 200 }),
      "api.captapi.com": () => response({ success: true, data: { title: "Do short link", images: ["https://cdn.example/image.jpg"] } }),
    }, calls));
    assert.equal(calls[0]?.redirect, "manual");
    assert.equal(calls.at(-1)?.redirect, undefined);
    assert.equal(calls.at(-1)?.url.searchParams.get("url"), finalProductUrl);
    assert.equal(calls.at(-1)?.url.searchParams.get("region"), "BR");
    assert.equal(product.sourceUrl, finalProductUrl);
    assert.equal(product.name, "Do short link");
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});

test("redirect para fora do TikTok é rejeitado sem seguir o destino", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  const calls: FetchCall[] = [];
  try {
    await assert.rejects(() => fetchCaptApiProduct("https://vt.tiktok.com/ZGkLmNpq", fetchByHost({
      "vt.tiktok.com": () => redirect("https://attacker.example/pagina"),
    }, calls)), { code: "IMPORT-URL-INVALID" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url.hostname, "vt.tiktok.com");
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});

test("loop de redirects é rejeitado sem repetir hops", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  const calls: FetchCall[] = [];
  try {
    await assert.rejects(() => fetchCaptApiProduct("https://vt.tiktok.com/ZGkLmNpq", fetchByHost({
      "vt.tiktok.com": () => redirect("https://vm.tiktok.com/a"),
      "vm.tiktok.com": () => redirect("https://vt.tiktok.com/ZGkLmNpq"),
    }, calls)), { code: "IMPORT-URL-INVALID" });
    assert.equal(calls.length, 2);
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});

test("cinco redirects resolvem ao produto e o sexto é rejeitado", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  try {
    const calls: FetchCall[] = [];
    const product = await fetchCaptApiProduct("https://vt.tiktok.com/1", fetchByHost({
      "vt.tiktok.com": (url) => Number(url.pathname.slice(1)) === 5 ? redirect(finalProductUrl) : redirect(`https://vm.tiktok.com/${Number(url.pathname.slice(1)) + 1}`),
      "vm.tiktok.com": (url) => redirect(`https://vt.tiktok.com/${Number(url.pathname.slice(1)) + 1}`),
      "shop.tiktok.com": () => new Response(null, { status: 200 }),
      "api.captapi.com": () => response({ success: true, data: { title: "Cinco hops", images: ["https://cdn.example/image.jpg"] } }),
    }, calls));
    assert.equal(product.sourceUrl, finalProductUrl);
    assert.equal(calls.filter((call) => call.redirect === "manual").length, 6);
    const overflow: FetchCall[] = [];
    await assert.rejects(() => fetchCaptApiProduct("https://vt.tiktok.com/1", fetchByHost({
      "vt.tiktok.com": (url) => redirect(`https://vm.tiktok.com/${Number(url.pathname.slice(1)) + 1}`),
      "vm.tiktok.com": (url) => redirect(`https://vt.tiktok.com/${Number(url.pathname.slice(1)) + 1}`),
    }, overflow)), { code: "IMPORT-URL-INVALID" });
    assert.equal(overflow.length, 6);
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});

test("short link que termina em resposta sem produto é rejeitado", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  const calls: FetchCall[] = [];
  try {
    await assert.rejects(() => fetchCaptApiProduct("https://vt.tiktok.com/ZGkLmNpq", fetchByHost({
      "vt.tiktok.com": () => new Response(null, { status: 200 }),
    }, calls)), { code: "IMPORT-URL-INVALID" });
    assert.equal(calls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});

test("URL completa de produto não passa por resolução", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  const calls: FetchCall[] = [];
  try {
    const product = await fetchCaptApiProduct(productUrl, fetchByHost({
      "api.captapi.com": () => response({ success: true, data: { title: "Direto", images: ["https://cdn.example/image.jpg"] } }),
    }, calls));
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url.hostname, "api.captapi.com");
    assert.equal(calls[0]?.redirect, undefined);
    assert.equal(calls[0]?.url.searchParams.get("url"), productUrl);
    assert.equal(product.sourceUrl, productUrl);
  } finally {
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});

test("timeout do provedor aborta em 60s com erro sanitizado", async () => {
  const previous = process.env.CAPTAPI_API_KEY;
  process.env.CAPTAPI_API_KEY = "configured";
  try {
    mock.timers.enable({ apis: ["setTimeout"] });
    let settled = false;
    const pending = fetchCaptApiProduct(productUrl, (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortError = new Error("This operation was aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      }),
    );
    const tracked = pending.then(() => { settled = true; }, () => { settled = true; });
    mock.timers.tick(59_999);
    await setImmediatePromise();
    assert.equal(settled, false);
    mock.timers.tick(1);
    await assert.rejects(pending, (error: Error) => (error as CaptApiImportError).code === "IMPORT-TIMEOUT");
    await tracked;
  } finally {
    mock.timers.reset();
    if (previous === undefined) delete process.env.CAPTAPI_API_KEY; else process.env.CAPTAPI_API_KEY = previous;
  }
});
