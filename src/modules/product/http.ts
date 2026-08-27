// Handlers HTTP de Product — contrato Slice 002 (fallback manual + confirmação de importação):
//   POST   /api/products                    (header Idempotency-Key) → 201 {id,version} | 200 replay | 400/409/422/503
//   GET    /api/products                    → 200 {products}
//   GET    /api/products/[id]               → 200 ProductView | 404 uniforme
//   PATCH  /api/products/[id]  {expectedVersion,...} → 200 {id,version} | 404 uniforme | 409 versão/chave
//   POST   /api/products/confirm {attemptId, expectedCandidateVersion, facts?}
//        → 201/200 {id,version} | 200 {duplicate, productId} | 400/404/409/422/503
// Todas exigem Origin === APP_ORIGIN e sessão válida do Slice 001; tenant_id do cliente nunca é consultado.
import { CapacityUnavailableError, ProductLimitReachedError } from "../entitlements/service";
import { SESSION_COOKIE, json, originOk, readCookie, readJsonBody } from "../identity/http";
import { resolveSession, type AuthContext } from "../identity/service";
import {
  CandidateIncompleteError,
  CandidateNotFoundError,
  CandidateNotConfirmableError,
  CandidateStaleVersionError,
  IdempotencyConflictError,
  StaleVersionError,
  confirmCandidate,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./service";
import { validateCandidateEdits, validateIdempotencyKey, validateProductInput, type FieldErrors } from "./validation";

type Ctx = { params: Promise<{ id: string }> };

const NO_STORE = { "content-type": "application/json", "cache-control": "no-store" } as const;

function okBody(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

async function requireSession(req: Request): Promise<AuthContext | Response> {
  const token = readCookie(req, SESSION_COOKIE);
  const ctx = token ? await resolveSession(token) : null;
  return ctx ?? json(401, { error: "Não autenticado." });
}

function isValidationErrors(r: { errors: FieldErrors } | { input: unknown }): r is { errors: FieldErrors } {
  return "errors" in r;
}

export async function handleCreateProduct(req: Request): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const key = validateIdempotencyKey(req.headers.get("idempotency-key"));
  if (!key) return json(400, { error: "Dados inválidos.", fieldErrors: { idempotencyKey: "Chave de idempotência inválida (base64url, 22–128 caracteres)." } });

  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Requisição inválida." });
  const validated = validateProductInput(body);
  if (isValidationErrors(validated)) return json(400, { error: "Dados inválidos.", fieldErrors: validated.errors });

  try {
    const { product, replay } = await createProduct(session.tenantId, validated.input, key);
    return replay
      ? okBody(200, { id: product.id, version: product.version, replay: true })
      : okBody(201, { id: product.id, version: product.version });
  } catch (e) {
    if (e instanceof IdempotencyConflictError) return json(409, { error: "Chave de idempotência já usada com dados diferentes." });
    if (e instanceof CapacityUnavailableError) return json(503, { error: "Capacidade indisponível no momento. Tente novamente." });
    if (e instanceof ProductLimitReachedError)
      return json(422, { error: "Capacidade de Products ativos atingida para este Workspace." });
    console.error("product create failed:", e instanceof Error ? e.constructor.name : "unknown error");
    return json(500, { error: "Não foi possível criar o produto. Tente novamente." });
  }
}

export async function handleGetProduct(req: Request, ctx: Ctx): Promise<Response> {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const product = await getProduct(session.tenantId, id);
  // 404 uniforme: não distingue inexistente de outro Tenant
  return product ? okBody(200, product) : json(404, { error: "Não encontrado." });
}

/** GET /api/products → {products: ProductView[]}; escopo vem exclusivamente da sessão, nunca de query params. */
export async function handleListProducts(req: Request): Promise<Response> {
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const products = await listProducts(session.tenantId);
  return okBody(200, { products });
}

export async function handleUpdateProduct(req: Request, ctx: Ctx): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;

  const body = await readJsonBody(req);
  if (!body || typeof body.expectedVersion !== "number" || !Number.isInteger(body.expectedVersion)) {
    return json(400, { error: "Dados inválidos.", fieldErrors: { expectedVersion: "Versão observada obrigatória." } });
  }
  const validated = validateProductInput(body, true); // parcial: somente campos presentes são validados
  if (isValidationErrors(validated)) return json(400, { error: "Dados inválidos.", fieldErrors: validated.errors });
  const patch = validated.input;
  // PATCH parcial: campos ausentes preservados — normaliza para undefined
  const partial = {
    ...(body.name !== undefined ? { name: patch.name } : {}),
    ...(body.description !== undefined ? { description: patch.description } : {}),
    ...(body.category !== undefined ? { category: patch.category } : {}),
    ...(body.brand !== undefined ? { brand: patch.brand } : {}),
    ...(body.seller !== undefined ? { seller: patch.seller } : {}),
    ...(body.variants !== undefined ? { variants: patch.variants } : {}),
    ...(body.price !== undefined ? { priceCents: patch.priceCents } : {}),
    ...(body.priceCurrency !== undefined ? { priceCurrency: patch.priceCurrency } : {}),
    ...(body.features !== undefined ? { features: patch.features } : {}),
    ...(body.imageRefs !== undefined ? { imageRefs: patch.imageRefs } : {}),
    ...(body.notes !== undefined ? { notes: patch.notes } : {}),
    ...(body.url !== undefined ? { url: patch.url } : {}),
  };

  try {
    const product = await updateProduct(session.tenantId, id, body.expectedVersion, partial);
    return okBody(200, { id: product.id, version: product.version, readyForStrategy: product.readyForStrategy });
  } catch (e) {
    if (e instanceof StaleVersionError) return json(409, { error: "Versão desatualizada: recarregue o produto antes de salvar." });
    if (e instanceof Error && e.message === "PRODUCT_NOT_FOUND") return json(404, { error: "Não encontrado." });
    console.error("product update failed:", e instanceof Error ? e.constructor.name : "unknown error");
    return json(500, { error: "Não foi possível salvar o produto. Tente novamente." });
  }
}

