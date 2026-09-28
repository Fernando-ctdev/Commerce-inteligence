// Etapa 6 — CLI offline do golden eval harness (sem provider/rede/Prisma).
// Comandos:
//   build   — recalcula hashes dos case files e do manifesto (FROZEN) e grava.
//   verify  — carrega e verifica dataset inteiro (fail-closed).
//   run     — replay dos dois braços + relatório hasheado (JSON no stdout).
//   approve — aplica aprovação explícita sobre o relatório do run.
// Saída SEMPRE com flush explícito antes de process.exit — o processo termina
// pelo callback do write, não por handle pendente do event loop.
// Uso: tsx scripts/eval-golden.mts <build|verify|run|approve> [opções]
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCaseFile, buildManifest, loadDataset, type VerifiedDataset } from "../src/modules/commerce-intelligence/evaluation/artifacts";
import { buildProvenance, replayCase, runArms } from "../src/modules/commerce-intelligence/evaluation/replay";
import { consolidateAnnotations } from "../src/modules/commerce-intelligence/evaluation/annotations";
import { approveReport, buildReport } from "../src/modules/commerce-intelligence/evaluation/report";
import { EvalContractError, type AdjudicationRecordV1, type GoldenAnnotationV1 } from "../src/modules/commerce-intelligence/evaluation/types";

const DATASET_DIR = fileURLToPath(new URL("../src/modules/commerce-intelligence/evaluation/golden-dataset/", import.meta.url));
const [command, ...args] = process.argv.slice(2);

const collectDatasetTexts = (dir: string): string[] => {
  const texts: string[] = [];
  for (const file of readdirSync(`${dir}/cases`)) {
    const fixture = (JSON.parse(readFileSync(`${dir}/cases/${file}`, "utf8")) as { fixture: { contents: Array<{ brief: Record<string, unknown> }> } }).fixture;
    for (const content of fixture.contents) {
      for (const value of Object.values(content.brief)) {
        if (typeof value === "string") texts.push(value);
        else if (Array.isArray(value)) texts.push(...value.filter((item): item is string => typeof item === "string"));
      }
    }
  }
  return texts;
};

function readAnnotations(): { annotations: GoldenAnnotationV1[]; adjudications: AdjudicationRecordV1[] } {
  const files = readdirSync(`${DATASET_DIR}annotations`).filter((file) => file.endsWith(".json"));
  return {
    annotations: files.flatMap((file) => (JSON.parse(readFileSync(`${DATASET_DIR}annotations/${file}`, "utf8")) as { annotations: GoldenAnnotationV1[] }).annotations),
    adjudications: files.flatMap((file) => (JSON.parse(readFileSync(`${DATASET_DIR}annotations/${file}`, "utf8")) as { adjudications: AdjudicationRecordV1[] }).adjudications),
  };
}

function provenanceFor(dataset: VerifiedDataset) {
  return buildProvenance({
    rubricHash: dataset.rubricAndPolicyHashes.rubricsHash,
    policyHash: dataset.rubricAndPolicyHashes.policyHash,
    creatorContext: {},
    observedResponses: dataset.cases.map((file) => file.fixture.judgePool),
  });
}

function missingFor(dataset: VerifiedDataset) {
  return dataset.cases.flatMap((caseFile) => [
    ...(caseFile.fixture.judgeCallCostMinor === undefined ? [{ caseId: caseFile.case.caseId, field: "judgeCallCostMinor", state: "UNAVAILABLE" as const }] : []),
    ...(caseFile.fixture.judgeLatencyMs === undefined ? [{ caseId: caseFile.case.caseId, field: "judgeLatencyMs", state: "UNAVAILABLE" as const }] : []),
  ]);
}

function reportFor(dataset: VerifiedDataset): ReturnType<typeof buildReport> {
  const provenance = provenanceFor(dataset);
  const pairs = dataset.cases.map((caseFile) => runArms(caseFile, replayCase(caseFile), dataset.policy, dataset.manifest.manifestHash, provenance));
  const consolidated = consolidateAnnotations({ caseFiles: dataset.cases, rubric: dataset.rubrics[0]!, policy: dataset.policy, annotations: readAnnotations().annotations, adjudications: readAnnotations().adjudications });
  return buildReport({
    datasetVersion: dataset.manifest.datasetVersion,
    manifestHash: dataset.manifest.manifestHash,
    rubricVersion: dataset.manifest.rubricVersion,
    policy: dataset.policy,
    pairs,
    annotation: consolidated.coverage,
    provenance,
    missing: missingFor(dataset),
    datasetTexts: collectDatasetTexts(DATASET_DIR),
  });
}

function main(): string {
  if (command === "build") {
    const caseFiles = readdirSync(`${DATASET_DIR}/cases`).sort();
    const caseIds: string[] = [];
    const categories: string[] = [];
    for (const file of caseFiles) {
      const raw = JSON.parse(readFileSync(`${DATASET_DIR}/cases/${file}`, "utf8")) as Record<string, unknown>;
      const built = buildCaseFile({ case: raw.case, fixture: raw.fixture });
      writeFileSync(`${DATASET_DIR}/cases/${file}`, `${JSON.stringify({ ...raw, inputHash: built.inputHash, caseHash: built.caseHash }, null, 2)}\n`);
      caseIds.push(built.case.caseId);
      categories.push(built.case.category);
    }
    const rubrics = JSON.parse(readFileSync(`${DATASET_DIR}/rubrics.json`, "utf8")) as { rubrics: Array<{ rubricVersion: string }> };
    const policy = JSON.parse(readFileSync(`${DATASET_DIR}/threshold-policy.json`, "utf8")) as { thresholdPolicyVersion: string; datasetVersion: string };
    const manifest = buildManifest({
      datasetId: "commerce-intelligence-golden",
      datasetVersion: policy.datasetVersion,
      schemaVersion: "golden-case.v1",
      rubricVersion: rubrics.rubrics[0]!.rubricVersion,
      thresholdPolicyVersion: policy.thresholdPolicyVersion,
      hashAlgorithm: "SHA-256",
      caseIds,
      categories: [...new Set(categories)].sort(),
      status: "FROZEN",
    });
    writeFileSync(`${DATASET_DIR}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
    return JSON.stringify({ built: caseIds, manifestHash: manifest.manifestHash });
  }
  if (command === "verify") {
    const dataset = loadDataset(DATASET_DIR);
    return JSON.stringify({ ok: true, datasetVersion: dataset.manifest.datasetVersion, cases: dataset.cases.length, manifestHash: dataset.manifest.manifestHash });
  }
  if (command === "run" || command === "report") {
    return JSON.stringify(reportFor(loadDataset(DATASET_DIR)), null, 2);
  }
  if (command === "approve") {
    const decision = args.indexOf("--decision");
    const approver = args.indexOf("--approver");
    const reason = args.indexOf("--reason");
    const artifact = approveReport(reportFor(loadDataset(DATASET_DIR)), { decision: args[decision + 1] as "APPROVED" | "REJECTED", approver: args[approver + 1] ?? "", reason: args[reason + 1] ?? "" });
    return JSON.stringify(artifact, null, 2);
  }
  throw new EvalContractError("EVAL-REPORT", "Comando inválido; use build|verify|run|approve");
}

try {
  const payload = main();
  process.stdout.write(`${payload}\n`, () => process.exit(0));
} catch (error) {
  const message = error instanceof EvalContractError ? `EVAL-FAIL ${error.code}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`, () => process.exit(1));
}
