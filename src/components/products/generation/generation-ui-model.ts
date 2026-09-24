import type { CommerceJobStage, CommerceJobStatus } from "./generation-api";
import { type GenerationActionProjection } from "../shared/product-ui-model";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const strings = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

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
  SUCCEEDED_PARTIAL: "Pronto (parcial)",
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
  if (status === "SUCCEEDED_PARTIAL") return "Parte dos conteúdos ficou pronta. Você já pode revisar e gerar os faltantes.";
  if (status === "CANCELLED") return "A análise foi cancelada.";
  return "Não foi possível concluir a análise. Seus dados permanecem preservados.";
}

/** Motivo sanitizado por item faltante (ADR-021): reason code → frase curta pt-BR, sem jargão de engine. */
export function missingReasonLabel(reasonCode: string): string {
  const map: Record<string, string> = {
    unverified_claim: "continha informação não confirmada nos dados do produto",
    script_claim_missing: "não trouxe os dados confirmados do produto",
    feature_list: "descreveu o produto fora do permitido",
    factRef_invalid: "usou um dado inexistente do produto",
    action_stem_missing: "ficou sem uma demonstração clara",
    connector_missing: "ficou sem a justificativa do ponto",
    grounding_below_min: "ficou pouco apoiado nos dados do produto",
  };
  return map[reasonCode] ?? "não convergiu nos critérios de qualidade";
}

/**
 * RI-003-20: terminal positivo não projetável (code GEN-PROJECTION) é ANOMALIA
 * de dados persistida — nem sucesso (nada para revisar) nem falha de execução
 * (retry responderia 404). Modelo explícito das ações: sem "Tentar novamente",
 * sem revisão de conteúdos; /complete só no parcial degradado.
 */
export function projectionDegradedModel(job: { code?: string | null; status: string } | null): { degraded: boolean; retry: false; reviewContents: false; generateMissing: boolean } {
  const degraded = !!job && job.code === "GEN-PROJECTION" && (job.status === "SUCCEEDED" || job.status === "SUCCEEDED_PARTIAL");
  return { degraded, retry: false, reviewContents: false, generateMissing: degraded && job!.status === "SUCCEEDED_PARTIAL" };
}

/** Leitura da entrega parcial (ADR-021): null fora de SUCCEEDED_PARTIAL. */
export type PartialDelivery = { delivered: number; expected: number; missing: Array<{ position: number | null; reason: string }> };
export function partialModel(job: { status: string; targetContentCount: number; expectedCount?: number | null; deliveredCount: number | null; contents: Array<unknown>; missing: Array<{ position: number | null; reasonCode: string }> } | null): PartialDelivery | null {
  if (!job || job.status !== "SUCCEEDED_PARTIAL") return null;
  const delivered = job.deliveredCount ?? job.contents.length;
  return {
    delivered,
    expected: job.expectedCount ?? job.targetContentCount,
    missing: job.missing.map((item) => ({ position: item.position, reason: missingReasonLabel(item.reasonCode) })),
  };
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

/**
 * Modelo de leitura da aba Estratégia: campos tolerantes a payload parcial
 * (subseção ausente simplesmente não renderiza). Vínculos entre públicos/objeções
 * e oportunidades usam apenas match exato de texto — nenhuma relação inventada.
 */
export type StrategyViewData = {
  positioning: string;
  audiences: string[];
  pains: string[];
  desires: string[];
  benefits: string[];
  objections: string[];
  arguments: string[];
  angles: string[];
  principles: string[];
  active: boolean;
  audienceSituations: ReadonlyMap<string, string>;
  objectionArguments: ReadonlyMap<string, string>;
};

export function strategyModel(strategy: Record<string, unknown> | null): StrategyViewData {
  const opportunities = (Array.isArray(strategy?.opportunities) ? strategy.opportunities : [])
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      audience: text(item.audience),
      situation: text(item.situation),
      pain: text(item.pain),
      desire: text(item.desire),
      objection: text(item.objection),
      sellingArgument: text(item.sellingArgument),
    }));
  const unique = (values: string[]) => Array.from(new Set(values));
  // Primeiro match exato por chave; ausência não cria vínculo.
  const firstBy = (key: "audience" | "objection", linked: "situation" | "sellingArgument") => {
    const map = new Map<string, string>();
    for (const item of opportunities) {
      const source = item[key];
      const target = item[linked];
      if (source && target && !map.has(source)) map.set(source, target);
    }
    return map;
  };
  return {
    positioning: text(strategy?.primaryPositioning),
    audiences: strings(strategy?.audiences),
    pains: unique(opportunities.map((item) => item.pain).filter(Boolean)),
    desires: unique(opportunities.map((item) => item.desire).filter(Boolean)),
    benefits: strings(strategy?.priorityBenefits),
    objections: strings(strategy?.priorityObjections),
    arguments: strings(strategy?.priorityArguments),
    angles: strings(strategy?.priorityAngles),
    principles: strings(strategy?.communicationPrinciples),
    active: strategy?.status === "ACTIVE",
    audienceSituations: firstBy("audience", "situation"),
    objectionArguments: firstBy("objection", "sellingArgument"),
  };
}

