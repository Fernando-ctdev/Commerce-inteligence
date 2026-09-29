# Etapa 4 — Skill e Brief Generation: Documentation Plan

> **Para agentes de implementação:** este plano é documentation-only. Não execute tarefas de código, não execute A/B e não faça cutover a partir deste arquivo. Qualquer implementação futura exige um plano de cutover separado, aprovado conforme ADR-033.

**Goal:** coordenar Planner → Skill/Creative System → Brief Generator com a Engine V2 default, mantendo ADR-029 somente como baseline E6 e sem afirmar pendências implementadas.

**Architecture:** Etapa 4 é precondição documental/técnica do Slice 003. Código mantém autoridade sobre schema, fatos, evidência, gates, estado, quota, tenant e persistência; LLM realiza criatividade no handoff validado. `ContentSceneSet` permanece separado do Brief.

**Tech Stack:** somente Markdown nesta alteração; nenhum runtime, provider ou teste é modificado.

**Spec:** [`docs/specs/etapa-4-skill-brief/SPEC.md`](../../specs/etapa-4-skill-brief/SPEC.md)

## Global Constraints

- Engine V2 permanece default em `V2_DEFAULT_PENDING_ACCEPTANCE`.
- ADR-029/`@1.2` permanece baseline histórico/experimental; ADR-033 define `@1.3` como binding operacional alvo ainda sujeito a comprovação de consistência.
- `ContentBriefVersion` não contém `scenes`; `ContentSceneSet` permanece separado.
- Tiers/capabilities do ADR-029 são baseline E6, não mapa corrente presumido.
- E6 registra commit, provider/model/tier, params, prompts/contextos, seed, usage/custo/latência e cobertura.
- Evidence offline não comprova custo, latência ou qualidade semântica real.
- `creativeDirection` v2 é canônica no alvo; writer, memória, binding, Scene Skeleton, Risk pré-Judge e remoção de `selectedPatterns` não são presumidos completos.
- Não alterar PRD, ADRs, DESIGN, nota, código, testes, schema, provider, quota, Job ou persistência.

---
## Autoridade e precedência

Em qualquer divergência, a nota imutável **“Plano de recalibração da commerce inteligence”** é a autoridade superior da Etapa 4 e prevalece sobre este PLAN, a SPEC, scratchs, PRDs, ADRs, SYSTEM-DESIGN, PRINCIPLES, DESIGN e SLICES, conforme o ADR-033. O conteúdo da nota não é reproduzido nem reinterpretado neste plano.

O pedido do usuário desta mudança apenas delimita o escopo documental e os arquivos autorizados. A autorização arquitetural permite registrar o plano, mas não substitui a nota, não resolve divergências contra ela e não autoriza runtime, A/B ou cutover.

A ordem operacional segue o `AGENTS.md`: depois da nota superior, consulta PRDs, SYSTEM-DESIGN, ADRs aceitos, PRINCIPLES, DESIGN, SLICES e SPEC/PLAN/scratchs locais. Em conflito não resolvido com a nota, preserva-se a nota e registra-se a pendência.


## 1. Identidade e arquivos desta mudança

Esta Etapa permanece documentação transversal do Slice 003: a SPEC define contrato e limites; este PLAN define dependências e gates. A coordenação atual também alcança ADR-033, SYSTEM-DESIGN, SLICES e as SPEC/PLAN de Slice 003 e Etapas 5/6. Isso não cria Slice 004, não renumera slices nem altera o escopo de revisão/controle do Slice 004 existente.

PRDs, DESIGN, PRINCIPLES, ADR-029, outros ADRs, nota imutável, código e testes não são alterados. ADR-033 é refinado somente em E6; SYSTEM-DESIGN/SLICES são alinhados deliberadamente ao estado default V2 pendente.

## 2. Dependências e fontes

A sequência usa, sem substituí-los:

