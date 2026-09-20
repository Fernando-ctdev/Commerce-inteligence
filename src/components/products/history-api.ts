export type ProductHistoryStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED" | "CANCELLED";
export type HistoryCompleteness = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
export type HistoryCost = { currency: string | null; amountMinor: string | null; completeness: HistoryCompleteness };
export type ProductHistoryResponse = {
  jobs: Array<{
    status: ProductHistoryStatus;
    createdAt: string;
    finishedAt: string | null;
    requestedContents: number;
    cost: HistoryCost;
    /** Contrato de observabilidade: presentes quando o backend os expuser; ausentes → UI exibe estado indisponível. */
    jobId?: string;
    usage?: { inputTokens: number | null; outputTokens: number | null };
    contents: Array<{ position: number; cost: HistoryCost }>;
  }>;
};

export class HistoryApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HistoryApiError";
  }
}

const statuses: Record<ProductHistoryStatus, true> = {
  QUEUED: true, RUNNING: true, SUCCEEDED: true, SUCCEEDED_PARTIAL: true, FAILED: true, CANCELLED: true,
};
const completeness: Record<HistoryCompleteness, true> = { COMPLETE: true, PARTIAL: true, UNAVAILABLE: true };
const object = (value: unknown) => typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
const requiredString = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const nullableString = (value: unknown) => value === null || typeof value === "string" ? value : undefined;

function invalid(): never { throw new HistoryApiError(0, "Resposta do histórico inválida."); }
function cost(value: unknown): HistoryCost {
  const record = object(value);
  const currency = nullableString(record?.currency);
  const amountMinor = nullableString(record?.amountMinor);
  const state = record?.completeness;
  if (currency === undefined || amountMinor === undefined || typeof state !== "string" || !(state in completeness)) invalid();
  if (amountMinor !== null && !/^\d+$/.test(amountMinor)) invalid();
  return { currency, amountMinor, completeness: state as HistoryCompleteness };
}

/** Contrato de observabilidade: repassa jobId/usage allowlist apenas quando presentes; null preservado distinto de 0. Provider/modelo/tier/prompt/metadata bruta nunca são lidos. */
function optionalObservability(rawJob: Record<string, unknown>): { jobId?: string; usage?: { inputTokens: number | null; outputTokens: number | null } } {
  const jobId = typeof rawJob.jobId === "string" && rawJob.jobId.trim() ? rawJob.jobId.trim() : undefined;
  const usageRecord = object(rawJob.usage);
  const usage = usageRecord
    ? {
        inputTokens: typeof usageRecord.inputTokens === "number" && Number.isFinite(usageRecord.inputTokens) ? usageRecord.inputTokens : null,
        outputTokens: typeof usageRecord.outputTokens === "number" && Number.isFinite(usageRecord.outputTokens) ? usageRecord.outputTokens : null,
      }
    : undefined;
  return {
    ...(jobId ? { jobId } : {}),
    ...(usage ? { usage } : {}),
  };
}

export function normalizeProductHistory(value: unknown): ProductHistoryResponse {
  const record = object(value);
  if (!record || !Array.isArray(record.jobs)) invalid();
  return {
    jobs: record.jobs.map((raw) => {
      const job = object(raw);
      const status = job?.status;
      const createdAt = requiredString(job?.createdAt);
      const finishedAt = nullableString(job?.finishedAt);
      const requestedContents = job?.requestedContents;
      if (typeof status !== "string" || !(status in statuses) || !createdAt || finishedAt === undefined ||
        (typeof requestedContents !== "number" || !Number.isInteger(requestedContents) || requestedContents < 0) || !Array.isArray(job?.contents)) invalid();
      return {
        status: status as ProductHistoryStatus,
        createdAt,
        finishedAt,
        requestedContents,
        cost: cost(job.cost),
        ...optionalObservability(job),
        contents: job.contents.map((rawContent) => {
          const content = object(rawContent);
          const position = content?.position;
          if (!content || typeof position !== "number" || !Number.isInteger(position) || position < 1) invalid();
          return { position, cost: cost(content.cost) };
        }),
      };
    }),
  };
}

export async function loadProductHistory(productId: string): Promise<ProductHistoryResponse> {
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}/history`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  }).catch(() => null);
  const body: unknown = response ? await response.json().catch(() => null) : null;
  if (!response) throw new HistoryApiError(0, "Não foi possível carregar o histórico agora.");
  if (!response.ok) {
    const error = object(body)?.error;
    throw new HistoryApiError(response.status, typeof error === "string" ? error : "Não foi possível carregar o histórico agora.");
  }
  return normalizeProductHistory(body);
}
