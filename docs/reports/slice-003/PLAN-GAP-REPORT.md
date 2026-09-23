# PLAN Gap Report — Slice 003

**Artefato auditado:** `docs/plans/slice-003/PLAN.md`
**Auditor:** Auditor (Analista de Requisitos) · **Data:** 2026-09-01
**Destinatário:** Cartografo · **Revisão final:** Arquiteto (re-aprovação explícita necessária)

## Método

Leitura integral do PLAN e da SPEC, comparadas contra: `SLICES.md` (escopo e fronteiras 003/004/005/008), PRDs (geral, engine, análise, briefing, router), `SYSTEM-DESIGN.md`, `PRINCIPLES.md`, `DESIGN.md`, ADRs 001–006, 008, 009, 012–015, `framework/prompts/10-criar-plan.md` e **verificação claim-a-claim do estado real do repositório** (schema Prisma, `src/modules`, `src/app/api`, `src/components/products`, `scripts/`, `package.json`). Critérios: completude vs SPEC, estado real do repo, persistência/migration, segurança, testes, UX e estrutura exigida pelo prompt 10.

## Veredicto

As claims de estado real do repositório (§2) e as premissas das Tarefas 7–9 batem com o repo em ~99% (identidade, Product, UI, shell, geração legada, entitlements, worker, testes). Estrutura do prompt 10 completa; sem infraestrutura especulativa (fila PostgreSQL, sem Redis/daemon). **Nenhum achado blocking.** Foram encontrados **3 achados major e 8 minor**.

## Achados

