import assert from "node:assert/strict";
import test from "node:test";
import { ConfigError, loadMode } from "./config.js";

test("IMPORT_MODE aceita poc e durable", () => {
  assert.equal(loadMode({ IMPORT_MODE: "poc" }), "poc");
  assert.equal(loadMode({ IMPORT_MODE: "durable" }), "durable");
});

test("IMPORT_MODE ausente/inválido falha com mensagem clara (fail-closed)", () => {
  assert.throws(() => loadMode({}), ConfigError);
  assert.throws(() => loadMode({ IMPORT_MODE: "sync" }), ConfigError);
});
