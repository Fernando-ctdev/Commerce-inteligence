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
5. **Repair seletivo único.** Somente parte `REVIEW` recebe `CONTENT_PART_REPAIR`, uma vez. Partes `PASS` permanecem intactas. Falha, schema inválido ou repair inaplicável preserva a parte original. Não há re-Judge, round adicional, fallback de tier/modelo ou conteúdo determinístico.
6. **Entrega.** Após a composição, hard gates são reexecutados. Conteúdo objetivamente válido persiste em `DRAFT`. Falha objetiva segue ADR-021: `SUCCEEDED_PARTIAL` somente para itens objetivamente não entregáveis dentro do CAP; caso contrário `FAILED`.
7. **Proveniência e orçamento.** `IntelligenceRun` interno registra versões de política, gates, engine e Skill, além de usage, custo, latência e retries. Custo base da geração é uma chamada para Understanding, Mapping, Strategy e Plan, mais `ceil(N / batchSize)` batches de Brief (`batchSize` 4–8), cenas por Content, Judge em batches de até três e repairs somente para partes `REVIEW`.

## O que não muda

- Product Understanding, oportunidades, Strategy, ângulos, hooks, texto, CTA, scripts, cenas e variação persuasiva permanecem criativos e LLM-owned.
- Retry técnico continua idempotente; `GEN-PATTERN` e `GEN-VARIETY` preservam os caminhos causais existentes.
- Nenhum provider, dependência, UI, embedding, memória semântica, template de cena ou mudança de quota é introduzido.

## Supersedes

Este ADR supersede ADR-027 `Publicação com QUALITY_PENDING após repair semântico esgotado`. `QUALITY_PENDING`, `REJECT` semântico, re-Judge e publicação condicionada a convergência editorial não fazem parte do contrato de produção.

## Relações

ADR-012, ADR-013, ADR-014, ADR-019, ADR-020, ADR-021, ADR-025 e SPEC Slice 003.
