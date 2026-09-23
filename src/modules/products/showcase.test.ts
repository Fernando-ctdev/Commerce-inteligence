import { test } from "node:test";
import assert from "node:assert/strict";

import { listShowcaseItems, toShowcaseItem, type ShowcaseItem } from "./showcase";

// Allowlist do DTO da Vitrine (fixture real da nota get-https-api-tikhub-io-ap-2).
const SHOWCASE_KEYS: Record<string, true> = {
  id: true,
  title: true,
  coverUrl: true,
  imageUrls: true,
  priceLabel: true,
  categoryName: true,
  sellerId: true,
  sellerName: true,
  stockCount: true,
  canAdd: true,
  labels: true,
  affiliateInfo: true,
};

function assertAllowlisted(item: ShowcaseItem) {
  for (const key of Object.keys(item)) {
    assert.ok(SHOWCASE_KEYS[key] === true, `chave fora do allowlist: ${key}`);
  }
  assert.equal("description" in item, false, "description nunca cruza o DTO");
}

test("primeiro item preserva os valores exatos do response", () => {
  const items = listShowcaseItems();
  assert.equal(items.length, 20);
  const first = items[0]!;
  assert.equal(first.id, "1734865245975577888");
  assert.equal(first.title, "Vestido Longo Morcego Moda Feminina Indiano");
  assert.equal(first.priceLabel, "R$ 109,99");
  assert.equal(first.sellerName, "malikmodas");
  assert.equal(first.sellerId, "7496183397605083424");
  assert.equal(first.categoryName, "Womenswear & Underwear");
  assert.equal(first.stockCount, 283);
  assert.equal(first.canAdd, true);
  assert.equal(first.affiliateInfo?.commissionRate, 900);
  assert.equal(first.labels?.[0]?.text, "31% off");
  assert.ok(first.coverUrl?.startsWith("https://p"));
  assert.ok((first.imageUrls?.length ?? 0) > 0);
  for (const item of items) assertAllowlisted(item);
});

test("ordem estável e labels ausentes em 3 itens não rejeitam o card", () => {
  const ids = listShowcaseItems().map((item) => item.id);
  assert.deepEqual(ids, listShowcaseItems().map((item) => item.id));
  assert.ok(ids.every((id) => /^\d+$/.test(id)));
  const items = listShowcaseItems();
  assert.equal(items.filter((item) => item.labels).length, 17);
  assert.equal(items.filter((item) => !item.labels).length, 3);
  for (const item of items) assert.ok(item.priceLabel && item.sellerName && item.stockCount !== undefined);
});

test("allowlist descarta credenciais, metadata operacional e campos não suportados", () => {
  const item = toShowcaseItem({
    product_id: "1734865245975577888",
    title: "Produto Exemplo",
    format_available_price: "R$ 109,99",
    seller_info: { seller_id: "7496183397605083424", shop_name: "malikmodas" },
    stock_num: 283,
    can_added: true,
    category_info: { name: "Womenswear & Underwear" },
    affiliate_info: {
      est_commission_expense: "R$ 9,90",
      commission_with_currency: "R$ 9,90",
      commission_rate: 900,
      commission_expense: 9.9,
      commission_view_type: 0,
    },
    cover: { url_list: ["https://p16-oec-sg.ibyteimg.com/a.jpeg?dr=15584"] },
    images: [{ url_list: ["https://p19-oec-sg.ibyteimg.com/b.jpeg"] }],
    // chaves que nunca cruzam: credenciais, cache assinado, metadata, status internos
    cookie: "sintetico",
    cache_url: "https://cdn.example.invalid/cache?sign=sintetico",
    request_id: "sintetico",
    source: "sintetico",
    stock_status: "sintetico",
    review_status: "sintetico",
    is_hide: false,
    platform: "sintetico",
    description: "descrição remota não vira fato do creator",
  });
  assert.ok(item !== null, "item válido não pode ser rejeitado");
  assertAllowlisted(item);
  assert.equal(item.coverUrl, "https://p16-oec-sg.ibyteimg.com/a.jpeg?dr=15584");
  assert.deepEqual(item.imageUrls, ["https://p19-oec-sg.ibyteimg.com/b.jpeg"]);
});

test("item sem id/título é rejeitado; URL não https fica ausente", () => {
  const partial = toShowcaseItem({ product_id: "42", title: "Só o essencial" });
  assert.deepEqual(partial, { id: "42", title: "Só o essencial" });
  assert.equal(toShowcaseItem({ title: "sem id" }), null);
  assert.equal(toShowcaseItem(null), null);
  const insecure = toShowcaseItem({
    product_id: "43",
    title: "Capa insegura",
    cover: { url_list: ["http://p16-oec-sg.ibyteimg.com/c.jpeg"] },
  });
  assert.ok(insecure !== null, "item só com capa insegura não pode ser rejeitado");
  assert.equal(insecure.coverUrl, undefined);
});
