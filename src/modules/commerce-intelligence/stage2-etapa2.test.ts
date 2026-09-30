// Etapa 2 candidata (branch autorizada) — Discovery V2 canônica + Strategy
// determinística versionada com proveniência (ADR-033 §3; SPEC §3.3B; PLAN
// Task 5B-1). Testes comportamentais TDD: normalização JSON-safe, IDs
// server-owned estáveis, hash canônico, projeções normativas, fail-closed de
// reuso e pipeline com/sem re-chamada de Mapping.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeterministicStrategyV2,
  commercialOpportunitiesFromDiscoveryV2,
  discoveryHashV2,
  normalizeDiscoveryEnvelopeV2,
  validateDiscoveryReuseV2,
  STRATEGY_CONTRACT_VERSION_V2,
  STRATEGY_POLICY_VERSION_V1,
  runFirstGeneration,
  type DiscoveryCanonicalV2,
} from "./engine";
import { parseDiscoveryEnvelopeV2 } from "./engine-v2";
import { loadPlatformSkill } from "./platform-skill";
import { validateProductStrategy, type EvidenceSnapshot } from "./contract";
import { canonicalSerialization, sha256Hex } from "./planner-harness/canonical";

const evidence: EvidenceSnapshot = {
  facts: ["Produto V2", "Tecido respirável", "cós elástico com cordão"],
  refs: ["product:name", "product:description", "fact:features"],
};

// Envelope cru do provider (não confiável): opcionais como null, sem IDs.
const providerHypotheses = [
  {
    commercialObjective: "gerar desejo por identificação",
    angle: "praticidade",
    coreMessage: "leve para o dia a dia",
    desiredViewerResponse: "isso acontece comigo",
    audience: "mulheres 25-40",
    situation: null, desire: null, identification: null, curiosity: null,
    aspiration: null, humorPotential: null, visualPotential: null,
    pain: null, objection: null, desiredOutcome: null,
    relevantCapabilities: ["cap"],
    benefits: ["praticidade no dia a dia"],
    proofOptions: ["product:description"],
    commercialEffects: ["desejo"],
    evidenceRefs: ["product:description"],
    confidence: 0.9,
  },
  {
    commercialObjective: "quebrar objeção com prova",
    angle: "durabilidade",
    coreMessage: "resistente ao uso real",
    desiredViewerResponse: null,
    audience: null,
    situation: null, desire: null, identification: null, curiosity: null,
    aspiration: null, humorPotential: null, visualPotential: null,
    pain: null,
    objection: "preço",
    desiredOutcome: null,
    relevantCapabilities: ["cap"],
    benefits: ["acabamento reforçado", "praticidade no dia a dia"],
    proofOptions: ["product:description"],
    commercialEffects: ["confiança", "desejo"],
    evidenceRefs: ["product:description", "fact:features"],
    confidence: 0.8,
  },
  {
    commercialObjective: "criar curiosidade visual",
    angle: "versatilidade",
    coreMessage: "combina com tudo",
    desiredViewerResponse: null,
    audience: null,
    situation: null, desire: null, identification: null, curiosity: null,
    aspiration: null, humorPotential: null, visualPotential: null,
    pain: null, objection: null, desiredOutcome: null,
    relevantCapabilities: ["cap"],
    benefits: ["combina com o guarda-roupa"],
    proofOptions: ["product:description"],
    commercialEffects: ["curiosidade"],
    evidenceRefs: ["fact:features"],
    confidence: 0.7,
  },
];

function parsedEnvelope() {
  return parseDiscoveryEnvelopeV2({ discoveryContractVersion: "2", hypotheses: providerHypotheses }, evidence);
}

// ─── Normalização canônica (JSON-safe + IDs server-owned) ───────────────────

