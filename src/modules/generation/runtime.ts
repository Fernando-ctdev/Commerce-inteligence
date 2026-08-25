export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type GenerationRuntimeConfig = {
  leaseTtlMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
  stuckJobAfterMs: number;
};

export class GenerationOperationalConfigError extends Error {
  constructor() {
    super("A configuração operacional da Generation está ausente ou inválida.");
    this.name = "GenerationOperationalConfigError";
  }
}

function positiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function readGenerationRuntimeConfig(env: Record<string, string | undefined> = process.env): GenerationRuntimeConfig {
  const leaseTtlMs = positiveInteger(env.GENERATION_LEASE_TTL_MS);
  const maxAttempts = positiveInteger(env.GENERATION_MAX_ATTEMPTS);
  const retryBackoffMs = positiveInteger(env.GENERATION_RETRY_BACKOFF_MS);
  const stuckJobAfterMs = positiveInteger(env.GENERATION_STUCK_JOB_AFTER_MS);
  if (leaseTtlMs === null || maxAttempts === null || retryBackoffMs === null || stuckJobAfterMs === null) throw new GenerationOperationalConfigError();
  return { leaseTtlMs, maxAttempts, retryBackoffMs, stuckJobAfterMs };
}

const transitions: Record<GenerationStatus, GenerationStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["queued", "succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function assertGenerationTransition(from: GenerationStatus, to: GenerationStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Transição de Generation inválida: ${from} → ${to}.`);
}

export function isTerminalGenerationStatus(status: GenerationStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
