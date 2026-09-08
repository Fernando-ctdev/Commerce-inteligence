import type { CommerceJobStage, CommerceJobStatus } from "./generation-api";

/** Projeção server-authoritative do ADR-016 (ActiveProductView); archived omite o campo. */
export type GenerationActionProjection =
  | { state: "AVAILABLE"; reason: null; nextAction: null }
  | { state: "BLOCKED"; reason: "GEN-ACTIVE" | "GEN-CAPACITY"; nextAction: "VIEW_ACTIVE_ANALYSIS" | "WAIT_FOR_CAPACITY" };

/** Tolerante a payload antigo: campo ausente/malformado volta como undefined sem quebrar a leitura. */
export function normalizeGenerationAction(value: unknown): GenerationActionProjection | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.state === "AVAILABLE" && record.reason === null && record.nextAction === null) return { state: "AVAILABLE", reason: null, nextAction: null };
  if (record.state === "BLOCKED" && record.reason === "GEN-ACTIVE" && record.nextAction === "VIEW_ACTIVE_ANALYSIS") {
    return { state: "BLOCKED", reason: record.reason, nextAction: record.nextAction };
  }
  if (record.state === "BLOCKED" && record.reason === "GEN-CAPACITY" && record.nextAction === "WAIT_FOR_CAPACITY") {
    return { state: "BLOCKED", reason: record.reason, nextAction: record.nextAction };
  }
  return undefined;
}

/** Explicação pt-BR com próxima ação; a UI nunca traduz o enum para outra cópia. */
export function blockedActionCopy(action: GenerationActionProjection): string | null {
  if (action.state !== "BLOCKED") return null;
  return action.reason === "GEN-ACTIVE" ? BLOCKED_ACTIVE_MESSAGE : CAPACITY_UNAVAILABLE_MESSAGE;
}

export const stageMessages: Record<CommerceJobStage, string> = {
  UNDERSTANDING_PRODUCT: "Entendendo o produto",
  MAPPING_COMMERCIAL_OPPORTUNITIES: "Mapeando oportunidades",
  BUILDING_STRATEGY: "Definindo estratégias",
  BUILDING_CONTENT_PLAN: "Organizando os conteúdos",
  GENERATING_BRIEFS: "Preparando os Briefings",
  FINALIZING: "Finalizando",
};

export const statusLabels: Record<CommerceJobStatus, string> = {
  QUEUED: "Na fila",
  RUNNING: "Analisando",
  SUCCEEDED: "Pronto",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

export function stageMessage(stage: CommerceJobStage | null) {
  return stage ? stageMessages[stage] : "Preparando a análise...";
}

export function statusMessage(status: CommerceJobStatus, productName?: string) {
  if (status === "QUEUED") return `${productName ? `${productName} foi confirmado. ` : ""}A análise começará em breve.`;
  if (status === "RUNNING") return "A análise continua em segundo plano. Você pode continuar usando a aplicação.";
  if (status === "SUCCEEDED") return "Seu produto está pronto para revisão.";
  if (status === "CANCELLED") return "A análise foi cancelada.";
  return "Não foi possível concluir a análise. Seus dados permanecem preservados.";
}

export const generationStatusLabel = (status: CommerceJobStatus | string) =>
  statusLabels[status as CommerceJobStatus] ?? "Estado desconhecido";

export const isActiveGeneration = (status?: CommerceJobStatus | string | null) =>
  status === "QUEUED" || status === "RUNNING" || status === "queued" || status === "running";

export const isRetryableGeneration = (status?: CommerceJobStatus | string | null) =>
  status === "FAILED" || status === "CANCELLED" || status === "failed" || status === "cancelled";

/** Cancelamento seguro existe apenas na fila; RUNNING responde 409 GEN-CANCEL-UNSAFE. */
export const canCancelGeneration = (status?: CommerceJobStatus | string | null) =>
  status === "QUEUED";

export const isActiveLimitError = (code?: string | null) => code === "GEN-ACTIVE";

/** Não é conhecível antes do POST: permanece erro pós-clique, sem preflight. */
export const isCapacityUnavailableError = (code?: string | null) =>
  code === "GEN-CAPACITY" || code === "GEN-PRODUCT-CAPACITY";

export const BLOCKED_ACTIVE_MESSAGE =
  "Uma análise já está em andamento. Aguarde a conclusão para analisar este produto.";
export const CAPACITY_UNAVAILABLE_MESSAGE =
  "Não há capacidade disponível para gerar esses conteúdos agora. Tente novamente quando houver capacidade.";

/**
 * Dismiss do GenerationToast persiste enquanto o Job e o estado forem os
 * mesmos — inclusive entre páginas, na mesma árvore React. Job diferente,
 * estado diferente ou Job ausente reapresenta legitimamente.
 */
export function isToastDismissed(dismissedSnapshot: string | null, job: { id: string; status: string } | null): boolean {
  if (!job) return true;
  if (!dismissedSnapshot) return false;
  return dismissedSnapshot === `${job.id}:${job.status}`;
}

/** Estado de cada fase pública do job, derivado apenas de status + stage. */
export type PhaseState = "done" | "active" | "failed" | "pending" | "skipped";

export const phaseStateLabels: Record<PhaseState, string> = {
  active: "Em andamento",
  done: "Concluída",
  failed: "Falhou",
  pending: "Aguardando",
  skipped: "Cancelada",
};

const stageOrder = Object.keys(stageMessages) as CommerceJobStage[];

/**
 * Log operacional das fases públicas (B-003-05): o worker persiste cada stage
 * antes do trabalho, então o stage atual é a fase em execução — ou, em job
 * terminal malsucedido, a fase onde a falha ocorreu. Nenhuma fase inventada.
 */
export function phaseStates(
  status: CommerceJobStatus,
  stage: CommerceJobStage | null,
): Array<{ stage: CommerceJobStage; state: PhaseState }> {
  const currentIndex = stage ? stageOrder.indexOf(stage) : -1;
  return stageOrder.map((current) => {
    if (status === "SUCCEEDED") return { stage: current, state: "done" };
    if (currentIndex < 0) return { stage: current, state: "pending" };
    const index = stageOrder.indexOf(current);
    if (index < currentIndex) return { stage: current, state: "done" };
    if (index === currentIndex) {
      return { stage: current, state: status === "FAILED" || status === "CANCELLED" ? "failed" : "active" };
    }
    return { stage: current, state: "skipped" };
  });
}