test("normalizeDiscoveryEnvelopeV2: JSON-safe omite ausentes, preserva presentes e atribui IDs estáveis", () => {
  const a = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  const b = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  assert.deepEqual(a, b, "normalização é determinística");

  assert.equal(a.envelope.discoveryContractVersion, "2");
  const hypotheses = a.envelope.hypotheses as Array<Record<string, unknown>>;
  assert.equal(hypotheses.length, 3, "todas as hipóteses preservadas, inclusive não selecionadas");
  hypotheses.forEach((h, index) => {
    assert.equal(h.sourceOpportunityId, `job-1-commercial-${index + 1}`, "ID server-owned estável por posição");
  });
  // Omitido ≠ null: nenhuma chave com valor null sobrevive à normalização.
  const serialized = JSON.stringify(a.envelope);
  assert.equal(serialized.includes(":null"), false, "JSON-safe: ausente é omitido, nunca null");
  const h1 = hypotheses[0]!;
  assert.equal(h1.audience, "mulheres 25-40", "dimensão presente é preservada");
  assert.equal("objection" in h1, false, "dimensão ausente é omitida");
  const h2 = hypotheses[1]!;
  assert.equal(h2.objection, "preço", "dor/objeção opcionais quando presentes são preservadas");
  assert.equal(h2.confidence, 0.8, "confidence preservado");
  assert.deepEqual(h2.evidenceRefs, ["product:description", "fact:features"], "refs preservadas");
});

test("Discovery: provider não atribui sourceOpportunityId (server-owned)", () => {
  const injected = {
    discoveryContractVersion: "2",
    hypotheses: [{ ...providerHypotheses[0]!, sourceOpportunityId: "h-externo" }],
  };
  assert.throws(
    () => parseDiscoveryEnvelopeV2(injected, evidence),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
    "campo server-owned no envelope do provider é rejeitado",
  );
});

test("discoveryHashV2: sha256 canônico sobre o envelope sem o próprio hash", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  assert.equal(discoveryHashV2(canonical.envelope), sha256Hex(canonicalSerialization(canonical.envelope)));
  const other = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-2");
  assert.notEqual(discoveryHashV2(canonical.envelope), discoveryHashV2(other.envelope), "envelopes distintos → hashes distintos");
});

// ─── Strategy V2 determinística versionada (projeções normativas) ──────────

function strategyInput(jobId = "job-1") {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), jobId);
  return {
    envelope: canonical.envelope,
    jobId,
    productId: "p",
    platformId: "tiktok-commerce",
    platformSkillVersion: "tiktok-commerce@1.3",
    // Fonte versionada da Skill (sem hardcode na engine).
    principles: ["princípio-a", "princípio-b"],
    evidence,
  };
}

test("buildDeterministicStrategyV2: projeções normativas do ADR-033 sem troca de papéis", () => {
  const built = buildDeterministicStrategyV2(strategyInput());
  const s = built.strategy;
  // primaryPositioning = coreMessage da PRIMEIRA hipótese selecionada.
  assert.equal(s.primaryPositioning, "leve para o dia a dia");
  // audiences SOMENTE de audience presente — effects/benefits nunca vazam.
  assert.deepEqual(s.audiences, ["mulheres 25-40"]);
  // priorityObjections SOMENTE de objection presente — purchaseBarriers nunca vaza.
  assert.deepEqual(s.priorityObjections, ["preço"]);
  assert.equal(s.priorityObjections.includes("preço alto"), false);
  // priorityBenefits somente de benefits; dedup estável na ordem selecionada.
  assert.deepEqual(s.priorityBenefits, ["praticidade no dia a dia", "acabamento reforçado", "combina com o guarda-roupa"]);
  // priorityArguments = coreMessage; priorityAngles = angle.
  assert.deepEqual(s.priorityArguments, ["leve para o dia a dia", "resistente ao uso real", "combina com tudo"]);
  assert.deepEqual(s.priorityAngles, ["praticidade", "durabilidade", "versatilidade"]);
  // communicationPrinciples deriva dos principles versionados da Skill.
  assert.deepEqual(s.communicationPrinciples, ["princípio-a", "princípio-b"]);
});

