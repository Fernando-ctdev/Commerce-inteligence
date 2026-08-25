// Handlers HTTP de Product — contrato Slice 002 (Marechal/Pixel):
//   POST   /api/products                    (header Idempotency-Key) → 201 {id,version} | 200 replay | 400/409/422/503
//   GET    /api/products/[id]               → 200 ProductView | 404 uniforme
//   PATCH  /api/products/[id]  {expectedVersion,...} → 200 {id,version} | 404 uniforme | 409 versão/chave
//   POST   /api/products/[id]/enrichment    → 200 {enrichmentStatus} (ação opcional, nunca bloqueia o manual)
// Todas exigem Origin === APP_ORIGIN e sessão válida do Slice 001; tenant_id do cliente nunca é consultado.
import { CapacityUnavailableError, ProductLimitReachedError } from "../entitlements/service";
import { SESSION_COOKIE, json, originOk, readCookie, readJsonBody } from "../identity/http";
import { resolveSession, type AuthContext } from "../identity/service";
import { runEnrichment } from "./enrichment";
import {
  IdempotencyConflictError,
  StaleVersionError,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./service";
import { validateIdempotencyKey, validateProductInput, type FieldErrors } from "./validation";

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
    const { product, replay } = await createProduct(session.tenantId, validated.input, key, (productId, url) => {
      // disparo pós-commit, fora da transação; falha da ação não afeta o sucesso manual
      if (url) void runEnrichment({ id: productId, url }).catch(() => {});
    });
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
    ...(body.price !== undefined ? { priceCents: patch.priceCents } : {}),
    ...(body.features !== undefined ? { features: patch.features } : {}),
    ...(body.imageRefs !== undefined ? { imageRefs: patch.imageRefs } : {}),
    ...(body.notes !== undefined ? { notes: patch.notes } : {}),
    ...(body.url !== undefined ? { url: patch.url } : {}),
    ...(body.context !== undefined ? { context: patch.context } : {}),
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

export async function handleEnrichment(req: Request, ctx: Ctx): Promise<Response> {
  if (!originOk(req)) return json(403, { error: "Origem não permitida." });
  const session = await requireSession(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const product = await getProduct(session.tenantId, id);
  if (!product) return json(404, { error: "Não encontrado." });
  if (!product.url) return json(400, { error: "Produto sem URL para enriquecer." });
  const status = await runEnrichment({ id: product.id, url: product.url });
  return okBody(200, { enrichmentStatus: status });
}
