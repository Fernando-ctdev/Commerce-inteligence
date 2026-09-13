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
  | "job.terminal";

export type JobEventFields = {
  jobId?: string; attempt?: number; stage?: string; task?: string; tier?: string; model?: string; instructionHash?: string;
  durationMs?: number; timeoutMs?: number; requestBytes?: number; trustedContextBytes?: number; externalBytes?: number; responseBytes?: number;
  providerStatus?: number; rootShape?: string; responseKeys?: string[]; arrayLength?: number; endpoint?: string; providerRequestId?: string; providerRequestIdSource?: string;
  expected?: number; received?: number; retry?: number; errorName?: string; errorCode?: string; reservationAction?: string; contextDigest?: string; item?: number; issue?: string; field?: string; errorKind?: string; rate?: Record<string, string>; gateReports?: SanitizedGateReport[]; cardinalityPolicyVersion?: number;
};

// Resumo sanitizado de GateReport: apenas status determinísticos, decision, issues
// (mensagens de código, nunca conteúdo do briefing) e briefId server-derived.
export type SanitizedGateReport = { briefId: string; factualStatus: string; claimType: string; evidenceRefs: string[]; structuralStatus: string; platformStatus: string; varietyStatus: string; decision: string; issues: string[]; causes: string[] };
export function sanitizeGateReports(reports: Array<Record<string, unknown>>): SanitizedGateReport[] {
  return reports.map((report) => {
    const causes = Array.isArray(report.causes)
      ? report.causes.filter((cause): cause is string => typeof cause === "string").map((cause) => cause.slice(0, 200))
      : Array.isArray(report.issues)
        ? report.issues.filter((issue): issue is string => typeof issue === "string").map((issue) => issue.slice(0, 200))
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
  "capability.completed": [...BASE_ALLOWLIST, "durationMs", "timeoutMs", "requestBytes", "trustedContextBytes", "externalBytes", "responseBytes", "providerStatus", "rootShape", "responseKeys", "arrayLength", "cardinalityPolicyVersion", "retry", "providerRequestId", "providerRequestIdSource"],
  "capability.failed": [...BASE_ALLOWLIST, "durationMs", "timeoutMs", "providerStatus", "endpoint", "providerRequestId", "providerRequestIdSource", "expected", "received", "retry", "item", "issue", "field", "errorKind", "rate", "cardinalityPolicyVersion"],
  "repair.started": [...BASE_ALLOWLIST, "expected"],
  "repair.completed": [...BASE_ALLOWLIST, "durationMs", "expected", "received", "retry", "gateReports"],
  "job.finalizing": BASE_ALLOWLIST,
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
