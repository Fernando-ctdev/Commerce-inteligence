import { GenerationError } from "./errors";

export const QUALITY_PARTS = ["hook", "development", "script", "cta", "scenes"] as const;
export type QualityPart = (typeof QUALITY_PARTS)[number];
export type QualityStatus = "PASS" | "REPAIR" | "REJECT";
export const QUALITY_CRITERIA = [
  "hook_clarity", "hook_style_fit", "hook_tiktok_native", "hook_product_relevance",
  "development_coherence", "development_style_fit", "development_commerce_value",
  "script_naturalness", "script_coherence", "script_shop_compliance",
  "cta_clarity", "cta_tiktok_native", "cta_commercial_fit",
  "scenes_actionable", "scenes_style_fit", "scenes_hook_alignment",
] as const;
export const QUALITY_REASONS = [
  "meets_criteria", "unclear", "style_mismatch", "not_tiktok_native",
  "weak_product_link", "incoherent", "weak_commercial_value", "unsupported_persuasion",
  "not_actionable", "misaligned_scenes",
] as const;
export type QualityCriterion = (typeof QUALITY_CRITERIA)[number];
export type QualityReason = (typeof QUALITY_REASONS)[number];
export type QualityJudgment = { part: QualityPart; status: QualityStatus; criterion: QualityCriterion; reason: QualityReason };
export type QualityAudit = { contentId: string; round: number; parts: QualityJudgment[] };
export type QualityFailure = { contentId: string; part: QualityPart; round: number; status: Exclude<QualityStatus, "PASS">; criterion: QualityCriterion; reason: Exclude<QualityReason, "meets_criteria"> };

const REASON_TEXT: Record<QualityReason, string> = {
  meets_criteria: "Atende aos critérios internos de qualidade.",
  unclear: "Precisa ficar mais claro.",
  style_mismatch: "Não corresponde ao estilo informado pelo creator.",
  not_tiktok_native: "Precisa soar mais natural para conteúdo TikTok.",
  weak_product_link: "Precisa se conectar melhor ao produto e à oportunidade.",
  incoherent: "Precisa manter coerência entre as partes do conteúdo.",
  weak_commercial_value: "Precisa comunicar melhor o valor comercial sem claims novos.",
  unsupported_persuasion: "A persuasão precisa respeitar as evidências e políticas comerciais.",
  not_actionable: "As cenas precisam ser mais claras e graváveis pelo creator.",
  misaligned_scenes: "As cenas precisam se alinhar ao conteúdo.",
};
const CRITERIA_BY_PART: Record<QualityPart, readonly QualityCriterion[]> = {
  hook: ["hook_clarity", "hook_style_fit", "hook_tiktok_native", "hook_product_relevance"],
  development: ["development_coherence", "development_style_fit", "development_commerce_value"],
  script: ["script_naturalness", "script_coherence", "script_shop_compliance"],
  cta: ["cta_clarity", "cta_tiktok_native", "cta_commercial_fit"],
  scenes: ["scenes_actionable", "scenes_style_fit", "scenes_hook_alignment"],
};

export function reasonText(reason: QualityReason): string { return REASON_TEXT[reason]; }

export function parseQualityAudit(value: unknown, contentId: string, round: number): QualityAudit {
  const invalid = () => new GenerationError("GEN-SCHEMA", "Quality judge retornou contrato inválido", true, { task: "CONTENT_QUALITY_JUDGE" });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const root = value as Record<string, unknown>;
  if (Object.keys(root).length !== 1 || !Array.isArray(root.parts) || root.parts.length !== QUALITY_PARTS.length) throw invalid();
  const seen = new Set<string>();
  const parts = root.parts.map((raw): QualityJudgment => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid();
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).length !== 4 || Object.keys(item).some((key) => !["part", "status", "criterion", "reason"].includes(key))) throw invalid();
    if (!QUALITY_PARTS.includes(item.part as QualityPart) || seen.has(String(item.part)) ||
      !["PASS", "REPAIR", "REJECT"].includes(String(item.status)) ||
      !QUALITY_CRITERIA.includes(item.criterion as QualityCriterion) ||
      !CRITERIA_BY_PART[item.part as QualityPart].includes(item.criterion as QualityCriterion) ||
      !QUALITY_REASONS.includes(item.reason as QualityReason)) throw invalid();
    if ((item.status === "PASS") !== (item.reason === "meets_criteria")) throw invalid();
    seen.add(String(item.part));
    return { part: item.part as QualityPart, status: item.status as QualityStatus, criterion: item.criterion as QualityCriterion, reason: item.reason as QualityReason };
  });
  if (seen.size !== QUALITY_PARTS.length) throw invalid();
  return { contentId, round, parts: QUALITY_PARTS.map((part) => parts.find((item) => item.part === part)!) };
}

export function qualityPartsToRepair(audit: QualityAudit): QualityJudgment[] {
  return audit.parts.filter(({ status }) => status === "REPAIR");
}

export function projectQualityFailures(audits: QualityAudit[]): QualityFailure[] {
  return audits.flatMap(({ contentId, round, parts }) => parts
    .filter((judgment): judgment is QualityJudgment & { status: Exclude<QualityStatus, "PASS">; reason: Exclude<QualityReason, "meets_criteria"> } => judgment.status !== "PASS" && judgment.reason !== "meets_criteria")
    .map(({ part, status, criterion, reason }) => ({ contentId, part, round, status, criterion, reason })));
}

export function applyQualityRepair<T extends { hook: string; development: string[]; script: string; cta: string }, S>(
  brief: T,
  scenes: S,
  part: QualityPart,
  replacement: unknown,
): { brief: T; scenes: S | unknown } {
  if (part === "scenes") return { brief, scenes: replacement };
  if (typeof replacement !== (part === "development" ? "object" : "string") || (part === "development" && (!Array.isArray(replacement) || replacement.some((value) => typeof value !== "string"))))
    throw new GenerationError("GEN-SCHEMA", "Quality repair retornou conteúdo inválido", true, { task: "CONTENT_PART_REPAIR", part });
  return { brief: { ...brief, [part]: replacement } as T, scenes };
}
