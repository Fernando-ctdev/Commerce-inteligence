# Commerce Intelligence Deterministic Pipeline Design

**Status:** Approved
**Date:** 2026-09-19  
**Decision source:** ADR-029.

## Goal

Reduce avoidable provider retries, output-token waste, and broad repairs while preserving creative quality. Code owns system constraints and reproducible assembly; the LLM owns semantic interpretation, commercial intent, and persuasive variation.

## Problem

The current pipeline asks the provider to decide deterministic concerns such as plan cardinality, hook-bucket eligibility, fact-reference validity, CTA validity, connectors, and repair scope. Provider non-compliance produced `GEN-VARIETY` and `GEN-SCHEMA`, repeated repairs, higher cost, and long runs. The solution must reduce avoidable provider work without moving commercial or visual creativity into rigid templates.

## Design principles

1. **Deterministic by default:** quantity, identity, ordering, eligible buckets, server-owned metadata, evidence authorization, CTA actionability, connectors, cardinality, schema, persistence, quota, and retry policy are server decisions.
2. **Creative by intent:** product interpretation, commercial opportunities, strategy, angles, core messages, hooks, DevelopmentBullet text, CTA wording, scripts, scene ideas, and semantic variation remain LLM responsibilities.
3. **No fabricated content:** deterministic code may select, validate, normalize, or reject known facts and approved patterns; it may not invent product claims, evidence links, or creative scenes.
4. **Quality is layered:** hard gates remain authoritative for factual, structural, and variety constraints; the semantic judge remains responsible for naturalness, coherence, creator fit, and editorial quality.
5. **Narrow repair:** only a `REVIEW` bullet or part is repaired once; passing parts remain untouched and an invalid repair preserves the original part. There is no re-judge.
6. **Traceability:** every plan slot, pattern selection, gate result, repair, and published item is reproducible from versioned inputs and server-derived IDs.

## Target flow

```text
Product facts + creator context + memory
  -> Product Understanding / Opportunities / Strategy (LLM)
  -> Deterministic plan skeleton: count, IDs, slots, eligible buckets, ceilings
  -> Creative plan fields: angle, objective, core message, novelty intent (LLM)
  -> Brief Generation in batch (LLM)
  -> Scene Ideas per content (LLM)
  -> Hard gates: facts, structure, CTA, connectors, cardinality, variety, scenes
  -> Semantic Quality Judge in bounded batches (LLM)
  -> Single selective repair of `REVIEW` bullet/part only (LLM)
  -> Hard-gate revalidation
  -> Persist DRAFT contents, diagnostics, usage, and cost
```

## Responsibility boundary

### LLM responsibilities

- Understand the confirmed product without inventing facts.
- Produce commercial interpretation, opportunities, strategy, angles, objectives, core messages, and novelty intent.
- Produce hooks, DevelopmentBullet text, CTA wording, scripts, scene ideas, and persuasive variation.
- Propose `factRefs`; the server authorizes and validates each reference against the evidence snapshot.
- Judge semantic naturalness, coherence, creator fit, and editorial separation after hard gates.
- Repair only the explicitly failed bullet or part with its server-derived evidence context.

### Deterministic responsibilities

- Allocate target quantity, stable content identities, ordering, target slots, eligible hook/CTA buckets, and variety ceilings.
- Reject or normalize server-owned fields; derive redundant structural metadata such as action/rationale from approved text when the contract permits it.
- Enforce evidence authorization, CTA actionability, connectors, cardinality, schema, ordering, duplicate prevention, and batch identity.
- Validate scene feasibility, uniqueness, creator constraints, and unsupported claims without generating creative staging.
- Preserve passing parts unchanged; select repair targets; perform one repair per `REVIEW` part; decide `SUCCEEDED`, `SUCCEEDED_PARTIAL`, or `FAILED` from final hard gates.
- Persist versioned provenance, diagnostics, usage, and cost without exposing provider metadata to creators.

## Creative preservation

Scene ideas remain LLM-generated because visual staging is creative and a deterministic scene catalog would add a new versioned subsystem, create formulaic risk, and has no measured quality baseline. Code validates scene actionability, product anchoring, uniqueness, creator constraints, and factual safety. The same boundary applies to hooks, angles, and bullet wording: code constrains and validates; the LLM creates.

