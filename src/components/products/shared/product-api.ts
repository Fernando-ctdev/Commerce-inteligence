import type { ProductFieldErrors, ProductPayload } from "./product-form-model";
import {
  normalizeGenerationAction,
  type GenerationActionProjection,
} from "../generation/generation-ui-model";
import {
  type CandidateGap,
  type ProductImportCandidate,
  type ProductImportResult,
  type ProductSignals,
} from "./product-import-model";
import { URL_IMPORT_ENABLED } from "../../../modules/products/import-config";

export type ProductReadiness = "PENDING" | "ANALYZING" | "READY" | "FAILED";

export type ProductOrigin = "showcase" | "manual";

export type ProductRecord = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  price: string;
  priceCurrency: string;
  imageReferences: string[];
  observations: string;
  url: string;
  targetContentCount: number;
  creatorPresence: "on_camera" | "hands_only_product" | "either";
  active: boolean;
  readiness: ProductReadiness;
  /** ADR-016: presente apenas em ActiveProductView; ausente em archived. */
  generationAction?: GenerationActionProjection;
  /* Fatos de apresentação da Vitrine: presentes só quando o backend os
     projeta (produtos sincronizados); ausentes nunca são inventados. */
  origin?: ProductOrigin;
  commission?: string;
  /** Basis point (900 = 9%), como no DTO da Vitrine. */
  commissionRate?: number;
  stockCount?: number;
  labels?: string[];
};

export type ProductMutation = {
  id: string;
  version: number;
  replay?: boolean;
};
export type { CandidateGap, ProductImportCandidate, ProductImportResult, ProductSignals };
/* Resposta da consulta por URL: { candidate, partial, gaps, message }.
   Nunca Product, id, version ou replay — a persistência é o POST manual. */
export type ServerFieldErrors = ProductFieldErrors &
  Partial<
    Record<
      "currency" | "targetContentCount" | "creatorPresence" | "constraints",
      string
    >
  >;

export type ProductApiErrorOptions = {
  status: number;
  message: string;
  fieldErrors?: ServerFieldErrors;
  code?: string;
};

export class ProductApiError extends Error {
  readonly status: number;
  readonly fieldErrors: ServerFieldErrors;
  readonly code?: string;

  constructor({
    status,
    message,
    fieldErrors = {},
    code,
  }: ProductApiErrorOptions) {
    super(message);
    this.name = "ProductApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown) {
  return stringValue(value).trim();
}

function listValue(value: unknown) {
  if (Array.isArray(value))
    return value
      .map(stringValue)
      .map((item) => item.trim())
      .filter(Boolean);
  return stringValue(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/* Chaves do contrato do POST → chaves de erro do cliente. Erros de
   preparação (targetContentCount, creatorPresence, constraints) passam
   com o mesmo nome; chaves desconhecidas continuam descartadas. */
const serverFieldNames: Record<string, string> = {
  name: "name",
  description: "description",
  category: "category",
  price: "price",
  imageRefs: "imageReferences",
  notes: "observations",
  url: "url",
  currency: "currency",
  priceCurrency: "currency",
  targetContentCount: "targetContentCount",
  creatorPresence: "creatorPresence",
  constraints: "constraints",
};

function mapFieldErrors(value: unknown): ServerFieldErrors {
  if (typeof value !== "object" || value === null) return {};
  return Object.entries(value).reduce<ServerFieldErrors>(
    (errors, [key, message]) => {
      const field = serverFieldNames[key];
      if (field && typeof message === "string") {
        errors[field as keyof ServerFieldErrors] = message;
      }
      return errors;
    },
    {},
  );
}

function optionalOrigin(value: unknown): ProductOrigin | undefined {
  return value === "showcase" || value === "manual" ? value : undefined;
}

function labelList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const texts = value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (
        item !== null &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
      )
        return item.text.trim();
      return "";
    })
    .filter(Boolean);
  return texts.length > 0 ? texts : undefined;
}

