# ADR-025: Batching semântico de curadoria e repair

## Status

**Registro histórico superseded:** a decisão original foi aceita após a rodada real `0e94549e-1391-47b5-82a1-51bbb2890aff` do Product `170c01ff-23cd-457f-9e2e-af71b451932c`, que encerrou `SUCCEEDED_PARTIAL` com 3/5 conteúdos, 37 chamadas, 13 Judges, 10 Content Part Repairs, 14 partes `REPAIR`, zero `REJECT`, dois rounds globais, cenas disponíveis e 578,5 s acumulados. A qualidade dos conteúdos entregues foi aprovada pelo usuário; as regras normativas atuais estão na seção Decisão abaixo e no design de 2026-09-18.

## Contexto

A composição atual chama `CONTENT_QUALITY_JUDGE` por Content e `CONTENT_PART_REPAIR` por tupla `(Content, parte, round)`. Isso preserva isolamento, mas faz a mesma instrução e o mesmo contexto de produto/creator/skill atravessarem o provider repetidamente. A rodada real confirmou qualidade, mas revelou custo/latência altos e um vazamento editorial no script do Content 02 (uma instrução de objeto que pertence a cenas). O vazamento não é claim factual, não viola o hard gate vigente e não tem critério explícito no Judge.

O contrato vigente desta decisão é:

1. O hard gate determinístico é autoridade factual, estrutural e de variedade objetiva; LLM não decide regras de sistema (ADR-004, ADR-012, ADR-019).
2. `CONTENT_QUALITY_JUDGE`/HIGH é obrigatório por `hook`, `development`, `script`, `cta` e `scenes`; retorna somente `PASS|REVIEW`. `PASS` preserva a parte; `REVIEW` é seletivo e pode acionar repair uma única vez. Não existe `REJECT` semântico.
3. Há uma avaliação inicial; não há re-Judge após repair. Falha, schema inválido ou impossibilidade de aplicação preserva a parte original.
4. Quando os hard gates objetivos passam, o Content é entregue em `DRAFT`. `SUCCEEDED_PARTIAL` só decorre de falha objetiva/composição objetivamente inválida conforme ADR-021.
5. `ContentSceneSet` continua separado de `ContentBriefVersion`; cenas objetivamente válidas continuam condição dos hard gates da composição (ADR-019).

## Decisão

### 1. Batching é transporte, não mudança semântica

Batching reduz chamadas ao provider; não altera a unidade de decisão, reparo, validação, persistência, quota, telemetria ou publicação. A unidade semântica permanece `Content` + `QualityPart` + `round`.

Todo retorno em lote usa somente `contentId` server-derived como identidade. Posição do array não é identidade. Antes de recompor qualquer conteúdo, a engine exige: conjunto exato dos IDs enviados, sem IDs extras, ausentes ou duplicados; shape estrito; uma saída por ID; e validação individual da parte retornada. Falha ou timeout de um lote não aprova seus irmãos; os itens do lote são isolados para tratamento de falha já previsto, sem repetir o job inteiro.

### 2. Judge em lote

`CONTENT_QUALITY_JUDGE` recebe até três Contents por chamada e devolve uma auditoria por `contentId`, cada uma com exatamente as cinco partes canônicas. O lote é homogêneo: mesmo Product, Job, EvidenceSnapshot, Creator Context, Skill e round.

O Judge roda uma única vez para os itens aprovados nos hard gates objetivos. A decisão por parte é somente `PASS|REVIEW`, com critérios allowlisted e motivos sanitizados. `PASS` preserva a parte; `REVIEW` marca somente aquela parte para repair. Não há re-Judge após repair, e nenhuma decisão semântica reprova o Content ou o converte em faltante.

O limite inicial é três Contents. Não é configuração do cliente nem superfície de produto. Ele limita blast radius de resposta malformada, contexto e mistura entre irmãos. Aumentar o limite exige avaliação comparativa aprovada; diminuir é permitido como proteção operacional por configuração server-side allowlisted.

### 3. Repair em lote somente quando homogêneo

`CONTENT_PART_REPAIR` agrupa apenas reparos das mesmas `QualityPart` e rodada lógica, em até três Contents por chamada. A resposta contém `{ items: [{ contentId, content }] }`.

- `hook`, `script` e `cta`: máximo três itens por lote.
- `development`: máximo dois itens por lote; mantém seu contrato estruturado de grounding/factRef/action/rationale por item.
- `scenes`: permanece individual. O conjunto depende de âncoras lexicais do briefing específico, requisitos de creator solo e pode contaminar referências entre Contents.

