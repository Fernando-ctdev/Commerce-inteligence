// Etapa 6 — seed determinístico do golden dataset (matriz mínima de categorias,
// cenários e bordas N=1/N=10/F=0/F=CAP/F>CAP + batches 4..8). Regenera case
// files com hashes, annotations cegas com adjudicação e o manifesto FROZEN.
// Uso: tsx scripts/eval-golden-seed.mts
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCaseFile, buildManifest } from "../src/modules/commerce-intelligence/evaluation/artifacts";
import { assignmentsForCase } from "../src/modules/commerce-intelligence/evaluation/annotations";
import { canonicalSerialization, sha256Hex } from "../src/modules/commerce-intelligence/planner-harness/canonical";
import type { GoldenCaseFileV1, GoldenRubricV1 } from "../src/modules/commerce-intelligence/evaluation/types";

const DIR = fileURLToPath(new URL("../src/modules/commerce-intelligence/evaluation/golden-dataset/", import.meta.url));

type Brief = { angle: string; hook: string; development: string[]; script: string; cta: string };
const gate = (contentId: string, overrides: Record<string, unknown> = {}) => ({ briefId: `${contentId}:brief-1`, gateVersion: 4, factualStatus: "SUPPORTED", claimType: "objetivo", evidenceRefs: ["fact:um"], structuralStatus: "PASS", platformStatus: "PASS", varietyStatus: "PASS", issues: [], decision: "PASS", ...overrides });
const scenes = (status: string, kept: number, dropped: number, descriptions: string[]) => ({ status, kept, dropped, descriptions });
const passPool = (contentId: string, extra: Record<string, unknown> = {}) => ({ contentId, round: 1, parts: [{ part: "hook", status: "PASS", criterion: "hook_curiosity", reason: "meets_criteria" }, { part: "development", status: "PASS", criterion: "coherent_flow", reason: "meets_criteria" }, { part: "script", status: "PASS", criterion: "speakable", reason: "meets_criteria" }, { part: "cta", status: "PASS", criterion: "cta_fit", reason: "meets_criteria" }, { part: "scenes", status: "PASS", criterion: "scene_flow", reason: "meets_criteria" }], ...extra });

const briefFor = (n: number, label: string): Brief => ({
  angle: `${label} ângulo ${n}`,
  hook: `${label} gancho ${n} direto ao ponto`,
  development: [`Mostre ${label} item ${n} com o produto em uso`, `Feche mostrando ${label} detalhe ${n} sem fala`],
  script: `Demonstre ${label} passo ${n} e conclua sem enrolar.`,
  cta: `Confira ${label} ${n} na página.`,
});

type CaseSeed = {
  caseId: string; category: string; scenario: string; target: number; batch: number;
  expected: string[]; cost?: number; latency?: number; platform?: { tenantRef: string; idempotencyRef: string };
  contents: Array<{ contentId: string; brief: Brief; gate: Record<string, unknown>; scenes: ReturnType<typeof scenes> }>;
  judgePool: Array<{ contentId: string; round: number; parts: unknown[]; retries?: number; latencyMs?: number }>;
};

