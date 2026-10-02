# AGENTS.md

Canonical instructions for agents in this repository. Do not create parallel
instruction files such as `CLAUDE.md`. Be direct, make the smallest correct
change, and validate before declaring work done.

---

## 1. Precedence and sources of truth

### Absolute user precedence

- The user's explicit request takes precedence over any other instruction,
  document, or project rule (PRD, SPEC, PLAN, ADR, and this `AGENTS.md`).
- In case of conflict, follow the user's explicit request.

### Reading order before implementing

1. `docs/product/PRD*.md` — `PRD.md` is the source of truth for functional scope.
   The front-specific PRDs (`PRD-Importation-product.md`,
   `PRD-commerce-intelligence-engine.md`, `PRD-product-intelligence-analysis.md`,
   `PRD-content-briefing.md`, `PRD-model-router-inteligence.md`) detail the
   behavior of each front without expanding the scope of the main PRD.
2. `docs/architecture/SYSTEM-DESIGN.md` — current architecture, modules, and dependencies.
3. `docs/architecture/adr-*.md` — accepted architectural decisions and trade-offs.
4. `docs/engineering/PRINCIPLES.md` — permanent engineering rules (detail behind
   section 4 of this file).
5. `DESIGN.md` — UX/UI, responsiveness, accessibility, states, and visual direction.
6. `docs/delivery/SLICES.md` — official MVP build map.
7. `docs/specs/<slice>/SPEC.md`, when it exists — behavior and contract of the current slice.
8. `docs/specs/<slice>/PLAN.md`, when it exists — approved implementation plan.

### Authority of each document

| Document | Governs |
|---|---|
| PRD | product, domain, and scope |
| Front-specific PRDs | detailed behavior of that front |
| SYSTEM-DESIGN | current architecture |
| Accepted ADR | the specific decision it records |
| PRINCIPLES | permanent engineering practices |
| DESIGN | UX/UI |
| SLICES | decomposition and macro sequence of MVP delivery |
| SPEC | behavior of the current slice |
| PLAN | implementation strategy of the current slice |

### Conflicts and inconsistencies

- On a relevant conflict between sources, **do not silently pick** an
  interpretation. Preserve existing behavior and flag the inconsistency before
  introducing a new decision.
- Do not change the PRD, ADRs, SYSTEM-DESIGN, DESIGN, PRINCIPLES, or SLICES just
  to make the current implementation look compatible. Changes to these sources
  must be deliberate.
- Re-read the relevant sources whenever the task changes scope, contract,
  domain, or boundary.

---

## 2. Scope and slices

- Before starting a slice, consult `docs/delivery/SLICES.md`.
- Do not implement behavior that belongs to future slices out of convenience.
- If implementation reveals that the map needs to be split, merged, reordered,
  or corrected, update the map deliberately **before** expanding scope.
- Preserve the MVP scope and question features that do not directly contribute
  to the problem defined in the PRD.

---

## 3. Architecture: modular monolith

A single deployable, made of modules with clear boundaries. Each module is a
*bounded context*.

### Folder structure (reference)

> If the repository already uses a different structure, preserve it and follow
> the existing pattern. Changing the structure requires an ADR.

```
src/
├── app/                      # Next.js: routes, layouts, route handlers (thin)
├── modules/
│   └── <module>/
│       ├── domain/           # entities, value objects, aggregates, events,
│       │                     # domain services, repository interfaces
│       ├── application/      # use cases (commands/queries), DTOs, ports
│       ├── infrastructure/   # concrete repositories, external clients, ORM
│       ├── presentation/     # components, actions, controllers, UI mappers
│       └── index.ts          # module public API (single entry point)
├── shared/
│   ├── kernel/               # base types: Result, Entity, ValueObject, errors
│   ├── infrastructure/       # db, logger, config, queue, cache (no business rules)
│   └── ui/                   # design system (per DESIGN.md)
tests/                        # integration and e2e tests
docs/                         # PRD, architecture, ADRs, specs, plans
framework/                    # framework prompts and templates
```

### Dependency rules

- Allowed direction: `presentation → application → domain`.
  `infrastructure` implements interfaces defined in `domain`/`application`.
- `domain` **must not import** a framework, ORM, external SDK, `next/*`, or React.
- `application` knows nothing about HTTP, database, or external provider details.
- `app/` (routes and route handlers) only translates input/output and delegates
  to a use case.
- A module **only talks to another module** through its public API (`index.ts`),
  an interface, or a domain event. Forbidden:
  - deep imports (`modules/x/domain/...`) from another module;
  - accessing another module's tables or repositories;
  - dependency cycles between modules.
- Do not bypass domain rules, authorization, tenant, quota, or persistence by
  accessing infrastructure directly.
- `shared/` must not contain a module's business rules. If something only serves
  one module, it lives in that module.

### Multi-tenancy, authorization, and quota

- Every read/write is **tenant-scoped**; never trust a client-supplied tenant
  without validating it against the session.
- Authorization and quota are checked in the `application` layer, not in the UI.

---

## 4. Engineering principles

### DDD (tactical, only where the domain justifies it)

- Use the **ubiquitous language** from the PRD/glossary in class, function, and
  module names. Do not invent synonyms.
- **Entity**: identity and lifecycle. **Value Object**: immutable, validated on
  creation, compared by value. **Aggregate**: consistency boundary with a single
  root; only the root is referenced from outside.