## Repair and quality policy

- Hard gates run before semantic judging.
- The judge evaluates all eligible contents in bounded homogeneous batches and returns per-content/per-part decisions.
- Only failed bullets/parts enter repair; passing parts are not regenerated.
- Each `REVIEW` bullet/part receives one repair attempt; passing parts are not regenerated.
- Repair output is revalidated by deterministic gates; invalid or unappliable repair preserves the original part. No re-judge loop is introduced.
- If final hard gates fail, the existing declared partial/failure contract applies. Invalid or unsupported content is never silently fabricated or published.

## Expected impact

- **Cost:** lower avoidable tokens and calls by removing server-owned fields from LLM schemas/prompts, deriving redundant fields, batching homogeneous judge/repair work where already supported, and avoiding broad repairs. Exact savings require measurement.
- **Latency:** lower retry and repair latency; creative brief and scene generation remain provider-bound.
- **Reliability:** higher reproducibility and fewer `GEN-VARIETY`/`GEN-SCHEMA` failures because server rules no longer depend on provider compliance.
- **Quality:** factual and structural quality should be equal or better; creative quality remains provider-generated and semantically judged. No deterministic scene fallback is introduced.

## Scope

### Included

- Deterministic plan skeleton and variety assignment over eligible buckets.
- LLM-owned creative plan fields and scene ideation with deterministic validation.
- Deterministic gates, server-derived fields, evidence authorization, and repair targeting.
- Single selective repair per `REVIEW` bullet/part, preserving the original on invalid repair.
- Batched semantic judging with one initial `PASS|REVIEW` evaluation and no re-judge.
- Versioned provenance, diagnostics, cost, and latency for comparison.

### Excluded from this decision

- Removing `PRODUCT_UNDERSTANDING` before typed product import exists.
- Removing `CONTENT_BRIEF_GENERATION`, `CONTENT_SCENE_IDEAS`, or semantic quality judging.
- A deterministic scene-pattern catalog or deterministic scene fallback.
- Changing the one-repair semantic contract, adding a re-judge, or adding a semantic `REJECT`.
- Merging `STRATEGY_SYNTHESIS` into opportunity mapping; that is a later contract change.
- New providers, commercial-tier quality differences, embeddings, or a new UI workflow.

## Migration shape

1. Remove server-owned fields and redundant metadata from LLM schemas and prompts.
2. Implement the deterministic plan skeleton while preserving LLM creative plan fields.
3. Keep structured `DevelopmentBullet[]`, with server validation/derivation of redundant fields.
4. Move evidence authorization, objective validation, and repair-target selection into server gates.
5. Keep scene ideation creative and add only deterministic validation/uniqueness checks.
6. Repair only `REVIEW` bullets/parts once, preserve originals on invalid repair, and revalidate hard gates without re-judging.
7. Compare baseline and new runs by success rate, delivered count, fact grounding, CTA validity, hook variety, scene quality, semantic quality, cost, latency, and repair count before changing defaults.

## Acceptance criteria for the implementation plan

- A run produces the same deterministic plan skeleton for the same versioned inputs.
- Creative angle, hook, bullet text, script, CTA wording, and scene ideas remain provider-generated.
- No LLM call decides quantity, server-owned IDs, evidence authorization, CTA validity, connectors, or variety ceilings.
- Every `factRef` is proposed by the model and authorized by deterministic validation before publication.
- Redundant structural fields are derived or canonicalized where the contract permits; duplicate model-authored fields do not create avoidable schema failures.
- No passing bullet/part is sent to repair.
- Every `REVIEW` part is repaired at most once; invalid repair preserves the original and no re-judge occurs.
- Invalid or unsupported content is rejected or declared partial; it is never silently fabricated.
- The system records enough per-capability usage/cost/latency data to compare the old and new paths.
- The creator-facing surface exposes only sanitized job state, diagnostics, usage, and cost.

## Open decisions for review

1. Exact deterministic plan-skeleton interface and versioning location.
2. Which redundant `DevelopmentBullet` fields are canonicalized from `text` in the first cut.
3. No semantic retry cap is open: the contract is one repair per `REVIEW` part, without re-judge.
4. Whether `STRATEGY_SYNTHESIS` remains separate after the first measured release.
