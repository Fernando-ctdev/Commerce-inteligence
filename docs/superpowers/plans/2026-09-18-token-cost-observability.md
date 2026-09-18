# Token and Cost Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument provider token usage and immutable estimated cost, aggregate it by capability, Content, and CommerceIntelligenceJob, and expose only financial aggregates in the Product History tab.

**Architecture:** The provider adapter normalizes real usage into nullable token counters. The worker resolves an immutable versioned price row and stores one sanitized cost record per effective capability attempt inside `IntelligenceRun.metadata`; all capability, Content, and job totals are derived from those records without duplicated columns. A tenant-scoped Product History endpoint projects only currency, amount, and completeness state to the creator-facing UI.

**Tech Stack:** TypeScript, Next.js App Router, React, PostgreSQL, Prisma, `tsx --test`, existing session/tenant authorization, existing Model Router and worker.

**Spec:** `docs/superpowers/specs/2026-09-18-token-cost-observability-design.md`

## Global Constraints

- Provider usage is the only token source; missing or unsupported counters remain `null`, never inferred from bytes or text.
- Cached and reasoning counters must not be double-counted when they are subsets of input/output; ambiguous provider semantics produce `PARTIAL` or `UNAVAILABLE` cost.
- Custo usa, nesta ordem, custo reportado oficialmente pelo adapter, snapshot imutável de pricing oficial ou fallback local de provider sem pricing oficial; moeda sempre é explícita/configurada e ausência confiável resulta `PARTIAL`/`UNAVAILABLE`.
- Monetary calculations use exact decimal/integer arithmetic, never JavaScript floating point.
- `IntelligenceRun.metadata.capabilities[]` is the canonical source; do not add duplicated totals to `Content` or `CommerceIntelligenceJob`.
- Retries, fallbacks, repairs, and provider failures are separate effective calls and count once when usage/cost is known.
- Every read and write is tenant-scoped by the server-side session; the client never supplies authoritative `tenantId`.
- Creator-facing UI shows only financial aggregates, currency, and `COMPLETE`/`PARTIAL`/`UNAVAILABLE`; never provider, model, tier, tokens, prompts, logs, latency, hashes, or technical IDs.
- Existing jobs remain readable and project `UNAVAILABLE` when no usage/pricing record exists; no historical backfill by estimation.
- Preserve quota, job state, retry, routing, and provider behavior; this feature is observability only.

---

### Task 1: Align architecture and Slice 010 contracts

**Files:**
- Modify: `docs/superpowers/specs/2026-09-18-token-cost-observability-design.md` (record user approval)
- Modify: `docs/architecture/adr-013-model-router-e-intelligence-tier.md` (UI visibility consequence)
- Modify: `docs/delivery/SLICES.md:429-446` (Slice 010 scope and acceptance)
- Create: `docs/specs/slice-010/SPEC.md` (History cost projection contract)
- Test: documentation self-review; no runtime test

**Interfaces:**
- Produces the accepted rule that only financial aggregates may cross the creator-facing boundary.
- Produces the Slice 010 endpoint/UI contract consumed by Tasks 5–6.

- [ ] **Step 1: Record the approved design status.** Change the design document status from review pending to user-approved before any code work.
- [ ] **Step 2: Update ADR-013 without weakening internal privacy rules.** Replace the absolute UI prohibition with the explicit exception: Product History may show aggregate estimated cost, currency, and completeness only; provider/model/tier/token/prompt data remains internal.
- [ ] **Step 3: Extend Slice 010.** Add token/cost aggregates, complete/partial/unavailable states, tenant-scoped history read, and the no-technical-fields out-of-scope rule. Keep History inside Product context; do not create a global analytics destination.
- [ ] **Step 4: Create `docs/specs/slice-010/SPEC.md`.** Define `GET /api/products/:id/history`, the response shape below, authorization, legacy behavior, and desktop/mobile acceptance.

```ts
type ProductHistoryResponse = {
  jobs: Array<{
    // Contexto público: status, datas e quantidade; nenhum ID técnico.
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED" | "CANCELLED";
    createdAt: string;
    finishedAt: string | null;
    requestedContents: number;
    cost: { currency: string | null; amountMinor: string | null; completeness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE" };
    contents: Array<{ position: number; cost: { currency: string | null; amountMinor: string | null; completeness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE" } }>;
  }>;
};
```

