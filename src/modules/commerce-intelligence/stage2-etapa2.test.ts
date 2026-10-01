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
  discoveryPoolFromSelectedV2,
  plannerSignalsForDeliveredContents,
  plannedBlueprintForV2,
  validateDiscoveryReuseV2,
  STRATEGY_CONTRACT_VERSION_V2,
  STRATEGY_POLICY_VERSION_V1,
  runFirstGeneration,
  type DiscoveryCanonicalV2,
} from "./engine";
import { parseDiscoveryEnvelopeV2 } from "./engine-v2";
import { buildPlannerMemorySnapshot, memorySnapshotV2 } from "./engine-v2";
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

test("validateDiscoveryReuseV2: segue ordem selecionada e rejeita seleção vazia", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-original");
  const input = { envelope: canonical.envelope, discoveryHash: canonical.discoveryHash };
  const selected = validateDiscoveryReuseV2({
    ...input,
    sourceOpportunityIds: ["job-original-commercial-3", "job-original-commercial-1"],
  }, evidence);
  assert.deepEqual(selected.opportunities.map((opportunity) => opportunity.id), [
    "job-original-commercial-3", "job-original-commercial-1",
  ]);
  assert.throws(() => validateDiscoveryReuseV2({ ...input, sourceOpportunityIds: [] }, evidence),
    (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === "GEN-SCHEMA");
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
  let briefIndex = 0;
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
          items: Array.from({ length: context.realizations?.length ?? 1 }, () => {
            const index = briefIndex++;
            const cta = ["Confira o produto na página.", "Veja o produto na página.", "Teste o produto na página.", "Descubra o produto na página.", "Explore o produto na página.", "Acesse o produto na página.", "Encontre o produto na página.", "Experimente o produto na página."][index % 8]!;
            return {
            angle: "praticidade",
            hook: ["Veja", "Conheça", "Observe", "Descubra", "Experimente", "Mostre", "Repare", "Explore"][index % 8] + " o tecido respirável",
            development: [
              { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta },
              { text: "Destaque o tecido respiravel para conectar o tecido respiravel ao uso cotidiano", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta },
            ],
            script: "Mostre o Produto",
            cta,
          };
          }),
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
  assert.equal(calls.includes("PRODUCT_UNDERSTANDING"), false, "Discovery usa fatos sem chamada adicional de compreensão");
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

test("Risk pré-Judge registra decisão limpa e não chama Judge para item não selecionado", async () => {
  const { calls, router } = v2RouterState(providerHypotheses);
  const complete = router.complete;
  const cleanRouter = { ...router, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    const response = await complete(task, input);
    if (task !== "CONTENT_BRIEF_GENERATION") return response;
    const brief = response as { items: Array<{ script: string }> };
    return { ...brief, items: brief.items.map((item) => ({ ...item,
      development: Array.from({ length: 2 }, () => ({
        text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso",
        action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página.",
      })),
      script: "Tecido respiravel",
    })) };
  } };
  const result = await runFirstGeneration({
    productId: "p", jobId: "job-risk-clean", name: "Produto",
    description: "Tecido respirável", facts: { features: ["cós elástico com cordão"] }, targetContentCount: 1, router: cleanRouter,
  });
  assert.equal(calls.includes("CONTENT_QUALITY_JUDGE"), false);
  assert.equal(result.judgeExecutionRecords[0]?.execution, "NOT_EXECUTED");
  assert.equal(result.judgeSelectionDecisions[0]?.selected, false);
  assert.equal(result.preJudgeRiskAssessments[0]?.assessmentStatus, "AVAILABLE");
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
    principles: loadPlatformSkill().principles,
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
  assert.equal(calls.includes("PRODUCT_UNDERSTANDING"), false, "reuso não repete compreensão semântica");
  const discovery = result.discoveryCanonicalV2 as DiscoveryCanonicalV2;
  assert.equal(discovery.origin, "reused");
  if (discovery.origin !== "reused") return;
  assert.equal(discovery.sourceDiscoveryRef.intelligenceRunId, "run-1");
  const strategy = result.strategy as Record<string, unknown>;
  assert.deepEqual(strategy.sourceOpportunityIds, built.sourceOpportunityIds, "seleção original preservada");
});

test("reuso rejeita Strategy adulterada antes de planejar ou chamar provider", async () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-original");
  const built = buildDeterministicStrategyV2({
    envelope: canonical.envelope, jobId: "job-original", productId: "p",
    platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.3",
    principles: loadPlatformSkill().principles, evidence,
  });
  const sourceDiscoveryRef = {
    intelligenceRunId: "run-original", discoveryContractVersion: "2" as const,
    discoveryHash: canonical.discoveryHash,
  };
  const base = {
    productId: "p", jobId: "job-reuse-invalid", name: "Produto",
    description: "Tecido respirável", facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 1,
    reusedDiscovery: { envelope: canonical.envelope, discoveryHash: canonical.discoveryHash, sourceDiscoveryRef },
  };
  for (const alteration of [
    { primaryPositioning: "mensagem adulterada" },
    { sourceOpportunityIds: [built.sourceOpportunityIds[1], built.sourceOpportunityIds[0]] },
    { sourceOpportunityIds: [] },
    { opportunities: [{ ...built.strategy.opportunities[0], evidenceRefs: ["product:name"] }, ...built.strategy.opportunities.slice(1)] },
  ]) {
    const { calls, router } = v2RouterState(providerHypotheses);
    await assert.rejects(() => runFirstGeneration({
      ...base, router,
      reuseStrategy: {
        ...built.strategy,
        strategyContractVersion: built.strategyContractVersion,
        strategyPolicyVersion: built.strategyPolicyVersion,
        sourceOpportunityIds: built.sourceOpportunityIds,
        sourceDiscoveryRef, ...alteration,
      },
    }), (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === "GEN-SCHEMA");
    assert.deepEqual(calls, [], "reuso inválido falha antes de trabalho externo");
  }
});

// ─── Etapa 3: pool exato, memória canônica, provenance de Planner ───────────

test("discoveryPoolFromSelectedV2: pool exato dos selecionados na ordem persistida, cópia de campos", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  const pool = discoveryPoolFromSelectedV2(canonical.envelope, ["job-1-commercial-3", "job-1-commercial-1"], evidence);
  assert.equal(pool.opportunities.length, 2, "somente os selecionados vão ao pool");
  assert.equal(pool.opportunities[0]!.sourceOpportunityId, "job-1-commercial-3", "ordem = ordem persistida da seleção");
  assert.equal(pool.opportunities[0]!.commercialObjective, "criar curiosidade visual", "cópia exata");
  assert.equal(pool.opportunities[0]!.angle, "versatilidade", "cópia exata");
  assert.equal(pool.opportunities[0]!.coreMessage, "combina com tudo", "cópia exata");
  assert.deepEqual(pool.opportunities[0]!.commercialEffects, ["curiosidade"], "cópia exata");
  assert.equal(pool.opportunities[0]!.proofPattern, "product:description", "proofPattern = primeiro proofOptions");
  assert.equal("audienceContext" in pool.opportunities[0]!, false, "sem audience/situation não há audienceContext");
  assert.equal(pool.opportunities[1]!.sourceOpportunityId, "job-1-commercial-1");
  assert.equal(pool.opportunities[1]!.audienceContext, "mulheres 25-40", "audience presente projeta audienceContext");
  // refs convertidas a EvidenceRef do catálogo autorizado (sem hash sintético)
  const refs = pool.opportunities[1]!.evidenceRefs;
  assert.deepEqual(refs.map((ref) => ref.id), ["product:description"]);
  assert.equal(refs[0]!.valueHash, sha256Hex("Tecido respirável"));
  assert.deepEqual(pool.evidenceCatalog.refs.map((ref) => ref.id).sort(), [...evidence.refs].sort());
});

