import type { GenerationStatus } from "./runtime";

export type MetricRun = {
  status: GenerationStatus;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attemptCount: number;
};

export type GenerationMetrics = {
  queue_age_ms: { max: number; count: number };
  duration_ms: { max: number; count: number };
  attempts: { max: number; count: number };
  error_rate: number;
  /** Backlog = runs não terminais (queued + running) e a idade máxima desde queuedAt (PLAN Passo 6). */
  backlog: { non_terminal: number; max_age_ms: number };
  backlog_persistent: boolean;
};

export function collectGenerationMetrics(runs: MetricRun[], now: Date, backlogThresholdMs: number): GenerationMetrics {
  const queueAges = runs.filter((run) => run.status === "queued").map((run) => Math.max(0, now.getTime() - run.queuedAt.getTime()));
  const durations = runs
    .filter((run) => run.startedAt)
    .map((run) => Math.max(0, (run.finishedAt ?? now).getTime() - run.startedAt!.getTime()));
  const attempts = runs.map((run) => run.attemptCount);
  const terminals = runs.filter((run) => run.status === "succeeded" || run.status === "failed" || run.status === "cancelled");
  const errors = terminals.filter((run) => run.status === "failed").length;
  const nonTerminalAges = runs
    .filter((run) => run.status === "queued" || run.status === "running")
    .map((run) => Math.max(0, now.getTime() - run.queuedAt.getTime()));
  return {
    queue_age_ms: { max: Math.max(0, ...queueAges), count: queueAges.length },
    duration_ms: { max: Math.max(0, ...durations), count: durations.length },
    attempts: { max: Math.max(0, ...attempts), count: attempts.length },
    error_rate: terminals.length === 0 ? 0 : errors / terminals.length,
    backlog: { non_terminal: nonTerminalAges.length, max_age_ms: Math.max(0, ...nonTerminalAges) },
    backlog_persistent: nonTerminalAges.some((age) => age >= backlogThresholdMs),
  };
}
