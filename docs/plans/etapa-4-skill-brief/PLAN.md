# Etapa 4 — Skill e Brief Generation: Documentation Plan

> **Para agentes de implementação:** este plano é documentation-only. Não execute tarefas de código, não execute A/B e não faça cutover a partir deste arquivo. Qualquer implementação futura exige um plano de cutover separado, aprovado conforme ADR-033.

**Goal:** congelar a fronteira documental Planner → Skill/Creative System → Brief Generator do Slice 003, preservando o runtime ADR-029 e deixando o A/B futuro apenas pré-registrado.

**Architecture:** A Etapa 4 é uma precondição documental e técnica do Slice 003, não um Slice de produto. O código continua autoridade sobre schema, fatos, evidência, gates, estados, quota, tenant e persistência; o LLM continua limitado à realização criativa dentro do handoff validado. `ContentSceneSet` permanece separado do Brief e `tiktok-commerce@1.2` continua em produção.

**Tech Stack:** Nenhuma alteração de stack. Documentação Markdown; runtime existente Next.js/TypeScript/PostgreSQL/Model Router/ADR-029 permanece sem alteração.

**Spec:** [`docs/specs/etapa-4-skill-brief/SPEC.md`](../../specs/etapa-4-skill-brief/SPEC.md)

## Global Constraints

- `tiktok-commerce@1.2` permanece produção; `tiktok-commerce@1.3` permanece foundation/harness inativa.
- ADR-029 continua sendo o runtime vigente até A/B, relatório reproduzível e aprovação formal.
- `ContentBriefVersion` novo não contém `scenes`; cenas pertencem a `ContentSceneSet`.
- `HIGH` permanece canônico para Brief, cenas, Judge e repairs.
- A/B comum usa o mesmo `SkillBinding` por par e congela `platformSkillVersion`, modelo, seed, dataset, contexto e memória; tier só varia quando for a única variável declarada.
- Comparação `@1.2`/`@1.3` exige ADR/protocolo experimental separado e não autoriza execução ou cutover.
- Não escrever `creativeDirection`, não criar writer Blueprint e não alterar `ContentOpportunity` histórico.
- Não alterar PRD, ADR-029, ADR-033, DESIGN, nota imutável, código, schema, provider, quota, Job ou persistência.

---
## Autoridade e precedência

Em qualquer divergência, a nota imutável **“Plano de recalibração da commerce inteligence”** é a autoridade superior da Etapa 4 e prevalece sobre este PLAN, a SPEC, scratchs, PRDs, ADRs, SYSTEM-DESIGN, PRINCIPLES, DESIGN e SLICES, conforme o ADR-033. O conteúdo da nota não é reproduzido nem reinterpretado neste plano.

O pedido do usuário desta mudança apenas delimita o escopo documental e os arquivos autorizados. A autorização arquitetural permite registrar o plano, mas não substitui a nota, não resolve divergências contra ela e não autoriza runtime, A/B ou cutover.

A ordem operacional segue o `AGENTS.md`: depois da nota superior, consulta PRDs, SYSTEM-DESIGN, ADRs aceitos, PRINCIPLES, DESIGN, SLICES e SPEC/PLAN/scratchs locais. Em conflito não resolvido com a nota, preserva-se a nota e registra-se a pendência.


## 1. Identidade e arquivos desta mudança

| Operação autorizada | Arquivo | Responsabilidade |
|---|---|---|
| Criar | `docs/specs/etapa-4-skill-brief/SPEC.md` | Contrato, invariantes, gates, riscos e critérios de aceite da Etapa 4. |
| Criar | `docs/plans/etapa-4-skill-brief/PLAN.md` | Sequência documental, dependências, gates de execução futura e limites de implementação. |
| Atualizar | `docs/delivery/SLICES.md` | Uma referência mínima da Etapa 4 como precondição documental do Slice 003. |

A referência no SLICES não cria Slice 004, não renumera slices, não altera o User Outcome do Slice 003 e não altera o escopo do Slice 004 existente, que continua sendo revisão e controle de Content.

Arquivos canônicos não autorizados nesta mudança: PRDs, ADR-029, ADR-033, outros ADRs, SYSTEM-DESIGN, DESIGN, PRINCIPLES, nota imutável e qualquer arquivo de código.

## 2. Dependências e fontes

