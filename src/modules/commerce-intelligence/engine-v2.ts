// Etapa 4 V2 (override do usuário — recalibração; nota canônica é a autoridade
// máxima). Adaptador determinístico entre o runtime de produção e o harness
// `planPortfolio` (Etapa 3), leitor versionado de briefs (v2/v1/legacy),
// projeção allowlisted de realização e Scene Skeleton determinístico.
// Autoridade permanece server-side: nada aqui decide quota, estado, tenant ou
// persistência fora do ContentSceneSet existente.
import {
  CARDINALITY_POLICY,
  FORBIDDEN_OWNERSHIP,
  ContractError,
  validateContentBrief,
  validateContentBriefDraft,
  validateContentOpportunity,
  type CommercialOpportunity,
  type ContentBriefDraft,
  type ContentBriefVersion,
  type ContentOpportunity,
  type DevelopmentBullet,
  type EvidenceSnapshot,
  type ProductStrategy,
  type ProductUnderstanding,
  type SceneIdea,
} from "./contract";
import { GenerationError } from "./errors";
import { GATE_POLICY_VERSION, gateSceneSet, parseStructuredDevelopment } from "./gates";
import { CREATIVE_SYSTEM_SKILL_VERSION, loadCreativeSystem, resolveBlueprint } from "./creative-system";
import { classifyCtaFunction, loadPlatformSkill } from "./platform-skill";
import { canonicalSerialization, harnessSeedForFixture, sha256Hex } from "./planner-harness/canonical";
import {
  PLANNER_MEMORY_SIGNALS_V1,
  isEmptyMemorySnapshot,
  planPortfolio,
  type EvidenceRef,
  type MemorySnapshotInput,
  type PlannerInput,
} from "./planner-harness/plan-portfolio";
import type { CommercialDiscoveryPool, CreativeBlueprint, CreatorConstraints, PlannedOpportunityV2, ProductFactsProjection } from "./planner-harness/types";
import type { SceneSetOutcome } from "./engine";

export const BRIEF_GENERATION_POLICY_V2 = "BRIEF_GENERATION_POLICY_V1" as const;

// Binding do harness congelado (único aceito por planPortfolio) — fixture,
// nunca provenance live (ADR-033 §7). A Skill única do runtime é carregada por
// loadPlatformSkill() (default @1.3); provenance de Strategy/Run usa essa.
export const ENGINE_V2_SKILL_BINDING = {
  platformSkillVersion: "tiktok-commerce@1.3",
  creativeSystemVersion: "1.3",
  source: "frozen-harness-fixture",
} as const;

// ─── Evidência: refs tipadas do harness ─────────────────────────────────────
// valueHash é derivado do valor do fato com o MESMO sha256Hex do harness;
// igualdade exata (id, field, valueHash) é o único vínculo aceito.
export function evidenceRefFor(ref: string, value: string): EvidenceRef {
  const separator = ref.indexOf(":");
  return {
    id: ref,
    field: separator === -1 ? ref : ref.slice(separator + 1),
    valueHash: sha256Hex(value),
  };
}

export function evidenceRefCatalog(evidence: EvidenceSnapshot): EvidenceRef[] {
  return evidence.refs.map((ref, index) => evidenceRefFor(ref, String(evidence.facts[index] ?? "")));
}

// ─── Leitor versionado de briefs persistidos (v2/v1/legacy) ─────────────────
export type BriefPayloadSchema = "v2" | "v1" | "legacy";
export type ReadBriefPayloadResult = { schema: BriefPayloadSchema; brief: ContentBriefVersion };

// Discriminator: developmentSchemaVersion/version no payload persistido.
// v2 (writer `briefPayloadForPersistence`): version 2 + DevelopmentBullet[];
// v1: version 1 com development string[]; legacy: sem version (strip de scenes).
// A saída é sempre o tipo de runtime ContentBriefVersion (fail-closed).
// Discriminator puro (compartilhado com a projeção HTTP): developmentSchemaVersion/version.
export function briefPayloadSchemaOf(raw: unknown): BriefPayloadSchema {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new ContractError("GEN-SCHEMA", "Brief persistido não é um objeto");
  const payload = raw as Record<string, unknown>;
  if ((payload.version === 2) !== (payload.developmentSchemaVersion === 2))
    throw new ContractError("GEN-SCHEMA", "Brief v2 exige developmentSchemaVersion=2 consistente", "developmentSchemaVersion");
  return payload.version === 2 ? "v2" : payload.version === 1 && payload.bullets === undefined ? "v1" : "legacy";
}

