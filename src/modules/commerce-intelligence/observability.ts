// Observabilidade estruturada mínima: uma linha JSON por evento no terminal (JSONL),
// reutilizando o padrão console.info dos logs existentes. Allowlist estrita por evento:
// nunca prompt/payload/segredos/valores de contexto — só hashes, tamanhos e metadados.
export type JobEventName =
  | "job.claimed"
  | "stage.started"
  | "stage.completed"
  | "capability.started"
  | "capability.completed"
  | "capability.failed"
  | "repair.started"
  | "repair.completed"
  | "job.finalizing"
  | "job.reclaimed"
  | "job.terminal"
  // Etapa 4 V2: Planner determinístico, fallback controlado e observações de
  // estilo (proxies lexicais fora da autoridade).
  | "v2.planner.completed"
  | "v2.fallback"
  | "v2.style.observations";

export type JobEventFields = {
  jobId?: string; attempt?: number; stage?: string; task?: string; tier?: string; model?: string; instructionHash?: string;
  durationMs?: number; timeoutMs?: number; requestBytes?: number; trustedContextBytes?: number; externalBytes?: number; responseBytes?: number;
  providerStatus?: number; rootShape?: string; responseKeys?: string[]; arrayLength?: number; endpoint?: string; providerRequestId?: string; providerRequestIdSource?: string;
  expected?: number; received?: number; retry?: number; errorName?: string; errorCode?: string; reservationAction?: string; contextDigest?: string; item?: number; issue?: string; field?: string; errorKind?: string; rate?: Record<string, string>; gateReports?: SanitizedGateReport[]; cardinalityPolicyVersion?: number;
  // Gate de cenas (CONTENT_SCENE_IDEAS): contagem determinística do gateSceneSet.
  kept?: number; dropped?: number;
  // Etapa 4 V2: tamanho do portfolio planejado, motivo sanitizado de fallback e
  // contagem de hooks em pergunta (estilo fora da autoridade do gate).
  planned?: number; reason?: string; questionHooks?: number; plannerPolicyVersion?: string;
  // Etapa 4 V2: proveniência — binding da Skill, política de brief, hash do
  // output do Planner e caminho efetivo (v2 principal / v1 fallback).
  skillBinding?: string; briefPolicyVersion?: string; plannerOutputHash?: string; enginePath?: string;
};

// Resumo sanitizado de GateReport: apenas status determinísticos, decision, issues
// (mensagens de código, nunca conteúdo do briefing) e briefId server-derived.
export type SanitizedGateReport = { briefId: string; factualStatus: string; claimType: string; evidenceRefs: string[]; structuralStatus: string; platformStatus: string; varietyStatus: string; decision: string; issues: string[]; causes: string[] };
const SAFE_GATE_ISSUES = ["claim sem suporte em evidência", "development inválido", "claim sem suporte", "scene_set_invalid"] as const;
function safeGateIssue(value: unknown): string {
  if (typeof value !== "string") return "gate_issue";
  if (SAFE_GATE_ISSUES.includes(value as typeof SAFE_GATE_ISSUES[number])) return value;
  if (/claim sem suporte em evidência/i.test(value)) return "claim sem suporte em evidência";
  if (/development inválid/i.test(value)) return "development inválido";
  if (/claim sem suporte/i.test(value)) return "claim sem suporte";
  if (/claim .*sem evidência autorizada/i.test(value)) return "claim sem suporte em evidência";
  if (/development contém claim sem evidência/i.test(value)) return "development inválido";
  if (/duplicata|repetid|usado como/i.test(value)) return "variety_issue";
  // v2: códigos específicos por check do gate de development/CTA (sem conteúdo).
  if (/factRef/i.test(value)) return "factref_grounding_below_min";
  if (/cta sem suporte/i.test(value)) return "cta_invalid";
  if (/grounding/i.test(value)) return "grounding_below_min";
  if (/development/i.test(value)) return "development_issue";
  if (/produção incompatível/i.test(value)) return "production_issue";
  if (/skill da plataforma/i.test(value)) return "platform_issue";
  if (/claim|evidência|factual|contrad/i.test(value)) return "factual_issue";
  return "gate_issue";
}
export function sanitizeGateReports(reports: Array<Record<string, unknown>>): SanitizedGateReport[] {
  return reports.map((report) => {
    const causes = Array.isArray(report.causes)
      ? report.causes.map(safeGateIssue)
      : Array.isArray(report.issues)
        ? report.issues.map(safeGateIssue)
        : [];
    return {
      briefId: String(report.briefId ?? ""), factualStatus: String(report.factualStatus ?? ""), claimType: String(report.claimType ?? ""), structuralStatus: String(report.structuralStatus ?? ""), platformStatus: String(report.platformStatus ?? ""), varietyStatus: String(report.varietyStatus ?? ""), decision: String(report.decision ?? ""),
      evidenceRefs: Array.isArray(report.evidenceRefs) ? report.evidenceRefs.filter((ref): ref is string => typeof ref === "string").map((ref) => ref.slice(0, 100)) : [],
      issues: causes,
      causes,
    };
  });
}

