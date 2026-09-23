# Commerce Intelligence Deterministic Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move server-owned constraints and redundant metadata out of LLM decisions while preserving creative product interpretation, copy, hooks, scripts, scenes, and semantic judgment.

**Architecture:** Add a deterministic plan skeleton that allocates count, stable identities, ordering, eligible hook/CTA buckets, and variety ceilings; the LLM still fills commercial and creative plan fields within those constraints. Keep scene ideation, brief generation, and semantic judgment in the LLM; use deterministic validation, evidence authorization, canonicalization of redundant bullet fields, and narrow repair targeting around them.

**Tech Stack:** TypeScript, Node test runner, Next.js, Prisma, existing Model Router/provider adapter, existing Commerce Intelligence engine/gates.

**Spec:** `docs/superpowers/specs/2026-09-19-commerce-intelligence-deterministic-pipeline-design.md`

## Global Constraints

- Preserve `DevelopmentBullet[]` as the production persistence contract; historical string arrays remain read-only/versioned only.
- LLM-generated creative text remains LLM-owned: angle, hook, bullet text, CTA wording, script, scene ideas, and semantic variation.
- Server owns count, IDs, ordering, eligible buckets, evidence authorization, schema, cardinality, CTA actionability, connectors, variety ceilings, persistence, quota, and retry orchestration.
- `factRefs` are model proposals validated against the authorized evidence catalog; code MUST NOT infer a reference from lexical overlap and attach it silently.
- Do not introduce a deterministic scene catalog or scene fallback; scene ideation remains `CONTENT_SCENE_IDEAS`.
- Repair é seletivo e único por parte `REVIEW`; falha preserva a parte original, sem re-Judge.
- Do not merge `STRATEGY_SYNTHESIS` into opportunity mapping in this plan.
- Do not expose provider, model, tier, prompt, raw payload, or internal metadata to creators.
- No new provider, dependency, UI workflow, embedding, semantic-memory, or product-import behavior.

---

### Task 1: Record the deterministic plan skeleton

**Files:**
- Create: `src/modules/commerce-intelligence/planner.ts`
- Create: `src/modules/commerce-intelligence/planner.test.ts`
- Modify: `src/modules/commerce-intelligence/contract.ts:208-209`
- Modify: `src/modules/commerce-intelligence/engine.ts:194-385,1349-1434`
- Modify: `src/modules/commerce-intelligence/provider.ts:104-146,178-180`
- Test: `src/modules/commerce-intelligence/engine-pipeline.test.ts`

**Interfaces:**
- Produces `PLAN_POLICY_VERSION = 1` for internal provenance.
- Produces `buildPlanSkeleton(input: { jobId: string; productId: string; targetContentCount: number; deliverableHookMechanisms: readonly string[]; memory: Record<string, unknown> }): { policyVersion: number; slots: Array<{ position: number; contentId: string; opportunityId: string; eligibleHookMechanisms: string[]; maxPerBucket: number }> }`.
- The provider receives `slots` plus strategy/creator context and returns only creative plan fields per slot: `commercialObjective`, `angle`, `coreMessage`, `hookMechanism`, and `noveltyTargets`.
- The engine injects server-owned `id`, `productId`, `strategyVersion`, `targetContentCount`, `platformId`, and `platformSkillVersion` after validating the returned creative fields.

- [ ] **Step 1: Write the failing planner tests**

Add tests covering:

```ts
const skeleton = buildPlanSkeleton({
  jobId: "job-1",
  productId: "product-1",
  targetContentCount: 5,
  deliverableHookMechanisms: ["demo", "proof", "comparison"],
  strategy,
  memory: {},
});
assert.deepEqual(skeleton.slots.map((slot) => slot.position), [1, 2, 3, 4, 5]);
assert.deepEqual(skeleton.slots.map((slot) => slot.contentId), [
  "job-1-content-1",
  "job-1-content-2",
  "job-1-content-3",
  "job-1-content-4",
  "job-1-content-5",
]);
assert.ok(skeleton.slots.every((slot) => slot.maxPerBucket === Math.ceil(5 / 3)));
```

Also cover stable output for identical inputs, eligible-bucket filtering, memory exclusions, and fail-closed behavior when no deliverable mechanism exists.

