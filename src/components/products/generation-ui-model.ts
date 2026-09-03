import type { CommerceJobStage, CommerceJobStatus } from "./generation-api";

export const stageMessages: Record<CommerceJobStage, string> = {
  UNDERSTANDING_PRODUCT: "Entendendo o produto...",
  MAPPING_COMMERCIAL_OPPORTUNITIES: "Mapeando oportunidades comerciais...",
  BUILDING_STRATEGY: "Definindo a melhor estratégia para este produto...",
  BUILDING_CONTENT_PLAN: "Organizando as oportunidades de conteúdo...",
  GENERATING_BRIEFS: "Preparando os Briefings do Conteúdo...",
  FINALIZING: "Finalizando...",
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
  if (status === "CANCELLED") return "A análise foi cancelada. Você pode tentar novamente.";
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
  "Uma análise já está em andamento. Acompanhe o progresso no indicador acima.";
export const CAPACITY_UNAVAILABLE_MESSAGE =
  "Não há capacidade disponível para gerar esses conteúdos agora. Tente novamente quando houver capacidade.";