const BASE_ALLOWLIST: (keyof JobEventFields)[] = ["jobId", "attempt", "stage", "task", "tier", "model", "instructionHash", "errorName", "errorCode", "reservationAction"];
const EVENT_ALLOWLIST: Record<JobEventName, (keyof JobEventFields)[]> = {
  "job.claimed": [...BASE_ALLOWLIST, "timeoutMs"],
  "stage.started": BASE_ALLOWLIST,
  "stage.completed": [...BASE_ALLOWLIST, "durationMs"],
  "capability.started": [...BASE_ALLOWLIST, "timeoutMs", "requestBytes", "trustedContextBytes", "externalBytes", "contextDigest"],
  "capability.completed": [...BASE_ALLOWLIST, "durationMs", "timeoutMs", "requestBytes", "trustedContextBytes", "externalBytes", "responseBytes", "providerStatus", "rootShape", "responseKeys", "arrayLength", "cardinalityPolicyVersion", "retry", "providerRequestId", "providerRequestIdSource", "kept", "dropped"],
  "capability.failed": [...BASE_ALLOWLIST, "durationMs", "timeoutMs", "providerStatus", "endpoint", "providerRequestId", "providerRequestIdSource", "expected", "received", "retry", "item", "issue", "field", "errorKind", "rate", "cardinalityPolicyVersion"],
  "repair.started": [...BASE_ALLOWLIST, "expected"],
  "repair.completed": [...BASE_ALLOWLIST, "durationMs", "expected", "received", "retry", "gateReports"],
  "job.finalizing": BASE_ALLOWLIST,
  // Expiração de lease: rotação (job.reclaimed) e esgotamento (job.terminal) —
  // emitidos apenas quando o CAS do reclaim persiste (mesmo contrato do failJob).
  "job.reclaimed": BASE_ALLOWLIST,
  "job.terminal": [...BASE_ALLOWLIST, "errorCode", "durationMs", "expected", "received", "retry", "gateReports"],
  "v2.planner.completed": [...BASE_ALLOWLIST, "planned", "plannerPolicyVersion", "skillBinding", "briefPolicyVersion", "plannerOutputHash", "enginePath"],
  "v2.fallback": [...BASE_ALLOWLIST, "reason", "skillBinding", "briefPolicyVersion", "enginePath"],
  "v2.style.observations": [...BASE_ALLOWLIST, "rate", "questionHooks", "enginePath"],
};

const buffer: string[] = [];

// ─── E5: snapshots internos de política e métricas (sanitizados) ────────────
// Somente formas serializáveis/contadas; nunca prompt, payload ou texto livre.
export type RunPolicySnapshotV1 = {
  platformSkillVersion: string;
  creativeSystemVersion?: string;
  plannerPolicyVersion?: string;
  briefPolicyVersion?: string;
  gatePolicyVersion: number;
  cardinalityPolicyVersion: number;
  instructionHashes: Readonly<Record<string, string>>;
};
export type DeliveryMetricsV1 = { expectedCount: number; deliveredCount: number; failedCount: number; terminalStatus: "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED" };
export type JudgeExecutionCount = "EXECUTED" | "NOT_EXECUTED" | "FAILED" | "NOT_APPLICABLE";
export type CategoryMetricsV1 = {
  category: string;
  expectedCount: number;
  deliveredCount: number;
  failedCount: number;
  judgeExecution: Record<JudgeExecutionCount, number>;
  hardGate: Record<"PASS" | "REPAIR" | "REJECT", number>;
  scenes: Record<"AVAILABLE" | "FILTERED" | "ERROR", number>;
};

export function buildDeliveryMetricsV1(expectedCount: number, deliveredCount: number, terminalStatus: DeliveryMetricsV1["terminalStatus"]): DeliveryMetricsV1 {
  return { expectedCount, deliveredCount, failedCount: expectedCount - deliveredCount, terminalStatus };
}

export function buildCategoryMetricsV1(input: {
  category: string;
  expectedCount: number;
  deliveredCount: number;
  judgeRecords: readonly { execution: string }[];
  reports: readonly { decision: string }[];
  sceneSets: readonly { status: string }[];
}): CategoryMetricsV1 {
  const judgeExecution: CategoryMetricsV1["judgeExecution"] = { EXECUTED: 0, NOT_EXECUTED: 0, FAILED: 0, NOT_APPLICABLE: 0 };
  for (const record of input.judgeRecords)
    if (record.execution in judgeExecution) judgeExecution[record.execution as JudgeExecutionCount] += 1;
  const hardGate: CategoryMetricsV1["hardGate"] = { PASS: 0, REPAIR: 0, REJECT: 0 };
  for (const report of input.reports)
    if (report.decision in hardGate) hardGate[report.decision as keyof CategoryMetricsV1["hardGate"]] += 1;
  const scenes: CategoryMetricsV1["scenes"] = { AVAILABLE: 0, FILTERED: 0, ERROR: 0 };
  for (const set of input.sceneSets)
    if (set.status in scenes) scenes[set.status as keyof CategoryMetricsV1["scenes"]] += 1;
  return {
    category: input.category,
    expectedCount: input.expectedCount,
    deliveredCount: input.deliveredCount,
    failedCount: input.expectedCount - input.deliveredCount,
    judgeExecution,
    hardGate,
    scenes,
  };
}
export function emitJobEvent(event: JobEventName, fields: JobEventFields): void {
  const allow = EVENT_ALLOWLIST[event];
  const line: Record<string, unknown> = { timestamp: new Date().toISOString(), event };
  for (const key of allow) { const value = fields[key]; if (value !== undefined) line[key] = value; }
  const text = JSON.stringify(line);
  console.info(text);
  buffer.push(text);
}
export function collectJobEvents(): string[] { return [...buffer]; }