// Validação estrita compartilhada (reader do engine + projeção HTTP): lista de
// 2..6 bullets canônicos, cada um com text/action/rationale/factRefs/cta.
export function validateV2DevelopmentBullets(value: unknown): DevelopmentBullet[] {
  const rawDevelopment = Array.isArray(value) ? value : [];
  const bullets = rawDevelopment.map((bullet): DevelopmentBullet => {
    if (typeof bullet !== "object" || bullet === null || Array.isArray(bullet))
      throw new ContractError("GEN-SCHEMA", "Brief v2 com bullet inválido", "development");
    const record = bullet as Record<string, unknown>;
    if (typeof record.text !== "string" || !record.text.trim())
      throw new ContractError("GEN-SCHEMA", "Brief v2 com bullet sem texto", "development");
    if (typeof record.action !== "string" || !record.action.trim())
      throw new ContractError("GEN-SCHEMA", "Brief v2 com bullet sem ação", "development");
    if (typeof record.rationale !== "string" || !record.rationale.trim())
      throw new ContractError("GEN-SCHEMA", "Brief v2 com bullet sem razão", "development");
    if (!Array.isArray(record.factRefs) || record.factRefs.length === 0 || record.factRefs.some((ref) => typeof ref !== "string" || !ref.trim()))
      throw new ContractError("GEN-SCHEMA", "Brief v2 com bullet sem factRefs", "development");
    if (typeof record.cta !== "string" || !record.cta.trim())
      throw new ContractError("GEN-SCHEMA", "Brief v2 com bullet sem cta", "development");
    return { text: record.text, action: record.action, rationale: record.rationale, factRefs: record.factRefs, cta: record.cta };
  });
  if (bullets.length < CARDINALITY_POLICY.development.min || bullets.length > CARDINALITY_POLICY.development.max)
    throw new ContractError("GEN-SCHEMA", "Brief v2 com development fora da cardinalidade", "development");
  return bullets;
}

export function readBriefPayload(raw: unknown): ReadBriefPayloadResult {
  const schema = briefPayloadSchemaOf(raw);
  const payload = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  if (schema === "legacy" && !Array.isArray(payload.development))
    throw new ContractError("GEN-SCHEMA", "Brief persistido sem schema reconhecível (v1/v2/legacy)");
  let bullets: DevelopmentBullet[] | undefined;
  let development: string[];
  if (schema === "v2") {
    bullets = validateV2DevelopmentBullets(payload.development);
    development = bullets.map(({ text }) => text);
  } else {
    development = (Array.isArray(payload.development) ? payload.development : []).map((point) => {
      if (typeof point !== "string" || !point.trim())
        throw new ContractError("GEN-SCHEMA", "Brief com development inválido", "development");
      return point;
    });
  }
  // validateContentBrief é a autoridade do shape; scenes legadas nunca passam.
  const validated = validateContentBrief({
    contentId: typeof payload.contentId === "string" ? payload.contentId : "",
    briefVersionId: typeof payload.briefVersionId === "string" ? payload.briefVersionId : "",
    version: 1,
    angle: typeof payload.angle === "string" ? payload.angle : "",
    hook: typeof payload.hook === "string" ? payload.hook : "",
    development,
    script: typeof payload.script === "string" ? payload.script : "",
    cta: typeof payload.cta === "string" ? payload.cta : "",
  });
  // Bullets canônicos v2 são anexados ao runtime shape (validateContentBrief
  // projeta apenas campos de briefing); deep-equal aos bullets persistidos.
  const brief = bullets ? { ...validated, bullets } : validated;
  return { schema, brief };
}

// ─── Adaptador produção → harness PlannerInput ──────────────────────────────
export type PlannerV2Source = {
  jobId: string;
  productId: string;
  targetContentCount: number;
  commercialOpportunities: readonly CommercialOpportunity[];
  evidence: EvidenceSnapshot;
  memory?: unknown;
  // Restrições reais do creator quando existirem; ausentes → allowlist do
  // Creative System inteiro (neutro). Podem reduzir o pool por formato/papel.
  creatorConstraints?: CreatorConstraints;
};

// Snapshot de produção é legado (D11: sem signalsSchemaVersion) → snapshot
// vazio; envelope PLANNER_MEMORY_SIGNALS_V1 explícito passa integralmente.
// Nenhuma retrofabricação de sinais.
export function memorySnapshotV2(memory: unknown): MemorySnapshotInput {
  if (typeof memory !== "object" || memory === null || Array.isArray(memory) || Object.keys(memory).length === 0) return {};
  const record = memory as Record<string, unknown>;
  if (record.signalsSchemaVersion === PLANNER_MEMORY_SIGNALS_V1 && Array.isArray(record.signals))
    return memory as MemorySnapshotInput;
  return {};
}

