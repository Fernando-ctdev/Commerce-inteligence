# Slice 003 — Primeira geração: CommerceIntelligenceJob até Briefings
**Status:** ETAPA_2_APPROVED — documentação canônica da Etapa 2 aprovada; implementação, runtime e cutover continuam bloqueados pelos gates ADR-029/033.

**Etapa 2 documental:** APPROVED pelo Arquiteto e pelo Review; implementação, runtime e cutover continuam bloqueados pelos gates ADR-029/033.


> **Para agentes de implementação:** execute este plano tarefa a tarefa, preservando os limites do Slice 003. Cada etapa termina com seu teste/gate local antes da próxima.

**Goal:** Depois da confirmação de um Product com `targetContentCount` resolvida, criar uma única execução assíncrona durável e entregar `ProductStrategy`, `ContentPlan` e a quantidade solicitada de `Content` com `ContentBriefVersion` v1 em `DRAFT` — completa em `SUCCEEDED`, ou parcial declarada (`SUCCEEDED_PARTIAL`) publicando somente aprovados com retry explícito dos faltantes, conforme ADR-021; nunca sucesso parcial silencioso.

**Architecture:** O monólito Next.js mantém o domínio em módulos TypeScript: um caso de uso de Commerce Intelligence resolve autorização, quantidade, Entitlement e `CommerceIntelligenceJob`; um worker PostgreSQL executa a pipeline fora de transações longas; a engine usa contratos canônicos, Platform Skill versionada e Model Router; a finalização publica o conjunto em uma transação curta — completo em `SUCCEEDED` ou declarado em `SUCCEEDED_PARTIAL` (ADR-021). O App Shell consulta o backend e mostra o estado real, sem usar estado local como fonte de verdade.

**Tech Stack:** Next.js 16 App Router/Route Handlers, React 19, TypeScript strict, PostgreSQL, Prisma 6, `tsx --test`, `fetch` nativo para o adapter do provider, CSS Modules e componentes shadcn/ui já presentes.

---

## 0. Gate documental da Etapa 0

A Etapa 0 é uma pré-condição transversal documentada neste PLAN; não cria `slice-000` nem `stage-0`. O [ADR-033](../../architecture/adr-033-determinismo-llm-e-creative-system.md) é a referência explícita da arquitetura-alvo, enquanto o [ADR-029](../../architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md) permanece o runtime vigente até eval A/B aprovado.

Nenhuma implementação deste PLAN pode remover ou reclassificar chamadas, tiers, cenas, gates, repairs ou o `ROUTER_MAP` antes de um protocolo A/B pareado, thresholds versionados, relatório reproduzível e aprovação formal conforme o ADR-033. O Blueprint e qualquer escrita de `creativeDirection` ficam bloqueados até SPEC e PLAN de cutover aprovados.
**Gate documental:** Architect e Review aprovaram a documentação da Etapa 2, com referências consistentes ao ADR-033, baseline ADR-029, contrato do Creative System, compatibilidade fail-closed, histórico/memória versionados, catálogo fora do prompt normal e preservação de gates/repair/Judge. Esse gate documental não autoriza implementação, runtime novo ou cutover.

**Gate de cutover/eval:** somente após o gate documental pode ser preparado o A/B com baseline ADR-029 e candidato ADR-033, mesmos inputs, Skill, modelo/tier, seed e Golden Dataset por par; thresholds e análise por categoria devem ser fixados antes da execução. Remoção ou reclassificação só ocorre depois do relatório aprovado; a economia isolada não é critério suficiente.

**Status desta etapa:** `APPROVED` para a documentação da Etapa 2; implementação e cutover permanecem bloqueados pelos gates ADR-029/033.


## 1. Limites deste plano

### Incluído

- Confirmação de Product no fluxo de entrada, ou caso de uso equivalente para Product já confirmado, resolvendo `targetContentCount` server-side antes do Job.
- Job PostgreSQL durável, worker com lease/timeout, reclaim, backoff, limite de tentativas e estados `QUEUED`, `RUNNING`, `SUCCEEDED`, `SUCCEEDED_PARTIAL`, `FAILED` e `CANCELLED` (ADR-021).
- Pipeline inicial completa: entendimento do Product, oportunidades comerciais, Strategy v1, ContentPlan, ContentOpportunity, Brief Generator, Fact/Quality/Variety Gates, repair limitado e persistência final.
- Entitlement mensal de conteúdos, reserva transacional com mês UTC de origem e reconciliação idempotente.
- Strategy, Plan, Opportunities, Contents, BriefVersions, `BriefValidationReport`, `IntelligenceRun` e sinais estruturados de memória.
- Model Router por tarefa lógica, um adapter de provider configurável e `TikTok Commerce Creative Skill` versionada.
- Contrato documental do Creative System dentro da `PlatformSkill`: `CreativePrimitive`, `CreativeRecipe`, resolvedor de compatibilidade e `CreativeBlueprint`, com `load → validate → freeze → expose`, versionamento, histórico e falha fail-closed.
- Cutover futuro e eval A/B formal antes de qualquer remoção ou reclassificação do runtime ADR-029; nenhuma escrita de `creativeDirection` durante a baseline.
- Indicador global no App Shell, readiness do Product, reentrada pelo backend, retry explícito e cancelamento seguro somente se suportado pelo worker.
- Preservação de Product por archive operacional e DELETE Big Bang tenant-scoped transacional, conforme códigos e rollback definidos na SPEC.
- Testes comportamentais, contract tests de capabilities, testes de concorrência/lease/quota e smoke autenticado.

### Não incluído

Não iniciar geração no simples `Salvar produto` de `/products/new`; não criar novo wizard ou tela permanente de análise; não implementar revisão, edição, regeneração, aprovação, descarte, RecordingBatch, Agenda, Estúdio, memória histórica consultada ou recorrência; não adicionar fila visual, Redis/Kafka, microserviço, embeddings, banco vetorial, judge LLM para aprovação do usuário, variedade ou memória semântica, mídia, publicação, analytics, TikTok OAuth/API, escolha de provider/tier na UI ou alteração de PRD/ADR/SYSTEM-DESIGN/DESIGN/SLICES. A curadoria semântica interna fica limitada a hook, development, script, CTA e cenas de `ContentSceneSet`: o `CONTENT_QUALITY_JUDGE` retorna somente `PASS|REVIEW` por parte; `BriefValidationReport` continua registrando somente o resultado objetivo `PASS|REPAIR|REJECT`; `Hard Gate Repair` usa `GENERATION_MAX_REPAIRS`; cada parte `REVIEW` recebe uma única `Semantic Part Repair`, sem re-Judge. `REVIEW` semântico não impede `DRAFT`: somente hard gates, schema, factualidade, cenas e variedade objetivos decidem entrega. Falha ou schema inválido preserva o original e não cria faltante.
- A arquitetura-alvo não antecipa mudança operacional: chamadas, tiers, cenas, gates, repairs e `ROUTER_MAP` permanecem os do ADR-029 até o relatório A/B aprovado.
- A Etapa 0 não implementa código nem cria serviço, agente, workflow, repositório ou aggregate separado para o Creative System.

A confirmação deve ser conectada ao fluxo de confirmação existente quando ele for disponibilizado. No estado real atual há apenas o modelo `ProductImportAttempt` no Prisma, sem fluxo server-side de importação/Candidate conectado à UI; portanto, o ponto de entrada testável deste slice é um caso de uso que recebe `tenantId` resolvido, `productId` de um Product ativo sem resultado publicado e a quantidade persistida no Product. Product `READY` oferece `Revisar conteúdos` — e, quando o último job for `SUCCEEDED_PARTIAL`, também `Gerar faltantes` (ADR-021); nova geração/recorrência arbitrária do mesmo Product pertence ao Slice 008. O formulário manual continua apenas salvando Product; a ação contextual `Analisar produto` no detalhe representa a confirmação equivalente sem transformar o salvamento em geração automática.

A política de lifecycle e DELETE não é uma decisão nova deste plano: está ancorada na SPEC aprovada, B-003-14, RI-003-18 e AC 47–52. `DELETE` físico é a remoção Big Bang tenant-scoped, transacional e com rollback integral; `Arquivar produto` é uma operação distinta e preservativa.

---

## 2. Estado real do repositório e áreas afetadas

| Área | Estado observado | Mudança prevista neste slice |
|---|---|---|
| Prisma | `Product`, `ProductImportAttempt`, `TenantEntitlement`, `TenantPreference`, `CommerceIntelligenceJob`, `GenerationUsageReservation`, `IntelligenceRun`, `ProductUnderstanding`, `ProductStrategy`, `ContentPlan`, `ContentOpportunity`, `Content`, `ContentBriefVersion`, `BriefValidationReport`, `ContentSceneSet` e `ProductMemorySnapshot` existem no schema atual. | Reutilizar os modelos, relações, índices e migrations existentes; a Etapa 2 não parte de um runtime de Job ausente. |

| Identity/Tenant | `resolveSession`, `requireSession`, `SESSION_COOKIE`, `sameOriginRequest` e `readJsonBody` existem. | Reutilizar sem aceitar `tenantId`/`userId` do cliente; apenas mutações passam por proteção de origem/CSRF existente. |
| Product | `src/modules/products/service.ts` valida e persiste fatos, restrições e `targetContentCount`; `src/modules/products/http.ts` lista, edita, arquiva e executa DELETE físico Big Bang tenant-scoped. | Expor snapshot confirmado e readiness derivada; preservar `POST /api/products` sem iniciar Job; incluir readiness na leitura/lista; manter DELETE transacional com isolamento por Tenant e contador de ativos consistente, sem confundir com archive. |
| Product UI | `ProductDetail` compõe `GenerationActions`, `ContentsView`, `StrategyView` e `HistoryView`, com `useGenerationJob`; `product-list.tsx` carrega a geração corrente por Product e há testes client-side dessas superfícies. | Preservar a UI server-authoritative de geração, readiness, retry/cancelamento e histórico conforme contratos ativos; não duplicar estado em `localStorage`. |
| App Shell | `ProductShell` é usado por Home, Produtos e Configurações; as superfícies de geração e toast existem nos componentes atuais. | Reutilizar o shell e as superfícies existentes para estados globais/por Product, sem criar indicador concorrente ou bloquear navegação. |
| Product import | `ProductImportAttempt` possui status/lease no schema, mas não há processador ou UI server-side conectada no estado atual. | Usar esse modelo apenas como precedente de lease/status; não iniciar nem duplicar importação neste slice. |
| Geração | `src/components/products/generation/*` contém API, hook, views, estados, histórico e testes; o runtime server-side em `src/modules/commerce-intelligence/` contém service, HTTP, engine, router/provider, worker, runtime, observabilidade e testes. | Reutilizar `CommerceIntelligenceJob`, API server-authoritative, estados/stages da SPEC, retry, cancelamento e publicação terminal; remover somente contrato incompatível comprovado, sem reintroduzir ponteiro local. |

| Engine/Router/Skill | `src/modules/commerce-intelligence/engine.ts`, `model-router.ts`, `provider.ts`, `platform-skill.ts`, `creative-system.ts`, `gates.ts` e seus testes existem e implementam o runtime atual. | Reutilizar as portas e contratos atuais; alinhar somente a documentação/testes da Etapa 2, sem criar uma segunda fronteira. |

| Worker/observabilidade | `worker.ts`, `runtime.ts`, `observability.ts`, `scripts/worker.mts` e testes de worker/runtime/observabilidade existem. | Reutilizar claim/lease, heartbeat, eventos sanitizados e entrypoint existentes; a Etapa 2 não cria worker/runtime/observabilidade paralelos. |