- [ ] **Step 2: Run the focused planner test and verify it fails**

Run: `npx tsx --test src/modules/commerce-intelligence/planner.test.ts`

Expected: FAIL because `planner.ts` and `buildPlanSkeleton` do not exist.

- [ ] **Step 3: Implement the minimum deterministic skeleton**

Implement only slot allocation and provenance. Sort eligible mechanisms using the existing stable catalog order, compute `maxPerBucket = Math.ceil(targetContentCount / bucketCount)`, preserve server-derived positions/IDs, and apply existing memory constraints without inventing a mechanism. Return an explicit `GEN-PATTERN`/`GEN-VARIETY` contract error when no eligible mechanism can satisfy the target.

Update the plan context so the provider sees the slot constraints and still chooses the semantic mechanism only from each slot’s allowlisted eligible set. Keep the existing plan retry policy unchanged.

- [ ] **Step 4: Remove server-owned plan fields from the provider response**

Change `CONTENT_PLAN_JSON_SCHEMA_FORMAT` and `CONTENT_PLAN_GENERATION` instructions so `platformId`, IDs, target count, strategy version, and other server metadata are not provider fields. Keep the creative fields and require `hookMechanism` to be one of the slot’s allowlisted mechanisms. Validate the exact returned item count and inject server fields in `engine.ts`.

- [ ] **Step 5: Run planner, contract, provider, and pipeline tests**

Run: `npx tsx --test src/modules/commerce-intelligence/planner.test.ts src/modules/commerce-intelligence/contract.test.ts src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts`

Expected: PASS; the pipeline records server-derived IDs and plan policy version while retaining creative plan output.

- [ ] **Step 6: Commit the isolated plan-skeleton change**

```bash
git add src/modules/commerce-intelligence/planner.ts src/modules/commerce-intelligence/planner.test.ts src/modules/commerce-intelligence/contract.ts src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/provider.ts src/modules/commerce-intelligence/engine-pipeline.test.ts
git commit -m "feat(ci): add deterministic plan skeleton"
```

---

### Task 2: Canonicalize redundant development fields

**Files:**
- Modify: `src/modules/commerce-intelligence/gates.ts:597-655` (development parsing and diagnostics)
- Modify: `src/modules/commerce-intelligence/contract.ts:25-32,210-247`
- Modify: `src/modules/commerce-intelligence/engine.ts:432-450`
- Modify: `src/modules/commerce-intelligence/provider.ts:153-158`
- Test: `src/modules/commerce-intelligence/gates.test.ts`
- Test: `src/modules/commerce-intelligence/engine-pipeline.test.ts`
- Test: `src/modules/commerce-intelligence/http-status.partial.test.ts`

**Interfaces:**
- Provider-facing development item requires creative `text`, proposed `factRefs`, and bullet `cta`; `action` and `rationale` are canonicalized from accepted `text` when derivable.
- `parseStructuredDevelopment` returns the persisted `DevelopmentBullet[]` with canonical `action` and `rationale`, preserving the existing `factRefs` authorization and bullet CTA validation.
- `briefPayloadForPersistence` continues to persist only complete v2 `DevelopmentBullet[]` aligned with projected `development` strings.

- [ ] **Step 1: Add failing parser tests**

Add cases proving that a provider bullet with valid connector-bearing `text` but omitted `action`/`rationale` is normalized to the canonical action and post-connector rationale, while text with no derivable action/connector still fails closed with `GEN-SCHEMA`. Keep explicit rejection for unauthorized `factRefs` and unsupported claims.

- [ ] **Step 2: Run the focused gate tests and verify the new cases fail**

Run: `npx tsx --test src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts`

Expected: the new normalization cases fail before implementation; all existing regressions remain visible.

- [ ] **Step 3: Implement canonical derivation without inventing semantics**

Derive `action` only from the validated leading communication stem in `text`. Derive `rationale` only from the existing connector-bearing suffix in `text`. Preserve the provider-proposed `factRefs` and bullet CTA as inputs that still require deterministic validation. Do not derive evidence refs from text and do not fabricate a rationale when no connector exists.

- [ ] **Step 4: Remove duplicate action/rationale obligations from provider instructions**