export function buildPlannerInputV2(source: PlannerV2Source): PlannerInput {
  if (source.commercialOpportunities.length === 0)
    throw new ContractError("GEN-SCHEMA", "Sem oportunidades comerciais para o Planner V2", "opportunities");
  const catalog = evidenceRefCatalog(source.evidence);
  if (catalog.length === 0)
    throw new ContractError("GEN-SCHEMA", "Evidência autorizada ausente para o Planner V2", "evidenceRefsCatalog");
  const valueByRef = new Map(source.evidence.refs.map((ref, index) => [ref, String(source.evidence.facts[index] ?? "")]));
  const typedRefs = (opportunity: CommercialOpportunity): EvidenceRef[] =>
    opportunity.evidenceRefs.flatMap((ref) => {
      const value = valueByRef.get(ref);
      return value === undefined ? [] : [evidenceRefFor(ref, value)];
    });
  return {
    fixtureId: source.jobId,
    targetContentCount: source.targetContentCount,
    productFacts: v2ProductFactsProjection(source.evidence),
    commercialDiscovery: {
      evidenceCatalog: { refs: catalog },
      opportunities: source.commercialOpportunities.map((opportunity) => ({
        sourceOpportunityId: opportunity.id,
        // Mapeamento determinístico 1:1 com campos validados do Mapping; nada é
        // inventado: fallbacks são campos obrigatórios do próprio contrato v1.
        commercialObjective: opportunity.desire ?? opportunity.desiredOutcome ?? opportunity.sellingArgument,
        angle: opportunity.benefits[0] ?? opportunity.relevantCapabilities[0] ?? opportunity.sellingArgument,
        coreMessage: opportunity.sellingArgument,
        commercialEffects: opportunity.benefits,
        ...(opportunity.audience !== undefined || opportunity.situation !== undefined
          ? { audienceContext: opportunity.audience ?? opportunity.situation }
          : {}),
        ...(opportunity.proofOptions.length > 0 ? { proofPattern: opportunity.proofOptions[0] } : {}),
        evidenceRefs: typedRefs(opportunity),
      })),
    },
    // Restrições explícitas do creator quando existirem; default neutro = todos
    // os formatos/papéis do Creative System congelado (nada inventado).
    creatorConstraints: source.creatorConstraints ?? v2NeutralConstraints(),
    productionConstraints: {},
    skillBinding: { ...ENGINE_V2_SKILL_BINDING },
    inputMemorySnapshot: memorySnapshotV2(source.memory),
    seed: harnessSeedForFixture({
      fixtureId: source.jobId,
      targetContentCount: source.targetContentCount,
      plannerPolicyVersion: "PLANNER_POLICY_V1",
      skillBinding: { ...ENGINE_V2_SKILL_BINDING },
      inputFingerprint: sha256Hex(catalog.map((ref) => ref.valueHash).join("|")),
    }),
    plannerPolicyVersion: "PLANNER_POLICY_V1",
  };
}

export type PortfolioResultV2 = {
  planned: PlannedOpportunityV2[];
  plannerPolicyVersion: "PLANNER_POLICY_V1";
  seed: string;
  binding: { platformSkillVersion: string; creativeSystemVersion: string };
  outputHash: string;
};

export function runPlannerV2(source: PlannerV2Source): PortfolioResultV2 {
  const result = planPortfolio(buildPlannerInputV2(source));
  if (!result.ok)
    throw new GenerationError(result.error.code, result.error.message, false, {
      phase: result.error.phase,
      field: result.error.field ?? "",
      plannerPolicyVersion: result.error.plannerPolicyVersion,
    });
  return {
    planned: [...result.value.opportunities],
    plannerPolicyVersion: result.value.plannerPolicyVersion,
    seed: result.value.seed,
    binding: { ...ENGINE_V2_SKILL_BINDING },
    outputHash: sha256Hex(canonicalSerialization(result.value.opportunities)),
  };
}

// Handoff V2 allowlisted para EngineResult/persistência: ordem/posição
// server-side, source/evidence exatas e Blueprint resolvido como
// creativeDirection canônica do contrato V2 — sem provider IDs, sem catálogo.
export type PlannedOpportunityHandoffV2 = {
  opportunityContractVersion: "2";
  position: number;
  sourceOpportunityId: string;
  candidateKey: string;
  hookMechanism: string;
  blueprint: PlannedOpportunityV2["blueprint"];
  creativeDirection: CreativeBlueprint;
  evidenceRefs: readonly EvidenceRef[];
  commercialObjective: string;
  angle: string;
  coreMessage: string;
};

export function plannedHandoffV2(planned: readonly PlannedOpportunityV2[]): PlannedOpportunityHandoffV2[] {
  const system = loadCreativeSystem(CREATIVE_SYSTEM_SKILL_VERSION);
  return planned.map((item, index) => ({
    opportunityContractVersion: "2" as const,
    position: index + 1,
    sourceOpportunityId: item.sourceOpportunityId,
    candidateKey: item.candidateKey,
    hookMechanism: item.hookMechanism,
    blueprint: item.blueprint,
    creativeDirection: resolveBlueprint(system, item.blueprint.blueprint),
    evidenceRefs: [...item.evidenceRefs],
    commercialObjective: item.commercialObjective,
    angle: item.angle,
    coreMessage: item.coreMessage,
  }));
}

// PlannedOpportunityV2 → ContentOpportunity (shape v1 consumido pelo fluxo de
// briefs/judge/persistência). IDs são server-derived; sourceOpportunityId
// permanece vinculado ao conjunto comercial validado.
export function contentOpportunitiesFromPortfolio(
  planned: readonly PlannedOpportunityV2[],
  jobId: string,
  allowedSourceIds: ReadonlySet<string>,
): ContentOpportunity[] {
  return planned.map((item, index) =>
    validateContentOpportunity(
      {
        id: `${jobId}-opportunity-${index + 1}`,
        commercialObjective: item.commercialObjective,
        angle: item.angle,
        coreMessage: item.coreMessage,
        hookMechanism: item.hookMechanism,
        // PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2 aceita noveltyTargets vazio,
        // o contrato v1 exige 1..4: âncora determinística = próprio ângulo.
        noveltyTargets: item.noveltyTargets.length > 0 ? [...item.noveltyTargets] : [item.angle],
        ...(item.desiredViewerResponse !== undefined ? { desiredViewerResponse: item.desiredViewerResponse } : {}),
        sourceOpportunityId: item.sourceOpportunityId,
      },
      allowedSourceIds,
    ),
  );
}

