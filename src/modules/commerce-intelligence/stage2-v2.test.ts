// Stage 2 Discovery/Strategy V2 + Stage 3 ContentOpportunity Blueprint canônico
// + ProductMemory multidimensional — testes comportamentais TDD.
// Cutover E6: V2 é o caminho de produção; baseline é commit 8d1833b (V1 stubs
// cobertos por hooks per-file em engine.test/engine-pipeline/worker-fence/worker).
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichOpportunityV2,
  memorySnapshotV2,
  parseDiscoveryEnvelopeV2,
  plannedHandoffV2,
  projectMemorySignalsForPlanner,
  enrichContentOpportunity,
} from "./engine-v2";
import { mergeMemorySignalsCanonical } from "./planner-harness/plan-portfolio";
import type { PlannedOpportunityV2 } from "./planner-harness/types";
import type { EvidenceSnapshot } from "./contract";

const evidence: EvidenceSnapshot = {
  facts: ["Produto V2", "Tecido respirável", "cós elástico com cordão"],
  refs: ["product:name", "product:description", "fact:features"],
};

// ─── Discovery V2 (LLM evoluído — envelope versionado) ─────────────────────

test("parseDiscoveryEnvelopeV2: envelope válido produz hypotheses com commercialEffects distintos", () => {
  const envelope = {
    discoveryContractVersion: "2",
    hypotheses: [
      { commercialObjective: "gerar desejo", angle: "praticidade", coreMessage: "leve para o dia a dia", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], commercialEffects: ["desejo"], evidenceRefs: ["product:description"], confidence: 0.9 },
      { commercialObjective: "quebrar objeção", angle: "durabilidade", coreMessage: "resistente ao uso", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], commercialEffects: ["confiança"], evidenceRefs: ["product:description"], confidence: 0.9 },
      { commercialObjective: "gerar curiosidade", angle: "versatilidade", coreMessage: "combina com tudo", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], commercialEffects: ["curiosidade"], evidenceRefs: ["product:description"], confidence: 0.9 },
    ],
  };
  const result = parseDiscoveryEnvelopeV2(envelope, evidence);
  assert.equal(result.hypotheses.length, 3);
  assert.ok(result.hypotheses[0]!.commercialEffects.length > 0);
  for (const h of result.hypotheses) {
    assert.ok(h.evidenceRefs.every((ref) => evidence.refs.includes(ref)));
  }
});

test("parseDiscoveryEnvelopeV2: campo desconhecido no envelope é descartado na canonicalização (SPEC §3.3B/AC12)", () => {
  const envelope = {
    discoveryContractVersion: "2",
    hypotheses: [{ commercialObjective: "x", angle: "y", coreMessage: "z", commercialEffects: ["e"], evidenceRefs: ["product:description"], confidence: 0.9, noveltyTargets: ["não é campo de hipótese"] }],
    analysis: "prosa ignorada",
    workflow: "comando ignorado",
  };
  const result = parseDiscoveryEnvelopeV2(envelope, evidence);
  assert.equal(result.hypotheses.length, 1);
  const h = result.hypotheses[0] as Record<string, unknown>;
  assert.equal("noveltyTargets" in h, false, "campo desconhecido da hipótese é descartado");
  assert.equal(h.commercialObjective, "x", "campos canônicos preservados");
});

test("parseDiscoveryEnvelopeV2: chave server-owned explícita rejeitada com GEN-SCHEMA", () => {
  assert.throws(
    () => parseDiscoveryEnvelopeV2({ discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "x", angle: "y", coreMessage: "z", commercialEffects: ["e"], evidenceRefs: ["product:description"], confidence: 0.9, tenantId: "t1" }] }, evidence),
    (e: unknown) => (e as { code?: string; field?: string }).code === "GEN-SCHEMA" && (e as { field?: string }).field === "tenantId",
  );
  assert.throws(
    () => parseDiscoveryEnvelopeV2({ discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "x", angle: "y", coreMessage: "z", commercialEffects: ["e"], evidenceRefs: ["product:description"], confidence: 0.9, id: "h-externo" }], jobId: "j-externo" }, evidence),
    (e: unknown) => (e as { code?: string; field?: string }).code === "GEN-SCHEMA",
  );
  // AC16/ADR-033: sourceOpportunityId é server-owned do Discovery — atribuição
  // pelo provider é rejeitada (o servidor atribui por posição após validar).
  assert.throws(
    () => parseDiscoveryEnvelopeV2({ discoveryContractVersion: "2", hypotheses: [{ commercialObjective: "x", angle: "y", coreMessage: "z", commercialEffects: ["e"], evidenceRefs: ["product:description"], confidence: 0.9, sourceOpportunityId: "h-1" }] }, evidence),
    (e: unknown) => (e as { code?: string; field?: string }).code === "GEN-SCHEMA" && (e as { field?: string }).field === "sourceOpportunityId",
  );
});

