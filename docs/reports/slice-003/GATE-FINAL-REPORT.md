# Slice 003 — Status Oficial do Gate Final (Backend)

Data: 2026-09-03 · Ramo: `feat/slice-003-commerce-intelligence` · Autor: Backend Developer

## 1. Gate de proveniência (`provenance.test.ts`) — RESOLVIDO

**Causa raiz (evidência no banco, não suposição):**

- Migration `20260903120000_slice003_gate_provenance` aplicada em `2026-09-03T01:51:22Z` (`_prisma_migrations.finished_at`).
- `brief_validation_reports`: 51 linhas — 34 anteriores à migration com `claimType`/`evidenceRefs` **NULL** (zero backfill, invariante real da migration aditiva); 17 posteriores à migration, **populadas pelo worker** em runs reais de geração (`worker.ts` persiste `report.claimType`/`report.evidenceRefs` para todo job `SUCCEEDED` pós-migration): job `bca07cce…` (smoke `count=1`, 1 report) e job `292d6782…` (smoke `count=16`, 16 reports).
- Contagem condicionada: `populated_before_migration = 0`, `populated_after_migration = 17`.

O teste comparava `COUNT(*)` da **tabela inteira** contra 0, enquanto a asserção pretendia apenas "nenhum valor inventado em relatórios **anteriores**". Os 17 registros são proveniência legítima pós-migration (ADR-003), não dados inventados. **O gate estava errado; os dados estavam certos.**

**Correção:** `c88fd46` — o teste agora ancora em `_prisma_migrations.finished_at` e verifica `createdAt < finished_at AND (claimType IS NOT NULL OR evidenceRefs IS NOT NULL) = 0`, mantendo as asserções de colunas/nullable. Nenhum dado destruído; nenhum frontend alterado.

**Verificação:** `provenance.test.ts` 3/3 · suíte completa `npm test` 124/124 · `typecheck` limpo · `lint` limpo · `npm run build` ok.

## 2. Smoke autenticado `count=1` / `count=16` — REGISTRADO (PLANEJADA Tarefa 9 / Validação 7)

| Job | count | Status | Exact-N |
|---|---|---|---|
| `bca07cce-8b24-4361-9707-7f327d631070` | 1 | `SUCCEEDED` | 1 Content / 1 BriefVersion / 1 Report / 1 Strategy |
| `292d6782-9ff9-4f18-b456-3d62119cb9f2` | 16 | `SUCCEEDED` | 16 Contents / 16 BriefVersions / 16 Reports / 1 Strategy |

Proveniência dos relatórios (`claimType`/`evidenceRefs`) gravada nesses runs — evidência viva de ADR-003 (geração imutável + vínculos) e ADR-012 (evidência factual nos gates).

## 3. Golden Dataset — **MANTIDO `BLOCKED`** (conforme PLAN L286/L334/Val.13; não declarável concluído)

**Nada no repositório** implementa dataset, runner ou limiar (busca exaustiva por golden/dataset/eval/fixture/seed: único match é `current-job-regression.test.ts`, teste de job ativo, não eval).

**Pré-requisitos para destravar (todos externos à competência backend isolada):**

1. **Fixture aprovado** — ≥8 produtos reais das categorias do PRD engine §62 (beleza, casa, automotivo, eletrônicos, fitness, cozinha, acessórios, organização), com fatos canônicos congelados; entrada: curadoria de Produto/arquitetura aprovar os produtos.
2. **Hash do dataset** — artefato versionado no repo (ex.: `evals/golden/*.json`) + checksum SHA-256 registrado; requer (1).
3. **Limiares quantitativos aprovados** — metas de factualidade, variedade, naturalidade, custo, latência, taxa de schema inválido e repair. Hoje **nenhum documento define números**; decisão Arquiteto + Produto.
4. **Runner de regressão** — script executando `runFirstGeneration` com provider real (env `LLM_*` já configurado) por produto, gravando `IntelligenceRun` e comparando contra baseline anterior de Engine/Skill/Router. Requer (1)(2)(3).
5. **Baseline versionado** — resultado da versão corrente (`tiktok-commerce@1.0`) antes de qualquer comparação de regressão. Requer (4).

Bloqueio de escopo: sem fixture/hash/limiares **aprovados**, qualquer runner que eu escrevesse produziria números sem critério de aceite — exatamente o que o PLAN proíbe ("sem artefato/hash/limiares aprovados, o gate permanece BLOCKED").

## 4. Veredito oficial

- Gate de proveniência: **APROVADO** (correção de teste com causa raiz comprovada; dados intactos).
- Smoke `count=1`/`count=16` e registro de proveniência ADR-003: **APROVADO** (jobs `SUCCEEDED` com exact-N).
- Golden Dataset: **BLOCKED** — aguardando itens 1–3 acima. A engine **não** é declarável plenamente validada/production-ready até o gate fechar.
