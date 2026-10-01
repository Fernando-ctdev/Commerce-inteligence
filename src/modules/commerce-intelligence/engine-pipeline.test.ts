// Suite de pipeline do cutover V2: Planner determinístico (sem
// CONTENT_PLAN_GENERATION), Scene Skeleton (sem CONTENT_SCENE_IDEAS por
// provider) e envelope estrito de briefs (developmentSchemaVersion: 2).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredBriefDraft, runFirstGeneration } from "./engine";
import { CONTENT_BRIEF_GENERATION_INSTRUCTION, CONTENT_BRIEF_REPAIR_INSTRUCTION } from "./provider";
import { ContractError } from "./contract";
import { ctaTextFactualIssues } from "./gates";
import { collectJobEvents, resetJobEvents } from "./observability";
// Type guard local (sem inline cast): trustedContext chega como unknown.
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const sb = (text: string, action = "Destaque", factRef = "product:description") => {
  // Bullet V2 canônico: text ancora ≥2 termos do fato após o conector
  // (o conector é parte do próprio text passado pelo chamador).
  const at = text.search(/\b(para|porque|pois|assim)\b/);
  const anchor = at === -1 ? text : text.slice(at);
  return { text: `${text}`, action, factRefs: [factRef], rationale: `${anchor}`, cta: "Confira o produto na página." };
};
const sbPair = (text: string, action?: string) => [sb(text, action), sb(text, action)];
const understanding = { productId: "p", category: undefined, coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["preço"], evidenceRefs: ["product:description"] };
const commercial = { commercialObjective: "argumento", angle: "benefício", coreMessage: "argumento", relevantCapabilities: ["cap"], benefits: ["benefício"], proofOptions: ["fact-1"], commercialEffects: ["argumento"], evidenceRefs: ["product:description"], confidence: 0.9 };
// Pool diverso (requisito do Planner V2 determinístico): benefícios distintos
// com refs de evidência do produto — mesma receita do engine-v2-routing.
const envelope = { discoveryContractVersion: "2", hypotheses: [
  { commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
  { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 },
  { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 },
  { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
] };
const qualityAudit = { parts: [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
] };
// ADR-025: judge em lote — o fake ecoa o conjunto exato de contentIds recebidos.
const judgeBatchPass = (input?: { trustedContext?: unknown }) => {
  const items = recordOf(input?.trustedContext)?.items;
  const list = Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
  return { audits: list.map(({ contentId }) => ({ contentId, parts: qualityAudit.parts })) };
};
const sceneIdeas = { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });
test("development: string[] NÃO é aceito em jobs novos (cutover v2); formato estruturado exige objetos", () => {
  const evidence = { facts: ["Tecido respiravel"], refs: ["product:description"] };
  // string[] (legado) falha GEN-SCHEMA — entrada canônica é DevelopmentBullet[].
  const legacyStrings = ["Destaque o tecido respiravel para explicar o conforto no uso diario", "Destaque o tecido respiravel para explicar o conforto no uso diario"];
  assert.throws(
    () => parseStructuredBriefDraft(
      { angle: "a", hook: "Veja o tecido", development: legacyStrings, script: "Tecido respiravel", cta: "c" },
      evidence,
    ),
    (error: unknown) => error instanceof ContractError && error.code === "GEN-SCHEMA",
  );
  // Bullets canônicos passam e carregam factRefs/cta estruturados.
  const bullets = [
    { text: "Destaque o tecido respiravel para explicar como o tecido respiravel ajuda no uso", action: "Destaque", factRefs: ["product:description"], rationale: "para explicar como o tecido respiravel ajuda no uso", cta: "Confira o produto na página." },
    { text: "Destaque o tecido respiravel para explicar como o tecido respiravel ajuda no uso", action: "Destaque", factRefs: ["product:description"], rationale: "para explicar como o tecido respiravel ajuda no uso", cta: "Confira o produto na página." },
  ];
  const parsed = parseStructuredBriefDraft(
    { angle: "a", hook: "Veja o tecido", development: bullets, script: "Tecido respiravel", cta: "c" },
    evidence,
  );
  assert.equal(parsed.bullets.length, 2);
  assert.deepEqual(parsed.draft.development, [bullets[0]!.text, bullets[1]!.text], "strings são projeção derivada dos bullets");
  // Array misto (string + objeto) também falha fechado.
  assert.throws(
    () => parseStructuredBriefDraft(
      { angle: "a", hook: "h", development: ["texto", bullets[0]!], script: "s", cta: "c" },
      evidence,
    ),
    (error: unknown) => error instanceof ContractError && error.code === "GEN-SCHEMA",
  );
});

test("composes validated provider outputs into the pipeline (4 foundational + batched briefs)", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "demonstração", hook: "Veja", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Mostre o Produto", cta: "Confira" }] }; if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input); return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  const strategy = result.strategy as { opportunities: Array<{ id: string }> };
  const plan = result.plan as { opportunities: Array<{ id: string }> };
  assert.equal(plan.opportunities[0].id, "j-opportunity-1");
  assert.equal(strategy.opportunities[0].id, "j-commercial-1");
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[0].briefVersionId, "j-brief-1");
  // V2 omite PU/Plan/cenas LLM; Judge só aparece quando Risk seleciona.
  assert.deepEqual(calls, ["COMMERCIAL_OPPORTUNITY_MAPPING", "CONTENT_BRIEF_GENERATION", "CONTENT_QUALITY_JUDGE"]);
});
test("repairs only rejected briefs via per-item CONTENT_BRIEF_REPAIR/HIGH, preserving ids", async () => {
  const taskCalls: string[] = [];
  const repairContexts: Array<Record<string, unknown>> = [];
  const router = { describe, hash: () => "h", complete: async (task: string, input?: { trustedContext?: unknown }) => { if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "CONTENT_BRIEF_GENERATION") { taskCalls.push(task); return { developmentSchemaVersion: 2, items: [{ angle: "x", hook: "h", development: sbPair("Destaque os 999 kg de carga para demonstrar resistência"), script: "testado com 999 kg de carga", cta: "c" }] }; } if (task === "CONTENT_BRIEF_REPAIR") { taskCalls.push(task); repairContexts.push(input?.trustedContext as Record<string, unknown>); return { developmentSchemaVersion: 2, angle: "dem", hook: "Veja o produto em uso", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto com demonstração", cta: "c" }; } if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input); return { scenes: [{ description: "Mostra o produto em uso no ambiente do creator" }, { description: "Pega o produto e aproxima do celular para close" }] }; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.deepEqual(taskCalls, ["CONTENT_BRIEF_GENERATION", "CONTENT_BRIEF_REPAIR"], "per-item repair on its own HIGH task");
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[0].briefVersionId, "j-brief-1");
  assert.equal(result.reports[0].decision, "PASS");
  assert.equal(result.repairs, 1);
  assert.equal(result.repairCauses.length, 1);
  assert.match(result.repairCauses[0].causes.join(" "), /claim objetivo/);
  const context = repairContexts[0];
  assert.ok(context);
  // Design 2026-09-18: o repair recebe o diagnóstico redigido por bullet do PRÓPRIO item.
  assert.ok(Array.isArray(context.developmentDiagnostics) && context.developmentDiagnostics.length === 2, "developmentDiagnostics do item presente");
  const diag = (context.developmentDiagnostics as Array<Record<string, unknown>>)[0]!;
  assert.deepEqual(Object.keys(diag).sort(), ["actionPresent", "connectorPresent", "connectorValid", "ctaValid", "factGroundingApplicable", "factRefAllowed", "factTermsInRationale", "grounded", "index", "issues", "rationaleGroundingMatched", "shotList", "textGroundingMatched", "unverifiedClaim", "unverifiedClaimParts"]);
  assert.equal(diag.rationaleGroundingMatched, 2, "claim unsupported ainda contém dois termos do rationale após o conector");
  assert.deepEqual(context.failedBulletIndexes, [0, 1], "repair mira os índices falhos (design 2026-09-19)");
  // E5: developmentAction é advisory (fora da autoridade); claim de carga segue hard.
  assert.deepEqual(context.repairChecklist, { removeUnsupportedClaim: true });
  // V2: a realização allowlisted substitui opportunity/selectedPattern/siblingSummary.
  const realization = context.realization as Record<string, unknown>;
  // A oportunidade vem da Discovery selecionada pelo Planner, sem preferência
  // fixa pela primeira hipótese do envelope.
  assert.ok((result.strategy as { priorityAngles: string[] }).priorityAngles.includes(realization.angle as string));
  assert.ok((context.issues as string[]).length > 0);
  const relevantFacts = (realization.relevantFacts ?? context.relevantFacts) as Array<{ value: string; ref: string }> | undefined;
  if (Array.isArray(relevantFacts)) {
    // Regressao ADR-020: refs de evidência da realização são as validadas (server-side).
    assert.ok(relevantFacts.every(({ ref }) => !ref.startsWith("fact:inexistente")));
  }
});

test("repair per-item carries each entry's own-position pattern when rejects are non-contiguous", async () => {
  const repairPositions: number[][] = [];
  let repairCalls = 0;
  const goodDevelopment = ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"];
  const badDevelopment = ["Destaque os 999 kg de carga para demonstrar resistência", "Destaque os 999 kg de carga para demonstrar resistência"];
  const badScript = "testado com 999 kg de carga";
  const structuredDevelopment = () => [{ "text": goodDevelopment[0], "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": `para explicar como o tecido respiravel afeta o uso ${repairCalls}` }, { "text": goodDevelopment[0], "action": "Destaque", "factRefs": ["product:description"], "cta": "Confira o produto na página.", "rationale": `para explicar como o tecido respiravel afeta o uso ${repairCalls}` }];
  const router = { describe, hash: () => "h", complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [
      { angle: "b1", hook: "hb1", development: badDevelopment.map((t) => sb(t)), script: badScript, cta: "cb1" },
      { angle: "g0", hook: "hg0", development: goodDevelopment.map((t) => sb(t)), script: "Mostre o Produto", cta: "cg0" },
      { angle: "b2", hook: "hb2", development: badDevelopment.map((t) => sb(t)), script: badScript, cta: "cb2" },
    ] };
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairCalls++;
          return { developmentSchemaVersion: 2, angle: `r${repairCalls}`, hook: `hr${repairCalls}`, development: structuredDevelopment(), script: `Produto com demonstração ${repairCalls}`, cta: `Cr ${repairCalls}` };
    }
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 3, router });
  // V2: repair por item com envelope estrito converge na 1ª chamada
  // (posições 1 e 3 — reprovados não-contíguos).
  assert.equal(repairCalls, 2);
  assert.equal(result.repairs, 2);
  assert.deepEqual(result.reports.map((r: { decision: string }) => r.decision), ["PASS", "PASS", "PASS"]);
});
test("batches brief generation sequentially with server-derived ids", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto com demonstração", cta: "c" }, { angle: "a2", hook: "h2", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c2" }] }; if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input); return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, targetContentCount: 2, router });
  assert.equal(result.briefs.length, 2);
  assert.equal(result.briefs[0].contentId, "j-content-1");
  assert.equal(result.briefs[1].contentId, "j-content-2");
  assert.equal(result.briefs[1].briefVersionId, "j-brief-2");
});
test("mapping context is compact and allowlisted without strategy plan skill or raw facts", async () => {
  let capturedContext: Record<string, unknown> | null = null;
  const router = { describe, complete: async (task: string, input: { trustedContext: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { capturedContext = input.trustedContext as Record<string, unknown>; return envelope; }
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", facts: { category: "Vestuário", variants: ["Azul", "Verde"], features: ["x"], rawAggregate: ["não enviar"], memoryHistory: ["nada"], discount: "20% de desconto", sourceUrl: "https://example.com/produto" }, targetContentCount: 1, router });
  assert.ok(capturedContext);
  const keys = Object.keys(capturedContext).sort();
  // Slice 011: creatorContext (projeção allowlisted) entra no contexto do mapping (ADR-018).
  assert.deepEqual(keys, ["creatorContext", "evidenceRefsCatalog", "maxOpportunities", "product", "productFacts", "productId"]);
  assert.ok(!("facts" in capturedContext));
  assert.ok(!("strategy" in capturedContext));
  assert.ok(!("skill" in capturedContext));
  assert.ok(!("memory" in capturedContext));
  // Desconto fora do allowlist (ADR-031): mesmo com `facts.discount` presente,
  // a chave NUNCA chega ao mapping; demais campos do product preservados.
  // Shape construído pela própria engine dentro do teste — cast nomeado, não input externo.
  const productContext = (capturedContext as { product: Record<string, unknown> }).product;
  assert.deepEqual(Object.keys(productContext).sort(), ["brand", "category", "description", "name", "priceAmount", "priceCurrency"]);
  assert.equal("discount" in productContext, false);
  const factsContext: unknown = (capturedContext as Record<string, unknown>).productFacts;
  assert.ok(Array.isArray(factsContext));
  assert.ok(factsContext.some((item) => item && typeof item === "object" && "ref" in item && item.ref === "fact:category"
    && "value" in item && item.value === "Vestuário"), "Discovery recebe fatos confirmados com suas refs");
  assert.ok(factsContext.some((item) => item && typeof item === "object" && "ref" in item && item.ref === "fact:variants"
    && "value" in item && item.value === "Azul"));
  assert.ok(!JSON.stringify(factsContext).includes("não enviar"));
  assert.ok(!JSON.stringify(factsContext).includes("20% de desconto"));
  assert.ok(!JSON.stringify(factsContext).includes("https://example.com"));
  assert.ok(!JSON.stringify(factsContext).includes('"fact:features"'));
});

// Fronteira prompt↔contexto (cutover V2): o prompt de cada capability só pode
// instruir uso de campos que o contexto REAL capturado do engine fornece. Um
// prompt que cite chave fora da allowlist instrui o modelo a ler campos que
// nunca existem (bug V1: selectedPatterns/relevantFacts/developmentRequirements).
const CONTEXT_KEYS_BY_TASK: Record<string, readonly string[]> = {
  CONTENT_BRIEF_GENERATION: [
    // topo do batchContext (engine.ts:1188-1204)
    "realizations", "platformRules", "creatorContext",
    // chaves de buildRealizationContext (engine-v2.ts:626-640)
    "commercialObjective", "angle", "coreMessage", "desiredViewerResponse", "hookMechanism", "blueprint",
    "validatedEvidenceRefs", "productFacts", "creatorConstraints", "memoryConstraints",
  ],
  CONTENT_BRIEF_REPAIR: [
    // topo do repairContext (engine.ts:1391-1400)
    "realization", "issues", "repairChecklist", "developmentDiagnostics", "failedBulletIndexes",
    "failedBullets", "siblingSummary", "creatorContext",
    // chaves de buildRealizationContext dentro de realization
    "commercialObjective", "angle", "coreMessage", "hookMechanism", "blueprint",
    "validatedEvidenceRefs", "productFacts", "creatorConstraints", "memoryConstraints", "platformRules",
  ],
};
// Campos de saída canônica (o prompt instrui o formato da resposta, não o contexto).
const OUTPUT_FIELDS = new Set(["angle", "hook", "development", "script", "cta", "items", "scenes"]);

test("prompts de brief generation/repair só instruem campos presentes no contexto real do engine", async () => {
  const briefContexts: Array<Record<string, unknown>> = [];
  const repairContexts: Array<Record<string, unknown>> = [];
  // Primeiro brief reprova por claim objetivo sem suporte (dispara o repair);
  // segundo brief passa — mesmo shape do teste de repair per-item.
  let briefCalls = 0;
  const badDevelopment = [
    { text: "Destaque os 999 kg de carga para demonstrar resistência", action: "Destaque", factRefs: ["product:description"], rationale: "para demonstrar resistência", cta: "Confira o produto na página." },
    { text: "Destaque os 999 kg de carga para demonstrar resistência", action: "Destaque", factRefs: ["product:description"], rationale: "para demonstrar resistência", cta: "Confira o produto na página." },
  ];
  const goodDevelopment = sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso");
  const router = { describe, hash: () => "h", complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "CONTENT_BRIEF_GENERATION") { briefContexts.push((input?.trustedContext ?? {}) as Record<string, unknown>); briefCalls += 1; return { developmentSchemaVersion: 2, items: [briefCalls === 1 ? { angle: "x", hook: "h", development: badDevelopment, script: "testado com 999 kg de carga", cta: "c" } : { angle: "y", hook: "h2", development: goodDevelopment, script: "Mostre o Produto", cta: "c" }] }; }
    if (task === "CONTENT_BRIEF_REPAIR") { repairContexts.push((input?.trustedContext ?? {}) as Record<string, unknown>); return { developmentSchemaVersion: 2, angle: "x", hook: "h", development: goodDevelopment, script: "Mostre o Produto", cta: "c" }; }
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j-fronteira", name: "Calça", description: "Tecido respirável", targetContentCount: 1, router });
  if (briefContexts.length === 0) throw new Error("contexto do brief generation não capturado");
  if (repairContexts.length === 0) throw new Error("contexto do repair não capturado (repair não disparou)");
  // Chaves reais presentes nos contextos capturados: topo + chaves de cada
  // realization/realization aninhada (o prompt cita campos dentro delas).
  const collectKeys = (contexts: ReadonlyArray<Record<string, unknown>>, nested?: readonly string[]): Set<string> => {
    const keys = new Set<string>();
    for (const context of contexts) {
      for (const key of Object.keys(context)) keys.add(key);
      for (const container of nested ?? []) {
        const value = context[container];
        const list = Array.isArray(value) ? value : [value];
        for (const item of list) if (item && typeof item === "object") for (const key of Object.keys(item)) keys.add(key);
      }
    }
    return keys;
  };
  const realKeys: Record<string, Set<string>> = {
    CONTENT_BRIEF_GENERATION: collectKeys(briefContexts, ["realizations"]),
    CONTENT_BRIEF_REPAIR: collectKeys(repairContexts, ["realization"]),
  };
  // O prompt não pode instruir uso de nenhuma chave que o contexto real não fornece.
  for (const [task, instruction] of [["CONTENT_BRIEF_GENERATION", CONTENT_BRIEF_GENERATION_INSTRUCTION], ["CONTENT_BRIEF_REPAIR", CONTENT_BRIEF_REPAIR_INSTRUCTION]] as const) {
    const known = CONTEXT_KEYS_BY_TASK[task]!;
    for (const key of known) {
      if (!instruction.includes(key)) continue; // prompt nem menciona: ok
      if (!realKeys[task]!.has(key)) continue; // mencionada e presente: ok
    }
    // Inverso (o que pega o bug): referências V1 conhecidas que NÃO existem no contexto real capturado.
    for (const ghost of ["selectedPatterns", "relevantFacts", "developmentRequirements", "causes[", "repairContrast"]) {
      if (!instruction.includes(ghost)) continue;
      assert.fail(`${task}: prompt referencia campo ausente do contexto real: ${ghost}`);
    }
    // Toda chave que o prompt cita e que está na allowlist conhecida deve existir de fato no contexto capturado.
    for (const key of known) {
      if (!instruction.includes(key)) continue;
      assert.ok(realKeys[task]!.has(key), `${task}: prompt cita '${key}' mas o contexto real não fornece`);
    }
  }
  // Repair: campos que o prompt cita explicitamente devem existir no repairContext real.
  for (const cited of ["developmentDiagnostics", "failedBulletIndexes", "failedBullets"]) {
    if (CONTENT_BRIEF_REPAIR_INSTRUCTION.includes(cited)) {
      assert.ok(realKeys.CONTENT_BRIEF_REPAIR!.has(cited), `repair prompt cita '${cited}' ausente do repairContext real`);
    }
  }
});

test("brief context exposes only the V2 realization allowlist", async () => {
  let briefContext: Record<string, unknown> | undefined;
  const router = { describe, complete: async (task: string, input: { trustedContext: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return { ...understanding, category: "vestuário" };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "CONTENT_PLAN_GENERATION" || task === "CONTENT_SCENE_IDEAS") throw new Error(`capability proibida no caminho V2: ${task}`);
    if (task === "CONTENT_BRIEF_GENERATION") { briefContext = input.trustedContext as Record<string, unknown>; return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Calça na prática", cta: "c" }] }; }
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j", name: "Calça", description: "Tecido respirável", facts: { features: ["fato"], rawAggregate: ["não enviar"] }, creatorContext: { tone: "direto" }, targetContentCount: 1, router });
  if (!briefContext) throw new Error("contexto do brief não capturado");
  // Allowlist V2 (buildRealizationContext real): SOMENTE estas chaves por realização.
  const realizations = briefContext.realizations as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(realizations) && realizations.length === 1, "uma realização por oportunidade do Planner");
  const allowlist = ["angle", "blueprint", "commercialObjective", "coreMessage", "creatorConstraints", "desiredViewerResponse", "hookMechanism", "memoryConstraints", "platformRules", "productFacts", "validatedEvidenceRefs"];
  for (const realization of realizations) {
    assert.deepEqual(Object.keys(realization).filter((key) => key !== "desiredViewerResponse").sort(), allowlist.filter((key) => key !== "desiredViewerResponse"), "apenas chaves allowlisted na realização");
  }
  // V2 projeta a allowlist de creatorContext no TOPO do envelope (MEU_ESTILO);
  // dentro da realização entram apenas as constraints estruturadas.
  assert.deepEqual(briefContext.creatorContext, { tone: "direto" });
  // Segredos/contratos de produção nunca cruzam (invariantes mantidas do V1).
  for (const forbidden of ["name", "description", "facts", "strategy", "strategySlice", "skillSlice", "selectedPatterns", "creativeCatalog", "productReference", "opportunities", "evidenceRefs", "evidenceRefsCatalog", "scenes", "caption", "captions"]) {
    assert.ok(!(forbidden in briefContext), `${forbidden} não cruza o contexto do brief`);
    for (const realization of realizations) assert.ok(!(forbidden in realization), `${forbidden} não cruza a realização`);
  }
});
test("never sends commission through any AI context", async () => {
  const captured: unknown[] = [];
  const router = {
    describe,
    complete: async (task: string, input: { trustedContext: unknown; externalData?: unknown }) => {
      captured.push(input.trustedContext, input.externalData);
      if (task === "PRODUCT_UNDERSTANDING") return understanding;
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
      if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
      if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
      return {};
    },
  };
  await runFirstGeneration({
    productId: "p",
    jobId: "j",
    name: "Produto",
    description: "Tecido respirável",
    facts: {
      category: "Categoria",
      commissionType: "PERCENT",
      commissionValue: "10.00",
    },
    targetContentCount: 1,
    router,
  });
  assert.equal(captured.some((value) => JSON.stringify(value).includes("commission")), false);
});

test("mapping: objection vazio é tratado como ausência sem retry", async () => {
  let mappingCalls = 0;
  const bad = { discoveryContractVersion: "2", hypotheses: [commercial, commercial, commercial] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls += 1; return mappingCalls === 1 ? bad : envelope; }
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input);
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(mappingCalls, 1, "objection vazio não exige re-solicitação");
  assert.equal(result.briefs.length, 1);
});

test("mapping fail-closed: objection com tipo inválido termina GEN-SCHEMA", async () => {
  let mappingCalls = 0;
  const bad = { discoveryContractVersion: "2", hypotheses: [{ ...commercial, objection: 42 }] };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls += 1; return bad; }
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Produto na prática", cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }), (error: unknown) => {
    const e = error as { code?: string; field?: string };
    assert.equal(e.code, "GEN-SCHEMA");
    assert.equal(e.field, "objection");
    return true;
  });
  assert.equal(mappingCalls, 2, "exatamente uma re-solicitação antes do fail-closed");
});





// Gate 7 — observabilidade: kept/dropped do gateSceneSet no capability.completed.






// Gate 7 — retry guiado por gate: set inteiramente descartado re-solicita UMA vez
// com gateFeedback (causas do gate) no contexto; segunda tentativa válida conclui.


// Gate 7 — fail-closed mantido: gate derruba o set nas duas tentativas -> item falha.


// ---- Contrato estruturado de development na geração inicial (design 2026-09-18) ----

const structuredBullet = {
  text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso",
  action: "Destaque",
  factRefs: ["product:description"], cta: "Confira o produto na página.",
  rationale: "para mostrar o tecido respirável no uso diário",
};

test("geração inicial aceita development estruturado e projeta bullets para string[] canônico", async () => {
  const calls: string[] = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => { calls.push(task); if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "demonstração", hook: "Veja", development: [structuredBullet, structuredBullet], script: "Mostre o Produto", cta: "Confira" }] }; if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o produto na mão girando devagar" }, { description: "Mostre o tecido esticando de perto" }] }; if (task === "CONTENT_QUALITY_JUDGE") return { audits: [{ contentId: "j-content-1", parts: [{ part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" }, { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" }, { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" }, { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" }, { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" }] }] }; return {}; } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(result.briefs.length, 1);
  assert.ok(result.briefs[0]!.development.every((point) => typeof point === "string"), "development canônico permanece string[]");
  assert.deepEqual(result.briefs[0]!.development, [structuredBullet.text, structuredBullet.text]);
});