A sequência usa, sem substituí-los:

- Slice 002 para Product confirmado e `targetContentCount` resolvida;
- Slice 003 para `CommerceIntelligenceJob`, pipeline, Content/Brief, quota, tenant e persistência;
- ADR-019 para `ContentSceneSet` separado e gates de cenas;
- ADR-021 para `SUCCEEDED_PARTIAL`, reconciliação D/N e retry de faltantes;
- ADR-029 para ordem de execução, `HIGH`, Judge e repairs;
- [`ADR-013 — Model Router e IntelligenceTier`](../../architecture/adr-013-model-router-e-intelligence-tier.md#decisão) para custo por tentativa efetiva, `usage.cost`, moeda explícita, estados `UNAVAILABLE`/`PARTIAL` e custo por Content entregue;
- ADR-033 para matriz de autoridade, Skill versionada, catálogo literal fora do contexto novo e gate A/B/cutover;
- `.gstack/etapa4-requisitos.md` e `.gstack/etapa4-decisoes.md` como registros de análise já aprovados para esta documentação.

Dependência de produto excluída: Slice 004 não é reutilizado. Revisão, edição, aprovação, descarte e versionamento operacional continuam fora da Etapa 4.

## 3. Sequência documental e gates

### Fase 1 — Congelar a fronteira

**Entrada:** SPEC/PLAN do Slice 003, SLICES, ADR-019/021/029/033 e scratch da Etapa 4.

**Registro:**

- Slice 003 permanece dono da primeira geração até Briefings.
- Etapa 4 recebe o identificador `etapa-4-skill-brief`.
- A Etapa 4 é precondição documental/técnica do Slice 003, não nova capability de creator.
- Slice 004 permanece reservado para revisão e controle de Content.

**Gate:** os três arquivos desta mudança apontam para a mesma fronteira e não criam fluxo de revisão.

### Fase 2 — Congelar contratos B4-01 a B4-03

**B4-01 — Cenas:**

- Brief novo usa `angle`, `hook`, `development`, `script` e `cta`, sem `scenes`.
- `ContentSceneSet` é persistido separadamente por `tenantId` + `briefVersionId` na finalização.
- `AVAILABLE`, `FILTERED`, `ERROR`, `generated`, `dropped`, `gatePolicyVersion` e `backfilled` permanecem observáveis.
- Payload histórico com `scenes` é somente leitura.

**B4-02 — Custo:**
A política de custo deste plano segue o [ADR-013 — Model Router e IntelligenceTier](../../architecture/adr-013-model-router-e-intelligence-tier.md#decisão): `cost_job_total` soma tentativas efetivas na mesma moeda; ausência ou completude insuficiente permanece `UNAVAILABLE`/`PARTIAL`, e `cost_per_valid_content` usa Contents entregues.

- Contar tentativas efetivas, retries, repairs, cenas novas, backfill, Judge e Semantic Part Repair na capability correta.
- Usar:

```text
cost_job_total =
  Σ cost(fundamental capability attempts)
+ Σ cost(CONTENT_BRIEF_GENERATION attempts)
+ Σ cost(CONTENT_BRIEF_REPAIR attempts)
+ Σ cost(CONTENT_SCENE_IDEAS new/backfill attempts)
+ Σ cost(CONTENT_QUALITY_JUDGE attempts)
+ Σ cost(CONTENT_PART_REPAIR attempts)
```

- `cost_per_valid_content` é a métrica de custo por Content entregue; custo ausente, moeda incompatível ou completude insuficiente permanece `UNAVAILABLE`/`PARTIAL`, nunca `USD 0`.
- Usar `cost_per_valid_content = cost_job_total / D_content` quando `D_content > 0`, onde D é o número de Contents novos efetivamente entregues.
- Não converter custo ausente em zero, não somar moedas incompatíveis e não usar N solicitado como denominador de entrega.

**B4-03 — Tier:**

- `CONTENT_BRIEF_GENERATION`, `CONTENT_BRIEF_REPAIR`, `CONTENT_SCENE_IDEAS`, `CONTENT_QUALITY_JUDGE` e `CONTENT_PART_REPAIR` permanecem `HIGH`.
- `MID` só pode ser hipótese de A/B isolado; não entra no runtime por este plano.

**Gate:** nenhum contrato acima muda ADR-029, o `ROUTER_MAP`, o Job, a quota ou a persistência.

### Fase 3 — Pré-registrar B4-04 sem executar

O protocolo futuro fica registrado com as seguintes invariantes:

1. Em cada par A/B, o `SkillBinding` é idêntico.
2. `platformSkillVersion`, modelo/provider lógico, seed, dataset/Golden Dataset, Product Facts/evidências, `creatorContext` e `ProductMemorySnapshot` são idênticos por bytes.
3. Tier permanece idêntico por par, salvo protocolo específico que declare a mudança de tier como a única variável.
4. Engine commit, task, prompt/context hash, schema/gate policy, timeout, retries e quota autorizada/simulada são registrados.
5. Golden Dataset, categorias, métricas, thresholds e regra de reprovação são fixados antes de qualquer execução.
6. O relatório deve medir o agregado e cada categoria e registrar factualidade, variedade, qualidade semântica conforme rubrica cega, hard-gate failure, repair rate, partial/failure rate, chamadas, custo, tokens e latência p50/p95.
7. Nenhum resultado é coletado por esta Etapa 4.

Comparação `@1.2` versus `@1.3` não pertence ao A/B operacional comum: altera `SkillBinding` e `platformSkillVersion`, requer ADR/protocolo experimental próprios e não autoriza ativação, execução, escrita de `creativeDirection` ou cutover.

**Gate:** o estado permanece `@1.2` em produção e `@1.3` inativa.

### Fase 4 — Preservar autoridade e futuro Blueprint

O contrato futuro pode representar `CreativeBlueprint` versionado dentro de `ContentOpportunity` v2, sem aggregate paralelo. Esta fase não cria writer, não escreve `creativeDirection`, não promove histórico v1 e não altera projeções creator-facing.

O caminho Blueprint-driven futuro deve possuir contract test que falhe se texto literal de hook/CTA do catálogo atravessar o contexto enviado ao provider. O caminho ADR-029 atual, inclusive `selectBriefPatterns`, permanece intacto até eval e cutover aprovados.

**Gate:** nenhuma mudança de Skill, Planner, catálogo, prompt ou persistência ocorre nesta documentação.

### Fase 5 — Preservar o pipeline e os limites operacionais

A futura implementação, caso autorizada em plano separado, deve manter:

```text
Brief Generator
→ hard gates
→ Hard Gate Repair limitado
→ ContentSceneSet válido
→ CONTENT_QUALITY_JUDGE
→ Semantic Part Repair único
→ hard gates/variedade finais
→ persistência
```

As regras preservadas são:

- hard gates determinísticos para schema, ownership, cardinalidade, evidência, factualidade, CTA, duplicatas, variedade e cenas;
- `BriefValidationReport` objetivo `PASS|REPAIR|REJECT`;
- Judge `PASS|REVIEW` somente após hard gates, sem decidir factualidade, quota, estado ou publicação;
- um `CONTENT_PART_REPAIR` por parte `REVIEW`, sem re-Judge;
- `CONTENT_BRIEF_REPAIR` por item, `HIGH`, limitado por `GENERATION_MAX_REPAIRS`;
- falha de Judge/repair preserva a parte original e não cria faltante;
- Job durável, tenant resolvido por sessão, uma execução ativa por usuário, quota transacional e finalização idempotente em transação curta;
- `SUCCEEDED` para N entregues; `SUCCEEDED_PARTIAL` declarado para D/N dentro do contrato ADR-021; `FAILED` fora do CAP ou quando D=0.

**Gate:** uma futura implementação só pode começar após SPEC/PLAN de cutover, A/B executado, relatório reproduzível e aprovação formal.

## 4. Out of scope

- Código, migrations, schema, provider, prompts de produção, runtime, `ROUTER_MAP`, tiers, retries, batch, quota, Job ou persistência.
- Execução do A/B, Golden Dataset, thresholds efetivos, coleta de métricas, relatório ou cutover.
- Ativação do `@1.3`, Creative System, Blueprint ou `creativeDirection`.
- Writer, migração, promoção ou reescrita de `ContentOpportunity` v1 para v2.
- Alteração de qualquer fonte canônica além da referência mínima no SLICES.
- Revisão, edição, regeneração, aprovação, descarte, versionamento operacional, RecordingBatch, Agenda e Estúdio.
- Novo domínio, aggregate, serviço, agente, workflow, repositório ou capability.
- Fallback criativo, template de cena, catálogo literal em prompt normal ou copy determinística.
- Alegação de economia, qualidade, equivalência, latência ou redução de chamadas.

## 5. Critérios de aceite do plano

- **PA-04.1:** SPEC e PLAN usam `etapa-4-skill-brief` como identidade e tratam a Etapa 4 como precondição do Slice 003.
- **PA-04.2:** a referência do SLICES não cria Slice 004 e preserva Slice 004 como revisão e controle de Content.
- **PA-04.3:** B4-01 registra Brief sem `scenes` e `ContentSceneSet` separado.
- **PA-04.4:** B4-02 registra `cost_job_total`, tentativas efetivas e custo por Content entregue usando D.
- **PA-04.5:** B4-03 mantém `HIGH` para Brief, cenas, Judge e repairs.
- **PA-04.6:** B4-04 exige mesmo `SkillBinding` dentro de cada A/B e congela versão de Skill, modelo, seed, dataset, contexto e memória; tier só muda quando for a única variável declarada.
- **PA-04.7:** `@1.2` permanece produção, `@1.3` permanece inativa e comparação entre ambas exige ADR/protocolo separado sem autorização de cutover.
- **PA-04.8:** Blueprint/`ContentOpportunity` v2 aparece apenas como contrato futuro sem writer.
- **PA-04.9:** o teste futuro de não vazamento de catálogo literal está definido e não altera o caminho ADR-029.
- **PA-04.10:** gates, Judge, repairs, quota, Job, persistência, factualidade e tenant estão preservados.
- **PA-04.11:** nenhum A/B ou cutover foi executado.
- **PA-04.12:** somente os três arquivos autorizados foram criados/alterados.

## 6. Riscos e controles

| Risco | Controle |
|---|---|
| Etapa 4 ser interpretada como novo Slice | Identidade documental explícita e referência única sob Slice 003. |
| Slice 004 receber escopo de geração | Out of scope e dependência explícita: Slice 004 permanece revisão/controle. |
| Custo subestimado | Fórmula por tentativas efetivas e denominador D entregue. |
| A/B contaminar resultado | Parâmetros congelados e variável única declarada antes da execução. |
| `@1.3` ativar por harness | Estado inativo e gate de ADR/protocolo/cutover. |
| Catálogo literal vazar para provider | Contract test futuro no caminho Blueprint-driven; exceção ADR-029 preservada. |
| LLM contornar regras do sistema | Handoff allowlisted e gates server-side de fatos, tenant, quota e persistência. |

## 7. Arquivos futuros — não editar neste plano

A futura implementação, se autorizada, poderá avaliar os caminhos já previstos no Slice 003, mas eles não são editados por esta mudança:

- `src/modules/commerce-intelligence/platform-skill.ts`;
- `src/modules/commerce-intelligence/creative-system.ts`;
- `src/modules/commerce-intelligence/engine.ts`;
- `src/modules/commerce-intelligence/content-plan.ts`;
- `src/modules/commerce-intelligence/gates.ts`;
- `src/modules/commerce-intelligence/observability.ts`;
- testes contract/unit de Commerce Intelligence;
- artefatos versionados de protocolo, Golden Dataset, thresholds, relatório e aprovação.

Esses caminhos só entram em plano futuro após ADR/protocolo de Skill ou cutover explicitamente aprovado. Nenhum deles é requisito de execução desta Etapa 4 documental.

## 8. Validação documental desta mudança

A validação autorizada é limitada a existência de arquivos e presença textual dos contratos:

```text
test -f docs/specs/etapa-4-skill-brief/SPEC.md
test -f docs/plans/etapa-4-skill-brief/PLAN.md
test -f docs/delivery/SLICES.md

grep -n "etapa-4-skill-brief\|ContentSceneSet\|cost_job_total\|cost_per_valid_content\|@1.2\|@1.3\|SkillBinding\|não.*cutover" \
  docs/specs/etapa-4-skill-brief/SPEC.md \
  docs/plans/etapa-4-skill-brief/PLAN.md \
  docs/delivery/SLICES.md
```

Não executar testes de runtime, typecheck, lint, build, A/B ou smoke: esta mudança é documentação-only e o pedido restringe a validação a `test -f`/`grep`.
