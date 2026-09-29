# SPEC — Etapa 4: Skill e Brief Generation

**Identificador documental:** `etapa-4-skill-brief`

**Natureza:** precondição documental e técnica do Slice 003 — não é um Slice de produto e não reutiliza o Slice 004.

**Status:** `DOCUMENTATION_ONLY` — coordena contratos com a Engine V2 default; não autoriza código, provider, A/B, E6 ou aceitação formal.

**Runtime atual:** Engine V2 default em `V2_DEFAULT_PENDING_ACCEPTANCE`. ADR-029/`@1.2` permanece histórico e baseline E6; ADR-033 define `@1.3` como binding operacional alvo, cuja consistência ainda precisa ser comprovada.

## 1. Objetivo e fronteira

Esta SPEC registra o contrato documental da Etapa 4 para a fronteira entre `PlatformSkill`/Creative System, o output aprovado do Planner determinístico do Slice 003 e a realização textual de Briefings. O Slice 003 continua sendo o dono da primeira geração até Briefings. O Slice 004 continua sendo o dono da revisão e controle de Content; edição, aprovação, descarte e versionamento operacional não entram nesta etapa.

A Etapa 4 deve preservar o princípio de autoridade existente:

```text
PlatformSkill / Creative System → conhecimento versionado e compatibilidade
Planner → combina, seleciona, restringe, distribui e entrega oportunidades
LLM → realiza texto criativo dentro do handoff validado
Código → valida schema, evidência, factualidade, cardinalidade, gates,
          estado, quota, persistência, autorização e tenant
```

Esta SPEC não altera runtime. Distingue o que está em produção por ADR-033 das pendências: writer canônico de `creativeDirection`, binding/proveniência 1.3 coerentes, memória V2, contexto sem `selectedPatterns`, Scene Skeleton e Risk pré-Judge.

## 2. Fontes e precedência

Em qualquer divergência, a nota imutável **“Plano de recalibração da commerce inteligence”** é a autoridade superior da Etapa 4 e prevalece sobre esta SPEC, o PLAN, scratchs, PRDs, ADRs, SYSTEM-DESIGN, PRINCIPLES, DESIGN e SLICES, conforme o próprio ADR-033. O conteúdo da nota não é reproduzido nem reinterpretado aqui.

O pedido do usuário nesta mudança apenas delimita o escopo documental e os arquivos autorizados. A autorização arquitetural permite registrar esta documentação, mas não substitui a nota, não resolve divergências contra ela e não autoriza runtime, A/B ou cutover.

A ordem operacional abaixo segue o `AGENTS.md`: depois da nota superior, consulta PRDs, SYSTEM-DESIGN, ADRs aceitos, PRINCIPLES, DESIGN, SLICES e, por último, SPEC/PLAN e scratchs locais. Em conflito não resolvido com a nota, preserva-se a nota e registra-se a pendência; esta SPEC não corrige fonte superior.

1. Nota imutável **“Plano de recalibração da commerce inteligence”** — autoridade superior da Etapa 4.
2. PRDs relevantes do produto e das frentes.
3. `SYSTEM-DESIGN.md`.
4. ADRs aceitos, especialmente ADR-013, ADR-019, ADR-021, ADR-029 e ADR-033.
5. `PRINCIPLES.md`.
6. `DESIGN.md`.
7. `SLICES.md`.
8. SPEC/PLAN do Slice 003.
9. Scratchs da Etapa 4 como registros de análise, nunca como autorização.

O pedido explícito continua sendo o limite de escopo desta alteração, não uma fonte para contradizer a nota ou os contratos superiores.

Fontes documentais:

- [`SLICES.md`](../../delivery/SLICES.md), Slice 003 e Slice 004;
- [`SPEC Slice 003`](../slice-003/SPEC.md);
- [`PLAN Slice 003`](../../plans/slice-003/PLAN.md);
- [`ADR-013 — Model Router e IntelligenceTier`](../../architecture/adr-013-model-router-e-intelligence-tier.md#decisão), especialmente a política de custo por tentativa, moeda explícita e estados `UNAVAILABLE`/`PARTIAL`;
- [`ADR-019`](../../architecture/adr-019-gate-versionada-e-cenas.md);
- [`ADR-021`](../../architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md);
- [`ADR-029`](../../architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md);
- [`ADR-033`](../../architecture/adr-033-determinismo-llm-e-creative-system.md);
- [`PRD Commerce Intelligence Engine`](../../product/PRD-commerce-intelligence-engine.md);
- [`PRD Content Briefing`](../../product/PRD-content-briefing.md);
- [`PRD Model Router`](../../product/PRD-model-router-inteligence.md);
- [`SYSTEM-DESIGN`](../../architecture/SYSTEM-DESIGN.md);
- [`PRINCIPLES`](../../engineering/PRINCIPLES.md);
- Registros locais de análise da Etapa 4 (`.gstack/etapa4-requisitos.md` e `.gstack/etapa4-decisoes.md`), preservados fora da árvore versionada.

## 3. In scope documental

- Congelar a fronteira Planner → Brief Generator sem mover autoridade de seleção para o LLM.
- Registrar `ContentSceneSet` como contrato separado do Brief novo.
- Congelar a medição de tentativas efetivas, `cost_job_total` e custo por Content entregue.
- Preservar a matriz `HIGH` do ADR-029 como baseline E6, sem tratá-la como mapa corrente da Engine V2.
- Pré-registrar comparações futuras sem executá-las.
- Registrar `CreativeBlueprint`/`ContentOpportunity` v2 como contrato canônico alvo sem presumir writer operacional.
- Registrar o gate contra `selectedPatterns` e catálogo literal no contexto V2.
- Repetir, como gates documentais, as invariantes de factualidade, tenant, Job, quota, persistência, Judge e repairs que não podem ser relaxadas por uma futura implementação.

## 4. B4-01 — Brief sem `scenes`; `ContentSceneSet` separado

### 4.1 Contrato

Para geração nova, `ContentBriefVersion` contém o Brief textual e **não contém `scenes`**. Cenas persistem em `ContentSceneSet` separado. ADR-029 usa `CONTENT_SCENE_IDEAS` na baseline; o alvo V2 usa Scene Skeleton determinístico. Esta SPEC não presume que a substituição esteja integralmente comprovada.

O envelope e o item de cena usam exclusivamente o contrato vigente do [ADR-019](../../architecture/adr-019-gate-versionada-e-cenas.md) e de [`src/modules/commerce-intelligence/contract.ts`](../../../src/modules/commerce-intelligence/contract.ts):

```ts
type SceneIdea = {
  description: string;
};

type ContentSceneSetPayload = {
  scenes: readonly SceneIdea[];
  generated: number;
  dropped: number;
};

type ContentSceneSetEnvelope = {
  payload: ContentSceneSetPayload;
  status: "AVAILABLE" | "FILTERED" | "ERROR";
  gatePolicyVersion: string;
  backfilled: boolean;
};
```

`SceneIdea` é o item vigente; o validador `validateContentSceneSetDraft` recebe `scenes` e conserva somente `{ description }`. O payload ordenado continua com `scenes`, `generated` e `dropped`, e o envelope continua com `payload`, `status`, `gatePolicyVersion` e `backfilled`.

Qualquer schema alternativo — inclusive um `SceneDraft` com `action`, `productAnchor` e `visualDetail` — é hipótese futura e está fora do contrato desta Etapa 4. Não é entrada, saída, persistência ou compatibilidade exigida por esta SPEC.

A entrada de cenas recebe o Brief inteiro sem `scenes`, fatos/evidências projetados, `creatorContext` projetado, `platformSkillVersion` e `gatePolicyVersion`. Provider não recebe `tenantId`, ownership, quota, status, comandos ou IDs persistentes; IDs e referências finais são atribuídos pelo servidor.

### 4.2 Regras

- Chamada externa e filtro acontecem fora de transação; persistência ocorre somente na finalização curta do Job.
- `AVAILABLE` exige o mínimo válido da policy; `FILTERED` registra itens removidos; `ERROR` não equivale a sucesso vazio.
- Ação observável, âncora no Produto, ausência de claim novo, compatibilidade com creator e unicidade permanecem validações server-side.
- Cenas são parte da elegibilidade objetiva da geração nova; Judge semântico não cria cena faltante.
- Payload histórico com `scenes` permanece somente leitura e não é migrado, promovido ou reescrito.
- Backfill de sets elegíveis permanece separado do denominador de Contents novos e segue a idempotência existente.

## 5. B4-02 — Custo por tentativa efetiva e Content entregue

As fórmulas abaixo descrevem a baseline ADR-029. No runtime V2, `cost_job_total` soma somente as tentativas efetivamente observadas no call graph versionado; capability removida não é estimada, e capability nova não pode ser omitida. Fixture/replay offline não comprova usage, custo ou latência reais.

### 5.1 Definições

- `N`: quantidade solicitada, `1..10`.
- `B`: batch size de Brief, inteiro `4..8`.
- `Q`: quantidade elegível de `ContentSceneSet` em backfill, `0..10`; não é output novo.
- `R_B`: tentativas adicionais de `CONTENT_BRIEF_GENERATION`, incluindo retry de contrato e fallback de disponibilidade quando autorizado.
- `R_H`: tentativas de `CONTENT_BRIEF_REPAIR`.
- `R_SN`: tentativas adicionais de cenas dos Contents novos.
- `R_SB`: tentativas adicionais de cenas de backfill.
- `J`: tentativas de `CONTENT_QUALITY_JUDGE` efetivamente executadas.
- `R_P`: tentativas de `CONTENT_PART_REPAIR` efetivamente executadas.
- `F`: tentativas efetivas das quatro capabilities fundacionais: Understanding, Mapping, Strategy e Plan. No caminho feliz, `F = 4`; retries e fallback são contados individualmente.
- `D_brief`: BriefDrafts que passaram os hard gates de Brief.
- `D_content`: Contents novos entregues com Brief, `ContentSceneSet` `AVAILABLE` e gates objetivos finais aprovados.
- `D = D_content`: denominador oficial do output novo entregue.
- `Q_valid_scene`: sets de backfill `AVAILABLE`, reportados separadamente.

### 5.2 Chamadas efetivas

```text
brief_base(N, B) = ceil(N / B)
scene_new_base(N) = N
scene_backfill_base(Q) = Q

brief_effective = brief_base(N, B) + R_B + R_H
scene_effective = scene_new_base(N) + R_SN
                 + scene_backfill_base(Q) + R_SB
brief_scenes_effective = brief_effective + scene_effective

calls_job_effective =
  F
+ brief_base(N, B) + R_B
+ R_H
+ N + R_SN
+ Q + R_SB
+ J
+ R_P
```

A contagem vem de eventos internos por capability, batch e tentativa. Não inclui chamadas não realizadas, placeholders ou estimativas de tokens.

### 5.3 Custo normativo
Esta política segue o [ADR-013 — Model Router e IntelligenceTier](../../architecture/adr-013-model-router-e-intelligence-tier.md#decisão): `usage.cost` é a fonte primária por tentativa, a moeda deve ser explícita e custo ausente ou incompleto permanece `UNAVAILABLE`/`PARTIAL`.

`cost_job_total` soma o custo reportado/calculado de **cada tentativa efetiva**, na mesma moeda e com a completude registrada:

```text
cost_job_total =
  Σ cost(fundamental capability attempts)
+ Σ cost(CONTENT_BRIEF_GENERATION attempts)
+ Σ cost(CONTENT_BRIEF_REPAIR attempts)
+ Σ cost(CONTENT_SCENE_IDEAS new/backfill attempts)
+ Σ cost(CONTENT_QUALITY_JUDGE attempts)
+ Σ cost(CONTENT_PART_REPAIR attempts)
```

A métrica documental de custo por Content entregue é `cost_per_valid_content`; sua política não substitui o custo por tentativa definido no ADR-013.

```text
cost_per_valid_content = cost_job_total / D_content, quando D_content > 0
```

`cost_per_valid_content` significa custo por Content novo efetivamente entregue; não é custo por Brief rascunhado, por cena, por `REVIEW` semântico ou por `N` solicitado. Também são reportadas `valid_brief_rate`, `valid_content_rate` e `calls_per_valid_content`.

Política de custo:

1. `usage.cost` explicitamente reportado pelo provider é a fonte primária.
2. Snapshot oficial imutável é fallback permitido.
3. Catálogo local só é fallback quando não existe pricing oficial.
4. Ausência, moeda incompatível ou completude insuficiente resulta em `UNAVAILABLE`/`PARTIAL`, nunca `USD 0` inventado.
5. Moedas diferentes não são somadas.
6. Se `D_content = 0`, custo e chamadas por Content entregue são `UNAVAILABLE`.
7. Em `SUCCEEDED_PARTIAL`, o denominador é D entregue; a quota confirma D e libera `N−D`, conforme ADR-021.

Nenhuma redução de custo, chamada ou latência é declarada sem o A/B pré-registrado, relatório reproduzível e aprovação exigidos pelo ADR-033.

## 6. B4-03 — tiers da baseline e registro efetivo V2

A tabela abaixo preserva ADR-029 para E6:

| Capability da baseline | Tier | Regra histórica |
|---|---:|---|
| `CONTENT_BRIEF_GENERATION` | `HIGH` | retry de contrato por batch |
| `CONTENT_BRIEF_REPAIR` | `HIGH` | até `GENERATION_MAX_REPAIRS` |
| `CONTENT_SCENE_IDEAS` | `HIGH` | até duas tentativas por Content |
| `CONTENT_QUALITY_JUDGE` | `HIGH` | sem retry semântico |
| `CONTENT_PART_REPAIR` | `HIGH` | uma passagem por parte `REVIEW` |

O runtime V2 registra tier/provider/model/params efetivos por capability. Esta SPEC não afirma que a matriz histórica seja o mapa corrente nem autoriza alteração.

## 7. B4-04 — SkillBinding, Blueprint e aceitação pendente

### 7.1 Estado atual

- Engine V2 é o runtime default.
- ADR-029/`@1.2` permanece histórico e baseline E6.
- ADR-033 define `@1.3` como binding operacional alvo; coerência entre Strategy, Plan, `IntelligenceRun`, Planner e Creative System continua gate de `V2_ACCEPTED`.
- `ContentOpportunity.creativeDirection` v2 é a fonte canônica alvo; esta SPEC não declara que o writer esteja concluído.

### 7.2 Protocolo pré-registrado, não executado

Cada comparação deve registrar, antes da coleta:

- commits/engine versions, Skill/binding e Creative System de cada braço;
- provider/model/tier e parâmetros efetivos;
- Product Facts/evidências, creator context, memória, prompt e contexto por bytes/hash;
- dataset/case/category, seed e policies;
- usage/custo/latência, retries e cobertura;
- manifest prévio de diferenças entre baseline e candidato.

Experimento de atribuição altera uma variável. A comparação end-to-end permite as diferenças inerentes ao pipeline, desde que listadas previamente. Evidence offline/replay não satisfaz custo, latência ou qualidade semântica real; essas métricas exigem provider vivo pareado.

Critérios subjetivos exigem rubrica e unidade explícitas, avaliações cegas independentes, adjudicação, agregação por unidade/case/categoria/total, missing policy e thresholds pré-registrados. Esta Etapa não executa nem aprova o experimento.

### 7.3 Comparação `@1.2` versus `@1.3`

`@1.2` versus `@1.3` é uma atribuição de Skill/bundle dentro da E6, não mudança silenciosa. O protocolo congela o restante ou declara previamente toda diferença inseparável. Nenhuma conclusão é inferida da presença de fixtures ou do binding no repositório.

### 7.4 Contrato canônico alvo sem afirmação de writer

```ts
type CreativeBlueprint = {
  recipeId?: string;
  attentionMechanisms: string[];
  psychologicalEffects: string[];
  format: string;
  narrativeMoves: string[];
  productRole: string;
};
```

Novos registros V2 devem persistir o Blueprint em `ContentOpportunity.creativeDirection`, sem aggregate, tabela, serviço ou entidade paralela. Até a evidência do writer:

- metadata `plannedV2` não satisfaz o contrato;
- histórico v1 não recebe Blueprint fabricado;
- provider, repair e Content Operations não escrevem Blueprint;
- esta documentação não afirma implementação.

## 8. Gate de não vazamento do catálogo literal

O contexto V2 deve falhar contract test se `selectedPatterns` ou qualquer texto literal de hook/CTA do catálogo atravessar o provider.

O teste verifica somente a projeção allowlisted e o corpus conhecido. Fixtures ADR-029/catalog permanecem isoladas para baseline E6; não são exceção no runtime V2. Esta SPEC não afirma que o teste ou a correção já estejam implementados.

## 9. Gates e invariantes preservados

### 9.1 Handoff, factualidade e autoridade

- O Planner entrega as oportunidades selecionadas; o Brief Generator não enumera nem seleciona novamente.
- LLM realiza situação, hook final, falas, script, payoff e tom dentro do handoff validado.
- Código decide schema, IDs, ownership, cardinalidade, evidência, factualidade, duplicatas, variedade, estado, quota, persistência e sucesso.
- Fato confirmado permanece separado de inferência; claims usam `SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED` e `CONTRADICTED` conforme os validadores existentes.
- Saída de provider não recebe autoridade sobre `tenantId`, IDs persistentes, status, quota, reservation, comandos ou workflow.

### 9.2 Gates, Judge e repairs

A ordem preservada do ADR-029 é:

```text
Brief Generator
→ hard gates
→ Hard Gate Repair limitado
→ cenas válidas em ContentSceneSet
→ CONTENT_QUALITY_JUDGE
→ Semantic Part Repair único
→ hard gates/variedade finais
→ persistência
```

- Hard gates de schema, ownership, cardinalidade, evidência, factualidade, CTA, duplicatas, variedade, cenas e resultado final são determinísticos e bloqueantes.
- `BriefValidationReport` registra a decisão objetiva `PASS|REPAIR|REJECT`.
- `CONTENT_QUALITY_JUDGE` ocorre após hard gates e retorna somente `PASS|REVIEW` por Content e parte; não decide factualidade, variedade, quota, estado ou publicação.
- Cada parte `REVIEW` recebe no máximo um `CONTENT_PART_REPAIR`, sem re-Judge; `GENERATION_MAX_REPAIRS` não limita esse repair semântico.
- `Hard Gate Repair` usa `CONTENT_BRIEF_REPAIR` por item, é `HIGH`, limitado por `GENERATION_MAX_REPAIRS` e seguido de revalidação do conjunto.
- Falha ou schema inválido de Judge/repair preserva a parte original e não cria faltante.
- `REVIEW` semântico não bloqueia `DRAFT`; somente gates objetivos decidem elegibilidade e entrega.

### 9.3 Job, tenant, quota e persistência

- A ação explícita `Analisar produto` cria o `CommerceIntelligenceJob`; salvar Product isoladamente não cria Job.
- Estados, stages, lease, retry idempotente, fencing e recuperação permanecem os do Slice 003.
- Toda operação resolve Tenant e usuário pela sessão server-side; `tenantId` fornecido pelo cliente nunca é autoridade.
- Um usuário não possui mais de um Job `QUEUED`/`RUNNING`; a proteção é server-side.
- A quota reserva N na criação, confirma D no sucesso parcial e libera `N−D` conforme ADR-021; falha/cancelamento reconcilia a reserva no mês UTC de origem.
- Chamadas externas acontecem fora de transação longa; finalização persiste Strategy, Plan, Opportunities, Contents entregues, BriefVersions, reports, `IntelligenceRun` e sinais permitidos em transação curta e idempotente.
- Não se persiste prompt completo, payload bruto de provider, cookie, token, segredo ou dados de outro Tenant.
- `SUCCEEDED` entrega N; `SUCCEEDED_PARTIAL` declara D/N e diagnóstico objetivo; D=0 ou falha fora do CAP segue `FAILED`.

## 10. Dependências

- Slice 002 fornece Product confirmado e `targetContentCount` resolvida.
- Slice 003 fornece `CommerceIntelligenceJob`, engine, Planner, Brief Generator, gates, `Content`, `ContentBriefVersion`, `ContentSceneSet`, Entitlements e persistência inicial.
- ADR-019 fornece o contrato separado e versionado de cenas.
- ADR-021 fornece parcial, reconciliação de quota e retry explícito dos faltantes.
- [`ADR-013 — Model Router e IntelligenceTier`](../../architecture/adr-013-model-router-e-intelligence-tier.md#decisão) fornece a política de `usage.cost`, moeda explícita, `UNAVAILABLE`/`PARTIAL` e custo por Content entregue a partir de tentativas efetivas.
- ADR-029 documenta, como baseline histórico/experimental, ordem, tiers, Judge e repairs do runtime anterior; a Engine V2 é o runtime default atual, com aceitação formal pendente conforme ADR-033.
- ADR-033 fornece a matriz de autoridade, Creative System versionado, catálogo fora do prompt novo e gate A/B/cutover.
- O Slice 004 permanece dependente do Slice 003 e não é dependência nem destino da Etapa 4.

## 11. Out of scope

- Qualquer alteração em código, schema, migration, provider, prompt de produção, Skill operacional, `ROUTER_MAP`, tier, batch, retry, quota, Job ou persistência.
- Execução de E6, provider vivo, coleta, relatório, aprovação ou declaração de não-regressão.
- Implementação/correção de binding 1.3, writer Blueprint, memória V2, Scene Skeleton ou Risk pré-Judge.
- Migração, promoção ou reescrita de `ContentOpportunity` v1.
- Alteração de PRD, ADR-029, ADR-033, PRINCIPLES, DESIGN ou nota imutável.
- Revisão, edição, regeneração, aprovação, descarte, lotes, Agenda ou Estúdio.
- Novo domínio, aggregate, serviço, agente, workflow, repositório ou capability de produto.
- Alegação de economia, qualidade, equivalência, latência ou aceitação sem E6 aprovada.

## 12. Riscos e controles

| Risco | Controle documental |
|---|---|
| PRD legado mantém `scenes` dentro do Brief | ADR-019 e esta SPEC fixam `ContentSceneSet` separado; payload legado permanece read-only. |
| Fórmula curta omite Judge, repairs, cenas ou retries | `cost_job_total` soma cada tentativa efetiva por capability; `D_content` é o denominador entregue. |
| E6 mistura variáveis ou classes de evidência | Protocolo congela controles, lista diferenças e separa offline de provider vivo. |
| Binding 1.3 ou writer é presumido pela documentação | Estado pendente explícito; somente evidência de execução satisfaz o gate. |
| Catálogo literal ancora o contexto V2 | Contract test bloqueia `selectedPatterns` e copy literal; fixtures ADR-029 ficam no runner E6. |
| LLM recebe autoridade sobre regra de sistema ou tenant | Handoff allowlisted e validação server-side de schema, factualidade, ownership, quota, estado e persistência. |
| Etapa 4 invade Slice 004 | Identidade é precondição documental do Slice 003; revisão/controle permanecem no Slice 004. |

## 13. Critérios de aceite

- **AC-04.1:** `ContentBriefVersion` novo não contém `scenes`; `ContentSceneSet` é o contrato separado de cenas.
- **AC-04.2:** `cost_job_total` soma tentativas efetivas de capabilities fundacionais, Brief, repairs, cenas, Judge e Semantic Part Repair; `cost_per_valid_content` usa D Contents entregues.
- **AC-04.3:** tiers do ADR-029 permanecem identificados como baseline; runtime V2 registra valores efetivos.
- **AC-04.4:** cada par registra commit, provider/model/tier, parâmetros, prompts/contextos, seed, usage/custo/latência e cobertura.
- **AC-04.5:** `@1.2`/`@1.3` é atribuição pré-registrada; nenhum resultado ou aprovação é declarado.
- **AC-04.6:** `ContentOpportunity.creativeDirection` v2 é canônica sem presumir writer nem promover v1.
- **AC-04.7:** o gate bloqueia `selectedPatterns` e catálogo literal no contexto V2; fixture ADR-029 é apenas baseline.
- **AC-04.8:** gates, repairs, factualidade, Job, tenant, quota e persistência permanecem server-side.
- **AC-04.9:** evidence offline não satisfaz custo, latência ou qualidade semântica real.
- **AC-04.10:** nenhum código, teste ou runtime é alterado por esta SPEC.

## 14. Arquivos futuros — não editar nesta etapa

Os caminhos abaixo são referências para uma futura mudança aprovada; não são criados ou editados por esta SPEC/PLAN:

- `src/modules/commerce-intelligence/platform-skill.ts`;
- `src/modules/commerce-intelligence/creative-system.ts`;
- `src/modules/commerce-intelligence/engine.ts`;
- `src/modules/commerce-intelligence/content-plan.ts`;
- `src/modules/commerce-intelligence/gates.ts`;
- `src/modules/commerce-intelligence/observability.ts`;
- testes contract/unit do módulo de Commerce Intelligence;
- artefatos versionados de Golden Dataset, thresholds, protocolo, relatório e aprovação do A/B.

Qualquer alteração nesses caminhos exige PLAN de implementação/cutover próprio, protocolo pré-registrado, eval, relatório reproduzível e aprovação formal conforme ADR-033.
