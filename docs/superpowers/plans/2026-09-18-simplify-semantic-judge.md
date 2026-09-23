# Simplify Semantic Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the internal semantic Judge to `PASS|REVIEW` with one selective repair attempt, no re-Judge, original-part fallback, and `DRAFT` delivery whenever objective gates pass.

**Architecture:** Keep objective hard gates and deterministic Variety Gate as the only blocking authority. Keep semantic curation as an internal advisory layer over the five existing parts, using the existing Model Router and batch transport; repair only marked parts, then run objective validation without a second semantic Judge.

**Tech Stack:** TypeScript, Next.js monolith, Node test runner, existing Model Router/LLM provider adapter, existing contract validators and PostgreSQL-backed worker flow.

**Spec:** `docs/superpowers/specs/2026-09-18-simplify-semantic-judge-design.md`

## Global Constraints

- Semantic `QualityStatus` is exactly `"PASS" | "REVIEW"`; never add `REJECT`, `QUALITY_PENDING`, or a public warning/status.
- Judge evaluates `hook`, `development`, `script`, `cta`, and `scenes` once per content; batch identity is server-derived `contentId`.
- Repair runs only for parts marked `REVIEW`, at most once per marked part; parts marked `PASS` remain byte-for-byte unchanged.
- Do not call the Judge after repair; only objective hard gates are revalidated after composition.
- If repair fails, returns invalid schema, or cannot be applied, preserve the original part and continue with it.
- Hard gates remain blocking for schema, factual contradiction/unsupported claims, relation, cardinality, structure, platform, and deterministic variety.
- If objective gates pass, persist the Content as `DRAFT`, including when semantic repair falls back to the original part.
- Partial delivery is caused only by objective failure or objectively invalid composition; semantic `REVIEW` alone never creates a missing item.
- Remove `unsupported_persuasion` from semantic criteria/reasons and route factual claims through the hard gate only.
- Apply creator constraints (`recordsAlone`, equipment, support, restrictions) only when explicitly present; absent context imposes no inferred restriction.
- Preserve existing batch limits: Judge max 3; `hook`/`script`/`cta` repair max 3; `development` max 2; `scenes` max 1.
- Keep provider/model/tier selection behind the existing Model Router; do not add fallback tiers, capabilities, endpoints, UI, or dependencies.
- Do not change PRDs, architecture source documents, or any file outside the implementation files and focused tests listed below.

## Exact File Map

- Modify `src/modules/commerce-intelligence/semantic-quality.ts`: `QualityStatus`, `QUALITY_REASONS`, `QualityJudgment`, `QualityFailure`, `parseAuditParts`, `parseQualityAuditBatch`, `parseQualityRepairBatch`, `qualityPartsToRepair`, `projectQualityFailures`, `applyQualityRepair`, and batch constants.
- Modify `src/modules/commerce-intelligence/provider.ts`: `CONTENT_QUALITY_JUDGE_INSTRUCTION`, `CONTENT_PART_REPAIR_INSTRUCTION`, `INSTRUCTION`, and the semantic JSON schema/configuration used by the provider.
- Modify `src/modules/commerce-intelligence/engine.ts`: the first-generation curation block beginning at `validateCandidates`, the semantic judge/repair helpers around `judgeBatch` and `repairPartBatch`, final objective composition checks, and related telemetry fields.
- Modify `src/modules/commerce-intelligence/model-router.ts` only if the updated semantic task contract requires type-level wording; preserve `LogicalTask`, `ROUTER_MAP`, HIGH routing, and `ModelRouter` signatures.
- Modify focused tests: `semantic-quality.test.ts`, `engine.test.ts`, `engine-pipeline.test.ts`, `gates.test.ts`, `gates-negative.test.ts`, `gates-repair.test.ts`, `adr-025-evaluation.test.ts`, `regression-verdict.test.ts`, `locator-leak.test.ts`, `creator-context.test.ts`, `provider.test.ts`, `http-status.test.ts`, and `http-status.partial.test.ts` only where their assertions encode the superseded semantic contract.
- Do not modify `docs/superpowers/specs/2026-09-18-simplify-semantic-judge-design.md` or any other documentation during implementation.