// ─── Contrato de resposta V2 (decisão A — allowlists exatas) ────────────────
// Envelope do lote: exatamente {developmentSchemaVersion: 2, items}. Item:
// exatamente {angle, hook, development, script, cta}. Bullet: exatamente
// {text, action, rationale, factRefs, cta}. Campo desconhecido em qualquer
// nível → GEN-SCHEMA (sem projeção silenciosa). Marker ausente/errado →
// GEN-SCHEMA. Sem marker, sem parse.

const BRIEF_ITEM_KEYS_V2: readonly string[] = ["angle", "hook", "development", "script", "cta"];
const BULLET_KEYS_V2: readonly string[] = ["text", "action", "rationale", "factRefs", "cta"];

function rejectUnknownKeysV2(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(record))
    if (!allowed.includes(key))
      throw new ContractError("GEN-SCHEMA", `Brief V2: campo desconhecido "${key}" em ${label}`, label);
}

function nonEmptyStringV2(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function assertBulletWireV2(bullet: unknown): void {
  if (typeof bullet !== "object" || bullet === null || Array.isArray(bullet))
    throw new ContractError("GEN-SCHEMA", "Brief V2 com bullet inválido", "development");
  const record = bullet as Record<string, unknown>;
  rejectUnknownKeysV2(record, BULLET_KEYS_V2, "bullet V2");
  for (const key of ["text", "action", "rationale", "cta"] as const)
    if (!nonEmptyStringV2(record[key]))
      throw new ContractError("GEN-SCHEMA", `Brief V2 com bullet ${key} inválido`, "development");
  if (!Array.isArray(record.factRefs) || record.factRefs.length === 0 || record.factRefs.some((ref) => !nonEmptyStringV2(ref)))
    throw new ContractError("GEN-SCHEMA", "Brief V2 com bullet factRefs inválido", "development");
}

// Envelope do lote V2 recebido do provider (não confiável).
export function parseBriefBatchEnvelopeV2(producer: unknown): { items: unknown[] } {
  if (typeof producer !== "object" || producer === null || Array.isArray(producer))
    throw new ContractError("GEN-SCHEMA", "Resposta V2 deve ser um objeto");
  const record = producer as Record<string, unknown>;
  rejectUnknownKeysV2(record, ["developmentSchemaVersion", "items"], "envelope V2");
  if (!nonEmptyStringV2(String(record.developmentSchemaVersion)) || record.developmentSchemaVersion !== 2)
    throw new ContractError("GEN-SCHEMA", "Resposta V2 exige developmentSchemaVersion=2", "developmentSchemaVersion");
  if (!Array.isArray(record.items))
    throw new ContractError("GEN-SCHEMA", "Resposta V2 sem items", "items");
  return { items: record.items };
}

// Item do lote V2: chaves exatas + bullets com wire exato; delega a validação
// factual/estrutural ao parser canônico existente (V1 parser preservado).
export function parseStructuredBriefDraftV2(item: unknown, evidence: EvidenceSnapshot): { draft: ContentBriefDraft; bullets: DevelopmentBullet[] } {
  if (typeof item !== "object" || item === null || Array.isArray(item))
    throw new ContractError("GEN-SCHEMA", "Brief V2 inválido: item não é objeto");
  const record = item as Record<string, unknown>;
  rejectUnknownKeysV2(record, BRIEF_ITEM_KEYS_V2, "item V2");
  if (!Array.isArray(record.development))
    throw new ContractError("GEN-SCHEMA", "Brief V2 sem development", "development");
  record.development.forEach((bullet) => assertBulletWireV2(bullet));
  const { texts, bullets } = parseStructuredDevelopment(record.development, evidence);
  return { draft: validateContentBriefDraft({ angle: record.angle, hook: record.hook, development: texts, script: record.script, cta: record.cta }), bullets };
}

// Repair V2: envelope de item único com marker obrigatório.
export function parseBriefRepairDraftV2(output: unknown, evidence: EvidenceSnapshot): { draft: ContentBriefDraft; bullets: DevelopmentBullet[] } {
  if (typeof output !== "object" || output === null || Array.isArray(output))
    throw new ContractError("GEN-SCHEMA", "Repair V2 inválido: resposta não é objeto");
  const record = output as Record<string, unknown>;
  rejectUnknownKeysV2(record, ["developmentSchemaVersion", ...BRIEF_ITEM_KEYS_V2], "repair V2");
  if (record.developmentSchemaVersion !== 2)
    throw new ContractError("GEN-SCHEMA", "Repair V2 exige developmentSchemaVersion=2", "developmentSchemaVersion");
  if (!Array.isArray(record.development))
    throw new ContractError("GEN-SCHEMA", "Repair V2 sem development", "development");
  record.development.forEach((bullet) => assertBulletWireV2(bullet));
  const { texts, bullets } = parseStructuredDevelopment(record.development, evidence);
  return { draft: validateContentBriefDraft({ angle: record.angle, hook: record.hook, development: texts, script: record.script, cta: record.cta }), bullets };
}

// ─── Stage 2: Discovery V2 (LLM evoluído — envelope versionado) ────────────
// Valida o envelope do LLM Discovery: allowlist exata, refs ⊆ catálogo,
// commercialEffects obrigatórios para diversidade do planner. Fail-closed.

export function parseDiscoveryEnvelopeV2(
  raw: unknown,
  evidence: EvidenceSnapshot,
): DiscoveryEnvelopeV2 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new ContractError("GEN-SCHEMA", "Discovery V2 deve ser um objeto");
  const envelope = raw as Record<string, unknown>;
  // SPEC §3.3B/AC12: chaves server-owned/proibidas rejeitadas; demais
  // desconhecidas são DESCARTADAS na canonicalização (não propagadas).
  // sourceOpportunityId é server-owned do Discovery (AC16/ADR-033) e rejeitada
  // explicitamente aqui — não pode entrar em FORBIDDEN_OWNERSHIP global porque
  // validateContentOpportunity a aceita legitimamente.
  const DISCOVERY_SERVER_OWNED_V2: Record<string, true> = { ...FORBIDDEN_OWNERSHIP, sourceOpportunityId: true };
  for (const key of Object.keys(envelope))
    if (DISCOVERY_SERVER_OWNED_V2[key])
      throw new ContractError("GEN-SCHEMA", `Discovery V2: campo não permitido "${key}" no envelope`, key);
  if (envelope.discoveryContractVersion !== "2")
    throw new ContractError("GEN-SCHEMA", "Discovery V2 exige discoveryContractVersion=2", "discoveryContractVersion");
  if (!Array.isArray(envelope.hypotheses))
    throw new ContractError("GEN-SCHEMA", "Discovery V2 sem hypotheses", "hypotheses");
  const knownRefs = new Set(evidence.refs);
  const hypotheses: DiscoveryHypothesisV2[] = envelope.hypotheses.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw new ContractError("GEN-SCHEMA", `Discovery V2 hypothesis ${index + 1} inválida`, "hypotheses");
    const h = item as Record<string, unknown>;
    for (const key of Object.keys(h))
      if (DISCOVERY_SERVER_OWNED_V2[key])
        throw new ContractError("GEN-SCHEMA", `Discovery V2: campo não permitido "${key}" na hypothesis ${index + 1}`, key);
    for (const key of ["commercialObjective", "angle", "coreMessage"] as const)
      if (typeof h[key] !== "string" || !(h[key] as string).trim())
        throw new ContractError("GEN-SCHEMA", `Discovery V2 hypothesis ${index + 1}: ${key} obrigatório`, key);
    if (!Array.isArray(h.commercialEffects) || h.commercialEffects.length === 0 || h.commercialEffects.some((e) => typeof e !== "string" || !e.trim()))
      throw new ContractError("GEN-SCHEMA", `Discovery V2 hypothesis ${index + 1}: commercialEffects obrigatório (≥1)`, "commercialEffects");
    if (!Array.isArray(h.evidenceRefs) || h.evidenceRefs.length === 0 || h.evidenceRefs.some((ref) => typeof ref !== "string" || !knownRefs.has(ref)))
      throw new ContractError("GEN-SCHEMA", `Discovery V2 hypothesis ${index + 1}: evidenceRefs fora do catálogo autorizado`, "evidenceRefs");
    if (typeof h.confidence !== "number" || h.confidence < 0 || h.confidence > 1)
      throw new ContractError("GEN-SCHEMA", `Discovery V2 hypothesis ${index + 1}: confidence inválido`, "confidence");
    // ADR-033 §3: opcional PRESENTE vazio ou com tipo inválido falha antes do
    // retorno; null (permitido pelo schema do provider) é ausência no
    // envelope JSON-safe — nunca vira string vazia nem é inventado.
    const nullable = (key: string): string | null => {
      if (!(key in h)) return null;
      const value = h[key];
      if (value === null) return null;
      if (typeof value !== "string" || !(value as string).trim())
        throw new ContractError("GEN-SCHEMA", `Discovery V2 hypothesis ${index + 1}: ${key} presente deve ser string não vazia`, key);
      return (value as string).trim();
    };
    return {
      commercialObjective: h.commercialObjective as string,
      angle: h.angle as string,
      coreMessage: h.coreMessage as string,
      desiredViewerResponse: nullable("desiredViewerResponse"),
      audience: nullable("audience"),
      situation: nullable("situation"),
      desire: nullable("desire"),
      identification: nullable("identification"),
      curiosity: nullable("curiosity"),
      aspiration: nullable("aspiration"),
      humorPotential: nullable("humorPotential"),
      visualPotential: nullable("visualPotential"),
      pain: nullable("pain"),
      objection: nullable("objection"),
      desiredOutcome: nullable("desiredOutcome"),
      relevantCapabilities: Array.isArray(h.relevantCapabilities) ? h.relevantCapabilities.filter((c): c is string => typeof c === "string" && c.trim().length > 0) : [],
      benefits: Array.isArray(h.benefits) ? h.benefits.filter((b): b is string => typeof b === "string" && b.trim().length > 0) : [],
      proofOptions: Array.isArray(h.proofOptions) ? h.proofOptions.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [],
      commercialEffects: Object.freeze(h.commercialEffects as string[]),
      evidenceRefs: Object.freeze(h.evidenceRefs as string[]),
      confidence: typeof h.confidence === "number" ? h.confidence : 0,
    };
  });
  if (hypotheses.length === 0)
    throw new ContractError("GEN-SCHEMA", "Discovery V2 sem hypotheses", "hypotheses");
  return { discoveryContractVersion: "2", hypotheses };
}

