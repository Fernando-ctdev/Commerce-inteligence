# SPEC — Etapa 4: Skill e Brief Generation

**Identificador documental:** `etapa-4-skill-brief`

**Natureza:** precondição documental e técnica do Slice 003 — não é um Slice de produto e não reutiliza o Slice 004.

**Status:** `DOCUMENTATION_ONLY` — autorização arquitetural recebida para congelar contratos e gates; nenhuma implementação, execução de A/B, ativação de runtime ou cutover é autorizada por esta SPEC.

**Runtime vigente:** ADR-029, com `tiktok-commerce@1.2` em produção. A foundation/harness `tiktok-commerce@1.3` permanece inativa.

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

Nenhum contrato desta SPEC altera chamadas, tiers, cenas, gates, repairs, `ROUTER_MAP`, quota, persistência ou writer de `creativeDirection` do runtime ADR-029.

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
- Fixar `HIGH` como tier canônico do runtime ADR-029 para Brief, cenas, Judge e repairs.
- Pré-registrar o protocolo A/B futuro sem executá-lo.
- Registrar o contrato futuro de `CreativeBlueprint`/`ContentOpportunity` v2 sem writer operacional.
- Registrar o teste futuro contra vazamento de catálogo literal no contexto Blueprint-driven.
- Repetir, como gates documentais, as invariantes de factualidade, tenant, Job, quota, persistência, Judge e repairs que não podem ser relaxadas por uma futura implementação.

## 4. B4-01 — Brief sem `scenes`; `ContentSceneSet` separado

### 4.1 Contrato

Para geração nova, `ContentBriefVersion` contém o Brief textual e **não contém `scenes`**. Cenas são responsabilidade da capability `CONTENT_SCENE_IDEAS` e persistem em `ContentSceneSet`, uma unidade separada por `(tenantId, briefVersionId)`, conforme ADR-019.

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

## 6. B4-03 — HIGH como tier canônico

O runtime ADR-029 permanece como baseline. As capabilities abaixo permanecem em `HIGH`:

| Capability | Tier | Regra vigente |
|---|---:|---|
| `CONTENT_BRIEF_GENERATION` | `HIGH` | retry de contrato por batch; sem fallback acima de HIGH |
| `CONTENT_BRIEF_REPAIR` | `HIGH` | até `GENERATION_MAX_REPAIRS`; sem fallback acima de HIGH |
| `CONTENT_SCENE_IDEAS` | `HIGH` | até duas tentativas por Content; sem fallback acima de HIGH |
| `CONTENT_QUALITY_JUDGE` | `HIGH` | sem retry semântico; falha não vira `PASS` |
| `CONTENT_PART_REPAIR` | `HIGH` | uma passagem por parte `REVIEW`; sem re-Judge/fallback semântico |

`reasoning.effort` é dimensão independente, server-side e registrada por tentativa. Não é tier, não é substituto de gate e não é selecionável pelo creator, plano comercial ou LLM. Qualquer avaliação de `MID` é A/B isolado; sem relatório aprovado, `HIGH` permanece vigente.

## 7. B4-04 — SkillBinding, Blueprint futuro e A/B pendente

### 7.1 Estado atual

- `tiktok-commerce@1.2` é produção e baseline operacional.
- `tiktok-commerce@1.3` é foundation/harness inativa; não é carregada pelo runtime default.
- Esta SPEC não escreve `creativeDirection`, não ativa Blueprint e não altera o `ROUTER_MAP`.
- O mesmo `SkillBinding` deve ser usado dentro de cada par A/B operacional.

### 7.2 Protocolo pré-registrado, não executado

O A/B futuro fica pré-registrado apenas como protocolo documental:

- Cada par usa os mesmos `SkillBinding`, `platformSkillVersion`, modelo/provider lógico, seed, dataset/Golden Dataset, Product Facts/evidências, `creatorContext` e `ProductMemorySnapshot` por bytes.
- O tier também permanece igual por par, salvo no protocolo específico em que **tier é a única variável previamente declarada**.
- Não se combinam mudanças de Skill, tier, Planner, batch, cenas, Judge, repair, quota, memória, catálogo ou persistência.
- O protocolo registra engine commit, task, prompt/context hash, versão de gates, versão de schema, timeout, retries e quota simulada/autorizada.
- Antes de executar, fixa thresholds, categorias, métricas, regra de reprovação, Golden Dataset e formato do relatório.
- Mede agregado e por categoria: factualidade, variedade, naturalidade/criatividade conforme rubrica cega, hard-gate failure, repair rate, partial/failure rate, chamadas, custo, tokens e latência p50/p95.
- Execução, coleta de resultados, relatório aprovado e cutover não fazem parte desta Etapa 4.

### 7.3 Comparação `@1.2` versus `@1.3`

Comparar `@1.2` com `@1.3` muda o `SkillBinding`/`platformSkillVersion`; portanto, **não é o A/B operacional comum**. Exige ADR e protocolo experimental próprios, com variável única declarada como bundle versionado de `SkillBinding`, registro de hashes/bytes completos e aprovação antes de qualquer execução. Esse protocolo separado não autoriza cutover, ativação do Creative System, mudança do runtime ADR-029 ou escrita de `creativeDirection`.

### 7.4 Contrato futuro sem writer operacional

O alvo futuro, condicionado a SPEC/PLAN de cutover e eval aprovados, é um `CreativeBlueprint` versionado dentro do próprio `ContentOpportunity`:

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

