import type { ProductFieldErrors, ProductPayload } from "./product-form-model";

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
  active: boolean;
};

export type ProductMutation = {
  id: string;
  version: number;
  replay?: boolean;
};

export type ServerFieldErrors = ProductFieldErrors &
  Partial<Record<"currency" | "targetContentCount" | "creatorPresence" | "constraints", string>>;

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

/* Chaves do contrato do POST → chaves de erro do cliente. Erros de
   preparação (targetContentCount, creatorPresence, constraints) passam
   com o mesmo nome; chaves desconhecidas continuam descartadas. */
const serverFieldNames: Record<string, string> = {
  name: "name",
  description: "description",
  category: "category",
  price: "price",
  features: "characteristics",
  imageRefs: "imageReferences",
  notes: "observations",
  currency: "currency",
  priceCurrency: "currency",
  targetContentCount: "targetContentCount",
  creatorPresence: "creatorPresence",
  constraints: "constraints",
};

function mapFieldErrors(value: unknown): ServerFieldErrors {
  if (typeof value !== "object" || value === null) return {};
  return Object.entries(value).reduce<ServerFieldErrors>((errors, [key, message]) => {
    const field = serverFieldNames[key];
    if (field && typeof message === "string") {
      errors[field as keyof ServerFieldErrors] = message;
    }
    return errors;
  }, {});
}

export function normalizeProduct(value: unknown): ProductRecord {
  if (typeof value !== "object" || value === null) throw new Error("Resposta de Product inválida.");
  const record = value as Record<string, unknown>;
  const url = nullableString(record.url);
  const rawCents = record.priceCents ?? record.price_cents;
  const cents = typeof rawCents === "number" ? rawCents : typeof rawCents === "string" && /^\d+$/.test(rawCents) ? Number(rawCents) : null;
  const rawPrice = record.price ?? record.price_brl;
  const price = cents !== null ? (cents / 100).toFixed(2).replace(".", ",") : nullableString(rawPrice);
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
    active: record.active !== false,
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
  };
}

export async function createProduct(payload: ProductPayload) {
  /* O POST de criação expõe somente o contrato do Slice 002; campos de
     edição (seller, variants, imageRefs, notes, url, expectedVersion)
     permanecem no PATCH. Campos ausentes caem fora do JSON. */
  const {
    idempotency_key: idempotencyKey,
    name,
    description,
    category,
    price,
    priceCurrency,
    features,
    targetContentCount,
    creatorPresence,
    constraints,
  } = payload;
  return mutationFromResponse(await request<unknown>("/api/products", {
    method: "POST",
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    body: JSON.stringify({ name, description, category, price, priceCurrency, features, targetContentCount, creatorPresence, constraints }),
  }));
}

export async function updateProduct(id: string, payload: ProductPayload) {
  return mutationFromResponse(await request<unknown>(`/api/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }));
}

export async function deleteProduct(id: string) {
  return request<{ id: string }>(`/api/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