- Invariants live in the domain, not in a controller, component, or query.
- **Repository**: interface in domain/application, implementation in infrastructure.
- **Domain event** for side effects across aggregates or modules.
- **Use case** = one intent of the user/system; it orchestrates and does not
  contain complex business rules.
- Simple CRUD **does not need** an aggregate, event, or factory. Do not apply
  ceremonial DDD where there is no domain rule.

### SOLID

- **SRP — Single Responsibility.** Each file/class/function has one reason to
  change. If its description needs an "and" ("validates *and* persists *and*
  notifies"), split it.
- **OCP — Open/Closed.** Extend behavior through composition, strategy, or a new
  adapter without editing stable code. Did an `if/switch` per type/provider
  start growing? Extract an interface and one implementation per variant.
- **DIP — Dependency Inversion.** Business rules depend on abstractions (ports),
  never on concrete implementations. Dependencies come in through the
  constructor or parameters; wiring happens at the edge (composition root), not
  inside the use case. Do not instantiate database, HTTP, or AI clients inside
  the domain.
- **LSP and ISP.** Implementations must be substitutable without surprises, and
  interfaces must be small and focused on the consumer.

### Balance against overengineering

- Reuse what exists and prefer the smallest correct solution.
- Do not create an abstraction without demonstrated need (rule of thumb:
  confirmed duplication in 3 places, or a real second implementation of a port).
- Do not introduce patterns, abstractions, or infrastructure out of personal preference.

---

## 5. Size and complexity limits

These are **quality guides**, not mandatory refactoring triggers: when exceeding
them, split or justify in the PR. Do not refactor code unrelated to the task
just to meet the limits.

| Item | Target | Limit (justify above) |
|---|---|---|
| Code file | ≤ 200 lines | 300 lines |
| React component | ≤ 150 lines | 200 lines |
| Function/method | ≤ 30 lines | 50 lines |
| Parameters per function | ≤ 3 | 4 (above that, use an object) |
| Cyclomatic complexity | ≤ 8 | 10 |
| Nesting levels | ≤ 2 | 3 (prefer early returns) |

Exempt: generated code, migrations, fixtures/seed files, and snapshots.

---

## 6. Code conventions

- One main concept per file; the file name reflects its content.
- Intention-revealing names; no obscure abbreviations.
- Strict TypeScript: no `any` (use `unknown` + validation), no `@ts-ignore`
  without a comment explaining why.
- Validate data at the **edge** (API input, forms, webhooks, external service
  responses) and work with trusted types inside.
- Domain errors are explicit and typed; never swallow exceptions silently or use
  an empty `catch`. Do not leak internal details to the client.
- Prefer pure functions and immutable data in the domain; side effects live in
  `application`/`infrastructure`.
- No comments that repeat the code; comment the **why**, not the what.
- No dead code, debug `console.log`, or TODO without a task identifier.
- Secrets only via environment variables; never in code, logs, or commits.
- A new dependency needs justification; a relevant cross-cutting change requires an ADR.

---

## 7. Tests

- Every new or fixed behavior ships with a test; a fixed bug gets a test that
  reproduces the failure.
- **Domain**: pure, fast unit tests with no infrastructure mocks.
- **Use cases**: tests with in-memory fakes of the ports.
- **Adapters/infrastructure**: integration tests against a real or equivalent
  dependency (test database), covering tenant scoping.
- **Critical flows**: a few e2e tests focused on the main path.
- Test observable behavior, not implementation details.
- Deterministic tests: no dependence on clock, network, or execution order.

---

## 8. Design system and UI

Always read `DESIGN.md` before making visual or UI decisions. The fonts, colors,
spacing, responsive behavior, accessibility, and aesthetic direction defined
there are the source of truth. Deviations require justification and explicit
approval.

- UI components contain no business rules; they consume use cases.
- Cover the states: loading, empty, error, and success.
- In QA, flag any implementation that does not match `DESIGN.md`.

---

## 9. Workflow

1. Understand the request and consult the relevant sources (section 1).
2. For non-trivial tasks, present a short plan before coding and confirm
   ambiguous assumptions instead of guessing.
3. Make small, focused changes; do not mix opportunistic refactoring with the feature.
4. Validate before declaring done: tests, typecheck, lint, and build available
   in the project. **Explicitly report** any validation that was not run and why.
5. Report what changed, what was validated, and any inconsistency found.

### ADR before implementing

Create or update an ADR before implementing a relevant change to an
architectural trade-off, module boundary, persistence, security, external
contract, external service, or cross-cutting dependency.

### Git

- `develop` is the integration branch. Non-trivial changes branch off into a
  short-lived branch per task: `feat/<identifier>`, `fix/<identifier>`,
  `chore/<identifier>`.
- Do not create a branch for a minimal isolated tweak, and do not accumulate
  feature work directly on `develop`.
- Commits follow `feat(task-identifier): description`, objective, with the full
  message at most 300 characters. Use another Conventional Commit type (`fix`,
  `docs`, `chore`, `refactor`, `test`) when it is clearly more correct.
- One commit, one purpose.

---

## 10. Operational framework

The framework's prompts and templates live in `framework/`. When a step of the
process requires a specific prompt, read and follow the corresponding file in
`framework/prompts/`. Do not duplicate these prompts in parallel files.

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->