test("parseDiscoveryEnvelopeV2: refs fora do catálogo → GEN-SCHEMA fail-closed", () => {
  const envelope = {
    discoveryContractVersion: "2",
    hypotheses: [{ commercialObjective: "x", angle: "y", coreMessage: "z", commercialEffects: ["e"], evidenceRefs: ["ref:inexistente"] }],
  };
  assert.throws(() => parseDiscoveryEnvelopeV2(envelope, evidence), (e: unknown) => (e as { code?: string; field?: string }).code === "GEN-SCHEMA" && (e as { field?: string }).field === "evidenceRefs");
});

// AC Etapa 2 15 (migrada do contrato v1): hipótese desire-first SEM pain e SEM
// objection é hipótese válida — nenhum campo racional é pré-condição; provas e
// refs seguem obrigatórias como dados.
test("parseDiscoveryEnvelopeV2: aceita hipótese desire/curiosity sem pain/objection", () => {
  const envelope = {
    discoveryContractVersion: "2",
    hypotheses: [{
      commercialObjective: "criar curiosidade e desejo",
      angle: "praticidade no dia a dia",
      coreMessage: "o próprio conteúdo cria curiosidade e desejo",
      curiosity: "como cabe em qualquer gaveta",
      relevantCapabilities: ["compacto"],
      benefits: ["praticidade no dia a dia"],
      proofOptions: ["product:description"],
      commercialEffects: ["desejo"],
      evidenceRefs: ["product:name"],
      confidence: 0.8,
    }],
  };
  const result = parseDiscoveryEnvelopeV2(envelope, evidence);
  assert.equal(result.hypotheses.length, 1);
  assert.equal(result.hypotheses[0]!.pain, null, "dor ausente é null (normalizador omite)");
  assert.equal(result.hypotheses[0]!.objection, null, "objeção ausente é null (normalizador omite)");
});

// ADR-033 §3: opcional PRESENTE vazio ou com tipo inválido falha antes do
// retorno — ausência é omitida, nunca "" nem null nem coerção silenciosa.
test("parseDiscoveryEnvelopeV2: opcional presente vazio ou de tipo inválido falha GEN-SCHEMA", () => {
  const base = { commercialObjective: "x", angle: "y", coreMessage: "z", relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], commercialEffects: ["e"], evidenceRefs: ["product:description"], confidence: 0.9 };
  assert.throws(
    () => parseDiscoveryEnvelopeV2({ discoveryContractVersion: "2", hypotheses: [{ ...base, objection: "" }] }, evidence),
    (e: unknown) => (e as { code?: string; field?: string }).code === "GEN-SCHEMA" && (e as { field?: string }).field === "objection",
  );
  assert.throws(
    () => parseDiscoveryEnvelopeV2({ discoveryContractVersion: "2", hypotheses: [{ ...base, objection: 42 }] }, evidence),
    (e: unknown) => (e as { code?: string; field?: string }).code === "GEN-SCHEMA" && (e as { field?: string }).field === "objection",
  );
});

// ─── ProductMemory multidimensional (PLANNER_MEMORY_SIGNALS_V1) ────────────

test("projectMemorySignalsForPlanner: entregues produzem sinais canônicos 9 campos", () => {
  const delivered = [
    { hookMechanism: "demonstration", angle: "praticidade", coreMessage: "leve", ctaFunction: "checkout", blueprint: { recipeId: "pov-identification-payoff", attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], format: "pov", productRole: "solution", narrativeMoves: ["setup", "payoff"] } },
  ];
  const signals = projectMemorySignalsForPlanner(delivered);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]!.signalsSchemaVersion, "PLANNER_MEMORY_SIGNALS_V1");
  assert.deepEqual(signals[0]!.attentionMechanisms, ["curiosity"]);
  assert.ok(signals[0]!.narrativeShape.length > 0);
});

test("projectMemorySignalsForPlanner: vazia quando sem entregues", () => {
  assert.equal(projectMemorySignalsForPlanner([]).length, 0);
});

// ─── Stage 3: ContentOpportunity V2 persistence + ProductMemory merge ──────

