import test from "node:test";
import assert from "node:assert/strict";
import { validateTargetContentCount, validateContentBrief, validateContentOpportunity, validateProductStrategy, validateProductUnderstanding, structureHash, normalizeForVariety, CARDINALITY_POLICY, CARDINALITY_POLICY_VERSION, validateCommercialOpportunity } from "./contract";
test("accepts only integer quantity from 1 through 10", () => { assert.equal(validateTargetContentCount(1), 1); assert.equal(validateTargetContentCount(10), 10); for (const value of [0, 11, 16, 30, 1.5, "2", null]) assert.throws(() => validateTargetContentCount(value)); });
// AC Etapa 2 15: hipótese de desejo/curiosidade é oportunidade válida SEM pain
// e SEM objection — nenhum campo racional é pré-condição artificial. Migração
// V2: a semântica vive em validateCommercialOpportunity (campo ativo); a
// descoberta sem dor/objeção é coberta pelos testes Discovery V2 (stage2-v2).
test("accepts a desire-first opportunity without pain and objection (proofOptions/evidenceRefs permanecem como dados obrigatórios)", () => {
  const opportunity = validateCommercialOpportunity({ id: "j-commercial-1", relevantCapabilities: ["compacto"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], sellingArgument: "o próprio conteúdo cria curiosidade e desejo", confidence: 0.8, evidenceRefs: ["product:name"] }, { facts: ["Produto"], refs: ["product:name"] });
  assert.equal(opportunity.pain, undefined);
  assert.equal(opportunity.objection, undefined);
  assert.equal(opportunity.audience, undefined);
  assert.equal(opportunity.situation, undefined);
});
test("requires a complete brief, keeps strategic development as string[] and drops legacy scene data", () => { const base = { contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: ["Destaque Fone Space S1", "Reforce drivers de 40 mm"], script: "s", scenes: ["legado"], cta: "c" }; const brief = validateContentBrief(base); assert.equal(brief.version, 1); assert.deepEqual(brief.development, base.development); assert.equal("scenes" in brief, false); assert.equal(structureHash(brief), structureHash({ structure: undefined, development: base.development, cta: base.cta })); assert.throws(() => validateContentBrief({ ...base, development: undefined })); assert.throws(() => validateContentBrief({ ...base, development: "ponto" })); assert.throws(() => validateContentBrief({ ...base, development: [] })); assert.throws(() => validateContentBrief({ ...base, development: ["a", "b", "c", "d", "e", "f", "g"] })); });
test("normalizes equivalent variety text", () => assert.equal(normalizeForVariety("  Hook  Forte "), "hook forte"));
test("content opportunity sourceOpportunityId must exist in the allowed server-derived set", () => {
  const valid = { id: "p", commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"], sourceOpportunityId: "j-commercial-1" };
  const allowed = new Set(["j-commercial-1", "j-commercial-2"]);
  assert.equal(validateContentOpportunity(valid, allowed).sourceOpportunityId, "j-commercial-1");
  assert.throws(() => validateContentOpportunity({ ...valid, sourceOpportunityId: "j-commercial-99" }, allowed), (error: unknown) => { const e = error as { name?: string; code?: string }; return e.name === "ContractError" && e.code === "GEN-SCHEMA"; });
  assert.equal(validateContentOpportunity({ ...valid, sourceOpportunityId: "qualquer-ref" }).sourceOpportunityId, "qualquer-ref");
});
test("strategy contract is canonical AC16 with no parallel objective/positioning/audience/contentPillars", () => {
  const canonical = { id: "j-strategy", productId: "p", jobId: "j", version: 1, status: "ACTIVE", platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", primaryPositioning: "suporte estável e compacto", audiences: ["home office"], priorityBenefits: ["mãos livres"], priorityObjections: ["instabilidade"], priorityArguments: ["base magnética"], priorityAngles: ["demonstração"], communicationPrinciples: ["sem promessas"], opportunities: [{ id: "j-commercial-1", relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["fact:features"] }] };
  const result = validateProductStrategy(canonical);
  assert.equal(result.primaryPositioning, "suporte estável e compacto");
  assert.deepEqual(result.audiences, ["home office"]);
  assert.deepEqual(Object.keys(result).sort().join(","), "audiences,communicationPrinciples,id,jobId,opportunities,platformId,platformSkillVersion,primaryPositioning,priorityAngles,priorityArguments,priorityBenefits,priorityObjections,productId,status,version");
  // Contrato paralelo antigo rejeitado, sem alias.
  assert.throws(() => validateProductStrategy({ ...canonical, primaryPositioning: undefined, positioning: "legado" }), (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA");
  // Campos legados sem alias: positioning vazio/ausente falha; contentPillars desconhecido é descartado (nunca persistido).
  assert.throws(() => validateProductStrategy({ ...canonical, primaryPositioning: "" }), (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA");
  assert.equal((validateProductStrategy({ ...canonical, contentPillars: ["prova"] }) as Record<string, unknown>).contentPillars, undefined);
});
test("content opportunity preserves canonical optionals when provided", () => {
  const base = { id: "o", commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] };
  const withOpts = { ...base, audience: "estudantes", pain: "mãos ocupadas", desire: "assistir mãos livres", objection: "vai cair?", benefit: "estabilidade magnética", proof: "vídeo de montagem", narrativePattern: "prova-social", desiredViewerResponse: "comentar" };
  const result = validateContentOpportunity(withOpts);
  assert.equal(result.audience, "estudantes");
  assert.equal(result.pain, "mãos ocupadas");
  assert.equal(result.desire, "assistir mãos livres");
  assert.equal(result.objection, "vai cair?");
  assert.equal(result.benefit, "estabilidade magnética");
  assert.equal(result.proof, "vídeo de montagem");
  assert.equal(result.narrativePattern, "prova-social");
  assert.equal(result.desiredViewerResponse, "comentar");
  assert.throws(() => validateContentOpportunity({ ...base, proof: 42 }), (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA");
});
test("cardinality policy is versioned and uses MVP limits", () => {
  assert.equal(CARDINALITY_POLICY_VERSION, 4); // v4: development 2–6; estratégicos do PU aceitam [] sempre
  assert.deepEqual(CARDINALITY_POLICY.development, { min: 2, minWithEvidence: 2, max: 6 });
  assert.equal(CARDINALITY_POLICY.coreUseCases.max, 8);
  assert.equal(CARDINALITY_POLICY.evidenceRefs.max, 25);
  assert.deepEqual(CARDINALITY_POLICY.opportunities, { min: 1, minWithEvidence: 3, max: 10 });
  assert.equal(CARDINALITY_POLICY.relevantCapabilities.max, 6);
  assert.equal(CARDINALITY_POLICY.priorityBenefits.max, 10);
  assert.equal(CARDINALITY_POLICY.noveltyTargets.max, 4);
});
test("strict maximums fail closed without truncation", () => {
  const commercial = { id: "j-commercial-1", relevantCapabilities: Array.from({ length: 11 }, (_, i) => `cap${i}`), benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] };
  assert.throws(() => validateCommercialOpportunity(commercial), (error: unknown) => { const e = error as { code?: string; message?: string }; return e.code === "GEN-SCHEMA" && /cardinalidade de relevantCapabilities/.test(e.message ?? ""); });
  const base = { contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: Array.from({ length: 7 }, (_, i) => `c${i}`), script: "s", cta: "c" };
  assert.throws(() => validateContentBrief(base), (error: unknown) => { const e = error as { code?: string }; return e.code === "GEN-SCHEMA"; });
});
test("understanding minimums are conditional to evidence (no invention without it)", () => {
  const empty = { productId: "p1", coreUseCases: [], capabilities: [], functionalBenefits: [], emotionalBenefits: [], desiredOutcomes: [], purchaseTriggers: [], purchaseBarriers: [], evidenceRefs: [] };
  assert.equal(validateProductUnderstanding(empty).coreUseCases.length, 0);
  assert.throws(() => validateProductUnderstanding(empty, { facts: ["Produto"], refs: ["product:name"] }), (error: unknown) => { const e = error as { code?: string }; return e.code === "GEN-SCHEMA"; });
});
test("v3: strategic arrays aceitam [] com ou sem evidência; evidenceRefs segue obrigatório com evidência", () => {
  const base = { productId: "p1", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: [], emotionalBenefits: [], desiredOutcomes: [], purchaseTriggers: [], purchaseBarriers: [], evidenceRefs: ["product:name"] };
  const apenasIdentidade = validateProductUnderstanding(base, { facts: ["Produto"], refs: ["product:name"] });
  assert.equal(apenasIdentidade.emotionalBenefits.length, 0);
  const comFatos = validateProductUnderstanding({ ...base, evidenceRefs: ["product:name", "fact:features"] }, { facts: ["Tecido leve"], refs: ["product:name", "fact:features"] });
  assert.equal(comFatos.functionalBenefits.length, 0);
  assert.equal(comFatos.purchaseBarriers.length, 0);
  const comEmocional = validateProductUnderstanding({ ...base, emotionalBenefits: ["confiança na escolha"], evidenceRefs: ["product:name", "fact:features"] }, { facts: ["Tecido leve"], refs: ["product:name", "fact:features"] });
  assert.equal(comEmocional.emotionalBenefits.length, 1);
});

test("PU v3: estratégicos vazios sempre passam; núcleo segue non-empty; max continua fail-closed", () => {
  const base = { productId: "p1", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: [], emotionalBenefits: [], desiredOutcomes: [], purchaseTriggers: [], purchaseBarriers: [], evidenceRefs: ["product:name"] };
  // (1) empty strategic com evidência pertinente passa (v3).
  const comFatos = validateProductUnderstanding(base, { facts: ["Tecido leve"], refs: ["product:name", "fact:features"] });
  assert.equal(comFatos.functionalBenefits.length, 0);
  // (3) coreUseCases/capabilities continuam non-empty.
  const semNucleo = { ...base, coreUseCases: [], capabilities: [] };
  assert.throws(() => validateProductUnderstanding(semNucleo, { facts: ["Produto"], refs: ["product:name"] }), (error: unknown) => { const e = error as { code?: string; field?: string }; return e.code === "GEN-SCHEMA" && e.field === "coreUseCases"; });
  // (4) máximo continua fail-closed (sem truncamento).
  const acima = { ...base, functionalBenefits: Array.from({ length: 9 }, (_, i) => `b${i}`), emotionalBenefits: ["confiança"] };
  assert.throws(() => validateProductUnderstanding(acima, { facts: ["Tecido leve"], refs: ["product:name", "fact:features"] }), (error: unknown) => { const e = error as { code?: string; message?: string }; return e.code === "GEN-SCHEMA" && /cardinalidade de functionalBenefits/.test(e.message ?? ""); });
});

test("development permanece entre 2 e 6 bullets e cenas não entram no contrato", () => {
  const base = { contentId: "c1", briefVersionId: "b1", version: 1 as const, angle: "a", hook: "h", development: ["ponto 1", "ponto 2"], script: "s", cta: "c" };
  assert.deepEqual(validateContentBrief(base).development, ["ponto 1", "ponto 2"]);
  assert.equal("scenes" in validateContentBrief(base), false);
  assert.throws(() => validateContentBrief({ ...base, development: undefined }));
  assert.throws(() => validateContentBrief({ ...base, development: ["só um ponto"] }));
  assert.equal(validateContentBrief({ ...base, development: ["1", "2", "3", "4", "5", "6"] }).development.length, 6);
  assert.throws(() => validateContentBrief({ ...base, development: ["1", "2", "3", "4", "5", "6", "7"] }));
  assert.equal(structureHash(validateContentBrief(base)), structureHash({ structure: undefined, development: base.development, cta: base.cta }));
});
