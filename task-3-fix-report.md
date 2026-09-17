# Task 3 — Fix round 1/5

- Base: `619ce3d2c1b9ef08f03cce0e54b30ce82147e91a`
- Escopo: `src/modules/commerce-intelligence/engine.ts` e `engine.test.ts`.
- Correções: composição limitada ao índice atualizado; ranking somente objetivo; falhas de cena/composição classificadas como `HARD_GATE`; fluxo de teste alinhado a `REVIEW`, repair único e fallback sem partial.
- Teste observável: `dois REVIEW: repair inválido deixa somente o candidato objetivo inválido no partial` em `src/modules/commerce-intelligence/engine.test.ts:664`. Primeiro candidato falha composição/partial; segundo é entregue.

## Resultados

- `node --test --test-name-pattern='dois REVIEW' --import tsx src/modules/commerce-intelligence/engine.test.ts` — PASS (1 executado, 37 skipped).
- `node --test --import tsx src/modules/commerce-intelligence/engine.test.ts src/modules/commerce-intelligence/engine-pipeline.test.ts` — PASS (53/53).
- `git diff --check` — PASS.
- Typecheck/lint/build e suíte ampla — não executados; fora do escopo focado solicitado.