| Entitlements | `TenantEntitlement.activeProductsLimit/activeProductsUsed` é recalculado na transação de geração a partir dos Products `ACTIVE`; reservations `RESERVED|CONFIRMED|RELEASED`, mês UTC, capacidade `GENERATED_CONTENTS_MONTH_LIMIT` e testes de bloqueio/release existem no runtime. | Preservar a reconciliação/contagem server-side e a reserva/confirmar/liberar idempotentes, sem aceitar limites do cliente nem criar uma segunda fonte de quota. |
| Testes | O projeto usa `tsx --test`; o script atual de `package.json` já inclui os testes de generation, commerce-intelligence, Entitlement, Product lifecycle, HTTP, observability, runtime, worker, worker-fence, Product readiness e UI-model. | Preservar o script existente; adicionar somente testes/fixtures necessários, mantendo testes de banco identificáveis e executáveis com `DATABASE_URL`. |

---

## 3. Contratos e decisões de implementação

### 3.1 Entrada server-side

O request público de `POST /api/generations` recebe somente `productId` no body, uma `Idempotency-Key` no header e a sessão como fonte de `tenantId`/`userId`; não aceita do cliente quantidade, `mode`, plano, período, quota, provider, tier, Strategy, Skill ou snapshot. Internamente, `startCommerceIntelligence` recebe `{ tenantId, userId, productId, idempotencyKey, targetContentCount?, mode?: "standard" | "retry" | "complete" }`. `mode` defaulta para `standard`; sem `targetContentCount`, a operação usa a quantidade persistida no Product; `retry`/`complete` são parâmetros server-side para recovery, e `targetContentCount` override representa somente a quantidade faltante autorizada. O caso de uso consulta o Product no Tenant, exige `lifecycle = ACTIVE`, fatos confirmados, quantidade inteira entre `1` e `10` e ausência de resultado publicado; Product `READY` não é elegível para `standard`.


A confirmação inicial resolve `targetContentCount` antes de criar o Job. O valor usado no Job é o mesmo valor persistido no Product pelo Slice 002 e permanece imutável durante a execução. O caso de uso de confirmação chama essa operação dentro da mesma transação que ativa o Product; o caminho manual isolado permanece sem efeito colateral. A liberação da trava global após `SUCCEEDED` não autoriza reanalisar o mesmo Product; recorrência fica no Slice 008.

### 3.2 Estados e stages

Estados persistidos: `QUEUED`, `RUNNING`, `SUCCEEDED`, `SUCCEEDED_PARTIAL`, `FAILED`, `CANCELLED` (parcial declarado conforme ADR-021). Stages públicos, nesta ordem:

- `UNDERSTANDING_PRODUCT` → `Entendendo o produto...`
- `MAPPING_COMMERCIAL_OPPORTUNITIES` → `Mapeando oportunidades comerciais...`
- `BUILDING_STRATEGY` → `Definindo a melhor estratégia para este produto...`
- `BUILDING_CONTENT_PLAN` → `Organizando as oportunidades de conteúdo...`
- `GENERATING_BRIEFS` → `Preparando os Briefings do Conteúdo...`
- `FINALIZING` → `Finalizando...`

O worker persiste cada stage antes da chamada/processamento correspondente. Subetapas internas agrupadas não são expostas como stages concluídos. A aplicação, e não LLM/provider, decide estados, stages, quantidade, IDs, versões, quota, autorização, retry e sucesso.

### 3.3 Contratos canônicos

Criar em `src/modules/commerce-intelligence/contract.ts` tipos e validadores runtime para:

- `ProductUnderstanding`: `productId`, arrays `coreUseCases`, `capabilities`, `functionalBenefits`, `emotionalBenefits`, `desiredOutcomes`, `purchaseTriggers`, `purchaseBarriers`, `evidenceRefs`; `category` opcional.
- `CommercialOpportunity`: `id`, relações opcionais de `audience`, `situation`, `pain`, `desire`, `desiredOutcome`, `objection`; arrays `relevantCapabilities`, `benefits`, `proofOptions`; `sellingArgument`, `confidence` interno e `evidenceRefs`.
- `CommercialOpportunityMappingEnvelope`: pool/role semântico com públicos, situações, hipóteses de contexto, desejo, identificação, curiosidade, aspiração, humor e potencial visual, além de dores, objeções, necessidades e `CommercialOpportunity`s relacionadas quando existirem; nenhuma dessas dimensões opcionais exige dor, objeção ou necessidade prévia para uma hipótese válida; sem ownership ou comandos.
- `ProductStrategy` v1 `ACTIVE`: campos mínimos da SPEC, inclusive `platformId` e `platformSkillVersion`, vinculada ao Product e ao Job.
- `ContentPlan`: `id`, `productId`, `strategyVersion`, `targetContentCount`, plataforma/Skill e oportunidades vinculadas.
- `ContentOpportunity`: `id`, `commercialObjective`, `angle`, `coreMessage`, `hookMechanism`, `noveltyTargets`, mais campos relacionais opcionais e `sourceOpportunityId` quando válido.
- `ContentBriefBatch`: quantidade limitada de itens, um resultado por oportunidade e nenhum ID persistente atribuído pelo provider.
- `ContentBriefVersion` v1: `angle`, `hook`, `development`, `script`, `cta` obrigatórios; `scenes` não pertence ao payload novo do Briefing; `structure`, `objective`, `targetAudience`, `pain`, `desire`, `objection`, `benefit`, `notes` opcionais. Payload histórico que contenha `scenes` é somente leitura e não é reescrito.
- `ContentSceneSet` (ADR-019): contrato separado por `briefVersionId`, com payload ordenado `{ scenes[], generated, dropped }` e status próprio; para geração nova, não é campo de `ContentBriefVersion`.
- `BriefValidationReport`: `briefId` como nome canônico, derivado de `contentId + briefVersionId`, com statuses objetivos `factualStatus`, `structuralStatus`, `platformStatus`, `varietyStatus`, `issues` e decisão objetiva `PASS|REPAIR|REJECT`.
- `CONTENT_QUALITY_JUDGE`: após hard gate `PASS`, retorna somente `PASS|REVIEW` semanticamente por `contentId` e parte (`hook`, `development`, `script`, `cta`, `scenes` do `ContentSceneSet`). Cada parte `REVIEW` recebe no máximo um `CONTENT_PART_REPAIR`, sem re-Judge; `GENERATION_MAX_REPAIRS` não se aplica ao repair semântico. Falha ou schema inválido preserva a parte original e não cria faltante. `REVIEW` semântico não bloqueia `DRAFT`; somente os gates objetivos decidem elegibilidade e entrega.

Os validadores devem rejeitar campos explicitamente proibidos de ownership, cardinalidade inválida, IDs externos/persistentes, arrays vazios quando obrigatórios, conteúdo acima dos limites definidos e quantidade diferente de `targetContentCount`. Devem validar relações de `CommercialOpportunity`, referências de evidência conforme a fronteira da capability, hash de estrutura, quantidade de cenas válida para o formato e alinhamento entre oportunidade e briefing. O adapter não atribui autoridade a `tenantId`, IDs persistentes, status, quota, provenance ou comandos de workflow vindos do provider; campos explicitamente proibidos são rejeitados e campos fora do shape suportado são descartados pela canonicalização.


A cardinalidade é regulada por uma política centralizada e versionada por campo (`CARDINALITY_POLICY` / `CARDINALITY_POLICY_VERSION`, conforme ADR-012), não por parâmetros soltos nos validadores: máximos rígidos incondicionais (excedente é `GEN-SCHEMA` fail-closed, nunca truncamento silencioso), exceto a redução first-N explicitamente documentada de Product Understanding; mínimos são condicionais à evidência. Product Understanding aplica first-N no provider antes de `assertProviderOutput` e na engine antes do validador, na primeira tentativa e no retry; a redução do provider não é registrada como `understandingReductions`, enquanto a da engine é observável. Violações de cardinalidade fora dessa exceção alimentam os retries de contrato existentes e, persistindo, falham fechado sem fabricar, preencher ou aparar itens. O catálogo de evidências mantém relação 1:1 entre fatos e `evidenceRefs` (`fact:<chave>`; do segundo valor de uma chave em diante, `fact:<chave>:<n>`), preservando o alinhamento por índice da proveniência.


### 3.3B Etapa 2 — fatos do worker, entrada genérica e catálogo derivado

O plano deve implementar e testar o `WorkerEngineFactsPayload` exatamente conforme o runtime: `productId`, `name`, `description`, `category`, `brand`, `priceAmount`, `priceCurrency`, `variants`, `images`, `seller` e `sourceUrl`. `priceAmount` é `string | undefined`, produzido por `Decimal.toString()` quando presente; os demais valores não recebem normalização inventada. Conforme ADR-030, o payload do worker não contém `features`, `characteristics`, `commission`, `discount`, `evidenceRefsCatalog` ou `creatorConstraints`.

`EngineInput.facts?: Record<string, unknown>` permanece genérico e também pode ser fornecido diretamente por um caller; não se promete que `features` sejam projetadas, removidas ou transformadas. Na chamada feita pelo worker, `facts` é o payload acima e não contém `creatorConstraints`; `creatorContext` é separado.

`evidenceRefsCatalog` é uma derivação posterior da engine por `buildEvidenceCatalog`, a partir de `name`, `description` e valores string/arrays de strings em `facts`, com refs `fact:<chave>` e `fact:<chave>:<n>`. Não pertence a `projectEngineFacts` nem ao payload enviado pelo worker.

`Discovery` é o pool/role semântico do envelope/capability `COMMERCIAL_OPPORTUNITY_MAPPING`; não cria capability, call ou stage adicional. PU valida forma, cardinalidade e pertencimento de suas `evidenceRefs`, e Mapping valida as referências do `CommercialOpportunityMappingEnvelope`. Strategy consome a projeção já validada e não promete validação direta de `evidenceRefs`; não há filtragem claim-level de `UNSUPPORTED`/`CONTRADICTED` nessa fronteira. Product Understanding aplica first-N no provider antes de `assertProviderOutput` e na engine antes do validador, na primeira tentativa e no retry; a redução do provider não é registrada como `understandingReductions`, enquanto a redução da engine é observável. Essa exceção não autoriza truncamento silencioso de outros contratos.


Na fronteira provider/canonicalização, chaves explicitamente proibidas são rejeitadas e comandos, workflow, instruções ou outros campos fora do shape suportado são descartados. Rejeitar esses campos desconhecidos em vez de descartá-los é mudança de runtime. O limite ativo é `1–10`, sem expansão de quota por referências históricas ou de migration `1–30`.

### 3.3A Creative System e CreativeBlueprint — contrato alvo sem cutover

O Creative System é conhecimento declarativo/versionado dentro da `PlatformSkill`, não um domínio, serviço, agente, workflow ou repositório separado. A Skill expõe `CreativePrimitive`, `CreativeRecipe` e o resolvedor de compatibilidade somente após `load → validate → freeze → expose`.

`CreativePrimitive` representa dimensões semânticas combináveis, nunca frases. `CreativeRecipe` é um conjunto coerente de restrições, nunca um script. O `CreativeBlueprint` futuro contém `recipeId?`, `attentionMechanisms[]`, `psychologicalEffects[]`, `format`, `narrativeMoves[]` e `productRole`; sua compatibilidade é versionada, fail-closed e sem fallback criativo, reescrita silenciosa ou fabricação.

