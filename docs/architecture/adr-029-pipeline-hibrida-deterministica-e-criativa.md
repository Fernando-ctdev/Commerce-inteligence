# ADR-029: Pipeline híbrida determinística e criativa

## Status
Aceito.

## Contexto
A Commerce Intelligence precisa reduzir retries evitáveis, custo e latência sem transferir interpretação comercial, copy ou direção visual para templates determinísticos. O contrato anterior de `QUALITY_PENDING` criou um estado sem implementação de produção e conflita com o contrato semântico atual de `PASS|REVIEW`.

## Decisão

1. **Plano híbrido.** O servidor aloca quantidade, IDs, posições, slots, buckets elegíveis e tetos de variedade. O LLM preenche somente objetivo comercial, ângulo, mensagem central, mecanismo de hook dentro do allowlist e intenção de novidade.
2. **Cenas criativas.** `CONTENT_SCENE_IDEAS` permanece LLM-owned por Content. O servidor somente valida ação observável, ancoragem no Produto, fatos, restrições do creator, unicidade e mínimo exigido; não há catálogo, template ou fallback determinístico de cenas.
3. **Hard gates determinísticos.** Schema, ownership, cardinalidade, referências de evidência autorizadas, factualidade, CTA, connectors, duplicatas, variedade e resultado final são regras server-side. `factRefs` são propostas do modelo e nunca inferidas silenciosamente pelo código.
4. **Judge semântico limitado.** Após hard gates, `CONTENT_QUALITY_JUDGE` avalia em batches homogêneos de até três Contents e retorna somente `PASS|REVIEW` por `contentId` e parte (`hook`, `development`, `script`, `cta`, `scenes`). Não decide factualidade, variedade, estado, quota ou publicação.
5. **Dois repairs, duas autoridades.** `Hard Gate Repair` é objetivo: ocorre antes do Judge somente para candidate reprovado por hard gate, chama `CONTENT_BRIEF_REPAIR` por item com causas server-derived, substitui o BriefDraft completo e revalida o conjunto, inclusive variedade. Seu limite é `GENERATION_MAX_REPAIRS` (configuração server-side; default atual `2`); exaustão permanece falha objetiva e segue ADR-021. `Semantic Part Repair` ocorre somente depois de hard gate `PASS`: cada parte `REVIEW` recebe um `CONTENT_PART_REPAIR`, uma vez; partes `PASS` e reparos inválidos preservam o original. Não há re-Judge, round semântico adicional, fallback semântico de tier/modelo ou conteúdo determinístico.
6. **Ordem e entrega.** Brief Generator → hard gates → `Hard Gate Repair` limitado → cenas válidas → Judge → `Semantic Part Repair` único → hard gates/variedade finais. Somente os gates objetivos são autoridade de entrega: conteúdo objetivamente válido persiste em `DRAFT`; falha objetiva segue ADR-021: `SUCCEEDED_PARTIAL` somente para itens objetivamente não entregáveis dentro do CAP; caso contrário `FAILED`.
7. **Proveniência e orçamento.** `IntelligenceRun` interno registra versões de política, gates, engine e Skill, além de usage, custo, latência e retries. A linha de base é uma chamada para Understanding, Mapping, Strategy e Plan, mais `ceil(N / batchSize)` batches de Brief (`batchSize` 4–8), cenas por Content e Judge em batches de até três; somam-se somente os retries limitados desta decisão.

### Mapa canônico de runtime

Esta tabela descreve o `ROUTER_MAP` atual. Tier é configuração operacional, evolutiva somente por evals de qualidade/custo/latência; não é contrato de produto nem varia por plano comercial. Fallback de disponibilidade só sobe `LOW → MID → HIGH` para timeout, conexão ou HTTP elegível; schema, factualidade e gates falham fechados.

| Capability lógica | Tier runtime atual | Retries / fallback | Autoridade |
| --- | --- | --- | --- |
| `PRODUCT_UNDERSTANDING` | `HIGH` | Um retry de contrato; `HIGH` é terminal para fallback. | LLM propõe entendimento; schema/fatos server-side decidem. |
| `COMMERCIAL_OPPORTUNITY_MAPPING` | `MID` | Um retry de contrato; disponibilidade pode subir `MID → HIGH`. | LLM propõe mapeamento; schema/evidência server-side decidem. |
| `STRATEGY_SYNTHESIS` | `HIGH` | Sem retry de capability; sem fallback acima de `HIGH`. | LLM sintetiza; contrato server-side valida. |
| `CONTENT_PLAN_GENERATION` | `HIGH` | Um retry causal de contrato/variedade; sem fallback acima de `HIGH`. | Servidor possui skeleton/slots; LLM possui somente campos criativos. |
| `CONTENT_BRIEF_GENERATION` | `HIGH` | Um retry de contrato por batch; sem fallback acima de `HIGH`. | LLM cria o BriefDraft; hard gate decide elegibilidade. |
| `CONTENT_BRIEF_REPAIR` (`Hard Gate Repair`) | `HIGH` | Até `GENERATION_MAX_REPAIRS` rounds objetivos; sem fallback acima de `HIGH`. | Hard gate é autoridade; falha objetiva segue ADR-021. |
| `CONTENT_SCENE_IDEAS` | `HIGH` | Até duas tentativas por Content; sem fallback acima de `HIGH`. | LLM cria cenas; gate de cenas decide disponibilidade. |
| `CONTENT_QUALITY_JUDGE` | `HIGH` | Sem retry semântico; falha isolável não vira `PASS`. | Judge só marca `PASS|REVIEW`; não publica nem bloqueia. |
| `CONTENT_PART_REPAIR` (`Semantic Part Repair`) | `HIGH` | Uma passagem por parte `REVIEW`; sem fallback acima de `HIGH`. | LLM propõe só a parte; original é preservado se inválido; hard gate final decide. |

## O que não muda

- Product Understanding, oportunidades, Strategy, ângulos, hooks, texto, CTA, scripts, cenas e variação persuasiva permanecem criativos e LLM-owned.
- Retry técnico continua idempotente; `GEN-PATTERN` e `GEN-VARIETY` preservam os caminhos causais existentes.
- Nenhum provider, dependência, UI, embedding, memória semântica, template de cena ou mudança de quota é introduzido.

## Supersedes

Este ADR supersede ADR-027 `Publicação com QUALITY_PENDING após repair semântico esgotado`. `QUALITY_PENDING`, `REJECT` semântico, re-Judge e publicação condicionada a convergência editorial não fazem parte do contrato de produção.

## Relações

ADR-012, ADR-013, ADR-014, ADR-019, ADR-020, ADR-021, ADR-025 e SPEC Slice 003.