const caseSeeds: CaseSeed[] = [
  { caseId: "golden-001", category: "FACTUALITY", scenario: "HAPPY_PATH", target: 2, batch: 4, expected: ["golden-001-content-1", "golden-001-content-2"], cost: 900, latency: 1200,
    contents: [
      { contentId: "golden-001-content-1", brief: briefFor(1, "Fato suportado"), gate: gate("golden-001-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Mostre o fato 1 no produto", "Feche com o produto parado"]) },
      { contentId: "golden-001-content-2", brief: briefFor(2, "Inferência segura"), gate: gate("golden-001-content-2", { factualStatus: "INFERRED_BUT_SAFE" }), scenes: scenes("AVAILABLE", 2, 0, ["Mostre a inferência 2 aplicada", "Detalhe sem fala"]) },
    ], judgePool: [passPool("golden-001-content-1"), passPool("golden-001-content-2")] },
  { caseId: "golden-002", category: "HARD_GATES", scenario: "BOUNDARY", target: 1, batch: 4, expected: ["golden-002-content-1"], cost: 900, latency: 900,
    contents: [{ contentId: "golden-002-content-1", brief: { angle: "borda cardinal", hook: "Borda mínima de bullets", development: ["Mostre a borda inferior de dois bullets", "Feche sem terceiro bullet"], script: "Dois bullets, borda exata do contrato.", cta: "Veja na página." }, gate: gate("golden-002-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Mostre a borda mínima", "Feche sem fala"]) }], judgePool: [passPool("golden-002-content-1")] },
  { caseId: "golden-003", category: "SCENES", scenario: "SCENE_FAILURE", target: 3, batch: 4, expected: ["golden-003-content-1", "golden-003-content-2"], cost: 900, latency: 800,
    contents: [
      { contentId: "golden-003-content-1", brief: briefFor(1, "Cena ok"), gate: gate("golden-003-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Mostre a cena 1", "Mostre a cena 2"]) },
      { contentId: "golden-003-content-2", brief: briefFor(2, "Cena ok dois"), gate: gate("golden-003-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Mostre a cena 3", "Mostre a cena 4"]) },
      { contentId: "golden-003-content-3", brief: briefFor(3, "Cena filtrada"), gate: gate("golden-003-content-3"), scenes: scenes("FILTERED", 1, 1, ["Única cena válida"]) },
    ], judgePool: [passPool("golden-003-content-1"), passPool("golden-003-content-2"), passPool("golden-003-content-3")] },
  { caseId: "golden-004", category: "VARIETY", scenario: "BOUNDARY", target: 2, batch: 8, expected: ["golden-004-content-1", "golden-004-content-2"], cost: 900, latency: 700,
    contents: [
      { contentId: "golden-004-content-1", brief: briefFor(1, "Variedade A"), gate: gate("golden-004-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Ângulo A cena 1", "Ângulo A cena 2"]) },
      { contentId: "golden-004-content-2", brief: briefFor(2, "Variedade B"), gate: gate("golden-004-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Ângulo B cena 1", "Ângulo B cena 2"]) },
    ], judgePool: [passPool("golden-004-content-1"), passPool("golden-004-content-2")] },
  { caseId: "golden-005", category: "TEMPLATING", scenario: "ADVERSARIAL", target: 2, batch: 4, expected: ["golden-005-content-1"], cost: 900, latency: 1100,
    contents: [
      { contentId: "golden-005-content-1", brief: briefFor(1, "Template perceptível"), gate: gate("golden-005-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Template cena 1", "Template cena 2"]) },
      { contentId: "golden-005-content-2", brief: briefFor(2, "Repetição literal"), gate: gate("golden-005-content-2", { varietyStatus: "FAIL", issues: ["duplicata normalizada de hook"], decision: "REJECT" }), scenes: scenes("AVAILABLE", 2, 0, ["Repetição cena 1", "Repetição cena 2"]) },
    ], judgePool: [passPool("golden-005-content-1")] },
  { caseId: "golden-006", category: "NATURALNESS", scenario: "HAPPY_PATH", target: 2, batch: 4, expected: ["golden-006-content-1", "golden-006-content-2"], cost: 900, latency: 1000,
    contents: [
      { contentId: "golden-006-content-1", brief: briefFor(1, "Naturalidade A"), gate: gate("golden-006-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Natural A cena 1", "Natural A cena 2"]) },
      { contentId: "golden-006-content-2", brief: briefFor(2, "Naturalidade B"), gate: gate("golden-006-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Natural B cena 1", "Natural B cena 2"]) },
    ], judgePool: [passPool("golden-006-content-1"), passPool("golden-006-content-2")] },
  { caseId: "golden-007", category: "SEMANTIC_COHERENCE", scenario: "BOUNDARY", target: 2, batch: 4, expected: ["golden-007-content-1", "golden-007-content-2"], cost: 900, latency: 950,
    contents: [
      { contentId: "golden-007-content-1", brief: briefFor(1, "Coerência A"), gate: gate("golden-007-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Coerência A cena 1", "Coerência A cena 2"]) },
      { contentId: "golden-007-content-2", brief: briefFor(2, "Coerência B"), gate: gate("golden-007-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Coerência B cena 1", "Coerência B cena 2"]) },
    ], judgePool: [passPool("golden-007-content-1", { parts: passPool("x").parts.map((part: { part: string }) => part.part === "cta" ? { ...part, status: "REVIEW", reason: "weak_commercial_value" } : part) }), passPool("golden-007-content-2")] },
  { caseId: "golden-008", category: "RISK", scenario: "HARD_FAILURE", target: 2, batch: 4, expected: ["golden-008-content-1"], cost: 900, latency: 1300,
    contents: [
      { contentId: "golden-008-content-1", brief: briefFor(1, "Risco baixo"), gate: gate("golden-008-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Risco baixo cena 1", "Risco baixo cena 2"]) },
      { contentId: "golden-008-content-2", brief: briefFor(2, "Risco alto"), gate: gate("golden-008-content-2"), scenes: scenes("ERROR", 0, 2, []) },
    ], judgePool: [passPool("golden-008-content-1"), passPool("golden-008-content-2")] },
  { caseId: "golden-009", category: "PARTIAL_RETRY", scenario: "PARTIAL", target: 4, batch: 4, expected: ["golden-009-content-1", "golden-009-content-2"], cost: 900, latency: 1400,
    contents: [
      { contentId: "golden-009-content-1", brief: briefFor(1, "Parcial um"), gate: gate("golden-009-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Parcial 1 cena A", "Parcial 1 cena B"]) },
      { contentId: "golden-009-content-2", brief: briefFor(2, "Parcial dois"), gate: gate("golden-009-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Parcial 2 cena A", "Parcial 2 cena B"]) },
      { contentId: "golden-009-content-3", brief: briefFor(3, "Falta factual"), gate: gate("golden-009-content-3", { factualStatus: "UNSUPPORTED", issues: ["claim objetivo sem suporte"], decision: "REJECT" }), scenes: scenes("AVAILABLE", 2, 0, ["Falta 3 cena A", "Falta 3 cena B"]) },
      { contentId: "golden-009-content-4", brief: briefFor(4, "Falta de cenas"), gate: gate("golden-009-content-4"), scenes: scenes("FILTERED", 1, 1, ["Única cena"]) },
    ], judgePool: [passPool("golden-009-content-1"), passPool("golden-009-content-2"), passPool("golden-009-content-4")] },
  { caseId: "golden-010", category: "PARTIAL_RETRY", scenario: "HARD_FAILURE", target: 3, batch: 4, expected: [], cost: 900, latency: 1500,
    contents: [
      { contentId: "golden-010-content-1", brief: briefFor(1, "Reprovado um"), gate: gate("golden-010-content-1", { factualStatus: "CONTRADICTED", issues: ["claim contradito"], decision: "REJECT" }), scenes: scenes("AVAILABLE", 2, 0, ["A", "B"]) },
      { contentId: "golden-010-content-2", brief: briefFor(2, "Reprovado dois"), gate: gate("golden-010-content-2", { structuralStatus: "FAIL", issues: ["schema inválido"], decision: "REPAIR" }), scenes: scenes("AVAILABLE", 2, 0, ["C", "D"]) },
      { contentId: "golden-010-content-3", brief: briefFor(3, "Reprovado três"), gate: gate("golden-010-content-3", { varietyStatus: "FAIL", issues: ["duplicata normalizada"], decision: "REJECT" }), scenes: scenes("AVAILABLE", 2, 0, ["E", "F"]) },
    ], judgePool: [passPool("golden-010-content-2")] },
  { caseId: "golden-011", category: "COST_LATENCY", scenario: "MISSING_DATA", target: 2, batch: 4, expected: ["golden-011-content-1", "golden-011-content-2"],
    contents: [
      { contentId: "golden-011-content-1", brief: briefFor(1, "Custo ausente"), gate: gate("golden-011-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Custo 1 cena A", "Custo 1 cena B"]) },
      { contentId: "golden-011-content-2", brief: briefFor(2, "Latência ausente"), gate: gate("golden-011-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Custo 2 cena A", "Custo 2 cena B"]) },
    ], judgePool: [passPool("golden-011-content-1"), passPool("golden-011-content-2")] },
  { caseId: "golden-012", category: "PARTIAL_RETRY", scenario: "TECHNICAL_RETRY", target: 2, batch: 4, expected: ["golden-012-content-1", "golden-012-content-2"], cost: 900, latency: 2500,
    contents: [
      { contentId: "golden-012-content-1", brief: briefFor(1, "Retry técnico"), gate: gate("golden-012-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Retry 1 cena A", "Retry 1 cena B"]) },
      { contentId: "golden-012-content-2", brief: briefFor(2, "Sem retry"), gate: gate("golden-012-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Retry 2 cena A", "Retry 2 cena B"]) },
    ], judgePool: [passPool("golden-012-content-1", { retries: 1, latencyMs: 2500 }), passPool("golden-012-content-2")] },
  { caseId: "golden-013", category: "TENANT_IDEMPOTENCY", scenario: "HAPPY_PATH", target: 2, batch: 4, expected: ["golden-013-content-1", "golden-013-content-2"], cost: 900, latency: 1000,
    platform: { tenantRef: "fixture-tenant-alpha", idempotencyRef: "fixture-idem-013" },
    contents: [
      { contentId: "golden-013-content-1", brief: briefFor(1, "Idempotência A"), gate: gate("golden-013-content-1"), scenes: scenes("AVAILABLE", 2, 0, ["Idem 1 cena A", "Idem 1 cena B"]) },
      { contentId: "golden-013-content-2", brief: briefFor(2, "Idempotência B"), gate: gate("golden-013-content-2"), scenes: scenes("AVAILABLE", 2, 0, ["Idem 2 cena A", "Idem 2 cena B"]) },
    ], judgePool: [passPool("golden-013-content-1"), passPool("golden-013-content-2")] },
];