test("buildDeterministicStrategyV2: versionada, ordenada e sem cópia do pool", () => {
  const built = buildDeterministicStrategyV2(strategyInput());
  assert.equal(built.strategyContractVersion, STRATEGY_CONTRACT_VERSION_V2);
  assert.equal(built.strategyPolicyVersion, STRATEGY_POLICY_VERSION_V1);
  assert.deepEqual(
    built.sourceOpportunityIds,
    ["job-1-commercial-1", "job-1-commercial-2", "job-1-commercial-3"],
    "sourceOpportunityIds na ordem da seleção",
  );
  const payload = JSON.parse(JSON.stringify({ ...built.strategy, strategyContractVersion: built.strategyContractVersion, strategyPolicyVersion: built.strategyPolicyVersion, sourceOpportunityIds: built.sourceOpportunityIds })) as Record<string, unknown>;
  assert.equal("hypotheses" in payload, false, "pool não é copiado para a Strategy");
  assert.doesNotThrow(() => validateProductStrategy(built.strategy, evidence), "canônica valida contra o contrato vigente");
});

test("buildDeterministicStrategyV2: oportunidades são cópias exatas da hipótese, sem invenção", () => {
  const built = buildDeterministicStrategyV2(strategyInput());
  const [first] = built.strategy.opportunities;
  assert.equal(first!.id, "job-1-commercial-1");
  assert.deepEqual(first!.benefits, ["praticidade no dia a dia"]);
  assert.deepEqual(first!.proofOptions, ["product:description"]);
  assert.equal(first!.confidence, 0.9, "confidence da hipótese, não constante inventada");
  assert.deepEqual(first!.relevantCapabilities, ["cap"]);
  assert.equal(first!.sellingArgument, "leve para o dia a dia", "coreMessage é a ponte canônica para sellingArgument");
});

test("buildDeterministicStrategyV2: campo obrigatório vazio falha fechado", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  const hypotheses = canonical.envelope.hypotheses as Array<Record<string, unknown>>;
  hypotheses[0]!.benefits = [];
  assert.throws(
    () => buildDeterministicStrategyV2({ ...strategyInput(), envelope: canonical.envelope }),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
  );
});

test("commercialOpportunitiesFromDiscoveryV2: valida refs/obrigatórios contra evidência autorizada", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  const opps = commercialOpportunitiesFromDiscoveryV2(canonical.envelope, evidence);
  assert.equal(opps.length, 3);
  assert.ok(opps.every((o) => o.evidenceRefs.every((ref) => evidence.refs.includes(ref))));
  assert.throws(
    () => commercialOpportunitiesFromDiscoveryV2(
      { ...canonical.envelope, hypotheses: [{ ...(canonical.envelope.hypotheses as Array<Record<string, unknown>>)[0]!, evidenceRefs: ["ref:fora"] }] },
      evidence,
    ),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
    "ref fora do catálogo autorizado falha fechado",
  );
});

// ─── Reuso da Discovery persistida (retry dos faltantes) ────────────────────

test("validateDiscoveryReuseV2: válida com hash/ids/refs consistentes", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-original");
  const reuse = validateDiscoveryReuseV2(
    {
      envelope: canonical.envelope,
      discoveryHash: discoveryHashV2(canonical.envelope),
      sourceOpportunityIds: ["job-original-commercial-1", "job-original-commercial-3"],
    },
    evidence,
  );
  assert.equal(reuse.discoveryHash, discoveryHashV2(canonical.envelope));
  assert.deepEqual(reuse.sourceOpportunityIds, ["job-original-commercial-1", "job-original-commercial-3"]);
  assert.equal(reuse.opportunities.length, 2, "pool de reuso = hipóteses selecionadas");
});

test("validateDiscoveryReuseV2: hash divergente falha fechado", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-original");
  assert.throws(
    () => validateDiscoveryReuseV2(
      { envelope: canonical.envelope, discoveryHash: "0".repeat(64), sourceOpportunityIds: ["job-original-commercial-1"] },
      evidence,
    ),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
  );
});

