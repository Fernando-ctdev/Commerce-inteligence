# Baseline call map — Commerce Intelligence

**Purpose:** Etapa 1 static audit artifact. This map records the call graph, semantic ownership, versioned policy inputs, retry surfaces, and counts derivable from code at the immutable baseline below. It is not a live-run report, an E6 verdict, or approval to change runtime.

## Provenance and method

- **Baseline commit:** `8d1833bb8b0b72568b2360a9a49a5ff7f055f8cb` (`2026-09-28`, `fix(commerce-intelligence): complete V2 engine cutover and evals`).
- The map traces the checked-in code at that commit; code links and line ranges below refer to that tree.
- Relevant Git blob IDs, obtainable from the baseline tree:

| Source | Blob SHA-1 |
|---|---|
| [`engine.ts`](../../engine.ts) | `3852494ac9a01cff5a3ca5dafac916260791a87b` |
| [`engine-v2.ts`](../../engine-v2.ts) | `97f0bac7409eac8b58a1aff2dba31bf1dbb49491` |
| [`model-router.ts`](../../model-router.ts) | `55c3594d63009038261aace933a636c287cd6f67` |
| [`worker.ts`](../../worker.ts) | `ff0f6ac04cabffc64a12f05a4bdcd6dd052084b1` |
| [`provider.ts`](../../provider.ts) | `ec5af56018f6f255821840547289846f10aa4a12` |
| [`contract.ts`](../../contract.ts) | `861998bdf4ccfcc667dc6d30f43a72861cfbd2b8` |
| [`gates.ts`](../../gates.ts) | `e300cec90a6d06cc1a0741f14560a2a9a4f59705` |
| [`manifest.json`](./manifest.json) | `25c9545eaf9d104e8fd4c65231442db215e0789e` |

- The source call map was built from production engine/provider/worker code, not from fixture outputs. The checked-in Golden Dataset is a separate offline artifact; its fixture responses, labels, costs, latencies, and thresholds are not presented here as live observations.
- No live provider/job telemetry was available to this audit. Therefore **observed production calls, tokens, monetary cost, and latency are `UNAVAILABLE`** in this artifact. Counts below are code-derived logical-call formulas only.
- This file contains no provider payload, customer data, credentials, secrets, raw prompt, or PII. Live E6 collection must keep those out of this document and out of raw persisted reports.

## Runtime path and semantic ownership