// golden-014: borda N=10, F=0, batch 8 — gerada dos templates canônicos.
caseSeeds.push({
  caseId: "golden-014", category: "FACTUALITY", scenario: "HAPPY_PATH", target: 10, batch: 8, expected: Array.from({ length: 10 }, (_v, i) => `golden-014-content-${i + 1}`), cost: 900, latency: 3200,
  contents: Array.from({ length: 10 }, (_v, i) => ({ contentId: `golden-014-content-${i + 1}`, brief: briefFor(i + 1, "Escala dez"), gate: gate(`golden-014-content-${i + 1}`), scenes: scenes("AVAILABLE", 2, 0, [`Escala ${i + 1} cena A`, `Escala ${i + 1} cena B`]) })),
  judgePool: Array.from({ length: 10 }, (_v, i) => passPool(`golden-014-content-${i + 1}`)),
});

mkdirSync(`${DIR}cases`, { recursive: true });
const rubrics = (JSON.parse(readFileSync(`${DIR}rubrics.json`, "utf8")) as { rubrics: GoldenRubricV1[] }).rubrics[0]!;
const built: GoldenCaseFileV1[] = [];
for (const seed of caseSeeds) {
  const raw = { case: { caseId: seed.caseId, datasetVersion: "golden-dataset.v1", category: seed.category, scenario: seed.scenario, request: { targetContentCount: seed.target, briefBatchSize: seed.batch, productId: `golden-product-${seed.caseId.slice(-3)}`, jobId: `golden-job-${seed.caseId.slice(-3)}` }, policyRefs: { gatePolicy: "GATE_POLICY_VERSION:4", riskAssessment: "risk-assessment.v1" }, expected: { deliveredContentIds: seed.expected } }, fixture: { evidence: { facts: ["Produto Golden", "fato autorizado um"], refs: ["product:name", "fact:um"] }, creatorContext: {}, ...(seed.platform ? { platform: seed.platform } : {}), contents: seed.contents, judgePool: seed.judgePool, ...(seed.cost === undefined ? {} : { judgeCallCostMinor: seed.cost }), ...(seed.latency === undefined ? {} : { judgeLatencyMs: seed.latency }) } };
  const file = buildCaseFile(raw);
  built.push(file);
  writeFileSync(`${DIR}cases/${seed.caseId}.json`, `${JSON.stringify({ case: file.case, fixture: file.fixture, inputHash: file.inputHash, caseHash: file.caseHash }, null, 2)}\n`);
}