## Execution Order and Checkpoints

### Task 1: Replace the semantic contract types and parsers

**Files:**
- Modify: `src/modules/commerce-intelligence/semantic-quality.ts:3-22,46-130`
- Test: `src/modules/commerce-intelligence/semantic-quality.test.ts:52-80`

**Interfaces:**
- Produces `QualityStatus = "PASS" | "REVIEW"`.
- Produces `QualityJudgment = { part: QualityPart; status: QualityStatus; criterion: QualityCriterion; reason: QualityReason }`.
- `parseQualityAuditBatch(value, expectedContentIds, round): QualityAudit[]` still requires the exact ID set and exactly five parts per audit.
- `parseQualityRepairBatch(value, expectedContentIds, part): Array<{ contentId: string; content: unknown }>` keeps exact batch identity validation.
- `qualityPartsToRepair(audit)` returns only judgments whose status is `REVIEW`.

- [ ] **Step 1: Update contract-focused tests.** Assert that `PASS` parses, `REVIEW` parses, `REJECT` is rejected as a schema value, `unsupported_persuasion` is rejected as a reason, and shuffled/duplicate/missing/extra `contentId` values still fail.
- [ ] **Step 2: Run the focused parser tests.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/semantic-quality.test.ts`
  Expected: new contract assertions fail only until the implementation changes; existing obsolete `REJECT` assertions identify exact follow-up edits.
- [ ] **Step 3: Change the allowlists and parser predicates.** Remove `unsupported_persuasion`; replace all semantic status checks with `PASS|REVIEW`; retain `meets_criteria` only for `PASS`.
- [ ] **Step 4: Make failure projection REVIEW-only.** `projectQualityFailures` must return review diagnostics without an `Exclude<..., "PASS">` type that admits a removed status.
- [ ] **Step 5: Keep replacement validation strict.** `applyQualityRepair` must validate the replacement shape for the selected part and never mutate or reconstruct unselected parts.
- [ ] **Step 6: Run the focused parser tests again.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/semantic-quality.test.ts`
  Expected: parser, allowlist, exact-ID, and replacement-shape assertions pass.
- [ ] **Step 7: Commit the contract-only change.**
  Run: `git add src/modules/commerce-intelligence/semantic-quality.ts src/modules/commerce-intelligence/semantic-quality.test.ts && git commit -m "feat(slice-003): simplify semantic judge contract"`

**Checkpoint:** Anvil reviews this contract diff and asks Lens to inspect type/API compatibility before proceeding. Lens must specifically check that no consumer can still construct a semantic `REJECT` or `unsupported_persuasion` value.

### Task 2: Align provider instructions and router-facing output contracts

**Files:**
- Modify: `src/modules/commerce-intelligence/provider.ts:155-184`
- Modify: `src/modules/commerce-intelligence/model-router.ts:3-27` only if required by the contract wording
- Test: `src/modules/commerce-intelligence/provider.test.ts`

**Interfaces:**
- `CONTENT_QUALITY_JUDGE` receives homogeneous `items` and returns `{ audits: [{ contentId, parts }] }` with exactly five parts and statuses `PASS|REVIEW`.
- `CONTENT_PART_REPAIR` receives homogeneous same-part `items` and returns `{ items: [{ contentId, content }] }`.
- Both tasks remain HIGH through `ROUTER_MAP`; no new logical task or provider fallback is introduced.

