export type FactStatus = "SUPPORTED" | "INFERRED_BUT_SAFE" | "UNSUPPORTED" | "CONTRADICTED";
export type GateDecision = "PASS" | "REPAIR" | "REJECT";
export class ContractError extends Error { constructor(public readonly code: "GEN-COUNT-REQUIRED" | "GEN-COUNT-RANGE" | "GEN-SCHEMA" | "GEN-FACT" | "GEN-VARIETY" | "GEN-REPAIR-EXHAUSTED" | "GEN-GATE-VERSION" | "GEN-PATTERN", message: string, public readonly field?: string) { super(message); this.name = "ContractError"; } }
// ADR-021: geração parcial declarada. Teto server-side de falhas por job que
// ainda permitem fechamento SUCCEEDED_PARTIAL; acima disso o job reprova inteiro.
export const PARTIAL_FAILURE_CAP = 2;
// Cascata determinística de diagnóstico por item/round (assinatura residual do
// repair; nunca payload bruto do provider).
export type PartialFailureCheckCode =
  | "factRef_invalid"
  | "action_stem_missing"
  | "connector_missing"
  | "grounding_below_min"
  | "script_claim_missing"
  | "feature_list"
  | "unverified_claim";
export type FailedItemDiagnostic = {
  contentId: string;
  position: number;
  reason: "HARD_GATE" | "JUDGE" | "VARIETY_CAP";
  checkCodes: PartialFailureCheckCode[];
  issues: string[];
  quality?: Array<{ part: string; round: number; criterion: string; reason: string }>;
  diagnostic?: { actionPresent: boolean; connectorPresent: boolean; minGroundingExpected: number; minGroundingMatched: number };
};
export type EnginePartial = { expectedCount: number; deliveredCount: number; failedCount: number; failedItems: FailedItemDiagnostic[] };
const text = (v: unknown, field: string, max = 2_000): string => { if (typeof v !== "string" || !v.trim() || v.length > max) throw new ContractError("GEN-SCHEMA", `${field} inválido`, field); return v.trim(); };
const optionalText = (v: unknown, field: string, max = 2_000): string | undefined => v === undefined || v === null || (typeof v === "string" && !v.trim()) ? undefined : text(v, field, max);
// Política centralizada de cardinalidade por campo: máximo rígido incondicional; mínimo
// estrutural e mínimo condicional à evidência (minWithEvidence aplica quando existe
// evidência autorizada). Violação é falha tipada GEN-SCHEMA — nunca truncamento,
// preenchimento ou invenção (B-003-07/ADR-012).
// v3 (decisão Arquiteto, job d52368bc): os 5 campos estratégicos do PU aceitam
// [] INCONDICIONALMENTE — pertinência por campo não é determinável sem
// classificador semântico; quem impede invenção é o hard gate factual + judge,
// não o mínimo cardinal. v2 (pertinência binária) rejeitava [] legítimo.
export const CARDINALITY_POLICY_VERSION = 3;
export type CardinalityRule = { min: number; minWithEvidence: number; max: number };
// Campos estratégicos do PU (v3): mínimo sempre 0 — aceitam [] sem evidência.
const STRATEGIC_MIN_ZERO: Record<string, true> = {
  functionalBenefits: true,
  emotionalBenefits: true,
  desiredOutcomes: true,
  purchaseTriggers: true,
  purchaseBarriers: true,
};
export const CARDINALITY_POLICY: Record<string, CardinalityRule> = {
  // ProductUnderstanding: arrays estruturais só são exigidos quando há evidência.
  coreUseCases: { min: 0, minWithEvidence: 1, max: 8 },
  capabilities: { min: 0, minWithEvidence: 1, max: 8 },
  // v3: estratégicos aceitam [] sempre (hipóteses — invenção barrada pelo
  // hard gate factual/judge, não pelo mínimo cardinal).
  functionalBenefits: { min: 0, minWithEvidence: 0, max: 8 },
  emotionalBenefits: { min: 0, minWithEvidence: 0, max: 8 },
  desiredOutcomes: { min: 0, minWithEvidence: 0, max: 8 },
  purchaseTriggers: { min: 0, minWithEvidence: 0, max: 8 },
  purchaseBarriers: { min: 0, minWithEvidence: 0, max: 8 },
  evidenceRefs: { min: 0, minWithEvidence: 1, max: 25 },
  // Oportunidade comercial.
  relevantCapabilities: { min: 0, minWithEvidence: 1, max: 6 },
  benefits: { min: 0, minWithEvidence: 1, max: 6 },
  proofOptions: { min: 0, minWithEvidence: 1, max: 6 },
  // Envelope de mapping (descritivos opcionais) e Strategy.audiences.
  audiences: { min: 0, minWithEvidence: 0, max: 10 },
  situations: { min: 0, minWithEvidence: 0, max: 10 },
  pains: { min: 0, minWithEvidence: 0, max: 10 },
  desires: { min: 0, minWithEvidence: 0, max: 10 },
  objections: { min: 0, minWithEvidence: 0, max: 10 },
  // Prioridades da Strategy: o caminho determinístico sem provider produz vazios.
  priorityBenefits: { min: 0, minWithEvidence: 0, max: 10 },
  priorityObjections: { min: 0, minWithEvidence: 0, max: 10 },
  priorityArguments: { min: 0, minWithEvidence: 0, max: 10 },
  priorityAngles: { min: 0, minWithEvidence: 0, max: 10 },
  communicationPrinciples: { min: 0, minWithEvidence: 0, max: 10 },
  // Conteúdo e lote de briefings.
  noveltyTargets: { min: 1, minWithEvidence: 1, max: 4 },
  // Development canônico: 1–4 strings de orientação estratégica/acionável,
  // separadas do roteiro; fatos técnicos usados nelas devem vir de relevantFacts.
  development: { min: 1, minWithEvidence: 1, max: 4 },
  items: { min: 1, minWithEvidence: 1, max: 8 },
  opportunities: { min: 1, minWithEvidence: 3, max: 10 },
  targetContentCount: { min: 1, minWithEvidence: 1, max: 10 },
  // Relatórios de validação (GateReport.issues).
  issues: { min: 0, minWithEvidence: 0, max: 20 },
  // Cenas por set (ADR-019): provider entrega 2–6; gate filtra e o mínimo
  // final de 2 mantidos é aplicado pós-filtro (set vazio quando não fecha).
  scenes: { min: 2, minWithEvidence: 2, max: 6 },
};
const cardinalityRule = (field: string): CardinalityRule => CARDINALITY_POLICY[field] ?? { min: 0, minWithEvidence: 0, max: 20 };
// hasEvidence: ausência de snapshot ou de refs autorizadas relaxa o mínimo para `min`
// (sem evidência o provider não pode inventar); com evidência, aplica minWithEvidence.
// hasEvidence: ausência de snapshot ou de refs autorizadas relaxa o mínimo para
// `min` (sem evidência o provider não pode inventar); com evidência, aplica
// minWithEvidence — exceto os campos v3 acima, cujo mínimo é sempre 0.
const hasEvidence = (evidence?: EvidenceSnapshot): boolean => Boolean(evidence && evidence.refs.length > 0);
const strings = (v: unknown, field: string, evidence?: EvidenceSnapshot): string[] => {
  const rule = cardinalityRule(field);
  const strategic = field in STRATEGIC_MIN_ZERO;
  const min = !strategic && hasEvidence(evidence) ? rule.minWithEvidence : rule.min;
  if (!Array.isArray(v) || v.length < min || v.length > rule.max || v.some((x) => typeof x !== "string" || !x.trim() || x.length > 500))
    throw new ContractError("GEN-SCHEMA", `cardinalidade de ${field} fora da política (min ${min}, max ${rule.max})`, field);
  return v.map((x) => (x as string).trim());
};
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
export function validateTargetContentCount(value: unknown): number { const rule = CARDINALITY_POLICY.targetContentCount; if (value === undefined || value === null) throw new ContractError("GEN-COUNT-REQUIRED", "Quantidade de conteúdos obrigatória"); if (typeof value !== "number" || !Number.isInteger(value)) throw new ContractError("GEN-COUNT-RANGE", "Quantidade de conteúdos inválida"); if (value < rule.min || value > rule.max) throw new ContractError("GEN-COUNT-RANGE", `Quantidade deve estar entre ${rule.min} e ${rule.max}`); return value; }
export type ProductUnderstanding = { productId: string; category?: string; coreUseCases: string[]; capabilities: string[]; functionalBenefits: string[]; emotionalBenefits: string[]; desiredOutcomes: string[]; purchaseTriggers: string[]; purchaseBarriers: string[]; evidenceRefs: string[] };
// Mínimos dos arrays estruturais são condicionais à evidência: sem snapshot autorizado,
// arrays vazios são aceitos (o provider não inventa); com evidência, mínimo rígido.
export function validateProductUnderstanding(value: unknown, evidence?: EvidenceSnapshot): ProductUnderstanding { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "ProductUnderstanding inválido"); const v = value as Record<string, unknown>; return { productId: id(v.productId, "productId"), category: v.category === undefined ? undefined : text(v.category, "category", 200), coreUseCases: strings(v.coreUseCases, "coreUseCases", evidence), capabilities: strings(v.capabilities, "capabilities", evidence), functionalBenefits: strings(v.functionalBenefits, "functionalBenefits", evidence), emotionalBenefits: strings(v.emotionalBenefits, "emotionalBenefits", evidence), desiredOutcomes: strings(v.desiredOutcomes, "desiredOutcomes", evidence), purchaseTriggers: strings(v.purchaseTriggers, "purchaseTriggers", evidence), purchaseBarriers: strings(v.purchaseBarriers, "purchaseBarriers", evidence), evidenceRefs: strings(v.evidenceRefs, "evidenceRefs", evidence) }; }
export type CommercialOpportunity = { id: string; audience?: string; situation?: string; pain?: string; desire?: string; desiredOutcome?: string; objection?: string; relevantCapabilities: string[]; benefits: string[]; proofOptions: string[]; sellingArgument: string; confidence: number; evidenceRefs: string[] };
export function validateCommercialOpportunity(value: unknown, evidence?: EvidenceSnapshot): CommercialOpportunity { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Oportunidade inválida"); const v = value as Record<string, unknown>; if (typeof v.confidence !== "number" || v.confidence < 0 || v.confidence > 1) throw new ContractError("GEN-SCHEMA", "confidence inválido"); return { id: id(v.id, "id"), audience: optionalText(v.audience, "audience"), situation: optionalText(v.situation, "situation"), pain: optionalText(v.pain, "pain"), desire: optionalText(v.desire, "desire"), desiredOutcome: optionalText(v.desiredOutcome, "desiredOutcome"), objection: optionalText(v.objection, "objection"), relevantCapabilities: strings(v.relevantCapabilities, "relevantCapabilities", evidence), benefits: strings(v.benefits, "benefits", evidence), proofOptions: strings(v.proofOptions, "proofOptions", evidence), sellingArgument: text(v.sellingArgument, "sellingArgument"), confidence: v.confidence, evidenceRefs: strings(v.evidenceRefs, "evidenceRefs", evidence) }; }
export type ProductStrategy = { id: string; productId: string; jobId: string; version: 1; status: "ACTIVE"; platformId: string; platformSkillVersion: string; primaryPositioning: string; audiences: string[]; priorityBenefits: string[]; priorityObjections: string[]; priorityArguments: string[]; priorityAngles: string[]; communicationPrinciples: string[]; opportunities: CommercialOpportunity[] };
// AC16/B-003-04: contrato canônico da Strategy v1. objective/positioning/audience/
// contentPillars eram contrato paralelo e foram removidos sem alias.
export function validateProductStrategy(value: unknown, evidence?: EvidenceSnapshot): ProductStrategy { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Strategy inválida"); const v = value as Record<string, unknown>; if (v.version !== 1 || v.status !== "ACTIVE") throw new ContractError("GEN-SCHEMA", "Strategy deve ser ACTIVE v1"); if (!Array.isArray(v.opportunities)) throw new ContractError("GEN-SCHEMA", "opportunities inválido"); return { id: id(v.id, "id"), productId: id(v.productId, "productId"), jobId: id(v.jobId, "jobId"), version: 1, status: "ACTIVE", platformId: text(v.platformId, "platformId", 100), platformSkillVersion: text(v.platformSkillVersion, "platformSkillVersion", 100), primaryPositioning: text(v.primaryPositioning, "primaryPositioning"), audiences: strings(v.audiences, "audiences", evidence), priorityBenefits: strings(v.priorityBenefits, "priorityBenefits", evidence), priorityObjections: strings(v.priorityObjections, "priorityObjections", evidence), priorityArguments: strings(v.priorityArguments, "priorityArguments", evidence), priorityAngles: strings(v.priorityAngles, "priorityAngles", evidence), communicationPrinciples: strings(v.communicationPrinciples, "communicationPrinciples", evidence), opportunities: v.opportunities.map((item) => validateCommercialOpportunity(item, evidence)) }; }
// AC20: além dos obrigatórios, os opcionais canônicos são preservados quando vierem
// do provider; tipos inválidos falham GEN-SCHEMA (sem coerção).
export type ContentOpportunity = { id: string; commercialObjective: string; angle: string; coreMessage: string; hookMechanism: string; noveltyTargets: string[]; audience?: string; pain?: string; desire?: string; objection?: string; benefit?: string; proof?: string; narrativePattern?: string; desiredViewerResponse?: string; sourceOpportunityId?: string };
// sourceOpportunityId é referência do provider a uma oportunidade comercial/decisão estratégica.
// Quando o conjunto permitido é informado (server-derived), uma referência fora dele é rejeitada
// como GEN-SCHEMA — órfã nunca é aceita; não se fabrica vínculo ausente.
export function validateContentOpportunity(value: unknown, allowedSourceOpportunityIds?: ReadonlySet<string>): ContentOpportunity {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "ContentOpportunity inválido");
  const v = value as Record<string, unknown>;
  const optional = (key: string): string | undefined => optionalText(v[key], key, 500);
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
  const evidenceRefs = strings(v.evidenceRefs, "evidenceRefs", evidence);
  validateEvidenceRefs(evidenceRefs, evidence, "Oportunidade");
  return { audience: optionalText(v.audience, "audience"), situation: optionalText(v.situation, "situation"), pain: optionalText(v.pain, "pain"), desire: optionalText(v.desire, "desire"), desiredOutcome: optionalText(v.desiredOutcome, "desiredOutcome"), objection: optionalText(v.objection, "objection"), relevantCapabilities: strings(v.relevantCapabilities, "relevantCapabilities", evidence), benefits: strings(v.benefits, "benefits", evidence), proofOptions: strings(v.proofOptions, "proofOptions", evidence), sellingArgument: text(v.sellingArgument, "sellingArgument"), confidence: v.confidence, evidenceRefs };
}
export function validateCommercialOpportunityMappingEnvelope(value: unknown, evidence?: EvidenceSnapshot): CommercialOpportunityMappingEnvelope {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Envelope de oportunidades inválido");
  const v = value as Record<string, unknown>;
  rejectForbiddenFields(v, "Envelope");
  for (const key of ["audiences", "situations", "pains", "desires", "objections"]) if (key in v && !Array.isArray((v as Record<string, unknown>)[key])) throw new ContractError("GEN-SCHEMA", `${key} inválido`);
  const opportunities = Array.isArray(v.opportunities) ? v.opportunities.map((item) => ({ ...validateCommercialOpportunityDraft(item, evidence), id: "" })) : [];
  const opportunityRule = cardinalityRule("opportunities");
  // Três oportunidades só são exigidas quando o catálogo tem evidência suficiente
  // (refs DISTINTAS: refs citadas pelo understanding são anexadas ao catálogo base e
  // repetem-se; menções repetidas não criam evidência nova) para sustentá-las;
  // evidência escassa mantém o mínimo estrutural de uma.
  const distinctEvidenceRefs = evidence ? new Set(evidence.refs.map((ref) => ref.trim())).size : 0;
  const minimumOpportunities = distinctEvidenceRefs >= 3 ? opportunityRule.minWithEvidence : opportunityRule.min;
  // Mensagem de mínimo preservada: é a âncora do retry único de contrato no engine.
  if (opportunities.length < minimumOpportunities) throw new ContractError("GEN-SCHEMA", minimumOpportunities === 1 ? "Envelope sem oportunidades comerciais" : `cardinalidade de oportunidades fora da política (min ${minimumOpportunities}, max ${opportunityRule.max})`);
  if (opportunities.length > opportunityRule.max) throw new ContractError("GEN-SCHEMA", `cardinalidade de oportunidades fora da política (max ${opportunityRule.max})`);
  return { audiences: strings(v.audiences, "audiences"), situations: strings(v.situations, "situations"), pains: strings(v.pains, "pains"), desires: strings(v.desires, "desires"), objections: strings(v.objections, "objections"), opportunities };
}
export type ContentPlan = { id: string; productId: string; strategyVersion: 1; targetContentCount: number; platformId: string; platformSkillVersion: string; opportunities: ContentOpportunity[] };
export function validateContentPlan(value: unknown, hookVariety?: { classify: (mechanism: string) => string; buckets: number }): ContentPlan { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Plano inválido"); const v = value as Record<string, unknown>; const n = validateTargetContentCount(v.targetContentCount); const opportunities = Array.isArray(v.opportunities) ? v.opportunities.map((item) => validateContentOpportunity(item)) : []; if (opportunities.length !== n) throw new ContractError("GEN-COUNT-RANGE", "Plano deve conter a quantidade exata de oportunidades"); if (hookVariety && hookVariety.buckets > 0) { const cap = Math.ceil(n / hookVariety.buckets); const usage = new Map<string, number>(); for (const opportunity of opportunities) { const bucket = hookVariety.classify(opportunity.hookMechanism); usage.set(bucket, (usage.get(bucket) ?? 0) + 1); if (usage.get(bucket)! > cap) throw new ContractError("GEN-VARIETY", `hookMechanism concentrado no bucket "${bucket}" além do teto ceil(${n}/${hookVariety.buckets})=${cap} do plano`, "hookMechanism"); } } return { id: id(v.id, "id"), productId: id(v.productId, "productId"), strategyVersion: 1, targetContentCount: n, platformId: text(v.platformId, "platformId", 100), platformSkillVersion: text(v.platformSkillVersion, "platformSkillVersion", 100), opportunities }; }
export type ContentBriefVersion = { contentId: string; briefVersionId: string; version: 1; angle: string; hook: string; development: string[]; script: string; cta: string; structure?: string; objective?: string; targetAudience?: string; pain?: string; desire?: string; objection?: string; benefit?: string; notes?: string };
export type ContentBriefDraft = Omit<ContentBriefVersion, "contentId" | "briefVersionId" | "version">;
// Only declared brief fields cross into persistence; unknown provider fields are omitted.
export function validateContentBrief(value: unknown): ContentBriefVersion { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Brief inválido"); const v = value as Record<string, unknown>; return { contentId: id(v.contentId, "contentId"), briefVersionId: id(v.briefVersionId, "briefVersionId"), version: 1, angle: text(v.angle, "angle"), hook: text(v.hook, "hook"), development: strings(v.development, "development"), script: text(v.script, "script", 8_000), cta: text(v.cta, "cta"), structure: v.structure === undefined ? undefined : text(v.structure, "structure", 100), objective: v.objective === undefined ? undefined : text(v.objective, "objective"), targetAudience: v.targetAudience === undefined ? undefined : text(v.targetAudience, "targetAudience"), pain: optionalText(v.pain, "pain"), desire: optionalText(v.desire, "desire"), objection: optionalText(v.objection, "objection"), benefit: v.benefit === undefined ? undefined : text(v.benefit, "benefit"), notes: v.notes === undefined ? undefined : text(v.notes, "notes") }; }
export type ContentBriefBatch = { items: ContentBriefVersion[] };
// Valida a estrutura de um briefing provider-sem-ids; contentId/briefVersionId são server-derived.
export function validateContentBriefDraft(value: unknown): ContentBriefDraft {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Brief inválido");
  const v = value as Record<string, unknown>;
  rejectForbiddenFields(v, "Brief");
  return { angle: text(v.angle, "angle"), hook: text(v.hook, "hook"), development: strings(v.development, "development"), script: text(v.script, "script", 8_000), cta: text(v.cta, "cta"), structure: v.structure === undefined ? undefined : text(v.structure, "structure", 100), objective: v.objective === undefined ? undefined : text(v.objective, "objective"), targetAudience: v.targetAudience === undefined ? undefined : text(v.targetAudience, "targetAudience"), pain: optionalText(v.pain, "pain"), desire: optionalText(v.desire, "desire"), objection: optionalText(v.objection, "objection"), benefit: v.benefit === undefined ? undefined : text(v.benefit, "benefit"), notes: v.notes === undefined ? undefined : text(v.notes, "notes") };
}
export function validateContentBriefBatch(value: unknown): ContentBriefVersion[] {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Lote de briefings inválido");
  const v = value as Record<string, unknown>;
  const items = Array.isArray(v.items) ? v.items.map((item) => ({ ...validateContentBriefDraft(item), contentId: "", briefVersionId: "", version: 1 as const })) : [];
  const itemRule = cardinalityRule("items");
  if (items.length < itemRule.min) throw new ContractError("GEN-SCHEMA", "Lote de briefings vazio");
  if (items.length > itemRule.max) throw new ContractError("GEN-SCHEMA", `cardinalidade de items fora da política (max ${itemRule.max})`);
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
export type BriefValidationReport = { briefId: string; contentId: string; briefVersionId: string; gateVersion: number | null; factualStatus: FactStatus; structuralStatus: "PASS" | "FAIL"; platformStatus: "PASS" | "FAIL"; varietyStatus: "PASS" | "FAIL"; issues: string[]; decision: GateDecision };
export function validateBriefValidationReport(value: unknown): BriefValidationReport { if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Relatório inválido"); const v = value as Record<string, unknown>; const contentId = id(v.contentId, "contentId"); const briefVersionId = id(v.briefVersionId, "briefVersionId"); if (v.briefId !== `${contentId}:${briefVersionId}`) throw new ContractError("GEN-SCHEMA", "briefId inconsistente"); const factualStatus = v.factualStatus; if (!["SUPPORTED", "INFERRED_BUT_SAFE", "UNSUPPORTED", "CONTRADICTED"].includes(String(factualStatus))) throw new ContractError("GEN-FACT", "Factualidade inválida"); const decision = v.decision; if (!["PASS", "REPAIR", "REJECT"].includes(String(decision))) throw new ContractError("GEN-SCHEMA", "Decisão inválida"); return { briefId: v.briefId as string, contentId, briefVersionId, gateVersion: typeof v.gateVersion === "number" ? v.gateVersion : null, factualStatus: factualStatus as FactStatus, structuralStatus: v.structuralStatus === "PASS" ? "PASS" : "FAIL", platformStatus: v.platformStatus === "PASS" ? "PASS" : "FAIL", varietyStatus: v.varietyStatus === "PASS" ? "PASS" : "FAIL", issues: strings(v.issues, "issues"), decision: decision as GateDecision }; }
export const structureHash = (brief: Pick<ContentBriefVersion, "structure" | "development" | "cta">): string => { let h = 2166136261; for (const c of JSON.stringify([brief.structure ?? "", brief.development.length, brief.cta]).normalize("NFKC").toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16).padStart(8, "0"); };
export const normalizeForVariety = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();

// ─── ContentSceneSet (ADR-019) ────────────────────────────────────────────────
// Contrato canônico separado de ContentBriefVersion: cenas são sugestões visuais
// read-only derivadas do briefing completo, escopadas por (tenantId, briefVersionId).
// Nunca voltam ao payload do brief (imutabilidade preservada).
export type SceneIdea = { description: string };

// Saída do provider para CONTENT_SCENE_IDEAS antes do gate: 2–6 cenas.
export function validateContentSceneSetDraft(value: unknown): SceneIdea[] {
  if (!value || typeof value !== "object") throw new ContractError("GEN-SCHEMA", "Set de cenas inválido");
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.scenes)) throw new ContractError("GEN-SCHEMA", "scenes inválido", "scenes");
  const rule = CARDINALITY_POLICY.scenes;
  if (v.scenes.length < rule.min || v.scenes.length > rule.max)
    throw new ContractError("GEN-SCHEMA", `cardinalidade de scenes fora da política (min ${rule.min}, max ${rule.max})`, "scenes");
  return v.scenes.map((item): SceneIdea => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ContractError("GEN-SCHEMA", "cena inválida", "scenes");
    const scene = item as Record<string, unknown>;
    return { description: text(scene.description, "scenes.description", 500) };
  });
}