Após cutover aprovado, o Blueprint será persistido como `creativeDirection` dentro de `ContentOpportunity`, sem aggregate ou tabela paralela. O contrato v1 histórico permanece legível e não é reescrito; memória e snapshots são aditivos e carregam a versão usada. O provider, repair e qualquer caminho externo não escrevem o Blueprint.

O catálogo literal continua corpus de referência, benchmark e eval. Não é enviado ao prompt normal dos caminhos novos; qualquer experimento de exemplos exige flag, harness, dataset e métricas próprios. O runtime ADR-029, inclusive `selectBriefPatterns`, permanece intacto até eval.

### 3.4 Model Router e Skill

Criar a porta mínima em `src/modules/commerce-intelligence/model-router.ts` e um adapter HTTP separado em `src/modules/commerce-intelligence/provider.ts`, usando `fetch` nativo e configuração server-side. O Router recebe task lógica e contexto projetado; resolve o tier e registra provider/modelo lógico, reasoning efetivo e versão/hash das instruções. O MVP usa somente `LLM_MODEL_FAST`, `LLM_MODEL_BALANCED` e `LLM_MODEL_QUALITY`, resolvidas por tier (`LOW→FAST`, `MID→BALANCED`, `HIGH→QUALITY`) com fallback apenas entre variáveis existentes e configuradas.

O mapa abaixo é a baseline operacional exata do ADR-029, do `ROUTER_MAP` atual em `src/modules/commerce-intelligence/model-router.ts` e do runtime vigente. Não rebaixar tiers, alterar retries/fallbacks ou mudar autoridades por este PLAN:

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

Essa baseline permanece vigente até protocolo A/B, relatório versionado e aprovação formal do ADR-033. Nenhuma mudança de tier, retry, fallback, cena, Judge ou repair ocorre antes disso.

O provider envia `reasoning: { effort: "low" }` explicitamente por padrão para todas as tasks. O esforço é configurável somente por configuração server-side allowlisted para testes controlados; a engine não escolhe reasoning por request. O Router registra o reasoning efetivo. Reasoning não substitui limites de contexto, schema ou exact-N.

O envelope separa instruções confiáveis, fatos/contexto confirmado e dados externos não confiáveis. O mapping usa prompt e contexto compactos: fatos essenciais, catálogo de evidências e somente os campos do Product Understanding necessários para oportunidades comerciais; não recebe Strategy, ContentPlan, memória histórica, Skill completa ou agregado bruto.

O provider ausente, timeout ou resposta não utilizável causa `GEN-PROVIDER` ou `GEN-SCHEMA` conforme a origem; erros de factualidade, variedade e repair mantêm seus códigos específicos. Nenhum erro conhecido pode ser convertido em `GEN-PERSISTENCE`. Não existe provider fake/fallback inventado. Testes usam adapter in-memory, sem apresentá-lo como provider de produção.

Registrar metadata allowlisted por capability/batch: task, tier, provider/modelo lógico, reasoning efetivo, versão/hash das instruções, duração, tamanhos de request/context/response, tentativa, retry, validações, repairs e erro. Nunca registrar prompt completo, payload bruto, cookie, token ou segredo.

Preservar a `TikTok Commerce Creative Skill` vigente conforme o runtime ADR-029. Especificar e validar de modo aditivo somente a fundação Creative System, com validação de versão, schema e compatibilidade; nenhuma ativação operacional do Creative System, escrita de `creativeDirection` ou uso do Blueprint ocorre antes de SPEC/PLAN de cutover e eval aprovados. A Skill não tem acesso a Job, Prisma, quota ou persistência.

O Creative System pode ser carregado, validado, congelado e exposto como fundação declarativa somente no caminho aditivo autorizado pelo gate documental. Compatibilidade desconhecida, referência inválida, versão ausente ou elegibilidade impossível falham fechado com códigos estáveis `GEN-CS-*`; isso não ativa o sistema no runtime ADR-029. Nenhum número de recipes, proporção recipe/composição livre, quantidade de chamadas ou threshold de eval é contrato deste PLAN.

### 3.5 Primeira pipeline

1. `UNDERSTANDING_PRODUCT`: Product Understanding usando fatos confirmados e `evidenceRefs`.
2. `MAPPING_COMMERCIAL_OPPORTUNITIES`: uma chamada compacta para um envelope não vazio de oportunidades comerciais; recebe somente Product facts essenciais, catálogo de evidências e os campos de entendimento necessários.
3. `BUILDING_STRATEGY`: Strategy Builder para uma única Strategy v1.
4. `BUILDING_CONTENT_PLAN`: Content Portfolio Planner para um único Plan cuja distribuição soma exatamente `targetContentCount`.
5. `GENERATING_BRIEFS`: Brief Generator em batches sequenciais de 4–8 oportunidades; cada item recebe identidade server-side depois da validação.
6. Fact Validator com estados `SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED`, `CONTRADICTED`, baseado em fatos/evidências estruturados.
7. Quality Gate estrutural/factual/plataforma por briefing e Variety Gate determinístico no conjunto.
8. Repair limitado em batches somente para rejeitados, carregando causas e oportunidade original, preservando Briefings `PASS`.
9. Resultado final completo em `SUCCEEDED` ou parcial declarado em `SUCCEEDED_PARTIAL` (somente aprovados, variedade revalidada `ceil(D/K)` — ADR-021), sem preencher quantidade com conteúdo irrelevante.

Para `targetContentCount = N`, a linha de base de chamadas é `4 + ceil(N / batchSize)`, com `batchSize` entre 4 e 8, sem contar repair. Não disparar `N` requests simultâneos por padrão; concorrência adicional exige limite explícito, telemetria e teste de rate limit.

Os quatro calls fundacionais, a composição de briefs, cenas por Content e Judge são a baseline operacional ADR-029 deste PLAN. A arquitetura-alvo do ADR-033 só pode substituir o menor caminho comprovado por eval A/B; retries, gates e repairs existentes continuam medidos separadamente.

Stages são atualizados antes da etapa. O Brief Generator recebe somente a projeção da Strategy, oportunidade, restrições aplicáveis, `Creator Context` e `validationRules` da Skill. Seus prompts instruem separação entre decisão estratégica e fala sugerida, cenas simples, linguagem oral e liberdade para não ler o script literalmente.

A engine não consulta histórico nem memória anterior nesta primeira execução. O `ProductMemorySnapshot` de entrada é vazio; somente sinais estruturados dos Contents entregues por um resultado `SUCCEEDED` ou `SUCCEEDED_PARTIAL` podem ser persistidos na finalização (ADR-021).

---

## 4. Persistência e migration

### 4.1 Modelos a adicionar em `prisma/schema.prisma`

Adicionar relações ao `Tenant` e `Product` e estes modelos; campos de payload evolutivo ficam em JSONB, mas ownership, estados, quantidade, versões, timestamps e dimensões de consulta permanecem estruturados:

- `CommerceIntelligenceJob`: `id`, `tenantId`, `userId`, `productId`, `idempotencyKey`, fingerprint, `targetContentCount`, `generatedContentsMonth`, `status`, `stage`, `attempt`, `attemptDeadlineAt`, `leaseOwnerId`, `leaseDeadlineAt`, `nextAttemptAt`, `startedAt`, `finishedAt`, erro público sanitizado/código interno, capability/stage de erro e metadata operacional. Índices por `(tenantId,status)`, `(status,nextAttemptAt,leaseDeadlineAt)` e `(tenantId,productId,createdAt)`; unique `(tenantId,idempotencyKey)`.
- `GenerationUsageReservation`: `id`, `tenantId`, `jobId`, `generatedContentsMonth`, quantidade, estado `RESERVED`/`CONFIRMED`/`RELEASED`, motivo e timestamps; unique `jobId` e índice por `(tenantId,generatedContentsMonth,status)`. A reserva é a unidade de reconciliação e não é recriada em retry técnico.
- `IntelligenceRun`: `id`, `tenantId`, `jobId`, `productId`, engine version, Skill version, metadata allowlisted por capability/batch — task, tier, provider/modelo lógico, versão/hash das instruções, duração, bytes, tentativa, retry, validação, repairs e erro — snapshot de memória de entrada e timestamps. Não guardar prompts, tokens secretos ou payload bruto.
- `ProductUnderstanding`: `id`, `tenantId`, `productId`, `jobId`, payload canônico JSONB, version e timestamps.
- `CommercialOpportunity`: `id`, `tenantId`, `productId`, `jobId`, campos relacionais estruturados quando necessários, payload canônico e timestamps.
- `ProductStrategy`: `id`, `tenantId`, `productId`, `jobId`, `version`, `status`, `platformId`, `platformSkillVersion`, payload canônico e timestamps. Índice parcial único por Product para `status = ACTIVE`.
- `ContentPlan`: `id`, `tenantId`, `productId`, `jobId`, `strategyId`, version da Strategy, quantidade, plataforma/Skill, payload canônico e timestamps. Unique `(jobId)`.
- `ContentOpportunity`: `id`, `tenantId`, `productId`, `planId`, `jobId`, campos mínimos estruturados, opcionais e payload. Unique `(planId,id)` e índice por plan.
- `Content`: `id`, `tenantId`, `productId`, `jobId`, `planId`, `opportunityId` opcional, posição, status `DRAFT`, `currentBriefVersionId` nullable durante a montagem, `approvedBriefVersionId` nullable, payload mínimo e timestamps. Unique `(jobId,position)`; nenhum `approvedBriefVersionId` na primeira geração. A transação curta insere somente Contents aprovados, insere a `ContentBriefVersion` v1 e preenche `currentBriefVersionId` antes de marcar o Job `SUCCEEDED` ou `SUCCEEDED_PARTIAL` (ADR-021).
- `ContentBriefVersion`: `id`, `tenantId`, `productId`, `jobId`, `contentId`, version, payload canônico imutável e timestamps. Unique `(contentId,version)` e índice por `(jobId,contentId)`.
- `BriefValidationReport`: `id`, `tenantId`, `jobId`, `contentId`, `briefVersionId`, `briefId` derivado de `contentId + briefVersionId`, statuses objetivos e decisão objetiva `PASS|REPAIR|REJECT`, issues JSONB e timestamps. Unique por `briefId`; `briefId` é o mapeamento persistente do nome canônico para a versão imutável.
- `ContentSceneSet` (ADR-019): `id`, `tenantId`, `productId`, `contentId`, `briefVersionId`, payload ordenado `{ scenes[], generated, dropped }`, `status` `AVAILABLE|FILTERED|ERROR`, `gatePolicyVersion`, `backfilled` e timestamps. Unique por `(tenantId,briefVersionId)`; geração nova grava o set separado e leitores históricos não reescrevem `ContentBriefVersion`.
- `ProductMemorySnapshot`: `id`, `tenantId`, `productId`, `sourceJobId`, version, sinais estruturados JSONB e timestamps. Unique composto `(tenantId,sourceJobId)` impede snapshots duplicados em replay concorrente. Só recebe uma linha após sucesso pleno ou parcial (sinais somente dos Contents entregues — ADR-021); não criar/atualizar em falha ou cancelamento.

A futura introdução de `creativeDirection` não reescreve registros históricos nem cria agregado paralelo. A leitura deve aceitar o contrato histórico sem fabricar campos; a escrita, quando autorizada, pertence somente ao Planner determinístico do cutover aprovado.