test("enrichOpportunityV2: adiciona opportunityContractVersion e creativeDirection", () => {
  const planned = plannedHandoffV2([{
    opportunityContractVersion: "2",
    candidateKey: "ck",
    position: 1,
    sourceOpportunityId: "src-1",
    evidenceRefs: [{ id: "product:description", field: "description", valueHash: "hash" }],
    commercialObjective: "desejo",
    angle: "praticidade",
    coreMessage: "leve para o dia a dia",
    noveltyTargets: [],
    blueprint: {
      blueprintContractVersion: "1",
      creativeSystemVersion: "1.3",
      platformSkillVersion: "tiktok-commerce@1.3",
      blueprint: {
        attentionMechanisms: ["curiosity"],
        psychologicalEffects: ["identification"],
        format: "pov",
        narrativeMoves: ["setup", "payoff"],
        productRole: "solution",
      },
    },
    hookMechanism: "curiosity",
  }])[0]!;
  const base = { id: "opp-1", commercialObjective: "desejo", angle: "praticidade", coreMessage: "leve", hookMechanism: "curiosity", noveltyTargets: ["n"] };
  const enriched = enrichOpportunityV2(base, planned);
  assert.equal(enriched.opportunityContractVersion, "2");
  assert.ok(enriched.creativeDirection);
  assert.equal(enriched.creativeDirection.format, "pov");
  assert.equal(enriched.angle, "praticidade");
});

test("projectMemorySignalsForPlanner: filtra não-entregues e deduplica por merge canônico", () => {
  const delivered = [
    { hookMechanism: "curiosity", angle: "praticidade", coreMessage: "leve", ctaFunction: "checkout", blueprint: { recipeId: "pov-identification-payoff", attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], format: "pov", productRole: "solution", narrativeMoves: ["setup", "payoff"] } },
    { hookMechanism: "curiosity", angle: "praticidade", coreMessage: "leve", ctaFunction: "checkout", blueprint: { recipeId: "pov-identification-payoff", attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], format: "pov", productRole: "solution", narrativeMoves: ["setup", "payoff"] } },
  ];
  const signals = projectMemorySignalsForPlanner(delivered);
  assert.equal(signals.length, 2);
  // Merge canônico deduplica por memorySignalKey.
  const merged = mergeMemorySignalsCanonical([], signals);
  assert.equal(merged.length, 1, "dedup por memorySignalKey: dois sinais idênticos viram um");
  // Filtro de não-entregues: apenas entregues geram sinais.
  assert.equal(projectMemorySignalsForPlanner([]).length, 0);
});

test("memorySnapshotV2: legacy sem envelope → empty; envelope V1 → integral", () => {
  assert.deepEqual(memorySnapshotV2({ deliveredHookMechanisms: ["demo"] }), {});
  const envelope = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals: [{ signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], narrativeShape: ["setup"] }] };
  const result = memorySnapshotV2(envelope);
  assert.equal(result.signalsSchemaVersion, "PLANNER_MEMORY_SIGNALS_V1");
});

// ─── ProductMemory V1: persistência/merge/consumo canônico ─────────────────

test("memory merge canônico: dedup idempotente entre entregas consecutivas", () => {
  const signal = {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const,
    recipeId: "pov-identification-payoff",
    attentionMechanisms: ["curiosity"],
    psychologicalEffects: ["identification"],
    format: "pov",
    productRole: "solution",
    narrativeShape: ["setup", "payoff"],
    commercialEffects: ["desejo"],
  };
  // Mesmo sinal entregue duas vezes (retry/reentrega) → dedup para 1.
  const merged = mergeMemorySignalsCanonical([], [signal, signal]);
  assert.equal(merged.length, 1);
  // Entrega consecutiva com mesmo sinal → ainda 1 (idempotente).
  const merged2 = mergeMemorySignalsCanonical(merged, [signal]);
  assert.equal(merged2.length, 1);
});

test("memory merge canônico: sinais distintos acumulam sem duplicatas", () => {
  const s1 = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const, attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], narrativeShape: ["setup", "payoff"] };
  const s2 = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const, attentionMechanisms: ["contrast"], psychologicalEffects: ["trust"], narrativeShape: ["challenge", "verdict"] };
  const merged = mergeMemorySignalsCanonical([], [s1, s2]);
  assert.equal(merged.length, 2);
  const merged2 = mergeMemorySignalsCanonical(merged, [s1, s2]);
  assert.equal(merged2.length, 2, "re-entrega dos mesmos sinais não duplica");
});

test("memorySnapshotV2: legacy snapshot sem envelope → empty (sem converter/inventar)", () => {
  const legacy = { deliveredHookMechanisms: ["demo"], deliveredAngles: ["praticidade"], generatedCount: 3 };
  const result = memorySnapshotV2(legacy);
  assert.deepEqual(result, {});
  // Planner recebe empty — não herda arrays planos legados.
});
