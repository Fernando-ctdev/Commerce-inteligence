// Handlers HTTP do contrato de acesso (Marechal): POST /api/access/register|login|logout.
// Web-standard Request/Response — app/api/*/route.ts faz apenas `export { handleX as POST } from ...`.
// Sucesso JSON: 200 {redirectTo} + Set-Cookie (303 reservado a submissão HTML, não implementada).
// Toda mutação exige Origin === APP_ORIGIN (fail-closed se APP_ORIGIN não estiver configurado).
import {
  AccountExistsError,
  SESSION_TTL_MS,
  loginUser,
  revokeSession,
  registerUser,
} from "./service";

export const SESSION_COOKIE = "ci_session";

const APP_ORIGINS = new Set((process.env.APP_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const SECURE = process.env.NODE_ENV === "production" ? " Secure;" : "";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function json(
  status: number,
  body: { error: string; code?: string; fieldErrors?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function ok(redirectTo: string, cookie?: string): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "no-store",
  };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(JSON.stringify({ redirectTo }), { status: 200, headers });
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${SECURE} Max-Age=${SESSION_TTL_MS / 1000}`;
}

function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax;${SECURE} Max-Age=0`;
}

export function originOk(req: Request): boolean {
  // Origin ausente, nulo ou divergente é rejeitado antes de qualquer mutação (SPEC §CSRF/origem)
  // APP_ORIGIN pode ser lista separada por vírgula (fail-closed se vazia).
  const origin = req.headers.get("origin");
  return origin !== null && APP_ORIGINS.has(origin);
}

export function sameOriginRequest(req: Request): boolean {
  return originOk(req) || req.headers.get("sec-fetch-site") === "same-origin";
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validate(
  email: unknown,
  password: unknown,
): Record<string, string> | null {
  const fieldErrors: Record<string, string> = {};
  if (
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !EMAIL_RE.test(email.trim())
  ) {
    fieldErrors.email = "Informe um e-mail válido.";
  }
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 200
  ) {
    fieldErrors.password = "A senha deve ter entre 8 e 200 caracteres.";
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

export async function handleRegister(req: Request): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Requisição inválida." });
  const fieldErrors = validate(body.email, body.password);
  if (fieldErrors) return json(400, { error: "Dados inválidos.", fieldErrors });
  try {
    const email = String(body.email).trim().toLowerCase();
    const token = await registerUser(
      email,
      body.password as string,
      readCookie(req, SESSION_COOKIE),
    );
    return ok("/today", sessionCookie(token));
  } catch (e) {
    if (e instanceof AccountExistsError)
      return json(409, { error: "Esta conta já existe. Tente entrar." });
    // log sem e-mail, cookie, token ou detalhe de credencial
    console.error(
      "register failed:",
      e instanceof Error ? e.constructor.name : "unknown error",
    );
    return json(500, {
      error: "Não foi possível concluir o cadastro. Tente novamente.",
    });
  }
}

export async function handleLogin(req: Request): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Requisição inválida." });
  const fieldErrors = validate(body.email, body.password);
  if (fieldErrors) return json(400, { error: "Dados inválidos.", fieldErrors });
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  try {
    // cookie atual, se existir, é revogado na mesma transação da nova sessão (rotação pareada com Set-Cookie)
    const token = await loginUser(
      email,
      body.password as string,
      readCookie(req, SESSION_COOKIE),
    );
    if (!token) return json(401, { error: "E-mail ou senha inválidos." });
    return ok("/today", sessionCookie(token));
  } catch (e) {
    console.error(
      "login failed:",
      e instanceof Error ? e.constructor.name : "unknown error",
    );
    return json(500, {
      error: "Não foi possível entrar agora. Tente novamente.",
    });
  }
}

export async function handleLogout(req: Request): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await revokeSession(token);
  return ok("/access", clearedCookie());
}
