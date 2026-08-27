// Handlers HTTP de Product Import — contrato Slice 002:
//   POST /api/product-imports          (header Idempotency-Key) → 201/200 ImportView | 400/403/409/422/503
//   GET  /api/product-imports/[id]     → 200 ImportView | 404 uniforme
//   POST /api/product-imports/[id]/cancel → 200 ImportView | 404 | 409
//   POST /api/product-imports/[id]/retry  → 200 ImportView | 404 | 409/422/503
//   POST /api/product-imports/[id]/resume → 200 ImportView | 404 | 409 (paused somente)
// Todas exigem Origin === APP_ORIGIN e sessão válida; escopo vem exclusivamente da sessão.
import { BrowserServiceUnavailableError } from "../browser/client";
import { CapacityUnavailableError, ProductLimitReachedError } from "../entitlements/service";
import { SESSION_COOKIE, json, originOk, readCookie, readJsonBody, sameOriginRequest } from "../identity/http";
import { resolveSession, type AuthContext } from "../identity/service";
import {
  ImportIdempotencyConflictError,
  ImportNotFoundError,
  ImportProfileUnavailableError,
  ImportStateConflictError,
  ImportUrlInvalidError,
  cancelImport,
  getImport,
  resumeImport,
  retryImport,
  startImport,
} from "./service";
import { validateIdempotencyKey } from "../product/validation";

type Ctx = { params: Promise<{ id: string }> };

const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" } as const;

async function requireSession(req: Request): Promise<AuthContext | Response> {
  const token = readCookie(req, SESSION_COOKIE);
  const ctx = token ? await resolveSession(token) : null;
  return ctx ?? json(401, { error: "Não autenticado." });
}

/** Erros compartilhados pelos casos de uso de importação; log sanitizado por classe. */
function importErrorResponse(e: unknown, context: string): Response | null {
  if (e instanceof ImportNotFoundError) return json(404, { error: "Não encontrado." }); // uniforme: inexistente ou de outro Tenant
  if (e instanceof BrowserServiceUnavailableError) return json(503, { error: "Serviço de importação indisponível. Tente novamente.", code: "profile_unavailable" });
  if (e instanceof CapacityUnavailableError) return json(503, { error: "Capacidade indisponível no momento. Tente novamente.", code: "capacity_unavailable" });
  if (e instanceof ProductLimitReachedError)
    return json(422, { error: "Capacidade de Products ativos atingida para este Workspace.", code: "product_limit_reached" });
  if (e instanceof ImportProfileUnavailableError) return json(503, { error: "Serviço de importação indisponível. Tente novamente.", code: "profile_unavailable" });
  console.error(`${context} failed:`, e instanceof Error ? e.constructor.name : "unknown error");
  return null;
}

export async function handleStartImport(req: Request): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const key = validateIdempotencyKey(req.headers.get("idempotency-key"));
  if (!key) return json(400, { error: "Dados inválidos.", fieldErrors: { idempotencyKey: "Chave de idempotência inválida (base64url, 22–128 caracteres)." } });

  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Requisição inválida." });

  try {
    const view = await startImport(session.tenantId, body.url, key);
    return new Response(JSON.stringify(view), { status: view.replay ? 200 : 201, headers: NO_STORE });
  } catch (e) {
    if (e instanceof ImportUrlInvalidError)
      return json(400, { error: "Dados inválidos.", fieldErrors: { url: "URL inválida: use HTTPS de um domínio TikTok Shop suportado." } });
    if (e instanceof ImportIdempotencyConflictError) return json(409, { error: "Chave de idempotência já usada com outra URL." });
    const mapped = importErrorResponse(e, "import start");
    if (mapped) return mapped;
    return json(503, { error: "Serviço de importação indisponível. Tente novamente." });
  }
}
export async function handleGetImport(req: Request, ctx: Ctx): Promise<Response> {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    const view = await getImport(session.tenantId, id);
    return new Response(JSON.stringify(view), { status: 200, headers: NO_STORE });
  } catch (e) {
    const mapped = importErrorResponse(e, "import get");
    return mapped ?? json(500, { error: "Não foi possível consultar a importação." });
  }
}

export async function handleCancelImport(req: Request, ctx: Ctx): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    const view = await cancelImport(session.tenantId, id);
    return new Response(JSON.stringify(view), { status: 200, headers: NO_STORE });
  } catch (e) {
    const mapped = importErrorResponse(e, "import cancel");
    return mapped ?? json(500, { error: "Não foi possível cancelar a importação." });
  }
}

export async function handleRetryImport(req: Request, ctx: Ctx): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    const view = await retryImport(session.tenantId, id);
    return new Response(JSON.stringify(view), { status: 200, headers: NO_STORE });
  } catch (e) {
    const mapped = importErrorResponse(e, "import retry");
    return mapped ?? json(500, { error: "Não foi possível repetir a importação." });
  }
}

export async function handleResumeImport(req: Request, ctx: Ctx): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    const view = await resumeImport(session.tenantId, id);
    return new Response(JSON.stringify(view), { status: 200, headers: NO_STORE });
  } catch (e) {
    const mapped = importErrorResponse(e, "import resume");
    return mapped ?? json(500, { error: "Não foi possível retomar a importação." });
  }
}
