// Handlers HTTP do Slice 002: GET/POST /api/products (contrato compartilhado do slice).
// Sessão/Tenant resolvidos server-side (RI-005); POST exige Idempotency-Key válida e limitada;
// replay determinístico devolve o mesmo id/version (RI-007); erros sanitizados, sem detalhes internos.
import type { Product } from "@prisma/client";

import { SESSION_COOKIE, json, readCookie, readJsonBody, sameOriginRequest } from "../identity/http";
import { resolveSession } from "../identity/service";
import {
  ProductValidationError,
  createManualProduct,
  isValidIdempotencyKey,
  listTenantProducts,
} from "./service";

export type ProductView = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  price: string;
  features: string[];
  imageRefs: string[];
  notes: string;
  url: string;
  active: boolean;
};

function jsonBody(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function sessionOf(req: Request) {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? resolveSession(token) : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function constraintsNotes(value: unknown): string {
  if (value === null || typeof value !== "object" || !("constraints" in value)) return "";
  const notes = value.constraints;
  return typeof notes === "string" ? notes : "";
}

/** Linha → contrato da API. `notes` vem das restrições da primeira geração; manual não tem URL. */
function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    version: product.version,
    name: product.name,
    description: product.description ?? "",
    category: product.category ?? "",
    price: product.priceAmount ? product.priceAmount.toString() : "",
    features: stringList(product.features),
    imageRefs: stringList(product.images),
    notes: constraintsNotes(product.generationConstraints),
    url: product.sourceUrl ?? product.submittedUrl ?? "",
    active: true,
  };
}

export async function handleListProducts(req: Request): Promise<Response> {
  const session = await sessionOf(req);
  if (!session) return json(401, { error: "Sessão necessária para acessar seus Products.", code: "AUTH-SESSION" });

  const products = await listTenantProducts(session.tenantId);
  return jsonBody(200, { products: products.map(toProductView) });
}

export async function handleCreateProduct(req: Request): Promise<Response> {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não permitida." });

  const session = await sessionOf(req);
  if (!session) return json(401, { error: "Sessão necessária para salvar o Product.", code: "AUTH-SESSION" });

  // Chave obrigatória e com formato/tamanho seguro, rejeitada antes de qualquer persistência (PLAN §5).
  const idempotencyKey = req.headers.get("idempotency-key");
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return json(400, { error: "Requisição sem chave de idempotência válida.", code: "VAL-IDEMPOTENCY-KEY" });
  }

  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Não foi possível ler os dados enviados.", code: "SAVE-FAILED" });

  try {
    const { product, replay } = await createManualProduct(session.tenantId, body, idempotencyKey);
    // Salvar não cria CommerceIntelligenceJob nem inicia geração (SPEC B-005/AC-002-08).
    return jsonBody(200, { id: product.id, version: product.version, replay });
  } catch (error) {
    if (error instanceof ProductValidationError) {
      return json(400, { error: error.message, code: error.code, fieldErrors: error.fieldErrors });
    }
    console.error("[products] falha ao salvar Product", error);
    return json(500, { error: "Não foi possível salvar o Product agora. Tente novamente.", code: "SAVE-FAILED" });
  }
}
