import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildFullE6Report, prepareFullE6, prepareFullE6Assignments, preflightFullE6, verifyFullE6Draft,
  type FullE6Observation, type FullE6Annotation, type FullE6Adjudication } from "../src/modules/commerce-intelligence/evaluation/full-e6";

// No provider import or network operation: this entrypoint prepares and validates artifacts only.
const [command, inputPath, outputPath] = process.argv.slice(2);
try {
  if (command === "verify") {
    console.log(JSON.stringify(verifyFullE6Draft(), null, 2));
  } else if (command === "preflight") {
    const readiness = preflightFullE6(inputPath ? JSON.parse(await readFile(inputPath, "utf8")) : undefined);
    console.log(JSON.stringify(readiness, null, 2));
    process.exitCode = readiness.eligibleForLiveCollection ? 0 : 1;
  } else if (command === "prepare") {
    if (!inputPath) throw new Error("Usage: npx tsx scripts/eval-full-e6.mts prepare <new-output-directory>");
    const directory = resolve(inputPath);
    await mkdir(directory, { recursive: true });
    const prepared = prepareFullE6();
    await writeFile(resolve(directory, "preparation.json"), JSON.stringify(prepared, null, 2) + "\n", { flag: "wx" });
    await writeFile(resolve(directory, "collection.json"), JSON.stringify({ observations: [], annotations: [], adjudications: [] }, null, 2) + "\n", { flag: "wx" });
    await writeFile(resolve(directory, "report.json"), JSON.stringify(prepared.report, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ artifactHash: prepared.artifactHash, directory, liveCollection: "BLOCKED", collectedObservations: 0 }, null, 2));
  } else if (command === "report" || command === "assign") {
    if (!inputPath || !outputPath) throw new Error(`Usage: npx tsx scripts/eval-full-e6.mts ${command} <collection.json> <${command === "report" ? "new-report.json" : "new-assignment-directory"}>`);
    const input: { observations: FullE6Observation[]; annotations: FullE6Annotation[]; adjudications: FullE6Adjudication[]; freeze?: unknown } = JSON.parse(await readFile(inputPath, "utf8"));
    if (!Array.isArray(input.observations) || !Array.isArray(input.annotations) || !Array.isArray(input.adjudications)) throw new Error("E6-INVALID: collection requires observations, annotations and adjudications arrays");
    const report = buildFullE6Report(input.observations, input.annotations, input.adjudications, input.freeze);
    if (command === "report") {
      await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
      console.log(JSON.stringify({ reportHash: report.reportHash, verdict: report.verdict, acceptanceStatus: report.acceptanceStatus }, null, 2));
    } else {
      const { assignments, views } = prepareFullE6Assignments(input.observations);
      await mkdir(outputPath, { recursive: true });
      await writeFile(resolve(outputPath, "coordinator-mapping.json"), JSON.stringify(assignments, null, 2) + "\n", { flag: "wx" });
      for (const annotator of new Set(views.map((view) => view.annotatorId))) {
        await writeFile(resolve(outputPath, `${annotator}.json`), JSON.stringify(views.filter((view) => view.annotatorId === annotator), null, 2) + "\n", { flag: "wx" });
      }
      console.log(JSON.stringify({ assignments: assignments.length, mapping: "Keep coordinator-mapping.json private; distribute only each annotator's file." }, null, 2));
    }
  } else {
    throw new Error("E6-BLOCKED: commands: verify | preflight [freeze.json] | prepare <directory> | assign <collection.json> <directory> | report <collection.json> <report.json>. Live A/B is reserved for the user after approved freeze.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "E6-INVALID");
  process.exitCode = 1;
}
