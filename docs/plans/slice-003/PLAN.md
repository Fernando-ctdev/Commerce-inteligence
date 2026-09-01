# Slice 003 — Primeira geração: CommerceIntelligenceJob até Briefings

> **Para agentes de implementação:** execute este plano tarefa a tarefa, preservando os limites do Slice 003. Cada etapa termina com seu teste/gate local antes da próxima.

**Goal:** Depois da confirmação de um Product com `targetContentCount` resolvida, criar uma única execução assíncrona durável e entregar `ProductStrategy`, `ContentPlan` e exatamente a quantidade solicitada de `Content` com `ContentBriefVersion` v1 em `DRAFT`, sem sucesso parcial.

**Architecture:** O monólito Next.js mantém o domínio em módulos TypeScript: um caso de uso de Commerce Intelligence resolve autorização, quantidade, Entitlement e `CommerceIntelligenceJob`; um worker PostgreSQL executa a pipeline fora de transações longas; a engine usa contratos canônicos, Platform Skill versionada e Model Router; a finalização publica todo o conjunto em uma transação curta. O App Shell consulta o backend e mostra o estado real, sem usar estado local como fonte de verdade.

**Tech Stack:** Next.js 16 App Router/Route Handlers, React 19, TypeScript strict, PostgreSQL, Prisma 6, `tsx --test`, `fetch` nativo para o adapter do provider, CSS Modules e componentes shadcn/ui já presentes.

---

## 1. Limites deste plano

### Incluído

- Confirmação de Product no fluxo de entrada, ou caso de uso equivalente para Product já confirmado, resolvendo `targetContentCount` server-side antes do Job.
- Job PostgreSQL durável, worker com lease/timeout, reclaim, backoff, limite de tentativas e estados `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED` e `CANCELLED`.
- Pipeline inicial completa: entendimento do Product, oportunidades comerciais, Strategy v1, ContentPlan, ContentOpportunity, Brief Generator, Fact/Quality/Variety Gates, repair limitado e persistência final.
- Entitlement mensal de conteúdos, reserva transacional com mês UTC de origem e reconciliação idempotente.
- Strategy, Plan, Opportunities, Contents, BriefVersions, `BriefValidationReport`, `IntelligenceRun` e sinais estruturados de memória.
- Model Router por tarefa lógica, um adapter de provider configurável e `TikTok Commerce Creative Skill` versionada.
- Indicador global no App Shell, readiness do Product, reentrada pelo backend, retry explícito e cancelamento seguro somente se suportado pelo worker.
- Preservação archive-only de Product, rejeitando DELETE físico pelos códigos definidos na SPEC.
- Testes comportamentais, contract tests de capabilities, testes de concorrência/lease/quota e smoke autenticado.

### Não incluído

Não iniciar geração no simples `Salvar produto` de `/products/new`; não criar novo wizard ou tela permanente de análise; não implementar revisão, edição, regeneração, aprovação, descarte, RecordingBatch, Agenda, Estúdio, memória histórica consultada ou recorrência; não adicionar fila visual, Redis/Kafka, microserviço, embeddings, banco vetorial, LLM-as-judge, mídia, publicação, analytics, TikTok OAuth/API, escolha de provider/tier na UI ou alteração de PRD/ADR/SYSTEM-DESIGN/DESIGN/SLICES.

A confirmação deve ser conectada ao fluxo de confirmação existente quando ele for disponibilizado. No estado real atual há apenas o modelo `ProductImportAttempt` no Prisma, sem fluxo server-side de importação/Candidate conectado à UI; portanto, o ponto de entrada testável deste slice é um caso de uso que recebe `tenantId` resolvido, `productId` de um Product ativo sem resultado publicado e a quantidade persistida no Product. Product `READY` oferece somente `Revisar conteúdos`; nova geração/recorrência do mesmo Product pertence ao Slice 008. O formulário manual continua apenas salvando Product; a ação contextual `Analisar produto` no detalhe representa a confirmação equivalente sem transformar o salvamento em geração automática.

A política archive-only/DELETE não é uma decisão nova deste plano: está ancorada na SPEC aprovada, B-003-14, RI-003-18 e AC 47–49. Este slice rejeita todo DELETE físico e mantém `Arquivar produto` como operação preservativa.

---

## 2. Estado real do repositório e áreas afetadas

| Área | Estado observado | Mudança prevista neste slice |
|---|---|---|
| Prisma | `Product`, `ProductImportAttempt`, `TenantEntitlement` e `TenantPreference` existem; não há job, uso mensal, Strategy, Plan, Content ou run. | Adicionar os modelos relacionais do slice e uma migration aditiva, com índices/checks/FKs compostos de Tenant/Product e índice parcial para um Job ativo por usuário; não alterar o fluxo de importação existente. |
| Identity/Tenant | `resolveSession`, `requireSession`, `SESSION_COOKIE`, `sameOriginRequest` e `readJsonBody` existem. | Reutilizar sem aceitar `tenantId`/`userId` do cliente; apenas mutações passam por proteção de origem/CSRF existente. |
| Product | `src/modules/products/service.ts` valida e persiste fatos, restrições e `targetContentCount`; `src/modules/products/http.ts` lista, edita, arquiva e hoje ainda possui DELETE físico. | Expor snapshot confirmado e readiness derivada; preservar `POST /api/products` sem iniciar Job; incluir readiness na leitura/lista; converter DELETE para os erros archive-only da SPEC e manter contador de ativos consistente. |
| Product UI | `ProductDetail` edita/arquiva e não renderiza geração; `product-list.tsx` filtra apenas Todos/Ativos/Arquivados. | Inserir ação/painel de primeira geração somente no Product ativo sem resultado publicado; mostrar badges de readiness e adicionar somente o filtro `Pendente`. |
| App Shell | `ProductShell` é usado por Home, Produtos e Configurações; toolbar/header mobile já existem, sem indicador global. | Compor `GlobalActivityIndicator` abaixo da toolbar desktop/tablet e abaixo do header mobile; o indicador consulta o servidor e não bloqueia navegação. |
| Product import | `ProductImportAttempt` possui status/lease no schema, mas não há processador ou UI server-side conectada no estado atual. | Usar esse modelo apenas como precedente de lease/status; não iniciar nem duplicar importação neste slice. |
| Geração | Há apenas `generation-api.ts`, `generation-panel.tsx`, `generation-ui-model.ts` e testes client-side antigos; nenhum call site importa o painel. O painel usa `localStorage`, quantidade `1–50`, objetivo e vocabulário `Generation`. O server-side de Product já limita `targetContentCount` a `1–30`. | Substituir o contrato antigo por `CommerceIntelligenceJob`, quantidade do Product, API server-authoritative e estados/stages da SPEC; remover ponteiro local, dead code incompatível e gating por `ProductContext`. |
| Engine/Router/Skill | Não existem módulos de Commerce Intelligence, provider, Skill ou gates. | Criar somente as portas e implementações necessárias para a primeira pipeline; provider/Skill ausentes fazem o Job falhar de forma recuperável, enquanto apenas dependências essenciais do worker causam falha fechada no boot. |
| Entitlements | `TenantEntitlement.activeProductsLimit/activeProductsUsed` existe, mas o código atual não reconcilia `active_products` de forma transacional e não há capacidade mensal. | Implementar backfill/contagem server-side, ativação, arquivamento e reativação atômicos, além de reserva/confirmar/liberar de `generated_contents_month`, sem aceitar limites do cliente. |
| Worker/observabilidade | `scripts/` está vazio; não existe runtime, health route ou métrica de geração. | Criar entrypoint mínimo, runtime de claim/lease, liveness/heartbeat mínimo e logs sanitizados; não criar sistema genérico de filas ou observabilidade futura. |
| Testes | O projeto usa `tsx --test`; `package.json` não inclui os testes antigos de generation no script principal. | Criar testes determinísticos por contrato e atualizar o script `test` para cobrir os caminhos novos, mantendo testes que exigem PostgreSQL separados/skip controlado quando o banco não estiver disponível. |