// ADR-026 (pós-job ace9e417): telemetria sanitizada de cenas no caminho de
// FALHA — mesmo padrão de sanitizeGateReports. Allowlist ESTRITA: status do
// enum efetivo do SceneSetOutcome; errorCode do vocabulário fechado de códigos
// GEN-*; contentId no formato server-derived `${jobId}-content-N`; contagens
// inteiras não-negativas com teto; causas em vocabulário fechado. Qualquer
// outro valor colapsa (UNKNOWN/GEN-UNKNOWN/scene_gate_issue/vazio) — nunca
// mensagem, payload ou descrição de cena transportados.
export type SanitizedSceneOutcomeAttempt = { attempt: number; status: "completed" | "failed"; kept: number | null; dropped: number | null; errorCode: string | null; durationMs: number };
export type SanitizedSceneOutcome = { contentId: string; status: string; generated: number; dropped: number; causes: string[]; attempts: SanitizedSceneOutcomeAttempt[] };
const SCENE_OUTCOME_STATUS = ["AVAILABLE", "FILTERED", "ERROR"] as const;
const SCENE_GATE_CAUSES = ["acao_ausente", "ancora_ausente", "claim_nao_autorizado", "locator_interno", "producao_nao_declarada"] as const;
const SCENE_ERROR_CODES = ["GEN-SCHEMA", "GEN-PROVIDER", "GEN-FACT", "GEN-SKILL", "GEN-VARIETY"] as const;
const SCENE_COUNT_CEILING = 100;
const SCENE_DURATION_CEILING_MS = 3_600_000;
const SCENE_CONTENT_ID = /^[A-Za-z0-9_-]+-content-\d+$/;
function safeSceneCause(value: unknown): string {
  if (typeof value !== "string") return "scene_gate_issue";
  // gateSceneSet emite "causa" ou "causa:contagem" — só códigos do vocabulário
  // fechado passam; qualquer outra string colapsa para scene_gate_issue.
  const separator = value.indexOf(":");
  const code = separator === -1 ? value : value.slice(0, separator);
  if (!(SCENE_GATE_CAUSES as readonly string[]).includes(code)) return "scene_gate_issue";
  return separator === -1 ? code : /^\d+$/.test(value.slice(separator + 1)) ? value : code;
}
function safeSceneCount(value: unknown, ceiling = SCENE_COUNT_CEILING): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= ceiling ? value : null;
}
function safeSceneContentId(value: unknown): string {
  return typeof value === "string" && SCENE_CONTENT_ID.test(value) ? value.slice(0, 200) : "";
}
export function projectSceneOutcomes(value: unknown): SanitizedSceneOutcome[] {
  const records = Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  return records.map((item) => ({
    contentId: safeSceneContentId(item.contentId),
    status: typeof item.status === "string" && (SCENE_OUTCOME_STATUS as readonly string[]).includes(item.status) ? item.status : "UNKNOWN",
    generated: safeSceneCount(item.generated) ?? 0,
    dropped: safeSceneCount(item.dropped) ?? 0,
    causes: Array.isArray(item.causes) ? item.causes.map(safeSceneCause).slice(0, 10) : [],
    attempts: Array.isArray(item.attempts)
      ? item.attempts
        .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)))
        .slice(0, 10)
        .map((row) => {
          const attempt = typeof row.attempt === "number" && Number.isInteger(row.attempt) && row.attempt >= 1 && row.attempt <= 10 ? row.attempt : 0;
          const failed = row.status === "failed";
          const rawCode = typeof row.errorCode === "string" && (SCENE_ERROR_CODES as readonly string[]).includes(row.errorCode) ? row.errorCode : null;
          return {
            attempt,
            status: failed ? ("failed" as const) : ("completed" as const),
            kept: safeSceneCount(row.kept),
            dropped: safeSceneCount(row.dropped),
            // Tentativa concluída não carrega código; tentativa falha com código
            // fora do vocabulário colapsa para GEN-UNKNOWN (nunca texto arbitrário).
            errorCode: failed ? (rawCode ?? "GEN-UNKNOWN") : rawCode,
            durationMs: safeSceneCount(row.durationMs, SCENE_DURATION_CEILING_MS) ?? 0,
          };
        })
      : [],
  }));
}
export function resetJobEvents(): void { buffer.length = 0; }
