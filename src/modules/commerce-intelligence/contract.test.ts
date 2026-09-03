import test from "node:test";
import assert from "node:assert/strict";
import { validateTargetContentCount, validateContentBrief, validateContentOpportunity, validateProductStrategy, structureHash, normalizeForVariety, validateCommercialOpportunityMappingEnvelope } from "./contract";
test("accepts only integer quantity from 1 through 30", () => { assert.equal(validateTargetContentCount(1), 1); assert.equal(validateTargetContentCount(30), 30); for (const value of [0, 31, 1.5, "2", null]) assert.throws(() => validateTargetContentCount(value)); });
test("requires complete brief and valid scene count", () => { const base = { contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", script: "s", scenes: ["1", "2"], cta: "c" }; assert.equal(validateContentBrief(base).version, 1); assert.throws(() => validateContentBrief({ ...base, scenes: ["1"] })); assert.equal(structureHash(base), structureHash({ structure: undefined, scenes: base.scenes, cta: base.cta })); });
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
  const canonical = { id: "j-strategy", productId: "p", jobId: "j", version: 1, status: "ACTIVE", platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", primaryPositioning: "suporte estável e compacto", audiences: ["home office"], priorityBenefits: ["mãos livres"], priorityObjections: ["instabilidade"], priorityArguments: ["base magnética"], priorityAngles: ["demonstração"], communicationPrinciples: ["sem promessas"], communicationRisks: ["evitar exageros"], opportunities: [{ id: "j-commercial-1", relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["fact:features"] }] };
  const result = validateProductStrategy(canonical);
  assert.equal(result.primaryPositioning, "suporte estável e compacto");
  assert.deepEqual(result.audiences, ["home office"]);
  assert.deepEqual(Object.keys(result).sort().join(","), "audiences,communicationPrinciples,communicationRisks,id,jobId,opportunities,platformId,platformSkillVersion,primaryPositioning,priorityAngles,priorityArguments,priorityBenefits,priorityObjections,productId,status,version");
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