// Annotations cegas para golden-006: 2 anotadores × 2 braços, 1 conflito
// adjudicado em content-1 e 1 concordância; labels NUNCA vêm do judge.
// Ordem de assignments: [armA/a1, armB/a1, armA/a2, armB/a2].
const case006 = built.find((file) => file.case.caseId === "golden-006")!;
const assignments = assignmentsForCase(case006, rubrics, ["annotator-1", "annotator-2"]);
const LABELS_BY_ANNOTATION: string[][] = [["NATURAL", "NATURAL"], ["NATURAL", "NATURAL"], ["FORCED", "NATURAL"], ["NATURAL", "NATURAL"]];
const annotations = assignments.map(({ assignment }, index) => {
  const payload = { annotationId: `${assignment.assignmentId}@${assignment.opaqueAnnotatorId}`, caseId: assignment.caseId, opaqueArmId: assignment.opaqueArmId, assignmentHash: assignment.assignmentHash, rubricVersion: assignment.rubricVersion, opaqueAnnotatorId: assignment.opaqueAnnotatorId, labels: LABELS_BY_ANNOTATION[index]!.map((label, position) => ({ contentId: `golden-006-content-${position + 1}`, label })) };
  return { ...payload, annotationHash: sha256Hex(canonicalSerialization(payload)) };
});
mkdirSync(`${DIR}annotations`, { recursive: true });
writeFileSync(`${DIR}annotations/golden-006.json`, JSON.stringify({ annotations, adjudications: [] }, null, 2) + "\n");

