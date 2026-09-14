import { createHash } from "node:crypto";
import { GenerationError } from "./errors";
export type IntelligenceTier = "LOW" | "MID" | "HIGH";
export type LogicalTask = "PRODUCT_UNDERSTANDING" | "COMMERCIAL_OPPORTUNITY_MAPPING" | "STRATEGY_SYNTHESIS" | "CONTENT_PLAN_GENERATION" | "CONTENT_BRIEF_GENERATION" | "CONTENT_BRIEF_REPAIR" | "CONTENT_SCENE_IDEAS" | "CONTENT_QUALITY_JUDGE" | "CONTENT_PART_REPAIR";
export const ROUTER_MAP: Record<LogicalTask, IntelligenceTier> = {
  // ADR-020 adendo 3: PU é a fronteira factual canônica — 3 incidentes Qwen
  // (purchaseBarriers) vs nenhum OpenAI observado → roteado direto a QUALITY.
  PRODUCT_UNDERSTANDING: "HIGH",
  COMMERCIAL_OPPORTUNITY_MAPPING: "MID",
  STRATEGY_SYNTHESIS: "HIGH",
  CONTENT_PLAN_GENERATION: "HIGH",
  CONTENT_BRIEF_GENERATION: "MID",
  CONTENT_BRIEF_REPAIR: "HIGH",
  CONTENT_SCENE_IDEAS: "LOW",
  CONTENT_QUALITY_JUDGE: "HIGH",
  CONTENT_PART_REPAIR: "HIGH",
};
// Envelope de contexto projetado, separando instruções confiáveis de fatos/contexto confirmado
// e de dados externos não confiáveis. Cada capability recebe apenas a projeção que precisa.
export type ProjectedContext = { instructions: { task: LogicalTask; tier: IntelligenceTier; instructionHash: string }; confirmedContext: unknown; externalData?: unknown };
// Fallback MID→HIGH (decisão do Arquiteto): tentativa sacrifada em MID, registrada com retry/custo.
export type ProviderFallbackInfo = { from: string; reason: "timeout" | "connection" | "http_status"; providerStatus: number | null; requestBytes: number; durationMs: number };
export type ProviderCallMetrics = { model: string; reasoning: string; providerStatus: number | null; requestBytes: number; trustedContextBytes: number; externalBytes: number; responseBytes: number | null; durationMs: number; providerRequestId?: string; providerRequestIdSource?: "header" | "body.id"; retry?: number; fallback?: ProviderFallbackInfo };
// Registro sanitizado por capability: nunca prompts/payload bruto/secrets.
export type CapabilityRecord = { task: LogicalTask; tier: IntelligenceTier; provider: string; model: string; instructionVersion: string; instructionHash: string; durationMs: number; requestBytes: number; contextBytes: number; responseBytes: number; attempt: number; retry: number };
export type ModelRouter = { complete(task: LogicalTask, input: { trustedContext: unknown; externalData?: unknown }, signal?: AbortSignal, onMetrics?: (metrics: ProviderCallMetrics) => void): Promise<unknown>; describe(): ModelDescription; hash?(task: LogicalTask): string; modelFor?(task: LogicalTask): string };
export type ModelDescription = { provider: string; model: string; instructionVersion: string };
export function instructionHash(instruction: string): string { return createHash("sha256").update(instruction).digest("hex").slice(0, 16); }
export function assertProviderOutput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GenerationError("GEN-SCHEMA", "Resposta do provider deve ser um objeto JSON", true, { rootShape: Array.isArray(value) ? "array" : typeof value });
  const forbidden = ["tenantId", "status", "quota", "provider", "model", "tier", "prompt"];
  if (forbidden.some((key) => key in (value as Record<string, unknown>))) throw new GenerationError("GEN-SCHEMA", "Resposta inválida");
  return value as Record<string, unknown>;
}
