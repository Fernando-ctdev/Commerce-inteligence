# Brief Quality Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make initial brief generation, brief repair and deterministic gates consume one structured `development` contract, so invalid bullet shape is rejected before publication and failures are diagnosable without storing raw drafts.

**Architecture:** `gates.ts` remains the single source for development predicates and exports the structured-contract validator. `engine.ts` uses it to project validated text for both initial generation and repair, then still calls `validateBriefSet` as the final authority. Provider instructions request the same structure in both tasks; metadata receives only redacted per-bullet diagnostics.

**Tech Stack:** TypeScript strict, Node `tsx --test`, existing Model Router/provider adapter, PostgreSQL JSON metadata without migration.

**Spec:** `docs/superpowers/specs/2026-09-18-brief-quality-contract-design.md`

## Global Constraints

- No gate is reduced, bypassed or reclassified; `validateBriefSet` remains the final factual/structural/variety authority.
- `ContentBriefVersion.development` remains `string[]`; structured bullets are ephemeral provider-contract input/output.
- Provider output is untrusted. `factRef`, action, connector, grounding and canonical text must be validated server-side.
- Diagnostics persist only index, booleans, enums and counts. Never persist draft text, prompt, provider body, facts, tokens or secrets.
- Preserve server-derived IDs, exact-N, per-item repair, current repair limits, partial-generation rules, provider/tier routing and quota behavior.
- No database migration, endpoint, UI, feature flag, new provider or model change.

---

### Task 1: Define the canonical structured development contract

**Files:**
- Modify: `src/modules/commerce-intelligence/gates.ts: DEVELOPMENT_ACTION_STEMS through validateBriefSet`
- Modify: `src/modules/commerce-intelligence/engine.ts: developmentRequirements and parseStructuredRepairDraft`
- Modify: `src/modules/commerce-intelligence/gates.test.ts`
- Modify: `src/modules/commerce-intelligence/engine-pipeline.test.ts`

**Interfaces:**

```ts
export type DevelopmentBullet = {
  text: string;
  action: string;
  factRef: string;
  rationale: string;
};
export type DevelopmentBulletDiagnostic = {
  index: number;
  actionPresent: boolean;
  factRefAllowed: boolean;
  connectorPresent: boolean;
  textGroundingMatched: number;
  rationaleGroundingMatched: number;
  shotList: boolean;
  unverifiedClaim: boolean;
};
export function developmentRequirements(evidence: EvidenceSnapshot): {
  allowedActionStems: readonly string[];
  connectors: readonly string[];
  factRefs: Array<{ ref: string; value: string; terms: string[] }>;
  noShotList: true;
  minGrounding: { factTermsInPoint: 2; factTermsInRationale: 2; contextTerms: 1 };
};
export function parseStructuredDevelopment(
  value: unknown,
  evidence: EvidenceSnapshot,
): { texts: string[]; diagnostics: DevelopmentBulletDiagnostic[] };
```

- [ ] **Step 1: Write failing gate tests for accepted and rejected bullet objects.** Cover a valid bullet, `product:name`/unknown `factRef`, invalid action, missing connector, feature/shot list, insufficient grounding and unsupported factual claim. Assert diagnostics contain only index/flags/counts and no input text.

```ts
const parsed = parseStructuredDevelopment([
  { text: "Destaque o cetim para conectar o cetim ao cuidado do cabelo", action: "Destaque", factRef: "fact:features:1", rationale: "para conectar o cetim ao cuidado do cabelo" },
], evidence);
assert.deepEqual(parsed.texts, ["Destaque o cetim para conectar o cetim ao cuidado do cabelo"]);
assert.equal(parsed.diagnostics[0]?.factRefAllowed, true);
```

- [ ] **Step 2: Run the focused test and confirm it fails because the exported contract does not exist.**

```bash
npx tsx --test src/modules/commerce-intelligence/gates.test.ts
```