export function normalizeProduct(value: unknown): ProductRecord {
  if (typeof value !== "object" || value === null)
    throw new Error("Resposta de Product inválida.");
  const record = value as Record<string, unknown>;
  const url = nullableString(record.url);
  const rawCents = record.priceCents ?? record.price_cents;
  const cents =
    typeof rawCents === "number"
      ? rawCents
      : typeof rawCents === "string" && /^\d+$/.test(rawCents)
        ? Number(rawCents)
        : null;
  const rawPrice = record.price ?? record.price_R$;
  const price =
    cents !== null
      ? (cents / 100).toFixed(2).replace(".", ",")
      : nullableString(rawPrice);
  const origin = optionalOrigin(record.origin);
  const commission = nullableString(record.commission) || undefined;
  const commissionRate =
    typeof record.commissionRate === "number" &&
    Number.isFinite(record.commissionRate)
      ? record.commissionRate
      : undefined;
  const stockCount =
    typeof record.stockCount === "number" &&
    Number.isInteger(record.stockCount) &&
    record.stockCount >= 0
      ? record.stockCount
      : undefined;
  const labels = labelList(record.labels);
  // Desconto (ADR-031): fora do contrato ativo — nunca normalizado
  // nem exposto, mesmo em respostas históricas que ainda o carreguem.
  return {
    id: nullableString(record.id ?? record.product_id),
    version: typeof record.version === "number" ? record.version : 0,
    name: nullableString(record.name),
    description: nullableString(record.description),
    category: nullableString(record.category),
    price,
    priceCurrency:
      nullableString(record.priceCurrency ?? record.price_currency) || "R$",
    imageReferences: listValue(
      record.imageRefs ?? record.imageReferences ?? record.image_references,
    ),
    observations: nullableString(record.notes ?? record.observations),
    url,
    ...(origin ? { origin } : {}),
    ...(commission ? { commission } : {}),
    ...(commissionRate !== undefined ? { commissionRate } : {}),
    ...(stockCount !== undefined ? { stockCount } : {}),
    ...(labels ? { labels } : {}),
    targetContentCount:
      typeof record.targetContentCount === "number"
        ? record.targetContentCount
        : 5,
    creatorPresence:
      record.creatorPresence === "on_camera" ||
      record.creatorPresence === "hands_only_product"
        ? record.creatorPresence
        : "either",
    active: record.active !== false,
    readiness:
      record.readiness === "ANALYZING" ||
      record.readiness === "READY" ||
      record.readiness === "FAILED"
        ? record.readiness
        : "PENDING",
    generationAction: normalizeGenerationAction(record.generationAction),
  };
}

function productFromResponse(value: unknown) {
  if (typeof value === "object" && value !== null && "product" in value) {
    return normalizeProduct((value as { product: unknown }).product);
  }
  return normalizeProduct(value);
}

async function request<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  }).catch(() => null);

  const data: unknown = response
    ? await response.json().catch(() => null)
    : null;
  if (!response)
    throw new ProductApiError({
      status: 0,
      message: "Não foi possível conectar agora. Tente novamente.",
    });
  if (!response.ok) {
    const body =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : {};
    throw new ProductApiError({
      status: response.status,
      code: typeof body.code === "string" ? body.code : undefined,
      message:
        typeof body.error === "string"
          ? body.error
          : "Não foi possível concluir esta ação.",
      fieldErrors: mapFieldErrors(body.fieldErrors),
    });
  }
  return data as T;
}

export async function listProducts() {
  const data = await request<unknown>("/api/products", { method: "GET" });
  if (Array.isArray(data)) return data.map(normalizeProduct);
  if (
    typeof data === "object" &&
    data !== null &&
    "products" in data &&
    Array.isArray((data as { products: unknown }).products)
  ) {
    return (data as { products: unknown[] }).products.map(normalizeProduct);
  }
  return [];
}

/* Sincronização da Vitrine: o POST persiste/atualiza os produtos do
   TikTok Shop; a lista exibida é sempre recarregada pelo GET seguinte. */
export async function syncProducts() {
  await request<unknown>("/api/products/sync", { method: "POST" });
}

export async function getProduct(id: string) {
  return productFromResponse(
    await request<unknown>(`/api/products/${encodeURIComponent(id)}`, {
      method: "GET",
    }),
  );
}

function mutationFromResponse(value: unknown): ProductMutation {
  if (typeof value !== "object" || value === null)
    throw new Error("Resposta de Product inválida.");
  const record = value as Record<string, unknown>;
  const id = nullableString(record.id ?? record.product_id);
  const version = typeof record.version === "number" ? record.version : null;
  if (!id || version === null) throw new Error("Resposta de Product inválida.");
  return {
    id,
    version,
    replay: record.replay === true,
  };
}