test("discoveryPoolFromSelectedV2: ID fora do envelope e ref fora do catálogo falham fechado", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  assert.throws(
    () => discoveryPoolFromSelectedV2(canonical.envelope, ["job-1-commercial-9"], evidence),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
    "selectedId fora da Discovery falha fechado",
  );
  assert.throws(
    () => discoveryPoolFromSelectedV2(
      { ...canonical.envelope, hypotheses: [{ ...(canonical.envelope.hypotheses as Array<Record<string, unknown>>)[0]!, evidenceRefs: ["ref:fora"] }] },
      ["job-1-commercial-1"],
      evidence,
    ),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
    "ref fora do catálogo falha fechado, sem hash sintético",
  );
});

test("memorySnapshotV2: legado real vira vazio; versionado desconhecido/malformado passa cru para o harness", () => {
  assert.deepEqual(memorySnapshotV2({ deliveredHookMechanisms: ["demo"] }), {}, "legado real (sem signalsSchemaVersion) vira vazio");
  const unknown = { signalsSchemaVersion: "2", signals: [] };
  assert.deepEqual(memorySnapshotV2(unknown), unknown, "versão desconhecida passa cru — harness falha GEN-PLANNER-MEMORY");
  const malformed = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals: "não-array" };
  assert.deepEqual(memorySnapshotV2(malformed), malformed, "V1 malformado passa cru — harness falha GEN-PLANNER-MEMORY");
  const v1 = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals: [{ signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], narrativeShape: ["setup"] }] };
  assert.deepEqual(memorySnapshotV2(v1), v1, "V1 válido passa integral");
});

