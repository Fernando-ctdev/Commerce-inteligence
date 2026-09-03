import test from "node:test";
import assert from "node:assert/strict";
import { repairBriefs, validateBriefSet } from "./gates";
import { ContractError } from "./contract";
const evidence = { facts: ["Produto"], refs: ["Produto"] };
const brief = { contentId: "c", briefVersionId: "b", version: 1 as const, angle: "a", hook: "h", script: "testado com 5 kg de carga", scenes: ["1", "2"], cta: "c" };
test("repair cannot authorize unsupported claim", () => { const reports = validateBriefSet([brief], evidence); assert.equal(reports[0].factualStatus, "UNSUPPORTED"); assert.throws(() => repairBriefs([brief], reports, 1, evidence), (error: unknown) => error instanceof ContractError && error.code === "GEN-REPAIR-EXHAUSTED"); });