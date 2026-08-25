import type { GenerationRuntimeConfig } from "./runtime";

export type GenerationHealth = {
  status: "ok" | "not_ready";
  liveness: boolean;
  readiness: boolean;
  checks: { database: boolean; queue: boolean; configuration: boolean };
};

export async function generationHealth(input: {
  now?: Date;
  heartbeatAt: Date | null;
  config?: GenerationRuntimeConfig;
  checkDatabase: () => Promise<void>;
  checkQueue: () => Promise<void>;
}): Promise<GenerationHealth> {
  const now = input.now ?? new Date();
  const configuration = input.config !== undefined;
  const database = await input.checkDatabase().then(() => true).catch(() => false);
  const queue = await input.checkQueue().then(() => true).catch(() => false);
  const liveness = configuration && input.heartbeatAt !== null && now.getTime() - input.heartbeatAt.getTime() <= (input.config?.stuckJobAfterMs ?? 0);
  const readiness = configuration && database && queue;
  return { status: liveness && readiness ? "ok" : "not_ready", liveness, readiness, checks: { database, queue, configuration } };
}
