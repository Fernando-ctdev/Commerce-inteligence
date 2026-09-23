import { readCookie, readJsonBody, sameOriginRequest, SESSION_COOKIE, json } from "../identity/http";
import { resolveSession } from "../identity/service";
import { startCommerceIntelligence } from "./service";
import { GenerationError, generationErrorStatus, publicGenerationError } from "./errors";
import { isValidIdempotencyKey } from "../products/service";

export async function handleStartGeneration(req: Request): Promise<Response> {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não autorizada", code: "ORIGIN_FORBIDDEN" });
  const token = readCookie(req, SESSION_COOKIE); const session = token ? await resolveSession(token) : null;
  if (!session) return json(401, { error: "Sessão inválida", code: "UNAUTHENTICATED" });
  const key = req.headers.get("Idempotency-Key"); if (!isValidIdempotencyKey(key)) return json(400, { error: "Idempotency-Key inválida", code: "GEN-IDEMPOTENCY" });
  const body = await readJsonBody(req); const productId = body?.productId;
  if (typeof productId !== "string" || !productId) return json(400, { error: "Produto obrigatório", code: "GEN-PRODUCT" });
  try { const job = await startCommerceIntelligence({ tenantId: session.tenantId, userId: session.userId, productId, idempotencyKey: key }); console.info("[generation-start]", { tenantId: session.tenantId, userId: session.userId, activeJobId: job.id, code: null }); return new Response(JSON.stringify({ id: job.id, productId: job.productId, targetContentCount: job.targetContentCount, status: job.status, stage: job.stage }), { status: 202, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
  catch (error) { const code = error instanceof GenerationError ? error.code : "GEN-PROVIDER"; console.info("[generation-start]", { tenantId: session.tenantId, userId: session.userId, activeJobId: null, code }); return json(generationErrorStatus(code), { error: publicGenerationError(code), code }); }
}