- [ ] **Step 5: Commit only documentation.**

```bash
git add docs/superpowers/specs/2026-09-18-token-cost-observability-design.md docs/architecture/adr-013-model-router-e-intelligence-tier.md docs/delivery/SLICES.md docs/specs/slice-010/SPEC.md
git commit -m "docs(slice-010): define cost history contract"
```

---

### Task 2: Add immutable reported-cost and official pricing snapshots

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260918120000_provider_model_prices/migration.sql`
- Create: `src/modules/commerce-intelligence/pricing.ts`
- Create: `src/modules/commerce-intelligence/pricing.test.ts`
- Create: `src/modules/commerce-intelligence/openrouter-pricing.ts`
- Create: `src/modules/commerce-intelligence/openrouter-pricing.test.ts`

**Interfaces:**
- Produces immutable `ProviderModelPrice` snapshots with `source` (`OFFICIAL_SNAPSHOT` or `LOCAL_FALLBACK`), provider, model, explicitly configured currency, version/hash, collection instant, exact rates and validity interval.
- Produces a provider-agnostic cost result with source `REPORTED`, `OFFICIAL_SNAPSHOT`, `LOCAL_FALLBACK` or `UNAVAILABLE`; reported cost wins over any calculated rate.
- Produces `resolveProviderModelPrice(provider, model, at, preferredCurrency?)` and `calculateCost(usage, price)` for snapshot/fallback calculation. The resolver requires one unambiguous active currency and both operations are deterministic.

- [ ] **Step 1: Write failing pricing tests.** Cover reported cost precedence, active official snapshot selection, no row, overlapping intervals, missing/ambiguous currency, zero usage, exact rounding, nullable dimensions, cached/reasoning overlap, and unavailable fallback.

```ts
test("selects the price version active at call time", async () => {
  const price = await resolveProviderModelPrice(
    "openai-compatible",
    "model-a",
    new Date("2026-09-18T12:00:00Z"),
    "BRL",
  );
  assert.equal(price?.version, 2);
});

test("does not double-count cached input or reasoning output", () => {
  const result = calculateCost(
    { inputTokens: 1_000, outputTokens: 400, reasoningTokens: 100, cachedTokens: 250 },
    {
      currency: "BRL",
      inputPerMillionMinor: "1000000",
      outputPerMillionMinor: "2000000",
      reasoningPerMillionMinor: null,
      cachedPerMillionMinor: "500000",
    },
  );
  assert.equal(result.completeness, "COMPLETE");
  assert.equal(result.amountMinor, "1675");
});
```

- [ ] **Step 2: Add the Prisma model and migration.** Use exact decimal columns for per-million rates, nullable rates for unsupported dimensions, `source`, `sourceHash`, `collectedAt`, `effectiveFrom`/`effectiveTo`, append-only version identity, and indexes for provider/model/currency/interval lookup. Do not add totals to Job or Content.
- [ ] **Step 3: Implement the OpenRouter pricing adapter.** Fetch `GET /api/v1/models`, allowlist prompt/completion/cache rates only, require configured/documented currency, validate non-negative values, canonicalize and hash the payload, and insert a new immutable snapshot only when its identity changes. Network/schema/currency failure returns no snapshot; it never invents a rate.
- [ ] **Step 4: Implement deterministic resolver/calculator.** Prefer normalized `usage.cost`/`cost_details` when currency is explicit; otherwise select an active official snapshot, then a local fallback only for a provider with no official pricing integration. Calculate non-overlapping billable buckets, return `COMPLETE`, `PARTIAL`, or `UNAVAILABLE`, and serialize monetary output as a string.
- [ ] **Step 5: Do not add `PROVIDER_PRICE_CATALOG_JSON` for OpenRouter.** A local immutable catalog remains an operator-supplied fallback only for providers without official pricing; empty/unavailable source is valid and makes runtime cost `UNAVAILABLE`.
- [ ] **Step 6: Run pricing tests and commit.**


```bash
npx tsx --test src/modules/commerce-intelligence/pricing.test.ts src/modules/commerce-intelligence/openrouter-pricing.test.ts