| ID | Severidade | Tema |
|---|---|---|
| P1 | **major** | `Analisar produto` oferecido para Product `READY` — reanálise é Slice 008 e colide com RI-003-07 |
| P2 | **major** | Política DELETE/archive instituída sem âncora na SPEC (rastreabilidade quebrada) |
| P3 | **major** | Regras de conteúdo do Briefing v1 (B-003-08) sem tarefa responsável; §9 afirma rastreabilidade total |
| P4 | minor | §1/§2 ignoram `ProductImportAttempt` (schema Slice 002, com lease/QUEUED) |
| P5 | minor | §2 vs Tarefa 8: filtros de readiness inconsistentes (`Pendente/Analisando/Pronto/Falhou` vs filtro `Pendente`) |
| P6 | minor | Estado `blocked` ausente da enumeração de UI da Tarefa 8 e da matriz de testes |
| P7 | minor | Assinatura da engine omite "Creator Context aplicável" (SPEC B-003-04; PRD engine §23/§32) |
| P8 | minor | Validador sem `structure`; chave do report (`contentId+briefVersionId` vs `briefId`) sem registro do desvio |
| P9 | minor | "glass apenas no shell/toolbar" mais restrito que DESIGN/SPEC (shell/toolbar/**sheet**) |
| P10 | minor | Health check mínimo do worker ausente (ADR-001); scaffold vazio `src/app/api/health/generation/` |
| P11 | minor | Observações de repo não registradas (GenerationPanel é dead code; server-side já valida 1–30) |

### P1 (major) — Reanálise de Product `READY`

- **Onde:** Tarefa 8: "No Product ativo sem Job, mostrar uma única ação `Analisar produto`".
- **Problema:** inclui Product `READY` (job terminal `SUCCEEDED`). Segunda execução sobre o mesmo Product não tem comportamento definido no Slice 003: criaria segunda `ProductStrategy` `ACTIVE` (viola RI-003-07 da SPEC) ou reutilizaría Strategy+memória (machinery de recorrência do Slice 008 — `SLICES.md` 396–416). Ver achado S1 do `SPEC-GAP-REPORT.md`.
- **Correção recomendada:** restringir `Analisar produto` aos Product `ACTIVE` **sem resultado publicado** (`PENDING`/recuperação pós-falha via `Tentar novamente`); em `READY`, oferecer apenas `Revisar conteúdos`. Aguardar/alinhar com a decisão de S1 na SPEC antes de implementar.

### P2 (major) — Política de exclusão sem âncora na SPEC

- **Onde:** Tarefa 3/§8: `PRODUCT_HAS_HISTORY`, `PRODUCT_DELETE_UNSUPPORTED`, DELETE sempre rejeitado, `Arquivar produto` como única remoção, decremento atômico de `activeProductsUsed`.
- **Problema:** nenhum desses códigos/comportamentos existe na SPEC (§7, B-xx, RI, AC). O PRD.md §36 adia a política de delete; a decisão de persistência/preservação fica tomada só no plano, quebrando a rastreabilidade reivindicada no §9 e a regra do AGENTS.md sobre deliberação de mudança relevante. Estado real confirmado: `DELETE /api/products/:id` é físico hoje e precisa de tratamento — mas via SPEC.
- **Correção:** aguardar a âncora na SPEC (achado S2) e então manter a Tarefa 3 alinhada a ela; alternativa: se o Arquiteto adiar a política, remover do PLAN.

### P3 (major) — Regras de conteúdo do Briefing v1 sem dono

- **Onde:** SPEC B-003-08 (L178): "distingue decisão estratégica de fala sugerida, mantém cenas simples para creator comum, usa linguagem oral e não exige leitura literal do script". No PLAN: Tarefa 1 valida só estrutura; Tarefa 4 valida que a Skill tem `principles/executionRules/patterns/validationRules` sem citar essas regras; Tarefa 5 não as atribui aos prompts do Brief Generator; os gates são determinísticos e incapazes de testá-las; o Golden Dataset (validação 10) está `BLOCKED` sem fixture.
- **Problema:** frase normativa da SPEC mapeada a S003-12 (Tarefas 1/5/6) fica sem tarefa/gate correspondente — o §9 do PLAN ("todos os 21 requisitos e 44 ACs com tarefa/teste correspondente") não se sustenta para esse trecho.
- **Correção:** atribuir explicitamente as regras à Skill (conteúdo de `validationRules`) e aos prompts do Brief Generator (Tarefas 4/5), com verificação por contract test do conteúdo da Skill.

### P4 (minor) — `ProductImportAttempt` ignorado

- **Onde:** §1 ("não há importação/Candidate server-side") e §2 ("não há job…").
- **Problema:** `prisma/schema.prisma` define `ProductImportAttempt` (status `QUEUED`, `leaseOwnerId`/`leaseDeadlineAt`, índices `(tenantId,status)`/`(status,leaseDeadlineAt)`). Não há módulo/rotas que o processem — a claim materialmente correta para fluxos, mas imprecisa para a camada de persistência; e o precedente de lease é reutilizável na Tarefa 6.
- **Correção:** ajustar a redação de §1/§2 e citar o precedente na Tarefa 6.

### P5 (minor) — Filtros de readiness inconsistentes

- **Onde:** §2 (tabela Product UI): "incluir `Pendente`/`Analisando`/`Pronto`/`Falhou` nos cards e filtros"; Tarefa 8: "filtro `Pendente`" (correto, alinhado a PRD §§39/42 e SLICES).
- **Correção:** alinhar §2 — badges de readiness nos cards + filtro `Pendente` apenas.

### P6 (minor) — Estado `blocked` ausente da Tarefa 8

- **Onde:** SPEC §8 `blocked` + `GEN-ACTIVE`; DESIGN §8 L602 (visível-desabilitado com explicação).
- **Problema:** a enumeração de estados de UI da Tarefa 8 e a matriz de testes §7 não exercitam a representação visual do bloqueio (job ativo ou falta de capacidade).
- **Correção:** incluir estado/gate de teste.

### P7 (minor) — Creator Context

- **Onde:** SPEC B-003-04 carrega "Creator Context aplicável"; PLAN §3.5 recebe apenas snapshot de Product, restrições, memória vazia, Skill e porta do Router (PRD engine §23/§32 lista Creator Context na entrada do Brief Generator).
- **Correção:** alinhar com a SPEC (S10 do relatório irmão): ou incluir no snapshot autorizado o que for aplicável neste slice, ou registrar explicitamente que é ausente/vazio neste slice.

### P8 (minor) — Validador e chave do report

- **Onde:** §3.3/Tarefa 1: enumeração de opcionais do BriefVersion sem `structure` (PRD.md §45); §4.1: report keyeado por `contentId`+`briefVersionId` enquanto PRD engine §40 usa `briefId`.
- **Correção:** incluir `structure`; registrar o mapeamento da chave como desvio consciente (coerente com versionamento).

### P9 (minor) — Glass

- **Onde:** Tarefa 8 L253: "glass apenas no shell/toolbar". DESIGN §2 princípio 9/§8 autoriza shell/toolbar/**sheet**; a SPEC §8 (L352) já inclui sheet.
- **Correção:** alinhar a redação ao DESIGN (sem efeito prático neste slice).

### P10 (minor) — Health check do worker

- **Onde:** ADR-001 (Segurança/Operação): "O processo web e o worker precisam de health checks…". Tarefa 6 cria `scripts/worker.mts` sem health/liveness; §2 afirma "não existe health route" (confirmado: `src/app/api/health/generation/` é diretório vazio, sem `route.ts`).
- **Correção:** definir o mínimo (ex.: liveness simples no entrypoint do worker), sem sistema genérico de observabilidade.

### P11 (minor) — Observações de repo não registradas

- `GenerationPanel`/`generation-api`/`generation-ui-model` são dead code (nenhuma página/componente importa o painel) — a substituição da Tarefa 8 não quebra superfície alguma; registrá-lo reduz risco percebido.
- O server-side já valida `targetContentCount` ≤ 30 (`QUANTITY_MAX`) enquanto a UI antiga permite 50 — a migração de contrato já tem guarda server-side pronta.

## Confirmado conforme (síntese)

Claims de §2 corretas (Prisma com Product/TenantEntitlement/TenantPreference e nenhum modelo de geração; identidade com `resolveSession`/`requireSession`/`SESSION_COOKIE`/`sameOriginRequest`/`readJsonBody`; `service.ts`/`http.ts` de Product; filtros Todos/Ativos/Arquivados; shell com toolbar/header mobile sem indicador; geração legada com localStorage/1–50/vocabulário Generation/gating `readyForStrategy`; entitlements sem reconciliação transacional nem capacidade mensal; `scripts/` vazio; `test` com `tsx --test` sem os testes antigos; rotas de `/api/generations` só com diretórios vazios). Contratos §3.3 campo a campo com a SPEC/PRDs; tiers idênticos ao PRD do router; Skill `tiktok-commerce@1.0` fail-closed e sem derrubar o worker; pipeline §3.5 na ordem canônica; §4 com isolation relacional composto tenant/product, CAS de reserva, unique de memória e sem `ON DELETE CASCADE`; CAS/fencing/`failJobAndReleaseReservation` na Tarefa 6; segurança §6 (tenant server-side, CSRF, sanitização, nada de prompt/token em log); matriz de testes §7 e validações finais §8 (incl. Golden Dataset `BLOCKED` sem fixture aprovada); regra de ouro "provider ausente = falha recuperável, dependência essencial do worker = falha fechada no boot".

## Encerramento

Corrigir (ou justificar) cada achado neste PLAN e submeter a re-revisão do Arquiteto até `APPROVED` explícito. Relatório irmão: `docs/reports/slice-003/SPEC-GAP-REPORT.md` — P1/P2/P7 dependem das decisões de S1/S2/S9 e devem ser resolvidos de forma coordenada (SPEC primeiro).