// Ponte versionada para o harness frozen — CommercialDiscoveryPool.
export function discoveryPoolV2(
  discovery: DiscoveryEnvelopeV2,
  evidence: EvidenceSnapshot,
): CommercialDiscoveryPool {
  const catalog = evidenceRefCatalog(evidence);
  const knownRefs = new Map(catalog.map((ref) => [ref.id, ref]));
  return {
    evidenceCatalog: { refs: catalog },
    opportunities: discovery.hypotheses.map((h, index) => ({
      sourceOpportunityId: `discovery-${index + 1}`,
      commercialObjective: h.commercialObjective,
      angle: h.angle,
      coreMessage: h.coreMessage,
      ...(h.desiredViewerResponse !== null ? { desiredViewerResponse: h.desiredViewerResponse } : {}),
      commercialEffects: [...h.commercialEffects],
      ...(h.audience !== null ? { audienceContext: h.audience } : {}),
      ...(h.proofOptions.length > 0 ? { proofPattern: h.proofOptions[0] } : {}),
      evidenceRefs: h.evidenceRefs.map((ref) => {
        const known = knownRefs.get(ref);
        return known ?? { id: ref, field: ref, valueHash: sha256Hex(ref) };
      }),
    })),
  };
}

// Adiciona blueprint canônico + contract version ao ContentOpportunity V2.
export function enrichContentOpportunity(
  base: ContentOpportunity,
  planned: PlannedOpportunityV2,
): ContentOpportunity & { opportunityContractVersion: "2"; creativeDirection: PlannedOpportunityV2["blueprint"] } {
  return {
    ...base,
    opportunityContractVersion: "2" as const,
    creativeDirection: planned.blueprint,
  };
}