Todos os modelos Product-scoped devem ter uniques compostos `(tenantId,id)` nas entidades referenciáveis e FKs compostas que incluam `tenantId` e `productId`: Job → Product; reservation → Job; run → Job/Product; Strategy → Job/Product; Plan → Strategy/Job/Product; Content → Plan/Opportunity/Job/Product; BriefVersion/Report → Content/Job/Product; MemorySnapshot → source Job/Product. Quando o Prisma exigir relação alternativa, o caso de uso deve executar lookup e persistência na mesma transação com `tenantId` e `productId` em todos os `where`/`create`. Não usar `ON DELETE CASCADE`: o DELETE físico deve executar a ordem completa da transação Big Bang tenant-scoped, com rollback integral; `Arquivar produto` permanece lifecycle separado, preservativo e reversível.

### 4.2 Regras SQL da migration

Criar `prisma/migrations/<timestamp>_slice003_commerce_intelligence/migration.sql`, aditiva e executável sobre o banco atual. A migration deve:

1. Criar somente enums e `CHECK`s de domínio simples, além de uniques e FKs; não expressar transições entre estados, exact-N entre tabelas, reconciliação ou regras de publicação no SQL.
2. Criar o índice parcial `UNIQUE (userId) WHERE status IN ('QUEUED','RUNNING')`, uniques compostos tenant-scoped e FKs compostas tenant/product-scoped, impedindo mistura relacional entre Tenants/Products.
3. Manter valores existentes de `TenantEntitlement`; não inventar limite mensal em migration. A capacidade mensal vem de configuração server-side validada e falha fechada se ausente/inválida.
4. Armazenar `generatedContentsMonth` como o período UTC calculado na criação; guards/CAS de aplicação usam esse valor em sucesso, falha e cancelamento, nunca o mês do término.
5. Permitir `NULL` em payloads intermediários e em `Content.currentBriefVersionId` durante montagem; guards/CAS protegem transições e a transação curta protege a publicação: exact-N apenas no `SUCCEEDED` pleno; em `SUCCEEDED_PARTIAL` publica somente aprovados com variedade revalidada (ADR-021).
6. Criar unique `(tenantId,sourceJobId)` para `ProductMemorySnapshot` e não backfillar Strategy, Contents, memória ou provenance com dados inventados.
7. Não remover tabelas/dados do Slice 001/002 e não criar triggers/policies de transição que não estejam realmente implementados.

A finalização usa `prisma.$transaction` curta para inserir o conjunto (completo ou somente aprovados em `SUCCEEDED_PARTIAL`), reports, run e memória, preencher `currentBriefVersionId`, confirmar a reserva pelos Contents entregues (liberando o restante em parcial — ADR-021) e marcar o Job `SUCCEEDED` ou `SUCCEEDED_PARTIAL`; qualquer falha faz rollback e chama reconciliação CAS-idempotente. Chamadas ao provider, repair e processamento não podem ocorrer dentro dela.

---

## 5. Sequência de implementação
### Tarefa 0 — Aprovar a documentação da Etapa 0
**Arquivos:** revisar somente `docs/specs/slice-003/SPEC.md`, `docs/plans/slice-003/PLAN.md` e `docs/delivery/SLICES.md`.

- Confirmar que a Etapa 0 é pré-condição transversal, sem `slice-000`/`stage-0`.
- Confirmar referências explícitas ao ADR-033 e a coexistência temporária com o runtime ADR-029.
- Confirmar Creative System na `PlatformSkill`, Primitive/Recipe/Blueprint, `load → validate → freeze → expose`, fail-closed, versionamento/histórico, memória, catálogo fora do prompt e gates preservados.
- Confirmar que qualquer remoção ou reclassificação depende do protocolo A/B, relatório reproduzível e aprovação formal.

**Gate:** Architect e Review aprovam os três documentos; enquanto pendente, nenhuma tarefa de código desta seção é executável.

### Tarefa 1 — Fixar o modelo de domínio e validação

**Arquivos:** modificar `src/modules/commerce-intelligence/contract.ts`, `errors.ts`, `stages.ts` e testes correspondentes.

- Definir os tipos canônicos e os códigos de erro `GEN-COUNT-REQUIRED`, `GEN-COUNT-RANGE`, `GEN-SCHEMA`, `GEN-FACT`, `GEN-VARIETY` e `GEN-REPAIR-EXHAUSTED`.
- Implementar validação runtime de Product snapshot, `CommercialOpportunityMappingEnvelope`, `CommercialOpportunity`, Strategy, Plan, ContentOpportunity, ContentBriefBatch, BriefVersion e `BriefValidationReport`, incluindo exact-N, IDs server-derived, `structure` opcional, `briefId = contentId + briefVersionId`, hash estrutural, cenas válidas, relações de oportunidade e evidências de claims.
- Centralizar a cardinalidade dos arrays na política versionada por campo (`CARDINALITY_POLICY` / `CARDINALITY_POLICY_VERSION`): máximos rígidos fail-closed sem truncamento, mínimos condicionais à evidência e versionamento registrado por geração (ver ADR-012 e seção 3.3).
- Implementar mensagens dos seis stages públicos e guards puros de transição; rejeitar transição inválida sem alterar estado.
- Testar quantity `1`, `30`, `0`, `31`, não inteiro; arrays obrigatórios vazios; oportunidade comercial incompleta; IDs/ownership/status/quota externos; claims unsupported/contradicted; duplicata normalizada; hash estrutural; quantidade de cenas inválida no `ContentSceneSet`; Plan cuja soma não é N; Brief sem `angle`, `hook`, `development`, `script` ou `cta`; payload legado com `scenes` somente leitura.

**Gate:** `npx tsx --test src/modules/commerce-intelligence/contract.test.ts` deve passar e não depender de Prisma/provider.

### Tarefa 2 — Adicionar schema e migration

**Arquivos:** modificar `prisma/schema.prisma`; criar migration do Slice 003; criar teste de integração de constraints em `src/modules/commerce-intelligence/persistence.test.ts`.

- Adicionar modelos/relacionamentos da seção 4 e preservar o schema atual do Slice 002, incluindo `ProductImportAttempt`.
- Aplicar índice parcial de um Job ativo por `userId`, unique de idempotência por Tenant, reserva única por Job, Strategy ACTIVE única por Product, unique de memória por `(tenantId,sourceJobId)` e isolamento relacional composto tenant/product-scoped.
- Testar migration limpa e incremental, FKs/uniques compostos contra cross-tenant/cross-product, `currentBriefVersionId` nullable durante montagem e rollback de finalização; transições, exact-N e publicação ficam fora da migration.

**Gate:** `npx prisma validate` e o teste de migration devem comprovar que a migration é aditiva, que o índice parcial bloqueia concorrência, que uma combinação relacional incompatível é rejeitada e que não há Product/job/reserva/memória parcial após rollback.

### Tarefa 3 — Implementar Entitlements, `active_products` e confirmação transacional

**Arquivos:** criar `src/modules/entitlements/generation.ts` e `src/modules/entitlements/products.ts`; criar `src/modules/commerce-intelligence/service.ts`; modificar `src/modules/products/service.ts`, `src/modules/products/http.ts` e as rotas de archive/reactivate/delete; criar testes de serviço e integração.

- Antes de criar Job, reconciliar `TenantEntitlement.activeProductsUsed` a partir da contagem server-side de Products `ACTIVE` do Tenant. O backfill deve ser idempotente, não confiar no contador legado e não reaplicar o limite de `active_products` a Product já `ACTIVE`; a validação de `activeProductsLimit` pertence exclusivamente ao cadastro e às transições de lifecycle.
- Implementar em transações curtas `activateProduct`, `archiveProduct` e `reactivateProduct`: travar a linha de Entitlement, recalcular/validar limite, alterar lifecycle e contador como decisão única; duas ativações concorrentes não ultrapassam limite; archive/reactivate repetidos não contam duas vezes.
- Fazer confirmação de Product novo executar ativação, reserva mensal e criação do Job na mesma transação. Product já ativo e autorizado, inclusive retry explícito, não reserva novamente `active_products`; o caminho manual `createManualProduct` continua sem iniciar geração, mas respeita a contagem de ativação.
- Criar configuração server-side para `generated_contents_month`; aceitar somente inteiro positivo configurado, sem plano/limite vindo do request.
- Implementar `reserveGeneratedContents`, `confirmGeneratedContents`, `releaseGeneratedContents` e `reconcileReservation` com estado condicional por `jobId`, mês UTC de origem e chave de reconciliação idempotente.
- Implementar `startCommerceIntelligence` em transação curta com os parâmetros internos `{ tenantId, userId, productId, idempotencyKey, targetContentCount?, mode? }`: resolver Product pelo Tenant, validar Product ativo sem resultado publicado, fatos e quantidade (persistida no Product por padrão ou override server-side de faltantes em `retry`/`complete`), verificar capacidade mensal, rejeitar Job ativo e criar reservation + Job `QUEUED`; Product `READY` é rejeitado para `standard` por RI-003-07/AC 46.
- Replays da mesma chave/fingerprint retornam o mesmo Job; fingerprint divergente não cria nova linha. Retry técnico/reclaim/reconnect reutiliza Job, chave e reserva; retry explícito após `FAILED`/`CANCELLED` cria novo Job/chave/reserva e preserva o terminal.
- Executar DELETE físico Big Bang somente dentro do Tenant, em transação com rollback integral: Product, dependências e reservas relacionadas são removidos conforme B-003-14/RI-003-18, com `404` uniforme para escopo inexistente e sem deixar resíduos; `Arquivar produto` permanece operação distinta, preservativa e decrementa `activeProductsUsed` atomicamente apenas em `ACTIVE → ARCHIVED`.
- Derivar readiness `PENDING`, `ANALYZING`, `READY`, `FAILED` somente a partir do Product e Jobs/resultados: `READY` deriva de `SUCCEEDED` (completo) ou `SUCCEEDED_PARTIAL` (aprovados publicados, com ação `Gerar faltantes` — ADR-021); `FAILED` de `FAILED`/`CANCELLED` sem resultado.

**Gate:** testes devem provar backfill/contagem de Products ativos, limite e corrida em activate/archive/reactivate, Product novo atômico, Product ativo sem reserva duplicada, `GEN-CAPACITY`, `GEN-PRODUCT-CAPACITY`, `GEN-ACTIVE`, mês UTC, replay, reconciliação CAS repetida, retry técnico versus explícito, Product `READY` bloqueado, DELETE Big Bang com isolamento/rollback e 404 uniforme, archive com decremento atômico e isolamento entre Tenants.

### Tarefa 4 — Implementar Skill, Router e adapter de provider
**Arquivos:** modificar `src/modules/commerce-intelligence/platform-skill.ts`, `model-router.ts`, `provider.ts` e testes contract.


- Especificar e validar a Skill/Creative System de forma aditiva e versionada, com `CreativePrimitive`, `CreativeRecipe`, compatibilidade e `load → validate → freeze → expose`; falhar fechado para versão, schema, referência, compatibilidade ou elegibilidade inválidos. A ativação operacional fica bloqueada até SPEC/PLAN de cutover e eval aprovados.
- Manter o mapa de tasks, tiers, cenas, gates, repairs e provider do ADR-029 como baseline operacional; nenhuma capability existente é removida ou reclassificada nesta tarefa.
- Preparar a definição versionada da fundação Creative System associada à TikTok Commerce Creative Skill default vigente (`tiktok-commerce@1.2`) e suas `validationRules`; o Creative System aditivo `@1.3` permanece inativo antes do gate, e nenhuma versão registra Blueprint como execução ativa antes do cutover aprovado.