`ContentOpportunity` v1 permanece sem `creativeDirection`; o contrato futuro v2 pode carregar o Blueprint validado, sem aggregate, tabela, serviço ou entidade paralela. Nesta Etapa:

- não existe writer de `creativeDirection`;
- não há promoção ou reescrita de histórico v1;
- provider, repair e Content Operations não escrevem Blueprint;
- a futura construção do Blueprint pertence ao Planner determinístico, após gate aprovado;
- a projeção creator-facing não muda.

## 8. Teste futuro de não vazamento do catálogo literal

O caminho Blueprint-driven futuro deve possuir um contract test que falhe se qualquer texto literal de hook/CTA do catálogo, inclusive texto alcançável por `selectBriefPatterns`, atravessar o contexto enviado ao provider.

O teste deve verificar a projeção allowlisted do contexto e comparar contra o corpus literal conhecido. Não deve criar fallback, substituir copy nem testar o resultado textual. O caminho vigente ADR-029, incluindo o uso atual de catálogo, permanece intacto como exceção até eval e cutover aprovados. O teste é gate de uma futura implementação Blueprint-driven; não é executado nem criado nesta mudança documental.

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
- ADR-029 fornece runtime, ordem, tiers, Judge e repairs vigentes.
- ADR-033 fornece a matriz de autoridade, Creative System versionado, catálogo fora do prompt novo e gate A/B/cutover.
- O Slice 004 permanece dependente do Slice 003 e não é dependência nem destino da Etapa 4.

## 11. Out of scope

- Qualquer alteração em código, schema, migration, provider, prompt de produção, Skill operacional, `ROUTER_MAP`, tier, batch, retry, quota, Job ou persistência.
- Execução de A/B, coleta de Golden Dataset, relatório, aprovação de candidato ou cutover.
- Ativação de `tiktok-commerce@1.3`, Creative System, Blueprint ou escrita de `creativeDirection`.
- Writer, migração, promoção ou reescrita de `ContentOpportunity` v1 para v2.
- Alteração de PRD, ADR-029, ADR-033, SYSTEM-DESIGN, PRINCIPLES, DESIGN ou nota imutável.
- Revisão, edição, regeneração, aprovação, descarte, versionamento operacional, lotes, Agenda ou Estúdio do Slice 004/005.
- Novo domínio, aggregate, serviço, agente, workflow, repositório ou capability de produto.
- Catálogo literal no prompt normal, fallback criativo, template de cenas ou copy determinística.
- Otimização declarada de custo, latência ou qualidade sem protocolo e relatório aprovado.

## 12. Riscos e controles

| Risco | Controle documental |
|---|---|
| PRD legado mantém `scenes` dentro do Brief | ADR-019 e esta SPEC fixam `ContentSceneSet` separado; payload legado permanece read-only. |
| Fórmula curta omite Judge, repairs, cenas ou retries | `cost_job_total` soma cada tentativa efetiva por capability; `D_content` é o denominador entregue. |
| A/B mistura Skill, tier ou contexto | Pré-registro fixa binding, versão, modelo, seed, dataset, contexto e memória por par; mudanças de Skill usam ADR/protocolo separado. |
| `@1.3` é ativada por harness | Estado operacional explícito: `@1.2` produção, `@1.3` inativa; sem writer/cutover. |
| Catálogo literal ancora geração futura | Contract test futuro bloqueia vazamento no caminho Blueprint-driven; runtime ADR-029 não é alterado. |
| LLM recebe autoridade sobre regra de sistema ou tenant | Handoff allowlisted e validação server-side de schema, factualidade, ownership, quota, estado e persistência. |
| Etapa 4 invade Slice 004 | Identidade é precondição documental do Slice 003; revisão/controle permanecem no Slice 004. |

## 13. Critérios de aceite

- **AC-04.1:** `ContentBriefVersion` novo não contém `scenes`; `ContentSceneSet` é o contrato separado de cenas.
- **AC-04.2:** `cost_job_total` soma tentativas efetivas de capabilities fundacionais, Brief, repairs, cenas, Judge e Semantic Part Repair; `cost_per_valid_content` usa D Contents entregues.
- **AC-04.3:** `HIGH` permanece canônico para Brief, cenas, Judge e repairs; qualquer `MID` depende de A/B isolado aprovado.
- **AC-04.4:** A/B comum exige o mesmo `SkillBinding` por par e congela `platformSkillVersion`, modelo, seed, dataset, contexto e memória; tier só varia no protocolo específico que o declarar como única variável.
- **AC-04.5:** comparação `@1.2`/`@1.3` está registrada como pendência de ADR/protocolo separado e não autoriza execução, ativação ou cutover.
- **AC-04.6:** o contrato futuro de Blueprint/`ContentOpportunity` v2 existe sem writer, sem promoção de v1 e sem `creativeDirection` operacional.
- **AC-04.7:** o teste futuro de não vazamento de catálogo literal está definido para o caminho Blueprint-driven, mantendo o caminho ADR-029 intacto.
- **AC-04.8:** gates, Judge, repairs, factualidade, Job, tenant, quota e persistência permanecem server-side e conforme Slice 003/ADR-019/021/029.
- **AC-04.9:** nenhum A/B foi executado e nenhum cutover foi realizado por esta documentação.
- **AC-04.10:** nenhuma fonte canônica fora dos três arquivos autorizados foi alterada.

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
