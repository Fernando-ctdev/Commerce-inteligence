import test from "node:test";
import assert from "node:assert/strict";
import { repairBriefs, validDevelopmentPoint, validateBriefSet } from "./gates";
import { ContractError } from "./contract";
const evidence = { facts: ["Produto"], refs: ["Produto"] };
const brief = { contentId: "c", briefVersionId: "b", version: 1 as const, angle: "a", hook: "h", development: ["Carga de 5 kg demonstrada"], script: "testado com 5 kg de carga", cta: "c" };
test("repair cannot authorize unsupported claim", () => { const reports = validateBriefSet([brief], evidence); assert.equal(reports[0].factualStatus, "UNSUPPORTED"); assert.throws(() => repairBriefs([brief], reports, 1, evidence), (error: unknown) => error instanceof ContractError && error.code === "GEN-REPAIR-EXHAUSTED"); });
test("development structure does not require fact-term grounding; factual gate still rejects unsupported claims", () => {
  const subjectiveDevelopment = "Comente o uso para trazer uma sensação de praticidade";
  assert.equal(validDevelopmentPoint(subjectiveDevelopment, evidence), true);
  const reports = validateBriefSet([{ ...brief, development: [subjectiveDevelopment] }], evidence);
  assert.equal(reports[0].factualStatus, "UNSUPPORTED", "o claim objetivo do script segue sob o hard gate factual");
  assert.throws(() => repairBriefs([{ ...brief, development: [subjectiveDevelopment] }], reports, 1, evidence), (error: unknown) => error instanceof ContractError && error.code === "GEN-REPAIR-EXHAUSTED");
});