test("validateDiscoveryReuseV2: id selecionado fora do envelope falha fechado", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-original");
  assert.throws(
    () => validateDiscoveryReuseV2(
      { envelope: canonical.envelope, discoveryHash: discoveryHashV2(canonical.envelope), sourceOpportunityIds: ["job-original-commercial-9"] },
      evidence,
    ),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
  );
});

test("validateDiscoveryReuseV2: versão/shape inválidos falham fechado", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-original");
  assert.throws(
    () => validateDiscoveryReuseV2(
      { envelope: { ...canonical.envelope, discoveryContractVersion: "1" }, discoveryHash: discoveryHashV2(canonical.envelope), sourceOpportunityIds: ["job-original-commercial-1"] },
      evidence,
    ),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
  );
  assert.throws(
    () => validateDiscoveryReuseV2(
      { envelope: { ...canonical.envelope, hypotheses: [{ ...(canonical.envelope.hypotheses as Array<Record<string, unknown>>)[0]!, sourceOpportunityId: "job-original-commercial-1" }, { ...(canonical.envelope.hypotheses as Array<Record<string, unknown>>)[1]!, sourceOpportunityId: "job-original-commercial-1" }] }, discoveryHash: discoveryHashV2(canonical.envelope), sourceOpportunityIds: ["job-original-commercial-1"] },
      evidence,
    ),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
    "sourceOpportunityId repetido falha fechado",
  );
});

// ─── Pipeline: fresh persiste canônico; reuso não re-chama Mapping ─────────

const describeStub = () => ({ provider: "test", model: "test-model", instructionVersion: "v2" });