/**
 * Revisão de Briefings (aba Conteúdos): projeção somente leitura dos campos
 * reais do payload; campos estratégicos opcionais do PRD ficam vazios quando
 * ausentes — nada é inventado na UI.
 */
export type BriefingItem = {
  id: string;
  position: number;
  status: string;
  hook: string;
  development: string[];
  script: string;
  cta: string;
  objective: string;
  scenes: ScenesProjection;
  targetAudience: string;
  pain: string;
  desire: string;
  benefit: string;
  objection: string;
};

/** Estados de revisão do Content; nunca misturar com estados do Estúdio. */
export const contentStatusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
  DISCARDED: "Descartado",
};

export const contentStatusLabel = (status: string) => contentStatusLabels[status] ?? status;

export const contentsSummaryLabel = (total: number, approved: number) =>
  approved > 0 ? `${total} conteúdos · ${approved} aprovados` : `${total} conteúdos`;

/** Development persistido em array, separado do roteiro. */
const developmentBullets = (value: unknown): string[] =>
  Array.isArray(value) ? strings(value) : [];
export function briefingItems(contents: Array<Record<string, unknown>>): BriefingItem[] {
  return contents
    .map((content, index): BriefingItem => ({
      id: text(content.id) || `conteudo-${index + 1}`,
      position: typeof content.position === "number" ? content.position : index + 1,
      status: text(content.status) || "DRAFT",
      hook: text(content.hook),
      development: developmentBullets(content.development),
      scenes: scenesProjection(content),
      script: text(content.script),
      cta: text(content.cta),
      objective: text(content.objective),
      targetAudience: text(content.targetAudience),
      pain: text(content.pain),
      desire: text(content.desire),
      benefit: text(content.benefit),
      objection: text(content.objection),
    }))
    .sort((a, b) => a.position - b.position);
}

