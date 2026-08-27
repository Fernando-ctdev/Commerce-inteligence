// Testes comportamentais de validação/normalização (node:test, sem banco).
import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidPublicHttpUrlString,
  parseBrlToCents,
  payloadHash,
  validateIdempotencyKey,
  validateProductInput,
} from "./validation.js";

test("nome e descrição obrigatórios com limites", () => {
  const missing = validateProductInput({ name: "  ", description: "ok" });
  assert.ok("errors" in missing && missing.errors.name);
  const tooLong = validateProductInput({ name: "a".repeat(201), description: "ok" });
  assert.ok("errors" in tooLong && tooLong.errors.name);
  const ok = validateProductInput({ name: " Serum Vitamina C ", description: "Sérum facial" });
  assert.ok("input" in ok && ok.input.name === "Serum Vitamina C");
});

test("normalização NFC, trim e ausentes como null", () => {
  const r = validateProductInput({ name: "çãó", description: "d", category: "  ", notes: "  x  " });
  assert.ok("input" in r);
  // NFC compõe marcas combinantes; nunca descarta diacríticos (preserva fatos e hash de idempotência)
  assert.equal(r.input.name, "çãó".normalize("NFC")); // e7 e3 f3
  assert.equal([...r.input.name].length, 3);
  assert.equal(r.input.category, null);
  assert.equal(r.input.notes, "x");
});

test("BRL em centavos: string pt-BR, número e rejeições", () => {
  assert.equal(parseBrlToCents("1.234,56"), 123456);
  assert.equal(parseBrlToCents("0,00"), 0);
  assert.equal(parseBrlToCents(49.9), 4990);
  assert.equal(parseBrlToCents("99.999.999,99"), 9999999999);
  assert.equal(parseBrlToCents("-1"), null);
  assert.equal(parseBrlToCents("1,234"), null); // 3 casas → sem arredondamento silencioso
  assert.equal(parseBrlToCents("1,2,3"), null);
  assert.equal(parseBrlToCents("abc"), null);
  assert.equal(parseBrlToCents(NaN), null);
  assert.equal(parseBrlToCents(Infinity), null);
  assert.equal(parseBrlToCents(1.005), null); // número com >2 casas
  assert.equal(parseBrlToCents("100.000.000,00"), null); // acima do teto
});

test("preço inválido gera fieldError e não persiste forma parcial", () => {
  const r = validateProductInput({ name: "n", description: "d", price: "1,234" });
  assert.ok("errors" in r && r.errors.price);
});

test("URL: esquema, tamanho e credenciais", () => {
  assert.ok(isValidPublicHttpUrlString("https://exemplo.com/p"));
  assert.ok(isValidPublicHttpUrlString("http://exemplo.com"));
  assert.ok(!isValidPublicHttpUrlString("ftp://exemplo.com"));
  assert.ok(!isValidPublicHttpUrlString("https://user:senha@exemplo.com"));
  assert.ok(!isValidPublicHttpUrlString(`https://exemplo.com/${"a".repeat(2100)}`));
  assert.ok(!isValidPublicHttpUrlString("notaurl"));
});

test("listas: limites de itens e tamanhos", () => {
  const many = validateProductInput({ name: "n", description: "d", features: Array.from({ length: 21 }, () => "x") });
  assert.ok("errors" in many && many.errors.features);
  const longItem = validateProductInput({ name: "n", description: "d", features: ["x".repeat(301)] });
  assert.ok("errors" in longItem && longItem.errors.features);
  const badImage = validateProductInput({ name: "n", description: "d", imageRefs: ["ftp://x.com/a"] });
  assert.ok("errors" in badImage && badImage.errors.imageRefs);
});

test("chave de idempotência: charset base64url e 22–128", () => {
  assert.ok(validateIdempotencyKey("abc123-_ABC123xyz789xyz"));
  assert.equal(validateIdempotencyKey("curta"), null);
  assert.equal(validateIdempotencyKey("a".repeat(129)), null);
  assert.equal(validateIdempotencyKey("espaços no meio da chave=="), null);
  assert.equal(validateIdempotencyKey(null), null);
});

test("PATCH parcial: campos ausentes ok, mas name/description presentes vazios são rejeitados", () => {
  const absent = validateProductInput({ description: "d" }, true); // name ausente → ok
  assert.ok("input" in absent && absent.input.name === "");

  for (const bad of ["", "   ", null]) {
    const r = validateProductInput({ name: bad, description: "d" }, true);
    assert.ok("errors" in r && r.errors.name, `name=${JSON.stringify(bad)} deve gerar erro`);
  }
  const emptyDesc = validateProductInput({ name: "n", description: "" }, true);
  assert.ok("errors" in emptyDesc && emptyDesc.errors.description);

  const factual = validateProductInput({ brand: "Marca", seller: "Vendedor", variants: ["Azul"], priceCurrency: "usd" }, true);
  assert.ok("input" in factual && factual.input.brand === "Marca" && factual.input.priceCurrency === "USD");
});

test("hash de payload: estável, sensível a conteúdo e cego a formato de preço", () => {
  const a = validateProductInput({ name: "n", description: "d", price: "10,00" });
  const b = validateProductInput({ name: "n", description: "d", price: 10 });
  const c = validateProductInput({ name: "n", description: "d", price: 10.5 });
  assert.ok("input" in a && "input" in b && "input" in c);
  assert.equal(payloadHash(a.input), payloadHash(b.input)); // mesma forma normalizada
  assert.notEqual(payloadHash(a.input), payloadHash(c.input));
  assert.notEqual(payloadHash(a.input), payloadHash({ ...b.input!, name: "outro" }));
});