Update brief generation and repair instructions to make `text` the creative source and `factRefs`/`cta` the proposed structured metadata; state that the server canonicalizes action/rationale. Keep strict item count, bullet count, fact grounding, CTA support, and all factual restrictions.

- [ ] **Step 5: Verify raw v2 persistence and creator projection**

Extend `http-status.partial.test.ts` to assert that raw persistence receives canonical `DevelopmentBullet[]` with `text`, `action`, `rationale`, `factRefs`, and `cta`, while creator-facing projection remains the approved sanitized string representation. Assert historical v1 strings remain read-only and never enter new generation.

- [ ] **Step 6: Run focused contract and persistence tests**

Run: `npx tsx --test src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/contract.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/http-status.partial.test.ts`

Expected: PASS with no relaxation of factual, grounding, CTA, or cardinality gates.

- [ ] **Step 7: Commit the canonical bullet change**

```bash
git add src/modules/commerce-intelligence/gates.ts src/modules/commerce-intelligence/contract.ts src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/provider.ts src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/http-status.partial.test.ts
git commit -m "feat(ci): canonicalize structured development fields"
```

---

### Task 3: Narrow repair targeting without changing creative quality policy

**Files:**
- Modify: `src/modules/commerce-intelligence/engine.ts:388-430,1056-1119,1450-2303`
- Modify: `src/modules/commerce-intelligence/provider.ts:157-162`
- Modify: `src/modules/commerce-intelligence/worker.ts:74-158`
- Test: `src/modules/commerce-intelligence/engine-pipeline.test.ts`
- Test: `src/modules/commerce-intelligence/engine.test.ts`
- Test: `src/modules/commerce-intelligence/worker.test.ts`

**Interfaces:**
- Repair ocorre no máximo uma vez para cada parte marcada `REVIEW`.
- Repair context contém somente o `contentId` falho, índices de bullet/part, causas sanitizadas de gate, evidência autorizada, pattern seguro selecionado e resumo determinístico dos irmãos.
- Partes/bullets `PASS` nunca entram em `CONTENT_BRIEF_REPAIR` ou `CONTENT_PART_REPAIR`; falha de repair preserva a parte original.
- Judge semântico permanece uma avaliação inicial em batch antes do repair seletivo; não há re-Judge.

- [ ] **Step 1: Add regression assertions for narrow repair context**

Extend existing engine tests to assert that a mixed batch sends only posições/partes `REVIEW` to repair, includes no raw rejected payload or provider metadata, preserves passing content byte-for-byte, and retains the original part when repair is invalid.

- [ ] **Step 2: Run repair tests and verify the new assertions fail where broad context remains**

Run: `npx tsx --test src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/engine.test.ts src/modules/commerce-intelligence/worker.test.ts`

Expected: any remaining broad repair context or passing-part mutation is reported before implementation.

- [ ] **Step 3: Narrow repair orchestration**

Construct repair requests from deterministic failed indexes and allowlisted evidence only. Keep scene ideas and creative wording provider-generated. Repair each `REVIEW` part once, preserve the original when repair is invalid, revalidate only hard gates, and do not add fallback content, re-Judge, semantic rejection state, or retry round.

- [ ] **Step 4: Preserve sanitized failure diagnostics**

Ensure worker metadata stores only fixed gate codes, positions, and allowlisted diagnostics. Keep raw gate debugging disabled by default and never expose it through creator-facing APIs.

- [ ] **Step 5: Run focused repair and worker tests**

Run: `npx tsx --test src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/engine.test.ts src/modules/commerce-intelligence/worker.test.ts src/modules/commerce-intelligence/observability.test.ts`

Expected: PASS; approved content remains unchanged and failure metadata remains sanitized.

- [ ] **Step 6: Commit the narrow repair change**

```bash
git add src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/provider.ts src/modules/commerce-intelligence/worker.ts src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/engine.test.ts src/modules/commerce-intelligence/worker.test.ts
 git commit -m "feat(ci): narrow repair targets"
```

---

### Task 4: Persist policy provenance and update canonical architecture documents