function v2RouterState(hypotheses: unknown[]) {
  const calls: string[] = [];
  const router = {
    describe: describeStub,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      calls.push(task);
      if (task === "PRODUCT_UNDERSTANDING")
        return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING")
        return { discoveryContractVersion: "2", hypotheses };
      if (task === "CONTENT_BRIEF_GENERATION") {
        const context = (input?.trustedContext ?? {}) as { realizations?: unknown[] };
        return {
          developmentSchemaVersion: 2,
          items: Array.from({ length: context.realizations?.length ?? 1 }, () => ({
            angle: "praticidade",
            hook: "Veja o tecido respirável",
            development: [
              { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
              { text: "Destaque o tecido respiravel para conectar o tecido respiravel ao uso cotidiano", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
            ],
            script: "Mostre o Produto",
            cta: "Confira o produto na página.",
          })),
        };
      }
      if (task === "CONTENT_QUALITY_JUDGE") {
        const items = ((input?.trustedContext ?? {}) as { items?: Array<{ contentId: string }> }).items ?? [];
        return { audits: items.map(({ contentId }) => ({ contentId, parts: [
          { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
          { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
          { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
          { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
          { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
        ] })) };
      }
      return {};
    },
  };
  return { calls, router };
}

test("pipeline candidata: Discovery canônica + hash + Strategy versionada no resultado", async () => {
  const { calls, router } = v2RouterState(providerHypotheses);
  const result = await runFirstGeneration({
    productId: "p",
    jobId: "job-pipe",
    name: "Produto",
    description: "Tecido respirável",
    facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 1,
    router,
  });
  assert.equal(calls.filter((task) => task === "COMMERCIAL_OPPORTUNITY_MAPPING").length, 1, "Mapping exatamente uma vez");
  const discovery = result.discoveryCanonicalV2 as DiscoveryCanonicalV2 | undefined;
  assert.ok(discovery, "discoveryCanonicalV2 presente no resultado");
  assert.equal(discovery!.origin, "fresh");
  if (discovery!.origin !== "fresh") return;
  const envelope = discovery!.envelope as { hypotheses: Array<Record<string, unknown>> };
  assert.equal(discoveryHashV2(envelope), discovery!.discoveryHash, "hash bate com o envelope canônico");
  assert.deepEqual(discovery!.sourceOpportunityIds, ["job-pipe-commercial-1", "job-pipe-commercial-2", "job-pipe-commercial-3"]);
  assert.equal(JSON.stringify(envelope).includes("null"), false, "envelope JSON-safe");
  const strategy = result.strategy as Record<string, unknown>;
  assert.equal(strategy.strategyContractVersion, STRATEGY_CONTRACT_VERSION_V2);
  assert.equal(strategy.strategyPolicyVersion, STRATEGY_POLICY_VERSION_V1);
  assert.deepEqual(strategy.audiences, ["mulheres 25-40"], "projeção normativa no runtime");
  assert.deepEqual(strategy.sourceOpportunityIds, discovery!.sourceOpportunityIds);
});

test("pipeline candidata: communicationPrinciples deriva da Skill carregada", async () => {
  const { calls, router } = v2RouterState(providerHypotheses);
  const result = await runFirstGeneration({
    productId: "p",
    jobId: "job-principles",
    name: "Produto",
    description: "Tecido respirável",
    facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 1,
    router,
    // Test seam vigente: Skill controlada (sem editar a Skill canônica).
    skill: { ...loadPlatformSkill(), principles: ["princípio-x", "princípio-y"] },
  });
  assert.equal(calls.filter((task) => task === "COMMERCIAL_OPPORTUNITY_MAPPING").length, 1);
  const strategy = result.strategy as Record<string, unknown>;
  assert.deepEqual(
    strategy.communicationPrinciples,
    ["princípio-x", "princípio-y"],
    "princípios vêm da Skill versionada, não de lista hardcoded",
  );
});

test("pipeline candidata: reuso da Discovery persistida não re-chama Mapping", async () => {
  const fresh = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-original");
  const built = buildDeterministicStrategyV2({
    envelope: fresh.envelope,
    jobId: "job-original",
    productId: "p",
    platformId: "tiktok-commerce",
    platformSkillVersion: "tiktok-commerce@1.3",
    principles: ["princípio-a", "princípio-b"],
    evidence,
  });
  const reuseStrategy = {
    ...built.strategy,
    strategyContractVersion: built.strategyContractVersion,
    strategyPolicyVersion: built.strategyPolicyVersion,
    sourceOpportunityIds: [...built.sourceOpportunityIds],
    sourceDiscoveryRef: { intelligenceRunId: "run-1", discoveryContractVersion: "2", discoveryHash: fresh.discoveryHash ?? discoveryHashV2(fresh.envelope) },
  };
  const { calls, router } = v2RouterState(providerHypotheses);
  const result = await runFirstGeneration({
    productId: "p",
    jobId: "job-faltantes",
    name: "Produto",
    description: "Tecido respirável",
    facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 1,
    router,
    reuseStrategy: reuseStrategy as unknown as Record<string, unknown>,
    reusedDiscovery: {
      envelope: fresh.envelope,
      discoveryHash: discoveryHashV2(fresh.envelope),
      sourceDiscoveryRef: { intelligenceRunId: "run-1", discoveryContractVersion: "2", discoveryHash: discoveryHashV2(fresh.envelope) },
    },
  });
  assert.equal(calls.includes("COMMERCIAL_OPPORTUNITY_MAPPING"), false, "Discovery persistida é reutilizada — Mapping não é re-chamado");
  assert.equal(calls.includes("PRODUCT_UNDERSTANDING"), true, "PU permanece no candidato (retirada é Etapa 6)");
  const discovery = result.discoveryCanonicalV2 as DiscoveryCanonicalV2;
  assert.equal(discovery.origin, "reused");
  if (discovery.origin !== "reused") return;
  assert.equal(discovery.sourceDiscoveryRef.intelligenceRunId, "run-1");
  const strategy = result.strategy as Record<string, unknown>;
  assert.deepEqual(strategy.sourceOpportunityIds, built.sourceOpportunityIds, "seleção original preservada");
});
