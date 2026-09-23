// Testes comportamentais da credencial (node:test, sem banco).
import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("hash e verify completam o ciclo com a senha correta", async () => {
  const stored = await hashPassword("senha-segura-123");
  assert.ok(stored.startsWith("scrypt$"));
  assert.equal(await verifyPassword("senha-segura-123", stored), true);
});

test("senha errada falha", async () => {
  const stored = await hashPassword("senha-segura-123");
  assert.equal(await verifyPassword("errada", stored), false);
});

test("formato corrompido falha fechado", async () => {
  assert.equal(await verifyPassword("x", "lixo"), false);
  assert.equal(await verifyPassword("x", "scrypt$incompleto"), false);
});

test("parametros absurdos no registro falham fechado sem lançar", async () => {
  const absurd = `scrypt$999999999$8$1$${"00".repeat(16)}$${"00".repeat(64)}`;
  assert.equal(await verifyPassword("x", absurd), false);
});

test("salts distintos produzem hashes distintos", async () => {
  const a = await hashPassword("mesma-senha");
  const b = await hashPassword("mesma-senha");
  assert.notEqual(a, b);
});