- Separar semanticamente `ModelRouter` e `OpenAICompatibleProvider`; o Router resolve task/tier e o adapter executa HTTP. Um único provider/modelo é permitido no MVP, mas task, tier, provider/modelo lógico e versão/hash das instruções devem ser registrados.
- Separar instruções confiáveis, contexto confirmado, `Creator Context` e texto externo não confiável em envelopes distintos; aplicar projeções allowlisted e limites de tamanho; nunca enviar cookies, tokens, secrets, payloads de outro Tenant ou instrução externa como regra.
- Adapter HTTP usa configuração server-side, `AbortSignal`, deadline da tentativa e resposta estruturada; sanitiza erros e não persiste resposta bruta. Ausência de configuração, timeout e JSON sem contrato produzem seus códigos específicos (`GEN-SKILL`, `GEN-PROVIDER`, `GEN-SCHEMA`); o worker converte em falha recuperável sem transformar schema/repair/factualidade em `GEN-PERSISTENCE`.
- Os prompts do Brief Generator devem transportar `validationRules` como contexto de execução, sem permitir que Skill controle workflow, quota ou persistência.
- Adicionar contract test executável do contexto Blueprint-driven que falhe se qualquer texto literal de hook/CTA atravessar o contexto enviado ao provider. O teste deve manter explicitamente o caminho ADR-029/catalog atual, incluindo `selectBriefPatterns`, como exceção até o cutover aprovado.

**Gate:** contract tests verificam a baseline ADR-029 sem alteração, a especificação/validação aditiva da Skill e Creative System `@1.3` inativo, compatibilidade fail-closed, ausência de ativação prematura, o contract test de exclusão de texto literal no contexto Blueprint-driven com a exceção ADR-029/catalog registrada, batch envelope, separação de contexto, IDs server-derived, rejeição de ownership/status vindos do provider, `tiktok-commerce@1.2` e erros específicos sem conversão indevida para `GEN-PERSISTENCE`.


### Tarefa 4A — Preparar Blueprint de forma aditiva
**Arquivos:** somente os contratos e artefatos explicitamente aprovados na SPEC/PLAN de cutover; não alterar o runtime vigente nesta tarefa.

- Definir o `CreativeBlueprint` e sua matriz de compatibilidade como contrato versionado da `PlatformSkill`.
- Preparar leitura histórica v1 e futura v2 sem fabricar `creativeDirection`; manter `ContentOpportunity` como único contêiner da decisão e preservar `hookMechanism`/`narrativePattern` legados enquanto o cutover não for aprovado.
- Garantir que catálogo literal, memória e sinais de geração tenham escopo e versionamento explícitos, sem inserir exemplos literais no prompt normal.

**Gate:** contract tests e inspeção documental comprovam load/validate/freeze/expose, falha fail-closed, compatibilidade/histórico e ausência de escrita prematura de `creativeDirection`.

### Tarefa 5 — Implementar engine, gates e repair
**Arquivos:** modificar `src/modules/commerce-intelligence/engine.ts`, `strategy.ts`, `content-plan.ts`, `gates.ts`, `memory.ts` e testes unit/contract.

- Baseline atual: não há contract test implementado para o caminho `reuseStrategy`. A implementação futura desta tarefa SHALL adicionar esse teste e cobrir ausência de `STRATEGY_SYNTHESIS`, Strategy preservada/recanonicalizada, novo `jobId` e geração somente dos faltantes.

- Orquestrar a baseline operacional ADR-029 com exatamente quatro chamadas fundacionais (`PRODUCT_UNDERSTANDING`, `COMMERCIAL_OPPORTUNITY_MAPPING`, `STRATEGY_SYNTHESIS`, `CONTENT_PLAN_GENERATION`) e Brief Generator em batches sequenciais de 4–8; emitir stage real antes de cada chamada. Qualquer composição-alvo do ADR-033 fica bloqueada ao A/B aprovado.
- Construir e validar `CommercialOpportunityMappingEnvelope` e cada `CommercialOpportunity`; construir Strategy/Plan/ContentOpportunities usando somente projeções de Product facts, restrições, `Creator Context` aplicável ou vazio explícito, Skill e memória vazia; manter fato separado de inferência.
- Construir o catálogo de evidências depois da projeção factual do worker, dentro da engine, por `buildEvidenceCatalog`, com relação 1:1 entre valores elegíveis e `evidenceRefs` (`fact:<chave>`; do segundo valor em diante, `fact:<chave>:<n>`). O catálogo não pertence a `projectEngineFacts` nem é um campo do payload worker.

- Implementar validação estrutural determinística de PU e Mapping, exigindo `evidenceRefs` pertencentes às projeções autorizadas sem filtragem claim-level de `UNSUPPORTED`/`CONTRADICTED` nessa fronteira. Strategy consome a projeção validada e não promete validação direta de `evidenceRefs`. Preservar o hard gate factual/estrutural de Briefings, fora do LLM, com `BriefValidationReport` objetivo `PASS|REPAIR|REJECT`; nele, Fact Validator, `Hard Gate Repair`, `ContentSceneSet`, cenas, hash e plataforma seguem ADR-029/ADR-021. Depois do hard gate `PASS`, o Judge semântico e `CONTENT_PART_REPAIR` seguem as regras existentes; falha ou schema inválido preserva a parte original e não cria faltante.

- Fazer Brief Generator receber somente a projeção da Strategy, oportunidade, restrições aplicáveis, `Creator Context` e `validationRules`; validar um resultado por oportunidade e atribuir IDs/posições/versões server-side.
- Implementar Variety Gate por dimensões estruturadas e normalização determinística; preservar Briefings `PASS`. Repair semântico não substitui parte `PASS`, e repair inválido preserva o original. Qualquer falha objetiva, schema inválido ou conjunto que não feche consistentemente segue ADR-021; não criar conteúdo artificial nem faltante para atingir a quantidade. Para `N`, a linha de base continua `4 + ceil(N / batchSize)` chamadas; chamadas de `Hard Gate Repair`, Judge e `CONTENT_PART_REPAIR` são registradas separadamente.
- Produzir metadata allowlisted por capability/batch e sinais estruturados somente no objeto de resultado para a finalização; não consultar snapshots históricos.

**Gate:** testes cobrem o payload exato do worker, serialização de `priceAmount`, ausência de `features`/`characteristics`/`commission`/`discount`/`evidenceRefsCatalog`/`creatorConstraints`, `EngineInput.facts` genérico e direto, catálogo derivado posteriormente, referências pertencentes validadas por PU/Mapping, Strategy consumindo projeção validada, first-N no provider e na engine com observabilidade correta, strictness por fronteira, caminho `reuseStrategy` sem `STRATEGY_SYNTHESIS` que preserva/recanonicaliza Strategy com novo `jobId` e gera somente faltantes, mapping comercial validado, provider in-memory, limite de chamadas, batch sequencial, output exact-N, regras qualitativas de Briefing, duplicata exata/normalizada, hash estrutural, quantidade de cenas inválida, concentração estrutural, repair parcial preservando PASS, repair esgotado e memória vazia/sinais somente em sucesso.



### Tarefa 5A — Executar eval A/B e aprovar cutover antes de remover
**Arquivos:** artefatos versionados de protocolo, thresholds, Golden Dataset e relatório; nenhum corte de runtime antes da aprovação da SPEC/PLAN de cutover e do gate A/B.

- Fixar o baseline ADR-029 por versão/commit e o candidato ADR-033 antes da coleta.
- Executar pares com os mesmos fatos/evidências, Creator Context, memória, `platformSkillVersion`, modelo/tier e seed derivado do job.
- Comparar factualidade, diversidade multidimensional, naturalidade/criatividade/templating, repair rate, custo, latência p50/p95 e falhas, no agregado e por categoria.
- Persistir relatório reproduzível com hashes/versões, métricas, veredito e dados suficientes para reprodução.
- Só depois de aprovação explícita do Software Architect, do Review e do usuário quando exigido pelo ADR registrar supersede; uma mudança por vez e pelo menor caminho comprovado.

**Gate:** sem relatório aprovado, ADR-029 permanece integralmente vigente e nenhuma chamada, tier, cena, gate, repair ou capability é removida, integrada ou reclassificada.

### Tarefa 6 — Implementar worker durável, liveness e finalização
**Arquivos:** modificar `src/modules/commerce-intelligence/worker.ts`, `runtime.ts`, `repository.ts`, `worker.test.ts` e `scripts/worker.mts`; criar `health.ts`, `health-route.ts`, `health.test.ts` e `src/app/api/api/health/generation/route.ts`.

- Claimar apenas Job `QUEUED` elegível (`nextAttemptAt <= now`) com update condicional; incrementar tentativa, gravar `leaseOwnerId`/`leaseDeadlineAt` e `attemptDeadlineAt`.
- Usar `ProductImportAttempt` apenas como precedente de lease/status já persistido no Slice 002; não iniciar nem duplicar o fluxo de importação neste slice.
- Executar engine/provider fora de transação longa; atualizar stage antes da etapa em transações curtas; executar heartbeat condicional ao mesmo owner/attempt; abortar a tentativa ao perder fencing, cancelar ou atingir deadline.
- Reclaimar lease expirado com incremento de tentativa, backoff e novo lease; ao atingir limite configurado, marcar `FAILED` com código `GEN-LEASE-EXPIRED` e chamar `reconcileReservation(jobId, reason)` uma única vez. O owner anterior não inicia novo trabalho externo.
- Finalizar com CAS por `jobId`, status `RUNNING`, owner/lease/attempt atuais. Worker obsoleto não grava resultado, não confirma/libera reservation e não altera estado terminal.
- Em sucesso pleno ou parcial, em uma transação curta inserir Strategy, Plan, Opportunities, somente os Contents aprovados, BriefVersions, reports, run e sinais; inserir Content com `currentBriefVersionId = NULL`, criar Brief v1, preencher a FK, confirmar reservation pelos entregues (liberar o restante no parcial) e marcar Job `SUCCEEDED` — única saída com exact-N — ou `SUCCEEDED_PARTIAL` (0<D<N dentro do teto reavaliado após drops de variedade, ADR-021). Falha em qualquer passo faz rollback integral.
- Qualquer falha terminal conhecida de provider, Skill, schema, factualidade, variedade, repair, lease ou persistência passa por `failJobAndReleaseReservation` com seu código específico, capability/stage de origem, mensagem sanitizada e reconciliação da reservation no mês UTC de origem. Repetição não libera duas vezes.
- Cancelar somente `QUEUED`/`RUNNING` com transição condicional; em `CANCELLED`, chamar a mesma reconciliação CAS; não oferecer cancelamento em `RUNNING` quando não houver interrupção segura.
- O entrypoint falha fechado somente quando `DATABASE_URL` ou parâmetros essenciais de lease/deadline/tentativa/backoff forem ausentes, inconsistentes ou inválidos. Provider/Skill ausentes ou inválidos permitem boot, mas o Job reivindicado falha de forma recuperável.
- Expor liveness mínimo: heartbeat/process marker seguro do worker e `GET /api/health/generation` sem Tenant, Product, payload ou secret. Metadata de geração permanece interna e allowlisted.

**Gate:** testes de claim, heartbeat, deadline, lease expirado, fencing, abort de chamada pendente, backoff, retry limitado, cancelamento concorrente, finalização idempotente, FK nullable preenchida atomicamente, rollback integral, replay de memória, reconciliação para cada falha terminal e liveness devem passar sem chamadas de rede reais; testes separados comprovam que provider/Skill ausentes não falham o boot.