Não se agrupam partes diferentes, Products diferentes, jobs diferentes ou contextos de creator/skill diferentes. O repair ocorre no máximo uma vez para cada parte marcada `REVIEW`. Falha, schema inválido ou impossibilidade de aplicação mantém a parte original. Judge e repair continuam HIGH; não há fallback de tier/modelo.

### 4. Ordem invariável da pipeline

A geração inicial de `CONTENT_BRIEF_GENERATION` continua no lote do Job. Hard gates objetivos continuam locais/determinísticos por Content e Variety Gate continua sobre o conjunto completo; `Hard Gate Repair` objetivo, quando necessário, termina dentro de `GENERATION_MAX_REPAIRS` antes de o candidato entrar no Judge. Só então os candidatos hard-valid entram nos lotes de Judge. Após o `Semantic Part Repair` seletivo, a engine recompõe por `contentId` e revalida somente os hard gates objetivos antes de publicar; não executa Judge novamente. Quando os gates objetivos passam, o resultado permanece `DRAFT`, inclusive se uma parte em `REVIEW` tiver usado o fallback original.

### 5. Fronteira editorial de script e cenas

`script` é fala/ação performável pelo creator; não pode conter metacomentário de montagem, instrução de objeto, enquadramento ou orientação visual destinada a `scenes`. `scenes` contém a instrução visual gravável. O Judge pode marcar a parte como `REVIEW`; o repair é seletivo e único. O hard gate objetivo continua responsável por claims, estrutura e validade factual. A regra não deve proibir verbos naturais de fala/ação do creator.

## Avaliação e critérios de evolução

O caso `0e94549e-1391-47b5-82a1-51bbb2890aff` permanece avaliação de transporte e qualidade, sem criar plataforma de eval. As expectativas passam a ser:

- hard gates objetivos, cenas válidas e entrega `DRAFT` preservados;
- exatamente uma avaliação inicial, repairs apenas das partes `REVIEW` e nenhum re-Judge;
- partes `PASS` intactas e fallback original quando repair falhar;
- IDs/cardinalidade de batches e redução de chamadas comparáveis antes/depois;
- nenhuma ocorrência de `REJECT`, `unsupported_persuasion`, `QUALITY_PENDING` ou bloqueio por estilo.

A implementação deve demonstrar, em testes de contrato e no caso reduzido, que o batching não mistura Contents, que o repair não altera partes não marcadas e que falhas objetivas continuam bloqueando. Não há meta fixa de custo; qualquer aumento do limite de três, batching de cenas, troca de tier/modelo ou novo fallback exige evidência e decisão registrada.

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Manter todas as chamadas individuais | Rejeitada | A rodada real demonstrou repetição material de contexto e latência sem ganho de isolamento adicional para Judge/parts homogêneas. |
| Mandar todas as partes e Contents em uma chamada | Rejeitada | Contratos de saída diferentes e contaminação entre irmãos tornam falhas não localizáveis. |
| Batch por posição de array | Rejeitada | Índice não é identidade estável; IDs server-derived evitam aplicação no Content errado. |
| Batch de cenas | Rejeitada por ora | Maior risco de mistura de objeto, referências lexicais e requisito de produção solo. |
| Remover Judge e confiar no hard gate | Rejeitada | Hard gate não avalia naturalidade, coerência comercial e separação editorial ambígua. |
| Transformar todo defeito editorial em regex ampla | Rejeitada | Falso positivo bloquearia fala creator-first legítima; detector deve ser estreito e reparável. |

## Consequências

- Positivas: reduz duplicação de contexto e chamadas HIGH, mantém decisões por Content/parte, limita blast radius e preserva todas as garantias de qualidade e publicação.
- Negativas: contratos de provider ficam mais complexos; validação de IDs/cardinalidade é obrigatória; uma resposta de lote malformada pode exigir repartir somente aquele lote; limite três pode não ser ótimo e deve ser validado pela rodada real.
- Não há migration, mudança de quota, endpoint, UI, feature flag, provider adicional ou abstração transversal nova.

## Relações

- ADR-004, ADR-012, ADR-019, ADR-020, ADR-021.
- SYSTEM-DESIGN § Commerce Intelligence.
- SPEC slice-003 B-003-05 e tabela de falhas de geração.
