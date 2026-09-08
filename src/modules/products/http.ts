// Handlers HTTP do Slice 002: GET/POST /api/products, GET/PATCH/DELETE /api/products/:id
// e POST /api/products/:id/archive (arquivar, idempotente, sem apagar dados).
// Sessão/Tenant resolvidos server-side (RI-005); POST exige Idempotency-Key válida (RI-007);
// PATCH edita fatos com controle otimista de versão; erros sanitizados, sem detalhes internos.
import type { Product } from "@prisma/client";
import { prisma } from "../db";
import { projectGenerationAction, type GenerationAction } from "../commerce-intelligence/service";

import {
  SESSION_COOKIE,
  json,
  readCookie,
  readJsonBody,
  sameOriginRequest,
} from "../identity/http";
import { resolveSession } from "../identity/service";
import {
  ProductDeleteRejectedError,
  ProductNotFoundError,
  ProductValidationError,
  ProductVersionConflictError,
  archiveTenantProduct,
  createManualProduct,
  deleteTenantProduct,
  getTenantProduct,
  isValidIdempotencyKey,
  listTenantProducts,
  reactivateTenantProduct,
  updateTenantProduct,
} from "./service";

// ADR-016 (nota canônica): ActiveProductView sempre carrega generationAction completo
// (state AVAILABLE|BLOCKED; reason/nextAction tokens do servidor, nunca texto pt-BR, nunca
// omitidos nem null em BLOCKED). ArchivedProductView omite o campo. Nenhuma quota, plano,
// saldo ou reserva no payload. A projeção é advisory; POST /api/generations permanece autoritativo.
export type ProductView = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  price: string;
  priceCurrency: string;
  commissionType: string | null;
  commissionValue: string | null;
  features: string[];
  imageRefs: string[];
  notes: string;
  url: string;
  targetContentCount: number;
  creatorPresence: "on_camera" | "hands_only_product" | "either";
  active: boolean;
  readiness: "PENDING" | "ANALYZING" | "READY" | "FAILED";
};

export type ArchivedProductView = ProductView;
export type ActiveProductView = ProductView & { generationAction: GenerationAction };

