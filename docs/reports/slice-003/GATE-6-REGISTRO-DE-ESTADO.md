# Gate 6 — Registro de estado: 61 integrações puladas por `DATABASE_URL` executadas contra banco dedicado

Data: 2026-09-15 · Ramo: `feat/gate-version-e-cenas` · HEAD: `ed3449d8a0c1dda17b07e3850bebcc14f644c19b` ("feat(generation): support declared partial results") · Autor: Backend Developer

## Veredito

**APROVADO.** As 61 integrações que hoje pulam por `DATABASE_URL` inacessível passaram integralmente (0 falhas, 0 skips) contra banco PostgreSQL local **dedicado e isolado** (`commerce_intelligence_gate6`). A suíte completa (`npm test`) fecha 344/344 com o banco presente. Nenhuma alteração de código foi necessária.

## Comando exato (reproduzível)

```sh
# 1. Banco dedicado (não QA, não dev compartilhado)
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS commerce_intelligence_gate6;" \
                                -c "CREATE DATABASE commerce_intelligence_gate6;"

# 2. Migrations canônicas do repo
DATABASE_URL="postgresql://postgres:ci_dev_001@localhost:5432/commerce_intelligence_gate6?schema=public" \
  npx prisma migrate deploy

# 3. Suíte completa com banco dedicado
DATABASE_URL="postgresql://postgres:ci_dev_001@localhost:5432/commerce_intelligence_gate6?schema=public" npm test
```

`DATABASE_URL` sanitizada: `postgresql://postgres:••••@localhost:5432/commerce_intelligence_gate6?schema=public` (instância local PostgreSQL 17.2; credencial em `.env` local, não versionada).

## Baseline que motivou o gate (estado de hoje)

```
DATABASE_URL="postgresql://postgres:ci_dev_001@localhost:5999/inacessivel" npm test
# tests 344 · pass 283 · fail 0 · skipped 61
```

Confirma as **exatamente 61** integrações puladas reportadas — provenientes de 6 arquivos com skip automático por banco inacessível (`t.skip("DATABASE_URL inacessível…")`).

## Contagens com banco dedicado (por prioridade)

| Arquivo | Testes | Pass | Fail | Skip |
|---|---|---|---|---|
| `src/modules/commerce-intelligence/worker-fence.test.ts` | 7 | 7 | 0 | 0 |
| `src/modules/commerce-intelligence/generation-http-errors.test.ts` | 4 | 4 | 0 | 0 |
| `src/modules/identity/service.test.ts` | 12 | 12 | 0 | 0 |
| `src/modules/products/service.test.ts` | 40 | 40 | 0 | 0 |
| `src/modules/creator-preferences/service.test.ts` | 28 | 28 | 0 | 0 |
| `src/modules/commerce-intelligence/provenance.test.ts` | 3 | 3 | 0 | 0 |
| `src/modules/commerce-intelligence/current-job-regression.test.ts` (unitário, controle) | 1 | 1 | 0 | 0 |
| **Subtotal integração + controle (7 arquivos, `--test-concurrency=1`)** | **95** | **95** | **0** | **0** |
| **Suíte completa `npm test`** | **344** | **344** | **0** | **0** |

Nota: `current-job-regression.test.ts` é unitário (sem skip por banco) e já rodava no `npm test`; incluído como controle de prioridade solicitado. A diferença entre 94 testes nos 6 arquivos de integração e os 61 skips do baseline é de skips condicionais internos (`if (!dbUp) return t.skip(...)`) por cenário, não por arquivo.

## Seed / cleanup

- **Schema:** 18 migrations aplicadas via `prisma migrate deploy` (de `20260824000000_identity_init` a `20260914120000_discount_type_value`), todas com sucesso.
- **Seed:** nenhum seed necessário — os testes de integração criam seus próprios tenants/users/products/jobs com `randomUUID` e fazem cleanup escopado (`deleteMany` por `tenantId`/`jobId`) em `after` hooks.
- **Cleanup do banco:** banco dedicado mantido em `localhost:5432/commerce_intelligence_gate6` para diagnóstico/reatexecução; para descartar: `psql -h localhost -U postgres -c "DROP DATABASE commerce_intelligence_gate6;"`. Nenhuma mutação foi feita contra QA ou contra o banco de desenvolvimento `commerce_intelligence`.

## Observabilidade

- Duração da suíte completa com banco: ~14,5 s (vs ~6,7 s com skips).
- Sem falhas reproduzíveis; sem necessidade de correção de código (zero diff aplicado nesta execução).
- Estado do working tree: 64 arquivos modificados pré-existentes no ramo (não alterados por este registro).
