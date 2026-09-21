import assert from "node:assert/strict";
import test from "node:test";

process.env.APP_ORIGIN = "http://localhost:3000";

const { handleLogout, handleRegister } = require("./http") as typeof import("./http");

test("register rejects a mutation from a missing or foreign origin before persistence", async () => {
  const response = await handleRegister(
    new Request("http://localhost:3000/api/access/register", {
      body: JSON.stringify({ email: "creator@example.com", password: "Senha123", passwordConfirmation: "Senha123", name: "Creator" }),
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
      body: JSON.stringify({ email: "invalido", password: "curta", passwordConfirmation: "curta", name: "" }),
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      method: "POST",
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Dados inválidos.",
    fieldErrors: {
      email: "Informe um e-mail válido.",
      name: "Informe seu nome.",
      password: "A senha deve ter entre 8 e 200 caracteres, com pelo menos uma letra e um número.",
    },
  });
});

test("register rejects missing name, mismatched confirmation, and weak password", async () => {
  const cases = [
    {
      body: { email: "creator@example.com", password: "Senha123", passwordConfirmation: "Senha123" },
      field: "name",
    },
    {
      body: { email: "creator@example.com", name: "Creator", password: "Senha123", passwordConfirmation: "Senha124" },
      field: "passwordConfirmation",
    },
    {
      body: { email: "creator@example.com", name: "Creator", password: "12345678", passwordConfirmation: "12345678" },
      field: "password",
    },
    {
      body: { email: "creator@example.com", name: "Creator", password: "abcdefgh", passwordConfirmation: "abcdefgh" },
      field: "password",
    },
  ] as const;

  for (const { body, field } of cases) {
    const response = await handleRegister(
      new Request("http://localhost:3000/api/access/register", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        method: "POST",
      }),
    );

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { fieldErrors?: Record<string, string> };
    assert.ok(payload.fieldErrors?.[field]);
  }
});

test("register fails closed with 403 before reading or validating the body in production", async () => {
  // process.env.NODE_ENV é readonly nos tipos; manipulação local via cast (seam de teste).
  const env = process.env as { NODE_ENV?: string };
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    // Body inválido em produção: 403 da policy (não 400) prova curto-circuito
    // antes de leitura/validação/persistência — chamada manual não cria conta.
    const response = await handleRegister(
      new Request("http://localhost:3000/api/access/register", {
        body: JSON.stringify({ email: "invalido", password: "curta", passwordConfirmation: "curta", name: "" }),
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        method: "POST",
      })
    );

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Criação de conta indisponível neste ambiente." });
  } finally {
    env.NODE_ENV = previous;
  }
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