// Adjudicação do conflito real (arm do annotator-1, content-1: NATURAL vs FORCED).
const conflicted = annotations[0]!;
const payload = { caseId: conflicted.caseId, opaqueArmId: conflicted.opaqueArmId, assignmentHash: conflicted.assignmentHash, label: "NATURAL", adjudicator: "arquiteto", reason: "gancho c1 atende definição operacional da rubric", conflictBetween: [annotations[0]!.annotationId, annotations[2]!.annotationId] };
const adjudications = [{ ...payload, adjudicationHash: sha256Hex(canonicalSerialization(payload)) }];
writeFileSync(`${DIR}annotations/golden-006.json`, JSON.stringify({ annotations, adjudications }, null, 2) + "\n");

const manifest = buildManifest({
  datasetId: "commerce-intelligence-golden",
  datasetVersion: "golden-dataset.v1",
  schemaVersion: "golden-case.v1",
  rubricVersion: rubrics.rubricVersion,
  thresholdPolicyVersion: "THRESHOLD_POLICY_GOLDEN_V1",
  hashAlgorithm: "SHA-256",
  caseIds: built.map((file) => file.case.caseId),
  categories: [...new Set(built.map((file) => file.case.category))].sort(),
  status: "FROZEN",
});
writeFileSync(`${DIR}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ seeded: built.map((file) => file.case.caseId), categories: manifest.categories, annotations: annotations.length, adjudications: adjudications.length, manifestHash: manifest.manifestHash }));