test("buildPlannerMemorySnapshot: merge canônico deduplica e é idempotente", () => {
  const signalA = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const, attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], narrativeShape: ["setup"], format: "pov", productRole: "solution" };
  const signalB = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const, attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], narrativeShape: ["payoff"], format: "pov", productRole: "solution" };
  const previous = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals: [signalA] };
  const first = buildPlannerMemorySnapshot(previous, [signalA, signalB]);
  assert.equal(first.signals.length, 2, "signal idêntico não duplica");
  const second = buildPlannerMemorySnapshot(first, [signalB]);
  assert.deepEqual(second.signals, first.signals, "merge é idempotente");
});

test("plannerSignalsForDeliveredContents: sinais 1:1 com a hipótese Discovery; lacuna falha fechado", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  const hypothesesById = new Map(
    (canonical.envelope.hypotheses as Array<Record<string, unknown>>).map((h) => [h.sourceOpportunityId as string, h]),
  );
  const delivered = [{
    sourceOpportunityId: "job-1-commercial-1",
    blueprint: { attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], format: "pov", productRole: "solution", narrativeMoves: ["setup", "payoff"] },
  }];
  const signals = plannerSignalsForDeliveredContents(delivered, hypothesesById);
  assert.equal(signals.length, 1);
  assert.deepEqual(signals[0]!.commercialEffects, ["desejo"], "commercialEffects da hipótese, nunca de coreMessage");
  assert.equal(signals[0]!.audienceContext, "mulheres 25-40", "audienceContext da hipótese");
  assert.equal(signals[0]!.proofPattern, "product:description", "proofPattern da hipótese");
  const gap = [{ ...delivered[0]!, sourceOpportunityId: "job-1-commercial-99" }];
  assert.throws(
    () => plannerSignalsForDeliveredContents(gap, hypothesesById),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
    "entregue sem hipótese correspondente falha fechado (sem flatMap silencioso)",
  );
});

test("pipeline candidata: v2Policy expõe plannerSeed e plannerOutputHash hex-64", async () => {
  const { calls, router } = v2RouterState(providerHypotheses);
  const result = await runFirstGeneration({
    productId: "p",
    jobId: "job-seed",
    name: "Produto",
    description: "Tecido respirável",
    facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 1,
    router,
  });
  assert.ok(calls.includes("CONTENT_BRIEF_GENERATION"));
  const policy = result.v2Policy as Record<string, unknown>;
  assert.match(String(policy.plannerSeed), /^[0-9a-f]{64}$/, "plannerSeed é sha256 hex-64");
  assert.match(String(policy.plannerOutputHash), /^[0-9a-f]{64}$/, "plannerOutputHash é sha256 hex-64");
  assert.equal(policy.plannerPolicyVersion, "PLANNER_POLICY_V2");
});

// ─── Fix round 1 (Architect/Review) ─────────────────────────────────────────

test("buildPlannerMemorySnapshot: primeiro snapshot deduplica; anterior legacy segue o mesmo caminho", () => {
  const signalA = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const, attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], narrativeShape: ["setup"], format: "pov", productRole: "solution" };
  const signalB = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const, attentionMechanisms: ["surprise"], psychologicalEffects: ["identification"], narrativeShape: ["payoff"], format: "pov", productRole: "solution" };
  // Sem snapshot anterior: dedup obrigatório (não concat).
  const first = buildPlannerMemorySnapshot({}, [signalA, signalA, signalB]);
  assert.equal(first.signals.length, 2, "duplicatas no primeiro snapshot são deduplicadas");
  // Anterior legado (sem signalsSchemaVersion): mesmo caminho de dedup.
  const legacyPrev = { deliveredHookMechanisms: ["demo"] };
  const second = buildPlannerMemorySnapshot(legacyPrev, [signalA, signalA]);
  assert.equal(second.signals.length, 1, "anterior legacy também deduplica");
});

