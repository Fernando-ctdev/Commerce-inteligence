import type { GenerationStatus } from "./generation-api";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function dimensionLabel(dimensions: Record<string, unknown>, collection: string, id: unknown): string {
  if (typeof id !== "string" || id === "") return "Não informado";
  const values = Array.isArray(dimensions[collection]) ? dimensions[collection] : [];
  const match = values.find((value) => typeof value === "object" && value !== null && (value as Record<string, unknown>).id === id);
  return match ? text((match as Record<string, unknown>).label) || "Dimensão indisponível" : "Dimensão indisponível";
}

export function contentDimensionLabels(strategy: Record<string, unknown> | null, content: Record<string, unknown>) {
  const dimensions = strategy && typeof strategy.dimensions === "object" && strategy.dimensions !== null ? strategy.dimensions as Record<string, unknown> : {};
  return {
    audience: dimensionLabel(dimensions, "audiences", content.audience_id),
    pain: dimensionLabel(dimensions, "pains", content.pain_id),
    desire: dimensionLabel(dimensions, "desires", content.desire_id),
    benefit: dimensionLabel(dimensions, "benefits", content.benefit_id),
    objection: typeof content.objection_id === "string" && content.objection_id !== "" ? dimensionLabel(dimensions, "objections", content.objection_id) : null,
    angle: dimensionLabel(dimensions, "angles", content.angle_id),
  };
}

export function isActiveGeneration(status: GenerationStatus | undefined): boolean {
  return status === "queued" || status === "running";
}

export function isRetryableGeneration(status: GenerationStatus | undefined): boolean {
  return status === "failed" || status === "cancelled";
}

export function generationStatusLabel(status: GenerationStatus): string {
  return status === "queued" ? "Na fila" : status === "running" ? "Gerando" : status === "succeeded" ? "Concluída" : status === "failed" ? "Falha recuperável" : "Cancelada";
}

export function generationStatusMessage(status: GenerationStatus, quantity: number): string {
  return status === "queued"
    ? `O pedido foi recebido para ${quantity} conteúdos.`
    : status === "running"
      ? "A geração está em andamento. Nenhum conteúdo parcial será exibido."
      : status === "succeeded"
        ? "Estratégia, plano e conteúdos completos estão disponíveis."
        : status === "failed"
          ? "A geração não publicou resultado parcial. Você pode tentar novamente."
          : "Nenhum conteúdo parcial foi criado. Você pode tentar novamente.";
}

export function isLimitError(code: string | null): boolean {
  return code === "generation_capacity";
}

export function isCapacityUnavailableError(code: string | null): boolean {
  return code === "capacity_unavailable";
}
