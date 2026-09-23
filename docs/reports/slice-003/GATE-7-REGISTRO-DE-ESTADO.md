# Gate 7 — Registro de estado: limpeza de jobs ativos (QUEUED/RUNNING → CANCELLED) e reservas

Data: 2026-09-15 · Ramo: `feat/gate-version-e-cenas` · HEAD: `ed3449d8a0c1dda17b07e3850bebcc14f644c19b` · Autor: Backend Developer

## Escopo autorizado

Parar tudo e limpar TODOS os jobs do banco alvo do `.env` (`commerce_intelligence` local, PostgreSQL 17.2 — não QA compartilhado). Terminalizar QUEUED/RUNNING como `CANCELLED` conforme invariantes do domínio, liberando as respectivas `GenerationUsageReservation` com `reason: "CANCELLED"`. Sem apagar histórico/produtos; sem reservas órfãs; worker `commerce-worker` já parado e **não reiniciado**.

## Caminho canônico do domínio

`handleCancel` (`src/modules/commerce-intelligence/http-status.ts:124`): transação única por job — `status: QUEUED → CANCELLED` + `finishedAt` + limpeza de `leaseOwnerId`/`leaseDeadlineAt`, e reserva `RESERVED → RELEASED` com `reason: "CANCELLED"`. Nota: a rota pública **nega cancelamento de RUNNING** (`GEN-CANCEL-UNSAFE`); a terminalização de RUNNING aqui seguiu autorização explícita do usuário para este one-shot.

## Linha do tempo executada

1. **Inventário pré (read-only, psql)**: QUEUED **33**, RUNNING **1**, SUCCEEDED 316, FAILED 490, CANCELLED 11, SUCCEEDED_PARTIAL 72. Dos 34 ativos: 17 com reserva `RESERVED`, 17 sem reserva, RUNNING com lease ativo e sem reserva.
2. **One-shot** (`%TEMP%\gate7-cancel-one-shot.mts`, fora do repo, sem commit; carrega `.env` via `loadDotEnvFile` do projeto, `PrismaClient`, transação por job com guard de status, snapshot pré-mutação em JSON para reversibilidade): ao executar, encontrou **0 ativos** — `jobs terminalizados: 0; reservas liberadas: 0`. **Este script não fez nenhuma mutação.**
3. **Fato relevante**: entre o inventário (passo 1) e o one-shot (passo 2), os 34 ativos foram terminalizados como CANCELLED por **outra sessão** (CANCELLED 11 → 45 = 11 + 33 + 1; demais statuses inalterados). As reservas associadas foram corretamente liberadas pela mesma limpeza (ver validação).

## Validação pós (evidência no banco)

- **0 QUEUED, 0 RUNNING** — `groupBy(status)`: FAILED 490 · SUCCEEDED 316 · SUCCEEDED_PARTIAL 72 · CANCELLED 45.
- Reservas de jobs cancelados: `CANCELLED | RELEASED | CANCELLED` = **25**; **0 reservas `RESERVED` restantes em jobs `CANCELLED`** — sem órfãs do escopo da limpeza.
- Histórico e produtos intactos: nenhum `delete`; apenas updates de status em jobs ativos e suas reservas.

## Inconsistências pré-existentes encontradas — NÃO mutadas (fora do escopo; decidir antes de qualquer ação)

Ciclo canônico da reserva: sucesso → `CONFIRMED` (`worker.ts:783`), falha/cancel → `RELEASED`; quota mensal agrega `RESERVED+CONFIRMED` (`service.ts:46`). Estado atual contraditório, pré-existente:

- **150 reservas `RESERVED` em jobs `SUCCEEDED`** (deveriam estar `CONFIRMED`) e apenas 10 `CONFIRMED` em `SUCCEEDED`.
- **216 reservas `CONFIRMED` em jobs `FAILED`** (deveriam estar `RELEASED`).

Como `RESERVED`/`CONFIRMED` contam contra a quota mensal (`service.ts:46`), esse acúmulo pode estar consumindo capacidade fantasma de tenants. Correção exige decisão de domínio (confirmar, liberar — e com qual `reason` — ou backfill por período), não é insumo desta limpeza. IDs de exemplo (prefixos): reserva `3f63ae94…`/job `e666ce43…`, reserva `ce65c23a…`/job `61c90033…`, reserva `e8a9a9fd…`/job `c007f7cc…`.

## Reversibilidade e artefatos

- Snapshot pré-mutação: `%TEMP%\gate7-backup-2026-09-15T22-23-19-233Z.json` (vazio de mutações — capturou 0 ativos, pois a limpeza já havia ocorrido).
- Script one-shot: `%TEMP%\gate7-cancel-one-shot.mts` — fora do repo, sem commit, reutilizável (guard de status impede dupla aplicação).
- Reverter a limpeza efetivada pela sessão paralela exigiria restaurar 34 jobs para QUEUED/RUNNING com leases e reservas `RESERVED` — não há caminho de domínio para isso e não foi autorizado; o caminho canônico de reprocessamento é `/retry` (jobs `CANCELLED` são retryable por `RETRY_ALLOWED_STATUSES`).
- Worker: **não reiniciado**.

## Comandos (reproduzíveis)

```sh
# Inventário read-only
psql -h localhost -U postgres -d commerce_intelligence -c "SELECT status, count(*) FROM commerce_intelligence_jobs GROUP BY status;"

# One-shot (transação por job, guard de status, snapshot reversível)
npx tsx "C:/Users/mfernand/AppData/Local/Temp/gate7-cancel-one-shot.mts"
```