test("judge recebe development somente com campos propostos pelo provider", async () => {
  let judgeContext: Record<string, unknown> | undefined;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: [structuredBullet, structuredBullet], script: "Produto na prática", cta: "c" }] };
    if (task === "CONTENT_QUALITY_JUDGE") { judgeContext = recordOf(input?.trustedContext); return judgeBatchPass(input); }
    return {};
  } };
  await runFirstGeneration({ productId: "p", jobId: "j-judge-fields", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  const items = judgeContext?.items as Array<Record<string, unknown>>;
  const development = items[0]?.development as Array<Record<string, unknown>>;
  assert.deepEqual(Object.keys(development[0]!).sort(), ["cta", "factRefs", "text"]);
  assert.equal("action" in development[0]!, false);
  assert.equal("rationale" in development[0]!, false);
});

test("bullet estruturado com factRef desconhecido falha GEN-SCHEMA após retry único do lote", async () => {
  let briefCalls = 0;
  const badBullet = { ...structuredBullet, factRefs: ["fact:inexistente"], cta: "Confira o produto na página." };
  const router = { describe, complete: async (task: string) => { if (task === "PRODUCT_UNDERSTANDING") return understanding; if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope; if (task === "CONTENT_BRIEF_GENERATION") { briefCalls += 1; return { items: [{ angle: "demonstração", hook: "Veja", development: [badBullet, badBullet], script: "Mostre o Produto", cta: "Confira" }] }; } return {}; } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j-bad-ref", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => error instanceof Error && /lote de briefings/i.test(error.message),
  );
  assert.equal(briefCalls, 2, "retry único de contrato do lote");
});

