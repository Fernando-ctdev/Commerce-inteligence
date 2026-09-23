// Handlers HTTP do Slice 011 (ADR-018/SPEC): GET/PATCH /api/creator-preferences e
// GET/PATCH /api/account/preferences — contratos separados sobre o mesmo registro.
// Sessão server-side resolve usuário e Tenant — nenhum ownership vindo do cliente é aceito.
// PATCH exige mesma origem (CSRF); erros sanitizados e estáveis em pt-BR.
import { Prisma } from "@prisma/client";

import {
  SESSION_COOKIE,
  json,
  readCookie,
  readJsonBody,
  sameOriginRequest,
} from "../identity/http";
import { resolveSession } from "../identity/service";
import {
  PreferencesValidationError,
  getAccountContext,
  getCreatorPreferences,
  updateAccountContext,
  updateCreatorPreferences,
} from "./service";

type Session = NonNullable<Awaited<ReturnType<typeof resolveSession>>>;

function preferencesBody(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function requireSession(
  req: Request,
  action: "acessar" | "salvar",
): Promise<{ error: Response } | { session: Session }> {
  const token = readCookie(req, SESSION_COOKIE);
  const session = token ? await resolveSession(token) : null;
  if (!session)
    return {
      error: json(401, {
        error: `Sessão necessária para ${action} suas preferências.`,
        code: "AUTH-SESSION",
      }),
    };
  return { session };
}

async function handleGet(
  req: Request,
  key: string,
  load: (session: Session) => Promise<unknown>,
): Promise<Response> {
  const auth = await requireSession(req, "acessar");
  if ("error" in auth) return auth.error;
  return preferencesBody(200, { [key]: await load(auth.session) });
}

async function handlePatch(
  req: Request,
  key: string,
  save: (session: Session, body: Record<string, unknown>) => Promise<unknown>,
): Promise<Response> {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não permitida." });
  const auth = await requireSession(req, "salvar");
  if ("error" in auth) return auth.error;
  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Requisição inválida.", code: "VAL-PREF-INVALID" });
  try {
    return preferencesBody(200, { [key]: await save(auth.session, body) });
  } catch (error) {
    if (error instanceof PreferencesValidationError)
      return json(400, {
        error: "Dados inválidos.",
        code: error.code,
        fieldErrors: error.fieldErrors,
      });
    // Indisponibilidade de datasource é distinta de falha de salvamento e de CSRF (403).
    if (error instanceof Prisma.PrismaClientInitializationError)
      return json(503, {
        error: "Serviço temporariamente indisponível.",
        code: "DATASOURCE-UNAVAILABLE",
      });
    console.error(
      "[creator-preferences] falha ao salvar preferências:",
      error instanceof Error ? error.constructor.name : "unknown error",
    );
    return json(500, {
      error: "Não foi possível salvar suas preferências agora.",
      code: "SAVE-FAILED",
    });
  }
}

export const handleGetCreatorPreferences = (req: Request): Promise<Response> =>
  handleGet(req, "preferences", getCreatorPreferences);

export const handlePatchCreatorPreferences = (req: Request): Promise<Response> =>
  handlePatch(req, "preferences", updateCreatorPreferences);

export const handleGetAccountPreferences = (req: Request): Promise<Response> =>
  handleGet(req, "accountContext", getAccountContext);

export const handlePatchAccountPreferences = (req: Request): Promise<Response> =>
  handlePatch(req, "accountContext", updateAccountContext);