function jsonBody(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function sessionOf(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? resolveSession(token) : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function constraintsNotes(value: unknown): string {
  if (value === null || typeof value !== "object" || !("constraints" in value))
    return "";
  const notes = value.constraints;
  return typeof notes === "string" ? notes : "";
}

function constraintsCreatorPresence(
  value: unknown,
): ProductView["creatorPresence"] {
  if (
    value === null ||
    typeof value !== "object" ||
    !("creatorPresence" in value)
  )
    return "either";
  const presence = value.creatorPresence;
  return presence === "on_camera" || presence === "hands_only_product"
    ? presence
    : "either";
}

async function productReadiness(tenantId: string, productId: string): Promise<ProductView["readiness"]> {
  const active = await prisma.commerceIntelligenceJob.findFirst({ where: { tenantId, productId, status: { in: ["QUEUED", "RUNNING"] } } });
  if (active) return "ANALYZING";
  const succeeded = await prisma.commerceIntelligenceJob.findFirst({ where: { tenantId, productId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } });
  if (succeeded) return "READY";
  const failed = await prisma.commerceIntelligenceJob.findFirst({ where: { tenantId, productId, status: { in: ["FAILED", "CANCELLED"] } }, orderBy: { createdAt: "desc" } });
  return failed ? "FAILED" : "PENDING";
}
function toProductView(product: Product, readiness: ProductView["readiness"] = "PENDING"): ProductView {
  return { id: product.id, version: product.version, name: product.name, description: product.description ?? "", category: product.category ?? "", price: product.priceAmount ? product.priceAmount.toString() : "", priceCurrency: product.priceCurrency ?? "", commissionType: product.commissionType, commissionValue: product.commissionValue?.toString() ?? null, features: stringList(product.features), imageRefs: stringList(product.images), notes: constraintsNotes(product.generationConstraints), url: product.sourceUrl ?? product.submittedUrl ?? "", targetContentCount: product.targetContentCount, creatorPresence: constraintsCreatorPresence(product.generationConstraints), active: product.lifecycle === "ACTIVE", readiness };
}

export async function handleListProducts(req: Request): Promise<Response> {
  const session = await sessionOf(req);
  if (!session)
    return json(401, {
      error: "Sessão necessária para acessar seus Products.",
      code: "AUTH-SESSION",
    });

  const products = await listTenantProducts(session.tenantId);
  // Projeção por usuário (GEN-ACTIVE é escopo user; GEN-CAPACITY é tenant). Calculada
  // uma vez por leitura: vale igual para todo Product ACTIVE da lista.
  const generationAction = await projectGenerationAction({ tenantId: session.tenantId, userId: session.userId });
  return jsonBody(200, {
    products: await Promise.all(products.map(async (product) => {
      const view = toProductView(product, await productReadiness(session.tenantId, product.id));
      return product.lifecycle === "ACTIVE" ? { ...view, generationAction } : view;
    })),
  });
}

export async function handleGetProduct(
  req: Request,
  id: string,
): Promise<Response> {
  const session = await sessionOf(req);
  if (!session)
    return json(401, {
      error: "Sessão necessária para acessar seu Product.",
      code: "AUTH-SESSION",
    });
  const product = await getTenantProduct(session.tenantId, id);
  if (!product)
    return json(404, {
      error: "Product não encontrado.",
      code: "PRODUCT-NOT-FOUND",
    });
  const view = toProductView(product, await productReadiness(session.tenantId, product.id));
  return jsonBody(200, product.lifecycle === "ACTIVE" ? { ...view, generationAction: await projectGenerationAction({ tenantId: session.tenantId, userId: session.userId }) } : view);
}
export async function handleUpdateProduct(
  req: Request,
  id: string,
): Promise<Response> {
  if (!sameOriginRequest(req))
    return json(403, { error: "Origem não permitida." });
  const session = await sessionOf(req);
  if (!session)
    return json(401, {
      error: "Sessão necessária para editar o Product.",
      code: "AUTH-SESSION",
    });
  const body = await readJsonBody(req);
  if (!body || typeof body.expectedVersion !== "number")
    return json(400, {
      error: "Versão esperada inválida.",
      code: "VERSION-REQUIRED",
    });
  try {
    const product = await updateTenantProduct(
      session.tenantId,
      id,
      body.expectedVersion,
      body,
    );
    return jsonBody(200, { id: product.id, version: product.version });
  } catch (error) {
    if (error instanceof ProductValidationError)
      return json(400, {
        error: error.message,
        code: error.code,
        fieldErrors: error.fieldErrors,
      });
    if (error instanceof ProductNotFoundError)
      return json(404, {
        error: "Product não encontrado.",
        code: "PRODUCT-NOT-FOUND",
      });
    if (error instanceof ProductVersionConflictError)
      return json(409, {
        error: "Este Product foi alterado. Recarregue a versão mais recente.",
        code: "VERSION-CONFLICT",
      });
    console.error("[products] falha ao editar Product", error);
    return json(500, {
      error: "Não foi possível editar o Product agora.",
      code: "SAVE-FAILED",
    });
  }
}

export async function handleArchiveProduct(
  req: Request,
  id: string,
): Promise<Response> {
  if (!sameOriginRequest(req))
    return json(403, { error: "Origem não permitida." });
  const session = await sessionOf(req);
  if (!session)
    return json(401, {
      error: "Sessão necessária para arquivar o Product.",
      code: "AUTH-SESSION",
    });
  try {
    // ADR-016: contrato mínimo de mutação — sem projeção de leitura. UI refaz GET autenticado.
    const product = await archiveTenantProduct(session.tenantId, id);
    return jsonBody(200, { id: product.id, version: product.version });
  } catch (error) {
    if (error instanceof ProductNotFoundError)
      return json(404, {
        error: "Product não encontrado.",
        code: "PRODUCT-NOT-FOUND",
      });
    if (error instanceof ProductVersionConflictError)
      return json(409, {
        error: "Este Product foi alterado. Tente arquivar novamente.",
        code: "VERSION-CONFLICT",
      });
    console.error("[products] falha ao arquivar Product", error);
    return json(500, {
      error: "Não foi possível arquivar o Product agora.",
      code: "ARCHIVE-FAILED",
    });
  }
}

export async function handleReactivateProduct(
  req: Request,
  id: string,
): Promise<Response> {
  if (!sameOriginRequest(req))
    return json(403, { error: "Origem não permitida." });
  const session = await sessionOf(req);
  if (!session)
    return json(401, {
      error: "Sessão necessária para reativar o Product.",
      code: "AUTH-SESSION",
    });
  try {
    // ADR-016: mutação devolve { id, version }; a projeção recalculada chega pelo GET seguinte.
    const product = await reactivateTenantProduct(session.tenantId, id);
    return jsonBody(200, { id: product.id, version: product.version });
  } catch (error) {
    if (error instanceof ProductNotFoundError)
      return json(404, {
        error: "Product não encontrado.",
        code: "PRODUCT-NOT-FOUND",
      });
    if (error instanceof ProductVersionConflictError)
      return json(409, {
        error: "Este Product foi alterado. Tente reativar novamente.",
        code: "VERSION-CONFLICT",
      });
    if (error instanceof ProductValidationError)
      return json(409, { error: error.message, code: error.code, fieldErrors: error.fieldErrors });
    console.error("[products] falha ao reativar Product", error);
    return json(500, {
      error: "Não foi possível reativar o Product agora.",
      code: "REACTIVATE-FAILED",
    });
  }
}

export async function handleDeleteProduct(req: Request, id: string): Promise<Response> {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não permitida." });
  const session = await sessionOf(req);
  if (!session) return json(401, { error: "Sessão necessária para excluir o Product.", code: "AUTH-SESSION" });
  try {
    await deleteTenantProduct(session.tenantId, id);
  } catch (error) {
    if (error instanceof ProductDeleteRejectedError)
      return json(409, {
        error: "Este produto tem análises ou conteúdos e não pode ser excluído. Arquive o produto.",
        code: error.code,
      });
    if (error instanceof ProductNotFoundError) return json(404, { error: "Product não encontrado.", code: "PRODUCT-NOT-FOUND" });
    console.error("[products] falha ao excluir Product", error);
    return json(500, { error: "Não foi possível processar a exclusão do Product.", code: "DELETE-FAILED" });
  }
  return new Response(null, { status: 204 });
}

export async function handleCreateProduct(req: Request): Promise<Response> {
  if (!sameOriginRequest(req))
    return json(403, { error: "Origem não permitida." });

  const session = await sessionOf(req);
  if (!session)
    return json(401, {
      error: "Sessão necessária para salvar o Product.",
      code: "AUTH-SESSION",
    });

  // Chave obrigatória e com formato/tamanho seguro, rejeitada antes de qualquer persistência (PLAN §5).
  const idempotencyKey = req.headers.get("idempotency-key");
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return json(400, {
      error: "Requisição sem chave de idempotência válida.",
      code: "VAL-IDEMPOTENCY-KEY",
    });
  }

  const body = await readJsonBody(req);
  if (!body)
    return json(400, {
      error: "Não foi possível ler os dados enviados.",
      code: "SAVE-FAILED",
    });

  try {
    const { product, replay } = await createManualProduct(
      session.tenantId,
      body,
      idempotencyKey,
    );
    // Salvar não cria CommerceIntelligenceJob nem inicia geração (SPEC B-005/AC-002-08).
    return jsonBody(200, { id: product.id, version: product.version, replay });
  } catch (error) {
    if (error instanceof ProductValidationError) {
      return json(400, {
        error: error.message,
        code: error.code,
        fieldErrors: error.fieldErrors,
      });
    }
    console.error("[products] falha ao salvar Product", error);
    return json(500, {
      error: "Não foi possível salvar o Product agora. Tente novamente.",
      code: "SAVE-FAILED",
    });
  }
}
