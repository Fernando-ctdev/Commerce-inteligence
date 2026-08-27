import type { ProductCandidate, ProductImportRecord } from "./product-import-model";

export class ProductImportApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ProductImportApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers },
    ...init,
  }).catch(() => null);
  const data: unknown = response ? await response.json().catch(() => null) : null;
  if (!response) throw new ProductImportApiError(0, "Não foi possível conectar agora. Tente novamente.");
  if (!response.ok) {
    const body = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
    throw new ProductImportApiError(
      response.status,
      typeof body.error === "string" ? body.error : "Não foi possível analisar este produto.",
      typeof body.code === "string" ? body.code : undefined,
    );
  }
  return data as T;
}

export async function startProductImport(url: string, idempotencyKey: string) {
  return normalizeImport(await request<unknown>("/api/product-imports", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ url }),
  }));
}

export async function getProductImport(id: string) {
  return normalizeImport(await request<unknown>(`/api/product-imports/${encodeURIComponent(id)}`));
}

export async function cancelProductImport(id: string) {
  return normalizeImport(await request<unknown>(`/api/product-imports/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" }));
}

export async function retryProductImport(id: string, idempotencyKey: string) {
  return normalizeImport(await request<unknown>(`/api/product-imports/${encodeURIComponent(id)}/retry`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: "{}",
  }));
}

export async function resumeProductImport(id: string) {
  return normalizeImport(await request<unknown>(`/api/product-imports/${encodeURIComponent(id)}/resume`, { method: "POST", body: "{}" }));
}

export async function confirmProductImport(id: string, version: number, candidate: ProductCandidate) {
  const response = await request<{ id?: string; productId?: string; duplicate?: boolean }>("/api/products/confirm", {
    method: "POST",
    body: JSON.stringify({
      attemptId: id,
      expectedCandidateVersion: version,
      facts: {
        name: candidate.name,
        description: candidate.description,
        category: candidate.category,
        brand: candidate.brand,
        seller: candidate.seller,
        price: candidate.price,
        features: candidate.features,
        variants: candidate.variants,
        images: candidate.images,
      },
    }),
  });
  return {
    duplicate: response.duplicate === true,
    productId: typeof response.productId === "string" ? response.productId : response.id,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeCandidate(value: unknown, fallbackSourceUrl: string): ProductCandidate | undefined {
  const candidateRecord = asRecord(value);
  if (!candidateRecord) return undefined;
  const facts = asRecord(candidateRecord.facts) ?? candidateRecord;
  const sourceUrl = typeof facts.sourceUrl === "string" ? facts.sourceUrl : typeof candidateRecord.sourceUrl === "string" ? candidateRecord.sourceUrl : fallbackSourceUrl;
  if (!sourceUrl) return undefined;
  const candidate: ProductCandidate = {
    name: typeof facts.name === "string" ? facts.name : "",
    features: stringList(facts.features),
    images: stringList(facts.imageRefs ?? facts.images),
    sourceUrl,
  };
  if (typeof facts.description === "string") candidate.description = facts.description;
  if (typeof facts.category === "string") candidate.category = facts.category;
  if (typeof facts.brand === "string") candidate.brand = facts.brand;
  if (typeof facts.seller === "string") candidate.seller = facts.seller;
  if (Array.isArray(facts.variants)) candidate.variants = stringList(facts.variants);
  if (typeof facts.priceCents === "number" && Number.isFinite(facts.priceCents)) {
    candidate.price = { amount: facts.priceCents / 100, currency: typeof facts.priceCurrency === "string" ? facts.priceCurrency : "" };
  } else {
    const price = asRecord(facts.price);
    if (price && typeof price.amount === "number" && Number.isFinite(price.amount) && typeof price.currency === "string") {
      candidate.price = { amount: price.amount, currency: price.currency };
    }
  }
  return candidate;
}

function normalizeImport(value: unknown): ProductImportRecord {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.sourceUrl !== "string") {
    throw new ProductImportApiError(0, "Resposta de importação inválida.");
  }
  const candidateRecord = asRecord(record.candidate);
  const candidate = normalizeCandidate(record.candidate, record.sourceUrl);
  const state = String(record.uiState ?? record.state ?? record.status ?? "ERROR").toUpperCase() as ProductImportRecord["state"];
  if (!["IDLE", "OPENING", "LOGIN_REQUIRED", "CAPTCHA_REQUIRED", "2FA_REQUIRED", "USER_INTERACTION_REQUIRED", "PAUSED", "CANCELLED", "EXTRACTING", "READY", "ERROR", "CONFIRMING", "CONFIRMED", "DUPLICATE", "PROFILE_UNAVAILABLE", "LIMIT"].includes(state)) {
    throw new ProductImportApiError(0, "Resposta de importação inválida.");
  }
  return {
    id: record.id,
    version: typeof candidateRecord?.version === "number" ? candidateRecord.version : (typeof record.version === "number" ? record.version : 0),
    state,
    sourceUrl: record.sourceUrl,
    candidate,
    gaps: Array.isArray(candidateRecord?.gaps)
      ? candidateRecord.gaps.filter((item): item is string => typeof item === "string")
      : Array.isArray(record.gaps) ? record.gaps.filter((item): item is string => typeof item === "string") : [],
    error: typeof record.error === "string" ? record.error : undefined,
    productId: typeof record.productId === "string" ? record.productId : undefined,
    interactiveUrl: mediatedInteractiveUrl(record.interactiveUrl),
    canResume: record.canResume === true,
  };
}

function mediatedInteractiveUrl(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ? value : undefined;
  } catch {
    return undefined;
  }
}
