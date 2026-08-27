import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeSourceUrl, validateImportUrl } from "./url.js";

test("validateImportUrl aceita somente HTTPS TikTok Shop permitido", () => {
  assert.equal(validateImportUrl("https://shop.tiktok.com/item/123?utm_source=x"), "https://shop.tiktok.com/item/123?utm_source=x");
  assert.equal(validateImportUrl("http://shop.tiktok.com/item/123"), null);
  assert.equal(validateImportUrl("https://evil.example/item/123"), null);
  assert.equal(validateImportUrl("https://user:pass@shop.tiktok.com/item/123"), null);
});

test("canonicalizeSourceUrl remove query/fragment e normaliza host/path", () => {
  assert.equal(canonicalizeSourceUrl("HTTPS://SHOP.TIKTOK.COM/item/123/?x=1#offer"), "https://shop.tiktok.com/item/123");
  assert.equal(canonicalizeSourceUrl("https://shop.tiktok.com"), null);
});
