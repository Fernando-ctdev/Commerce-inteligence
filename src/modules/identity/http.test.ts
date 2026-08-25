import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_ORIGIN = "http://localhost:3000";

const { handleLogout, handleRegister } = require("./http") as typeof import("./http");

test("register rejects a mutation from a missing or foreign origin before persistence", async () => {
  const response = await handleRegister(
    new Request("http://localhost:3000/api/access/register", {
      body: JSON.stringify({ email: "creator@example.com", password: "senha-segura" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Origem não permitida." });
});

test("register returns field errors without creating state for invalid input", async () => {
  const response = await handleRegister(
    new Request("http://localhost:3000/api/access/register", {
      body: JSON.stringify({ email: "invalido", password: "curta" }),
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      method: "POST",
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Dados inválidos.",
    fieldErrors: {
      email: "Informe um e-mail válido.",
      password: "A senha deve ter entre 8 e 200 caracteres.",
    },
  });
});

test("logout clears the cookie even when no session was sent", async () => {
  const response = await handleLogout(
    new Request("http://localhost:3000/api/access/logout", {
      headers: { origin: "http://localhost:3000" },
      method: "POST",
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { redirectTo: "/access" });
  assert.match(response.headers.get("set-cookie") ?? "", /ci_session=;.*Max-Age=0/);
});
