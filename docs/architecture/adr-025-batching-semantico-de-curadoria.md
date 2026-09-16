# ADR-025: Batching semântico de curadoria e repair

## Status

Aceito — decisão do usuário após a rodada real `0e94549e-1391-47b5-82a1-51bbb2890aff` do Product `170c01ff-23cd-457f-9e2e-af71b451932c` encerrar `SUCCEEDED_PARTIAL` com 3/5 conteúdos, 37 chamadas, 13 Judges, 10 Content Part Repairs, 14 partes `REPAIR`, zero `REJECT`, dois rounds globais, cenas disponíveis e 578,5 s acumulados. A qualidade dos conteúdos entregues, especialmente development comercial e cenas, foi aprovada pelo usuário. Esta decisão reduz chamadas sem flexibilizar os contratos de qualidade já aceitos.

## Contexto

A composição atual chama `CONTENT_QUALITY_JUDGE` por Content e `CONTENT_PART_REPAIR` por tupla `(Content, parte, round)`. Isso preserva isolamento, mas faz a mesma instrução e o mesmo contexto de produto/creator/skill atravessarem o provider repetidamente. A rodada real confirmou qualidade, mas revelou custo/latência altos e um vazamento editorial no script do Content 02 (uma instrução de objeto que pertence a cenas). O vazamento não é claim factual, não viola o hard gate vigente e não tem critério explícito no Judge.

As decisões anteriores continuam vinculantes:

1. O hard gate determinístico é autoridade factual, estrutural e de variedade; LLM não decide regras de sistema (ADR-004, ADR-012, ADR-019).
2. `CONTENT_QUALITY_JUDGE`/HIGH continua obrigatório por `hook`, `development`, `script`, `cta` e `scenes`; `PASS` preserva a parte, `REPAIR` é seletivo e `REJECT` é terminal (ADR-019/020).
3. Há no máximo dois rounds globais; toda composição é revalidada pelo hard gate e pelo Judge; conteúdo não-PASS não publica (ADR-019/020).
4. `SUCCEEDED_PARTIAL` só publica itens aprovados por hard gate e Judge; o conjunto entregue é revalidado em variedade e os faltantes permanecem explícitos (ADR-021).
5. `ContentSceneSet` continua separado de `ContentBriefVersion`; cenas disponíveis e válidas são condição de conclusão (ADR-019).

## Decisão

### 1. Batching é transporte, não mudança semântica

Batching reduz chamadas ao provider; não altera a unidade de decisão, reparo, validação, persistência, quota, telemetria ou publicação. A unidade semântica permanece `Content` + `QualityPart` + `round`.

Todo retorno em lote usa somente `contentId` server-derived como identidade. Posição do array não é identidade. Antes de recompor qualquer conteúdo, a engine exige: conjunto exato dos IDs enviados, sem IDs extras, ausentes ou duplicados; shape estrito; uma saída por ID; e validação individual da parte retornada. Falha ou timeout de um lote não aprova seus irmãos; os itens do lote são isolados para tratamento de falha já previsto, sem repetir o job inteiro.

### 2. Judge em lote

`CONTENT_QUALITY_JUDGE` recebe até três Contents por chamada e devolve uma auditoria por `contentId`, cada uma com exatamente as cinco partes canônicas. O lote é homogêneo: mesmo Product, Job, EvidenceSnapshot, Creator Context, Skill e round.

O Judge roda uma vez para os itens hard-valid no início e volta a rodar apenas para os itens modificados do round concluído. A decisão por parte, `PASS|REPAIR|REJECT`, os critérios allowlisted e os motivos sanitizados permanecem idênticos ao contrato atual. Um `REJECT` continua terminal somente para seu Content.

O limite inicial é três Contents. Não é configuração do cliente nem superfície de produto. Ele limita blast radius de resposta malformada, contexto e mistura entre irmãos, preservando redução material de chamadas. Aumentar o limite exige avaliação comparativa aprovada; diminuir é permitido como proteção operacional por configuração server-side allowlisted.

### 3. Repair em lote somente quando homogêneo

`CONTENT_PART_REPAIR` agrupa apenas reparos da mesma `QualityPart` e do mesmo round, em até três Contents por chamada. A resposta contém `{ items: [{ contentId, content }] }`.

- `hook`, `script` e `cta`: máximo três itens por lote.
- `development`: máximo dois itens por lote; mantém seu contrato estruturado de grounding/factRef/action/rationale por item.
- `scenes`: permanece individual. O conjunto depende de âncoras lexicais do briefing específico, requisitos de creator solo e pode contaminar referências entre Contents.

Não se agrupam partes diferentes, rounds diferentes, Products diferentes, jobs diferentes ou contextos de creator/skill diferentes. Não há fallback oculto de tier/modelo; Judge e repair continuam HIGH.

### 4. Ordem invariável da pipeline

A geração inicial de `CONTENT_BRIEF_GENERATION` continua no lote do Job: ela precisa enxergar oportunidades irmãs e exact-N. Hard gate continua local/determinístico por Content e Variety Gate continua sobre o conjunto completo. Só após hard gate os candidatos entram nos lotes de Judge. Depois de cada lote de repair, a engine recompõe por `contentId`, revalida hard gate por Content, reexecuta o Judge em lote para os modificados e, antes de publicar, revalida variedade sobre o conjunto entregue.

### 5. Fronteira editorial de script e cenas

`script` é fala/ação performável pelo creator; não pode conter metacomentário de montagem, instrução de objeto, enquadramento ou orientação visual destinada a `scenes`. `scenes` contém a instrução visual gravável. A correção futura deve combinar: regra explícita nas instruções de geração/Judge e detector determinístico estreito para padrões inequívocos de metainstrução no script, que produz `REPAIR`, nunca um `REJECT` automático. A regra não deve proibir verbos naturais de fala/ação do creator.

## Avaliação e critérios de evolução

A rodada `0e94549e-1391-47b5-82a1-51bbb2890aff` torna-se caso de avaliação pequeno e versionado junto dos testes de capability, sem criar plataforma de eval. O caso registra contexto autorizado minimizado, configuração de modelo/Skill, e expectativas observáveis:

- nenhum metacomentário/instrução de cena no `script`;
- hard gate, Judge, exact-N/parcial declarado e cenas preservados;
- `delivered/expected`, `REPAIR`, `REJECT`, calls por capability, rounds e latência acumulada comparáveis antes/depois;
- aprovação humana da qualidade comercial e das cenas.

A implementação deve demonstrar, nesse caso e em testes de contrato, redução de chamadas de Judge/reparo sem piorar conteúdos entregues, aumentar `REJECT`, ou violar invariantes. Não há meta fixa de custo; redução é aceita somente com qualidade e entrega observadas preservadas. Novo batching, aumento acima de três, batching de cenas, troca de tier/modelo ou fallback individual automático exigem nova evidência e decisão registrada.

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