---

## 3. Contratos e decisões de implementação

### 3.1 Entrada server-side

O caso de uso `startCommerceIntelligence` recebe apenas `tenantId`, `userId`, `productId` e uma chave idempotente da tentativa. Ele consulta o Product no Tenant, exige `lifecycle = ACTIVE`, fatos confirmados, `targetContentCount` inteiro entre `1` e `30` e ausência de resultado publicado (`PENDING` ou recuperação após falha); Product `READY` não é elegível. Não aceita quantidade, plano, período, quota, provider, tier, Strategy ativa, Skill ou snapshot vindos do body. O retry explícito recebe apenas o Job terminal autorizado e uma nova chave.

A confirmação inicial resolve `targetContentCount` antes de criar o Job. O valor usado no Job é o mesmo valor persistido no Product pelo Slice 002 e permanece imutável durante a execução. O caso de uso de confirmação chama essa operação dentro da mesma transação que ativa o Product; o caminho manual isolado permanece sem efeito colateral. A liberação da trava global após `SUCCEEDED` não autoriza reanalisar o mesmo Product; recorrência fica no Slice 008.

### 3.2 Estados e stages

Estados persistidos: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`. Stages públicos, nesta ordem, com mensagens fixas em `pt-BR`:

- `UNDERSTANDING_PRODUCT` → `Entendendo o produto...`
- `IDENTIFYING_AUDIENCES` → `Identificando públicos relevantes...`
- `ANALYZING_PAINS_AND_DESIRES` → `Entendendo dores e desejos...`
- `ANALYZING_OBJECTIONS` → `Mapeando objeções...`
- `BUILDING_STRATEGY` → `Definindo a melhor estratégia para este produto...`
- `BUILDING_CONTENT_PLAN` → `Organizando as oportunidades de conteúdo...`
- `GENERATING_BRIEFS` → `Preparando os Briefings do Conteúdo...`
- `FINALIZING` → `Finalizando...`

A aplicação, e não LLM/provider, decide estados, stages, quantidade, IDs, versões, quota, autorização, retry e sucesso.

### 3.3 Contratos canônicos

Criar em `src/modules/commerce-intelligence/contract.ts` tipos e validadores runtime para:

- `ProductUnderstanding`: `productId`, arrays `coreUseCases`, `capabilities`, `functionalBenefits`, `emotionalBenefits`, `desiredOutcomes`, `purchaseTriggers`, `purchaseBarriers`, `communicationRisks`, `evidenceRefs`; `category` opcional.
- `CommercialOpportunity`: `id`, relações opcionais de `audience`, `situation`, `pain`, `desire`, `desiredOutcome`, `objection`; arrays `relevantCapabilities`, `benefits`, `proofOptions`; `sellingArgument`, `confidence` interno e `evidenceRefs`.
- `ProductStrategy` v1 `ACTIVE`: campos mínimos da SPEC, inclusive `platformId` e `platformSkillVersion`, vinculada ao Product e ao Job.
- `ContentPlan`: `id`, `productId`, `strategyVersion`, `targetContentCount`, plataforma/Skill e oportunidades vinculadas.
- `ContentOpportunity`: `id`, `commercialObjective`, `angle`, `coreMessage`, `hookMechanism`, `noveltyTargets`, mais campos relacionais opcionais e `sourceOpportunityId` quando válido.
- `ContentBriefVersion` v1: `angle`, `hook`, `script`, `scenes`, `cta` obrigatórios; `structure`, `objective`, `targetAudience`, `pain`, `desire`, `objection`, `benefit`, `notes` opcionais.
- `BriefValidationReport`: `briefId` como nome canônico, derivado de `contentId + briefVersionId`, mais `factualStatus`, `structuralStatus`, `platformStatus`, `varietyStatus`, `issues` e decisão `PASS`, `REPAIR` ou `REJECT`.

Os validadores devem rejeitar campos desconhecidos de ownership, cardinalidade inválida, IDs externos, arrays vazios quando obrigatórios, conteúdo acima dos limites definidos e quantidade diferente de `targetContentCount`. Devem validar hash de estrutura e quantidade de cenas válida para o formato. O adapter do provider não poderá devolver `tenantId`, IDs persistentes, status, quota, provenance ou comandos de workflow; esses valores são derivados pelo servidor.

### 3.4 Model Router e Skill

Criar a porta mínima em `src/modules/commerce-intelligence/model-router.ts` e um adapter HTTP em `src/modules/commerce-intelligence/provider.ts`, usando `fetch` nativo e configuração server-side. O mapa fixo da primeira geração é:

- `PRODUCT_UNDERSTANDING`, `AUDIENCE_DISCOVERY`, análise de dores/desejos/objeções e `CONTENT_BRIEF_GENERATION` → `MID`;
- `STRATEGY_SYNTHESIS` e `CONTENT_PLAN_GENERATION` → `HIGH`;
- schema validation, factualidade, quality/variety, contagens, orquestração, persistência, idempotência, quota e estados → determinístico, fora do Router.

O provider ausente, timeout ou resposta não utilizável causa `GEN-PROVIDER`; é falha recuperável do Job e libera a reserva por CAS-idempotente. Não existe provider fake/fallback no caminho do produto. Testes de capability usam adapter in-memory injetado, sem apresentá-lo como provider de produção.

Criar `src/modules/commerce-intelligence/platform-skill.ts` com a versão default server-side imutável `TikTok Commerce Creative Skill` (`tiktok-commerce@1.0`), carregada por versão e validada antes do primeiro call. Sua `validationRules` deve declarar: separar decisão estratégica de fala sugerida; manter cenas simples para creator comum; usar linguagem oral; não exigir leitura literal do script. A versão é registrada na Strategy, no Plan e no `IntelligenceRun`; Skill não tem acesso a Job, Prisma, quota ou persistência.

### 3.5 Primeira pipeline

Criar `src/modules/commerce-intelligence/engine.ts` com uma função de orquestração que recebe snapshot autorizado de Product, restrições persistidas, `Creator Context` aplicável — ou um objeto vazio explícito quando inexistente neste slice —, snapshot de memória vazio, Skill e porta de Model Router. Ela atualiza o stage por callback do Job e executa:

1. Product Understanding usando fatos confirmados e `evidenceRefs`.
2. Commercial Opportunity Mapping relacionando público, situação, dor/desejo, capability, benefício, objeção, prova e argumento.
3. Strategy Builder para uma única Strategy v1.
4. Content Portfolio Planner para um único Plan cuja distribuição soma exatamente `targetContentCount`.
5. Brief Generator para cada oportunidade planejada.
6. Fact Validator com estados `SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED`, `CONTRADICTED`.
7. Quality Gate estrutural/factual/plataforma por briefing e Variety Gate determinístico no conjunto, com duplicata exata/normalizada, hash de estrutura, quantidade de cenas válida para o formato e repetição estrutural indevida.
8. Repair limitado, preservando Briefings `PASS` e regenerando apenas rejeitados com suas causas.
9. Resultado final completo, sem preencher quantidade com conteúdo irrelevante.

O Brief Generator recebe o `Creator Context` aplicável, a oportunidade, a Strategy e as `validationRules` da Skill. Seus prompts instruem explicitamente os quatro comportamentos qualitativos da SPEC: decisão estratégica separada da fala sugerida, cenas simples, linguagem oral e liberdade para não ler o script literalmente. Contract tests verificam a Skill, o envelope do prompt e o resultado normalizado.

A engine não consulta histórico nem memória anterior nesta primeira execução. O `ProductMemorySnapshot` de entrada é vazio; somente sinais estruturados de um resultado `SUCCEEDED` podem ser persistidos na finalização.

---

## 4. Persistência e migration

### 4.1 Modelos a adicionar em `prisma/schema.prisma`

Adicionar relações ao `Tenant` e `Product` e estes modelos; campos de payload evolutivo ficam em JSONB, mas ownership, estados, quantidade, versões, timestamps e dimensões de consulta permanecem estruturados:

- `CommerceIntelligenceJob`: `id`, `tenantId`, `userId`, `productId`, `idempotencyKey`, fingerprint, `targetContentCount`, `generatedContentsMonth`, `status`, `stage`, `attempt`, `leaseOwnerId`, `leaseDeadlineAt`, `nextAttemptAt`, `startedAt`, `finishedAt`, erro público sanitizado/código interno, snapshot de entrada e metadata operacional. Índices por `(tenantId,status)`, `(status,nextAttemptAt,leaseDeadlineAt)` e `(tenantId,productId,createdAt)`; unique `(tenantId,idempotencyKey)`.
- `GenerationUsageReservation`: `id`, `tenantId`, `jobId`, `generatedContentsMonth`, quantidade, estado `RESERVED`/`CONFIRMED`/`RELEASED`, motivo e timestamps; unique `jobId` e índice por `(tenantId,generatedContentsMonth,status)`. A reserva é a unidade de reconciliação e não é recriada em retry técnico.
- `IntelligenceRun`: `id`, `tenantId`, `jobId`, `productId`, engine version, Skill version, metadata interna de tarefas/provider/modelo/custo/latência/retries, snapshot de memória de entrada e timestamps. Não guardar prompts, tokens secretos ou payload bruto.
- `ProductUnderstanding`: `id`, `tenantId`, `productId`, `jobId`, payload canônico JSONB, version e timestamps.
- `CommercialOpportunity`: `id`, `tenantId`, `productId`, `jobId`, campos relacionais estruturados quando necessários, payload canônico e timestamps.
- `ProductStrategy`: `id`, `tenantId`, `productId`, `jobId`, `version`, `status`, `platformId`, `platformSkillVersion`, payload canônico e timestamps. Índice parcial único por Product para `status = ACTIVE`.
- `ContentPlan`: `id`, `tenantId`, `productId`, `jobId`, `strategyId`, version da Strategy, quantidade, plataforma/Skill, payload canônico e timestamps. Unique `(jobId)`.
- `ContentOpportunity`: `id`, `tenantId`, `productId`, `planId`, `jobId`, campos mínimos estruturados, opcionais e payload. Unique `(planId,id)` e índice por plan.
- `Content`: `id`, `tenantId`, `productId`, `jobId`, `planId`, `opportunityId` opcional, posição, status `DRAFT`, `currentBriefVersionId` nullable durante a montagem, `approvedBriefVersionId` nullable, payload mínimo e timestamps. Unique `(jobId,position)`; nenhum `approvedBriefVersionId` na primeira geração. A transação curta insere o Content, insere a `ContentBriefVersion` v1 e preenche `currentBriefVersionId` antes de marcar o Job `SUCCEEDED`.
- `ContentBriefVersion`: `id`, `tenantId`, `productId`, `jobId`, `contentId`, version, payload canônico imutável e timestamps. Unique `(contentId,version)` e índice por `(jobId,contentId)`.
- `BriefValidationReport`: `id`, `tenantId`, `jobId`, `contentId`, `briefVersionId`, `briefId` derivado de `contentId + briefVersionId`, quatro statuses, decisão, issues JSONB e timestamps. Unique por `briefId`; `briefId` é o mapeamento persistente do nome canônico para a versão imutável.
- `ProductMemorySnapshot`: `id`, `tenantId`, `productId`, `sourceJobId`, version, sinais estruturados JSONB e timestamps. Unique composto `(tenantId,sourceJobId)` impede snapshots duplicados em replay concorrente. Só recebe uma linha após sucesso; não criar/atualizar em falha ou cancelamento.

Todos os modelos Product-scoped devem ter uniques compostos `(tenantId,id)` nas entidades referenciáveis e FKs compostas que incluam `tenantId` e `productId`: Job → Product; reservation → Job; run → Job/Product; Strategy → Job/Product; Plan → Strategy/Job/Product; Content → Plan/Opportunity/Job/Product; BriefVersion/Report → Content/Job/Product; MemorySnapshot → source Job/Product. Quando o Prisma exigir relação alternativa, o caso de uso deve executar lookup e persistência na mesma transação com `tenantId` e `productId` em todos os `where`/`create`. Não usar `ON DELETE CASCADE` para apagar histórico; DELETE físico é rejeitado pela aplicação conforme B-003-14.

### 4.2 Regras SQL da migration

Criar `prisma/migrations/<timestamp>_slice003_commerce_intelligence/migration.sql`, aditiva e executável sobre o banco atual. A migration deve:

1. Criar somente enums e `CHECK`s de domínio simples, além de uniques e FKs; não expressar transições entre estados, exact-N entre tabelas, reconciliação ou regras de publicação no SQL.
2. Criar o índice parcial `UNIQUE (userId) WHERE status IN ('QUEUED','RUNNING')`, uniques compostos tenant-scoped e FKs compostas tenant/product-scoped, impedindo mistura relacional entre Tenants/Products.
3. Manter valores existentes de `TenantEntitlement`; não inventar limite mensal em migration. A capacidade mensal vem de configuração server-side validada e falha fechada se ausente/inválida.
4. Armazenar `generatedContentsMonth` como o período UTC calculado na criação; guards/CAS de aplicação usam esse valor em sucesso, falha e cancelamento, nunca o mês do término.
5. Permitir `NULL` em payloads intermediários e em `Content.currentBriefVersionId` durante montagem; guards/CAS protegem transições e a transação curta protege exact-N, publicação atômica e consistência do conjunto.
6. Criar unique `(tenantId,sourceJobId)` para `ProductMemorySnapshot` e não backfillar Strategy, Contents, memória ou provenance com dados inventados.
7. Não remover tabelas/dados do Slice 001/002 e não criar triggers/policies de transição que não estejam realmente implementados.

A finalização usa `prisma.$transaction` curta para inserir o conjunto, reports, run e memória, preencher `currentBriefVersionId`, confirmar a reserva e marcar o Job `SUCCEEDED`; qualquer falha faz rollback e chama reconciliação CAS-idempotente. Chamadas ao provider, repair e processamento não podem ocorrer dentro dela.

---

## 5. Sequência de implementação

### Tarefa 1 — Fixar o modelo de domínio e validação

**Arquivos:** criar `src/modules/commerce-intelligence/contract.ts`, `errors.ts`, `stages.ts` e testes correspondentes.

- Definir os tipos canônicos e os códigos de erro `GEN-COUNT-REQUIRED`, `GEN-COUNT-RANGE`, `GEN-SCHEMA`, `GEN-FACT`, `GEN-VARIETY` e `GEN-REPAIR-EXHAUSTED`.
- Implementar validação runtime de Product snapshot, Strategy, Plan, Opportunity, BriefVersion e `BriefValidationReport`, incluindo exact-N, IDs internos, `structure` opcional, `briefId = contentId + briefVersionId`, hash estrutural e cenas válidas para o formato.
- Implementar mensagens de stage e guards puros de transição; rejeitar transição inválida sem alterar estado.
- Testar quantity `1`, `30`, `0`, `31`, não inteiro; arrays obrigatórios vazios; claims unsupported/contradicted; duplicata normalizada; hash de estrutura; quantidade de cenas inválida; Plan cuja soma não é N; Brief sem `angle`, `hook`, `script`, `scenes` ou `cta`.

**Gate:** `npx tsx --test src/modules/commerce-intelligence/contract.test.ts` deve passar e não depender de Prisma/provider.

### Tarefa 2 — Adicionar schema e migration

**Arquivos:** modificar `prisma/schema.prisma`; criar migration do Slice 003; criar teste de integração de constraints em `src/modules/commerce-intelligence/persistence.test.ts`.

- Adicionar modelos/relacionamentos da seção 4 e preservar o schema atual do Slice 002, incluindo `ProductImportAttempt`.
- Aplicar índice parcial de um Job ativo por `userId`, unique de idempotência por Tenant, reserva única por Job, Strategy ACTIVE única por Product, unique de memória por `(tenantId,sourceJobId)` e isolamento relacional composto tenant/product-scoped.
- Testar migration limpa e incremental, FKs/uniques compostos contra cross-tenant/cross-product, `currentBriefVersionId` nullable durante montagem e rollback de finalização; transições, exact-N e publicação ficam fora da migration.

**Gate:** `npx prisma validate` e o teste de migration devem comprovar que a migration é aditiva, que o índice parcial bloqueia concorrência, que uma combinação relacional incompatível é rejeitada e que não há Product/job/reserva/memória parcial após rollback.

### Tarefa 3 — Implementar Entitlements, `active_products` e confirmação transacional

**Arquivos:** criar `src/modules/entitlements/generation.ts` e `src/modules/entitlements/products.ts`; criar `src/modules/commerce-intelligence/service.ts`; modificar `src/modules/products/service.ts`, `src/modules/products/http.ts` e as rotas de archive/reactivate/delete; criar testes de serviço e integração.

- Antes de aceitar geração, reconciliar `TenantEntitlement.activeProductsUsed` a partir da contagem server-side de Products `ACTIVE` do Tenant. O backfill deve ser idempotente, não confiar no contador legado e falhar fechado quando `activeProductsLimit` for `NULL`/inválido.
- Implementar em transações curtas `activateProduct`, `archiveProduct` e `reactivateProduct`: travar a linha de Entitlement, recalcular/validar limite, alterar lifecycle e contador como decisão única; duas ativações concorrentes não ultrapassam limite; archive/reactivate repetidos não contam duas vezes.
- Fazer confirmação de Product novo executar ativação, reserva mensal e criação do Job na mesma transação. Product já ativo e autorizado, inclusive retry explícito, não reserva novamente `active_products`; o caminho manual `createManualProduct` continua sem iniciar geração, mas respeita a contagem de ativação.
- Criar configuração server-side para `generated_contents_month`; aceitar somente inteiro positivo configurado, sem plano/limite vindo do request.
- Implementar `reserveGeneratedContents`, `confirmGeneratedContents`, `releaseGeneratedContents` e `reconcileReservation` com estado condicional por `jobId`, mês UTC de origem e chave de reconciliação idempotente.
- Implementar `startCommerceIntelligence` em transação curta: resolver Product pelo Tenant, validar Product ativo sem resultado publicado, fatos e quantidade, verificar capacidade mensal, rejeitar Job ativo e criar reservation + Job `QUEUED`; Product `READY` é rejeitado por RI-003-07/AC 46.
- Replays da mesma chave/fingerprint retornam o mesmo Job; fingerprint divergente não cria nova linha. Retry técnico/reclaim/reconnect reutiliza Job, chave e reserva; retry explícito após `FAILED`/`CANCELLED` cria novo Job/chave/reserva e preserva o terminal.
- Rejeitar DELETE físico sempre: `PRODUCT_HAS_HISTORY` quando houver histórico e `PRODUCT_DELETE_UNSUPPORTED` quando não houver, ambos com `409` sanitizado e orientação `Arquivar produto`. `archiveProduct` é a única remoção operacional e decrementa `activeProductsUsed` atomicamente apenas em `ACTIVE → ARCHIVED`, conforme B-003-14/AC 47–49.
- Derivar readiness `PENDING`, `ANALYZING`, `READY`, `FAILED` somente a partir do Product e Jobs/resultados completos.

**Gate:** testes devem provar backfill/contagem de Products ativos, limite e corrida em activate/archive/reactivate, Product novo atômico, Product ativo sem reserva duplicada, `GEN-CAPACITY`, `GEN-PRODUCT-CAPACITY`, `GEN-ACTIVE`, mês UTC, replay, reconciliação CAS repetida, retry técnico versus explícito, Product `READY` bloqueado, DELETE sempre rejeitado, decremento atômico no archive e isolamento entre Tenants.

### Tarefa 4 — Implementar Skill, Router e adapter de provider

**Arquivos:** criar `src/modules/commerce-intelligence/platform-skill.ts`, `model-router.ts`, `provider.ts`, `router-map.ts` e testes contract.

- Carregar a Skill TikTok default por versão server-side exata `tiktok-commerce@1.0`; validar `principles`, `executionRules`, patterns e `validationRules` qualitativas de Briefing v1.
- Mapear exatamente as tarefas para `MID`/`HIGH` descritas na seção 3.4; impedir capability de escolher provider/modelo/tier diretamente.
- Separar instruções confiáveis, contexto confirmado, `Creator Context` e texto externo não confiável em envelopes distintos; nunca enviar cookies, tokens, secrets, payloads de outro Tenant ou instrução externa como regra.
- Adapter HTTP usa configuração server-side, timeout e resposta estruturada; sanitiza erros e não persiste resposta bruta. Ausência de configuração, timeout e JSON sem contrato produzem `GEN-SKILL`/`GEN-PROVIDER`; o worker converte em falha recuperável, libera reserva e preserva Product.
- Os prompts do Brief Generator devem transportar `validationRules` como contexto de execução, sem permitir que Skill controle workflow, quota ou persistência.

**Gate:** contract tests verificam mapa de tiers, separação de contexto, rejeição de ownership/status vindos do provider, `tiktok-commerce@1.0` registrada na Strategy/Plan/IntelligenceRun, os quatro comportamentos qualitativos do Briefing e erro recuperável quando Skill/provider não existem; a ausência dessas dependências não derruba o boot do worker.

### Tarefa 5 — Implementar engine, gates e repair

**Arquivos:** criar `src/modules/commerce-intelligence/engine.ts`, `strategy.ts`, `content-plan.ts`, `gates.ts`, `memory.ts` e testes unit/contract.

- Orquestrar a ordem da primeira pipeline e emitir stage real antes de cada etapa.
- Construir Strategy/Plan/Opportunities usando somente Product facts, restrições, `Creator Context` aplicável ou vazio explícito, Skill e memória vazia; manter fato separado de inferência.
- Implementar Fact Validator determinístico para claims; remover/corrigir `UNSUPPORTED`, rejeitar `CONTRADICTED`; validar structure, cenas por formato, hash estrutural e plataforma sem LLM-as-judge.
- Fazer Brief Generator receber as `validationRules` e instruir separação entre decisão estratégica e fala sugerida, cenas simples, linguagem oral e leitura não literal do script.
- Implementar Variety Gate por dimensões estruturadas e normalização determinística; preservar Briefings `PASS`; repair recebe causas e só substitui rejeitados até o limite configurado, sem reiniciar o plano inteiro.
- Implementar exact-N final: qualquer incapacidade de fechar conjunto consistente gera falha, nunca conteúdo artificial.
- Produzir sinais estruturados somente no objeto de resultado para a finalização; não consultar snapshots históricos.

**Gate:** testes cobrem provider in-memory, output completo exact-N, regras qualitativas de Briefing, claim inválido, duplicata exata/normalizada, hash estrutural, quantidade de cenas inválida, concentração estrutural, repair parcial preservando PASS, repair esgotado e memória vazia/sinais somente em sucesso.

### Tarefa 6 — Implementar worker durável, liveness e finalização

**Arquivos:** criar `src/modules/commerce-intelligence/worker.ts`, `runtime.ts`, `repository.ts`, `health.ts`, `health-route.ts`, `worker.test.ts`, `health.test.ts`, `src/app/api/health/generation/route.ts` e `scripts/worker.mts`.

- Claimar apenas Job `QUEUED` elegível (`nextAttemptAt <= now`) com update condicional; incrementar tentativa e gravar `leaseOwnerId`/`leaseDeadlineAt`.
- Usar `ProductImportAttempt` apenas como precedente de lease/status já persistido no Slice 002; não iniciar nem duplicar o fluxo de importação neste slice.
- Executar engine/provider fora de transação longa; atualizar stage em transações curtas e registrar `IntelligenceRun` sem dados sensíveis.
- Reclaimar lease expirado com incremento de tentativa, backoff e novo lease; ao atingir limite configurado, marcar `FAILED` e chamar `reconcileReservation(jobId, reason)` uma única vez.
- Finalizar com CAS por `jobId`, status `RUNNING`, owner/lease/attempt atuais. Worker obsoleto não grava resultado, não confirma/libera reservation e não altera estado terminal.
- Em sucesso, em uma transação curta inserir Strategy, Plan, Opportunities, Contents, BriefVersions, reports, run e sinais; inserir Content com `currentBriefVersionId = NULL`, criar Brief v1, preencher a FK, confirmar reservation e marcar Job `SUCCEEDED` somente após exact-N e consistência do conjunto. Falha em qualquer passo faz rollback integral.
- Qualquer falha terminal de provider, Skill, schema, factualidade, variedade, repair ou persistência passa por `failJobAndReleaseReservation`: transição CAS para `FAILED`, código interno, mensagem sanitizada e reconciliação da reservation no mês UTC de origem. Repetição não libera duas vezes.
- Cancelar somente `QUEUED`/`RUNNING` com transição condicional; em `CANCELLED`, chamar a mesma reconciliação CAS; não oferecer cancelamento em `RUNNING` quando não houver interrupção segura.
- O entrypoint falha fechado somente quando `DATABASE_URL` ou parâmetros essenciais de lease/tentativa/backoff forem ausentes ou inválidos. Provider/Skill ausentes ou inválidos permitem boot, mas o Job reivindicado falha como recuperável, libera a reservation e expõe erro sanitizado.
- Expor liveness mínimo: heartbeat/process marker seguro do worker e `GET /api/health/generation` sem Tenant, Product, payload ou secret. Não criar métricas, dashboard ou observabilidade genérica.

**Gate:** testes de claim, lease expirado, fencing, backoff, retry limitado, cancelamento concorrente, finalização idempotente, FK nullable preenchida atomicamente, rollback integral, replay de memória, reconciliação para cada falha terminal e liveness devem passar sem chamadas de rede reais; testes separados comprovam que provider/Skill ausentes não falham o boot.

### Tarefa 7 — Expor API autorizada

**Arquivos:** criar `src/modules/commerce-intelligence/http.ts`; criar `src/app/api/generations/route.ts`, `[id]/route.ts`, `[id]/retry/route.ts`, `[id]/cancel/route.ts`; criar testes HTTP.

- `POST /api/generations` exige `sameOriginRequest`, sessão, Product ativo sem resultado publicado e `Idempotency-Key` válida; Product `READY` é rejeitado para reanálise. O body só identifica Product; responder `202` com Job mínimo, sem Strategy/provider/prompt.
- `GET /api/generations/current` retorna somente o Job ativo ou o último terminal acionável do Tenant para o indicador; não confiar em `localStorage`.
- `GET /api/generations/:id` retorna status/stage/readiness e resultados somente quando `SUCCEEDED`; Job de outro Tenant responde 404 uniforme.
- `POST /retry` exige Job terminal autorizado e nova chave; `POST /cancel` exige origem/sessão e transição segura. Todas as mutações são CSRF-protected.
- DELETE Product retorna `PRODUCT_HAS_HISTORY` ou `PRODUCT_DELETE_UNSUPPORTED` conforme B-003-14, sempre orientando `Arquivar produto`; não expor stack, SQL, provider, modelo, tier, prompt, tokens, segredo, payload bruto ou existência de outro Tenant.
- Mapear todos os códigos da SPEC para HTTP e mensagens `pt-BR`, preservando contexto editável e sem publicar resultados intermediários.

**Gate:** testes HTTP verificam sessão ausente, Origin ausente/divergente, Product cross-tenant/READY, key ausente/inválida, quantity adulterada, Job ativo, retry técnico/explícito, cancelamento, DELETE archive-only, 404 uniforme e sanitização de erros.

### Tarefa 8 — Integrar Product detail/list e App Shell

**Arquivos:** substituir o contrato antigo em `src/components/products/generation-api.ts`, `generation-ui-model.ts` e `generation-panel.tsx`; modificar `product-detail.tsx`, `product-detail.module.css`, `product-list.tsx`, `product-list.module.css`, `product-api.ts`, `product-shell.tsx`, `product-shell.module.css`; criar `src/components/products/global-activity-indicator.tsx` e CSS se necessário; atualizar testes UI-model/API.

- Remover o formulário antigo de quantidade/objetivo `1–50`, o `localStorage` como ponteiro, o gating `readyForStrategy` e o vocabulário de `Generation`; esses arquivos são dead code no estado atual e podem ser substituídos/removidos sem quebrar call site existente. Usar `CommerceIntelligenceJob`, `targetContentCount` do Product e API server-authoritative.
- Em Product ativo sem resultado publicado e sem Job, mostrar uma única ação `Analisar produto`; iniciar Job e mostrar `QUEUED`. Product `READY` oferece somente `Revisar conteúdos`; nova geração/recorrência pertence ao Slice 008. Product salvo manualmente não dispara geração no POST de cadastro.
- Em `QUEUED`/`RUNNING`, mostrar Product e stage real, polling/backoff sem percentual/ETA e sem Briefing parcial; permitir uso das demais rotas e não redirecionar à força.
- Em `SUCCEEDED`, derivar `READY`, mostrar Strategy/Plan consultáveis e Briefings completos em `DRAFT`, com ação `Revisar conteúdos`; não oferecer edição/aprovação/lote neste slice.
- Em `FAILED`/`CANCELLED`, derivar `FAILED`, preservar Product/fatos e Job terminal e oferecer `Tentar novamente` como novo Job.
- Atualizar cards com badges `Pendente`, `Analisando`, `Pronto`, `Falhou` e adicionar somente o filtro `Pendente`. No estado `blocked` (`GEN-ACTIVE` ou capacidade indisponível), manter `Analisar produto` visível porém desabilitada, com explicação textual e próxima ação.
- Compor o indicador global no `ProductShell` abaixo da toolbar em desktop/tablet e abaixo do header contextual no mobile; consultar backend após navegação/reload e não depender de aba iniciadora ou `localStorage`.
- Aplicar `DESIGN.md`: `pt-BR`, labels persistentes, foco-visible, `aria-live`/`aria-busy`, erros textuais associados, alvos mínimos `44×44px`, sem cor única, sem spinner isolado, `prefers-reduced-motion`, layout mobile completo e glass somente em shell, toolbar ou sheet.

**Gate:** testes de normalização/status e smoke em navegador comprovam início somente sem resultado publicado, bloqueio `READY`/recorrência, polling, reload/reentrada, sucesso/falha/retry, estado `blocked`, indicador global, badges, filtro `Pendente`, archive-only e ausência de conteúdo parcial.

### Tarefa 9 — Integrar testes, scripts e validação operacional

**Arquivos:** modificar `package.json`; atualizar fixtures/testes existentes que assumem `/api/generations` antigo; criar testes de integração PostgreSQL somente onde necessário.

- Incluir no script `test` os testes de `commerce-intelligence`, Entitlement, Product lifecycle, HTTP, worker, health, Product readiness e UI-model; manter testes de banco identificáveis e executáveis com `DATABASE_URL`.
- Criar cenário de smoke autenticado: Product confirmado → `Analisar produto` → `QUEUED` → worker → `SUCCEEDED` → Strategy/Plan/Contents/BriefVersions; repetir via reload; simular cada falha terminal, conferir `FAILED`/liberação única da reservation e acionar retry novo.
- Confirmar que salvar manualmente não cria Job/reservation, que editar Product fora do fluxo não altera resultados publicados silenciosamente, que Product `READY` não inicia reanálise e que DELETE sempre retorna código sanitizado archive-only.
- Registrar somente logs operacionais allowlisted (job id interno/correlation id, status, stage, attempt, duração, códigos); redigir textos, URL, prompts, output, cookies e tokens.
- Executar regressão no Golden Dataset aprovado quando o artefato e seus limiares existirem; sem fixture/artefato aprovado no repositório, manter o gate `BLOCKED` e não declarar a implementação plenamente validada ou pronta para produção.

**Gate:** `npm run test` passa no ambiente disponível, testes de banco são explicitamente reportados quando pulados por indisponibilidade e nenhum teste de Slice 004+ ou 008 é adicionado.

---

## 6. Segurança, autorização e tratamento de erros

- Toda página autenticada usa `requireSession`; toda API resolve cookie por `resolveSession`; toda consulta/mutação recebe `tenantId` e, quando aplicável, `userId` resolvidos server-side.
- IDs vindos do cliente são apenas referências para lookup scoped; `tenantId`, `userId`, plano, mês, capacidade, provider, tier, Strategy, Skill e ownership são sempre derivados pelo servidor.
- `POST`, retry, cancel, archive e DELETE rejeitado exigem `sameOriginRequest`; a presença do cookie não prova intenção. Rejeitar Origin ausente/divergente e não persistir antes da verificação.
- Product novo, reservation mensal e Job são uma decisão transacional única; Product já ativo e retry não reservam `active_products` novamente. Reservation mensal é única por Job, pertence ao mês UTC de criação e toda saída terminal (`SUCCEEDED`, `FAILED`, `CANCELLED`) confirma ou libera por CAS idempotente.
- Job ativo é protegido pelo índice parcial e por tratamento de conflito; botão desabilitado é somente feedback visual.
- FKs/uniques compostos e, quando necessário, lookup/persistência transacional com Tenant/Product impedem mistura cross-tenant/cross-product; falhas de autorização respondem 404 uniforme.
- Provider recebe o mínimo de fatos confirmados, `Creator Context` aplicável e Skill necessária; conteúdo externo/seller é dado não confiável separado das instruções. Nenhuma saída textual altera autorização, quota, status ou persistência.
- Não persistir prompts completos, payload bruto, secrets, cookies, tokens ou identificadores de outro Tenant. Erro público usa mensagens sanitizadas; diagnóstico interno não chega à UI.
- Chamadas externas acontecem fora de transações longas. Timeout/lease não gera novo Job automaticamente; reclaim reutiliza Job, chave e reservation. `Tentar novamente` cria nova chave/reservation apenas após estado terminal.
- Toda falha terminal de provider, Skill, schema, factualidade, variedade, repair ou persistência executa `failJobAndReleaseReservation` com CAS no Job e reservation, no mês UTC de origem; repetição e worker obsoleto não produzem efeito adicional.
- DELETE físico é sempre rejeitado conforme B-003-14/RI-003-18/AC 47–49. `Arquivar produto` preserva dados e decrementa `activeProductsUsed` uma vez.
- O worker falha fechado somente por dependências essenciais de boot (`DATABASE_URL` e parâmetros essenciais inválidos); provider/Skill ausentes falham o Job de forma recuperável e liberam a reserva.

---

## 7. Matriz de testes comportamentais

| Contrato | Teste mínimo | Falha que deve detectar |
|---|---|---|
| Confirmação atômica | Product + active_products + reservation + Job ou nenhuma linha após erro | Product/job/reserva parcial |
| Quantidade | required, inteiro, `1–30`, estabilidade durante o Job | Cliente altera quantidade ou exact-N quebrado |
| Entitlements | capacidade, backfill/contagem de `active_products`, activate/archive/reactivate concorrentes, mês UTC, confirmação/liberação uma vez | overage, contador divergente, reserva duplicada ou mês errado |
| Fila | claim condicional, lease, reclaim, backoff, max attempts e health | worker preso, retry infinito ou liveness falso |
| Idempotência | reconnect/reentry/reclaim e retry explícito separado | nova run no retry técnico ou terminal sobrescrito |
| Contratos | cada capability input/output, `structure`, cenas/hash, `briefId` mapeado e ownership server-derived | JSON estruturalmente válido mas semanticamente inválido |
| Briefing qualitativo | Skill/prompt/resultado com decisão estratégica separada, cenas simples, linguagem oral e leitura não literal | Briefing que mistura orientação e fala ou exige leitura literal |
| Factualidade | supported/inferred/unsupported/contradicted | claim inventado/contradito persistido |
| Variedade | duplicata normalizada, hash estrutural, quantidade de cenas e concentração; repair preserva PASS | conteúdo repetido ou quantidade preenchida artificialmente |
| Persistência | Strategy única, Plan único, exact-N, Content.currentBriefVersionId nullable→preenchido, Brief v1 imutável, report por `briefId` | sucesso parcial, FK circular, Brief duplicado ou approved preenchido |
| Memória | snapshot inicial vazio, unique `(tenantId,sourceJobId)`, replay concorrente e sinais somente em sucesso | histórico consultado ou snapshots duplicados |
| Preservação Product | DELETE com/sem histórico rejeitado, archive decrementa contador uma vez | perda de histórico, DELETE físico ou contador negativo |
| Falhas terminais | provider/Skill/schema/factualidade/variedade/repair/persistência/cancelamento | Job sem `FAILED`/`CANCELLED`, reservation não liberada ou liberação duplicada |
| Autorização | Product/Job/resultado/reservation cross-tenant | vazamento por ID ou Tenant enviado pelo cliente |
| API/CSRF | sessão, origem, payload adulterado, erro sanitizado | mutação sem intenção ou stack/secret exposto |
| UI/reentrada | `idle`, `queued`, `running`, `succeeded`, `failed`, `cancelled`, `blocked`, navegação, reload, mobile e teclado | estado dependente de aba/localStorage ou ação inacessível |

Contract tests usam provider in-memory apenas como adaptador de teste. Testes de qualidade estratégica com provider real exigem Golden Dataset aprovado; sem artefato/hash/limiares aprovados, o gate permanece `BLOCKED`, sem declarar aceitação plena da Engine.

---

## 8. Validações finais

Executar, após todas as tarefas e somente no estado final:

1. `npx prisma validate`.
2. `npm run typecheck`.
3. `npm run lint`.
4. `npm run test`.
5. Testes de integração PostgreSQL/migration com `DATABASE_URL` configurado, incluindo concorrência, índice de Job ativo, reservation UTC, FKs/uniques compostos tenant/product, `currentBriefVersionId` nullable + preenchimento atômico, unique de memória, rollback integral, DELETE archive-only, archive/decremento do contador, worker obsoleto e health/liveness.
6. `npm run build`.
7. Smoke autenticado no App Router: abrir Produtos, abrir Product sem resultado publicado, acionar `Analisar produto`, navegar para Home/Configurações, observar indicador global e stage real, recarregar/fechar e reabrir, finalizar worker, abrir Briefings, confirmar `DRAFT`/exact-N/Strategy/Plan, confirmar que READY só oferece revisão, simular falha e acionar `Tentar novamente`.
8. Verificar mobile/tablet/desktop e teclado: indicador não cobre header/drawer, badges e filtro `Pendente`, estado `blocked`, foco/labels/aria presentes, alvo mínimo `44×44px`, erro não depende de cor, glass restrito a shell/toolbar/sheet e `prefers-reduced-motion` remove deslocamento.
9. Verificar por leitura de logs/respostas que não há prompt, token, cookie, payload bruto, provider/modelo/tier ou dado cross-tenant exposto; DELETE retorna somente os códigos archive-only sanitizados.
10. Executar regressão no Golden Dataset aprovado, comparando factualidade, variedade e naturalidade com a versão anterior de Engine/Skill/Model Router; registrar dataset/hash, versão `tiktok-commerce@1.0`, limiares e resultado. Sem fixture/artefato aprovado no repositório, declarar o gate `BLOCKED` e não declarar a implementação plenamente validada/pronta para produção.
11. Confirmar que `/products/new` continua salvando Product sem criar Job e que nenhum código deste slice adiciona revisão, aprovação, lotes, Agenda, Estúdio, memória histórica, recorrência ou reanálise de Product `READY`.

O resultado de cada validação deve ser registrado no handoff da implementação; qualquer validação não executada deve ser declarada explicitamente.

---

## 9. Traceability da SPEC

- `S003-01` a `S003-05`: Tarefas 2–3 e 6.
- `S003-06` a `S003-12`: Tarefas 1, 5 e 6.
- `S003-13` e `S003-14`: Tarefa 4.
- `S003-15` a `S003-17`: Tarefas 1, 3, 5–7.
- `S003-18` a `S003-20`: Tarefas 3, 7–8.
- `S003-19` e AC 42–44: Tarefas 4, 7–8 e seção 6.
- `S003-21`: Tarefas 2–3.
- `S003-22`: Tarefas 3, 7–8 e validação de reentrada; Product `READY` não oferece reanálise e nova geração fica no Slice 008.
- `S003-23`: Tarefas 3, 7–9 e seção 6; DELETE é archive-only com códigos sanitizados.
- `S003-24`: Tarefa 8 e matriz de testes; badges de readiness e filtro `Pendente`.
- `S003-25`: Tarefas 3 e 7; origem, fingerprint e ciclo de vida da `Idempotency-Key`.
- `S003-26`: Tarefas 1, 4–6; `structure`, cenas válidas, hash estrutural e regras qualitativas do Briefing.
- `S003-27`: Tarefas 1, 2 e 6; `briefId` deriva de `contentId + briefVersionId`.

Todos os 27 requisitos rastreáveis e os 52 critérios de aceite da SPEC têm uma tarefa, teste ou validação final correspondente. Nenhum requisito de Slice 004+ ou 008 é usado como dependência de implementação.

**Status:** APPROVED — re-review explícito concluído pelo Arquiteto após alinhamento com a SPEC aprovada.
