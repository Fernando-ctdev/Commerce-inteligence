import test from "node:test";
import assert from "node:assert/strict";
import { emitJobEvent, collectJobEvents, resetJobEvents, sanitizeGateReports, type JobEventName, type JobEventFields } from "./observability";

type Captured = { level: string; line: string };
function capture(): { lines: Captured[]; restore: () => void } {
  const lines: Captured[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => { lines.push({ level: "info", line: String(args[0]) }); };
  return { lines, restore: () => { console.info = original; } };
}

test("emits one JSON line per event with timestamp and allowlisted fields only", () => {
  resetJobEvents();
  const { lines, restore } = capture();
  try {
    emitJobEvent("capability.completed", { jobId: "j1", attempt: 1, stage: "MAPPING_COMMERCIAL_OPPORTUNITIES", task: "COMMERCIAL_OPPORTUNITY_MAPPING", tier: "MID", model: "m", instructionHash: "abc", durationMs: 100, timeoutMs: 180000, requestBytes: 10, trustedContextBytes: 5, externalBytes: 2, responseBytes: 20, providerStatus: 200 });
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0].line) as Record<string, unknown>;
    assert.equal(typeof parsed.timestamp, "string");
    assert.equal(parsed.event, "capability.completed");
    assert.equal(parsed.jobId, "j1");
    assert.equal(parsed.durationMs, 100);
    assert.ok(!("prompt" in parsed));
    assert.ok(!("payload" in parsed));
    assert.ok(!("trustedContext" in parsed));
  } finally { restore(); }
});

test("begin/final events pair even when capability throws", () => {
  resetJobEvents();
  const { lines, restore } = capture();
  try {
    const events: JobEventName[] = ["capability.started", "capability.failed"];
    for (const event of events) emitJobEvent(event, { jobId: "j2", attempt: 1, task: "CONTENT_BRIEF_GENERATION", tier: "MID", model: "m", errorName: "AbortError", errorCode: "GEN-PROVIDER" });
    const names = lines.map((l) => (JSON.parse(l.line) as { event: string }).event);
    assert.deepEqual(names, ["capability.started", "capability.failed"]);
    const failed = JSON.parse(lines[1].line) as Record<string, unknown>;
    assert.equal(failed.errorName, "AbortError");
    assert.equal(failed.errorCode, "GEN-PROVIDER");
  } finally { restore(); }
});

test("cardinality fields expected/received and retry are preserved", () => {
  resetJobEvents();
  const { lines, restore } = capture();
  try {
    emitJobEvent("capability.failed", { jobId: "j3", attempt: 1, task: "CONTENT_BRIEF_GENERATION", tier: "MID", model: "m", expected: 1, received: 3, retry: 1, errorCode: "GEN-SCHEMA" });
    const parsed = JSON.parse(lines[0].line) as Record<string, unknown>;
    assert.equal(parsed.expected, 1);
    assert.equal(parsed.received, 3);
    assert.equal(parsed.retry, 1);
  } finally { restore(); }
});

test("collectJobEvents returns allowlisted buffered events and reset clears", () => {
  resetJobEvents();
  emitJobEvent("job.claimed", { jobId: "j4", attempt: 1 });
  emitJobEvent("job.terminal", { jobId: "j4", attempt: 1, errorCode: "GEN-PROVIDER" });
  const collected = collectJobEvents();
  assert.equal(collected.length, 2);
  assert.equal((JSON.parse(collected[0]) as { event: string }).event, "job.claimed");
  assert.equal((JSON.parse(collected[1]) as { event: string }).event, "job.terminal");
  assert.equal(collectJobEvents().length, 2, "buffer survives reads until reset");
  resetJobEvents();
  assert.equal(collectJobEvents().length, 0);
});

test("gate reports are sanitized to status fields and issues without payload leakage", () => {
  const reports = sanitizeGateReports([{ briefId: "j-content-1:j-brief-1", factualStatus: "UNSUPPORTED", structuralStatus: "PASS", platformStatus: "PASS", varietyStatus: "PASS", decision: "REPAIR", issues: ["claim sem suporte em evidência"], script: "TOKEN_SEGREDO_script_nao_pode_aparecer", prompt: "x" }]);
  assert.equal(JSON.stringify(reports).includes("TOKEN_SEGREDO"), false);
  assert.deepEqual(Object.keys(reports[0]).sort().join(","), "briefId,claimType,decision,evidenceRefs,factualStatus,issues,platformStatus,structuralStatus,varietyStatus");
});

test("repair.completed and job.terminal carry allowlisted gateReports", () => {
  resetJobEvents();
  const { lines, restore } = capture();
  try {
    const reports = sanitizeGateReports([{ briefId: "j1-content-1:j1-brief-1", factualStatus: "UNSUPPORTED", structuralStatus: "PASS", platformStatus: "FAIL", varietyStatus: "PASS", decision: "REPAIR", issues: ["claim sem suporte em evidência"] }]);
    emitJobEvent("repair.completed", { jobId: "j1", attempt: 1, durationMs: 10, expected: 1, received: 1, retry: 0, gateReports: reports });
    emitJobEvent("job.terminal", { jobId: "j1", attempt: 1, errorCode: "GEN-REPAIR-EXHAUSTED", reservationAction: "RELEASED", expected: 1, received: 1, gateReports: reports });
    const parsed = lines.map((entry) => JSON.parse(entry.line) as Record<string, unknown>);
    assert.deepEqual((parsed[0].gateReports as Array<Record<string, unknown>>)[0].decision, "REPAIR");
    assert.deepEqual((parsed[1].gateReports as Array<Record<string, unknown>>)[0].factualStatus, "UNSUPPORTED");
    assert.equal(parsed[1].errorCode, "GEN-REPAIR-EXHAUSTED");
    assert.ok(!JSON.stringify(parsed).includes("TOKEN"));
  } finally { restore(); }
});
