# SPEC Gap Report — Slice 003

**Artefato auditado:** `docs/specs/slice-003/SPEC.md`
**Auditor:** Auditor (Analista de Requisitos) · **Data:** 2026-09-01
**Destinatário:** Escriba · **Revisão final:** Arquiteto (re-aprovação explícita necessária)

## Método

Leitura integral da SPEC e do PLAN, comparadas contra: `SLICES.md` (escopo e fronteiras dos Slices 003/004/005/008), `PRD.md` (§§ 8–12, 23–25, 30–34, 40–45, 58), `PRD-commerce-intelligence-engine.md` (integral), `PRD-product-intelligence-analysis.md` (§§ 1–31), `PRD-content-briefing.md`, `PRD-model-router-inteligence.md`, `SYSTEM-DESIGN.md`, `PRINCIPLES.md`, `DESIGN.md` (§§ 1–3, 7–11), ADRs 001–006, 008, 009, 012–015, `framework/prompts/09-criar-spec.md` e o estado real do repositório (schema Prisma, módulos, rotas, componentes). Critérios: comportamentos, boundaries entre slices, EARS/rastreabilidade, segurança, UX e estrutura exigida pelo prompt 09.

## Veredicto

A SPEC é fiel às fontes canônicas nos contratos canônicos (campos obrigatórios/opcionais), ordem da pipeline, Fact Validator, gates/repair determinísticos (conflito com PRD da engine resolvido e registrado via ADR-004/SLICES), mapa de tiers do Model Router, Skill versionada, memória vazia/sinais, job/lease/retry idempotente, reserva no mês UTC, stages/mensagens, indicador global e acessibilidade. Estrutura exigida pelo prompt 09 completa; 44 ACs em EARS; tabela de rastreabilidade com 21 requisitos. **Nenhuma lacuna blocking.** Foram encontrados **2 achados major e 7 minor**.

## Achados

| ID | Severidade | Tema |
|---|---|---|
| S1 | **major** | Reanálise de Product `READY` indefinida; colide com RI-003-07 e antecipa Slice 008 |
| S2 | **major** | Política de exclusão de Product existe só no PLAN, sem âncora na SPEC |
| S3 | minor | Filtro `Pendente` e cards de readiness não explícitos na SPEC |
| S4 | minor | Origem/ciclo de vida da chave idempotente da tentativa não definidos |
| S5 | minor | `structure` ausente da enumeração de campos opcionais do Briefing v1 |
| S6 | minor | Desvio de rótulo vs DESIGN (`Gerar novamente` → `Tentar novamente`) não registrado |
| S7 | minor | Detecções exemplificativas do PRD engine §37 não citadas em B-003-09 |
| S8 | minor | AC 39 agrupa dois requisitos num critério só |
| S9 | minor | Chave do `BriefValidationReport` (`briefId` vs `contentId+briefVersionId`) sem registro |

### S1 (major) — Reanálise de Product `READY` indefinida

- **Onde:** §8 `succeeded` ("…e libera nova análise") + §8 `idle`; RI-003-07; Out of Scope; `SLICES.md` 396–416 (Slice 008).
- **Problema:** "libera nova análise" é ambíguo entre (a) liberar a trava global de um job ativo e (b) permitir novo job sobre o **mesmo** Product `READY`. O PLAN (Tarefa 8) materializa a leitura (b): `Analisar produto` aparece para "Product ativo sem Job", incluindo `READY`. Uma segunda execução sobre o mesmo Product não tem comportamento definido neste slice: ou criaria segunda `ProductStrategy` `ACTIVE` (viola RI-003-07) ou reutilizaría a Strategy ativa com memória (comportamento do Slice 008 — recorrência, reuso de Strategy, regra `STALE`/`SUPERSEDED`).
- **Correção recomendada:** declarar em B-003-12/B-003-13 e no estado `succeeded` que, neste slice, Product `READY` **não** oferece reanálise do mesmo Product (a ação de nova geração pertence ao Slice 008); "libera nova análise" refere-se apenas à liberação da trava de job ativo por usuário. Alternativa (não recomendada): definir máquina de Strategy v2/`SUPERSEDED` neste slice — expande escopo.

### S2 (major) — Política de exclusão de Product sem âncora na SPEC

- **Onde:** ausente na SPEC; presente no PLAN (Tarefa 3/§8: `PRODUCT_HAS_HISTORY`, `PRODUCT_DELETE_UNSUPPORTED`, DELETE sempre rejeitado, `Arquivar produto` como única remoção, decremento de `activeProductsUsed` no archive).
- **Problema:** o PRD.md §36 adia explicitamente a política de hard/soft delete; a SLICES 003 não a menciona. O PLAN institui a política sozinho, alterando rotas existentes do Slice 002 (`DELETE /api/products/:id` hoje é físico) — quebra a rastreabilidade SPEC→PLAN reivindicada no §9 do PLAN e toma decisão de persistência/preservação de dados sem fonte canônica (AGENTS.md exige deliberação, não decisão tácita de plano).
- **Correção recomendada:** registrar na SPEC a regra de preservação (novo RI + códigos na §7 + AC), com a política archive-only justificada pela preservação de memória (ADR-004) e do contador `active_products`; ou, se o Arquiteto decidir adiar, remover do PLAN.

