export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type GenerationRecord = {
  id: string;
  productId: string;
  status: GenerationStatus;
  quantity: number;
  objective: string | null;
  previousRunId: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attemptCount: number;
  error: string | null;
  strategy: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  contents: Array<Record<string, unknown>>;
  provenance: Record<string, unknown> | null;
};

export class GenerationApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "GenerationApiError";
  }
}

function sanitizeGenerationError(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sanitized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  return sanitized || null;
}

export function isCompleteGenerationResult(value: Pick<GenerationRecord, "status" | "quantity" | "strategy" | "plan" | "contents">): boolean {
  return value.status !== "succeeded" || (value.strategy !== null && value.plan !== null && value.contents.length === value.quantity);
}

function key() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createGenerationIdempotencyKey() {
  return key();
}

const generationStoragePrefix = "commerce-intelligence:generation-run:";

function generationStorageKey(productId: string) {
  return `${generationStoragePrefix}${productId}`;
}

export function rememberGeneration(productId: string, generationId: string) {
  try {
    window.localStorage.setItem(generationStorageKey(productId), generationId);
  } catch {
    // A run continua autoritativa no servidor; armazenamento indisponível só impede o ponteiro local.
  }
}

function forgetGeneration(productId: string) {
  try {
    window.localStorage.removeItem(generationStorageKey(productId));
  } catch {
    // A ausência de armazenamento não altera a run no servidor.
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers }, ...init }).catch(() => null);
  const data: unknown = response ? await response.json().catch(() => null) : null;
  if (!response) throw new GenerationApiError(0, "Não foi possível conectar agora. Tente novamente.");
  if (!response.ok) {
    const body = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
    throw new GenerationApiError(response.status, typeof body.error === "string" ? body.error : "Não foi possível concluir a geração.", typeof body.code === "string" ? body.code : undefined, typeof body.fieldErrors === "object" && body.fieldErrors !== null ? body.fieldErrors as Record<string, string> : {});
  }
  return data as T;
}

export function normalizeGeneration(value: unknown): GenerationRecord {
  if (typeof value !== "object" || value === null) throw new GenerationApiError(0, "Resposta de Generation inválida.");
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (status !== "queued" && status !== "running" && status !== "succeeded" && status !== "failed" && status !== "cancelled") throw new GenerationApiError(0, "Resposta de Generation inválida.");
  const normalized = {
    id: String(record.id ?? ""),
    productId: String(record.productId ?? ""),
    status,
    quantity: typeof record.quantity === "number" ? record.quantity : 0,
    objective: typeof record.objective === "string" ? record.objective : null,
    previousRunId: typeof record.previousRunId === "string" ? record.previousRunId : null,
    queuedAt: String(record.queuedAt ?? ""),
    startedAt: typeof record.startedAt === "string" ? record.startedAt : null,
    finishedAt: typeof record.finishedAt === "string" ? record.finishedAt : null,
    attemptCount: typeof record.attemptCount === "number" ? record.attemptCount : 0,
    error: sanitizeGenerationError(record.error),
    strategy: typeof record.strategy === "object" && record.strategy !== null ? record.strategy as Record<string, unknown> : null,
    plan: typeof record.plan === "object" && record.plan !== null ? record.plan as Record<string, unknown> : null,
    contents: Array.isArray(record.contents) ? record.contents.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [],
    provenance: typeof record.provenance === "object" && record.provenance !== null ? record.provenance as Record<string, unknown> : null,
  };
  if (!isCompleteGenerationResult(normalized)) throw new GenerationApiError(0, "O resultado da geração está incompleto.", "generation_incomplete");
  return normalized;
}

export async function startGeneration(productId: string, quantity: number, objective: string, idempotencyKey: string) {
  return normalizeGeneration(await request<unknown>("/api/generations", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ productId, quantity, objective: objective || undefined }) }));
}

export async function getGeneration(id: string) {
  return normalizeGeneration(await request<unknown>(`/api/generations/${encodeURIComponent(id)}`, { method: "GET" }));
}

export async function getLatestGeneration(productId: string): Promise<GenerationRecord | null> {
  let generationId: string | null;
  try {
    generationId = window.localStorage.getItem(generationStorageKey(productId));
  } catch (caught) {
    throw new GenerationApiError(0, "Não foi possível restaurar a geração deste produto.", "generation_restore_unavailable");
  }
  if (!generationId) return null;
  try {
    const generation = await getGeneration(generationId);
    if (generation.productId !== productId) {
      forgetGeneration(productId);
      return null;
    }
    return generation;
  } catch (caught) {
    if (caught instanceof GenerationApiError && caught.status === 404) {
      forgetGeneration(productId);
      return null;
    }
    throw caught;
  }
}

export async function cancelGeneration(id: string) {
  return normalizeGeneration(await request<unknown>(`/api/generations/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" }));
}

export async function retryGeneration(id: string, idempotencyKey: string) {
  return normalizeGeneration(await request<unknown>(`/api/generations/${encodeURIComponent(id)}/retry`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: "{}" }));
}