// ─── Stage 3: ProductMemory multidimensional (PLANNER_MEMORY_SIGNALS_V1) ───

export function projectMemorySignalsForPlanner(
  delivered: readonly {
    blueprint: { recipeId?: string; attentionMechanisms: readonly string[]; psychologicalEffects: readonly string[]; format: string; productRole: string; narrativeMoves: readonly string[] };
    commercialEffects?: readonly string[];
    audienceContext?: string;
    proofPattern?: string;
  }[],
): Array<{
  signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1";
  recipeId?: string;
  attentionMechanisms: readonly string[];
  psychologicalEffects: readonly string[];
  format?: string;
  productRole?: string;
  narrativeShape: readonly string[];
  commercialEffects?: readonly string[];
  audienceContext?: string;
  proofPattern?: string;
}> {
  return delivered.map((item) => ({
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const,
    ...(item.blueprint.recipeId !== undefined ? { recipeId: item.blueprint.recipeId } : {}),
    attentionMechanisms: [...item.blueprint.attentionMechanisms],
    psychologicalEffects: [...item.blueprint.psychologicalEffects],
    ...(item.blueprint.format !== undefined ? { format: item.blueprint.format } : {}),
    ...(item.blueprint.productRole !== undefined ? { productRole: item.blueprint.productRole } : {}),
    narrativeShape: [...item.blueprint.narrativeMoves],
    ...(item.commercialEffects !== undefined ? { commercialEffects: [...item.commercialEffects] } : {}),
    ...(item.audienceContext !== undefined ? { audienceContext: item.audienceContext } : {}),
    ...(item.proofPattern !== undefined ? { proofPattern: item.proofPattern } : {}),
  }));
}

// ─── Projeção allowlisted de realização (contexto do provider) ──────────────
// Contrato canônico da nota (requisitos §4.2): projeção allowlisted POR
// oportunidade. NUNCA contém: catálogo literal (hooks/CTAs), selectedPatterns,
// texto de hook/CTA, creativeDirection como campo, IDs persistentes,
// quota/status/comandos. `blueprint` é o CreativeBlueprint RESOLVIDO
// (resolveBlueprint), não o envelope.
export type BriefRealizationInput = {
  commercialObjective: string;
  angle: string;
  coreMessage: string;
  desiredViewerResponse?: string;
  hookMechanism: string;
  blueprint: CreativeBlueprint;
  validatedEvidenceRefs: readonly EvidenceRef[];
  productFacts: ProductFactsProjection;
  creatorConstraints: CreatorConstraints;
  memoryConstraints: readonly string[];
  platformRules: Readonly<Record<string, string | number | boolean>>;
};