git add prisma/schema.prisma prisma/migrations src/modules/commerce-intelligence/pricing.ts src/modules/commerce-intelligence/pricing.test.ts src/modules/commerce-intelligence/openrouter-pricing.ts src/modules/commerce-intelligence/openrouter-pricing.test.ts
git commit -m "feat(slice-010): add official pricing snapshots"
```

---

### Task 3: Normalize token usage in the provider adapter

**Files:**
- Modify: `src/modules/commerce-intelligence/model-router.ts`
- Modify: `src/modules/commerce-intelligence/provider.ts`
- Modify: `src/modules/commerce-intelligence/provider.test.ts`
- Modify: `src/modules/commerce-intelligence/engine.ts`
- Modify: `src/modules/commerce-intelligence/engine.test.ts`

**Interfaces:**
- Produces `ProviderTokenUsage` with nullable `inputTokens`, `outputTokens`, `reasoningTokens`, and `cachedTokens`, plus normalized optional `ProviderReportedCost` from `usage.cost`/`usage.cost_details` with explicit/configured currency.
- Extends `ProviderCallMetrics` and `CapabilityEvent` with provider identity, usage and reported cost without changing existing callers that omit them.

```ts
export type ProviderTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
};

export type ProviderReportedCost = {
  amountMinor: string | null;
  currency: string | null;
  completeness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
};

export type ProviderCallMetrics = {
  // existing metrics remain
  provider: string;
  model: string;
  providerStatus: number | null;
  requestBytes: number;
  responseBytes: number | null;
  durationMs: number;
  usage?: ProviderTokenUsage;
  reportedCost?: ProviderReportedCost;
  // existing retry/fallback fields remain
};
```

- [ ] **Step 1: Add provider fixtures/tests that fail.** Cover OpenRouter `usage.prompt_tokens`, `completion_tokens`, cached/reasoning details, `usage.cost`, `cost_details`, explicit currency, missing currency, alternate `input_tokens`/`output_tokens`, missing usage, invalid negative/fractional values, and zero values.
- [ ] **Step 2: Implement one adapter normalizer.** Read only allowlisted usage/cost paths, accept safe non-negative integers for tokens and exact decimal conversion for reported cost, keep unsupported dimensions `null`, preserve raw counters while marking overlap semantics for the calculator, and reject monetary completeness without explicit/configured currency.
- [ ] **Step 3: Attach usage and reported cost to `onMetrics` for success and provider failures.** Do not log usage/cost payloads, prompts, responses, or secrets; keep existing correlation and rate-header allowlists unchanged.
- [ ] **Step 4: Thread usage and reported cost through `createCapabilityTracker`.** Copy normalized fields into each `CapabilityEvent`; preserve one event per effective attempt, retry, fallback, repair, and failure.
- [ ] **Step 5: Run provider/engine tests and commit.**

```bash
npx tsx --test src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/engine.test.ts