### Tarefa 7 — Expor API autorizada

**Arquivos:** criar `src/modules/commerce-intelligence/http.ts`; criar `src/app/api/generations/route.ts`, `[id]/route.ts`, `[id]/retry/route.ts`, `[id]/cancel/route.ts`; criar testes HTTP.

- `POST /api/generations` exige `sameOriginRequest`, sessão, Product ativo sem resultado publicado e `Idempotency-Key` válida; Product `READY` é rejeitado para reanálise. O body só identifica Product; responder `202` com Job mínimo, sem Strategy/provider/prompt.
- `GET /api/generations/current` retorna somente o Job ativo ou o último terminal acionável do Tenant para o indicador; não confiar em `localStorage`.
- `GET /api/generations/:id` retorna status/stage/readiness e resultados somente quando `SUCCEEDED` ou `SUCCEEDED_PARTIAL` (estes últimos com deliveredCount/failedCount e motivo sanitizado por item faltante — ADR-021); Job de outro Tenant responde 404 uniforme.
- `POST /retry` exige Job terminal autorizado e nova chave; `Gerar faltantes` após `SUCCEEDED_PARTIAL` cria novo job com reserva da quantidade faltante (ADR-021); `POST /cancel` exige origem/sessão e transição segura. Todas as mutações são CSRF-protected.
- DELETE Product executa remoção Big Bang tenant-scoped em transação, com rollback integral e resposta uniforme para escopo inexistente, conforme B-003-14/RI-003-18; `Arquivar produto` é operação separada e preservativa. Não expor stack, SQL, provider, modelo, tier, prompt, tokens, segredo, payload bruto ou existência de outro Tenant.
- Mapear todos os códigos da SPEC para HTTP e mensagens `pt-BR`, preservando contexto editável e sem publicar resultados intermediários.

**Gate:** testes HTTP verificam sessão ausente, Origin ausente/divergente, Product cross-tenant/READY, key ausente/inválida, quantity adulterada, Job ativo, retry técnico/explícito, cancelamento, DELETE Big Bang com rollback/404 uniforme, archive preservativo e sanitização de erros.

### Tarefa 8 — Integrar Product detail/list e App Shell
**Arquivos:** preservar e integrar `src/components/products/generation/generation-api.ts`, `generation-ui-model.ts`, `generation-views.tsx`, `use-generation-job.ts` e histórico; modificar `product-detail.tsx`, `product-detail.module.css`, `product-list.tsx`, `product-list.module.css`, `product-api.ts`, `product-shell.tsx`, `product-shell.module.css`; criar ou ajustar a superfície global somente se o runtime atual não a cobrir; atualizar testes UI-model/API.

- Preservar o contrato server-authoritative já existente na UI de geração; remover somente ponteiros `localStorage`, campos/ações incompatíveis comprovados e vocabulário sem call site. Usar `CommerceIntelligenceJob`, `targetContentCount` do Product e API server-authoritative, sem declarar os módulos ativos como dead code.
- Em Product ativo sem resultado publicado e sem Job, mostrar uma única ação `Analisar produto`; iniciar Job e mostrar `QUEUED`. Product `READY` após `SUCCEEDED` oferece uma única ação `Revisar conteúdos`; após `SUCCEEDED_PARTIAL` oferece `Revisar conteúdos` + `Gerar faltantes` (ADR-021); nova geração/recorrência arbitrária pertence ao Slice 008. Product salvo manualmente não dispara geração no POST de cadastro.
- Nas leituras autenticadas de Product, todo `ActiveProductView` inclui `generationAction`: `{ state: "AVAILABLE", reason: null, nextAction: null }`, ou `BLOCKED` com `{ reason: "GEN-ACTIVE", nextAction: "VIEW_ACTIVE_ANALYSIS" }` ou `{ reason: "GEN-CAPACITY", nextAction: "WAIT_FOR_CAPACITY" }`. Não omitir campos nem serializar este objeto como `null`. `ArchivedProductView` não contém `generationAction`; não criar estado/código adicional. Archive/reactivate preservam a resposta mínima `{ id, version }`, seguida de refetch autenticado. A projeção é calculada server-side para a sessão, não contém plano, saldo, limite, reserva ou ID de outro Job/Tenant e só controla o feedback visual; o `POST /api/generations` preserva a revalidação transacional. Não criar endpoint de preflight separado. Ver ADR-016.
- Em `QUEUED`/`RUNNING`, mostrar Product e stage real, polling/backoff sem percentual/ETA e sem Briefing parcial; permitir uso das demais rotas e não redirecionar à força.
- Em `SUCCEEDED`, derivar `READY`, mostrar Strategy/Plan consultáveis e Briefings completos em `DRAFT`, com ação `Revisar conteúdos`; não oferecer edição/aprovação/lote neste slice. Em `SUCCEEDED_PARTIAL`, derivar `READY` com "D de N prontos", motivo sanitizado por item faltante e ação `Gerar faltantes` além de `Revisar conteúdos` (ADR-021); conteúdos reprovados permanecem invisíveis.
- Em `FAILED`/`CANCELLED`, derivar `FAILED`, preservar Product/fatos e Job terminal e oferecer `Tentar novamente` como novo Job.
- Atualizar cards com badges `Pendente`, `Analisando`, `Pronto`, `Falhou` e adicionar somente o filtro `Pendente`. No estado `blocked` (`GEN-ACTIVE` ou capacidade indisponível), manter `Analisar produto` visível porém desabilitada, com explicação textual e próxima ação.
- Compor o indicador global no `ProductShell` abaixo da toolbar em desktop/tablet e abaixo do header contextual no mobile; consultar backend após navegação/reload e não depender de aba iniciadora ou `localStorage`.
- Aplicar `DESIGN.md`: `pt-BR`, labels persistentes, foco-visible, `aria-live`/`aria-busy`, erros textuais associados, alvos mínimos `44×44px`, sem cor única, sem spinner isolado, `prefers-reduced-motion`, layout mobile completo e glass somente em shell, toolbar ou sheet.

**Gate:** testes de normalização/status e smoke em navegador comprovam início somente sem resultado publicado, projeção `AVAILABLE`/`BLOCKED` antes do clique, bloqueio `READY`/recorrência, polling, reload/reentrada, sucesso pleno, sucesso parcial (`SUCCEEDED_PARTIAL` com "D de N", motivo sanitizado e `Gerar faltantes`), falha/retry, estado `blocked`, indicador global, badges, filtro `Pendente`, DELETE Big Bang tenant-scoped com rollback e archive preservativo, além da ausência de conteúdo reprovado. Uma corrida após `AVAILABLE` ainda deve receber o erro sanitizado do `POST` e recarregar a projeção.

### Tarefa 9 — Integrar testes, scripts e validação operacional

**Arquivos:** atualizar fixtures/testes existentes que assumem `/api/generations` antigo; criar testes de integração PostgreSQL somente onde necessário. O script de `package.json` já inclui os testes de generation e não deve ser alterado por esta tarefa.

- Preservar o script `test` atual, que já inclui os testes de generation, commerce-intelligence, Entitlement, Product lifecycle, HTTP, observability, runtime, worker, worker-fence, Product readiness e UI-model; adicionar somente os cenários/fixtures ainda ausentes e manter testes de banco identificáveis e executáveis com `DATABASE_URL`.
- Criar cenário de smoke autenticado com `count=1` e `count=10`: Product confirmado → `Analisar produto` → `QUEUED` → worker → stages reais → quatro chamadas fundacionais → batches 4–8 → gates → `SUCCEEDED` → Strategy/Plan/Contents/BriefVersions; repetir via reload. Exercitar também rejeição ativa para `N=11`, `N=16` e `N=30`, mantendo fixtures/migrações legadas `1–30` apenas como compatibilidade documental, sem ampliar quota. Exercitar o caminho parcial: job que fecha `SUCCEEDED_PARTIAL` com D de N publicados, motivo sanitizado por item e ação `Gerar faltantes` criando novo job com reserva F (ADR-021).

- Confirmar que salvar manualmente não cria Job/reservation, que editar Product fora do fluxo não altera resultados publicados silenciosamente, que Product `READY` não inicia reanálise e que DELETE executa Big Bang tenant-scoped com rollback, resposta sanitizada e sem confundir a operação com archive.
- Registrar metadata operacional allowlisted por capability/batch (task, tier, provider/modelo lógico, versão/hash, duração, bytes, retries, validações, repairs e códigos); redigir textos, URL, prompts, output, cookies e tokens.
- Executar regressão no Golden Dataset aprovado, medindo factualidade, variedade, naturalidade, custo, latência, taxa de schema inválido e repair; sem fixture/artefato aprovado, manter o gate `BLOCKED` e não declarar a implementação plenamente validada ou pronta para produção.

**Gate:** o script atual de `package.json` inclui os testes de generation, commerce-intelligence, Entitlement, Product lifecycle, HTTP, observability, runtime, worker, worker-fence, Product readiness e UI-model; `npm run test` passa no ambiente disponível, testes de banco são explicitamente reportados quando pulados por indisponibilidade e nenhum teste de Slice 004+ ou 008 é adicionado.

---

## 6. Segurança, autorização e tratamento de erros

- Toda página autenticada usa `requireSession`; toda API resolve cookie por `resolveSession`; toda consulta/mutação recebe `tenantId` e, quando aplicável, `userId` resolvidos server-side.
- IDs vindos do cliente são apenas referências para lookup scoped; `tenantId`, `userId`, plano, mês, capacidade, provider, tier, Strategy, Skill e ownership são sempre derivados pelo servidor.
- `POST`, retry, cancel, archive e DELETE exigem `sameOriginRequest`; a presença do cookie não prova intenção. Rejeitar Origin ausente/divergente e não persistir antes da verificação.
- Product novo, reservation mensal e Job são uma decisão transacional única; Product já ativo e retry não reservam `active_products` novamente. Reservation mensal é única por Job, pertence ao mês UTC de criação e toda saída terminal reconcilia por CAS idempotente: `SUCCEEDED` confirma N; `SUCCEEDED_PARTIAL` confirma D e libera N−D no mês de origem (ADR-021); `FAILED`/`CANCELLED` liberam integralmente.
- Job ativo é protegido pelo índice parcial e por tratamento de conflito; botão desabilitado é somente feedback visual.
- FKs/uniques compostos e, quando necessário, lookup/persistência transacional com Tenant/Product impedem mistura cross-tenant/cross-product; falhas de autorização respondem 404 uniforme.
- Provider recebe somente a projeção allowlisted de fatos/contexto necessária à capability, `Creator Context` aplicável e Skill necessária; conteúdo externo/seller permanece em envelope de dados não confiável separado das instruções. Nenhuma saída textual altera autorização, quota, status ou persistência.
- Não persistir prompts completos, payload bruto, secrets, cookies, tokens ou identificadores de outro Tenant. Persistir somente metadata operacional allowlisted por capability/batch; erro público usa mensagens sanitizadas e diagnóstico interno não chega à UI.
- Chamadas externas acontecem fora de transações longas e recebem `AbortSignal`/deadline da tentativa. Timeout/lease não gera novo Job automaticamente; reclaim reutiliza Job, chave e reservation, registra repetição externa e usa fencing para impedir publicação obsoleta. `Tentar novamente` cria nova chave/reservation apenas após estado terminal.
- Toda falha terminal conhecida de provider, Skill, schema, factualidade, variedade, repair, lease ou persistência executa `failJobAndReleaseReservation` com código específico, capability/stage, CAS no Job e reservation, no mês UTC de origem; repetição e worker obsoleto não produzem efeito adicional.
- DELETE físico executa somente no Tenant autorizado, dentro de transação Big Bang com rollback integral e FKs/uniques respeitados; `Arquivar produto` preserva dados e decrementa `activeProductsUsed` uma vez, como lifecycle distinto.
- O worker falha fechado somente por dependências essenciais de boot (`DATABASE_URL` e parâmetros essenciais de lease/deadline/tentativa/backoff) ausentes, inconsistentes ou inválidos; provider/Skill ausentes falham o Job de forma recuperável e liberam a reserva.