**Files:**
- Create: `docs/architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md`
- Modify: `docs/architecture/SYSTEM-DESIGN.md:122-143,200-210`
- Modify: `docs/specs/slice-003/SPEC.md:72-76,116-123,149-173`
- Modify: `src/modules/commerce-intelligence/engine.ts:150-173`
- Modify: `src/modules/commerce-intelligence/worker.ts:111-158`
- Test: `src/modules/commerce-intelligence/provenance.test.ts`
- Test: `src/modules/commerce-intelligence/history-cost.test.ts`

**Interfaces:**
- `IntelligenceRun.metadata` records `planPolicyVersion`, `gatePolicyVersion`, and the existing engine/skill versions internally.
- Creator-facing generation/history responses remain unchanged except for already-approved sanitized job, usage, cost, and diagnostic fields.
- ADR-029 records the hybrid boundary, rejected deterministic-scene fallback, `PASS|REVIEW` semantic batching, single selective repair, no re-Judge, and measurement criteria.

- [ ] **Step 1: Add failing provenance tests**

Assert that a completed engine result carries `planPolicyVersion`, that worker persistence includes it in internal metadata, and that the value is absent from creator-facing projections.

- [ ] **Step 2: Run provenance tests and verify they fail**

Run: `npx tsx --test src/modules/commerce-intelligence/provenance.test.ts src/modules/commerce-intelligence/history-cost.test.ts`

Expected: the new policy-version assertions fail before persistence wiring exists.

- [ ] **Step 3: Persist internal plan provenance**

Add the server-derived plan policy version to `EngineResult` and the existing internal `IntelligenceRun` metadata path. Do not add provider/model/tier/raw prompt data to creator responses.

- [ ] **Step 4: Write ADR-029 and align canonical slice/system documents**

Record the approved boundary: deterministic plan skeleton and gates; LLM-owned creative plan fields, briefs, scenes, and semantic judge; canonicalized redundant bullet fields; single selective repair; no deterministic scene generator, `QUALITY_PENDING`, semantic `REJECT`, re-Judge, or Strategy/mapping merge. Update only the affected clauses in `SYSTEM-DESIGN.md` and slice-003 `SPEC.md`; do not rewrite unrelated product or architecture sources.

- [ ] **Step 5: Run provenance and contract tests**

Run: `npx tsx --test src/modules/commerce-intelligence/provenance.test.ts src/modules/commerce-intelligence/history-cost.test.ts src/modules/commerce-intelligence/http-status.test.ts`

Expected: PASS with internal provenance retained and creator projection sanitized.

- [ ] **Step 6: Commit documentation and provenance together**

```bash
git add docs/architecture/adr-027-publicacao-quality-pending.md docs/architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md docs/architecture/SYSTEM-DESIGN.md docs/specs/slice-003/SPEC.md src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/worker.ts src/modules/commerce-intelligence/provenance.test.ts src/modules/commerce-intelligence/history-cost.test.ts
git commit -m "feat(ci): record deterministic pipeline boundary"
```

---

### Task 5: Run full verification and compare the new path

**Files:**
- Modify only files required by preceding tasks if a verification failure exposes a contract regression.
- Test: existing Commerce Intelligence test files; no new production UI workflow.

- [ ] **Step 1: Run the complete Commerce Intelligence test set**

Run:

```bash
npx tsx --test src/modules/commerce-intelligence/*.test.ts
```

Expected: all existing and new deterministic-boundary, structured-persistence, repair-isolation, provenance, cost, and projection tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no new warnings treated as errors.

- [ ] **Step 4: Run production build**

Run: `npx next build`

Expected: exit code 0.

- [ ] **Step 5: Compare baseline and new-path measurements**

Use the existing `IntelligenceRun` usage/cost/latency and diagnostics to compare equivalent jobs by success rate, delivered count, fact grounding, CTA validity, hook variety, scene quality, semantic quality, provider calls, repair calls, cost, and latency. Do not claim savings or quality improvement without observed values.

- [ ] **Step 6: Reconcile any verification fix inside its owning task**

If a verification command exposes a regression, update only the files named by the failing task, rerun that task's focused command, and commit the fix with the same task's commit scope. Do not create a catch-all verification commit or stage unrelated changes.

Do not add unrelated refactors, provider changes, new UI surfaces, or scene templates while closing verification failures.
