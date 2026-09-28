// Etapa 6 — carrega e verifica os artefatos do golden dataset (fail-closed).
// Hashes sobre canonicalSerialization (planner-harness/canonical); leitura por
// node:fs; sem rede, relógio ou aleatoriedade. Drift de manifesto/case/fixture/
// rubric/policy é EvalContractError — nunca coerção nem leitura tolerante.
import { readFileSync } from "node:fs";
import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";
import { EvalContractError, GOLDEN_CATEGORIES, GOLDEN_SCENARIOS, type GoldenCaseFileV1, type GoldenDatasetManifestV1, type GoldenRubricV1, type GoldenCategory, type GoldenScenario, type ThresholdPolicyV1 } from "./types";

type Dir = string;

const read = (dir: Dir, file: string): unknown => {
  let raw: string;
  try {
    raw = readFileSync(`${dir}/${file}`, "utf8");
  } catch {
    throw new EvalContractError("EVAL-FIXTURE", `Arquivo do dataset ausente: ${file}`);
  }
  return JSON.parse(raw) as unknown;
};
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hashOf = (value: unknown): string => sha256Hex(canonicalSerialization(value));
const str = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new EvalContractError("EVAL-CASE", `Campo ${field} inválido`);
  return value;
};

// Redaction (SPEC §5.2): sem chave de produção/segredo e sem URL viva em texto.
const FORBIDDEN_KEYS: Record<string, true> = { tenantId: true, token: true, cookie: true, password: true, secret: true, apiKey: true, authorization: true };
const redactScan = (value: unknown, path: string): void => {
  if (Array.isArray(value)) return value.forEach((item, index) => redactScan(item, `${path}[${index}]`));
  if (!isObject(value)) {
    if (typeof value === "string" && /https?:\/\//.test(value)) throw new EvalContractError("EVAL-FIXTURE", `URL viva proibida em fixture: ${path}`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS[key]) throw new EvalContractError("EVAL-FIXTURE", `Chave proibida em fixture: ${path}.${key}`);
    redactScan(child, `${path}.${key}`);
  }
};

// contentHash de cada FixtureRefV1 cobre a seção correspondente do fixture.
function fixtureRefHashes(fixtureId: string, section: unknown): { fixtureId: string; fixtureVersion: string; contentHash: string; encoding: "canonical-json-utf8" } {
  return { fixtureId, fixtureVersion: "1", contentHash: hashOf(section), encoding: "canonical-json-utf8" };
}

export function buildCaseFile(raw: unknown): GoldenCaseFileV1 {
  if (!isObject(raw) || !isObject(raw.case) || !isObject(raw.fixture)) throw new EvalContractError("EVAL-CASE", "Case file inválido");
  const c = raw.case as Record<string, unknown>;
  const fixture = raw.fixture;
  redactScan(fixture, "fixture");
  if (!GOLDEN_SCENARIOS.includes(c.scenario as GoldenScenario)) throw new EvalContractError("EVAL-CASE", `Cenário fora do vocabulário Golden: ${String(c.scenario)}`);
  if (!GOLDEN_CATEGORIES.includes(c.category as GoldenCategory)) throw new EvalContractError("EVAL-CASE", `Categoria fora da matriz mínima: ${String(c.category)}`);
  const request = c.request as GoldenCaseFileV1["case"]["request"] | undefined;
  if (!isObject(request) || !Number.isInteger(request.targetContentCount) || (request.targetContentCount as number) < 1 || (request.targetContentCount as number) > 10 || !Number.isInteger(request.briefBatchSize) || (request.briefBatchSize as number) < 4 || (request.briefBatchSize as number) > 8) {
    throw new EvalContractError("EVAL-CASE", "request do case inválido (targetContentCount 1..10, briefBatchSize 4..8)");
  }
  if (c.category === "TENANT_IDEMPOTENCY") {
    const platform = (fixture as { platform?: unknown }).platform;
    if (!isObject(platform) || typeof platform.tenantRef !== "string" || !platform.tenantRef.trim() || typeof platform.idempotencyRef !== "string" || !platform.idempotencyRef.trim()) {
      throw new EvalContractError("EVAL-CASE", "Case TENANT_IDEMPOTENCY exige platform.tenantRef/idempotencyRef de fixture");
    }
  }
  const expected = c.expected as GoldenCaseFileV1["case"]["expected"] | undefined;
  if (!isObject(expected) || !Array.isArray(expected.deliveredContentIds) || expected.deliveredContentIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new EvalContractError("EVAL-CASE", "expected.deliveredContentIds inválido");
  }
  const evidence = (fixture as { evidence?: unknown }).evidence;
  if (!isObject(evidence) || !Array.isArray((evidence as { refs?: unknown }).refs)) throw new EvalContractError("EVAL-CASE", "Fixture sem evidence válida");
  const caseWithoutHashes = {
    caseId: str(c.caseId, "caseId"),
    datasetVersion: str(c.datasetVersion, "datasetVersion"),
    category: str(c.category, "category"),
    scenario: c.scenario,
    request: c.request,
    policyRefs: c.policyRefs,
    expected: c.expected,
    fixtureRefs: {
      evidence: fixtureRefHashes("evidence", evidence),
      creatorContext: fixtureRefHashes("creatorContext", (fixture as { creatorContext?: unknown }).creatorContext),
      providerResponses: [fixtureRefHashes("judgePool", (fixture as { judgePool?: unknown }).judgePool)],
    },
  };
  const inputHash = hashOf({ caseId: caseWithoutHashes.caseId, request: caseWithoutHashes.request, fixtureRefs: caseWithoutHashes.fixtureRefs, creatorContext: (fixture as { creatorContext?: unknown }).creatorContext });
  const caseHash = hashOf({ ...caseWithoutHashes, fixture });
  return { case: caseWithoutHashes as GoldenCaseFileV1["case"], fixture: fixture as GoldenCaseFileV1["fixture"], inputHash, caseHash };
}

// Reconstrói e confere inputHash/caseHash/fixtureRefs de um case file carregado.
export function verifyCaseFile(raw: unknown, fileName: string): GoldenCaseFileV1 {
  if (!isObject(raw) || typeof raw.caseHash !== "string" || typeof raw.inputHash !== "string") throw new EvalContractError("EVAL-CASE", `Case ${fileName} sem hashes`);
  const rebuilt = buildCaseFile({ case: (raw as { case: unknown }).case, fixture: (raw as { fixture: unknown }).fixture });
  if (rebuilt.caseHash !== raw.caseHash || rebuilt.inputHash !== raw.inputHash) throw new EvalContractError("EVAL-CASE", `Hash de case divergente (drift): ${fileName}`);
  return rebuilt;
}

// manifestHash cobre tudo menos o próprio hash (SPEC §5.1).
export function buildManifest(parts: Omit<GoldenDatasetManifestV1, "manifestHash">): GoldenDatasetManifestV1 {
  const { manifestHash: _omitted, ...rest } = parts as GoldenDatasetManifestV1;
  return { ...rest, manifestHash: hashOf({ ...rest, manifestHash: "" }) };
}

export function verifyManifest(raw: unknown): GoldenDatasetManifestV1 {
  if (!isObject(raw) || typeof raw.manifestHash !== "string") throw new EvalContractError("EVAL-MANIFEST", "Manifesto sem manifestHash");
  const rebuilt = buildManifest(raw as Omit<GoldenDatasetManifestV1, "manifestHash">);
  if (rebuilt.manifestHash !== raw.manifestHash) throw new EvalContractError("EVAL-MANIFEST", "manifestHash divergente (drift)");
  if (rebuilt.hashAlgorithm !== "SHA-256" || rebuilt.schemaVersion !== "golden-case.v1" || rebuilt.datasetId !== "commerce-intelligence-golden") throw new EvalContractError("EVAL-MANIFEST", "Manifesto com identidade inválida");
  if (!Array.isArray(rebuilt.caseIds) || rebuilt.caseIds.length === 0) throw new EvalContractError("EVAL-MANIFEST", "Manifesto sem cases");
  return rebuilt;
}

export function verifyRubrics(raw: unknown): GoldenRubricV1[] {
  if (!isObject(raw) || !Array.isArray(raw.rubrics) || raw.rubrics.length === 0) throw new EvalContractError("EVAL-RUBRIC", "Rubrics ausentes");
  return (raw.rubrics as GoldenRubricV1[]).map((rubric, index) => {
    if (!isObject(rubric) || typeof rubric.rubricId !== "string" || typeof rubric.rubricVersion !== "string") throw new EvalContractError("EVAL-RUBRIC", `Rubric ${index} inválida`);
    if (rubric.labels === undefined || !Array.isArray(rubric.labels) || rubric.labels.length === 0) throw new EvalContractError("EVAL-RUBRIC", `Rubric ${rubric.rubricId} sem labels`);
    if (typeof rubric.blind !== "boolean" || typeof rubric.evidenceRequired !== "boolean" || typeof rubric.adjudicationPolicyVersion !== "string") throw new EvalContractError("EVAL-RUBRIC", `Rubric ${rubric.rubricId} incompleta`);
    return rubric;
  });
}

export function verifyThresholdPolicy(raw: unknown): ThresholdPolicyV1 {
  const p = raw as ThresholdPolicyV1;
  if (!isObject(raw) || typeof p.thresholdPolicyVersion !== "string" || typeof p.datasetVersion !== "string" || typeof p.baselineRef !== "string") throw new EvalContractError("EVAL-POLICY", "Threshold policy inválida");
  if (!isObject(p.candidateJudgeRule) || p.candidateJudgeRule.source !== "risk-assessment.v1" || !["LOW", "MEDIUM", "HIGH"].includes(p.candidateJudgeRule.judgeIfRiskBandAtLeast)) throw new EvalContractError("EVAL-POLICY", "candidateJudgeRule inválida");
  const t = p.thresholds;
  if (!isObject(t) || [t.minDeliveredAgreement, t.maxMissedReviewShare, t.minJudgeCallReductionShare].some((v) => typeof v !== "number" || Number.isNaN(v))) throw new EvalContractError("EVAL-POLICY", "Thresholds inválidos");
  if (t.minDeliveredAgreement < 0 || t.minDeliveredAgreement > 1 || t.maxMissedReviewShare < 0 || t.maxMissedReviewShare > 1) throw new EvalContractError("EVAL-POLICY", "Threshold fora de [0,1]");
  if (p.denominators?.quality !== "JUDGE_EXECUTED_CONTENTS" || p.denominators?.delivery !== "CASE_TARGET_CONTENT_COUNT") throw new EvalContractError("EVAL-POLICY", "Denominadores devem estar pré-registrados");
  if (typeof p.missingRule !== "string" || !p.missingRule.trim()) throw new EvalContractError("EVAL-POLICY", "Regra de missing ausente");
  return p;
}

// Dataset completo: manifesto FROZEN + cases + rubrics + policy, todos verificados.
export type VerifiedDataset = {
  dir: Dir;
  manifest: GoldenDatasetManifestV1;
  rubrics: GoldenRubricV1[];
  policy: ThresholdPolicyV1;
  cases: GoldenCaseFileV1[];
  rubricAndPolicyHashes: { rubricsHash: string; policyHash: string };
};

export function loadDataset(dir: Dir, options?: { allowDraft?: boolean }): VerifiedDataset {
  const manifest = verifyManifest(read(dir, "manifest.json"));
  if (manifest.status !== "FROZEN" && !options?.allowDraft) throw new EvalContractError("EVAL-MANIFEST", `Manifesto ${manifest.status} não é elegível para eval (só FROZEN)`);
  const rubrics = verifyRubrics(read(dir, "rubrics.json"));
  if (rubrics[0]!.rubricVersion !== manifest.rubricVersion) throw new EvalContractError("EVAL-RUBRIC", "rubricVersion do manifesto divergente");
  const policy = verifyThresholdPolicy(read(dir, "threshold-policy.json"));
  if (policy.thresholdPolicyVersion !== manifest.thresholdPolicyVersion) throw new EvalContractError("EVAL-POLICY", "thresholdPolicyVersion do manifesto divergente");
  if (policy.datasetVersion !== manifest.datasetVersion) throw new EvalContractError("EVAL-POLICY", "datasetVersion da policy divergente");
  const cases = manifest.caseIds.map((caseId) => {
    if (!/^golden-\d{3}$/.test(caseId)) throw new EvalContractError("EVAL-CASE", `caseId fora do padrão estável: ${caseId}`);
    return verifyCaseFile(read(dir, `cases/${caseId}.json`), caseId);
  });
  if (new Set(cases.map((c) => c.case.category)).size !== manifest.categories.length) throw new EvalContractError("EVAL-MANIFEST", "Categorias do manifesto não cobrem os cases");
  for (const c of cases) {
    if (c.case.datasetVersion !== manifest.datasetVersion) throw new EvalContractError("EVAL-CASE", `Case ${c.case.caseId} com datasetVersion divergente`);
    if (!manifest.categories.includes(c.case.category)) throw new EvalContractError("EVAL-CASE", `Case ${c.case.caseId} com categoria fora do manifesto`);
  }
  return { dir, manifest, rubrics, policy, cases, rubricAndPolicyHashes: { rubricsHash: hashOf(rubrics), policyHash: hashOf(policy) } };
}

export { hashOf, redactScan };