- [ ] **Step 1: Add provider contract assertions.** Exercise the instruction/schema path and assert the emitted semantic contract names `PASS|REVIEW`, says repair is limited to marked parts, and contains neither `unsupported_persuasion` nor a `REJECT` output option.
- [ ] **Step 2: Run provider-focused tests.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/provider.test.ts`
  Expected: new assertions fail against the old instruction text.
- [ ] **Step 3: Rewrite the Judge instruction.** Require one initial, independent per-content/per-part evaluation; judge only Product coherence, declared creator style/configuration, platform fit, clarity, and practical execution; use `PASS` or `REVIEW` only; do not re-evaluate factual authority.
- [ ] **Step 4: Rewrite the repair instruction.** Require only the selected part, preserve all other parts, accept declared creator context only, and describe one repair attempt with original fallback owned by the engine.
- [ ] **Step 5: Preserve exact-ID/cardinality output requirements.** Keep batch limits and structured output shape unchanged except for the status/reason allowlists.
- [ ] **Step 6: Run provider-focused tests again.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/provider.test.ts`
  Expected: instruction/schema and HIGH-routing assertions pass.

**Checkpoint:** Anvil asks Lens to review prompt/contract alignment, especially that factual claims remain hard-gate-owned and that no instruction implies a second Judge or fallback tier.

### Task 3: Rewrite engine orchestration to one Judge pass and one selective repair

**Files:**
- Modify: `src/modules/commerce-intelligence/engine.ts:1654-1781,1823-2040`
- Test: `src/modules/commerce-intelligence/semantic-quality.test.ts:82-171`
- Test: `src/modules/commerce-intelligence/engine-pipeline.test.ts:44-52`

**Interfaces:**
- Initial objective validation continues to produce the hard-valid candidate set before semantic curation.
- `judgeBatch(indices, 0)` is the only semantic Judge invocation for each hard-valid candidate.
- `repairPartBatch(pending, part, 0, modified)` receives only `REVIEW` judgments and preserves batch limits.
- Repair failures are isolated per part/item, leave the original value in place, and do not mark the content missing solely because semantic repair failed.
- Final objective validation is the only post-repair validation that can block delivery.

- [ ] **Step 1: Replace obsolete tests.** Change tests that expect two global semantic rounds, re-Judge calls, terminal semantic rejection, or missing items from unresolved Judge status. Add behavior assertions for one initial Judge, one repair per REVIEW part, and no second Judge call.
- [ ] **Step 2: Run the curation-focused tests to capture failures.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/semantic-quality.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts`
  Expected: old orchestration assertions fail before the engine change.
- [ ] **Step 3: Remove global repair-round state.** Delete the `maxRepairs` environment-driven semantic loop and replace it with a single repair pass over the initial audit's `REVIEW` parts.
- [ ] **Step 4: Keep only REVIEW pending work.** Replace filters for `decision === "REPAIR" || decision === "REJECT"` and semantic non-PASS checks with the new `QualityStatus` contract. Objective hard-gate failures remain in their existing separate path.
- [ ] **Step 5: Repair by marked part only.** Batch pending repairs by `QualityPart`; call `CONTENT_PART_REPAIR` once for each batch; apply only the returned part after individual validation; leave the original on provider/schema/application error.
- [ ] **Step 6: Remove semantic re-Judge.** Delete the modified-set re-Judge call and any loop condition based on pending semantic audits. Preserve the initial audit for internal telemetry only.
- [ ] **Step 7: Preserve objective composition protection.** Keep final hard-gate/scene/variety validation after repair. If it fails, use the existing objective failure/partial contract; if it passes, do not convert semantic REVIEW/fallback into a missing item.
- [ ] **Step 8: Set result semantics.** Ensure every objectively valid candidate reaches final persistence as `DRAFT`; semantic repair outcome may be recorded as applied or fallback, never as a public warning/status.
- [ ] **Step 9: Run the curation-focused tests again.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/semantic-quality.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts`
  Expected: PASS direct, REVIEW repair once, PASS preservation, no re-Judge, fallback, and objective-blocking assertions pass.

**Checkpoint:** Anvil asks Lens to review the engine diff before broader test updates. Lens must trace every path from initial hard gate through Judge, repair, final objective gate, and `DRAFT` persistence; reject any remaining semantic path that creates a missing item or calls Judge twice.

### Task 4: Update engine/gate regression tests for the new boundary