/**
 * Confirma um Candidate de importação como Product (human-in-the-loop). Fatos vêm do
 * reload server-side; `facts` só carrega correções do creator. URL canônica já
 * confirmada → {duplicate, productId} sem mutação (SPEC: sem falsos conflitos).
 */
export async function handleConfirmProduct(req: Request): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;

  const body = await readJsonBody(req);
  const attemptId = typeof body?.attemptId === "string" ? body.attemptId : null;
  if (!attemptId) return json(400, { error: "Dados inválidos.", fieldErrors: { attemptId: "Identificador da importação obrigatório." } });
  if (typeof body?.expectedCandidateVersion !== "number" || !Number.isInteger(body.expectedCandidateVersion)) {
    return json(400, { error: "Dados inválidos.", fieldErrors: { expectedCandidateVersion: "Versão observada do Candidate obrigatória." } });
  }
  const validatedEdits = body.facts === undefined ? { edits: {} } : validateCandidateEdits(body.facts);
  if ("errors" in validatedEdits) return json(400, { error: "Dados inválidos.", fieldErrors: validatedEdits.errors });

  try {
    const outcome = await confirmCandidate(session.tenantId, attemptId, body.expectedCandidateVersion, validatedEdits.edits);
    if ("duplicate" in outcome) return okBody(200, { duplicate: true, productId: outcome.productId });
    return outcome.replay
      ? okBody(200, { id: outcome.product.id, version: outcome.product.version, replay: true })
      : okBody(201, { id: outcome.product.id, version: outcome.product.version });
  } catch (e) {
    if (e instanceof CandidateNotFoundError) return json(404, { error: "Não encontrado." });
    if (e instanceof CandidateStaleVersionError) return json(409, { error: "Candidate desatualizado: recarregue a importação antes de confirmar." });
    if (e instanceof CandidateNotConfirmableError) return json(409, { error: "Importação não está pronta para confirmação." });
    if (e instanceof CandidateIncompleteError)
      return json(422, { error: "Candidate incompleto: revise nome e descrição antes de confirmar." });
    if (e instanceof CapacityUnavailableError) return json(503, { error: "Capacidade indisponível no momento. Tente novamente.", code: "capacity_unavailable" });
    if (e instanceof ProductLimitReachedError)
      return json(422, { error: "Capacidade de Products ativos atingida para este Workspace.", code: "product_limit_reached" });
    console.error("product confirm failed:", e instanceof Error ? e.constructor.name : "unknown error");
    return json(500, { error: "Não foi possível confirmar o produto. Tente novamente." });
  }
}
