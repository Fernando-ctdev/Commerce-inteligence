export type CommerceJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED" | "CANCELLED";
export type CommerceJobStage = "UNDERSTANDING_PRODUCT" | "MAPPING_COMMERCIAL_OPPORTUNITIES" | "BUILDING_STRATEGY" | "BUILDING_CONTENT_PLAN" | "GENERATING_BRIEFS" | "FINALIZING";
/** Motivo sanitizado por item faltante (ADR-021): reason code server-side, sem detalhes internos. */
export type MissingItemReason = { position: number | null; reasonCode: string };
export type GenerationRecord = { id: string; productId: string; status: CommerceJobStatus; stage: CommerceJobStage | null; targetContentCount: number; error: string | null; strategy: Record<string, unknown> | null; plan: Record<string, unknown> | null; contents: Array<Record<string, unknown>>; readiness: "PENDING" | "ANALYZING" | "READY" | "FAILED"; previousRunId?: string | null; createdAt: string | null; startedAt: string | null; finishedAt: string | null; deliveredCount: number | null; failedCount: number | null; missing: MissingItemReason[]; };
export class GenerationApiError extends Error { constructor(readonly status: number, message: string, readonly code?: string) { super(message); this.name = "GenerationApiError"; } }
const validStages: Record<CommerceJobStage, true> = { UNDERSTANDING_PRODUCT: true, MAPPING_COMMERCIAL_OPPORTUNITIES: true, BUILDING_STRATEGY: true, BUILDING_CONTENT_PLAN: true, GENERATING_BRIEFS: true, FINALIZING: true };
function object(value: unknown) { return typeof value === "object" && value !== null ? value as Record<string, unknown> : null; }
function sanitize(value: unknown) { return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500) || null : null; }
function invalid(message: string, code = "GEN-SCHEMA"): never { throw new GenerationApiError(0, message, code); }
export function normalizeGeneration(value: unknown): GenerationRecord {
  const record = object(value);
  if (!record) invalid("Resposta da análise inválida.");
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const productId = typeof record.productId === "string" ? record.productId.trim() : typeof record.product_id === "string" ? record.product_id.trim() : "";
  const status = String(record.status ?? "").toUpperCase() as CommerceJobStatus;
  const count = (typeof record.targetContentCount === "number" ? record.targetContentCount : record.quantity) as number;
  if (!id || !productId || !Number.isInteger(count) || count < 1 || count > 10) invalid("Resposta da análise inválida.");
  if (!(status in { QUEUED: 1, RUNNING: 1, SUCCEEDED: 1, SUCCEEDED_PARTIAL: 1, FAILED: 1, CANCELLED: 1 })) invalid("Resposta da análise inválida.");
  const stage = typeof record.stage === "string" && record.stage in validStages ? record.stage as CommerceJobStage : null;
  const contents = Array.isArray(record.contents)
    ? record.contents.filter((item): item is Record<string, unknown> => !!object(item)).map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "scenes")))
    : [];
  const partial = status === "SUCCEEDED_PARTIAL";
  const deliveredCount = typeof record.deliveredCount === "number" && Number.isInteger(record.deliveredCount) ? record.deliveredCount : null;
  const failedCount = typeof record.failedCount === "number" && Number.isInteger(record.failedCount) ? record.failedCount : null;
  if (status === "SUCCEEDED" || partial) {
    const expectedPublished = partial ? deliveredCount : count;
    if (!object(record.strategy) || !object(record.plan) || expectedPublished === null || contents.length !== expectedPublished) invalid("O resultado da análise está incompleto.", "GEN-SCHEMA");
    for (const content of contents) {
      if (![ "angle", "hook", "script", "cta" ].every((field) => typeof content[field] === "string" && String(content[field]).trim()) || !Array.isArray(content.development) || content.development.length < 1 || content.development.length > 4 || content.development.some((point) => typeof point !== "string" || !point.trim())) invalid("O resultado da análise está incompleto.", "GEN-SCHEMA");
    }
  }
  const missing = Array.isArray(record.missing)
    ? record.missing.slice(0, count).map((item): MissingItemReason => {
        const v = object(item);
        return { position: v && typeof v.position === "number" && Number.isInteger(v.position) ? v.position : null, reasonCode: v && typeof v.reasonCode === "string" ? v.reasonCode.trim() : "" };
      }).filter((item) => item.reasonCode)
    : [];
  return {
    id,
    productId,
    status,
    stage,
    targetContentCount: count,
    error: sanitize(record.error ?? record.publicError),
    strategy: object(record.strategy),
    plan: object(record.plan),
    contents,
    readiness: record.readiness === "PENDING" || record.readiness === "ANALYZING" || record.readiness === "READY" || record.readiness === "FAILED"
      ? record.readiness
      : status === "SUCCEEDED" || partial ? "READY" : status === "FAILED" || status === "CANCELLED" ? "FAILED" : "ANALYZING",
    previousRunId: typeof record.previousRunId === "string" ? record.previousRunId : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : null,
    finishedAt: typeof record.finishedAt === "string" ? record.finishedAt : null,
    deliveredCount,
    failedCount,
    missing,
  };
}
async function request<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers }, ...init }).catch(() => null); const data: unknown = response ? await response.json().catch(() => null) : null; if (!response) throw new GenerationApiError(0, "Não foi possível conectar agora. Tente novamente."); if (!response.ok) { const body = object(data); throw new GenerationApiError(response.status, typeof body?.error === "string" ? body.error : "Não foi possível concluir a análise.", typeof body?.code === "string" ? body.code : undefined); } return data as T; }
export function createGenerationIdempotencyKey() { const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
export function startGeneration(productId: string, idempotencyKey: string) { return request<{ id?: unknown }>("/api/generations", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ productId }) }).then((value) => { const id = typeof value.id === "string" ? value.id.trim() : ""; if (!id) invalid("Resposta da análise inválida."); return getGeneration(id); }); }
/** ADR-021: retry explícito dos faltantes — novo job com targetContentCount = F; só a partir de SUCCEEDED_PARTIAL. */
export function completeMissingGeneration(id: string, idempotencyKey: string) { return request<unknown>(`/api/generations/${encodeURIComponent(id)}/complete`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: "{}" }).then(normalizeGeneration); }
export function getGeneration(id: string) { return request<unknown>(`/api/generations/${encodeURIComponent(id)}`).then(normalizeGeneration); }
export function getCurrentGeneration() { return request<unknown>("/api/generations/current").then((value) => (value ? normalizeGeneration(value) : null)); }
export function getCurrentGenerationForProduct(productId: string) { return request<unknown>(`/api/generations/current?productId=${encodeURIComponent(productId)}`).then((value) => (value ? normalizeGeneration(value) : null)); }
export function retryGeneration(id: string, idempotencyKey: string) { return request<unknown>(`/api/generations/${encodeURIComponent(id)}/retry`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: "{}" }).then(normalizeGeneration); }
export function cancelGeneration(id: string) { return request<unknown>(`/api/generations/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" }).then(normalizeGeneration); }
export const isActiveGeneration = (status?: CommerceJobStatus | string | null) => status === "QUEUED" || status === "RUNNING" || status === "queued" || status === "running";
export const isRetryableGeneration = (status?: CommerceJobStatus | string | null) => status === "FAILED" || status === "CANCELLED" || status === "failed" || status === "cancelled";
