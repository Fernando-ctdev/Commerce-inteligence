import test from "node:test";
import assert from "node:assert/strict";
import { validateTargetContentCount, validateContentBrief, validateContentOpportunity, validateProductStrategy, validateProductUnderstanding, validateCommercialOpportunityDraft, structureHash, normalizeForVariety, validateCommercialOpportunityMappingEnvelope, CARDINALITY_POLICY, CARDINALITY_POLICY_VERSION } from "./contract";
test("accepts only integer quantity from 1 through 10", () => { assert.equal(validateTargetContentCount(1), 1); assert.equal(validateTargetContentCount(10), 10); for (const value of [0, 11, 1.5, "2", null]) assert.throws(() => validateTargetContentCount(value)); });
test("requires a complete brief, keeps development as string[] and drops legacy scene data", () => { const base = { contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: ["ponto"], script: "s", scenes: ["legado"], cta: "c" }; const brief = validateContentBrief(base); assert.equal(brief.version, 1); assert.deepEqual(brief.development, ["ponto"]); assert.equal("scenes" in brief, false); assert.equal(structureHash(brief), structureHash({ structure: undefined, development: base.development, cta: base.cta })); assert.throws(() => validateContentBrief({ ...base, development: undefined })); assert.throws(() => validateContentBrief({ ...base, development: "ponto" })); });
test("normalizes equivalent variety text", () => assert.equal(normalizeForVariety("  Hook  Forte "), "hook forte"));
test("mapping envelope missing opportunities yields typed GEN-SCHEMA, not generic failure", () => { const envelope = { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], analysis: "longo texto sem oportunidades" }; assert.throws(() => validateCommercialOpportunityMappingEnvelope(envelope), (error: unknown) => { const e = error as { name?: string; code?: string; message?: string }; return e.name === "ContractError" && e.code === "GEN-SCHEMA" && /sem oportunidades/.test(e.message ?? ""); }); });
test("mapping envelope with one opportunity passes and preserves canonical shape", () => { const commercial = { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }; const envelope = { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [commercial] }; const result = validateCommercialOpportunityMappingEnvelope(envelope, { facts: ["Produto"], refs: ["product:name"] }); assert.equal(result.opportunities.length, 1); assert.equal(result.opportunities[0].sellingArgument, "s"); });
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
  assert.equal(CARDINALITY_POLICY_VERSION, 1);
  assert.equal(CARDINALITY_POLICY.coreUseCases.max, 8);
  assert.equal(CARDINALITY_POLICY.evidenceRefs.max, 25);
  assert.deepEqual(CARDINALITY_POLICY.opportunities, { min: 1, minWithEvidence: 3, max: 10 });
  assert.equal(CARDINALITY_POLICY.relevantCapabilities.max, 6);
  assert.equal(CARDINALITY_POLICY.priorityBenefits.max, 10);
  assert.equal(CARDINALITY_POLICY.noveltyTargets.max, 4);
});
test("strict maximums fail closed without truncation", () => {
  const commercial = { relevantCapabilities: Array.from({ length: 11 }, (_, i) => `cap${i}`), benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] };
  assert.throws(() => validateCommercialOpportunityDraft(commercial), (error: unknown) => { const e = error as { code?: string; message?: string }; return e.code === "GEN-SCHEMA" && /cardinalidade de relevantCapabilities/.test(e.message ?? ""); });
  const base = { contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: Array.from({ length: 5 }, (_, i) => `c${i}`), script: "s", cta: "c" };
  assert.throws(() => validateContentBrief(base), (error: unknown) => { const e = error as { code?: string }; return e.code === "GEN-SCHEMA"; });
});
test("understanding minimums are conditional to evidence (no invention without it)", () => {
  const empty = { productId: "p1", coreUseCases: [], capabilities: [], functionalBenefits: [], emotionalBenefits: [], desiredOutcomes: [], purchaseTriggers: [], purchaseBarriers: [], evidenceRefs: [] };
  assert.equal(validateProductUnderstanding(empty).coreUseCases.length, 0);
  assert.throws(() => validateProductUnderstanding(empty, { facts: ["Produto"], refs: ["product:name"] }), (error: unknown) => { const e = error as { code?: string }; return e.code === "GEN-SCHEMA"; });
});
test("mapping envelope opportunity count is capped by policy", () => {
  const commercial = { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] };
  const envelope = { audiences: [], situations: [], pains: [], desires: [], objections: [], opportunities: Array.from({ length: CARDINALITY_POLICY.opportunities.max + 1 }, () => commercial) };
  assert.throws(() => validateCommercialOpportunityMappingEnvelope(envelope), (error: unknown) => { const e = error as { code?: string; message?: string }; return e.code === "GEN-SCHEMA" && /cardinalidade de oportunidades/.test(e.message ?? ""); });
});
test("minimum of 3 opportunities requires DISTINCT evidence refs (repeated mentions add nothing)", () => {
  const commercial = { relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["r1"] };
  const single = { audiences: [], situations: [], pains: [], desires: [], objections: [], opportunities: [commercial] };
  // refs do understanding repetem refs do catálogo base: 2 evidências distintas → mínimo 1.
  assert.doesNotThrow(() => validateCommercialOpportunityMappingEnvelope(single, { facts: ["f"], refs: ["r1", "r2", "r1"] }));
  // 3 evidências distintas sustentam o mínimo de 3: uma só oportunidade falha.
  assert.throws(() => validateCommercialOpportunityMappingEnvelope(single, { facts: ["f"], refs: ["r1", "r2", "r3"] }), (error: unknown) => { const e = error as { code?: string; message?: string }; return e.code === "GEN-SCHEMA" && /min 3/.test(e.message ?? ""); });
});
test("development permanece entre 1 e 4 bullets e cenas não entram no contrato", () => {
  const base = { contentId: "c1", briefVersionId: "b1", version: 1 as const, angle: "a", hook: "h", development: ["ponto 1", "ponto 2"], script: "s", cta: "c" };
  assert.deepEqual(validateContentBrief(base).development, ["ponto 1", "ponto 2"]);
  assert.equal("scenes" in validateContentBrief(base), false);
  assert.equal("scenes" in validateContentBrief({ ...base, scenes: ["legado"] }), false);
  assert.throws(() => validateContentBrief({ ...base, development: undefined }));
  assert.throws(() => validateContentBrief({ ...base, development: ["1", "2", "3", "4", "5"] }));
  assert.equal(structureHash(validateContentBrief(base)), structureHash({ structure: undefined, development: base.development, cta: base.cta }));
});