// Projeção server-side de fatos do produto (sem IDs persistentes).
export function v2ProductFactsProjection(evidence: EvidenceSnapshot, productRef = "product"): ProductFactsProjection {
  return {
    fixtureProductRef: productRef,
    fields: Object.fromEntries(
      evidence.refs.map((ref, index) => [evidenceRefFor(ref, "").field, String(evidence.facts[index] ?? "")]),
    ),
    evidenceRefs: evidenceRefCatalog(evidence),
  };
}

// Restrições neutras quando a produção não declara nenhuma: allowlist integral
// do Creative System congelado (nada inventado).
export function v2NeutralConstraints(): CreatorConstraints {
  const system = loadCreativeSystem(CREATIVE_SYSTEM_SKILL_VERSION);
  return {
    allowedFormats: [...system.formats],
    allowedProductRoles: [...system.productRoles],
    disallowedFormats: [],
    disallowedProductRoles: [],
  };
}

// Perfis reais do creator (quando declarados no creatorContext) viram restrições
// do Planner V2; sem declaração → undefined (chamador aplica o default neutro).
export function v2ConstraintsFromCreatorContext(context: Record<string, unknown> | undefined): CreatorConstraints | undefined {
  const stringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : undefined;
  const allowedFormats = stringArray(context?.allowedFormats);
  const allowedProductRoles = stringArray(context?.allowedProductRoles);
  if (!allowedFormats && !allowedProductRoles) return undefined;
  return {
    allowedFormats: allowedFormats ?? [],
    allowedProductRoles: allowedProductRoles ?? [],
    disallowedFormats: [],
    disallowedProductRoles: [],
  };
}

export function buildRealizationInput(
  planned: PlannedOpportunityV2,
  evidence: EvidenceSnapshot,
  memory: unknown,
  extras?: { productFacts?: ProductFactsProjection; creatorConstraints?: CreatorConstraints; platformRules?: Readonly<Record<string, string | number | boolean>> },
): BriefRealizationInput {
  const snapshot = memorySnapshotV2(memory);
  const memoryConstraints = isEmptyMemorySnapshot(snapshot) ? [] : [`signalsSchemaVersion:${PLANNER_MEMORY_SIGNALS_V1}`];
  return {
    commercialObjective: planned.commercialObjective,
    angle: planned.angle,
    coreMessage: planned.coreMessage,
    ...(planned.desiredViewerResponse !== undefined ? { desiredViewerResponse: planned.desiredViewerResponse } : {}),
    hookMechanism: planned.hookMechanism,
    blueprint: resolveBlueprint(loadCreativeSystem(CREATIVE_SYSTEM_SKILL_VERSION), planned.blueprint.blueprint),
    validatedEvidenceRefs: [...planned.evidenceRefs],
    productFacts: extras?.productFacts ?? v2ProductFactsProjection(evidence),
    creatorConstraints: extras?.creatorConstraints ?? v2NeutralConstraints(),
    memoryConstraints,
    platformRules: extras?.platformRules ?? {},
  };
}

// Contexto do provider: cópia EXPLÍCITA do allowlist canônico — nenhuma chave
// extra do input atravessa (sem IDs, catálogo, selectedPatterns, workflow).
export function buildRealizationContext(input: BriefRealizationInput): Record<string, unknown> {
  return {
    commercialObjective: input.commercialObjective,
    angle: input.angle,
    coreMessage: input.coreMessage,
    ...(input.desiredViewerResponse !== undefined ? { desiredViewerResponse: input.desiredViewerResponse } : {}),
    hookMechanism: input.hookMechanism,
    blueprint: input.blueprint,
    validatedEvidenceRefs: input.validatedEvidenceRefs.map(({ id, field, valueHash }) => ({ id, field, valueHash })),
    productFacts: input.productFacts,
    creatorConstraints: input.creatorConstraints,
    memoryConstraints: input.memoryConstraints,
    platformRules: input.platformRules,
  };
}

// ─── Scene Skeleton determinístico (substitui a chamada por Content) ────────
// Cenas derivadas SOMENTE de fatos autorizados + nome do produto: sem claim
// novo, sem fala, sem locator; verbo de ação observável na abertura. Passa pelo
// MESMO gateSceneSet (autoridade objetiva vigente).
export type SceneSetOutcomeV2 = SceneSetOutcome & { gatePolicyVersion: typeof GATE_POLICY_VERSION };

const SCENE_SKELETON_VERBS = ["Mostre", "Teste", "Compare", "Ajuste", "Gire"] as const;

export function buildSceneSkeleton(brief: ContentBriefVersion, evidence: EvidenceSnapshot): SceneIdea[] {
  const product = evidence.facts[evidence.refs.indexOf("product:name")] ?? brief.angle;
  const grounding = evidence.facts.filter((_fact, index) => evidence.refs[index] !== "product:name");
  const seen = new Set<string>();
  const scenes: SceneIdea[] = [];
  const push = (description: string) => {
    const key = description.trim().toLocaleLowerCase("pt-BR");
    if (!seen.has(key)) {
      seen.add(key);
      scenes.push({ description });
    }
  };
  grounding.slice(0, 5).forEach((fact, index) => {
    push(`${SCENE_SKELETON_VERBS[index % SCENE_SKELETON_VERBS.length]} ${product} revelando ${fact}`);
  });
  if (scenes.length < 2 && product) push(`Mostre ${product} em close simples, com o celular na mão`);
  if (scenes.length < 2 && product) push(`Teste ${product} na palma da mão, sem fala`);
  return scenes.slice(0, 6);
}

