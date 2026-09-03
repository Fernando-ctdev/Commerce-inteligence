export type FactStatus = "SUPPORTED" | "INFERRED_BUT_SAFE" | "UNSUPPORTED" | "CONTRADICTED";
export type GateDecision = "PASS" | "REPAIR" | "REJECT";
export class ContractError extends Error { constructor(public readonly code: "GEN-COUNT-REQUIRED" | "GEN-COUNT-RANGE" | "GEN-SCHEMA" | "GEN-FACT" | "GEN-VARIETY" | "GEN-REPAIR-EXHAUSTED", message: string) { super(message); this.name = "ContractError"; } }
const text = (v: unknown, field: string, max = 2_000): string => { if (typeof v !== "string" || !v.trim() || v.length > max) throw new ContractError("GEN-SCHEMA", `${field} inválido`); return v.trim(); };
const strings = (v: unknown, field: string, required = true): string[] => { if (!Array.isArray(v) || (required && v.length === 0) || v.some((x) => typeof x !== "string" || !x.trim() || x.length > 500)) throw new ContractError("GEN-SCHEMA", `${field} inválido`); return v.map((x) => (x as string).trim()); };
const id = (v: unknown, field: string): string => { const value = text(v, field, 100); if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new ContractError("GEN-SCHEMA", `${field} inválido`); return value; };
export type EvidenceSnapshot = { facts: readonly string[]; refs: readonly string[] };
// Rejeita quaisquer campos de ownership/persistência/controle que o provider não pode atribuir.
const FORBIDDEN_OWNERSHIP: Record<string, true> = { tenantId: true, status: true, quota: true, provider: true, model: true, tier: true, prompt: true, id: true, contentId: true, briefVersionId: true, jobId: true, planId: true, position: true };
function rejectForbiddenFields(v: Record<string, unknown>, label: string): void {
  for (const key of Object.keys(v)) if (FORBIDDEN_OWNERSHIP[key]) throw new ContractError("GEN-SCHEMA", `${label} contém campo não permitido: ${key}`);
}
// Valida evidenceRefs contra um snapshot autorizado quando fornecido: refs fora do snapshot são GEN-FACT.
function validateEvidenceRefs(refs: string[], snapshot: EvidenceSnapshot | undefined, label: string): void {
  if (!snapshot) return;
  const allowed = new Set(snapshot.refs.map((r) => r.trim()));
  for (const ref of refs) if (!allowed.has(ref)) throw new ContractError("GEN-FACT", `${label} cita evidência fora do snapshot autorizado: ${ref}`);
}
export function validateTargetContentCount(value: unknown): number { if (value === undefined || value === null) throw new ContractError("GEN-COUNT-REQUIRED", "Quantidade de conteúdos obrigatória"); if (typeof value !== "number" || !Number.isInteger(value)) throw new ContractError("GEN-COUNT-RANGE", "Quantidade de conteúdos inválida"); if (value < 1 || value > 30) throw new ContractError("GEN-COUNT-RANGE", "Quantidade deve estar entre 1 e 30"); return value; }
export type ProductUnderstanding = { productId: string; category?: string; coreUseCases: string[]; capabilities: string[]; functionalBenefits: string[]; emotionalBenefits: string[]; desiredOutcomes: string[]; purchaseTriggers: string[]; purchaseBarriers: string[]; communicationRisks: string[]; evidenceRefs: string[] };
export function validateProductUnderstanding(value: unknown): ProductUnderstanding { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "ProductUnderstanding inválido"); const v = value as Record<string, unknown>; return { productId: id(v.productId, "productId"), category: v.category === undefined ? undefined : text(v.category, "category", 200), coreUseCases: strings(v.coreUseCases, "coreUseCases"), capabilities: strings(v.capabilities, "capabilities"), functionalBenefits: strings(v.functionalBenefits, "functionalBenefits"), emotionalBenefits: strings(v.emotionalBenefits, "emotionalBenefits"), desiredOutcomes: strings(v.desiredOutcomes, "desiredOutcomes"), purchaseTriggers: strings(v.purchaseTriggers, "purchaseTriggers"), purchaseBarriers: strings(v.purchaseBarriers, "purchaseBarriers"), communicationRisks: strings(v.communicationRisks, "communicationRisks"), evidenceRefs: strings(v.evidenceRefs, "evidenceRefs") }; }
export type CommercialOpportunity = { id: string; audience?: string; situation?: string; pain?: string; desire?: string; desiredOutcome?: string; objection?: string; relevantCapabilities: string[]; benefits: string[]; proofOptions: string[]; sellingArgument: string; confidence: number; evidenceRefs: string[] };
export function validateCommercialOpportunity(value: unknown): CommercialOpportunity { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Oportunidade inválida"); const v = value as Record<string, unknown>; if (typeof v.confidence !== "number" || v.confidence < 0 || v.confidence > 1) throw new ContractError("GEN-SCHEMA", "confidence inválido"); return { id: id(v.id, "id"), audience: v.audience === undefined ? undefined : text(v.audience, "audience"), situation: v.situation === undefined ? undefined : text(v.situation, "situation"), pain: v.pain === undefined ? undefined : text(v.pain, "pain"), desire: v.desire === undefined ? undefined : text(v.desire, "desire"), desiredOutcome: v.desiredOutcome === undefined ? undefined : text(v.desiredOutcome, "desiredOutcome"), objection: v.objection === undefined ? undefined : text(v.objection, "objection"), relevantCapabilities: strings(v.relevantCapabilities, "relevantCapabilities"), benefits: strings(v.benefits, "benefits"), proofOptions: strings(v.proofOptions, "proofOptions"), sellingArgument: text(v.sellingArgument, "sellingArgument"), confidence: v.confidence, evidenceRefs: strings(v.evidenceRefs, "evidenceRefs") }; }
export type ProductStrategy = { id: string; productId: string; jobId: string; version: 1; status: "ACTIVE"; platformId: string; platformSkillVersion: string; primaryPositioning: string; audiences: string[]; priorityBenefits: string[]; priorityObjections: string[]; priorityArguments: string[]; priorityAngles: string[]; communicationPrinciples: string[]; communicationRisks: string[]; opportunities: CommercialOpportunity[] };
// AC16/B-003-04: contrato canônico da Strategy v1. objective/positioning/audience/
// contentPillars eram contrato paralelo e foram removidos sem alias.
export function validateProductStrategy(value: unknown): ProductStrategy { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Strategy inválida"); const v = value as Record<string, unknown>; if (v.version !== 1 || v.status !== "ACTIVE") throw new ContractError("GEN-SCHEMA", "Strategy deve ser ACTIVE v1"); if (!Array.isArray(v.opportunities)) throw new ContractError("GEN-SCHEMA", "opportunities inválido"); return { id: id(v.id, "id"), productId: id(v.productId, "productId"), jobId: id(v.jobId, "jobId"), version: 1, status: "ACTIVE", platformId: text(v.platformId, "platformId", 100), platformSkillVersion: text(v.platformSkillVersion, "platformSkillVersion", 100), primaryPositioning: text(v.primaryPositioning, "primaryPositioning"), audiences: strings(v.audiences, "audiences"), priorityBenefits: strings(v.priorityBenefits, "priorityBenefits"), priorityObjections: strings(v.priorityObjections, "priorityObjections"), priorityArguments: strings(v.priorityArguments, "priorityArguments"), priorityAngles: strings(v.priorityAngles, "priorityAngles"), communicationPrinciples: strings(v.communicationPrinciples, "communicationPrinciples"), communicationRisks: strings(v.communicationRisks, "communicationRisks"), opportunities: v.opportunities.map(validateCommercialOpportunity) }; }
// AC20: além dos obrigatórios, os opcionais canônicos são preservados quando vierem
// do provider; tipos inválidos falham GEN-SCHEMA (sem coerção).
export type ContentOpportunity = { id: string; commercialObjective: string; angle: string; coreMessage: string; hookMechanism: string; noveltyTargets: string[]; audience?: string; pain?: string; desire?: string; objection?: string; benefit?: string; proof?: string; narrativePattern?: string; desiredViewerResponse?: string; sourceOpportunityId?: string };
// sourceOpportunityId é referência do provider a uma oportunidade comercial/decisão estratégica.
// Quando o conjunto permitido é informado (server-derived), uma referência fora dele é rejeitada
// como GEN-SCHEMA — órfã nunca é aceita; não se fabrica vínculo ausente.
export function validateContentOpportunity(value: unknown, allowedSourceOpportunityIds?: ReadonlySet<string>): ContentOpportunity {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "ContentOpportunity inválido");
  const v = value as Record<string, unknown>;
  const optional = (key: string): string | undefined => v[key] === undefined ? undefined : text(v[key], key, 500);
  const sourceOpportunityId = v.sourceOpportunityId === undefined ? undefined : id(v.sourceOpportunityId, "sourceOpportunityId");
  if (sourceOpportunityId !== undefined && allowedSourceOpportunityIds && !allowedSourceOpportunityIds.has(sourceOpportunityId)) throw new ContractError("GEN-SCHEMA", `sourceOpportunityId órfão: ${sourceOpportunityId}`);
  return { id: id(v.id, "id"), commercialObjective: text(v.commercialObjective, "commercialObjective"), angle: text(v.angle, "angle"), coreMessage: text(v.coreMessage, "coreMessage"), hookMechanism: text(v.hookMechanism, "hookMechanism"), noveltyTargets: strings(v.noveltyTargets, "noveltyTargets"), audience: optional("audience"), pain: optional("pain"), desire: optional("desire"), objection: optional("objection"), benefit: optional("benefit"), proof: optional("proof"), narrativePattern: optional("narrativePattern"), desiredViewerResponse: optional("desiredViewerResponse"), sourceOpportunityId };
}
export type CommercialOpportunityMappingEnvelope = { audiences: string[]; situations: string[]; pains: string[]; desires: string[]; objections: string[]; opportunities: CommercialOpportunity[] };
// Valida a estrutura de uma oportunidade comercial como vinda do provider, sem exigir `id`
// (id persistente é sempre derivado pelo servidor; o provider não atribui).
export function validateCommercialOpportunityDraft(value: unknown, evidence?: EvidenceSnapshot): Omit<CommercialOpportunity, "id"> {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Oportunidade inválida");
  const v = value as Record<string, unknown>;
  rejectForbiddenFields(v, "Oportunidade");
  if (typeof v.confidence !== "number" || v.confidence < 0 || v.confidence > 1) throw new ContractError("GEN-SCHEMA", "confidence inválido");
  const evidenceRefs = strings(v.evidenceRefs, "evidenceRefs");
  validateEvidenceRefs(evidenceRefs, evidence, "Oportunidade");
  return { audience: v.audience === undefined ? undefined : text(v.audience, "audience"), situation: v.situation === undefined ? undefined : text(v.situation, "situation"), pain: v.pain === undefined ? undefined : text(v.pain, "pain"), desire: v.desire === undefined ? undefined : text(v.desire, "desire"), desiredOutcome: v.desiredOutcome === undefined ? undefined : text(v.desiredOutcome, "desiredOutcome"), objection: v.objection === undefined ? undefined : text(v.objection, "objection"), relevantCapabilities: strings(v.relevantCapabilities, "relevantCapabilities"), benefits: strings(v.benefits, "benefits"), proofOptions: strings(v.proofOptions, "proofOptions"), sellingArgument: text(v.sellingArgument, "sellingArgument"), confidence: v.confidence, evidenceRefs };
}
export function validateCommercialOpportunityMappingEnvelope(value: unknown, evidence?: EvidenceSnapshot): CommercialOpportunityMappingEnvelope {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Envelope de oportunidades inválido");
  const v = value as Record<string, unknown>;
  rejectForbiddenFields(v, "Envelope");
  for (const key of ["audiences", "situations", "pains", "desires", "objections"]) if (key in v && !Array.isArray((v as Record<string, unknown>)[key])) throw new ContractError("GEN-SCHEMA", `${key} inválido`);
  const opportunities = Array.isArray(v.opportunities) ? v.opportunities.map((item) => ({ ...validateCommercialOpportunityDraft(item, evidence), id: "" })) : [];
  if (opportunities.length === 0) throw new ContractError("GEN-SCHEMA", "Envelope sem oportunidades comerciais");
  return { audiences: strings(v.audiences, "audiences", false), situations: strings(v.situations, "situations", false), pains: strings(v.pains, "pains", false), desires: strings(v.desires, "desires", false), objections: strings(v.objections, "objections", false), opportunities };
}
export type ContentPlan = { id: string; productId: string; strategyVersion: 1; targetContentCount: number; platformId: string; platformSkillVersion: string; opportunities: ContentOpportunity[] };
export function validateContentPlan(value: unknown): ContentPlan { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Plano inválido"); const v = value as Record<string, unknown>; const n = validateTargetContentCount(v.targetContentCount); const opportunities = Array.isArray(v.opportunities) ? v.opportunities.map((item) => validateContentOpportunity(item)) : []; if (opportunities.length !== n) throw new ContractError("GEN-COUNT-RANGE", "Plano deve conter a quantidade exata de oportunidades"); return { id: id(v.id, "id"), productId: id(v.productId, "productId"), strategyVersion: 1, targetContentCount: n, platformId: text(v.platformId, "platformId", 100), platformSkillVersion: text(v.platformSkillVersion, "platformSkillVersion", 100), opportunities }; }
export type ContentBriefVersion = { contentId: string; briefVersionId: string; version: 1; angle: string; hook: string; script: string; scenes: string[]; cta: string; structure?: string; objective?: string; targetAudience?: string; pain?: string; desire?: string; objection?: string; benefit?: string; notes?: string };
export function validateContentBrief(value: unknown): ContentBriefVersion { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Brief inválido"); const v = value as Record<string, unknown>; const scenes = strings(v.scenes, "scenes"); if (scenes.length < 2 || scenes.length > 8) throw new ContractError("GEN-SCHEMA", "Quantidade de cenas inválida"); return { contentId: id(v.contentId, "contentId"), briefVersionId: id(v.briefVersionId, "briefVersionId"), version: 1, angle: text(v.angle, "angle"), hook: text(v.hook, "hook"), script: text(v.script, "script", 8_000), scenes, cta: text(v.cta, "cta"), structure: v.structure === undefined ? undefined : text(v.structure, "structure", 100), objective: v.objective === undefined ? undefined : text(v.objective, "objective"), targetAudience: v.targetAudience === undefined ? undefined : text(v.targetAudience, "targetAudience"), pain: v.pain === undefined ? undefined : text(v.pain, "pain"), desire: v.desire === undefined ? undefined : text(v.desire, "desire"), objection: v.objection === undefined ? undefined : text(v.objection, "objection"), benefit: v.benefit === undefined ? undefined : text(v.benefit, "benefit"), notes: v.notes === undefined ? undefined : text(v.notes, "notes") }; }
export type ContentBriefBatch = { items: ContentBriefVersion[] };
// Valida a estrutura de um briefing provider-sem-ids; contentId/briefVersionId são server-derived.
export function validateContentBriefDraft(value: unknown): Omit<ContentBriefVersion, "contentId" | "briefVersionId" | "version"> {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Brief inválido");
  const v = value as Record<string, unknown>;
  rejectForbiddenFields(v, "Brief");
  const scenes = strings(v.scenes, "scenes");
  if (scenes.length < 2 || scenes.length > 8) throw new ContractError("GEN-SCHEMA", "Quantidade de cenas inválida");
  return { angle: text(v.angle, "angle"), hook: text(v.hook, "hook"), script: text(v.script, "script", 8_000), scenes, cta: text(v.cta, "cta"), structure: v.structure === undefined ? undefined : text(v.structure, "structure", 100), objective: v.objective === undefined ? undefined : text(v.objective, "objective"), targetAudience: v.targetAudience === undefined ? undefined : text(v.targetAudience, "targetAudience"), pain: v.pain === undefined ? undefined : text(v.pain, "pain"), desire: v.desire === undefined ? undefined : text(v.desire, "desire"), objection: v.objection === undefined ? undefined : text(v.objection, "objection"), benefit: v.benefit === undefined ? undefined : text(v.benefit, "benefit"), notes: v.notes === undefined ? undefined : text(v.notes, "notes") };
}
export function validateContentBriefBatch(value: unknown): ContentBriefVersion[] {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Lote de briefings inválido");
  const v = value as Record<string, unknown>;
  const items = Array.isArray(v.items) ? v.items.map((item) => ({ ...validateContentBriefDraft(item), contentId: "", briefVersionId: "", version: 1 as const })) : [];
  if (items.length === 0) throw new ContractError("GEN-SCHEMA", "Lote de briefings vazio");
  return items;
}
// Atribui identidade persistente server-side a um lote de briefings do provider.
// O provider NÃO pode atribuir contentId/briefVersionId persistentes; o servidor deriva.
export function assignServerBriefIds(rawItems: unknown[], jobId: string, baseIndex: number): ContentBriefVersion[] {
  const validated = validateContentBriefBatch({ items: rawItems });
  if (validated.length === 0) throw new ContractError("GEN-SCHEMA", "Lote vazio");
  return validated.map((item, offset) => {
    const position = baseIndex + offset + 1;
    const contentId = `${jobId}-content-${position}`;
    return validateContentBrief({ ...item, contentId, briefVersionId: `${jobId}-brief-${position}`, version: 1 });
  });
}
export type BriefValidationReport = { briefId: string; contentId: string; briefVersionId: string; factualStatus: FactStatus; structuralStatus: "PASS" | "FAIL"; platformStatus: "PASS" | "FAIL"; varietyStatus: "PASS" | "FAIL"; issues: string[]; decision: GateDecision };
export function validateBriefValidationReport(value: unknown): BriefValidationReport { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Relatório inválido"); const v = value as Record<string, unknown>; const contentId = id(v.contentId, "contentId"); const briefVersionId = id(v.briefVersionId, "briefVersionId"); if (v.briefId !== `${contentId}:${briefVersionId}`) throw new ContractError("GEN-SCHEMA", "briefId inconsistente"); const factualStatus = v.factualStatus; if (!["SUPPORTED", "INFERRED_BUT_SAFE", "UNSUPPORTED", "CONTRADICTED"].includes(String(factualStatus))) throw new ContractError("GEN-FACT", "Factualidade inválida"); const decision = v.decision; if (!["PASS", "REPAIR", "REJECT"].includes(String(decision))) throw new ContractError("GEN-SCHEMA", "Decisão inválida"); return { briefId: v.briefId as string, contentId, briefVersionId, factualStatus: factualStatus as FactStatus, structuralStatus: v.structuralStatus === "PASS" ? "PASS" : "FAIL", platformStatus: v.platformStatus === "PASS" ? "PASS" : "FAIL", varietyStatus: v.varietyStatus === "PASS" ? "PASS" : "FAIL", issues: strings(v.issues, "issues", false), decision: decision as GateDecision }; }
export const structureHash = (brief: Pick<ContentBriefVersion, "structure" | "scenes" | "cta">): string => { let h = 2166136261; for (const c of JSON.stringify([brief.structure ?? "", brief.scenes.length, brief.cta]).normalize("NFKC").toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8, "0"); };
export const normalizeForVariety = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