/** Roteiro em parágrafos de leitura: uma frase completa por parágrafo, para leitura start-to-end com pausas visuais. */
export function scriptParagraphs(script: string): string[] {
  return script.split(/(?<=[.!?])["']?\s+/u).map((paragraph) => paragraph.trim()).filter(Boolean);
}

/** Projeção de cenas do envelope /api/generations (ADR-019): null = não-gerado (conteúdo antigo ou sem row). */
export type ScenesProjection = { status: "AVAILABLE" | "FILTERED" | "ERROR"; scenes: Array<{ description: string }>; generated: number; dropped: number } | null;

/** Tolerante a payload malformado: forma inválida ou status desconhecido volta como null (não-gerado). */
export function scenesProjection(content: Record<string, unknown>): ScenesProjection {
  const raw = content.scenes;
  if (raw === null || raw === undefined) return null;
  const v = typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!v) return null;
  if (v.status !== "AVAILABLE" && v.status !== "FILTERED" && v.status !== "ERROR") return null;
  const scenes = Array.isArray(v.scenes)
    ? v.scenes.map((scene) => text(typeof scene === "object" && scene !== null ? (scene as Record<string, unknown>).description : undefined)).filter(Boolean).map((description) => ({ description }))
    : [];
  return {
    status: v.status,
    scenes,
    generated: typeof v.generated === "number" ? v.generated : scenes.length,
    dropped: typeof v.dropped === "number" ? v.dropped : 0,
  };
}

/** Estado de cada fase pública do job, derivado apenas de status + stage. */
export type PhaseState = "done" | "active" | "failed" | "pending" | "skipped";

export const phaseStateLabels: Record<PhaseState, string> = {
  active: "Em andamento",
  done: "Concluído",
  failed: "Falhou",
  pending: "Aguardando",
  skipped: "Cancelado",
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
    return {
      stage: current,
      state: status === "FAILED" || status === "CANCELLED" ? "skipped" : "pending",
    };
  });
}

/** Valor de estado indisponível exibido quando o DTO não traz o dado do contrato de observabilidade. */
export const OBSERVABILITY_UNAVAILABLE = "Indisponível";

const timestampFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Timestamp pt-BR curto; ausente ou inválido → null (a UI exibe o estado indisponível, nunca data inventada). */
export function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : timestampFormat.format(date);
}

/** Formata amountMinor (unidades minor / 10^digits da moeda) em pt-BR; preserva o valor agregado. */
export function formatAmount(amountMinor: string, currency: string): string {
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

/** Uso agregado entrada/saída; sem nenhum valor conhecível → null (a UI exibe "Uso indisponível"). */
export function formatUsageLabel(usage: { inputTokens: number | null; outputTokens: number | null } | null | undefined): string | null {
  const parts: string[] = [];
  if (usage?.inputTokens != null) parts.push(`${usage.inputTokens.toLocaleString("pt-BR")} entrada`);
  if (usage?.outputTokens != null) parts.push(`${usage.outputTokens.toLocaleString("pt-BR")} saída`);
  return parts.length > 0 ? `${parts.join(" · ")} (tokens)` : null;
}

/** Custo agregado; sem amountMinor/moeda → null (a UI exibe "Custo indisponível"). */
export function formatCostLabel(cost: { currency: string | null; amountMinor: string | null } | null | undefined): string | null {
  return cost?.amountMinor != null && cost.currency ? formatAmount(cost.amountMinor, cost.currency) : null;
}

/**
 * Contrato de observabilidade (UI): linhas jobId/status/timestamps/uso/custo com
 * estado indisponível explícito. Fonte são os DTOs tenant-scoped existentes
 * (/api/generations); provider, modelo, prompt e metadata bruta nunca entram —
 * o tipo não os carrega e a projeção não os lê.
 */
export type ExecutionObservabilityRow = { label: string; value: string; mono?: boolean };

type ObservabilityJob = {
  id: string;
  status: CommerceJobStatus | string;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  usage?: { inputTokens: number | null; outputTokens: number | null };
  cost?: { currency: string | null; amountMinor: string | null };
};

export function executionObservability(job: ObservabilityJob | null): ExecutionObservabilityRow[] {
  if (!job) return [];
  const row = (label: string, value: string | null, mono = false): ExecutionObservabilityRow =>
    ({ label, value: value ?? OBSERVABILITY_UNAVAILABLE, ...(mono ? { mono: true } : {}) });

  return [
    { label: "Job", value: job.id, mono: true },
    row("Status", generationStatusLabel(job.status)),
    row("Solicitada em", formatTimestamp(job.createdAt)),
    row("Iniciada em", formatTimestamp(job.startedAt)),
    row("Concluída em", formatTimestamp(job.finishedAt)),
    row("Uso", formatUsageLabel(job.usage) ?? "Uso indisponível"),
    row("Custo", formatCostLabel(job.cost) ?? "Custo indisponível"),
  ];
}