- [ ] **Step 3: Move the existing development requirements construction from `engine.ts` into `gates.ts`; implement `parseStructuredDevelopment` from the existing gate primitives.** Reuse `DEVELOPMENT_ACTION_STEMS`, `DEVELOPMENT_CONNECTORS`, `developmentGroundingTerms`, `diagnoseDevelopmentPoint`, `validDevelopmentPoint` and factual classifiers. Reject invalid bullets with `ContractError("GEN-SCHEMA", ..., "development")`; never repair or coerce them.

- [ ] **Step 4: Replace `parseStructuredRepairDraft` with a shared whole-draft parser in `engine.ts`.** It calls `parseStructuredDevelopment`, projects only `texts` into `ContentBriefDraft`, then runs `validateContentBriefDraft`. Both initial generator items and `CONTENT_BRIEF_REPAIR` use that parser; remove duplicate development validation from `engine.ts`.

- [ ] **Step 5: Run focused contract/pipeline tests.**

```bash
npx tsx --test src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts
```

- [ ] **Step 6: Commit the contract change.**

```bash
git add src/modules/commerce-intelligence/gates.ts src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts
git commit -m "fix(slice-003): unify brief development contract"
```

---

### Task 2: Align generator and repair provider contracts

**Files:**
- Modify: `src/modules/commerce-intelligence/provider.ts: CONTENT_BRIEF_GENERATION_INSTRUCTION, CONTENT_BRIEF_REPAIR_INSTRUCTION`
- Modify: `src/modules/commerce-intelligence/provider.test.ts`
- Modify: `src/modules/commerce-intelligence/engine-pipeline.test.ts`

**Interfaces:**

`CONTENT_BRIEF_GENERATION` returns `{ items: Array<{ angle, hook, development: DevelopmentBullet[], script, cta }> }`. `CONTENT_BRIEF_REPAIR` returns `{ angle, hook, development: DevelopmentBullet[], script, cta }`. Both receive the same server-derived `developmentRequirements`; only repair receives its own redacted `developmentDiagnostics` and `repairChecklist`.

- [ ] **Step 1: Write failing instruction/engine tests.** Assert both instructions require `text`, `action`, `factRef`, `rationale`; forbid locators in creator text; require factual grounding through terms rather than writing refs. Assert the initial generator receives requirements and repair receives requirements plus only its own diagnostic array.

- [ ] **Step 2: Run the focused tests and confirm the initial generator still accepts string bullets.**

```bash
npx tsx --test src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts
```

- [ ] **Step 3: Change both instructions to the shared structured schema.** Keep root cardinality, selected hook/CTA behavior, exact-N and scene boundary unchanged. Require `factRef` only as a structured field and prohibit refs/locators in `text`, `script`, `hook` and `cta`.

- [ ] **Step 4: Change `generateBatch` validation in `engine.ts`.** Validate each provider item through the shared parser before `assignServerBriefIds`; a malformed structured bullet becomes existing `GEN-SCHEMA` batch retry, never a late hard-gate repair.

- [ ] **Step 5: Change per-item `repairContext`.** Add `developmentDiagnostics` derived only from the rejected candidate. Do not send `previousBrief`, rejected sibling text, raw provider output or another Product's context.

- [ ] **Step 6: Run focused provider/pipeline tests.**

```bash
npx tsx --test src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts
```

- [ ] **Step 7: Commit provider contract alignment.**

```bash
git add src/modules/commerce-intelligence/provider.ts src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/engine-pipeline.test.ts
git commit -m "fix(slice-003): align brief generation and repair"
```

---

### Task 3: Persist redacted failure diagnostics

**Files:**
- Modify: `src/modules/commerce-intelligence/contract.ts: FailedItemDiagnostic`
- Modify: `src/modules/commerce-intelligence/engine.ts: diagnoseFailure and terminal diagnostics construction`
- Modify: `src/modules/commerce-intelligence/worker.ts: IntelligenceRun metadata projection`
- Modify: `src/modules/commerce-intelligence/worker.test.ts`
- Modify: `src/modules/commerce-intelligence/worker-fence.test.ts`