---

## 7. Matriz de testes comportamentais

| Contrato | Teste mínimo | Falha que deve detectar |
|---|---|---|
| Confirmação atômica | Product novo: ativação + `active_products` + reservation + Job; Product já `ACTIVE`: reconciliação do contador + reservation + Job, sem nova unidade de Product ativo | Product/job/reserva parcial, quota de `active_products` reaplicada ou contador divergente |
| Quantidade | required, inteiro, `1–10`, estabilidade durante o Job, rejeição de `N=11/16/30` no contrato ativo e fixture legada `1–30` isolada | Cliente altera quantidade, contrato ativo aceita legacy ou exact-N quebrado |
| Composição | `count=1`, `count=10`, quatro chamadas fundacionais, batches 4–8, limite de concorrência e repair separado | chamadas acima da baseline, `Promise.all` sem limite ou custo não mensurável |
| Entitlements | capacidade, backfill/contagem de `active_products`, activate/archive/reactivate concorrentes, mês UTC, confirmação/liberação uma vez | overage, contador divergente, reserva duplicada ou mês errado |
| Fila | claim condicional, lease, heartbeat, deadline, reclaim, backoff, max attempts e health | worker preso, trabalho órfão, retry infinito ou liveness falso |
| Idempotência | reconnect/reentry/reclaim e retry explícito separado, incluindo fencing após repetição externa | nova run no retry técnico, terminal sobrescrito ou publicação duplicada |
| Contexto | projeções allowlisted por capability, limites de tamanho e envelopes confiável/externo | payload crescente, contexto indevido ou prompt injection |
| Stages | callback/transação antes de cada etapa efetiva e nenhum stage falso para subetapa agrupada | UI atrasada ou stage inconsistente |
| Contratos | cada capability input/output, mapping comercial, batch, `structure`, cenas/hash, `briefId` mapeado e ownership server-derived | JSON estruturalmente válido mas semanticamente inválido |
| Briefing qualitativo | Skill/prompt/resultado com decisão estratégica separada, cenas simples, linguagem oral e leitura não literal | Briefing que mistura orientação e fala ou exige leitura literal |
| Factualidade | supported/inferred/unsupported/contradicted contra evidências estruturadas | claim inventado/contradito persistido |
| Variedade | duplicata normalizada, hash estrutural, quantidade de cenas e concentração; repair preserva PASS | conteúdo repetido ou quantidade preenchida artificialmente |
| Persistência | Strategy única, Plan único, exact-N em `SUCCEEDED` e somente aprovados em `SUCCEEDED_PARTIAL` (ADR-021), Content.currentBriefVersionId nullable→preenchido, Brief v1 imutável, report por `briefId` | sucesso parcial **silencioso** (sem declaração/validação), FK circular, Brief duplicado ou approved preenchido |
| Observabilidade | metadata allowlisted por capability/batch: task, tier, provider/modelo lógico, versão/hash, duração, bytes, retries, validações, repairs e erros | impossível medir custo/latência ou diferenciar provider, schema, repair e persistência |
| Memória | snapshot inicial vazio, unique `(tenantId,sourceJobId)`, replay concorrente e sinais somente dos Contents entregues em sucesso pleno ou parcial (ADR-021) | histórico consultado ou snapshots duplicados |
| Preservação Product | DELETE Big Bang tenant-scoped com rollback integral; archive decrementa contador uma vez sem tocar histórico | perda de histórico, resíduo cross-tenant, rollback parcial ou contador negativo |
| Falhas terminais | provider HTTP 200 atrasado, timeout, Skill/schema/factualidade/variedade/repair/persistência/cancelamento, com códigos específicos | Job sem `FAILED`/`CANCELLED`, erro mal classificado, reservation não liberada ou liberação duplicada |
| Autorização | Product/Job/resultado/reservation cross-tenant | vazamento por ID ou Tenant enviado pelo cliente |
| API/CSRF | sessão, origem, payload adulterado, erro sanitizado e `generationAction` sem dados de quota | mutação sem intenção, stack/secret exposto ou vazamento de plano/uso |
| UI/reentrada | `idle`, `queued`, `running`, `succeeded`, `failed`, `cancelled`, `blocked` derivado da projeção, navegação, reload, mobile e teclado | estado dependente de aba/localStorage, capacidade inferida no cliente ou ação inacessível |

Contract tests usam provider in-memory apenas como adaptador de teste. Testes de qualidade estratégica com provider real exigem Golden Dataset aprovado; sem artefato/hash/limiares aprovados, o gate permanece `BLOCKED`, sem declarar aceitação plena da Engine.

---

## 8. Validações finais

Executar, após todas as tarefas e somente no estado final:

1. `npx prisma validate`.
2. `npm run typecheck`.
3. `npm run lint`.
4. `npm run test`.
5. Testes de integração PostgreSQL/migration com `DATABASE_URL` configurado, incluindo concorrência, índice de Job ativo, reservation UTC, FKs/uniques compostos tenant/product, `currentBriefVersionId` nullable + preenchimento atômico, unique de memória, rollback integral, DELETE Big Bang tenant-scoped, archive/decremento do contador, worker obsoleto e health/liveness.
6. `npm run build`.
7. Smoke autenticado com `count=1` e `count=10`: Product confirmado → projeção `AVAILABLE` → `Analisar produto` → `QUEUED` → worker → stages reais → quatro chamadas fundacionais → batches 4–8 → gates → `SUCCEEDED`, Strategy/Plan/Contents/BriefVersions; repetir via reload. Exercitar `N=16` somente como rejeição do contrato ativo ou fixture legada isolada, nunca como sucesso. Exercitar também `GEN-ACTIVE` e `GEN-CAPACITY`: a projeção deve desabilitar a ação antes do clique e o `POST` deve continuar revalidando em corrida.

8. Exercitar provider HTTP 200 com corpo atrasado, timeout, perda de lease, heartbeat, reclaim, fencing e retry técnico; verificar que não há publicação/uso duplicado e que a chamada antiga é abortada quando suportado.
9. Verificar falhas de schema, factualidade, variedade, repair e persistência; confirmar códigos internos específicos, mensagem pública sanitizada, rollback integral e liberação CAS única.
10. Verificar projeções de contexto, separação entre instruções/fatos/dados externos e ausência de IDs persistentes/ownership/status/quota vindos do provider.
11. Verificar mobile/tablet/desktop e teclado: indicador não cobre header/drawer, badges e filtro `Pendente`, estado `blocked`, foco/labels/aria presentes, alvo mínimo `44×44px`, erro não depende de cor, glass restrito a shell/toolbar/sheet e `prefers-reduced-motion` remove deslocamento.
12. Verificar por leitura de logs/respostas que não há prompt, token, cookie, payload bruto ou dado cross-tenant exposto; metadata operacional permanece allowlisted.
13. Executar regressão no Golden Dataset aprovado, comparando factualidade, variedade, naturalidade, custo, latência, taxa de schema inválido e repair com a versão anterior de Engine/Skill/Model Router; registrar dataset/hash, versão default `tiktok-commerce@1.2`, Creative System aditivo `@1.3` inativo, limiares e resultado. Sem fixture/artefato aprovado no repositório, declarar o gate `BLOCKED`.
14. Confirmar que `/products/new` continua salvando Product sem criar Job e que nenhum código deste slice adiciona revisão, aprovação, lotes, Agenda, Estúdio, memória histórica, recorrência ou reanálise de Product `READY`.

O resultado de cada validação deve ser registrado no handoff da implementação; qualquer validação não executada deve ser declarada explicitamente.

---

## 9. Traceability da SPEC

- `S003-01` a `S003-05`: Tarefas 2–3 e 6.
- `S003-06` a `S003-12`: Tarefas 1, 5 e 6.
- `S003-13` e `S003-14`: Tarefa 4.
- `S003-15` a `S003-17`: Tarefas 1, 3, 5–7.
- `S003-18` a `S003-20`: Tarefas 3, 7–8.
- `S003-19` e AC 43–45: Tarefas 4, 7–8 e seção 6.
- `S003-21`: Tarefas 2–3.
- `S003-22`: Tarefas 3, 7–8 e validação de reentrada; Product `READY` não oferece reanálise e nova geração fica no Slice 008.
- `S003-23`: Tarefas 3, 7–9 e seção 6; DELETE é Big Bang tenant-scoped, transacional e com rollback, enquanto archive preserva dados e libera o contador de ativos.
- `S003-24`: Tarefa 8 e matriz de testes; badges de readiness e filtro `Pendente`.
- `S003-25`: Tarefas 3 e 7; origem, fingerprint e ciclo de vida da `Idempotency-Key`.
- `S003-26`: Tarefas 1, 4–6; `structure`, cenas válidas, hash estrutural e regras qualitativas do Briefing.
- `S003-27`: Tarefas 1, 2 e 6; `briefId` deriva de `contentId + briefVersionId`.
- `S003-28`: Tarefas 4–5 e matriz de composição; quatro chamadas fundacionais, batches 4–8 e limite de concorrência.
- `S003-29`: Tarefas 4–5 e seção 6; projeções allowlisted e separação de contexto.
- `S003-30`: Tarefas 1, 5–6 e 8; stages antes do trabalho efetivo.
- `S003-31`: Tarefas 4–6 e matriz de observabilidade; IDs server-derived e metadata por capability/batch.

Todos os 31 requisitos rastreáveis e os 53 critérios de aceite da SPEC têm uma tarefa, teste ou validação final correspondente. Nenhum requisito de Slice 004+ ou 008 é usado como dependência de implementação.

**Status:** ETAPA_2_APPROVED — documentação canônica da Etapa 2 aprovada; a seção visual mantém seus requisitos históricos, e implementação/runtime/cutover continuam bloqueados pelos gates ADR-029/033.

## 10. Plano visual integral — Products e Product detail

> Esta seção é exclusiva da implementação frontend/UI. Não alterar PRD, DESIGN, SPEC de domínio, backend, provider, worker, Golden Dataset ou ADR-017.

### Objetivo

Recriar Products e Product detail conforme a referência visual aprovada, preservando a identidade do `DESIGN.md` v1.6 e tornando a interface uma superfície operacional clara: identificar o Produto, entender o estado, executar a próxima ação e revisar Strategy/Contents/History.

### Arquivos e responsabilidades

**Modificar**

