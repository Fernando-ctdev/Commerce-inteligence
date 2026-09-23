import type { HistoryCompleteness, HistoryCost, ProductHistoryResponse, ProductHistoryStatus } from "./history-api";
import { formatAmount, formatTimestamp, formatUsageLabel } from "./generation-ui-model";

const statusLabels: Record<ProductHistoryStatus, string> = {
  QUEUED: "Na fila", RUNNING: "Em andamento", SUCCEEDED: "Concluída", SUCCEEDED_PARTIAL: "Concluída parcialmente", FAILED: "Falhou", CANCELLED: "Cancelada",
};
const completenessLabels: Record<HistoryCompleteness, string> = { COMPLETE: "Completo", PARTIAL: "Parcial", UNAVAILABLE: "Indisponível" };

export type HistoryCostView = { label: string; completenessLabel: string; completeness: HistoryCompleteness };
export type HistoryJobView = {
  /** Correlação sanitizada (ADR-017); null até o DTO do histórico expor o campo — a UI exibe "Job indisponível". */
  jobId: string | null;
  dateLabel: string;
  finishedLabel: string | null;
  statusLabel: string;
  requestedContentsLabel: string;
  usageLabel: string | null;
  cost: HistoryCostView;
  contents: Array<{ positionLabel: string; cost: HistoryCostView }>;
};
export type HistoryViewModel = { jobs: HistoryJobView[] };

function costView(value: HistoryCost): HistoryCostView {
  const label = value.amountMinor !== null && value.currency ? formatAmount(value.amountMinor, value.currency) : "Custo indisponível";
  return { label, completenessLabel: completenessLabels[value.completeness], completeness: value.completeness };
}

export function historyViewModel(history: ProductHistoryResponse): HistoryViewModel {
  return {
    jobs: history.jobs.map((job) => ({
      jobId: job.jobId ?? null,
      dateLabel: formatTimestamp(job.createdAt) ?? "Data indisponível",
      finishedLabel: formatTimestamp(job.finishedAt),
      statusLabel: statusLabels[job.status],
      requestedContentsLabel: `${job.requestedContents} ${job.requestedContents === 1 ? "conteúdo solicitado" : "conteúdos solicitados"}`,
      usageLabel: formatUsageLabel(job.usage ?? null),
      cost: costView(job.cost),
      contents: job.contents.map((content) => ({ positionLabel: `Conteúdo ${content.position}`, cost: costView(content.cost) })),
    })),
  };
}