git add src/modules/commerce-intelligence/model-router.ts src/modules/commerce-intelligence/provider.ts src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/engine.ts src/modules/commerce-intelligence/engine.test.ts
git commit -m "feat(slice-003): capture provider token usage"
```

---

### Task 4: Persist cost records in IntelligenceRun metadata

**Files:**
- Modify: `src/modules/commerce-intelligence/worker.ts`
- Modify: `src/modules/commerce-intelligence/worker.test.ts`
- Modify: `src/modules/commerce-intelligence/worker-fence.test.ts`
- Modify: `src/modules/commerce-intelligence/engine.ts` (content attribution only where a single Content is known)
- Create: `src/modules/commerce-intelligence/cost-observability.ts`
- Create: `src/modules/commerce-intelligence/cost-observability.test.ts`

**Interfaces:**
- Produces `CapabilityUsageCost` records matching the approved design.
- Produces `aggregateRunCosts(metadata)` for capability, Content, and Job projections.
- Consumes `ProviderTokenUsage`, optional `ProviderReportedCost`, provider/model identity, call attempt/retry, immutable official/local `ProviderModelPrice` snapshot, and optional server-derived `contentId`.

- [ ] **Step 1: Write failing aggregation tests.** Cover reported cost precedence, one call, set-level calls without `contentId`, direct Content calls, retries/fallbacks, provider failure with usage/cost, legacy metadata, mixed currencies, official snapshot, local fallback, and no-price/no-usage states.
- [ ] **Step 2: Implement `cost-observability.ts`.** Build immutable per-call records with source `REPORTED`, `OFFICIAL_SNAPSHOT`, `LOCAL_FALLBACK` or `UNAVAILABLE`; prefer explicit-currency reported cost, otherwise resolve the applied snapshot/fallback, calculate exact cost, and aggregate without duplicating totals. Set-level calls contribute to Job only; Content totals include only directly attributed calls and expose incomplete state when appropriate.
- [ ] **Step 3: Integrate finalization.** When `runMetadata` is created, transform each capability event into a sanitized cost record and merge it into `IntelligenceRun.metadata.capabilities`. Preserve existing metadata fields and legacy readers.
- [ ] **Step 4: Integrate failed/reclaimed paths.** Persist usage/cost received before terminal provider failure in the existing fenced `IntelligenceRun` upsert; never persist response bodies or stale-owner metrics.
- [ ] **Step 5: Verify idempotency.** Replaying the same owner/attempt must not duplicate a capability record; explicit retry creates a separate record and is included once.
- [ ] **Step 6: Run worker/cost tests and commit.**

```bash
npx tsx --test src/modules/commerce-intelligence/cost-observability.test.ts src/modules/commerce-intelligence/worker.test.ts src/modules/commerce-intelligence/worker-fence.test.ts

git add src/modules/commerce-intelligence/cost-observability.ts src/modules/commerce-intelligence/cost-observability.test.ts src/modules/commerce-intelligence/worker.ts src/modules/commerce-intelligence/worker.test.ts src/modules/commerce-intelligence/worker-fence.test.ts src/modules/commerce-intelligence/engine.ts
git commit -m "feat(slice-003): persist capability cost metadata"
```

---

### Task 5: Expose tenant-scoped Product History cost projection

**Files:**
- Create: `src/modules/commerce-intelligence/history-cost.ts`
- Create: `src/modules/commerce-intelligence/history-cost.test.ts`
- Create: `src/app/api/products/[id]/history/route.ts`
- Modify: `src/modules/identity/http.ts` or existing session helper only if the established route pattern requires it
- Modify: `src/modules/commerce-intelligence/http-status.test.ts` or create a route contract test beside the new route

**Interfaces:**
- Produces `getProductHistoryCost(tenantId, productId): Promise<ProductHistoryResponse>` internally; the public DTO contains no technical IDs.
- Route accepts `GET /api/products/:id/history` with session-derived tenant scope and returns only the approved DTO.

- [ ] **Step 1: Write failing projection tests.** Cover `COMPLETE` only with at least one eligible entry, all complete and one currency; a single known-amount `PARTIAL`; `UNAVAILABLE` for no calculable cost; legacy run metadata; failed/partial jobs; multiple jobs ordered by creation; Content attribution by position; mixed currencies; missing Product; and cross-tenant Product IDs.
- [ ] **Step 2: Implement pure projection/aggregation.** Every read, join and aggregate receives the server-derived `tenantId + productId` pair and fails closed outside it. Read Product-scoped terminal jobs and their `IntelligenceRun` rows in one authorized query boundary; calculate DTOs from metadata using `aggregateRunCosts`; project job date/status/context and Content position only; never expose IDs, `metadata`, provider/model, price IDs, capability rows, or tokens.
- [ ] **Step 3: Add the authenticated route.** Reuse current session/origin conventions, validate Product ID format, resolve Product with `tenantId` from the session, return `404` uniformly for missing/cross-tenant records, and set `cache-control: no-store`.
- [ ] **Step 4: Run API tests and commit.**

```bash
npx tsx --test src/modules/commerce-intelligence/history-cost.test.ts src/modules/commerce-intelligence/http-status.test.ts

