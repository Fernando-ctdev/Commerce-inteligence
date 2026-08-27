// Smoke autenticado do Slice 002 (PLAN §Smoke final mínimo) — runner reproduzível.
// Pré-requisitos: aplicação rodando (APP_ORIGIN, default http://localhost:3000), DATABASE_URL
// e ENTITLEMENT_ACTIVE_PRODUCTS configurados no servidor.
// Uso: npm run smoke:product
const BASE = process.env.APP_ORIGIN ?? "http://localhost:3000";
const ORIGIN = BASE;
const key = () => crypto.randomUUID().replace(/-/g, "").slice(0, 22); // base64url-ish, 22 chars
let failures = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}`, detail ?? "");
  }
}

async function register(): Promise<string> {
  const email = `smoke-${crypto.randomUUID()}@teste.local`;
  const res = await fetch(`${BASE}/api/access/register`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: "senha-segura-123" }),
  });
  if (res.status !== 200) throw new Error(`register falhou: ${res.status}`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return cookie;
}

async function api(cookie: string, path: string, method: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, cookie, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const creds = { name: "Sérum Vitamina C", description: "Sérum facial 30ml para rotina noturna" };

// 1. criação com chave de idempotência
const cookieA = await register();
const idem = key();
const created = await api(cookieA, "/api/products", "POST", { ...creds, price: "1.234,56" }, { "idempotency-key": idem });
check("1. criar Product → 201 + id", created.status === 201, created.status);
const createdBody = (await created.json()) as { id: string; version: number };
check("1b. versão inicial 1", createdBody.version === 1);

// 2. replay com mesma chave+payload → mesmo id; payload diferente → 409
const replay = await api(cookieA, "/api/products", "POST", { ...creds, price: "1.234,56" }, { "idempotency-key": idem });
const replayBody = (await replay.json()) as { id: string; replay?: boolean };
check("2. replay mesma chave/payload → mesmo id", replay.status === 200 && replayBody.id === createdBody.id && replayBody.replay === true, { status: replay.status, body: replayBody });
const conflict = await api(cookieA, "/api/products", "POST", { ...creds, name: "Outro" }, { "idempotency-key": idem });
check("2b. mesma chave com payload diferente → 409", conflict.status === 409, conflict.status);

// 3. chave inválida → 400 antes de persistir
const badKey = await api(cookieA, "/api/products", "POST", creds, { "idempotency-key": "curta" });
check("3. chave inválida → 400", badKey.status === 400, badKey.status);

// 4. leitura + fatos estendidos + conflito de versão
const before = await api(cookieA, `/api/products/${createdBody.id}`, "GET");
const beforeBody = (await before.json()) as { readyForStrategy: boolean; version: number; priceCents: number };
check("4. GET retorna produto do Tenant com BRL em centavos", before.status === 200 && beforeBody.priceCents === 123456, beforeBody);
const patched = await api(cookieA, `/api/products/${createdBody.id}`, "PATCH", {
  expectedVersion: 1,
  brand: "Marca smoke",
  seller: "Vendedor smoke",
  variants: ["30ml"],
});
const patchedBody = (await patched.json()) as { version: number; readyForStrategy: boolean };
check("4b. PATCH fatos estendidos → Product pronto para Strategy", patched.status === 200 && patchedBody.readyForStrategy === true, patchedBody);
const stale = await api(cookieA, `/api/products/${createdBody.id}`, "PATCH", { expectedVersion: 1, name: "Obsoleta" });
check("4c. versão obsoleta → 409", stale.status === 409, stale.status);

// 5. isolamento cross-tenant: usuário B não lê nem altera
const cookieB = await register();
const crossRead = await api(cookieB, `/api/products/${createdBody.id}`, "GET");
check("5. cross-tenant GET → 404 uniforme", crossRead.status === 404, crossRead.status);
const crossPatch = await api(cookieB, `/api/products/${createdBody.id}`, "PATCH", { expectedVersion: 2, name: "hack" });
check("5b. cross-tenant PATCH → 404 uniforme", crossPatch.status === 404, crossPatch.status);

// 6. fallback manual preserva URL sem iniciar enrichment
const withUrl = await api(cookieA, "/api/products", "POST", { ...creds, name: "Produto com URL", url: "https://invalido.inexistente.example/produto" }, { "idempotency-key": key() });
check("6. criar com URL → 201 (fallback manual não espera Browser Service)", withUrl.status === 201, withUrl.status);
const withUrlBody = (await withUrl.json()) as { id: string };
const manual = await api(cookieA, `/api/products/${withUrlBody.id}`, "GET");
check("6b. fatos manuais preservados", manual.status === 200);

// 7. Origin ausente/divergente rejeitada antes de mutar
const noOrigin = await fetch(`${BASE}/api/products`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookieA, "idempotency-key": key() },
  body: JSON.stringify({ ...creds, name: "Sem origem" }),
});
check("7. Origin ausente → 403", noOrigin.status === 403, noOrigin.status);
const evil = await fetch(`${BASE}/api/products`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://evil.example", cookie: cookieA, "idempotency-key": key() },
  body: JSON.stringify({ ...creds, name: "Origem estranha" }),
});
check("7b. Origin divergente → 403", evil.status === 403, evil.status);

// 8. sessão inválida → 401 sem revelar dados
const anon = await fetch(`${BASE}/api/products/${createdBody.id}`, { headers: { origin: ORIGIN } });
check("8. sem sessão → 401", anon.status === 401, anon.status);

console.log(failures === 0 ? "\nSMOKE: todos os oráculos satisfeitos ✓" : `\nSMOKE: ${failures} falha(s) ✗`);
process.exit(failures === 0 ? 0 : 1);