- Slice 002 para Product confirmado e `targetContentCount` resolvida;
- Slice 003 para `CommerceIntelligenceJob`, pipeline, Content/Brief, quota, tenant e persistência;
- ADR-019 para `ContentSceneSet` separado e gates de cenas;
- ADR-021 para `SUCCEEDED_PARTIAL`, reconciliação D/N e retry de faltantes;
- ADR-029 para baseline histórica, gates e invariantes preservados;
- [`ADR-013 — Model Router e IntelligenceTier`](../../architecture/adr-013-model-router-e-intelligence-tier.md#decisão) para custo por tentativa efetiva, `usage.cost`, moeda explícita e completude;
- ADR-033 para V2 default pendente, matriz de autoridade, Skill/Blueprint, contexto e E6 integral;
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

- A matriz ADR-029 (`CONTENT_BRIEF_GENERATION`, repairs, `CONTENT_SCENE_IDEAS`, Judge) permanece somente baseline E6.
- O runtime V2 registra tiers e capabilities efetivamente executados.

**Gate:** esta documentação não altera mapa, tier, Job, quota ou persistência.

### Fase 3 — Pré-registrar E6 sem executar

1. Fixar baseline ADR-029/`@1.2` e candidato V2/`@1.3` por commit/engine version.
2. Registrar provider/model/tier e parâmetros efetivos de cada braço.
3. Congelar Product Facts/evidências, creator context, memória, prompts/contextos e seeds por bytes/hash.
4. Registrar Skill/binding, Creative System, schemas, policies, timeout, retries, usage/custo/latência e cobertura.
5. Listar antes da coleta todas as diferenças inerentes ao end-to-end; atribuições alteram uma variável.
6. Separar evidence offline/replay de execução com provider vivo.
7. Pré-registrar rubrica, unidade, cegamento, avaliações independentes, adjudicação, agregação/categorias, missing e thresholds.
8. Não coletar nem declarar resultado por esta Etapa 4.

**Gate:** V2 continua default pendente; ADR-029 continua baseline. Nenhuma classe de evidência substitui outra.

### Fase 4 — Registrar Blueprint e contexto como pendências verificáveis

`ContentOpportunity.creativeDirection` v2 é a fonte canônica alvo. Esta fase não cria writer, não promove histórico v1 e não afirma implementação.

O contexto V2 deve possuir contract test contra `selectedPatterns` e texto literal do catálogo. Fixture ADR-029/catalog permanece isolada no runner E6.

**Gate:** nenhuma mudança de Skill, Planner, catálogo, prompt ou persistência ocorre nesta documentação.

### Fase 5 — Preservar autoridades e registrar ordem-alvo

Permanecem invariantes:

- hard gates determinísticos e `BriefValidationReport` objetivo;
- quota, tenant, Job, fencing, idempotência, D/N e parcial;
- Risk sem autoridade de entrega;
- Judge sem autoridade de factualidade, quota, estado ou publicação;
- falha de Risk selecionando Judge; `NOT_EXECUTED` nunca sendo `PASS`;
- `ContentSceneSet` separado.

A ordem-alvo é Brief + Scene Skeleton → hard gates/repair → Risk → Judge seletivo → repair semântico → hard gates/variedade finais → persistência. Esta documentação não afirma que essa ordem já esteja implementada.

**Gate:** correção futura exige plano próprio e review antes de runtime/testes.

## 4. Out of scope

- Código, migrations, schema, provider, prompts de produção, runtime, `ROUTER_MAP`, tiers, retries, quota, Job ou persistência.
- Execução offline ou com provider vivo, coleta, relatório ou aceitação.
- Implementação/correção de binding 1.3, writer Blueprint, memória, Scene Skeleton, Risk pré-Judge ou contexto V2.
- Migração/promoção de histórico v1.
- Alteração de fonte canônica fora dos arquivos pedidos nesta coordenação.
- Funcionalidades de Slice 004/005.
- Novo domínio, aggregate, serviço, agente, workflow, repositório ou capability.
- Alegação de economia, qualidade, equivalência, latência ou redução de chamadas.

## 5. Critérios de aceite do plano

- **PA-04.1:** SPEC e PLAN usam `etapa-4-skill-brief` como identidade e tratam a Etapa 4 como precondição do Slice 003.
- **PA-04.2:** a referência do SLICES não cria Slice 004 e preserva Slice 004 como revisão e controle de Content.
- **PA-04.3:** B4-01 registra Brief sem `scenes` e `ContentSceneSet` separado.
- **PA-04.4:** custo soma tentativas efetivas observadas; offline não satisfaz custo/latência reais.
- **PA-04.5:** matriz ADR-029 é baseline; runtime V2 registra tier/capability efetivos.
- **PA-04.6:** E6 congela commit, provider/model/tier, params, prompt/context, seed, usage/custo/latência e cobertura.
- **PA-04.7:** `@1.2` é baseline e `@1.3` é alvo operacional sujeito a evidência; nenhum resultado é declarado.
- **PA-04.8:** `creativeDirection` v2 é canônica sem presumir writer.
- **PA-04.9:** gate de contexto bloqueia `selectedPatterns`/catálogo literal no V2.
- **PA-04.10:** gates, quota, Job, factualidade e tenant permanecem autoridades server-side.
- **PA-04.11:** nenhum E6 ou provider foi executado.
- **PA-04.12:** nenhum runtime ou teste foi alterado.

## 6. Riscos e controles

| Risco | Controle |
|---|---|
| Etapa 4 ser interpretada como novo Slice | Identidade documental explícita e referência única sob Slice 003. |
| Slice 004 receber escopo de geração | Out of scope e dependência explícita: Slice 004 permanece revisão/controle. |
| Custo subestimado | Fórmula por tentativas efetivas e denominador D entregue. |
| E6 contaminar resultado | Controles/diferenças pré-registrados e classes de evidência separadas. |
| Binding/writer parecer implementado por documentação | Estado pendente explícito e evidência operacional obrigatória. |
| Catálogo literal vazar para provider | Contract test do contexto V2; fixtures ADR-029 confinadas ao baseline. |
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

Conferir links relativos, headings/status, V2 default versus baseline ADR-029, evidência offline/live, rubricas e limites de escopo com o diff. Não executar testes de runtime, typecheck, lint, build, A/B ou smoke nesta mudança documental.