git add src/modules/commerce-intelligence/history-cost.ts src/modules/commerce-intelligence/history-cost.test.ts src/app/api/products/[id]/history/route.ts
git commit -m "feat(slice-010): expose product cost history"
```

---

### Task 6: Render financial aggregates in Product History

**Files:**
- Create: `src/components/products/history-api.ts`
- Create: `src/components/products/history-ui-model.ts`
- Create: `src/components/products/history-ui-model.test.ts`
- Modify: `src/components/products/product-detail.tsx`
- Modify: `src/components/products/generation-views.tsx`
- Modify: `src/components/products/generation-views.test.tsx`
- Modify: `src/components/products/generation-panel.module.css` only for approved responsive states

**Interfaces:**
- `loadProductHistory(productId: string): Promise<ProductHistoryResponse>` fetches the dedicated endpoint with same-origin credentials; IDs remain client routing inputs and never enter the creator-facing DTO.
- `HistoryView` consumes `{ history, loading, error }` and renders job context (status/dates/quantity), position-based Content context, and financial cost without technical fields.

- [ ] **Step 1: Write failing UI-model tests.** Cover complete amount formatting, a known-amount partial label, unavailable when no cost is calculable, multiple jobs by date/context, Content position, no history, network error, currency grouping, and absence of technical fields in the creator-facing model.
- [ ] **Step 2: Implement the API client and UI model.** Validate the DTO at the boundary, preserve server-provided completeness, format `amountMinor` with string/`BigInt` minor-unit arithmetic plus `Intl.NumberFormat` currency metadata (never `Number`), and never infer a value from tokens/bytes.
- [ ] **Step 3: Load history when Product detail mounts/changes.** Keep the current generation status fetch separate; loading cost history must not block Contents, Strategy, or Product tabs.
- [ ] **Step 4: Replace the current latest-job-only HistoryView.** Show each historical job's date/status/requested count and estimated aggregate cost. Use progressive disclosure for Content-level amounts by position; show explicit text for partial/unavailable and accessible labels not dependent on color.
- [ ] **Step 5: Validate responsive layout.** Desktop may use a dense list; mobile remains a readable vertical list. Do not create a global analytics card or expose provider/model/tier/tokens.
- [ ] **Step 6: Run component tests and commit.**

```bash
npx tsx --test src/components/products/history-ui-model.test.ts src/components/products/generation-views.test.tsx

git add src/components/products/history-api.ts src/components/products/history-ui-model.ts src/components/products/history-ui-model.test.ts src/components/products/product-detail.tsx src/components/products/generation-views.tsx src/components/products/generation-views.test.tsx src/components/products/generation-panel.module.css
git commit -m "feat(slice-010): show cost aggregates in history"
```

---

### Task 7: Update validation gates and perform end-to-end verification

**Files:**
- Modify: `package.json` only if the focused tests are not already included in the existing test command
- Modify: `docs/specs/slice-010/SPEC.md` only for verified acceptance wording
- Test: existing provider, worker, API, UI, lint, typecheck, build, and browser portal

**Interfaces:**
- Verifies the complete path: provider usage → cost snapshot → IntelligenceRun → tenant-scoped endpoint → History UI.

- [ ] **Step 1: Run focused unit/contract tests.**

```bash
npx tsx --test src/modules/commerce-intelligence/pricing.test.ts src/modules/commerce-intelligence/provider.test.ts src/modules/commerce-intelligence/cost-observability.test.ts src/modules/commerce-intelligence/history-cost.test.ts src/components/products/history-ui-model.test.ts
```

- [ ] **Step 2: Run the repository validation commands required by AGENTS.md.**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 3: Run a smoke scenario with a controlled provider response.** Seed one price version, execute one capability with all four usage counters, execute one retry/fallback and one missing-usage call, finalize a job, and assert the persisted metadata has one record per effective call with the expected completeness states.
- [ ] **Step 4: Verify the HTTP boundary.** Request the Product History route as the owning session and a different tenant session; confirm the owner receives only the approved DTO and the other tenant receives the existing uniform not-found/authorization response.
- [ ] **Step 5: Verify the actual Viewefy surface.** Open the authenticated Product History tab at desktop and mobile widths. Confirm complete, partial, unavailable, legacy, and empty states; confirm no provider/model/token/prompt fields appear in DOM text or accessibility output.
- [ ] **Step 6: Review `git diff` for scope and commit the validation handoff.** Do not stage unrelated workspace changes. Record any unavailable provider pricing or skipped validation explicitly.