export function buildSceneSkeletonSets(
  briefs: readonly ContentBriefVersion[],
  evidence: EvidenceSnapshot,
  creatorContext: Record<string, unknown>,
): SceneSetOutcomeV2[] {
  const recordsAlone = creatorContext["recordsAlone"] === true ? { recordsAlone: true } : {};
  return briefs.map((brief) => {
    const raw = buildSceneSkeleton(brief, evidence);
    const gated = gateSceneSet(raw, brief, evidence, recordsAlone);
    const status = gated.kept.length >= 2 ? "AVAILABLE" : gated.kept.length > 0 ? "FILTERED" : "ERROR";
    return {
      contentId: brief.contentId,
      briefVersionId: brief.briefVersionId,
      status,
      scenes: gated.kept,
      // generated = tamanho do skeleton ANTES do gate; dropped = removidas pelo gate.
      generated: raw.length,
      dropped: raw.length - gated.kept.length,
      backfilled: false,
      gatePolicyVersion: GATE_POLICY_VERSION,
      ...(gated.causes.length > 0 ? { causes: gated.causes } : {}),
    };
  });
}

// ─── Telemetria de estilo (proxies lexicais fora da autoridade no V2) ───────
// Distribuição de função de CTA e hooks em pergunta: observabilidade apenas;
// factualidade e duplicatas objetivas permanecem autoridade do hard gate.
export function briefStyleObservations(briefs: readonly ContentBriefVersion[]): {
  ctaFunctions: Record<string, number>;
  questionHooks: number;
} {
  const ctaFunctions: Record<string, number> = {};
  let questionHooks = 0;
  for (const brief of briefs) {
    const fn = classifyCtaFunction(brief.cta);
    ctaFunctions[fn] = (ctaFunctions[fn] ?? 0) + 1;
    if (brief.hook.trim().endsWith("?")) questionHooks += 1;
  }
  return { ctaFunctions, questionHooks };
}

// isEmptyMemorySnapshot reexportado para o engine não depender do harness direto.
export { isEmptyMemorySnapshot };
// ─── Stage 2: Discovery/Strategy V2 (contrato canônico) ────────────────────

export type DiscoveryHypothesisV2 = {
  commercialObjective: string;
  angle: string;
  coreMessage: string;
  desiredViewerResponse: string | null;
  audience: string | null;
  situation: string | null;
  desire: string | null;
  identification: string | null;
  curiosity: string | null;
  aspiration: string | null;
  humorPotential: string | null;
  visualPotential: string | null;
  pain: string | null;
  objection: string | null;
  desiredOutcome: string | null;
  relevantCapabilities: readonly string[];
  benefits: readonly string[];
  proofOptions: readonly string[];
  commercialEffects: readonly string[];
  evidenceRefs: readonly string[];
  confidence: number;
};

export type DiscoveryEnvelopeV2 = {
  discoveryContractVersion: "2";
  hypotheses: readonly DiscoveryHypothesisV2[];
};

// ─── Stage 3: ContentOpportunity V2 persistence enrichment ─────────────────

// Enriquece a opportunity com o handoff V2 (blueprint canônico + contract
// version) para persistência no payload do contentOpportunity. Sem IDs de
// provider, sem catálogo, sem cena.
export function enrichOpportunityV2(
  base: ContentOpportunity,
  handoff: PlannedOpportunityHandoffV2,
): ContentOpportunity & { opportunityContractVersion: "2"; creativeDirection: PlannedOpportunityHandoffV2["creativeDirection"] } {
  return {
    ...base,
    opportunityContractVersion: "2" as const,
    creativeDirection: handoff.creativeDirection,
  };
}

// ─── Stage 3: Memory snapshot V1 — merge canônico para persistência ─────────

// Constrói o snapshot de memória a partir dos sinais canônicos do planner.
// Delega o merge deduplicado ao harness (mergeMemorySignalsCanonical).
// Legacy snapshots (sem envelope) são ignorados — sem retrofabricar sinais.
export function buildPlannerMemorySnapshot(
  previousSignals: unknown,
  deliveredRecords: readonly ReturnType<typeof projectMemorySignalsForPlanner>[number][],
): { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1"; signals: readonly Record<string, unknown>[] } {
  const snapshot = memorySnapshotV2(previousSignals);
  if (isEmptyMemorySnapshot(snapshot) && deliveredRecords.length === 0)
    return { signalsSchemaVersion: PLANNER_MEMORY_SIGNALS_V1, signals: [] };
  // Se legacy (sem envelope), o planner recebe empty — sem retrofabricar.
  if (isEmptyMemorySnapshot(snapshot)) return { signalsSchemaVersion: PLANNER_MEMORY_SIGNALS_V1, signals: deliveredRecords };
  // Envelope V1 válido → merge canônico via harness.
  return { signalsSchemaVersion: PLANNER_MEMORY_SIGNALS_V1, signals: [...snapshot.signals, ...deliveredRecords] };
}