export async function createProduct(payload: ProductPayload) {
  /* Campos ausentes caem fora do JSON; fatos opcionais preservam o mesmo
     contrato visual entre criação e edição. */
  const {
    idempotency_key: idempotencyKey,
    name,
    description,
    category,
    price,
    priceCurrency,
    imageRefs,
    url,
    targetContentCount,
    creatorPresence,
    constraints,
  } = payload;
  return mutationFromResponse(
    await request<unknown>("/api/products", {
      method: "POST",
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
      body: JSON.stringify({
        name,
        description,
        category,
        price,
        priceCurrency,
        imageRefs,
        url,
        targetContentCount,
        creatorPresence,
        constraints,
      }),
    }),
  );
}

/* Consulta por URL: reduz a resposta do endpoint ao contrato público do
   candidato. Fatos vazios/nulos ficam ausentes; sinais só passam com número
   finito não negativo; seller/brand/variants/payload bruto nunca cruzam aqui. */
function candidateGaps(value: unknown): CandidateGap[] {
  /* features nunca vira gap aqui: sem campo no formulário, não há ação
     para o creator; gaps desconhecidos continuam descartados. */
  const known: string[] = ["name", "description", "category", "price", "priceCurrency"];
  return Array.isArray(value)
    ? value.filter(
        (item): item is CandidateGap => typeof item === "string" && known.includes(item),
      )
    : [];
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalSignals(value: unknown): ProductSignals | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const signal = (key: string) => {
    const raw = record[key];
    return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
  };
  const salesCount = signal("salesCount");
  const ratingValue = signal("ratingValue");
  const reviewCount = signal("reviewCount");
  const signals: ProductSignals = {
    ...(salesCount !== undefined ? { salesCount } : {}),
    ...(ratingValue !== undefined ? { ratingValue } : {}),
    ...(reviewCount !== undefined ? { reviewCount } : {}),
  };
  return Object.keys(signals).length > 0 ? signals : undefined;
}

export async function importProduct(
  url: string,
  idempotencyKey: string,
): Promise<ProductImportResult> {
  if (!URL_IMPORT_ENABLED) {
    throw new ProductApiError({
      status: 503,
      message: "A importação por URL está temporariamente indisponível; preencha os dados manualmente.",
      code: "IMPORT-DISABLED",
    });
  }
  const data = await request<unknown>("/api/products/import", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ url }),
  });
  if (typeof data !== "object" || data === null)
    throw new Error("Resposta de importação inválida.");
  const response = data as Record<string, unknown>;
  const raw =
    typeof response.candidate === "object" && response.candidate !== null
      ? (response.candidate as Record<string, unknown>)
      : null;
  if (!raw) throw new Error("Resposta de importação inválida.");

  const fact = (key: string) => {
    const value = optionalString(raw[key]);
    return value ? { [key]: value } : {};
  };
  const discountValue = optionalString(raw.discountValue);
  const discount =
    raw.discountType === "PERCENTAGE" && discountValue
      ? { discountType: "PERCENTAGE" as const, discountValue }
      : {};
  const gaps = candidateGaps(raw.gaps);
  const signals = optionalSignals(raw.signals);
  const candidate: ProductImportCandidate = {
    ...fact("name"),
    ...fact("description"),
    ...fact("category"),
    ...fact("price"),
    ...fact("priceCurrency"),
    features: listValue(raw.features),
    // Primeira imagem apenas; a galeria restante não entra no contrato.
    imageRefs: listValue(raw.imageRefs).slice(0, 1),
    sourceUrl: optionalString(raw.sourceUrl) ?? url,
    ...discount,
    gaps,
    ...(signals ? { signals } : {}),
  };
  return {
    candidate,
    partial: gaps.length > 0,
    gaps,
    message:
      optionalString(response.message) ??
      "Confira os dados importados antes de salvar.",
  };
}

export async function updateProduct(id: string, payload: ProductPayload) {
  return mutationFromResponse(
    await request<unknown>(`/api/products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  );
}

// ADR-016: archive/reactivate respondem { id, version } (mutação mínima, sem projeção).
// A UI refaz GET autenticado após o commit para ler ActiveProductView/ArchivedProductView.
export async function archiveProduct(id: string) {
  return mutationFromResponse(
    await request<unknown>(`/api/products/${encodeURIComponent(id)}/archive`, {
      method: "POST",
    }),
  );
}

export async function reactivateProduct(id: string) {
  return mutationFromResponse(
    await request<unknown>(
      `/api/products/${encodeURIComponent(id)}/reactivate`,
      { method: "POST" },
    ),
  );
}

export async function deleteProduct(id: string) {
  await request<unknown>(`/api/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