The Engine V2 path is the default required by the user and the path represented by the baseline call sites. `runFirstGeneration()` enters the provider-backed flow when a router is supplied; it does not call `CONTENT_PLAN_GENERATION`, uses deterministic Planner V2, builds scenes with the deterministic Scene Skeleton, and sends hard-valid Contents to Judge. The exact control flow is in [`engine.ts`](../../engine.ts#L858-L1113), brief batching at [L1181-L1344], hard-gate repair and scenes at [L1352-L1500], Judge/part repair at [L1500-L1751].

| Order | Capability / stage | Semantic decision owned by LLM | Decision/authority owned by code | Tier / reasoning | Call sites, retries, and count basis |
|---:|---|---|---|---|---|
| 0 | Product Facts and evidence projection | No generation call in this stage. | Confirmed product facts, evidence catalog and authorized refs are assembled server-side. | Deterministic. | `engine.ts` builds `baseEvidence` before capability calls (L870-L883). No provider call counted. |
| 1 | `PRODUCT_UNDERSTANDING` | Interprets product-use context, capabilities/benefits, outcomes, triggers/barriers within its response contract. | Normalizes permitted cardinality, validates schema and evidence refs; errors fail closed. IDs and policy remain server-owned. | Router tier `HIGH`; provider reasoning `low`. | 1 logical call; one contract/schema retry in `engine.ts` (L899-L943). Thus 1 normally, up to 2 for this retry class. Provider fallback can add physical HTTP attempts separately. |
| 2 | `COMMERCIAL_OPPORTUNITY_MAPPING` | Proposes commercial opportunities, audiences/situations, desires, pains/objections where supported, outcomes and selling arguments. | Validates mapping envelope, refs/cardinality and assigns opportunity IDs. | Router tier `MID`; provider reasoning `medium`. | 1 logical call; one contract retry for missing/malformed opportunities (L945-L1022). Normally 1, up to 2 for this retry class. |
| 3 | `STRATEGY_SYNTHESIS` | Synthesizes `ProductStrategy` fields from validated understanding/opportunities. This remains LLM-owned in this baseline; deterministic Strategy aggregation is not implemented in this path. | Validates the response and assigns IDs, job/product links, version/status, skill binding and validated opportunity links. A retry of missing contents can reuse the existing Strategy. | Router tier `HIGH`; provider reasoning `high`. | 1 if `reuseStrategy` is absent; 0 if a valid `reuseStrategy` is supplied. No capability-level retry is defined here. Call site `engine.ts` L1024-L1078. |
| 4 | `CONTENT_PLAN_GENERATION` | None in V2 default. | Planner V2 enumerates, filters, scores and selects the content portfolio using commercial opportunities, evidence, memory, creator constraints and frozen Creative System data. | Deterministic; not in `LogicalTask`/router map. | 0 provider calls. `engine.ts` L1080-L1109 calls `runPlannerV2`; no provider fallback to the old Plan LLM path. `PLANNER_POLICY_V1` is in `planner-harness/types.ts`; `PLAN_POLICY_VERSION=1` is the separate legacy skeleton policy. |
| 5 | `CONTENT_BRIEF_GENERATION` | Creates the final angle/hook/development/script/CTA and realizes the supplied per-opportunity brief direction in creator-facing language. | Supplies allowlisted realization context; validates exact V2 envelope/item/bullet shape, fact refs and facts; assigns IDs/order; hard gates retain delivery authority. | Router tier `HIGH`; provider reasoning `medium`. | Let `N` be requested Contents and `B` the configured brief batch size. Logical base calls: `ceil(N/B)`. `B` is integer 4–8; default 4 (`engine.ts` L224-L227, L1321-L1329). Each malformed/schema-invalid batch gets one whole-batch retry (L1217-L1279), so that retry can add at most one logical call per affected batch. |
| 6 | Hard-gate repair, `CONTENT_BRIEF_REPAIR` | Rewrites only a rejected item's BriefDraft in response to the server-derived causes/checklist and valid realization context. | Selects rejected item/causes; validates response; replaces by server index; reruns gates on the full set. | Router tier `HIGH`; provider reasoning `high`. | One logical call per rejected item per repair round; rounds are bounded by `GENERATION_MAX_REPAIRS` (`engine.ts` L1352-L1440), default 2. Actual call count depends on observed gate failures and environment configuration; it is not derivable from `N` alone. |
| 7 | Scene Skeleton / `ContentSceneSet` | None in V2 default. | Builds scenes deterministically from authorized facts/product name; gates actionability, evidence and cardinality; records separate scene-set status. | Deterministic; no V2 scene capability/tier. | 0 provider calls. V2 builder and gate: `engine-v2.ts` L474-L524; integration/comment in `engine.ts` L1481-L1490. Scene generation is per hard-valid Brief but has no provider call. |
| 8 | `CONTENT_QUALITY_JUDGE` | Semantically rates hook, development, script, CTA and scenes as `PASS|REVIEW` by Content/part using the received opportunity, facts and creator context. It does not own facts, delivery, quota, Job state or publication. | **Baseline actual:** selects the hard-valid subset, batches by Content ID, validates exact response IDs/parts, records execution/failure, and preserves objective gates as delivery authority; Judge is called for every hard-valid item and RiskAssessment does not select it. **Target pending:** deterministic pre-Judge Risk routes only selected items to Judge, per [ADR-033 §10](../../../../../docs/architecture/adr-033-determinismo-llm-e-creative-system.md#L244). | Router tier `HIGH`; provider reasoning `high`. | If `H` Contents reached the Judge stage after hard gate, base calls are `ceil(H/3)`. `JUDGE_BATCH_MAX=3` (`semantic-quality.ts` L107); calls are looped in `engine.ts` L1525-L1569 and invoked for all hard-valid items at L1720-L1725. No Judge retry; isolatable batch failure is recorded per item. |
| 9 | `CONTENT_PART_REPAIR` | Attempts one semantic rewrite of each part marked `REVIEW`, grouped by identical part/round. | Selects only real initial Judge REVIEW parts, preserves originals on failed/invalid repair, validates and recomposes per item, reruns objective gates; no re-Judge. | Router tier `HIGH`; provider reasoning `high`. | One pass only. Let `q_p` be the number of actually repairable REVIEW parts of type `p`; logical calls are `sum_p ceil(q_p / C_p)`, with `C_hook=3`, `C_development=2`, `C_script=3`, `C_cta=3`, `C_scenes=1` (`semantic-quality.ts` L107-L108; `engine.ts` L1607-L1719). `q_p` is not derivable from `N`. |
| 10 | Final objective validation, result/persistence | No semantic generation call. | **Baseline actual:** revalidates objective gates/variety, computes delivery/residual and persists through the worker's fenced flow; RiskAssessment is constructed deterministically after engine results. **Target pending:** run deterministic Risk before Judge as a selective routing step, without authority over delivery, per [ADR-033 §10](../../../../../docs/architecture/adr-033-determinismo-llm-e-creative-system.md#L244). | Deterministic. | No capability call. See `engine.ts` L1720-L1916 and `worker.ts` L1190-L1255. |

### Tier and reasoning are separate

The router tiers above come from [`model-router.ts`](../../model-router.ts#L4-L16). Provider reasoning settings are independently configured in [`provider.ts`](../../provider.ts#L142-L150): Understanding `low`; Mapping `medium`; Strategy `high`; Brief `medium`; both Brief and Part Repair `high`; Judge `high`. A reasoning setting is not a tier and must not be counted as a tier change.

## Code-derived logical-call counts

Let:

- `N` = target content count;
- `B` = validated Brief batch size (`4..8`, default `4`);
- `H` = number of items that pass Brief hard gates and reach Judge;
- `q_p` = number of actual Judge `REVIEW` parts that proceed to part repair, by part;
- `R_B` = additional Brief schema-retry calls;
- `R_U`, `R_M` = additional Understanding/Mapping contract-retry calls;
- `R_H` = actual per-item hard-gate-repair calls;
- `R_P` = actual part-repair batch calls from the formula above.

For a router-backed run, logical capability invocations before provider-level availability fallback are:

```text
Understanding       = 1 + R_U,            R_U ∈ {0,1}
Mapping             = 1 + R_M,            R_M ∈ {0,1}
Strategy            = 1 if not reused, otherwise 0
Plan LLM            = 0
Brief generation    = ceil(N / B) + R_B,  0 ≤ R_B ≤ affected initial batches
Brief repair        = R_H,                 data-dependent, default max rounds = 2
Scene Ideas         = 0
Judge               = ceil(H / 3),         no retry
Part repair         = R_P,                 one pass; batch-size formula above
```

Thus the no-retry/no-repair logical base for an initial run with no reused Strategy is:

```text
2 + 1 + ceil(N / B) + ceil(H / 3)
```

The `2` is Understanding + Mapping; `1` is Strategy. If Strategy is reused, subtract one. This is a **formula derived from code**, not observed live usage. No fixed count by `N` is reported because `H`, schema retries, per-item hard repairs, Judge REVIEW parts and provider fallbacks depend on runtime outcomes.

**Logical calls are not physical HTTP attempts.** Provider availability fallback can add HTTP attempts when eligible timeout/connection/status failures occur and a distinct higher-tier model is configured; the fallback tier chain is LOW → MID → HIGH (`provider.ts` L189-L190, L702-L771). Engine code records per-attempt callbacks where received (`engine.ts` L629-L685), but this audit has no live provider event stream from which to count them.

## Version and binding snapshot in the baseline

| Surface | Code value / behavior at `8d1833b` | Evidence |
|---|---|---|
| Engine | `ENGINE_VERSION = "3"` | `engine.ts` L94 |
| Cardinality policy | `CARDINALITY_POLICY_VERSION = 4` | `contract.ts` L76 |
| Gate policy | `GATE_POLICY_VERSION = 4` | `gates.ts` L29 |
| V1 planner skeleton policy | `PLAN_POLICY_VERSION = 1` | `planner.ts` L6 |
| V2 Planner harness policy | `PLANNER_POLICY_V1` | `planner-harness/types.ts` |
| Brief V2 policy symbol/value | `BRIEF_GENERATION_POLICY_V2 = "BRIEF_GENERATION_POLICY_V1"` (recorded exactly as implemented; name/value mismatch is not silently normalized) | `engine-v2.ts` L37 |
| Runtime PlatformSkill default | `tiktok-commerce@1.2` | `platform-skill.ts` L106-L120; `loadPlatformSkill()` defaults to `TIKTOK_COMMERCE_SKILL` |
| V2 planner binding | `tiktok-commerce@1.3`, Creative System `1.3`, source `frozen-harness-fixture` | `engine-v2.ts` L37-L45 |
| Logical tiers | PU HIGH; Mapping MID; Strategy HIGH; Brief/Brief Repair/Judge/Part Repair HIGH | `model-router.ts` L4-L16 |
| Provider reasoning | PU low; Mapping medium; Strategy high; Brief medium; repairs/Judge high | `provider.ts` L142-L150 |

The V2 planner's `@1.3` binding is explicitly marked as a frozen harness fixture, while the baseline runtime Skill loader uses `@1.2`. **Conformity pending:** [ADR-033 §7](../../../../../docs/architecture/adr-033-determinismo-llm-e-creative-system.md#L184) defines `tiktok-commerce@1.3` as the operational binding for Engine V2; therefore the baseline's `@1.2` usage is a conformity gap against that operational binding, not evidence that baseline production code uses `@1.3`. The exact binding and prompt hashes for a specific live call must be read from that call's run metadata; this map does not substitute fixture provenance for runtime provenance.

## Retry, scene, and Judge limits

- Understanding: one schema/contract retry in engine; deterministic cardinality normalization precedes validation (`engine.ts` L899-L943).
- Mapping: one retry for missing opportunities or contract error (`engine.ts` L981-L1015).
- Strategy: no capability-level retry in this path; retry-of-missing-content can reuse Strategy (`engine.ts` L1035-L1078).
- Plan: no LLM invocation and no fallback to the former `CONTENT_PLAN_GENERATION` call (`engine.ts` L1080-L1109).
- Brief batch: one retry per invalid batch; second invalid result fails closed (`engine.ts` L1217-L1279).
- Hard Gate Repair: per rejected item, repeated only up to configured `GENERATION_MAX_REPAIRS`; default is 2 (`engine.ts` L1352-L1440). This is separate from Brief schema retry.
- Scenes: deterministic V2 Scene Skeleton, zero `CONTENT_SCENE_IDEAS` calls (`engine-v2.ts` L474-L524).
- Judge: one execution attempt per batch; all hard-valid Contents are submitted in batches up to three; malformed/provider-failed batches are isolated, not retried and never synthesize PASS/REVIEW (`engine.ts` L1525-L1569, L1720-L1751).
- Part repair: one pass on the initial Judge `REVIEW` parts, no re-Judge (`engine.ts` L1720-L1735); failed/invalid replacements preserve the original (`engine.ts` L1648-L1718).
- Provider fallback: only eligible availability failures may advance through configured higher-tier models. Fallback attempts are physical provider calls, not additional semantic capability decisions (`provider.ts` L189-L190, L702-L771).

## What is observed versus unavailable

| Measure | Baseline code can record | Live observation available for this audit? | Value recorded here |
|---|---|---:|---|
| Logical capability, tier, model/provider, instruction hash | Capability tracker and job events (`engine.ts` L635-L710) | No live job trace supplied | `UNAVAILABLE` |
| Effective HTTP attempts / fallback / retry | Provider callbacks captured per tracked call (`engine.ts` L631-L685); provider emits per-attempt metrics (`provider.ts` L725-L767) | No live provider trace supplied | `UNAVAILABLE` |
| Input/output/reasoning/cached tokens | Provider usage fields are nullable (`model-router.ts` ProviderTokenUsage); capability record has usage (`engine.ts` L657-L668) | No live usage record supplied | `UNAVAILABLE` |
| Monetary cost, currency, completeness | Provider-reported cost has explicit amount/currency/completeness fields (`model-router.ts` ProviderReportedCost) | No live usage-cost record supplied | `UNAVAILABLE` |
| Duration/latency | Capability durations and per-attempt duration are recorded in code | No live job/provider trace supplied | `UNAVAILABLE` |
| `D/N`, terminal status, scene/Judge counts | Run snapshots and delivery/category metrics exist (`observability.ts` L98-L150; `worker.ts` L526-L590) | No live run supplied | `UNAVAILABLE` |
| Quality of generated content | Runtime Judge outputs; separate E6 annotation/replay artifacts | No live provider output or blind annotation supplied | `UNAVAILABLE` |

Do not replace these values with estimates, provider list prices, fixture metrics, a nominal HIGH tier, a test result, or zero. A missing usage field in a future live record remains `UNAVAILABLE`/`PARTIAL` according to its explicit completeness; it is never inferred as zero.

## E6 live fields to populate later

E6 must populate these from actual provider/runtime traces, clearly separated from offline fixture/harness values:

1. **Per actual capability invocation:** job/run reference (sanitized internal identifier), task, attempt, retry index, configured tier, actual provider/model, instruction version/hash, request/response byte counts when present, provider status/error, fallback source/reason, and observed duration.
2. **Per actual provider attempt:** available input/output/reasoning/cached token counts; reported cost amount, currency and completeness; missing values explicitly `UNAVAILABLE`/`PARTIAL`.
3. **Pipeline/output:** requested `N`, delivered `D`, failed `F`, terminal status, actual Brief batch sizes/retries, hard-gate decisions, scene-set status/attempts, Judge `EXECUTED|NOT_EXECUTED|FAILED|NOT_APPLICABLE`, real Judge results only for executed calls, and actual part-repair calls/outcomes.
4. **Per-category/quality evaluation:** real live output references/hashes, rubric version, blind annotation/adjudication coverage and labels, denominators, missingness, and provider-live quality metrics. Offline judgePool fixtures remain separately labelled offline and are not live Judge calls or human annotation.
5. **Aggregate:** actual effective calls per capability, retries/repairs/fallbacks, token totals only over observed token fields, monetary totals only within compatible currency/completeness, latency distribution only from observed durations, `cost_per_valid_content` only for `D>0` with valid cost, and per-category results.

E6 must retain the separation between code-derived base-call formulas and observed run totals. It must not infer a live baseline from Golden Dataset fixtures or copy a metric into production evidence merely because `eval-golden verify` passes.

## Limits and remaining Etapa 1 evidence

This artifact closes the **static call-map** portion of Etapa 1 for the pinned commit. It does not close Etapa 1 as a whole. Still unavailable here:

- live provider call/attempt records for the baseline;
- live token usage, reported cost/currency/completeness and latency;
- representative generated outputs and blind quality evidence;
- an observed baseline run for each relevant `N`/category, including real retries, scene/Judge/repair outcomes;
- a full audit result for every semantic question and capability classification in the canonical Etapa 1 checklist.

No runtime, provider behavior, threshold policy, E6 SPEC/PLAN, ADR, or other artifact was changed by this map.

## D9 — Separação V2, baseline e E6

Este documento permanece exclusivamente o artefato estático da baseline pinada por commit. Ele não é relatório live, resultado E6, aprovação de runtime ou substituto de metadata de execução.

1. O runtime V2 é descrito pelos contratos e decisões do ADR-033 e por seus traces próprios.
2. A baseline ADR-029 permanece reproduzível e isolada para comparação histórica.
3. E6 é o runner comparativo que separa captures offline/replay de provider vivo, com proveniência, métricas e critérios próprios.
4. Resultados, falhas, tiers, custos, latências ou expectativas de uma dessas classes não podem ser usados como evidência de outra classe.
5. Este mapa registra fórmulas code-derived; chamadas físicas, tokens, custo, latência e qualidade live continuam `UNAVAILABLE` até coleta pareada.