test("plannerSignalsForDeliveredContents: recipeId vem do Blueprint entregue", () => {
  const canonical = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-1");
  const hypothesesById = new Map(
    (canonical.envelope.hypotheses as Array<Record<string, unknown>>).map((h) => [h.sourceOpportunityId as string, h]),
  );
  const delivered = [{
    sourceOpportunityId: "job-1-commercial-1",
    blueprint: { recipeId: "pov-payoff", attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], format: "pov", productRole: "solution", narrativeMoves: ["setup", "payoff"] },
  }];
  const signals = plannerSignalsForDeliveredContents(delivered, hypothesesById);
  assert.equal(signals[0]!.recipeId, "pov-payoff", "recipeId do CreativeBlueprint entregue");
  const semRecipe = plannerSignalsForDeliveredContents(
    [{ ...delivered[0]!, blueprint: { ...delivered[0]!.blueprint, recipeId: undefined } }],
    hypothesesById,
  );
  assert.equal("recipeId" in semRecipe[0]!, false, "sem recipeId no Blueprint permanece ausente");
});


test("plannedBlueprintForV2: blueprint quando presente; GEN-SCHEMA sem correspondência", () => {
  const blueprint = { attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"], format: "pov", productRole: "solution", narrativeMoves: ["setup", "payoff"] };
  const planned = [{
    opportunityContractVersion: "2" as const, candidateKey: "k1", position: 1, sourceOpportunityId: "o1",
    evidenceRefs: [], commercialObjective: "c", angle: "a", coreMessage: "m", noveltyTargets: ["n"],
    blueprint: { blueprintContractVersion: "1" as const, creativeSystemVersion: "1.3" as const, platformSkillVersion: "tiktok-commerce@1.3" as const, blueprint },
    hookMechanism: "demonstration",
  }];
  assert.deepEqual(plannedBlueprintForV2(planned, "o1"), blueprint);
  assert.throws(
    () => plannedBlueprintForV2(planned, "o9"),
    (e: unknown) => (e as { code?: string }).code === "GEN-SCHEMA",
    "entregue sem planned correspondente falha fechado",
  );
});

test("pipeline candidata: v2Policy expõe plannerInputHash e plannerBinding (sem source)", async () => {
  const { router } = v2RouterState(providerHypotheses);
  const result = await runFirstGeneration({
    productId: "p",
    jobId: "job-inputhash",
    name: "Produto",
    description: "Tecido respirável",
    facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 1,
    router,
  });
  const policy = result.v2Policy as Record<string, unknown>;
  assert.match(String(policy.plannerInputHash), /^[0-9a-f]{64}$/, "plannerInputHash é sha256 hex-64 do PlannerInput efetivo");
  assert.deepEqual(policy.plannerBinding, { platformSkillVersion: "tiktok-commerce@1.3", creativeSystemVersion: "1.3" }, "binding efetivo sem source");
  assert.equal("source" in (policy.plannerBinding as object), false);
});

// ─── Etapa 3/rodada Stage3 — desiredViewerResponse, N vs pool, gate ADR-033 §4

test("discoveryPoolFromSelectedV2: desiredViewerResponse copiado quando presente, omitido quando ausente", () => {
  const withDVR = normalizeDiscoveryEnvelopeV2(parsedEnvelope(), "job-dvr");
  const pool = discoveryPoolFromSelectedV2(withDVR.envelope, ["job-dvr-commercial-1", "job-dvr-commercial-3"], evidence);
  assert.equal(pool.opportunities[0]!.desiredViewerResponse, "isso acontece comigo", "presente copia exato");
  assert.equal("desiredViewerResponse" in pool.opportunities[1]!, false, "ausente é omitido, sem síntese");
});

test("pipeline: pool alinhado ao N — N=5 entrega exact-5 sem cap silencioso a 4", async () => {
  // Hipóteses ricas como as que o provider real retorna (dimensões presentes,
  // sem dor/objeção obrigatória), commercialEffects distintos por hipótese.
  const fiveHypotheses = Array.from({ length: 5 }, (_, i) => ({
    commercialObjective: `objetivo ${i + 1}`,
    angle: `ângulo distinto ${i + 1}`,
    coreMessage: `mensagem ${i + 1}`,
    desiredViewerResponse: i === 0 ? "quero ter isso" : null,
    audience: i % 2 === 0 ? "criadores solo" : null,
    situation: i === 1 ? "rotina corrida" : null,
    desire: i === 2 ? "praticidade" : null,
    identification: i === 3 ? "se reconhecer na cena" : null,
    curiosity: i === 4 ? "como funciona por dentro" : null,
    aspiration: null, humorPotential: null, visualPotential: null,
    pain: null, objection: null, desiredOutcome: null,
    relevantCapabilities: ["cap"],
    benefits: [`benefício distinto ${i + 1}`],
    proofOptions: ["product:description"],
    commercialEffects: [`efeito ${i + 1}`],
    evidenceRefs: ["product:description"],
    confidence: 0.9,
  }));
  const { router } = v2RouterState(fiveHypotheses);
  const result = await runFirstGeneration({
    productId: "p", jobId: "job-n5", name: "Produto", description: "Tecido respirável",
    facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 5, router,
  });
  assert.equal(result.briefs.length, 5, "exact-N com N=5");
  assert.equal(result.plannedV2?.length, 5);
  // desiredViewerResponse presente na hipótese selecionada chega ao ContentOpportunity.
  assert.equal(result.opportunities.some((o) => o.desiredViewerResponse === "quero ter isso"), true);
});

test("pipeline: evidência insuficiente (N=5, 3 hipóteses) falha fechado, nunca parcial", async () => {
  const three = providerHypotheses.slice(0, 3);
  const { router } = v2RouterState(three);
  await assert.rejects(
    () => runFirstGeneration({
      productId: "p", jobId: "job-n5-insuf", name: "Produto", description: "Tecido respirável",
      facts: { features: ["cós elástico com cordão"] },
      targetContentCount: 5, router,
    }),
    (error: unknown) => (error as { code?: string }).code === "GEN-PLANNER-DIVERSITY",
    "pool insuficiente para N falha fechado",
  );
});

test("mapping context: maxOpportunities alinhado ao N (sem cap silencioso a 4), env preservado como teto", async () => {
  const captured: number[] = [];
  const run = async (targetContentCount: number) => {
    const base = v2RouterState(providerHypotheses);
    let seen: unknown;
    const router = {
      describe: base.router.describe,
      complete: async (task: string, input?: { trustedContext?: unknown }) => {
        if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") {
          seen = (input?.trustedContext as { maxOpportunities?: number }).maxOpportunities;
          throw new Error("context-captured");
        }
        return base.router.complete(task, input);
      },
    };
    await assert.rejects(
      () => runFirstGeneration({ productId: "p", jobId: `job-cap-${targetContentCount}`, name: "Produto", description: "Tecido respirável", facts: { features: ["x"] }, targetContentCount, router }),
      /context-captured/,
    );
    captured.push(seen as number);
  };
  delete process.env.GENERATION_MAPPING_MAX_OPPORTUNITIES;
  await run(5);
  assert.equal(captured.at(-1), 5, "default alinhado ao N (não 4)");
  await run(10);
  assert.equal(captured.at(-1), 10, "N=10 → 10");
  process.env.GENERATION_MAPPING_MAX_OPPORTUNITIES = "8";
  await run(5);
  assert.equal(captured.at(-1), 8, "env acima do N é preservado como teto");
  process.env.GENERATION_MAPPING_MAX_OPPORTUNITIES = "2";
  await run(5);
  assert.equal(captured.at(-1), 5, "env abaixo do N válido não cap silenciosamente");
  delete process.env.GENERATION_MAPPING_MAX_OPPORTUNITIES;
});

test("pipeline: Blueprints recipe-backed não acionam GEN-CS-COMPAT; gate de composição livre é defensivo", async () => {
  const { router } = v2RouterState(providerHypotheses);
  const result = await runFirstGeneration({
    productId: "p", jobId: "job-gate", name: "Produto", description: "Tecido respirável",
    facts: { features: ["cós elástico com cordão"] },
    targetContentCount: 1, router,
  });
  assert.equal(result.briefs.length, 1, "pipeline recipe-backed não é bloqueada pelo gate");
  for (const planned of result.plannedV2 ?? []) {
    if (planned.blueprint.blueprint.recipeId === undefined)
      assert.ok(planned.candidateKey.length > 0, "composição livre passaria pelo gate ADR-033 §4 no engine");
  }
});
