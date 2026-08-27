import { CapacityUnavailableError } from "../entitlements/service";
import { GeneratedContentsLimitReachedError } from "../entitlements/generation";
import { SESSION_COOKIE, json, originOk, readCookie, readJsonBody } from "../identity/http";
import { resolveSession, type AuthContext } from "../identity/service";
import {
  GenerationAlreadyActiveError,
  GenerationAlreadySucceededError,
  GenerationIntentConflictError,
  GenerationNotFoundError,
  GenerationProductNotFoundError,
  GenerationProductNotReadyError,
  GenerationRetryRequiredError,
  GenerationStateConflictError,
  GenerationValidationError,
  cancelGeneration,
  getGeneration,
  retryGeneration,
  startGeneration,
} from "./service";

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" } as const;

function body(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: NO_STORE });
}

async function requireSession(req: Request): Promise<AuthContext | Response> {
  const token = readCookie(req, SESSION_COOKIE);
  const session = token ? await resolveSession(token) : null;
  return session ?? json(401, { error: "Não autenticado." });
}

function mapError(error: unknown): Response {
  if (error instanceof GenerationValidationError) return body(400, { error: "Dados inválidos.", fieldErrors: error.fieldErrors });
  if (error instanceof GenerationProductNotFoundError || error instanceof GenerationNotFoundError) return json(404, { error: "Não encontrado." });
  if (error instanceof GenerationProductNotReadyError) return body(422, { error: "Complete nome e descrição do Product antes de gerar.", code: "product_not_ready" });
  if (error instanceof GeneratedContentsLimitReachedError) return body(422, { error: "A quantidade não cabe na capacidade mensal deste Workspace.", code: "generation_capacity" });
  if (error instanceof CapacityUnavailableError) return body(503, { error: "A capacidade está indisponível com segurança. Tente novamente.", code: "capacity_unavailable" });
  if (error instanceof GenerationIntentConflictError) return body(409, { error: "Chave de idempotência já usada com dados diferentes.", code: "idempotency_conflict" });
  if (error instanceof GenerationAlreadyActiveError) return body(409, { error: "Já existe uma geração ativa para este Product.", code: "generation_active" });
  if (error instanceof GenerationAlreadySucceededError) return body(409, { error: "A primeira geração deste Product já foi concluída.", code: "generation_succeeded" });
  if (error instanceof GenerationRetryRequiredError) return body(409, { error: "Use Tentar novamente para recuperar esta geração.", code: "retry_required" });
  if (error instanceof GenerationStateConflictError) return body(409, { error: "Esta Generation não pode ser tentada novamente neste estado.", code: "generation_state_conflict" });
  console.error("generation request failed:", error instanceof Error ? error.constructor.name : "unknown error");
  return body(500, { error: "Não foi possível concluir a geração. Tente novamente." });
}

export async function handleStartGeneration(req: Request): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const key = req.headers.get("idempotency-key");
  const input = await readJsonBody(req);
  if (!input || typeof input.productId !== "string" || input.productId.trim() === "") return body(400, { error: "Dados inválidos.", fieldErrors: { productId: "Product obrigatório." } });
  try {
    const result = await startGeneration(session.tenantId, input.productId, { quantity: input.quantity, objective: input.objective }, key);
    return body(result.replay ? 200 : 202, result.run);
  } catch (error) {
    return mapError(error);
  }
}

export async function handleGetGeneration(req: Request, ctx: Ctx): Promise<Response> {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const run = await getGeneration(session.tenantId, id);
  return run ? body(200, run) : json(404, { error: "Não encontrado." });
}

export async function handleCancelGeneration(req: Request, ctx: Ctx): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    return body(200, await cancelGeneration(session.tenantId, id));
  } catch (error) {
    return mapError(error);
  }
}

export async function handleRetryGeneration(req: Request, ctx: Ctx): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    const result = await retryGeneration(session.tenantId, id, req.headers.get("idempotency-key"));
    return body(result.replay ? 200 : 202, result.run);
  } catch (error) {
    return mapError(error);
  }
}
