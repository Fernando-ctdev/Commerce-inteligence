import type { HistoryCompleteness, HistoryCost, ProductHistoryResponse, ProductHistoryStatus } from "./history-api";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const statusLabels: Record<ProductHistoryStatus, string> = {
  QUEUED: "Na fila", RUNNING: "Em andamento", SUCCEEDED: "Concluída", SUCCEEDED_PARTIAL: "Concluída parcialmente", FAILED: "Falhou", CANCELLED: "Cancelada",
};
const completenessLabels: Record<HistoryCompleteness, string> = { COMPLETE: "Completo", PARTIAL: "Parcial", UNAVAILABLE: "Indisponível" };

export type HistoryCostView = { label: string; completenessLabel: string; completeness: HistoryCompleteness };
export type HistoryJobView = {
  dateLabel: string;
  statusLabel: string;
  requestedContentsLabel: string;
  cost: HistoryCostView;
  contents: Array<{ positionLabel: string; cost: HistoryCostView }>;
};
export type HistoryViewModel = { jobs: HistoryJobView[] };

function formatAmount(amountMinor: string, currency: string): string {
  try {
    const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const units = 10n ** BigInt(digits);
    const minor = BigInt(amountMinor);
    const major = minor / units;
    const fraction = digits === 0 ? "" : String(minor % units).padStart(digits, "0");
    if (!fraction) return formatter.format(major);
    const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1 }).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ",";
    const majorText = formatter.formatToParts(major)
      .filter((part) => part.type !== "fraction" && part.type !== "decimal")
      .map((part) => part.value)
      .join("");
    return `${majorText}${decimal}${fraction}`.replaceAll("\u00a0", " ");
  } catch {
    return `${currency} ${amountMinor}`;
  }
}

function costView(value: HistoryCost): HistoryCostView {
  const label = value.amountMinor !== null && value.currency ? formatAmount(value.amountMinor, value.currency) : "Custo indisponível";
  return { label, completenessLabel: completenessLabels[value.completeness], completeness: value.completeness };
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : dateFormat.format(date);
}

export function historyViewModel(history: ProductHistoryResponse): HistoryViewModel {
  return {
    jobs: history.jobs.map((job) => ({
      dateLabel: dateLabel(job.createdAt),
      statusLabel: statusLabels[job.status],
      requestedContentsLabel: `${job.requestedContents} ${job.requestedContents === 1 ? "conteúdo solicitado" : "conteúdos solicitados"}`,
      cost: costView(job.cost),
      contents: job.contents.map((content) => ({ positionLabel: `Conteúdo ${content.position}`, cost: costView(content.cost) })),
    })),
  };
}