test("script_naturalness REVIEW vai ao part repair do item com creatorContext e script limpo publica", async () => {
  let partRepairContext: Record<string, unknown> | undefined;
  const judgeParts = (contentId: string) => [
    { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
    { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
    { part: "script", status: "REVIEW", criterion: "script_naturalness", reason: "not_tiktok_native" },
    { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
    { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
  ].map((part) => part);
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [{ angle: "a", hook: "h", development: sbPair("Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"), script: "Fale sobre o produto", cta: "c" }] };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o produto nas maos girando" }, { description: "Pegue o produto e aproxime do tecido" }] };
    if (task === "CONTENT_QUALITY_JUDGE") { const items = recordOf(input?.trustedContext)?.items; const list = Array.isArray(items) ? items as Array<{ contentId: string }> : []; return { audits: list.map(({ contentId }) => ({ contentId, parts: judgeParts(contentId) })) }; }
    if (task === "CONTENT_PART_REPAIR") { partRepairContext = input?.trustedContext as Record<string, unknown>; return { items: (recordOf(partRepairContext)?.items as Array<{ contentId: string }> ?? []).map(({ contentId }) => ({ contentId, content: "Mostre o produto perto e fale do tecido" })) }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j-nat", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.ok(partRepairContext);
  assert.equal(partRepairContext!.part, "script", "somente a parte revisada vai a repair");
  const repairItem = (partRepairContext!.items as Array<Record<string, unknown>>)[0]!;
  assert.equal(repairItem.contentId, "j-nat-content-1", "somente o item revisado vai a repair");
  assert.equal(repairItem.criterion, "script_naturalness");
  assert.equal(repairItem.reason, "Precisa soar mais natural para conteúdo TikTok.", "contexto do repair carrega reasonText localizado; enum segue em qualityDiagnostics");
  assert.ok("creatorContext" in partRepairContext!, "creatorContext allowlisted presente");
  assert.equal(result.briefs[0].script, "Mostre o produto perto e fale do tecido");
  assert.equal(result.reports[0].decision, "PASS");
});
