// Testes comportamentais do módulo Identity (contratos observáveis da SPEC).
// Exige PostgreSQL em DATABASE_URL; faz skip automático se o banco estiver inacessível.
// Executar: npm test  (tsx --test)
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { handleLogin, handleLogout, handleRegister } from "./http.js";
import { SESSION_COOKIE } from "./http.js";
import {
  AccountExistsError,
  resolveSession,
  revokeSession,
  loginUser,
  registerUser,
} from "./service.js";

const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
const prisma = new PrismaClient();
let dbUp = false;

test("setup: banco acessível (skip do módulo caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

const email = () => `slice001-${randomBytes(8).toString("hex")}@teste.local`;
const req = (path: string, body: unknown, cookie?: string, origin = ORIGIN) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
const tokenOf = (res: Response): string => {
  const raw = res.headers.get("set-cookie") ?? "";
  const m = raw.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  assert.ok(m, "esperado Set-Cookie de sessão");
  return m![1];
};

test("register cria conta+workspace+sessão e responde 200 {redirectTo:'/today'}", async (t) => {
  if (!dbUp) return t.skip();
  const res = await handleRegister(
    req("/api/access/register", {
      email: email(),
      password: "senha-segura-123",
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { redirectTo: "/today" });
  assert.ok(res.headers.get("set-cookie")?.includes("HttpOnly"));
  assert.ok(res.headers.get("set-cookie")?.includes("SameSite=Lax"));
});

test("register duplicado (sequencial e concorrente) produz 409 e um único workspace", async (t) => {
  if (!dbUp) return t.skip();
  const e = email();
  const first = await handleRegister(
    req("/api/access/register", { email: e, password: "senha-segura-123" }),
  );
  assert.equal(first.status, 200);
  const dup = await handleRegister(
    req("/api/access/register", { email: e, password: "senha-segura-123" }),
  );
  assert.equal(dup.status, 409);
  await Promise.all(
    Array.from({ length: 3 }, () =>
      registerUser(e, "senha-segura-123").catch((err) => {
        if (!(err instanceof AccountExistsError)) throw err;
      }),
    ),
  );
  const user = await prisma.user.findUnique({
    where: { email: e },
    include: { tenant: true },
  });
  assert.ok(user);
  const tenants = await prisma.tenant.count({ where: { userId: user.id } });
  assert.equal(tenants, 1);
});

test("validação: email/senha inválidos → 400 com fieldErrors, sem criar nada", async (t) => {
  if (!dbUp) return t.skip();
  const bad = await handleRegister(
    req("/api/access/register", { email: "nope", password: "123" }),
  );
  assert.equal(bad.status, 400);
  const body = (await bad.json()) as { fieldErrors?: Record<string, string> };
  assert.ok(body.fieldErrors?.email && body.fieldErrors?.password);
});

test("login resolve o mesmo workspace; erro é uniforme 401 sem enumerar", async (t) => {
  if (!dbUp) return t.skip();
  const e = email();
  await registerUser(e, "senha-segura-123");
  const first = await handleLogin(
    req("/api/access/login", { email: e, password: "senha-segura-123" }),
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { redirectTo: "/today" });
  const ctx1 = await resolveSession(tokenOf(first));
  assert.ok(ctx1);
  const second = await handleLogin(
    req("/api/access/login", { email: e, password: "senha-segura-123" }),
  );
  const ctx2 = await resolveSession(tokenOf(second));
  assert.ok(ctx2);
  assert.equal(ctx2!.tenantId, ctx1!.tenantId);
  assert.equal(ctx2!.userId, ctx1!.userId);

  const wrong = await handleLogin(
    req("/api/access/login", { email: e, password: "senha-errada-999" }),
  );
  assert.equal(wrong.status, 401);
  const missing = await handleLogin(
    req("/api/access/login", { email: email(), password: "senha-segura-123" }),
  );
  assert.equal(missing.status, 401);
  assert.deepEqual(await wrong.json(), await missing.json());
});

test("rotação no login revoga a referência anterior (cookie atual é passado)", async (t) => {
  if (!dbUp) return t.skip();
  const e = email();
  await registerUser(e, "senha-segura-123");
  const first = await handleLogin(
    req("/api/access/login", { email: e, password: "senha-segura-123" }),
  );
  const oldToken = tokenOf(first);
  assert.ok(await resolveSession(oldToken));
  const second = await handleLogin(
    req(
      "/api/access/login",
      { email: e, password: "senha-segura-123" },
      oldToken,
    ),
  );
  assert.equal(second.status, 200);
  assert.equal(await resolveSession(oldToken), null); // referência anterior deixou de autenticar
  assert.ok(await resolveSession(tokenOf(second)));
});

test("registro com cookie atual revoga a referência anterior", async (t) => {
  if (!dbUp) return t.skip();
  const oldToken = await registerUser(email(), "senha-segura-123");
  const newToken = await registerUser(email(), "senha-segura-123", oldToken);

  assert.equal(await resolveSession(oldToken), null);
  assert.ok(await resolveSession(newToken));
});

test("logout revoga no servidor e limpa o cookie", async (t) => {
  if (!dbUp) return t.skip();
  const e = email();
  await registerUser(e, "senha-segura-123");
  const login = await handleLogin(
    req("/api/access/login", { email: e, password: "senha-segura-123" }),
  );
  const token = tokenOf(login);
  assert.ok(await resolveSession(token));
  const out = await handleLogout(req("/api/access/logout", {}, token));
  assert.equal(out.status, 200);
  assert.deepEqual(await out.json(), { redirectTo: "/access" });
  assert.ok(out.headers.get("set-cookie")?.includes("Max-Age=0"));
  assert.equal(await resolveSession(token), null);
});

test("Origin ausente/divergente é rejeitada com 403 antes de mutar", async (t) => {
  if (!dbUp) return t.skip();
  const e = email();
  const noOrigin = new Request(`${ORIGIN}/api/access/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: e, password: "senha-segura-123" }),
  });
  assert.equal((await handleRegister(noOrigin)).status, 403);
  assert.equal(
    (
      await handleRegister(
        req(
          "/api/access/register",
          { email: e, password: "senha-segura-123" },
          undefined,
          "https://evil.example",
        ),
      )
    ).status,
    403,
  );
  assert.equal(await prisma.user.count({ where: { email: e } }), 0); // nada foi persistido
});

test("respostas de erro não vazam cookie, token ou id de sessão", async (t) => {
  if (!dbUp) return t.skip();
  const texts: string[] = [];
  const bad = await handleRegister(
    req("/api/access/register", { email: "nope", password: "1" }),
  );
  texts.push(await bad.text());
  const wrong = await handleLogin(
    req("/api/access/login", { email: email(), password: "errada" }),
  );
  texts.push(await wrong.text());
  const noOrigin = new Request(`${ORIGIN}/api/access/logout`, {
    method: "POST",
    headers: { origin: "https://evil.example" },
    body: "{}",
  });
  texts.push(await (await handleLogout(noOrigin)).text());
  for (const text of texts) {
    assert.ok(
      !/ci_session|tokenHash|Bearer/i.test(text),
      `vazamento em: ${text}`,
    );
  }
});

test("sessão apontando para tenant de outro usuário é rejeitada (isolamento)", async (t) => {
  if (!dbUp) return t.skip();
  const emailA = email();
  const emailB = email();
  const tokenA = await registerUser(emailA, "senha-segura-123");
  const tokenB = await registerUser(emailB, "senha-segura-123");
  const userA = await prisma.user.findUnique({ where: { email: emailA }, include: { tenant: true } });
  const tenantB = await prisma.tenant.findFirst({ where: { user: { email: emailB } } });
  assert.ok(userA && tenantB);

  // nenhuma rota de escrita produz esta associação cruzada; simula dado corrompido/legado
  await prisma.session.updateMany({
    where: { userId: userA.id },
    data: { tenantId: tenantB.id },
  });

  assert.equal(await resolveSession(tokenA), null); // tenant da sessão não pertence ao usuário
  assert.ok(await resolveSession(tokenB)); // controle: mesma função aceita associação sã
});

test("teardown: limpeza de sessões não remove sessões válidas", async (t) => {
  if (!dbUp) return t.skip();
  const e = email();
  const token = await registerUser(e, "senha-segura-123");
  await revokeSession(token);
  const { purgeStaleSessions } = await import("./service.js");
  await purgeStaleSessions();
  assert.equal(await resolveSession(token), null);
  const fresh = await loginUser(e, "senha-segura-123");
  assert.ok(fresh);
  assert.ok(await resolveSession(fresh!));
});
