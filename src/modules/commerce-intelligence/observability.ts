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
  | "job.terminal";

export type JobEventFields = {
  jobId?: string; attempt?: number; stage?: string; task?: string; tier?: string; model?: string; instructionHash?: string;
  durationMs?: number; timeoutMs?: number; requestBytes?: number; trustedContextBytes?: number; externalBytes?: number; responseBytes?: number;
  providerStatus?: number; rootShape?: string; responseKeys?: string[]; arrayLength?: number; endpoint?: string; providerRequestId?: string; providerRequestIdSource?: string;
  expected?: number; received?: number; retry?: number; errorName?: string; errorCode?: string; reservationAction?: string; contextDigest?: string; item?: number; issue?: string; field?: string; errorKind?: string; rate?: Record<string, string>; gateReports?: SanitizedGateReport[]; cardinalityPolicyVersion?: number;
  // Gate de cenas (CONTENT_SCENE_IDEAS): contagem determinística do gateSceneSet.
  kept?: number; dropped?: number;
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
};

const buffer: string[] = [];
export function emitJobEvent(event: JobEventName, fields: JobEventFields): void {
  const allow = EVENT_ALLOWLIST[event];
  const line: Record<string, unknown> = { timestamp: new Date().toISOString(), event };
  for (const key of allow) { const value = fields[key]; if (value !== undefined) line[key] = value; }
  const text = JSON.stringify(line);
  console.info(text);
  buffer.push(text);
}
export function collectJobEvents(): string[] { return [...buffer]; }
export function resetJobEvents(): void { buffer.length = 0; }