### S3 (minor) — Filtro `Pendente`/cards de readiness não explícitos

- **Onde:** `SLICES.md` 003 ("readiness do Produto alimenta o filtro `Pendentes`"); B-003-13 diz apenas que o Product "aparece como `Pendente`/`Analisando`", sem dizer onde; nenhum AC cobre o filtro da lista.
- **Correção:** explicitar em B-003-13 (e num AC) que a readiness alimenta badges nos cards e o filtro `Pendente` da lista de Produtos.

### S4 (minor) — Chave idempotente da tentativa

- **Onde:** B-003-10/RI-003-16 falam em "chave lógica" sem origem; o PLAN (§3.1/Tarefa 7) define `Idempotency-Key` gerada pelo cliente por ação intencional, com fingerprint e replay.
- **Correção:** definir na SPEC a origem e o ciclo de vida da chave (gerada por ação intencional do creator, validada server-side; mesma chave+contexto ⇒ mesmo job; fingerprint divergente não cria nova linha).

### S5 (minor) — Campo `structure` do Briefing v1

- **Onde:** PRD.md §45 inclui `structure?: string` em `ContentBriefVersion`; B-003-08/AC 24 enumeram opcionais sem `structure` (o catch-all "demais campos canônicos opcionais" cobre a SPEC, mas o validador do PLAN lista campos sem ele — risco de rejeição do campo canônico).
- **Correção:** incluir `structure` entre os opcionais enumerados.

### S6 (minor) — Rótulo de ação para `CANCELLED`

- **Onde:** DESIGN.md §8 (L760) reserva `Gerar novamente` para `cancelled` (nota L762 admite retry pós-cancelamento); SPEC unifica `Tentar novamente`.
- **Correção:** manter a unificação se desejado, mas registrar a decisão como desvio consciente da matriz do DESIGN.

### S7 (minor) — Detecções do PRD engine §37

- **Onde:** B-003-09 lista as detecções obrigatórias, mas omite "quantidade de cenas válida para o formato" e "duplicata por hash de estrutura" (lista exemplificativa do PRD §37).
- **Correção:** citá-las entre as detecções (ou registrar que ficam sob o Golden Dataset).

### S8 (minor) — AC 39 não atômico

- **Onde:** AC 39 empilha derivação `PENDING` e `ANALYZING` num só critério.
- **Correção:** separar em dois ACs para atomicidade EARS.

### S9 (minor) — Chave do `BriefValidationReport`

- **Onde:** PRD engine §40 usa `briefId`; SPEC B-003-09 e PLAN §4.1 usam `contentId`+`briefVersionId`.
- **Correção:** registrar na SPEC o mapeamento da chave (coerente com versionamento), evitando leitura de contrato divergente.

## Confirmado conforme (síntese)

Quantidade 1–30 resolvida server-side e estável; `active_products` e reserva mensal transacionais no mês UTC de origem; um job ativo por usuário com `Analisar produto` visível-desabilitado; 8 stages com mensagens pt-BR idênticas ao PRD de análise; lease/reclaim/backoff/limite; retry técnico (mesmo job/chave/reserva) vs retry explícito (novo job/chave/reserva); falha preserva Product/fatos; exatamente N Contents `DRAFT` com BriefVersion v1 imutável e `approvedBriefVersionId` ausente; contratos canônicos campo a campo (ProductUnderstanding, CommercialOpportunity, ProductStrategy, ContentPlan, ContentOpportunity, BriefValidationReport); Fact Validator com os 4 estados e destinos corretos; gates determinísticos (conflito LLM-as-judge registrado e resolvido por ADR-004/SLICES); tiers MID/HIGH idênticos ao PRD do router; Skill `tiktok-commerce@1.0` versionada nos 3 artefatos e fail-closed; memória vazia e sinais só em `SUCCEEDED`; sem sucesso parcial; tenant/CSRF/prompt-injection/erros sanitizados; estrutura e seções exigidas pelo prompt 09 completas.

## Encerramento

Corrigir (ou justificar) cada achado nesta SPEC e submeter a re-revisão do Arquiteto até `APPROVED` explícito. Relatório irmão: `docs/reports/slice-003/PLAN-GAP-REPORT.md` — os achados P1–P3 dependem das decisões de S1–S2 e devem ser resolvidos de forma coordenada.
