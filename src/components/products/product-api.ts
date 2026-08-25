import type { ProductFieldErrors, ProductPayload } from "./product-form-model";

export type EnrichmentStatus = "none" | "pending" | "completed" | "unavailable";

export type ProductRecord = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  price: string;
  characteristics: string[];
  imageReferences: string[];
  observations: string;
  url: string;
  context: {
    locale: "pt-BR";
    objective: string;
    audience: string;
    style: string;
    presence: string;
    experience: string;
    restrictions: string;
    market: string;
    observations: string;
  };
  readyForStrategy: boolean;
  active: boolean;
  enrichmentStatus: EnrichmentStatus;
};

export type ProductMutation = {
  id: string;
  version: number;
  replay?: boolean;
  readyForStrategy?: boolean;
};

export type ProductApiErrorOptions = {
  status: number;
  message: string;
  fieldErrors?: ProductFieldErrors;
  code?: string;
};

export class ProductApiError extends Error {
  readonly status: number;
  readonly fieldErrors: ProductFieldErrors;
  readonly code?: string;

  constructor({ status, message, fieldErrors = {}, code }: ProductApiErrorOptions) {
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
  if (Array.isArray(value)) return value.map(stringValue).map((item) => item.trim()).filter(Boolean);
  return stringValue(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function contextValue(value: Record<string, unknown>, key: string) {
  return nullableString(value[key]);
}

const serverFieldNames: Record<string, keyof ProductFieldErrors> = {
  name: "name",
  description: "description",
  category: "category",
  price: "price",
  features: "characteristics",
  imageRefs: "imageReferences",
  notes: "observations",
  url: "url",
  "context.goal": "objective",
  "context.audience": "audience",
  "context.style": "style",
  "context.creatorPresence": "presence",
  "context.experience": "experience",
  "context.constraints": "restrictions",
  "context.market": "market",
  "context.notes": "contextObservations",
};

function mapFieldErrors(value: unknown): ProductFieldErrors {
  if (typeof value !== "object" || value === null) return {};
  return Object.entries(value).reduce<ProductFieldErrors>((errors, [key, message]) => {
    const field = serverFieldNames[key] ?? (key in serverFieldNames ? serverFieldNames[key] : undefined);
    if (field && typeof message === "string") errors[field] = message;
    return errors;
  }, {});
}

export function normalizeProduct(value: unknown): ProductRecord {
  if (typeof value !== "object" || value === null) throw new Error("Resposta de Product inválida.");
  const record = value as Record<string, unknown>;
  const context = (record.context ?? record.strategy_context ?? {}) as Record<string, unknown>;
  const url = nullableString(record.url);
  const rawEnrichment = record.enrichmentStatus ?? record.enrichment_status ?? record.url_enrichment_status;
  const enrichmentStatus: EnrichmentStatus = rawEnrichment === "pending" || rawEnrichment === "completed" || rawEnrichment === "none"
    ? rawEnrichment
    : url ? "unavailable" : "none";
  const rawCents = record.priceCents ?? record.price_cents;
  const cents = typeof rawCents === "number" ? rawCents : typeof rawCents === "string" && /^\d+$/.test(rawCents) ? Number(rawCents) : null;
  const rawPrice = record.price ?? record.price_brl;
  const price = cents !== null ? (cents / 100).toFixed(2).replace(".", ",") : nullableString(rawPrice);
  const readyForStrategy = typeof record.readyForStrategy === "boolean" ? record.readyForStrategy : Boolean(record.context ?? record.strategy_context);

  return {
    id: nullableString(record.id ?? record.product_id),
    version: typeof record.version === "number" ? record.version : 0,
    name: nullableString(record.name),
    description: nullableString(record.description),
    category: nullableString(record.category),
    price,
    characteristics: listValue(record.features ?? record.characteristics),
    imageReferences: listValue(record.imageRefs ?? record.imageReferences ?? record.image_references),
    observations: nullableString(record.notes ?? record.observations),
    url,
    context: {
      locale: "pt-BR",
      objective: contextValue(context, "goal") || contextValue(context, "objective"),
      audience: contextValue(context, "audience"),
      style: contextValue(context, "style"),
      presence: contextValue(context, "creatorPresence") || contextValue(context, "presence"),
      experience: contextValue(context, "experience"),
      restrictions: contextValue(context, "constraints") || contextValue(context, "restrictions"),
      market: contextValue(context, "market"),
      observations: contextValue(context, "notes") || contextValue(context, "observations"),
    },
    readyForStrategy,
    active: record.active !== false,
    enrichmentStatus,
  };
}

function productFromResponse(value: unknown) {
  if (typeof value === "object" && value !== null && "product" in value) {
    return normalizeProduct((value as { product: unknown }).product);
  }
  return normalizeProduct(value);
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
    ...init,
  }).catch(() => null);

  const data: unknown = response ? await response.json().catch(() => null) : null;
  if (!response) throw new ProductApiError({ status: 0, message: "Não foi possível conectar agora. Tente novamente." });
  if (!response.ok) {
    const body = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
    throw new ProductApiError({
      status: response.status,
      code: typeof body.code === "string" ? body.code : undefined,
      message: typeof body.error === "string" ? body.error : "Não foi possível concluir esta ação.",
      fieldErrors: mapFieldErrors(body.fieldErrors),
    });
  }
  return data as T;
}

export async function listProducts() {
  const data = await request<unknown>("/api/products", { method: "GET" });
  if (Array.isArray(data)) return data.map(normalizeProduct);
  if (typeof data === "object" && data !== null && "products" in data && Array.isArray((data as { products: unknown }).products)) {
    return (data as { products: unknown[] }).products.map(normalizeProduct);
  }
  return [];
}

export async function getProduct(id: string) {
  return productFromResponse(await request<unknown>(`/api/products/${encodeURIComponent(id)}`, { method: "GET" }));
}

function mutationFromResponse(value: unknown): ProductMutation {
  if (typeof value !== "object" || value === null) throw new Error("Resposta de Product inválida.");
  const record = value as Record<string, unknown>;
  const id = nullableString(record.id ?? record.product_id);
  const version = typeof record.version === "number" ? record.version : null;
  if (!id || version === null) throw new Error("Resposta de Product inválida.");
  return {
    id,
    version,
    replay: record.replay === true,
    readyForStrategy: typeof record.readyForStrategy === "boolean" ? record.readyForStrategy : undefined,
  };
}

export async function createProduct(payload: ProductPayload) {
  const { idempotency_key: idempotencyKey, ...body } = payload;
  return mutationFromResponse(await request<unknown>("/api/products", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: JSON.stringify(body),
  }));
}

export async function updateProduct(id: string, payload: ProductPayload) {
  return mutationFromResponse(await request<unknown>(`/api/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }));
}

export async function requestEnrichment(id: string) {
  const data = await request<unknown>(`/api/products/${encodeURIComponent(id)}/enrichment`, { method: "POST", body: JSON.stringify({}) });
  if (typeof data === "object" && data !== null) {
    const status = (data as Record<string, unknown>).enrichmentStatus;
    if (status === "pending" || status === "completed" || status === "unavailable") return status;
  }
  return "unavailable" as const;
}
