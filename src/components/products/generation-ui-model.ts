import type { CommerceJobStage, CommerceJobStatus } from "./generation-api";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const strings = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

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
  risks: string[];
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
    risks: strings(strategy?.communicationRisks),
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
  scenes: string[];
  cta: string;
  objective: string;
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

export function briefingItems(contents: Array<Record<string, unknown>>): BriefingItem[] {
  return contents
    .map((content, index): BriefingItem => ({
      id: text(content.id) || `conteudo-${index + 1}`,
      position: typeof content.position === "number" ? content.position : index + 1,
      status: text(content.status) || "DRAFT",
      hook: text(content.hook),
      development: strings(content.development),
      script: text(content.script),
      scenes: strings(content.scenes),
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