**Files:**
- Modify: `src/modules/commerce-intelligence/engine.test.ts`
- Modify: `src/modules/commerce-intelligence/gates.test.ts`
- Modify: `src/modules/commerce-intelligence/gates-negative.test.ts`
- Modify: `src/modules/commerce-intelligence/gates-repair.test.ts`
- Modify: `src/modules/commerce-intelligence/adr-025-evaluation.test.ts`
- Modify: `src/modules/commerce-intelligence/regression-verdict.test.ts`
- Modify: `src/modules/commerce-intelligence/locator-leak.test.ts`
- Modify: `src/modules/commerce-intelligence/creator-context.test.ts`

**Interfaces:**
- Deterministic gates continue to assert `SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED`, and `CONTRADICTED` behavior independently of semantic Judge status.
- Semantic fixtures use only `PASS|REVIEW` and never use `unsupported_persuasion`.
- Regression evidence records one Judge pass, at most one repair per marked part, no semantic re-Judge, and delivery as `DRAFT` when objective gates pass.

- [ ] **Step 1: Update direct Judge fixtures.** Replace semantic `REJECT` fixtures with `REVIEW` where the issue is subjective/repairable; keep contradictory factual claims in hard-gate fixtures and assert objective blocking there.
- [ ] **Step 2: Add the four required behavior cases.** Cover: all PASS means zero repair and direct DRAFT; one REVIEW repairs only that part; PASS parts remain unchanged; repair provider error/schema/inapplicability preserves the original and still allows DRAFT when objective gates pass.
- [ ] **Step 3: Update batching assertions.** Preserve exact `contentId` identity, batch limits, sibling isolation, and malformed-batch isolation without expecting another Judge pass.
- [ ] **Step 4: Update factual/creator-context assertions.** Confirm declared `recordsAlone`/equipment/restrictions affect objective/semantic context only when present; confirm unsupported/contradicted claims remain objective failures and cannot be authorized by repair.
- [ ] **Step 5: Update ADR-025 regression expectations.** Assert reduced transport calls without zero-REJECT or two-round semantics; assert objective partial only and DRAFT delivery for objective-pass content.
- [ ] **Step 6: Run the focused regression set.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/engine.test.ts src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/gates-negative.test.ts src/modules/commerce-intelligence/gates-repair.test.ts src/modules/commerce-intelligence/adr-025-evaluation.test.ts src/modules/commerce-intelligence/regression-verdict.test.ts src/modules/commerce-intelligence/locator-leak.test.ts src/modules/commerce-intelligence/creator-context.test.ts`
  Expected: all focused semantic/objective boundary tests pass.

**Checkpoint:** Anvil asks Lens for a test-quality review. Lens checks that each test proves consumer-visible behavior or an objective invariant, not implementation names, call counts alone, or source text.

### Task 5: Align status projection and HTTP-facing assertions

**Files:**
- Modify: `src/modules/commerce-intelligence/http-status.ts` only if semantic diagnostics leak into status projection
- Modify: `src/modules/commerce-intelligence/http-status.test.ts`
- Modify: `src/modules/commerce-intelligence/http-status.partial.test.ts`
- Test: `src/modules/commerce-intelligence/provider-config.test.ts` only if provider error classification is affected

**Interfaces:**
- No semantic `REVIEW`/repair fallback appears as public status, warning, badge, or `QUALITY_PENDING`.
- `SUCCEEDED` and `SUCCEEDED_PARTIAL` projections remain driven by objective delivery rules and preserve sanitized objective failure reasons.
- No new HTTP status or public enum is added.

- [ ] **Step 1: Add projection assertions.** Serialize results containing semantic REVIEW/fallback metadata and assert the public payload exposes normal `DRAFT` content with no semantic status or warning.
- [ ] **Step 2: Run status-focused tests.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/http-status.test.ts src/modules/commerce-intelligence/http-status.partial.test.ts`
  Expected: assertions fail only where old semantic rejection/diagnostic exposure is still encoded.