- `src/components/products/product-list.tsx`: composição de Products, toolbar, estados e Product cards.
- `src/components/products/product-list.module.css`: grid/lista, metadata e responsividade.
- `src/components/products/product-detail.tsx`: composição do detail, header rico, navegação interna e conteúdo das quatro regiões.
- `src/components/products/product-detail.module.css`: header, tabs, composição editorial, tabela/lista e breakpoints.
- `src/components/products/product-shell.tsx`: shell visual, drawer/rail/sidebar e montagem do toast sem faixa global.
- `src/components/products/product-shell.module.css`: shell e posicionamento responsivo.
- `src/components/products/product-shell-nav.tsx`: cinco destinos e estados futuros acessíveis.
- `src/components/products/generation-panel.tsx`: apresentação dos estados de geração como toast acionável, sem faixa no header.
- `src/components/products/generation-ui-model.ts`: normalização dos estados para a apresentação do toast e ações permitidas.
- `src/components/products/generation-api.ts`: somente se necessário para preservar o contrato server-authoritative existente; não alterar endpoints.
- `src/components/ui/section-switcher.tsx`: tabs com alvo, teclado e semântica aprovados.
- estilos dos componentes acima: somente tokens existentes e regras desta seção.

**Criar somente se a implementação existente não comportar a separação**

- `src/components/products/product-header.tsx`: header visual do Product.
- `src/components/products/product-card.tsx`: card reutilizável de Product.
- `src/components/products/briefing-list.tsx`: tabela/lista desktop e cards mobile.
- `src/components/products/generation-toast.tsx`: toast de atividade global acessível.

Não criar novas entidades, endpoints, modelos ou dependências.

### Tarefa 1 — Fixar contrato visual e fixtures de estados

- [ ] Mapear as propriedades já entregues por Product, readiness, generationAction, Strategy, Plan, Content e History.
- [ ] Definir view models locais apenas para apresentação, sem receber `tenantId`, quota, provider, tier ou estado autoritativo do cliente.
- [ ] Cobrir fixtures de `PENDING`, `QUEUED`, `RUNNING`, `READY`, `FAILED`, `CANCELLED`, `BLOCKED`, loading, empty e reentry.
- [ ] Garantir que Product `READY` exponha `Revisar conteúdos` — e, após `SUCCEEDED_PARTIAL`, também `Gerar faltantes` (ADR-021) — e nenhuma ação de Slice 004+.
- [ ] Garantir que ações futuras de Slice 004+ não sejam renderizadas.

### Tarefa 2 — Recriar shell e navegação

- [ ] Implementar sidebar fixa de `240px` em desktop.
- [ ] Implementar rail de `72px` em tablet.
- [ ] Implementar header de `56px` + drawer em mobile.
- [ ] Manter somente Home, Produtos, Estúdio, Agenda e Configurações.
- [ ] Para Estúdio/Agenda sem rota funcional, renderizar item não acionável com `aria-disabled`, explicação acessível e sem href falso.
- [ ] Garantir foco no drawer, fechamento por scrim/Escape e retorno ao gatilho.
- [ ] Eliminar qualquer faixa `GlobalActivityIndicator` persistente abaixo do header/toolbar.

### Tarefa 3 — Implementar toast global de geração

- [ ] Reusar a consulta server-authoritative atual e manter polling/reentrada sem localStorage.
- [ ] Renderizar toast flutuante discreto na região principal, sem deslocar header ou conteúdo.
- [ ] Manter o toast enquanto o job estiver acionável; dismiss oculta apenas a apresentação local.
- [ ] Reapresentar o toast quando reentrada ou mudança de rota encontrar estado acionável no backend.
- [ ] Mostrar somente Product, stage humano e sucesso/falha com as ações qualificadas por estado: `SUCCEEDED` pleno → uma única ação (`Revisar conteúdos`); `SUCCEEDED_PARTIAL` → duas ações (`Revisar conteúdos` + `Gerar faltantes`, ADR-021); `FAILED`/`CANCELLED` → `Tentar novamente`. Nenhuma ação de slice futuro.
- [ ] Usar `role="status"`/`aria-live="polite"` para atividade e `role="alert"` para falha acionável.
- [ ] Fornecer `Dispensar` com target mínimo de `44×44px`, foco-visible e sem cancelamento implícito.
- [ ] Não mostrar percentual, ETA, provider, modelo, tier, prompt, log ou token.
- [ ] Respeitar `prefers-reduced-motion` sem deslocamento.

### Tarefa 4 — Recriar Products

- [ ] Construir header de área com título, descrição, busca e `Adicionar produto`.
- [ ] Construir toolbar/filtros `Todos`, `Ativos`, `Pendentes`, `Arquivados`.
- [ ] Construir Product card com imagem/alt, nome, marketplace, categoria, preço/moeda, data factual, readiness e próxima ação.
- [ ] Melhorar badge de readiness usando texto explícito, estrutura/ícone e tokens semânticos; não depender de cor.
- [ ] Diferenciar visualmente `Pendente`, `Analisando`, `Pronto` e `Falhou` sem criar urgência falsa ou métrica decorativa.
- [ ] Implementar loading estrutural, empty geral, filtro vazio e erro acionável sem mensagens duplicadas.
- [ ] Aproveitar largura desktop; usar duas colunas no tablet quando couber; uma coluna no mobile.

### Tarefa 5 — Recriar header e Visão geral do Product

- [ ] Adicionar breadcrumb e header de objeto real.
- [ ] Exibir imagem, nome, status, marketplace, categoria, preço/moeda e data somente quando fornecidos.
- [ ] Exibir ação principal derivada do estado e `Arquivar produto` como ação secundária.
- [ ] Evitar que formulário de edição domine a primeira viewport.
- [ ] Manter fatos editáveis e mensagens de erro associadas sem alterar o contrato de persistência.
- [ ] Eliminar vazio estrutural causado por coluna fixa estreita no desktop.

### Tarefa 6 — Recriar Strategy, Contents e History

- [ ] Strategy: composição editorial para posicionamento, audiências, dores, desejos, benefícios, objeções, argumentos, ângulos e riscos.
- [ ] Contents desktop: lista/tabela operacional com posição, hook, ângulo, status e abertura.
- [ ] Contents mobile: cards verticais com disclosure.
- [ ] Briefing expandido: Hook, Ângulo, objetivo quando disponível, Roteiro, Cenas e CTA.
- [ ] Renderizar exatamente os Contents retornados após `SUCCEEDED` ou `SUCCEEDED_PARTIAL` (somente aprovados); não simular conteúdo.
- [ ] History: tentativas, readiness, status, timestamp, resultado e retry baseados em dados reais.
- [ ] Não adicionar editar, regenerar, aprovar, descartar, lote, Agenda, Estúdio ou memória futura.

### Tarefa 7 — Estados, responsividade e acessibilidade

- [ ] Validar `375×812`, `390×844`, `768×900`, `1200×900` e `1440×900`.
- [ ] Medir zero overflow horizontal acidental em Products e Product detail.
- [ ] Medir target mínimo de `44×44px` para tabs, botões, dismiss, drawer e ações.
- [ ] Testar teclado: Tab, ArrowLeft/Right, Home, End, Enter, Space e Escape.
- [ ] Testar foco-visible, retorno de foco do drawer e foco sem captura indevida pelo toast.
- [ ] Testar `aria-selected`, `aria-controls`, labels, live regions, erros associados e `aria-disabled` dos itens futuros.
- [ ] Testar reduced-motion em abertura/fechamento de drawer, tabs, disclosure e toast.
- [ ] Confirmar que toast não cobre CTA, conteúdo ou controles essenciais.

### Tarefa 8 — Validação visual comparativa

- [ ] Capturar Products e Product detail nos cinco breakpoints.
- [ ] Comparar hierarquia do shell, header rico, metadata, cards, tabs, Strategy, Contents, Briefings e History com a imagem aprovada.
- [ ] Confirmar que a fidelidade estrutural foi preservada sem violar tokens, contraste, mobile completo ou restrições de escopo.
- [ ] Confirmar ausência da faixa persistente do GlobalActivityIndicator.
- [ ] Confirmar toast discreto, persistente até dismiss opcional e reexibido na reentrada.
- [ ] Registrar divergências intencionais como adaptação ao `DESIGN.md`, não como falhas visuais.

### Tarefa 9 — Gate de aceite frontend

- [ ] Products e Product detail apresentam hierarquia operacional, não formulário genérico.
- [ ] Header do Product contém metadata factual disponível e próxima ação clara.
- [ ] Cards mostram imagem, preço, marketplace, categoria, readiness, data real quando disponível e ação.
- [ ] Strategy, Contents e History possuem composições distintas.
- [ ] Briefings renderizam Hook, Ângulo, Roteiro, Cenas e CTA.
- [ ] Toast substitui integralmente a faixa global sem perder estado, ação, reentrada ou acessibilidade.
- [ ] Badges de análise usam tokens semânticos e texto; cor não é o único indicador.
- [ ] Loading, empty, queued, running, succeeded, failed, cancelled e blocked não duplicam mensagens.
- [ ] Mobile mantém experiência completa; tablet usa rail; desktop usa sidebar.
- [ ] Cinco breakpoints passam sem overflow.
- [ ] Teclado, foco, Escape, ARIA e reduced-motion passam na interface renderizada.
- [ ] Nenhuma funcionalidade fora do Slice 003 foi adicionada.

### Rastreabilidade do plano visual

| Requisito | Fonte | Tarefas | Evidência |
| --- | --- | --- | --- |
| UI-003-01 Shell responsivo | DESIGN §§2–3, 8 | 2, 7 | screenshots + DOM nos cinco breakpoints |
| UI-003-02 Toast não bloqueante | atualização aprovada do usuário; SPEC §12.3 | 1, 3, 7, 8 | queued/running/succeeded/failed + dismiss + reentry |
| UI-003-03 Cards e badges semânticos | DESIGN §§4, 8, 10; SPEC §12.4 | 1, 4, 7 | Product cards + contraste + estados |
| UI-003-04 Header rico do Product | imagem aprovada; SPEC §12.5 | 5, 8 | comparação visual e dados reais |
| UI-003-05 Strategy editorial | DESIGN §§8–9; SPEC §12.5 | 6, 8 | Strategy desktop/mobile |
| UI-003-06 Briefings compostos | SPEC B-003-08; DESIGN §8 | 6, 8 | Contents exact-N e disclosure |
| UI-003-07 Estados e reentrada | SPEC B-003-12/13; DESIGN §8 | 1, 3, 7 | backend state + screenshots |
| UI-003-08 Acessibilidade | DESIGN §10; SPEC §12.7 | 2, 3, 7, 9 | teclado, ARIA, foco, Escape, reduced-motion |
| UI-003-09 Limites de slice | SLICES Slice 003; SPEC §12.9 | 1, 6, 9 | inspeção de ações e diff |

### Impacto do override do toast

O estado global de geração, polling, reentrada e contrato server-authoritative permanecem inalterados. Apenas a superfície de apresentação deixa de ser uma faixa persistente e passa a ser um toast dismissível. O teste adicional obrigatório é garantir que dismiss não cancele nem apague o estado e que uma reentrada reapresente informação acionável.

### Validações finais do plano visual

Executar somente no frontend final:

1. `npm run typecheck`.
2. `npm run lint`.
3. `npm run test`.
4. `npm run build`.
5. Smoke visual autenticado em Products e Product detail nos cinco breakpoints.
6. Matriz de estados com toast, dismiss, reentrada e recuperação.
7. Matriz de teclado/ARIA/foco/Escape/reduced-motion.

Não executar nem modificar backend/provider/worker/Golden Dataset/ADR-017 neste plano. Qualquer validação não executada deve ser declarada no handoff.

**Status da seção visual:** requisitos históricos preservados; a Etapa 2 documental está aprovada, mas nenhum requisito visual libera implementação, runtime ou cutover.