**Interfaces:**

```ts
type FailedItemDiagnostic = {
  contentId: string;
  position: number;
  reason: "HARD_GATE" | "COMPOSITION";
  checkCodes: PartialFailureCheckCode[];
  issues: string[];
  developmentDiagnostics?: DevelopmentBulletDiagnostic[];
};
```

- [ ] **Step 1: Write failing persistence tests.** Drive a failed development bullet through the worker and assert `IntelligenceRun.metadata` contains its sanitized diagnostic. Assert JSON serialization does not contain a sentinel draft phrase, prompt, `relevantFacts` value, API key or provider response text.

- [ ] **Step 2: Run the focused worker tests and confirm the new field is absent.**

```bash
npx tsx --test src/modules/commerce-intelligence/worker.test.ts src/modules/commerce-intelligence/worker-fence.test.ts
```

- [ ] **Step 3: Extend `diagnoseFailure` to attach `DevelopmentBulletDiagnostic[]` only when development is implicated.** Keep existing `checkCodes` and sanitized issue list for backward compatibility. Do not add raw drafts to job metadata or logs.

- [ ] **Step 4: Preserve fenced/idempotent persistence.** The existing owner/attempt guard remains the sole writer of `IntelligenceRun.metadata`; replaying the same attempt replaces its diagnostic rather than appending duplicates.

- [ ] **Step 5: Run focused worker tests.**

```bash
npx tsx --test src/modules/commerce-intelligence/worker.test.ts src/modules/commerce-intelligence/worker-fence.test.ts
```

- [ ] **Step 6: Commit redacted observability.**

```bash
git add src/modules/commerce-intelligence/contract.ts src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/worker.ts src/modules/commerce-intelligence/worker.test.ts src/modules/commerce-intelligence/worker-fence.test.ts
git commit -m "fix(slice-003): record brief failure diagnostics"
```

---

### Task 4: Lock the real regressions and verify the pipeline

**Files:**
- Modify: `src/modules/commerce-intelligence/gates.test.ts`
- Modify: `src/modules/commerce-intelligence/engine-pipeline.test.ts`
- Modify: `src/modules/commerce-intelligence/adr-025-evaluation.test.ts`
- Modify: `src/modules/commerce-intelligence/locator-leak.test.ts`

- [ ] **Step 1: Add three deterministic regression cases.**
  - feature-list: initial structured bullet missing action/reason is rejected before final gate and repair receives the redacted bullet diagnostic;
  - connector-missing: a bullet with a valid fact but no connector is rejected, then converges only with a structured rationale containing an allowed connector and grounding;
  - script-naturalness: scene metainstruction remains a repairable issue and repaired script contains no metacomment, without affecting valid creator-first phrasing.

- [ ] **Step 2: Add an end-to-end five-item fixture modeled on `c529711d`.** Four malformed initial development bullets must either converge through the shared repair contract or become declared objective failures; the test must never assert raw job drafts or call a real provider.

- [ ] **Step 3: Verify the gates remain strict.** Assert unsupported claims, locator leakage, structural duplicates and invalid scene sets still fail exactly as before; no test may replace a hard-gate failure with `PASS` merely to make the run succeed.

- [ ] **Step 4: Run the focused regression suite.**

```bash
npx tsx --test src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/adr-025-evaluation.test.ts src/modules/commerce-intelligence/locator-leak.test.ts src/modules/commerce-intelligence/worker.test.ts src/modules/commerce-intelligence/worker-fence.test.ts
```

- [ ] **Step 5: Commit regressions.**

```bash
git add src/modules/commerce-intelligence/gates.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts src/modules/commerce-intelligence/adr-025-evaluation.test.ts src/modules/commerce-intelligence/locator-leak.test.ts
git commit -m "test(slice-003): cover brief quality regressions"
```