- [ ] **Step 3: Remove any semantic status mapping.** Keep only sanitized objective missing-item reasons; do not map REVIEW to a public reason code.
- [ ] **Step 4: Run status-focused tests again.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/http-status.test.ts src/modules/commerce-intelligence/http-status.partial.test.ts`
  Expected: public payload tests pass with no new status or warning.

**Checkpoint:** Anvil asks Lens to inspect public contract safety and verify that no semantic diagnostics, provider payload, or new status escapes to the API/UI projection.

### Task 6: Final focused verification and implementation handoff

**Files:**
- No new files.
- Review only the implementation files and focused tests listed above.

- [ ] **Step 1: Run the complete focused semantic set.**
  Run: `node --test --import tsx src/modules/commerce-intelligence/semantic-quality.test.ts src/modules/commerce-intelligence/engine.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/gates-negative.test.ts src/modules/commerce-intelligence/gates-repair.test.ts src/modules/commerce-intelligence/adr-025-evaluation.test.ts src/modules/commerce-intelligence/regression-verdict.test.ts src/modules/commerce-intelligence/locator-leak.test.ts src/modules/commerce-intelligence/creator-context.test.ts src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/http-status.test.ts src/modules/commerce-intelligence/http-status.partial.test.ts`
  Expected: focused semantic/objective boundary suite passes.
- [ ] **Step 2: Search implementation for forbidden active semantics.**
  Run: `grep` via the repository search tool for `unsupported_persuasion|QUALITY_PENDING|status.*REJECT|decision.*REJECT|re-Judge|round <= 2|GENERATION_MAX_REPAIRS` under `src/modules/commerce-intelligence`.
  Expected: no active semantic Judge/repair contract or orchestration path contains those terms; unrelated objective error wording must be reviewed rather than blindly removed.
- [ ] **Step 3: Verify objective and DRAFT behavior with a focused smoke scenario.** Exercise one all-PASS fixture, one REVIEW fixture with a successful repair, and one REVIEW fixture whose repair throws; assert all objective-pass results are `DRAFT`, PASS parts are unchanged, and Judge call count is one per initial batch.
- [ ] **Step 4: Run formatting/type checks limited to changed code.**
  Run: `npx tsc --noEmit` and the repository's configured lint command only if required by the implementation workflow; do not run an unrelated broad suite during this plan's focused verification.
- [ ] **Step 5: Commit the implementation.**
  Run: `git add src/modules/commerce-intelligence && git commit -m "feat(slice-003): simplify semantic judge flow"`

**Final Checkpoint:** Anvil requests Lens's final review after implementation. Lens signs off only if the diff proves: objective gates still block, semantic Judge is PASS/REVIEW, repair is selective and single-pass, original fallback works, no re-Judge exists, and objective-pass content is DRAFT without warnings or new statuses.

## Self-Review Against Approved Spec

- **Contract:** Task 1 removes semantic REJECT and unsupported persuasion while preserving exact batch identity and five-part shape.
- **Evaluation:** Task 3 enforces one initial Judge pass; Task 4 proves PASS direct, REVIEW repair once, untouched PASS parts, and no re-Judge.
- **Fallback:** Tasks 3 and 4 preserve original parts on provider/schema/application failure.
- **Objective authority:** Tasks 3 and 4 keep factual, structural, relation, cardinality, scene, platform, and variety hard gates blocking; semantic REVIEW never becomes partial.
- **Delivery:** Tasks 3 and 5 keep objectively valid results as `DRAFT` without warning, badge, or new status.
- **Context constraints:** Task 4 verifies declared-only creator constraints; absent context is not treated as a restriction.
- **Batching/router:** Task 2 preserves existing logical tasks, HIGH routing, homogeneous batches, and no new fallback.
- **Scope:** No PRD, UI, new capability, provider, dependency, or documentation change is planned; source implementation and focused tests only.
- **Placeholder scan:** No TBD/TODO, unspecified file, invented symbol, or generic “handle edge cases” step remains; all tasks name files, symbols, contracts, commands, and expected outcomes.
