# SPEC — Slice 003: Primeira geração — CommerceIntelligenceJob até Briefings

**Status:** ETAPA_2_APPROVED — documentação canônica da Etapa 2 aprovada; implementação, runtime e cutover continuam bloqueados pelos gates ADR-029/033.

**Etapa 2 documental:** APPROVED pelo Arquiteto e pelo Review; implementação, runtime e cutover continuam bloqueados pelos gates ADR-029/033.

**Dependência:** Slice 002 — Cadastro manual de Product
**Domain Areas:** Commerce Intelligence (engine + job), Model Router, Entitlements, Content (criação), App Shell

## 1. User Outcome

Depois de acionar `Analisar produto` sobre um Product salvo com a quantidade inicial resolvida, o creator recebe, sem aprovar a estratégia ou operar etapas intermediárias, uma `ProductStrategy` e um conjunto completo de `Content` com Briefings do Conteúdo em `DRAFT`, prontos para revisão. O creator pode continuar usando a aplicação enquanto o processamento assíncrono trabalha; navegação ou fechamento da aba não interrompem o job.

## 2. Contexto

O Slice 002 deixa o Product e as restrições de preparação disponíveis para a primeira geração, mas não inicia geração ao salvar manualmente em `/products/new`. O fluxo de entrada vigente é o cadastro manual (ADR-022): a importação URL-first com `ProductCandidate` é direção futura do PRD e não faz parte deste slice. Este slice começa na ação explícita `Analisar produto` sobre um Product salvo — caso de uso que recebe um Product já persistido e uma `targetContentCount` já resolvida. A análise reserva a capacidade e cria automaticamente o `CommerceIntelligenceJob` na mesma operação transacional.

O job executa a primeira análise completa: entendimento do Product, mapeamento de oportunidades comerciais, construção da Strategy, planejamento do portfólio e geração dos Briefings. O resultado inicial materializa `ProductStrategy`, `ContentPlan`, `ContentOpportunity`, `Content` e `ContentBriefVersion` compatíveis com Content Operations. Os Contents começam em `DRAFT`; revisão, edição, regeneração, aprovação, descarte, lotes, Agenda e Estúdio pertencem a slices posteriores.

A experiência expõe somente o estado necessário para confiança e continuidade. A complexidade da engine, dos tiers, do provider, da Skill, dos gates e dos repairs permanece fora da UI.

## Pré-condição transversal — Etapa 0 (ADR-033)

A Etapa 0 é uma pré-condição documental transversal para esta SPEC e para qualquer cutover posterior da Commerce Intelligence. Ela não cria `slice-000`, `stage-0` ou uma nova capacidade de produto. O Slice 003 continua começando na ação explícita `Analisar produto` sobre um Product salvo.

O [ADR-033](../../architecture/adr-033-determinismo-llm-e-creative-system.md) registra a arquitetura-alvo e preserva explicitamente o runtime vigente do [ADR-029](../../architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md) até que exista protocolo A/B pareado, relatório versionado e aprovação formal. Portanto, esta revisão não remove, reclassifica ou altera chamadas, tiers, cenas, gates, repairs ou o `ROUTER_MAP` atuais.

O contrato-alvo documentado nesta Etapa 0 separa descoberta e realização criativas do trabalho determinístico de organização, combinação, seleção, restrição, distribuição, memória e validação. A adoção operacional depende do gate de cutover desta SPEC e do PLAN; antes dele, o runtime continua sendo o baseline ADR-029.

Fontes de autoridade:

- `docs/delivery/SLICES.md`, Slice 003 e matriz de dependências;
- `docs/product/PRD.md`, §§ 8–12, 23–25, 30–34, 40–45 e 58;
- `docs/product/PRD-commerce-intelligence-engine.md`, §§ 1–8, 9–16, 18–22, 24–27, 32–40, 41–47, 48–52, 56–70;
- `docs/product/PRD-product-intelligence-analysis.md`, §§ 1–31;
- `docs/product/PRD-content-briefing.md`, §§ 1–3 e 16–18;
- `docs/product/PRD-model-router-inteligence.md`, §§ 1–13;
- `docs/architecture/SYSTEM-DESIGN.md`, §§ 1–10;
- `docs/architecture/adr-001-monolito-modular-e-stack-do-mvp.md`;
- `docs/architecture/adr-002-engine-estrategica-como-core.md` (contrato v1 superseded pelo ADR-012);
- `docs/architecture/adr-003-postgresql-memoria-e-rastreabilidade.md`;
- `docs/architecture/adr-004-variedade-por-memoria-estruturada.md`;
- `docs/architecture/adr-005-geracoes-assincronas-e-duraveis.md`;
- `docs/architecture/adr-006-limites-de-plano-e-uso.md`;
- `docs/architecture/adr-022-entrada-oficial-cadastro-manual.md` (entrada vigente; ADR-008 superseded permanece referência histórica);
- `docs/architecture/adr-009-identidade-autorizacao-e-tenant-inicial.md`;
- `docs/architecture/adr-012-contratos-canonicos-da-commerce-intelligence.md`;
- `docs/architecture/adr-013-model-router-e-intelligence-tier.md`;
- `docs/architecture/adr-014-platform-skill-versionada.md`;
- `docs/architecture/adr-015-content-operations-e-recording-batch.md`;
- `docs/architecture/adr-019-gate-versionada-e-cenas.md` (ContentSceneSet separado e contrato de cenas);
- `docs/architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md`;
- `docs/architecture/adr-033-determinismo-llm-e-creative-system.md` (Etapa 0; arquitetura-alvo condicionada a eval e cutover);
- `docs/engineering/PRINCIPLES.md`;
- `DESIGN.md`, §§ 1–3, 7–11.

## Problem Statement

A ação explícita `Analisar produto` sobre um Product salvo precisa levar diretamente ao primeiro valor do produto: uma estratégia comercial e Briefings úteis, sem transformar a análise em um wizard. A geração pode envolver chamadas externas, várias capabilities e validações; portanto, precisa ser durável, recuperável, idempotente e transparente apenas no nível operacional que o creator consegue usar.

## Goals

- Entregar a primeira `ProductStrategy` e `targetContentCount` Contents publicáveis em `DRAFT` após os hard gates finais. Quando parte do lote for realmente não publicável por falha objetiva dentro do teto de falhas, o job conclui `SUCCEEDED_PARTIAL`, com variedade revalidada e retry explícito dos faltantes (ADR-021).
- Permitir navegação contínua e reentrada sem perder o estado real do job.
- Impedir sucesso parcial silencioso, consumo duplicado, duplicação de resultados e uso de dados fora do Tenant autorizado. `SUCCEEDED_PARTIAL` é sempre declarado e revalidado.
- Comunicar ao creator Produto, etapa real, sucesso/falha e próxima ação em `pt-BR`, sem expor detalhes técnicos da engine.

## User Stories

### P1 — Primeira geração completa e recuperável

**User Story:** Como creator, quero acionar `Analisar produto` sobre um Product salvo e receber uma estratégia e Briefings prontos para revisão sem operar a engine passo a passo, para transformar rapidamente um produto em conteúdo gravável.

**Independent Test:** Acionar `Analisar produto` sobre um Product salvo com quantidade válida, observar o job assíncrono até seu estado terminal e verificar o indicador global, a recuperação e o resultado completo ou a falha acionável.

## 3. In Scope

- Ação explícita `Analisar produto` sobre um Product salvo (entrada vigente: cadastro manual, ADR-022; ProductCandidate é direção futura) e resolução server-side da `targetContentCount` antes da criação do job.
- Criação transacional do `CommerceIntelligenceJob` a partir de um Product salvo, com reconciliação server-side de `active_products` e reserva de Entitlement mensal; a unidade de Product ativo é aplicada somente no cadastro e nas transições de lifecycle.
- Job persistente em fila PostgreSQL, worker com lease/timeout, reentrada e retry idempotente.
- Estados do job `QUEUED`, `RUNNING`, `SUCCEEDED`, `SUCCEEDED_PARTIAL`, `FAILED` e `CANCELLED` (ADR-021).
- Stages públicos `UNDERSTANDING_PRODUCT`, `MAPPING_COMMERCIAL_OPPORTUNITIES`, `BUILDING_STRATEGY`, `BUILDING_CONTENT_PLAN`, `GENERATING_BRIEFS` e `FINALIZING`, com mensagens humanas correspondentes e atualização antes do trabalho correspondente.
- Regra de no máximo um job `QUEUED` ou `RUNNING` por usuário.
- Indicador global no App Shell para job ativo, concluído com ação pendente e falha recuperável.
- Readiness operacional do Product como `PENDING`, `ANALYZING`, `READY` ou `FAILED`, derivada do job e dos resultados.
- Execução da primeira pipeline da Commerce Intelligence: `Product Understanding → Commercial Opportunity Mapping → ProductStrategy v1 → ContentPlan → ContentOpportunity → Brief Generator → Fact/Quality/Variety Gates → Repair → persistência final`.
- `Commercial Opportunity Mapping` no envelope `COMMERCIAL_OPPORTUNITY_MAPPING` pode representar hipóteses semânticas de contexto, desejo, identificação, curiosidade, aspiração, humor e potencial visual. Essas hipóteses são válidas mesmo sem dor, objeção ou necessidade prévia; a ausência desses campos não invalida a oportunidade por si só.

- Carregamento da TikTok Commerce Creative Skill versionada e registro da versão usada.
- Creative System declarativo e versionado dentro da `PlatformSkill`, com `CreativePrimitive`, `CreativeRecipe`, resolvedor de compatibilidade e `CreativeBlueprint` especificados sem criar domínio, serviço, agente, workflow ou repositório separado.
- Contrato de carregamento `load → validate → freeze → expose`, compatibilidade versionada fail-closed, histórico preservado e memória versionada; o `creativeDirection` futuro pertence ao `ContentOpportunity`, sem agregado paralelo.
- Roteamento de tarefas lógicas por `IntelligenceTier` através do Model Router, sem seleção direta de provider por capability.
- Validação estrutural, factual, de cenas e de variedade; `BriefValidationReport` por briefing; Judge semântico em lote `PASS|REVIEW`, repair seletivo único e revalidação final dos hard gates, sem completar quantidade com conteúdo inválido.
- Persistência de `ProductStrategy`, `ContentPlan`, `ContentOpportunity`, `Content` e `ContentBriefVersion` inicial em `DRAFT`, com proveniência suficiente para rastrear o job, Product, Strategy e Skill.
- Confirmação ou liberação transacional da reserva mensal de conteúdos no mês UTC de origem.
- Preservação do Product e dos fatos confirmados em falhas, com recuperação explícita.
- Exclusão Big Bang de Product por mutação autenticada: remoção transacional, tenant-scoped e completa do Product e de todos os dados relacionados.

### 3.3B Etapa 2 — fronteiras de fatos, Mapping e Strategy

O payload factual produzido pelo worker é o contrato `WorkerEngineFactsPayload` observado no runtime:

```ts
type WorkerEngineFactsPayload = {
  productId: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  priceAmount: string | undefined;
  priceCurrency: string | null;
  variants: unknown;
  images: unknown;
  seller: string | null;
  sourceUrl: string | null;
};
```
`priceAmount` é serializado por `Decimal.toString()` quando existe. `variants`, `images`, `seller` e `sourceUrl` permanecem com os valores produzidos pelo worker; não há normalização documental adicional. Conforme ADR-030, o payload não contém `features`, `characteristics`, `commission`, `discount`, `evidenceRefsCatalog` ou `creatorConstraints`.

`EngineInput.facts?: Record<string, unknown>` é um campo genérico da engine. Uma entrada direta pode fornecer fatos genéricos próprios, mas este contrato não promete que `features` sejam projetadas, removidas ou transformadas. No caminho do worker, `facts` recebe o `WorkerEngineFactsPayload` acima e não contém `creatorConstraints`; `creatorContext` continua sendo uma entrada separada.

`evidenceRefsCatalog` não pertence a `projectEngineFacts`. Depois de receber `EngineInput`, a engine deriva um snapshot `{ facts: string[]; refs: string[] }` em `buildEvidenceCatalog`: inclui `name`/`description` e valores string ou arrays de strings em `facts`, usando `fact:<chave>` e `fact:<chave>:<n>` para valores posteriores. Esse catálogo derivado é encaminhado às capabilities que precisam de evidência; não é parte do payload factual do worker.

`Discovery` é o pool/role semântico do envelope/capability `COMMERCIAL_OPPORTUNITY_MAPPING`; não cria capability, call ou stage adicional. PU valida a forma, cardinalidade e pertencimento de suas `evidenceRefs`, e Mapping valida as referências do próprio envelope contra a projeção de evidências autorizada. Strategy consome essa projeção já validada e não promete validação direta de `evidenceRefs`; a factualidade de Briefings e seus repairs continua nos gates determinísticos da baseline ADR-029.



A redução de cardinalidade de Product Understanding é uma exceção explícita à regra geral de não truncamento: o provider aplica first-N antes de `assertProviderOutput`, e a engine aplica first-N antes do validador, tanto na primeira tentativa quanto no retry. A redução do provider não entra em `understandingReductions`; a redução da engine é observável. Não há truncamento silencioso genérico em outros contratos.

Schemas estritos rejeitam os campos explicitamente proibidos; na canonicalização, campos desconhecidos fora do shape suportado — inclusive comandos, workflow e instruções — são descartados. Transformar esse descarte em rejeição é mudança de runtime e exige decisão própria. O limite ativo de `targetContentCount` é `1–10`; referências legadas de migração ou contratos históricos `1–30` não ampliam quota nem o contrato ativo.

## Out of Scope

- Salvar automaticamente um job ao usar apenas o botão `Salvar produto` de `/products/new`; essa fronteira permanece no Slice 002.
- Segunda confirmação obrigatória da Strategy, botão intermediário `Gerar estratégia` ou página permanente de `Análise`.
- Fila visual de múltiplos jobs, prioridade manual ou múltiplos jobs concorrentes do mesmo usuário.
- Edição, regeneração, duplicação, aprovação ou descarte de Content; versionamento operacional posterior.
- Seleção de Contents para `RecordingBatch`, lotes, Agenda, Estúdio ou execução de gravação.
- Memória histórica, aprendizado por performance e nova geração com variedade; a primeira execução usa somente snapshot vazio, sem consultar histórico ou implementar o loop de recorrência.
- Escolha de provider, modelo ou tier na UI; exposição de provider, modelo, tier, prompts, logs, payloads ou detalhes brutos da Skill. A exceção allowlisted do Histórico do Produto, definida no Slice 010, é `jobId`, status, timestamps, usage agregado e custo agregado; ela não expõe metadata técnico bruto.
- Publicação, agendamento de publicação, TikTok OAuth/API, analytics externo, ROAS, CTR ou atribuição.
- Geração ou edição de vídeo, imagem, áudio ou voice-over.
- Embeddings, banco vetorial, similaridade semântica, deduplicação semântica e judge LLM de variedade ou memória ficam fora do Slice 003; a variedade usa dimensões estruturadas e normalização determinística. `CONTENT_QUALITY_JUDGE` é a exceção interna após hard gates e cobre hook, development, script, CTA e cenas em batch por `contentId`; retorna somente `PASS|REVIEW`. Cada parte `REVIEW` recebe um único `CONTENT_PART_REPAIR`; `PASS` permanece intacto, repair inválido preserva a parte original e não há re-Judge, `REJECT` semântico ou `QUALITY_PENDING`.
- Alteração de Strategy durante o job, mudança automática de Strategy por performance e edição de fatos além do cadastro inicial.
- Alteração de PRD, ADR, `SYSTEM-DESIGN.md`, `DESIGN.md` ou `PRINCIPLES.md`; esta revisão altera somente a documentação operacional desta SPEC, do PLAN e do mapa de Slices para registrar a Etapa 0.
- Cutover do runtime, escrita de `creativeDirection`, remoção ou reclassificação de chamadas, tiers, cenas, gates, repairs ou `ROUTER_MAP` antes do protocolo A/B e das aprovações exigidas pelo ADR-033.
- Criação de PLAN ou implementação de código nesta etapa de especificação.

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Origem que inicia este slice | Ação explícita `Analisar produto` sobre um Product salvo (entrada vigente: cadastro manual, ADR-022; ProductCandidate é direção futura); o salvamento manual isolado de `/products/new` não inicia job | Preserva a fronteira explícita do Slice 002 e o core loop dos PRDs | Sim, pelas fontes canônicas |
| Autoridade da quantidade inicial | Usar `Product.targetContentCount` validado e as restrições persistidas pelo Slice 002; ausência, não inteiro ou fora do limite é rejeitada server-side | Evita segunda tela e impede que o cliente altere a quantidade depois do salvamento | Sim, por Slice 002 e PRD de análise |
| Limite numérico da quantidade | `1–10`, sujeito à capacidade do Entitlement | Slice 002 define esse intervalo; a capacidade comercial continua server-side | Sim, por Slice 002/ADR-006 |
| Mensagens de stage | Usar uma mensagem humana estável por stage, em `pt-BR`, refletindo a etapa real; detalhes de copy podem ser refinados sem mudar o contrato | DESIGN e PRDs proíbem simulação por animação e percentual inventado | Não; contrato comportamental |
| Repairs | `Hard Gate Repair` é objetivo, anterior ao Judge, usa `CONTENT_BRIEF_REPAIR` por item e pode usar até `GENERATION_MAX_REPAIRS`; `GENERATION_MAX_REPAIRS` não limita repair semântico. Após hard gate `PASS`, `CONTENT_QUALITY_JUDGE` retorna `PASS|REVIEW` por parte; cada parte `REVIEW` recebe no máximo um `Semantic Part Repair`, sem re-Judge. Falha ou schema inválido preserva a parte original e não cria faltante | Hard gates são autoridade de entrega; repair semântico preserva o original inválido e não cria faltante | Sim, ADR-029 |
| Cancelamento pelo creator | Manter `CANCELLED` no contrato; oferecer ação somente se a infraestrutura suportar cancelamento seguro, em progressive disclosure | PRD suporta o estado, mas não exige cancelamento como ação primária no MVP | Não; configuração em aberto |
| Conflito sobre gates | Hard gates, schema e Variety Gate permanecem determinísticos e fora do LLM. O `BriefValidationReport` registra somente resultado objetivo `PASS|REPAIR|REJECT`; `Hard Gate Repair` é anterior ao Judge e limitado por `GENERATION_MAX_REPAIRS`. Após hard gate `PASS`, `CONTENT_QUALITY_JUDGE` retorna somente `PASS|REVIEW` por parte; uma parte `REVIEW` recebe um único `Semantic Part Repair`, sem re-Judge. Repair semântico inválido ou com schema inválido preserva a parte original e não cria faltante; falha objetiva segue ADR-021. | Separa autoridade objetiva de qualidade semântica sem transferir regra de sistema ao LLM e sem criar estado público semântico | Sim, ADR-029 |
| Memória na primeira geração | Usar `ProductMemorySnapshot` vazio, sem consultar histórico/recorrência; após sucesso persistir sinais estruturados de todo Content entregue em `DRAFT`; falha/cancelamento não atualizam memória. | Conteúdo entregue é sinal `gerado`; qualidade semântica não cria estado alternativo. | Sim, ADR-021/025/029 |
| Retry técnico | Reconnect, reentrada e worker recuperado reutilizam o mesmo `job.id`, a mesma chave lógica e a mesma reserva; não criam novo job | Mantém idempotência durante a execução e evita cobrança/resultado duplicado | Sim, decisão desta SPEC |
| Retry acionado pelo creator | `Tentar novamente` após `FAILED` ou `CANCELLED` cria novo job com nova chave idempotente e nova reserva; preserva o job terminal anterior e reutiliza Product/fatos confirmados | Distingue nova execução de reentrada técnica e preserva histórico de tentativas | Sim, decisão desta SPEC |
| Mês da reserva | Registrar o período `generated_contents_month` em UTC no momento da criação; liberar/confirmar no mesmo período de origem, mesmo se o job terminar em outro mês | ADR-006 fixa a origem temporal da reserva no mês UTC da criação | Sim, ADR-006 |
| Versão ativa da Skill | Carregar a versão default server-side da `TikTok Commerce Creative Skill`, registrar a versão e falhar fechado se ausente ou inválida | Skill é dependência versionada e não pode ser escolhida pelo cliente | Sim, ADR-014 |
| Falha após resultados intermediários | Resultados intermediários podem ser persistidos para recuperação/auditoria; a publicação para o creator ocorre na conclusão consistente — `SUCCEEDED` com N itens ou `SUCCEEDED_PARTIAL` declarado com D itens aprovados e revalidados (ADR-021) | Evita sucesso parcial silencioso e preserva diagnóstico | Sim, ADR-012 + ADR-021 |
| Etapa 0 e runtime vigente | Registrar ADR-033 como arquitetura-alvo, mantendo ADR-029 integralmente vigente até relatório A/B aprovado e cutover formal | Evita que uma hipótese de redução de chamadas ou mudança de autoridade altere o baseline sem evidência | Sim, ADR-033 |
| Creative System | `CreativePrimitive`, `CreativeRecipe` e compatibilidade são dados declarativos versionados da `PlatformSkill`; o contrato é `load → validate → freeze → expose` e falha fechado | Mantém conhecimento criativo dentro da Skill sem criar nova fronteira arquitetural | Sim, ADR-033 |
| CreativeBlueprint | Futuramente persistido como `creativeDirection` dentro de `ContentOpportunity`, sem aggregate/tabela/entidade paralela; nenhuma escrita antes do cutover aprovado | Evita duplicação de domínio e preserva leitores/histórico v1 | Sim, ADR-033 |
| Catálogo literal | Permanece corpus de referência/benchmark/eval; não entra no prompt normal de caminhos novos e o runtime ADR-029, incluindo `selectBriefPatterns`, permanece intacto até eval | Remove ancoragem somente quando houver enforcement e evidência | Sim, ADR-033 |
| Gate de supersede | Toda migração LLM → código ou mudança de runtime exige A/B pareado, thresholds versionados, relatório reproduzível e aprovação formal antes de qualquer remoção | Economia isolada não autoriza cutover | Sim, ADR-033 |


| Decisão | Padrão adotado | Racional | Confirmada? |
| --- | --- | --- | --- |
| Runtime atual e arquitetura-alvo | No runtime vigente, uma chamada de Product Understanding, uma de Commercial Opportunity Mapping, uma de Strategy, uma de Content Plan, Briefings em lotes de 4–8, cenas por Content e Judge em batches de até três, conforme ADR-029. A arquitetura-alvo do ADR-033 é hipótese a ser avaliada; nenhuma quantidade, tier ou composição futura é contrato desta SPEC | Mantém o baseline comparável sem congelar números da arquitetura-alvo | Sim, ADR-029 + ADR-033 |
| Concorrência de provider | Um batch de briefing por vez no MVP; paralelismo interno só pode ser usado dentro de limite configurado e observado | Evita disparar `N` requests simultâneos contra provider externo | Sim, por esta revisão |
| Deadline e lease | Cada tentativa possui deadline global menor que o lease renovável; heartbeat mantém o lease durante trabalho legítimo e aborta a tentativa quando o fencing for perdido | Evita reclaim concorrente, chamadas órfãs e duplicação operacional desnecessária | Sim, por esta revisão |
| Projeção de contexto | Cada capability recebe uma projeção allowlisted e limitada do contexto; Strategy e Brief Generator não recebem o agregado completo por padrão | Reduz crescimento de payload e mantém a separação entre fatos, inferências e instruções | Sim, por esta revisão |
**Decisões em aberto:** permanece configurável somente a oferta de cancelamento seguro. O limite semântico é uma tentativa por parte `REVIEW`, sem segundo repair ou re-Judge; `GENERATION_MAX_REPAIRS` aplica-se somente ao `Hard Gate Repair`.


## 5. Comportamentos

### B-003-01 — `Analisar produto` e criação atômica do job
O contrato público não recebe `tenantId`, `userId`, quantidade, `mode`, plano, quota, provider, tier ou snapshot no body: `POST /api/generations` recebe somente `productId` no corpo e `Idempotency-Key` no header, enquanto identidade e escopo vêm da sessão. Internamente, `startCommerceIntelligence` recebe `{ tenantId, userId, productId, idempotencyKey, targetContentCount?, mode?: "standard" | "retry" | "complete" }`; sem `targetContentCount`, usa a quantidade persistida no Product. `retry`/`complete` podem sobrescrever a quantidade server-side para recuperação dos faltantes, preservando fingerprint, autorização e quota derivados pelo servidor.


Ao acionar `Analisar produto` sobre um Product válido já salvo, o sistema confirma/reconcilia server-side o contador `activeProductsUsed` sob lock do Entitlement, sem aplicar novamente a quota de `active_products`; verifica somente a capacidade mensal de conteúdos e a regra de job ativo, registra o mês UTC da reserva, reserva a capacidade e cria um `CommerceIntelligenceJob` `QUEUED` de forma atômica. Não existe etapa obrigatória entre acionar e enfileirar.

A ação que somente salva o Product no Slice 002 continua sem iniciar geração: o salvamento entrega um Product salvo e é pré-condição da análise, não uma etapa dela. A criação do job deste slice ocorre apenas na ação explícita `Analisar produto`.

### B-003-02 — Pré-condições e concorrência

O Product chega à operação já persistido e `ACTIVE` pelo cadastro manual (Slice 002): o limite de Products ativos (`active_products`) é enforced no cadastro e nas transições de lifecycle (`GEN-PRODUCT-CAPACITY`), não na criação do job. A análise rejeita quando `targetContentCount` é ausente ou inválida, quando o Product não está disponível com fatos mínimos, quando a capacidade mensal não é suficiente (`GEN-CAPACITY`) ou quando o usuário já possui job `QUEUED`/`RUNNING` (`GEN-ACTIVE`). A rejeição não cria job nem reserva.

Dentro da transação da análise, o advisory lock do usuário (RI-003-03) serializa requests concorrentes; a recontagem de `activeProductsUsed` (com bloqueio do entitlement) e a criação de job + reserva mensal são uma decisão única avaliada pós-lock. A regra de job ativo é por usuário no MVP; como cada usuário possui um Tenant pessoal, consultas e mutações continuam escopadas também ao Tenant.

### B-003-03 — Fila, lease e ciclo de vida

O job persiste `userId`, `productId`, `targetContentCount`, status, stage, timestamps, tentativa, backoff, deadline da tentativa, owner/lease e erro sanitizado. O worker reivindica um job `QUEUED` com lease/timeout, move-o para `RUNNING`, executa fora de transação longa e finaliza em transação curta. Enquanto executa trabalho legítimo, renova o lease por heartbeat condicional ao mesmo owner/attempt.

O deadline global da tentativa deve terminar antes do lease efetivo ou ser protegido por heartbeat; parâmetros inválidos são rejeitados no boot. Cada chamada externa recebe o deadline da tentativa e pode ser abortada quando o owner perde fencing, o job é cancelado ou o deadline expira.

Quando o lease expira, o sistema torna o job reivindicável novamente, incrementa a tentativa, aplica o backoff configurado e respeita o limite de tentativas. O owner anterior não pode iniciar novas chamadas após detectar fencing perdido e não pode publicar resultado. Se o limite for atingido sem conclusão, marca o job como `FAILED`, reconcilia a reserva sem duplicá-la e preserva o diagnóstico.

`QUEUED → RUNNING → SUCCEEDED` é o caminho de sucesso completo; `QUEUED → RUNNING → SUCCEEDED_PARTIAL` é o sucesso parcial declarado (0<D<N e F ≤ `PARTIAL_FAILURE_CAP`, ADR-021). Uma falha recuperável leva a `FAILED`; um cancelamento seguro leva a `CANCELLED`. Estados terminais não voltam a publicar resultado parcial.

### B-003-04 — Pipeline estratégica, composição de chamadas e memória inicial

A execução carrega somente o contexto autorizado e necessário: fatos confirmados do Product, Creator Context aplicável, Skill versionada e um `ProductMemorySnapshot` vazio. Não consulta histórico nem implementa recorrência neste slice. Cada capability recebe uma projeção allowlisted, com limite configurável de tamanho, e não o agregado completo do Product, Strategy, Memory ou Skill.

Executa as capabilities na ordem conceitual de entendimento, mapeamento de oportunidades, Strategy, skeleton determinístico + campos criativos do plano, Brief Generator, hard gates e `Hard Gate Repair` objetivo limitado, cenas criativas, Judge, `Semantic Part Repair` único e hard gates/variedade finais. Até o cutover aprovado, esta ordem e sua composição de chamadas permanecem as do runtime ADR-029: uma chamada para Product Understanding, uma para Commercial Opportunity Mapping, uma para Strategy, uma para Content Plan e `ceil(targetContentCount / batchSize)` chamadas de Brief Generator, com `batchSize` inteiro entre 4 e 8; cenas continuam LLM-owned por Content e Judge usa batches homogêneos de até três. A arquitetura-alvo do ADR-033 pode substituir somente etapas comprovadas pelo protocolo A/B; este texto não autoriza remoção, integração, rebaixamento de tier ou reclassificação de cena.

Commercial Opportunity Mapping recebe somente uma projeção compacta: `productId`, fatos essenciais do Product, referências do catálogo de evidências e os campos do `ProductUnderstanding` necessários para relacionar público, situação, dor, desejo, objeção, capability, benefício, prova e argumento. Não recebe Strategy, ContentPlan, memória histórica, Skill completa, imagens/variantes não necessárias ou o agregado bruto de contexto.

Commercial Opportunity Mapping pode retornar, em um envelope único, dados de público, situação e as hipóteses semânticas de contexto, desejo, identificação, curiosidade, aspiração, humor e potencial visual, além de dor, objeção, necessidade e as `CommercialOpportunity`s relacionadas quando existirem. Dor, objeção ou necessidade prévia não são pré-condições para uma hipótese válida. A engine separa e valida cada contrato deterministicamente antes de construir a Strategy. Brief Generator recebe batches de oportunidades e devolve um item estruturado por oportunidade; IDs persistentes, posições, versões e ownership são sempre atribuídos pelo servidor.


Um batch de briefing é processado por vez no MVP, salvo limite explícito de concorrência configurado e observado. O servidor monta o skeleton do plano — quantidade, IDs, posições, slots, buckets elegíveis e tetos — e o LLM preenche os campos comerciais/criativos dentro desses slots. Cenas continuam LLM-owned por Content; o servidor valida a execução visual sem gerar staging por template. A Strategy inicial é a `ProductStrategy` v1 `ACTIVE` e contém, no mínimo, `id`, `productId`, `version`, `status`, `primaryPositioning`, `audiences`, `opportunities`, `priorityBenefits`, `priorityObjections`, `priorityArguments`, `priorityAngles`, `communicationPrinciples`, `platformId` e `platformSkillVersion`.

Stages públicos são emitidos imediatamente antes da chamada ou processamento correspondente. Subetapas internas não podem ser expostas como stages concluídos se forem executadas dentro da mesma chamada.

### B-003-05 — Roteamento interno

Capabilities que exigem interpretação solicitam tarefas lógicas ao Model Router. A tabela canônica de capability, tier runtime, retries/fallback e autoridade vigente é o ADR-029; o `ROUTER_MAP` atual não muda por esta revisão. O ADR-033 define a matriz de autoridade-alvo e só pode superseder o runtime após eval A/B aprovado. Schema validation, hard gate factual/estrutural, Variety Gate, contagens, orquestração, persistência, idempotência, quota e estados são determinísticos, fora do Router.

`reasoning.effort` é configuração server-side por tarefa, registrada junto da task/tier/modelo; não é equivalente ao tier e não substitui limites de contexto, schema ou exact-N.

O Router resolve e registra o `IntelligenceTier`, provider lógico, modelo lógico, reasoning efetivo e versão das instruções, mesmo quando o MVP usa um único provider. Provider e modelo não são escolhidos pela capability nem variam por plano comercial. Após hard gate `PASS`, `CONTENT_QUALITY_JUDGE` avalia internamente hook, development, script, CTA e cenas em batch homogêneo de até três Contents e retorna somente `PASS|REVIEW` por parte. Cada parte `REVIEW` recebe no máximo um `Semantic Part Repair`; não há re-Judge, `REJECT` semântico ou `QUALITY_PENDING`. `Hard Gate Repair` ocorre antes do Judge e é o único repair limitado por `GENERATION_MAX_REPAIRS`. Falha, schema inválido ou repair inválido preserva a parte original e não cria faltante. `SUCCEEDED` preserva exact-N de Contents `DRAFT`; Variety Gate e memória não usam judge LLM…


### B-003-06 — Skill de plataforma

A geração usa a `TikTok Commerce Creative Skill` carregada por versão. Ela influencia como uma oportunidade comercial é transformada em conteúdo rápido, natural, direto, visual, demonstrável e gravável por creator comum.

A Skill não decide fatos, não inventa benefícios técnicos, não escolhe Strategy, não controla job, persistência, quota ou retry. `platformSkillVersion` é registrada na Strategy, no `ContentPlan` e no `IntelligenceRun`.

O Creative System alvo vive dentro da `PlatformSkill` e é composto por `CreativePrimitive`, `CreativeRecipe` e resolvedor de compatibilidade versionados. Primitives são dimensões semânticas, não frases; recipes são conjuntos coerentes de restrições, não scripts. O carregamento segue `load → validate → freeze → expose`, com schema de compatibilidade versionado e falhas `GEN-CS-*` fail-closed. A Skill não acessa Job, persistência, quota, retry ou dados de Tenant.

Taxonomia mínima, conforme as decisões 4–7 do ADR-033, sem regras adicionais nesta SPEC:

- `CreativePrimitive`: unidade semântica combinável por dimensões como attention mechanism, psychological effect, format, narrative move e product role; nunca contém frases ou copy.
- `CreativeRecipe`: conjunto coerente de restrições que combina primitives; não é script nem conteúdo final.
- `CreativeBlueprint`: decisão estruturada por `ContentOpportunity`, com `recipeId?`, `attentionMechanisms[]`, `psychologicalEffects[]`, `format`, `narrativeMoves[]` e `productRole`; no futuro, fica em `creativeDirection`, sem aggregate paralelo.

Essa taxonomia é especificada e validada como fundação aditiva da `PlatformSkill`, mas não é ativada operacionalmente nem escrita nesta SPEC antes de SPEC/PLAN de cutover e eval aprovados.

Esta especificação registra o contrato-alvo sem ativá-lo no runtime vigente. A versão da Skill e os contratos históricos devem permanecer reproduzíveis; memória e snapshots são aditivos e versionados, sem fabricação retroativa.

### B-003-07 — Contratos e factualidade

Toda saída de capability deve obedecer ao schema canônico correspondente antes de seguir para a próxima etapa. `ProductUnderstanding` exige `productId`, os arrays estruturais `coreUseCases`, `capabilities`, `functionalBenefits`, `emotionalBenefits`, `desiredOutcomes`, `purchaseTriggers`, `purchaseBarriers`, além de `evidenceRefs`; `category` é opcional e é preservada quando houver evidência.

`CommercialOpportunity` possui `id`, `audience`, `situation`, `pain`, `desire`, `relevantCapabilities`, `benefits`, `desiredOutcome`, `objection`, `proofOptions`, `sellingArgument`, `confidence` interno e `evidenceRefs`, com campos opcionais permanecendo ausentes quando não houver evidência estratégica adequada. O contrato é validado antes de ser aceito pela Strategy.

O provider não pode atribuir IDs persistentes de Content, Brief, Plan, Strategy ou ownership. IDs recebidos são referências não confiáveis; a engine gera IDs server-side e rejeita colisões, cardinalidade incompatível e relações fora do contexto do job.

A cardinalidade dos arrays canônicos segue política centralizada e versionada por campo (`CARDINALITY_POLICY` / `CARDINALITY_POLICY_VERSION`, conforme ADR-012): máximos rígidos incondicionais — excedente é `GEN-SCHEMA` fail-closed, sem truncamento silencioso — e mínimos condicionais à evidência — o mínimo estrutural só se aplica com evidência autorizada; sem evidência, arrays estratégicos podem chegar vazios. Product Understanding é a exceção first-N documentada na seção 3.3B: o provider reduz antes de `assertProviderOutput` e a engine reduz antes do validador, na primeira tentativa e no retry, registrando somente a redução da engine. Fora dessa exceção, violações alimentam os retries de contrato existentes e, persistindo, falham fechado sem inventar, preencher ou aparar conteúdo. A versão da política vigente é registrada na execução (eventos de capability e sinais persistidos), preservando a compatibilidade de gerações históricas. O catálogo de evidências mantém relação 1:1 entre fatos e `evidenceRefs`: cada valor de fato recebe uma ref própria e estável (`fact:<chave>`; do segundo valor em diante, `fact:<chave>:<n>`), de modo que a citação por índice na proveniência aponte sempre para o fato correto.

Fatos confirmados são separados de inferências estratégicas; a engine pode inferir por que alguém compraria, mas não pode inventar o que o Product é ou faz.

Na fronteira de Mapping e Strategy, o Mapping pode manter hipóteses de contexto, desejo, identificação, curiosidade, aspiração, humor e potencial visual sem dor, objeção ou necessidade prévia. PU e Mapping validam forma, cardinalidade e pertencimento das `evidenceRefs`; Strategy consome a projeção validada e não promete validação direta. Não há filtragem claim-level de `UNSUPPORTED`/`CONTRADICTED` nessa fronteira. A classificação factual continua aplicável ao Briefing nos hard gates: claims `UNSUPPORTED` devem ser removidos/corrigidos; claims `CONTRADICTED` rejeitam o briefing e enviam a causa ao repair ou à falha final.




O Brief Generator produz `developmentSchemaVersion: 2` e `development: DevelopmentBullet[]`. Provider envia `text`, `factRefs` propostos e `cta`; o servidor deriva `action` apenas do stem validado e `rationale` apenas do sufixo com connector presente no `text`. `factRefs` é não vazio, contém somente referências autorizadas do catálogo de evidências e nunca `product:name`; item malformado é rejeitado, sem filtragem silenciosa. A `cta` é obrigatória em **todo** bullet desde a primeira geração e em todo repair, orientada à ação e persuasiva sem criar urgência, preço, disponibilidade ou benefício não suportado. A CTA raiz do briefing continua sendo o fechamento geral e não substitui a CTA de nenhum bullet.

Primeira pessoa é totalmente permitida como técnica persuasiva, inclusive afirmações experienciais como `Eu comecei...` e `Eu adorei...`; não há gate ético, anti-testemunho ou exigência de enquadramento subjetivo/condicional. O único limite é a factualidade objetiva e a plausibilidade material: atributos, capacidades, preço, disponibilidade, desempenho ou resultados objetivos do Product continuam sujeitos ao mesmo Fact Validator em qualquer pessoa gramatical.

`ContentBriefVersion` com `developmentSchemaVersion: 2` persiste os bullets estruturados e imutáveis. O leitor versionado aceita somente versões históricas v1 com `development: string[]` para leitura; ele as identifica como sem proveniência estruturada e nunca inventa `factRefs`, `rationale` ou CTA. Esse leitor não é caminho de geração, repair nem publicação de novas versões.

### B-003-08 — Plano, oportunidade, conteúdo e briefing

O `ContentPlan` é criado antes dos Briefings e contém `id`, `productId`, `strategyVersion`, `targetContentCount`, `platformId` e `platformSkillVersion`. No runtime vigente ADR-029, o servidor deriva esses campos e o skeleton de slots; o provider retorna os campos comerciais/criativos autorizados, incluindo `hookMechanism` dentro do allowlist do slot e `noveltyTargets`.

Cada `ContentOpportunity` exige, no runtime vigente, `id`, `commercialObjective`, `angle`, `coreMessage`, `hookMechanism` e `noveltyTargets`. No contrato-alvo do ADR-033, a decisão criativa estruturada será um `CreativeBlueprint` em `creativeDirection` dentro do próprio `ContentOpportunity`, sem aggregate, tabela ou entidade paralela:

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

A construção do Blueprint a partir do pool comercial/criativo, Creative System e memória é determinística somente após SPEC/PLAN de cutover e eval aprovados. A LLM não propõe seus campos, não os persiste e não recebe autoridade sobre IDs, ownership ou compatibilidade. Até lá, `hookMechanism` e `narrativePattern` continuam no contrato histórico do ADR-029; qualquer derivação legada futura será versionada e não duplicará a persistência.

O resultado final possui `targetContentCount` Contents `DRAFT` no `SUCCEEDED`. Quando 0 < D < N itens forem objetivamente publicáveis e F = N−D ≤ `PARTIAL_FAILURE_CAP`, o job conclui `SUCCEEDED_PARTIAL`: publica os D Contents `DRAFT`, revalida o Variety Gate sobre o subconjunto com teto recomputado `ceil(D/K)`, registra `expectedCount`/`deliveredCount`/`failedCount` e assinatura residual por item, e confirma quota pelos D entregues liberando N−D (ADR-021). D=0, F>CAP ou falha anterior aos briefs → `FAILED`. Cada Content mantém identidade estável, `productId`, `planId` e `opportunityId`.

- Na geração nova, `ContentBriefVersion` v1 exige `angle`, `hook`, `development`, `script` e `cta`; `scenes` não é campo obrigatório nem pertence ao payload novo do Briefing. Cenas são persistidas no `ContentSceneSet` separado por `briefVersionId`, conforme ADR-019, com payload ordenado `{ scenes[], generated, dropped }` e status próprio. Payloads e versões legados que contenham `scenes` permanecem read-only para leitura histórica; não são reescritos, migrados ou promovidos. O runtime ADR-029, incluindo a capability `CONTENT_SCENE_IDEAS`, permanece vigente até eval aprovado. O Briefing distingue decisão estratégica de fala sugerida, mantém cenas simples para creator comum, usa linguagem oral e não exige leitura literal do script. Aprovação ou descarte pertencem a Content Operations.
### B-003-09 — Quality Gate, Variety Gate e repair

Antes da publicação, cada briefing passa pelos hard gates de schema, estrutura, factualidade, plataforma e cenas, e o conjunto pelo Variety Gate determinístico. O `BriefValidationReport` registra somente o resultado objetivo `PASS|REPAIR|REJECT`. Candidate objetivo reprovado pode receber `Hard Gate Repair` por item, até `GENERATION_MAX_REPAIRS`, seguido de revalidação objetiva do conjunto. Só então `CONTENT_QUALITY_JUDGE` avalia hook, development, script, CTA e cenas por parte em batch homogêneo e retorna somente `PASS|REVIEW`. Apenas parte `REVIEW` recebe no máximo um `Semantic Part Repair`; `GENERATION_MAX_REPAIRS` não se aplica a esse repair, não há re-Judge, e parte `PASS` não muda. Falha, schema inválido ou repair inválido preserva a parte original e não cria faltante. Após a composição, hard gates e Variety Gate são reexecutados: item objetivamente válido publica em `DRAFT`; falha objetiva aplica ADR-021.

O ADR-033 não altera os gates preservados nesta SPEC: Blueprint inválido, quando ativado, falha antes da persistência; hard gates e Variety Gate permanecem determinísticos; `Hard Gate Repair`, Judge `PASS|REVIEW` e `Semantic Part Repair` continuam com as regras do ADR-029/ADR-021. Cenas permanecem em `ContentSceneSet` separado, e a anotação semântica nunca cria faltante nem muda `SUCCEEDED_PARTIAL`.
- `REVIEW` semântico não bloqueia `DRAFT`; somente hard gates objetivos, schema, factualidade, cenas e variedade decidem elegibilidade e entrega.

Devem ser detectáveis campos obrigatórios ausentes, relações/IDs inválidos, quantidade incorreta, claims sem suporte ou contraditos, CTAs ausentes ou com claim factual inválido, quantidade de cenas válida para o formato, duplicatas exatas/normalizadas, duplicata por hash de estrutura e concentração objetiva. Persuasão e clareza da CTA são avaliadas semanticamente, sem reclassificar factualidade. O Judge cobre somente coerência com Produto, estilo/configuração declarados do creator e plataforma; não reavalia factualidade e não transforma preferência subjetiva em bloqueio.

O `BriefValidationReport` registra somente os resultados objetivos (`factualStatus`, `structuralStatus`, `platformStatus`, `varietyStatus`, `issues`) e a decisão objetiva `PASS|REPAIR|REJECT`, com diagnósticos sanitizados por bullet separados da auditoria semântica. O diagnóstico por bullet contém somente índice, códigos/flags allowlisted, contagens e partes de claim allowlisted; nunca texto bruto, fatos, prompt ou resposta do provider. Sua chave canônica é `briefId`, derivada de `contentId + briefVersionId`. A auditoria semântica registra `contentId`, cinco partes, índice de bullet quando a parte for `development`, criterion e reason allowlisted; seus status são apenas `PASS|REVIEW`. Falha ou schema inválido no Judge/repair preserva a parte original e não cria faltante.

O sistema não cria conteúdo irrelevante apenas para atingir a quantidade. Item objetivamente não publicável após a composição conta como F: sem item publicável, F acima de `PARTIAL_FAILURE_CAP` ou conjunto incapaz de fechar com consistência, o job fica `FAILED`; dentro do teto, o job conclui `SUCCEEDED_PARTIAL` e o creator completa somente os F faltantes com `Gerar faltantes`.
### B-003-10 — Persistência, idempotência e observabilidade

No sucesso pleno ou parcial (`SUCCEEDED`/`SUCCEEDED_PARTIAL`), uma transação curta fenced persiste Strategy, Plan, Opportunities, os Contents `DRAFT` entregues, BriefVersions, relatórios de validação, sinais estruturados da geração, proveniência, `IntelligenceRun` e confirmação do uso reservado pelos D itens entregues, liberando N−D. `expectedCount = deliveredCount + failedCount`. A persistência não cria duas Strategies `ACTIVE`, dois Plans equivalentes ou Briefings duplicados para o mesmo job. Em `FAILED`, o `IntelligenceRun` conserva diagnóstico sanitizado sem publicar conteúdo.

- `IntelligenceRun` registra, por capability e batch, task lógica, tier, provider/modelo lógico, versão ou hash das instruções, duração, tamanhos de request/context/response, tentativa, retry, decisão de validação, quantidade de repair e código de erro. Para cada tentativa efetiva, a allowlist pode registrar usage normalizado e custo reportado/calculado com completude; ausência de `usage.cost` permanece ausente, nunca `USD 0`. Não registra prompts completos, payload bruto, cookies, tokens ou segredos.

Cada ação intencional do creator gera uma `Idempotency-Key`; a chave é validada server-side com fingerprint do contexto autorizado. A mesma chave com o mesmo fingerprint retorna o mesmo job/resultado lógico; fingerprint divergente é rejeitado e não cria nova linha.

Retry técnico causado por reconnect, reentrada ou recuperação de worker usa o mesmo `job.id`, a mesma chave lógica e a mesma reserva do job. Repetir a mesma tentativa, inclusive após lease expirado, não duplica conteúdo, uso, Strategy ou Plan. Chamadas externas podem ser repetidas somente se o job perder o lease; o worker deve registrar essa repetição e impedir publicação pelo owner antigo.
### B-003-11 — Falha, retry explícito e cancelamento

Uma falha de provider, capability, validação, repair, Skill ou persistência marca o job como `FAILED` com código interno observável, capability/stage de origem e mensagem humana sanitizada. Erros tipados de schema, factualidade, variedade, repair, provider, lease e persistência não podem ser convertidos em um código genérico quando a causa for conhecida. O Product e seus fatos confirmados permanecem preservados; resultados intermediários não são mostrados como resultado final e a memória não é atualizada.

Cada tentativa possui deadline global configurável, menor que o lease efetivo ou protegido por heartbeat. O provider recebe `AbortSignal`; perda de fencing ou cancelamento seguro interrompe chamadas pendentes quando suportado. O worker não inicia novo trabalho externo depois de detectar que perdeu o lease.

`Tentar novamente` após `FAILED` ou `CANCELLED` cria um novo job com nova chave idempotente e nova reserva, preserva o job terminal anterior e reutiliza Product e fatos confirmados. Esse novo job segue a regra de um job ativo por usuário e não altera o histórico terminal anterior.

Falha ou cancelamento libera a reserva no mesmo mês UTC registrado na criação. Quando cancelamento seguro for oferecido, ele não apaga Product, sinais históricos já persistidos por execuções anteriores ou evidência diagnóstica; a tentativa cancelada não adiciona novos sinais de memória.

### B-003-12 — Indicador global, stages e navegação

Enquanto o job estiver `QUEUED` ou `RUNNING`, o App Shell mostra o nome do Product e o stage real, imediatamente abaixo da toolbar desktop/tablet ou do header contextual mobile. O indicador não bloqueia Home, Produtos, Estúdio, Agenda ou Configurações.

| Stage | Mensagem humana em `pt-BR` |
| --- | --- |
| `UNDERSTANDING_PRODUCT` | `Entendendo o produto...` |
| `MAPPING_COMMERCIAL_OPPORTUNITIES` | `Mapeando oportunidades` |
| `BUILDING_STRATEGY` | `Definindo a melhor estratégia` |
| `BUILDING_CONTENT_PLAN` | `Organizando as oportunidades de conteúdo...` |
| `GENERATING_BRIEFS` | `Preparando os Briefings` |
| `FINALIZING` | `Finalizando...` |

Stages são persistidos antes do trabalho correspondente. A UI não apresenta subetapas internas como concluídas quando foram executadas dentro de uma chamada agrupada.

Em `SUCCEEDED`, mostra que o Product está pronto e oferece `Revisar conteúdos`. Em `SUCCEEDED_PARTIAL`, mostra "D de N conteúdos prontos", informa somente os F faltantes com motivo sanitizado por item e oferece `Gerar faltantes` além de `Revisar conteúdos`; Contents não publicados permanecem invisíveis. Este slice não oferece reanálise do mesmo Product `READY`; nova geração/recorrência do Product pertence ao Slice 008. Em `FAILED`, mostra falha recuperável e oferece `Tentar novamente`.

Se o creator estiver no contexto que iniciou a análise, a interface pode encaminhar naturalmente aos Briefings após o sucesso. Se estiver em outra superfície, não deve redirecioná-lo à força; a ação no indicador abre o Product diretamente na área de Conteúdos.

### B-003-13 — Reentrada, readiness e lista de Produtos

Ao navegar, fechar a aba ou reabrir a aplicação, o estado é recuperado a partir do backend. A readiness operacional é derivada sem novo enum monolítico:

- Product manual recém-criado, antes de qualquer job: `PENDING`;
- job `QUEUED` ou `RUNNING`: `ANALYZING`;
- job `SUCCEEDED` com Strategy, Plan e N Contents `DRAFT`: `READY`;
- job `SUCCEEDED_PARTIAL` com Strategy, Plan e D Contents `DRAFT`: `READY` (com ação adicional `Gerar faltantes`, ADR-021);
- último job sem sucesso (`FAILED` ou `CANCELLED` sem resultado final): `FAILED`.

Essa readiness alimenta os badges dos Product cards e o filtro `Pendente` na lista de Produtos. Product `READY` não oferece reanálise neste slice. Ações de resultado bem-sucedido: após `SUCCEEDED` pleno, `Revisar conteúdos`; após `SUCCEEDED_PARTIAL`, `Revisar conteúdos` + `Gerar faltantes` (ADR-021). Nova geração/recorrência arbitrária pertence ao Slice 008.

Um Product em `QUEUED`/`RUNNING` aparece como `Pendente`/`Analisando`; após sucesso pleno ou parcial aparece como pronto para revisão; após falha ou cancelamento preserva o Product e oferece recuperação. Nenhum resultado parcial é apresentado como Strategy ou Briefing concluído antes de `SUCCEEDED` ou `SUCCEEDED_PARTIAL`. Não existe tela permanente de análise nem dependência de memória local do frontend para recuperar o job.
### B-003-14 — Exclusão Big Bang e arquivamento do Product

`DELETE /api/products/:id` executa exclusão Big Bang quando o Product pertence ao Tenant da sessão. A operação ocorre em uma única transação interativa, sempre com escopo `(tenantId, productId)`, e remove o Product e todo o grafo relacionado:

```text
ProductImportAttempt relacionado
CommerceIntelligenceJob
GenerationUsageReservation
IntelligenceRun
ProductUnderstanding
ProductStrategy
ContentPlan
ContentOpportunity
Content
ContentBriefVersion
BriefValidationReport
ProductMemorySnapshot
Product
```

Antes de apagar `ContentBriefVersion`, a transação nulifica `Content.currentBriefVersionId` e `Content.approvedBriefVersionId`, quebrando o ciclo `Content ↔ ContentBriefVersion`. A ordem de exclusão respeita as FKs e qualquer falha causa rollback integral. Jobs em execução não são bloqueados por regra de produto; a implementação deve preservar a integridade transacional e o fencing do worker.

Em sucesso, a API retorna `204 No Content`. Product inexistente ou fora do Tenant retorna `404 PRODUCT-NOT-FOUND`, sem revelar existência. Falha transacional retorna erro sanitizado e não confirma exclusão parcial.

`Arquivar produto` continua preservando Product, fatos, resultados e memória. Ao arquivar um Product ativo autorizado, o sistema decrementa `activeProductsUsed` atomicamente com a mudança de lifecycle; repetir o arquivamento não decrementa novamente. Arquivamento não cria job, não altera Strategy e não remove registros.
## 6. Regras e invariantes

### RI-003-01 — Product confirmado é pré-condição

Somente Product confirmado, com fatos válidos e `targetContentCount` resolvida, pode criar o job. O Product salvo manualmente no Slice 002 não inicia este fluxo por efeito colateral.

### RI-003-02 — Tenant e usuário autorizados

Toda leitura, mutação, job, resultado e uso deve ser escopado ao Tenant resolvido pela sessão server-side e ao usuário autorizado. IDs de Tenant enviados pelo cliente nunca são autoridade.

### RI-003-03 — Um job ativo

Para cada usuário, pode existir no máximo um `CommerceIntelligenceJob` em `QUEUED` ou `RUNNING`. A proteção é concreta no servidor: a transação de `Analisar produto` adquire um advisory lock de transação do PostgreSQL pelo usuário (`pg_advisory_xact_lock` por `tenantId`+`userId`) — além do lock tenant-wide da quota (RI-003-05) — antes de qualquer leitura, e a checagem de job ativo, a agregação de capacidade e a criação da reserva ocorrem após a aquisição — requests concorrentes com chaves distintas são serializadas e apenas uma cria job. O lease do worker impede execução duplicada do mesmo job; o estado visual desabilitado do botão não é proteção.

### RI-003-04 — Quantidade resolvida e exata
`targetContentCount` é um inteiro validado entre `1` e `10` e permanece estável durante o job. Referências históricas ou de migration que ainda usem `1–30` não ampliam o contrato ativo nem a quota. Um job `SUCCEEDED` materializa exatamente essa quantidade de Contents `DRAFT`. Um `SUCCEEDED_PARTIAL` materializa somente os D Contents `DRAFT`, dentro do teto de falhas do ADR-021.

### RI-003-05 — Entitlement transacional, active_products e mês UTC

O limite de `active_products` é verificado no cadastro manual e nas transições de lifecycle do Product (`GEN-PRODUCT-CAPACITY`); o Product chega à análise já `ACTIVE` e não consome unidade nova em `Analisar produto` nem em retries. Antes de criar o job, o sistema verifica em transação a capacidade de `generated_contents_month` e a regra de um job ativo por usuário sob dois advisory locks de transação: um **tenant-wide da quota** (`pg_advisory_xact_lock` por `tenantId`), que serializa o par capacidade→reserva (aggregate + create) entre todos os usuários do Tenant — único mecanismo que impede dois usuários distintos de consumir a mesma capacidade — e um **por usuário** (`tenantId`+`userId`), que protege a regra de job ativo e o replay de idempotência. Ambos são adquiridos no início da transação, em ordem fixa (Tenant → usuário), e todo caminho de criação de reserva passa por eles; se qualquer verificação falhar, não cria job e não cria reserva. A reserva é criada na mesma transação do job e registra o mês UTC da criação; sucesso confirma o uso pelos Contents persistidos no mesmo período (`SUCCEEDED_PARTIAL` confirma somente os entregues e libera o restante — ADR-021); falha ou cancelamento liberam a reserva no período de origem; retry técnico não cria nova reserva.

### RI-003-06 — Pipeline e estado determinísticos

A LLM não decide status, stage, quantidade, quota, IDs, versões, persistência, retry, autorização ou sucesso do job. Essas regras pertencem à aplicação e ao domínio.

### RI-003-07 — Uma Strategy ativa e sem reanálise local

A primeira execução cria uma `ProductStrategy` v1 `ACTIVE` com o conjunto mínimo definido em B-003-04. Para o mesmo Product e contexto compatível, não existem duas Strategies `ACTIVE`; a proveniência da Strategy usada pelo Plan e pelos Contents é preservada. Product `READY` não inicia novo job neste slice: a liberação da trava global após `SUCCEEDED` não é autorização para reanalisar o mesmo Product. Nova geração, reuso de Strategy com memória e regras `STALE`/`SUPERSEDED` pertencem ao Slice 008.
### RI-003-08 — Content inicial revisável

Todo Content final pertence ao Product e ao Plan, começa em `DRAFT`, possui uma `ContentBriefVersion` v1 imutável e mantém `approvedBriefVersionId` ausente. O slice não aprova, descarta, edita ou regenera Contents.

### RI-003-09 — Fato separado de inferência

Claims factuais precisam ser suportados pelos fatos confirmados. Texto de origem externa e saída de provider são dados não confiáveis; nenhuma confiança textual substitui validação estrutural e factual.

### RI-003-10 — Conjunto consistente

O sistema não publica Strategy, Plan ou Briefings parciais como resultado final **sem declaração**: ou o conjunto inicial fecha completo e o job é `SUCCEEDED` com N Contents `DRAFT`, ou fecha parcial declarado como `SUCCEEDED_PARTIAL` com D Contents `DRAFT` e variedade revalidada (ADR-021), ou o job permanece em processamento/falha de forma recuperável.

### RI-003-11 — Repair limitado

Repair recebe somente partes `REVIEW`, preserva partes `PASS` e ocorre uma vez por parte. Falha, schema inválido ou repair inaplicável preserva a parte original; após a composição, hard gates determinam se o item é entregue em `DRAFT` ou entra no parcial/falha objetiva do ADR-021. Nunca preenche a quantidade com Briefing inválido ou irrelevante.

### RI-003-12 — Proveniência e observabilidade

- A execução registra internamente job, Product, Strategy quando disponível, versão da engine, versão da Skill, tarefas/modelos/providers por capability, retries, falhas de validação, usage, custo e latência conforme disponível. A UI recebe somente a projeção allowlisted do Slice 010: `jobId`, status, timestamps, usage agregado e custo agregado; nenhum metadata bruto, provider, modelo, tier, prompt, log ou payload é exposto.

### RI-003-13 — Segurança contra prompt injection

Conteúdo de página, descrição do seller e qualquer texto externo são separados das instruções do sistema e do contexto confiável. Nenhum texto externo pode alterar regras de job, autorização, quota, persistência ou contrato.

### RI-003-14 — Chamadas externas fora de transação

Chamadas a provider ocorrem fora de transações longas. Transações curtas protegem criação/reserva e finalização/reconciliação.

### RI-003-15 — Separação de estados

Estados do Job, readiness do Product e estado de revisão do Content são dimensões distintas. `SUCCEEDED` não significa `APPROVED`; todo Content entregue nesta pipeline começa em `DRAFT`.

### RI-003-16 — Retry técnico versus retry explícito

Reconnect, reentrada e reclaim de worker usam o mesmo `job.id`, a mesma chave lógica e a mesma reserva. `Tentar novamente` após `FAILED` ou `CANCELLED` cria novo job, nova chave e nova reserva; o job terminal anterior permanece preservado e o Product/fatos são reutilizados. `Gerar faltantes` após `SUCCEEDED_PARTIAL` cria novo job com reserva apenas da quantidade realmente faltante (ADR-021).

### RI-003-17 — Memória inicial e sinais

O snapshot de entrada da primeira geração é vazio e não consulta histórico nem recorrência. Job `SUCCEEDED` ou `SUCCEEDED_PARTIAL` persiste os sinais estruturados de todo Content `DRAFT` entregue; itens não entregues não sinalizam. Falha ou cancelamento não atualizam a memória.
### RI-003-18 — Exclusão Big Bang e chave de relatório

`DELETE` de Product é tenant-scoped e transacional. Em sucesso, nenhum Product, Job, Run, reserva, Understanding, Strategy, Plan, Opportunity, Content, Brief Version, relatório, snapshot ou import attempt relacionado permanece. A operação quebra previamente as referências de versão atual/aprovada do Content. O `BriefValidationReport` usa `briefId` como nome canônico, derivado de `contentId + briefVersionId`, até sua exclusão.
### RI-003-19 — Projeção da ação de geração

Todo Product `ACTIVE` retornado em leitura autenticada inclui `generationAction`, objeto server-authoritative completo: `{ state: "AVAILABLE", reason: null, nextAction: null }`, `{ state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: "VIEW_ACTIVE_ANALYSIS" }` ou `{ state: "BLOCKED", reason: "GEN-CAPACITY", nextAction: "WAIT_FOR_CAPACITY" }`. `reason` e `nextAction` nunca são omitidos e o objeto nunca é `null`. Product `ARCHIVED` é `ArchivedProductView` e não serializa `generationAction`; não recebe novo código ou estado de bloqueio. Archive/reactivate retornam apenas `{ id, version }`; a UI recarrega o Product autenticado após o commit. A projeção é avaliada para o `tenantId` e `userId` da sessão, orienta apenas a UI e nunca autoriza a mutação; `POST /api/generations` revalida sessão, origem, escopo, job ativo e reserva na transação. A projeção não expõe plano, limite, uso, reserva, IDs ou dados de outro Tenant. `GEN-PRODUCT-CAPACITY` pertence à ativação de Product novo e não bloqueia a análise de Product já ativo.

### RI-003-20 — Degradação de projeção (`GEN-PROJECTION`)

`GEN-PROJECTION` é exclusivamente um código de **projeção** (leitura), nunca um status persistido, nunca um erro de mutação e nunca altera o registro do job. Ocorre quando um job terminal positivo não pode ser projetado com integridade. Gatilhos: (a) brief persistido fora do contrato (`projectBriefPayload` → causa interna `GEN-SCHEMA`); (b) scene set corrente presente e inválido — status diferente de `AVAILABLE` ou menos de 2 cenas válidas, mesmo critério de `scene_set_invalid` do engine (`projectScenes` → causa interna `GEN-SCHEMA`); ausência de scene set é legado anterior ao ADR-019 e projeta `scenes: null`, sem degradação; (c) terminal positivo sem conteúdos persistidos (viola exact-N / D>0, ADR-021). Nesses casos `GET /api/generations/[id]` e `/current` respondem envelope degradado fail-closed: preservam do persistido `id`, `productId`, `status`, `stage`, `targetContentCount`, `createdAt`, `startedAt`, `finishedAt` e `attempt` — o estado real nunca é mascarado — e degradam deliberadamente o que é **derivado**: `readiness: "FAILED"`, `error` com mensagem sanitizada fixa, `contents`, `strategy` e `plan` vazios. Como os três gatilhos só avaliam quando o job publica (`publish = SUCCEEDED|SUCCEEDED_PARTIAL`), `GEN-PROJECTION` implica status persistido positivo. Recuperação: `POST /retry` (partição `FAILED|CANCELLED`) responde `404` e a reanálise integral permanece proibida em Produto `READY` (B-003-13, `GEN-READY`) — para `SUCCEEDED` degradado **não existe recuperação self-service** (correção de dados, não reanálise); para `SUCCEEDED_PARTIAL` degradado, `POST /complete` continua disponível (a recuperação dos faltantes não depende da projeção de cenas/brief). O cliente distingue a situação por `code === "GEN-PROJECTION"` + `status` persistido e NÃO oferece `Tentar novamente`; `readiness: "FAILED"` aqui indica anomalia de dados persistida, nunca falha de execução. A distinção é explícita: `status` espelha o banco; `readiness`/`contents` são projeção e, sob `GEN-PROJECTION`, preferem conservadorismo a expor payload não confiável ou sucesso sem conteúdo. A leitura nunca falha por payload de dados (falha de infraestrutura continua propagando); nenhum payload bruto, diagnóstico interno ou dado de outro Tenant é exposto.

### RI-003-21 — Retenção mínima de histórico, versões e memória

Política de retenção vigente (Gate 4 item 1); os gatilhos e modalidades de remoção (archive/exclusão lógica/física) são decisão própria do item seguinte — aqui se define apenas **o que permanece retido e sob quais garantias**, enquanto o Product existir no Tenant.

- **Product History** (sem tabela própria: o histórico do Product é derivado de dados reais): cada tentativa permanece — `CommerceIntelligenceJob` terminal por tentativa (retry técnico reusa o mesmo `job.id` e não multiplica linhas; retry explícito cria novo job preservando o terminal anterior, RI-003-16), `IntelligenceRun` idempotente por job (inclusive `FAILED`, com assinatura residual — B-003-10; o retry técnico no mesmo `job.id` atualiza o run existente com a assinatura da última tentativa, e o contador `attempt` do job preserva o número de tentativas) e `GenerationUsageReservation` reconciliada. Nenhum truncamento, agregação ou expiração do histórico enquanto o Product existir; a aba `Histórico` deriva dessas linhas, nunca de cópia separada.
- **Versões de conteúdo**: `ContentBriefVersion` é append-only e imutável (ADR-019) — `@@unique([tenantId, contentId, version])`, nenhuma versão é sobrescrita ou reescrita; os únicos campos mutáveis são os ponteiros `Content.currentBriefVersionId`/`approvedBriefVersionId`. `BriefValidationReport` (um por brief version, `briefId = contentId:briefVersionId`) e `ContentSceneSet` (um por brief version, ADR-019) são solidários à versão a que pertencem e retidos junto com ela.
- **Product Memory**: `ProductMemorySnapshot` é append-only — um snapshot novo por job de sucesso (`@@unique([tenantId, sourceJobId])`), com merge acumulativo deduplicado do anterior gravado em snapshot novo; snapshot anterior nunca é alterado (worker, fechamento transacional). Somente sucesso persiste sinais; falha/cancelamento não atualizam a memória (RI-003-17).
- **Liberação — dados versus capacidade** (distinção documental): quanto aos **dados retidos** (Jobs, Runs, reservas, versões de brief, reports, scene sets e snapshots de memória), nesta fatia o único gatilho de liberação é a exclusão do Product (`DELETE` transacional Big Bang, RI-003-18); nenhuma purga automática, TTL ou política por idade é introduzida, e o arquivamento vigente não remove nem purga nenhum dado (arquivar não apaga dados). Independente disso, o arquivamento **libera capacidade de Product ativo**: `transitionTenantProduct`/`archiveTenantProduct` decrementa `activeProductsUsed` em `TenantEntitlement` (service.ts), devolvendo a vaga de Product ativo sem qualquer efeito sobre os dados retidos. Modalidades alternativas de remoção/retenção de dados permanecem para decisão no item seguinte do Gate 4.

### RI-003-22 — Modalidade de remoção: archive operacional + exclusão física, sem exclusão lógica

Decisão canônica (Gate 4 item 2), com base na política de retenção RI-003-21. O sistema mantém **duas modalidades, com papéis distintos e não sobrepostos**:

- **Archive é estado operacional, não modalidade de remoção.** `Product.lifecycle` (`ACTIVE` ↔ `ARCHIVED`, reversível via `transitionTenantProduct`) esconde o Product do uso corrente, preserva integralmente os dados retidos (RI-003-21) e libera apenas capacidade (`activeProductsUsed`). Archive responde à pergunta "este Product está em uso?" — nunca à pergunta "estes dados devem deixar de existir?".
- **Exclusão física é a única modalidade de remoção**: o `DELETE` transacional Big Bang do Product (RI-003-18), iniciado pelo usuário, é o único gatilho que remove os dados retidos — em cascata e atomicamente, sem resíduo.
- **Exclusão lógica (soft delete) não é introduzida.** Um marcador de remoção (`deletedAt` ou equivalente) duplicaria o papel que o archive já cumpre (ocultar sem apagar), exigiria filtragem em todo caminho de leitura e criaria uma terceira semi-remoção com semântica ambígua — sem que nenhum requisito (PRD, comportamentos B-003, AC) peça retenção oculta pós-exclusão. A exclusão solicitada pelo usuário é física; a ocultação solicitada pelo usuário é archive reversível.

Nenhuma alteração de código é introduzida por esta decisão: ela registra como canônica a arquitetura vigente (archive + DELETE Big Bang). A ADR formal fica para o item próprio do Gate 4.

### RI-003-23 — Rastreabilidade preservada sob retenção obrigatória

Enquanto a retenção for obrigatória (Product existente, RI-003-21; remoção apenas pela exclusão física deliberada, RI-003-22), a rastreabilidade do histórico, das versões e da memória é preservada **por construção**, sem rotinas de limpeza:

- **Escrita append-only**: `ContentBriefVersion`, `BriefValidationReport`, `ProductMemorySnapshot`, `ProductUnderstanding`, `ProductStrategy`, `ContentPlan` e `ContentOpportunity` são somente criados, e `ContentSceneSet` é persistido por create/upsert idempotente — o upsert (chave `tenantId`+`briefVersionId`, ADR-019) tem `update` vazio, de modo que a linha existente não é tocada e o payload nunca é sobrescrito em nenhum caminho de execução. As únicas operações de deleção sobre dados de geração no código de produção são as da transação Big Bang do Product (RI-003-18); nenhuma purga, TTL ou exclusão fora dela existe.
- **Ponteiros movem, versões permanecem**: os únicos updates em linhas retidas são os ponteiros `Content.currentBriefVersionId`/`approvedBriefVersionId` — movê-los nunca apaga a versão anterior, que continua consultável com seus reports e scene sets solidários.
- **Runs com fencing**: o `IntelligenceRun` é idempotente por job (ADR-021) — cada tentativa só grava com o fence vigente (`leaseOwnerId`/`attempt`), de modo que uma tentativa antiga nunca sobrescreve o run atual; o contador `attempt` do job preserva o número de tentativas e o retry explícito cria novo job com novo run, mantendo o terminal anterior intacto (RI-003-16).
- **Memória nunca reescrita**: o merge acumulativo grava sempre um snapshot novo; snapshots anteriores permanecem, permitindo reconstruir a evolução dos sinais por job de sucesso.
- **Fim de rastreabilidade único e atômico**: a única forma de encerrar a rastreabilidade é a exclusão física do Product, que remove todas as linhas dentro da mesma transação — sem janela de estado parcialmente removido.

Nenhuma alteração de código é introduzida por este requisito: ele registra como contrato os invariantes já garantidos pela implementação.

### RI-003-24 — Integridade referencial após remoção e arquivamento

Verificação canônica (Gate 4 item 4) das relações e referências de Product Memory, History e Content nas duas transições de ciclo de vida:

- **FKs restritivas**: o schema não declara `onDelete` — toda chave estrangeira das tabelas de geração é restritiva por padrão, de modo que nenhuma linha filho pode sobreviver ao pai fora da ordem planejada. A ordem dentro da transação Big Bang (`deleteTenantProduct`) é a garantia e já remove todos os filhos antes dos pais: `productImportAttempt` → ponteiros `Content.currentBriefVersionId`/`approvedBriefVersionId` anulados (quebra o ciclo `Content` ↔ `ContentBriefVersion`) → `ContentSceneSet` → `BriefValidationReport` → `ContentBriefVersion` → `Content` → `ContentOpportunity` → `ContentPlan` → `ProductMemorySnapshot` (FK `sourceJobId`) → `GenerationUsageReservation` → `IntelligenceRun` → `ProductUnderstanding` → `ProductStrategy` → `CommerceIntelligenceJob` → `Product` por último. Tudo na mesma transação: sem janela de referência pendente.
- **Referências de memória**: `ProductMemorySnapshot` referencia `Product` e `sourceJob` (`CommerceIntelligenceJob`); ambos são removidos na mesma transação que o snapshot — não existe remoção que deixe snapshot órfão. Geração e memória existem apenas para Product `ACTIVE`, garantida em **dois pontos serializados**: no início (`startCommerceIntelligence` rejeita `lifecycle !== "ACTIVE"`) e na execução — `processGeneration` revalida o lifecycle ao carregar o Product (fail-fast que evita gastar provider com Product arquivado; o ponto autoritativo é a finalização) e, novamente, **dentro da transação de finalização com lock de linha** (`SELECT … FOR UPDATE` no Product): a leitura serializa com o `UPDATE` de `transitionTenantProduct`/`archiveTenantProduct` — ou o arquivamento commita antes e a finalização vê `ARCHIVED` (rollback de strategy, plan, contents, briefs, scene sets e memória; job `FAILED` com `GEN-PRODUCT` no caminho de falha de execução, B-003-11; reserva liberada), ou o arquivamento espera o commit da finalização — não existe janela em que o resultado seja persistido para Product `ARCHIVED`, e nenhum snapshot de memória surge de Product não ativo.
- **Arquivamento**: `archiveTenantProduct`/`transitionTenantProduct` alteram apenas `lifecycle`, `version` e `activeProductsUsed` — nenhuma referência de memória, histórico, versão ou conteúdo é tocada; o estado é integralmente reversível na reativação. Product `ARCHIVED` não inicia nova geração e um job iniciado antes do arquivamento é interrompido na finalização (item anterior) — a reativação restaura o Product, sem recriar dados removidos.
- **Pós-remoção**: leituras de memória, histórico e conteúdo são escopadas por `tenantId`+`productId`; com o Product removido atomicamente junto com todas as dependências, não existe caminho de leitura que atravesse referência inexistente.

Nenhuma alteração de código é introduzida por este requisito: a integridade verificada já é garantida pelas FKs restritivas e pela ordem transacional vigentes.


## 7. Validações e erros

| Código | Condição | Comportamento esperado |
| --- | --- | --- |
| `GEN-COUNT-REQUIRED` | `targetContentCount` ausente | Rejeitar antes do job, explicar que a quantidade precisa ser resolvida e não criar reserva/job. |
| `GEN-COUNT-RANGE` | Quantidade não inteira ou fora de `1–10` | Rejeitar server-side, manter a entrada corrigível e não criar reserva/job. |
| `GEN-CAPACITY` | Entitlement mensal sem capacidade para a quantidade solicitada | Rejeitar com mensagem acionável, sem criar job nem consumo confirmado. |
| `GEN-PRODUCT-CAPACITY` | Limite transacional de `active_products` atingido ao ativar Product novo | Rejeitar a operação sem criar Product, job ou reserva mensal e explicar que o limite de Products ativos foi atingido. |
| `GEN-ACTIVE` | Usuário possui job `QUEUED`/`RUNNING` | Bloquear nova análise, manter `Analisar produto` visível e explicar que existe análise em andamento. |
| `GEN-AUTH` | Sessão ausente ou Product fora do Tenant | Negar acesso com erro sanitizado; não revelar existência ou dados de outro Tenant. |
| `PRODUCT-NOT-FOUND` | Product inexistente ou fora do Tenant no DELETE | Retornar `404` sanitizado, sem revelar existência ou dados de outro Tenant. |
| `DELETE-FAILED` | Falha durante a exclusão Big Bang | Fazer rollback integral da transação, não publicar exclusão parcial e retornar erro sanitizado. |
| `GEN-TECHNICAL-RETRY` | Reconnect, reentrada ou worker após lease expirado | Reutilizar o mesmo `job.id`, chave e reserva; reclaim aplicar tentativa/backoff/limite sem duplicar resultado. |
| `GEN-USER-RETRY` | `Tentar novamente` após `FAILED`/`CANCELLED` | Criar novo job, chave idempotente e reserva; preservar o job terminal e reutilizar Product/fatos. |
| `GEN-SKILL` | Skill default ausente, inválida ou sem versão | Falhar de modo recuperável antes de publicar resultado; preservar Product e registrar causa interna. |
| `GEN-PROVIDER` | Provider indisponível, timeout ou resposta não utilizável | Marcar falha recuperável, preservar contexto confirmado e não publicar o item. |
| `GEN-SCHEMA` | Saída não obedece schema canônico | Falhar fechado; schema inválido nunca publica. Dentro do teto, o item conta como faltante em `SUCCEEDED_PARTIAL`; fora dele reprova o job. |
| `GEN-FACT` | Claim `UNSUPPORTED` ou `CONTRADICTED` | Remover/corrigir o não suportado; rejeitar o contradito e enviar causa ao repair; item sem hard gate factual aprovado nunca publica. |
| `GEN-VARIETY` | Duplicata normalizada ou concentração estrutural indevida | Rejeitar o item/conjunto e acionar repair com as dimensões repetidas; sem Variety Gate final válido, o item não publica. No fechamento parcial, revalidar o subconjunto com `ceil(D/K)` (ADR-021). |
| `GEN-REPAIR-EXHAUSTED` | Não aplicável ao judge semântico | O repair semântico ocorre uma vez por parte `REVIEW`; falha preserva o original. Falha objetiva após a composição segue ADR-021. |
| `GEN-PERSISTENCE` | Falha ao finalizar resultado | Reconciliar a reserva no mês UTC de origem, não expor resultado incompleto e permitir retry técnico idempotente. |
| `GEN-PROJECTION` | Terminal positivo não projetável com integridade: brief inválido, scene set corrente presente e inválido (`!= AVAILABLE` ou < 2 cenas) ou sem conteúdos (RI-003-20) | Degradar a leitura fail-closed preservando o estado persistido (`status`/`stage`/contagens reais), com `readiness: FAILED` e sem expor payload; nunca alterar o registro nem mascarar o status. Sem `Tentar novamente`: `/retry` responde `404` (status persistido positivo fora da partição); em `SUCCEEDED_PARTIAL`, `/complete` segue disponível; o cliente não oferece `Tentar novamente` sob `GEN-PROJECTION` (RI-003-20). |
| `GEN-CANCELLED` | Cancelamento seguro em `QUEUED`/`RUNNING` | Marcar `CANCELLED`, liberar a reserva no mês UTC de origem, preservar Product e não publicar resultado parcial. |
| `GEN-LEASE-EXPIRED` | Lease expirado sem conclusão | Reclaim, incremento de tentativa, backoff e novo lease dentro do limite; ao esgotar, `FAILED` e reconciliação única da reserva. |
| `GEN-MEMORY` | Falha/cancelamento ou sucesso da geração | Não atualizar memória em falha/cancelamento; em sucesso persistir sinais estruturados da geração para uso futuro. |
| `GEN-REENTRY` | Usuário retorna após navegação/fechamento | Consultar backend e restaurar o indicador e a ação correspondente ao estado real. |

Erros exibidos ao creator devem usar linguagem humana em `pt-BR`, preservar valores e contexto quando houver entrada editável, não depender somente de cor e não revelar secrets, tokens, payload bruto, prompts ou dados de outro Tenant.

## 8. Estados de UX

| Estado | Representação e comportamento |
| --- | --- |
| `idle` | Product manual recém-criado e sem job: readiness `PENDING`; `Analisar produto` disponível quando não houver job ativo e houver capacidade. |
| `queued` | Job `QUEUED`: readiness `ANALYZING`; indicador informa que a solicitação foi recebida e não apresenta Content parcial. |
| `running` | Job `RUNNING`: readiness `ANALYZING`; indicador mostra Product e stage real; aplicação continua utilizável sem percentual, ETA ou Briefing parcial. |
| `succeeded` | Job `SUCCEEDED` com Strategy, Plan e N Contents `DRAFT`: readiness `READY`; indicador oferece `Revisar conteúdos`. |
| `succeeded-partial` | Job `SUCCEEDED_PARTIAL` com D de N Contents `DRAFT`: readiness `READY`; indicador mostra "D de N prontos", motivo sanitizado por item faltante e oferece `Gerar faltantes` além de `Revisar conteúdos` (ADR-021). |
| `failed` | Último job `FAILED` sem resultado final: readiness `FAILED`; indicador apresenta erro sanitizado, preserva Product/fatos e oferece `Tentar novamente`. |
| `cancelled` | Último job `CANCELLED` sem resultado final: readiness `FAILED`; cancelamento confirmado, sem resultado parcial, com possibilidade de nova tentativa. |
| `blocked` | `Analisar produto` permanece visível porém desabilitado quando `generationAction.state` é `BLOCKED`; a UI apresenta explicação e próxima ação a partir do par canônico `reason`/`nextAction`. |
| `reentry` | Ao abrir/recarregar, o App Shell e a tela do Product recarregam a projeção do servidor; local storage não é fonte de verdade. |

Requisitos de responsividade e acessibilidade:

- `pt-BR` como locale da interface;
- desktop (`≥1200px`): indicador em linha compacta abaixo da toolbar;
- tablet (`768–1199px`): mesma função no shell com texto resumido quando necessário;
- mobile (`<768px`): indicador abaixo do header contextual, sem cobrir drawer ou área útil;
- mobile preserva a capacidade completa de acompanhar e recuperar geração;
- ações possuem alvo mínimo de `44×44px`, labels persistentes, foco-visible, ordem de foco coerente e feedback que não depende apenas de cor;
- loading mantém rótulo/atividade compreensível, `aria-busy` quando aplicável e não usa spinner isolado;
- animações respeitam `prefers-reduced-motion`;
- erro e estado de geração nunca ficam escondidos somente em disclosure;
- conteúdo principal é sólido; glass, quando usado, fica restrito ao shell/toolbar/sheet conforme `DESIGN.md`.

## 9. Segurança e autorização

- A criação (`Analisar produto`), consulta, retry e eventual cancelamento exigem sessão autenticada.
- O Product, Job, Strategy, Plan, Contents, BriefVersions, runs e Entitlements são carregados por escopo do Tenant resolvido server-side.
- O cliente não escolhe `tenantId`, `userId`, plano, período, limite, provider, tier, Strategy ativa ou versão de Skill.
- A regra de um job ativo é enforced server-side e protegida contra corrida entre requests.
- Para mutações baseadas em cookie, a proteção contra CSRF é obrigatória; a presença do cookie não é prova suficiente de intenção.
- A reserva de capacidade acontece antes de enfileirar e é reconciliada em sucesso, falha e cancelamento no mês UTC de origem.
- Fatos confirmados e contexto do Product são enviados somente às capabilities autorizadas e necessárias.
- Conteúdo de página, seller e provider é tratado como entrada não confiável e separado de instruções confiáveis.
- Segredos, cookies, tokens, prompts completos e payloads brutos de provider não são persistidos ou registrados por padrão.
- Erros públicos são sanitizados; códigos internos permanecem para diagnóstico operacional.
- Chamadas externas ficam fora de transações longas; o domínio não acessa Prisma, provider ou fila diretamente.

## Etapa 0 documental — gates de aprovação e critérios verificáveis

1. **Gate de autoridade:** esta SPEC referencia explicitamente o ADR-033 e mantém o ADR-029 como baseline integral até relatório A/B aprovado; nenhuma chamada, tier, cena, gate, repair ou regra do `ROUTER_MAP` é removida ou reclassificada antes disso.
2. **Gate de contrato:** `PlatformSkill` contém o Creative System declarativo/versionado (`CreativePrimitive`, `CreativeRecipe`, compatibilidade e `CreativeBlueprint`) com `load → validate → freeze → expose`, sem domínio, serviço, agente, workflow ou repositório separado.
3. **Gate fail-closed:** schema, referências, compatibilidade e elegibilidade incompatíveis rejeitam sem fallback criativo, reescrita silenciosa ou fabricação; códigos `GEN-CS-*` são estáveis e versionados.
4. **Gate de persistência futura:** o Blueprint, quando autorizado pelo cutover, pertence a `ContentOpportunity.creativeDirection`, sem aggregate paralelo; contratos v1 históricos permanecem legíveis e não são reescritos ou promovidos automaticamente.
5. **Gate de contexto:** o catálogo literal permanece fora do prompt normal dos caminhos novos. Um contract test executável deve falhar se qualquer texto literal de hook/CTA atravessar o contexto do caminho Blueprint-driven; o caminho ADR-029 atual, inclusive `selectBriefPatterns`, permanece explicitamente como exceção até cutover aprovado. Qualquer experimento de exemplos precisa de harness, flag, dataset e resultado próprios.
6. **Gate de memória e entrega:** memória é versionada e aditiva; gates, repairs, Judge, `BriefValidationReport`, cenas separadas, `SUCCEEDED_PARTIAL`, idempotência, quota e factualidade permanecem preservados.
7. **Gate de cutover:** antes de qualquer ativação operacional, escrita de `creativeDirection`, remoção ou reclassificação, SPEC e PLAN de cutover devem estar aprovados e o protocolo A/B do ADR-033 deve fixar baseline ADR-029, candidato, inputs, Skill, modelo/tier, seed, thresholds e Golden Dataset; o relatório deve ser reproduzível, analisado por categoria e aprovado explicitamente pelo Software Architect, pelo Review e pelo usuário quando exigido pelo ADR.

Estes gates são documentais e verificáveis por inspeção de referências, contratos versionados, contract tests, relatório A/B e aprovação registrada. Não autorizam implementação ou escrita de `creativeDirection` nesta revisão.

## Acceptance Criteria
**Acceptance Criteria**

1. **WHEN** a ação explícita `Analisar produto` for acionada sobre um Product salvo com `targetContentCount` válida, **o sistema SHALL** validar o Product, reservar capacidade e criar atomicamente um `CommerceIntelligenceJob` `QUEUED`.
2. **IF** o Product não tiver `targetContentCount` inteira entre `1` e `10`, **o sistema SHALL** rejeitar a operação sem criar job ou reserva.

3. **IF** o Entitlement não tiver capacidade mensal para a quantidade solicitada, **o sistema SHALL** rejeitar a operação sem criar job ou consumo confirmado.
4. **WHEN** uma reserva de conteúdo for criada, **o sistema SHALL** registrar o mês UTC de sua criação para confirmar ou liberar a reserva nesse mesmo período de origem.
5. **IF** o limite de `active_products` for atingido ao ativar um Product novo, **o sistema SHALL** rejeitar atomicamente a ativação, a reserva mensal e a criação do job, sem persistir Product novo.
6. **IF** o Product já ativo e autorizado for usado para geração ou retry, **o sistema SHALL** não reservar novamente a unidade de `active_products`.
7. **IF** o usuário já tiver um job `QUEUED` ou `RUNNING`, **o sistema SHALL** impedir nova análise e explicar o bloqueio.
8. **WHILE** um job estiver `QUEUED` ou `RUNNING`, **o sistema SHALL** permitir o uso das demais superfícies autenticadas sem depender da aba iniciadora.
9. **WHEN** um worker reivindicar um job `QUEUED`, **o sistema SHALL** registrar lease/timeout e deadline da tentativa, alterar o estado para `RUNNING`, renovar o lease por heartbeat condicional e executar chamadas externas fora de transação longa; perda de fencing, cancelamento ou deadline deve abortar chamadas pendentes quando suportado.
10. **WHEN** um lease expirar sem conclusão, **o sistema SHALL** reclaimar o job, incrementar a tentativa, aplicar backoff e impedir novo trabalho externo pelo owner anterior.
11. **IF** o limite de tentativas do lease for atingido, **o sistema SHALL** marcar o job como `FAILED` e reconciliar sua reserva uma única vez.
12. **WHEN** a engine iniciar a primeira análise, **o sistema SHALL** usar um `ProductMemorySnapshot` vazio sem consultar histórico ou recorrência.
13. **WHEN** uma análise terminar com sucesso, **o sistema SHALL** persistir sinais estruturados da geração para uso futuro.
14. **IF** uma análise falhar ou for cancelada, **o sistema SHALL** preservar Product/fatos e não atualizar a memória com sinais dessa tentativa.
15. **WHEN** a pipeline concluir as capabilities com consistência, **o sistema SHALL** persistir `ProductStrategy` v1 `ACTIVE` antes do `ContentPlan`.
16. **WHEN** uma Strategy inicial for persistida, **o sistema SHALL** exigir `id`, `productId`, `version`, `status`, `primaryPositioning`, `audiences`, `opportunities`, `priorityBenefits`, `priorityObjections`, `priorityArguments`, `priorityAngles`, `communicationPrinciples`, `platformId` e `platformSkillVersion`.
17. **WHEN** um plano for criado, **o sistema SHALL** exigir `id`, `productId`, `strategyVersion`, `targetContentCount`, `platformId`, `platformSkillVersion` e oportunidades vinculadas à Strategy.
18. **WHEN** uma `ProductUnderstanding` for persistida, **o sistema SHALL** exigir `productId`, os arrays `coreUseCases`, `capabilities`, `functionalBenefits`, `emotionalBenefits`, `desiredOutcomes`, `purchaseTriggers`, `purchaseBarriers` e `evidenceRefs`, preservando `category` quando disponível e permitindo sua ausência sem evidência.
19. **WHEN** uma `CommercialOpportunity` for persistida, **o sistema SHALL** preservar `id`, público/situação, dor/desejo, capabilities, benefícios, outcome, objeção/prova, argumento, confiança interna e evidências, após validação do contrato canônico.
20. **WHEN** uma `ContentOpportunity` for persistida, **o sistema SHALL** exigir `id`, `commercialObjective`, `angle`, `coreMessage`, `hookMechanism` e `noveltyTargets`, mantendo `audience`, `pain`, `desire`, `objection`, `benefit`, `proof`, `narrativePattern`, `desiredViewerResponse` e `sourceOpportunityId` opcionais conforme evidência.
21. **WHEN** um job terminar em `SUCCEEDED`, **o sistema SHALL** persistir exatamente `targetContentCount` Contents `DRAFT` que passaram os hard gates finais. **WHEN** terminar em `SUCCEEDED_PARTIAL`, **o sistema SHALL** persistir somente os D Contents `DRAFT`, revalidar variedade com `ceil(D/K)`, registrar `expectedCount`/`deliveredCount`/`failedCount`, confirmar quota pelos D entregues e liberar o restante (ADR-021).
22. **WHEN** cada Content inicial for persistido, **o sistema SHALL** manter identidade, `productId`, `planId`, `opportunityId` quando aplicável, `currentBriefVersionId` e status `DRAFT`.
23. **WHEN** cada Content inicial for persistido, **o sistema SHALL** deixar `approvedBriefVersionId` ausente e criar uma `ContentBriefVersion` v1 imutável.
24. **WHEN** uma versão inicial de Briefing for persistida, **o sistema SHALL** exigir `angle`, `hook`, `script` e `cta`, além de `development` conforme o schema vigente, sem exigir `scenes` em `ContentBriefVersion`; **WHEN** houver cenas para a geração nova, **o sistema SHALL** persistir o `ContentSceneSet` separado conforme ADR-019. `structure`, `objective`, `targetAudience`, `pain`, `desire`, `objection`, `benefit` e `notes` permanecem opcionais.
25. **WHEN** uma capability baseada em LLM for executada, **o sistema SHALL** solicitar tarefa lógica ao Model Router conforme a tabela canônica do ADR-029, sem exigir uma chamada individual por briefing.
26. **WHEN** `targetContentCount` for maior que um batch, **o sistema SHALL** gerar Briefings em batches de 4–8 oportunidades, processando um batch por vez salvo limite explícito de concorrência.
27. **WHEN** schema validation, hard gates ou Variety Gate forem executados, **o sistema SHALL** tratá-los como determinísticos fora do Model Router e o `BriefValidationReport` SHALL registrar somente `PASS|REPAIR|REJECT` objetivo. Candidate objetivo reprovado SHALL seguir `Hard Gate Repair` limitado por `GENERATION_MAX_REPAIRS`; após hard gate `PASS`, `CONTENT_QUALITY_JUDGE` avalia hook, development, script, CTA e cenas em batches homogêneos e retorna somente `PASS|REVIEW` por parte. Uma parte `REVIEW` recebe no máximo um `Semantic Part Repair`, sem re-Judge; `GENERATION_MAX_REPAIRS` não se aplica ao repair semântico. `PASS`, falha ou schema inválido no repair preservam o original; não se cria faltante. `REVIEW` semântico não bloqueia `DRAFT`; somente os gates objetivos decidem elegibilidade e entrega. Falha objetiva segue ADR-021.
28. **WHEN** o Router resolver uma tarefa, **o sistema SHALL** registrar task, tier, provider/modelo lógico e versão ou hash das instruções, sem expor esses dados na UI.
29. **WHEN** um briefing contiver claim `UNSUPPORTED` ou `CONTRADICTED`, **o sistema SHALL** avaliá-lo contra fatos/evidências estruturados, remover/corrigir o não suportado, rejeitar o contradito e impedir resultado factual inválido.
30. **WHEN** o conjunto contiver duplicata exata/normalizada ou repetição estrutural indevida, **o sistema SHALL** aplicar `Hard Gate Repair` com as causas, preservar candidatos `PASS` e não inventar oportunidade irrelevante; sem Variety Gate válido, não poderá publicar.
31. **WHEN** uma etapa for iniciada, **o sistema SHALL** persistir o stage correspondente antes do trabalho; subetapas agrupadas não podem aparecer como stages concluídos individualmente.
32. **WHEN** o provider devolver saída de batch, **o sistema SHALL** atribuir server-side IDs, posições, versões e ownership, rejeitando colisões ou referências fora do job.
33. **WHEN** o job for finalizado, **o sistema SHALL** persistir metadata por capability/batch de duração, tamanhos, retries, validações, repairs e códigos internos, sem prompt completo ou payload bruto.
34. **WHILE** existir job `QUEUED` ou `RUNNING`, **o sistema SHALL** mostrar no App Shell o Product e o stage real em linguagem humana sem percentual, ETA, logs ou detalhes técnicos.
35. **WHEN** o job atingir `SUCCEEDED` ou `SUCCEEDED_PARTIAL`, **o sistema SHALL** derivar readiness `READY`, disponibilizar D Contents `DRAFT` e oferecer `Revisar conteúdos`; `SUCCEEDED_PARTIAL` SHALL oferecer `Gerar faltantes` somente para F itens não publicados (ADR-021).
38. **WHEN** o job atingir `SUCCEEDED` ou `SUCCEEDED_PARTIAL`, **o sistema SHALL** tornar Strategy e Plan consultáveis no contexto da página do Product sem exigir sua visualização como gate intermediário.
39. **WHEN** o último job terminar `FAILED` ou `CANCELLED` sem resultado final, **o sistema SHALL** derivar readiness `FAILED`, preservar Product/fatos e oferecer recuperação sem exibir Strategy parcial.
40. **WHEN** o Product for manual e ainda não possuir job, **o sistema SHALL** derivar readiness `PENDING`.
41. **WHEN** o creator navegar, fechar a aba e reabrir a aplicação, **o sistema SHALL** restaurar o estado consultando o backend e não redirecionar o creator à força.
42. **WHILE** o job não estiver `SUCCEEDED` ou `SUCCEEDED_PARTIAL`, **o sistema SHALL** impedir que resultados intermediários sejam apresentados como Strategy ou Briefings finais.
44. **WHEN** qualquer entidade do job for consultada ou alterada, **o sistema SHALL** aplicar o Tenant resolvido pela sessão server-side e negar outro Tenant.
45. **WHEN** a interface for usada em mobile, teclado ou tecnologia assistiva, **o sistema SHALL** manter acompanhamento e recuperação completos, foco-visible, labels associadas, feedback textual, CSRF nas mutações e alvos de interação de pelo menos `44×44px`.
46. **WHEN** o job estiver `QUEUED` ou `RUNNING`, **o sistema SHALL** derivar readiness `ANALYZING`.
47. **WHEN** um Product estiver `READY` após `SUCCEEDED` ou `SUCCEEDED_PARTIAL`, **o sistema SHALL** oferecer `Revisar conteúdos` (e `Gerar faltantes` no parcial, ADR-021) e não criar reanálise para o mesmo Product; nova geração pertence ao Slice 008.
48. **WHEN** `DELETE` for solicitado para Product autorizado, **o sistema SHALL** apagar em uma única transação interativa e tenant-scoped o Product e todos os dados relacionados — Jobs, Runs, reservas, Understandings, Strategies, Plans, Opportunities, Contents, Brief Versions, Reports, Snapshots e Import Attempts relacionados — retornando `204` somente após o commit.
49. **WHEN** a transação de DELETE precisar apagar Brief Versions, **o sistema SHALL** nulificar antes `Content.currentBriefVersionId` e `Content.approvedBriefVersionId`, respeitando o ciclo `Content ↔ ContentBriefVersion`; qualquer falha SHALL causar rollback integral.
50. **IF** qualquer etapa da exclusão Big Bang falhar, **o sistema SHALL** retornar `500 DELETE-FAILED` sanitizado e preservar integralmente o Product e seus dados relacionados.
51. **WHEN** `DELETE` for solicitado para Product inexistente ou fora do Tenant, **o sistema SHALL** retornar `404 PRODUCT-NOT-FOUND` sem revelar existência.
52. **WHEN** `Arquivar produto` for acionado para Product ativo autorizado, **o sistema SHALL** preservar seus registros e decrementar `activeProductsUsed` atomicamente, sem decrementar novamente em repetição.
53. **WHEN** a lista de Produtos for exibida, **o sistema SHALL** usar a readiness para badges dos Product cards e para o filtro `Pendente`.
54. **WHEN** o creator iniciar uma ação intencional, **o sistema SHALL** gerar uma `Idempotency-Key`, validar seu fingerprint server-side e rejeitar fingerprint divergente sem criar nova linha.
55. **WHEN** um `BriefValidationReport` for persistido, **o sistema SHALL** identificar `briefId` pelo par estável `contentId + briefVersionId`.
56. **WHEN** o contexto de uma geração Blueprint-driven for montado, **o contract test SHALL** falhar se texto literal de hook/CTA do catálogo atravessar o contexto do provider; o caminho ADR-029/catalog atual, incluindo `selectBriefPatterns`, permanece exceção explícita até o cutover aprovado.
## Etapa 2 — critérios de aceite documentais

1. **WHEN** a etapa for implementada, **o sistema SHALL** preservar ADR-029 como baseline operacional e ADR-033 como arquitetura-alvo condicionada a eval/cutover aprovado.
2. **WHEN** o worker projetar fatos, **o payload SHALL** conter exatamente `productId`, `name`, `description`, `category`, `brand`, `priceAmount`, `priceCurrency`, `variants`, `images`, `seller` e `sourceUrl`.
3. **WHEN** `priceAmount` existir no payload do worker, **o valor SHALL** ser uma string serializada; valores nulos não SHALL ser convertidos em outro campo.
4. **WHEN** o worker montar o payload factual, **o sistema SHALL** preservar os valores de `variants`, `images`, `seller` e `sourceUrl` sem inventar ou normalizar campos.
5. **WHEN** o worker chamar a engine, **o payload factual SHALL NOT** conter `features`, `characteristics`, `commission`, `discount` ou `evidenceRefsCatalog`.
6. **WHEN** uma entrada direta usar `EngineInput.facts`, **o campo SHALL** permanecer um `Record<string, unknown>` genérico, sem prometer projeção, remoção ou transformação de `features`.
7. **WHEN** a engine construir evidências, **o sistema SHALL** derivar `evidenceRefsCatalog` depois de receber `EngineInput`, usando somente as regras documentadas de `buildEvidenceCatalog`.
8. **WHEN** PU ou Mapping validar evidências, **o sistema SHALL** exigir referências pertencentes ao catálogo/projeção autorizada; Strategy SHALL consumir essa projeção validada e não prometer validação direta de `evidenceRefs`, sem introduzir filtragem claim-level nessa fronteira.
9. **WHEN** o worker invocar a engine, **o `WorkerEngineFactsPayload` e o `EngineInput.facts` SHALL NOT** conter `creatorConstraints`; `creatorContext` SHALL permanecer separado, e entradas diretas genéricas não SHALL ser tratadas como projeção do worker.
10. **WHEN** Product Understanding for reduzido, **o sistema SHALL** aplicar first-N no provider antes de `assertProviderOutput` e na engine antes do validador, na primeira tentativa e no retry.
11. **WHEN** uma redução de entendimento ocorrer, **o sistema SHALL** distinguir observabilidade da redução do provider e da redução da engine, sem registrar a primeira como `understandingReductions`.
12. **WHEN** um provider devolver campos desconhecidos, **o sistema SHALL** aplicar a regra da fronteira: chaves explicitamente proibidas são rejeitadas; campos fora do shape suportado são descartados pela canonicalização.
13. **WHEN** a quantidade ativa for validada, **o sistema SHALL** aceitar somente `1–10`; referências históricas ou de migration `1–30`, inclusive `N=16`, não SHALL ampliar quota nem o contrato ativo.
14. **WHEN** um retry de faltantes receber `reuseStrategy`, **o sistema SHALL** não executar `STRATEGY_SYNTHESIS`, preservar/recanonicalizar a Strategy com o novo `jobId` e gerar somente os faltantes. O baseline atual ainda não contém o contract test desse caminho; a implementação futura da Tarefa 5 SHALL adicionar esse teste, verificando a ausência de `STRATEGY_SYNTHESIS`, a Strategy preservada/recanonicalizada, o novo `jobId` e a geração exclusiva dos faltantes.
15. **WHEN** `COMMERCIAL_OPPORTUNITY_MAPPING` produzir uma oportunidade, **o sistema SHALL** aceitar hipóteses válidas de contexto, desejo, identificação, curiosidade, aspiração, humor e potencial visual mesmo sem dor, objeção ou necessidade prévia; esses campos não SHALL ser exigidos como pré-condição artificial da oportunidade.


## Edge Cases


- `Analisar produto` duplicado por duplo clique ou timeout deve reutilizar o mesmo job lógico; `Tentar novamente` após estado terminal deve criar novo job.
- Reconnect, reentrada e worker que perde lease devem reutilizar `job.id`, chave e reserva; reclaim aplica tentativa, backoff e limite sem duplicar resultado.
- Duas requests concorrentes de `Analisar produto` do mesmo usuário devem permitir no máximo um job ativo.
- Product novo no limite de `active_products` deve falhar antes de persistir Product, reserva ou job; Product já ativo não deve consumir novamente essa unidade.
- Provider pode devolver JSON parseável, mas semanticamente inválido; schema válido isoladamente não equivale a sucesso.
- Product sem evidência para um claim deve remover/corrigir o claim ou falhar; não deve completar a quantidade com promessa inventada.
- Repair pode produzir um briefing válido individualmente, mas o conjunto ainda pode falhar no gate de variedade; nesse caso o job não publica o conjunto sem revalidar — parcial só publica como `SUCCEEDED_PARTIAL` com variedade revalidada sobre o entregue (ADR-021).
- Fechamento da aba durante `QUEUED` ou `RUNNING` não cancela o job.
- Reentrada após `SUCCEEDED` ou `SUCCEEDED_PARTIAL` deve oferecer revisão (e `Gerar faltantes` no parcial, ADR-021) sem reprocessar automaticamente e manter Strategy/Plan consultáveis.
- Reentrada após `FAILED` ou `CANCELLED` deve oferecer novo job sem apagar Product, fatos ou o job terminal anterior.
- Reserva criada perto da virada do mês deve confirmar/liberar no mês UTC registrado na origem, mesmo se o terminal ocorrer em outro mês.
- Falha/cancelamento não atualiza memória; sucesso persiste somente sinais estruturados da geração.
- Skill ausente, inválida ou sem versão não pode ser substituída por valor vindo do cliente.
- Conteúdo externo com prompt injection deve permanecer no contexto de dados, nunca no contexto de instruções.
- Product, job ou resultado de outro Tenant deve parecer inexistente para a sessão não autorizada, sem vazamento de identificador.

- `N=16` deve ser rejeitado pelo contrato ativo `N=1–10`; qualquer fixture/migração legada `1–30` é somente compatibilidade e não representa cenário de sucesso. O smoke de sucesso usa somente `N=1` e `N=10`.

- Um batch de briefing nunca pode publicar parcialmente; seus itens aguardam os gates e a finalização atômica.
- Provider lento que retorna HTTP 200 após o deadline deve ser tratado como timeout, abortado quando possível e não pode permitir publicação pelo owner vencido.
- Reclaim durante chamada externa pode repetir a chamada, mas deve preservar fencing, registrar a repetição e impedir duplicação de resultado, uso ou memória.
- Saída de provider com IDs persistentes, ownership, status ou quota em campos explicitamente proibidos deve ser rejeitada como `GEN-SCHEMA`; comandos de workflow e outros campos fora do shape suportado são descartados pela canonicalização e nunca recebem autoridade.
## Requirement Traceability

| Requirement ID | Fonte/tema | Seção desta SPEC | Status |
| --- | --- | --- | --- |
| S003-01 | `Analisar produto` sobre Product salvo cria job + reserva | B-003-01; RI-003-01; AC 1 | Pending |
| S003-02 | Quantidade resolvida e limitada | B-003-01; RI-003-04; AC 2 | Pending |
| S003-03 | Entitlement, active_products e mês UTC | B-003-01; B-003-02; RI-003-05; AC 3–6 | Pending |
| S003-04 | Um job ativo por usuário | B-003-02; RI-003-03; AC 7–8 | Pending |
| S003-05 | Fila, lease, heartbeat, deadline, reclaim e tentativas | B-003-03; AC 9–11 | Pending |
| S003-06 | Memória vazia, sinais e não recorrência | B-003-04; RI-003-17; AC 12–14 | Pending |
| S003-07 | ProductStrategy completa e única | B-003-04; RI-003-07; AC 15–16 | Pending |
| S003-08 | ProductUnderstanding completo | B-003-07; AC 18 | Pending |
| S003-09 | CommercialOpportunity completa e validada | B-003-07; AC 19, 27 | Pending |
| S003-10 | ContentPlan completo | B-003-08; AC 17 | Pending |
| S003-11 | ContentOpportunity completa e relacionada | B-003-08; AC 20 | Pending |
| S003-12 | Content e BriefVersion inicial | B-003-08; RI-003-08; AC 21–24 | Pending |
| S003-13 | Model Router, tiers e metadata de execução | B-003-05; AC 25, 28 | Pending |
| S003-14 | Skill versionada | B-003-06; RI-003-12; AC 27 | Pending |
| S003-15 | Factualidade, Quality/Variety Gate e repair | B-003-07; B-003-09; RI-003-09/11; AC 27, 29–32 | Pending |
| S003-16 | Retry técnico idempotente e fencing | B-003-10/11; RI-003-16; AC 9–11, 42 | Pending |
| S003-17 | Retry explícito e cancelamento | B-003-11; AC 43–44 | Pending |
| S003-18 | Readiness, indicador e reentrada | B-003-12; B-003-13; AC 36–42 | Pending |
| S003-19 | Tenant, CSRF e prompt injection | RI-003-02; RI-003-13; Segurança; AC 43–45 | Pending |
| S003-20 | Strategy e Plan consultáveis sem gate | B-003-13; AC 38–39 | Pending |
| S003-21 | Limite transacional de Products ativos | B-003-01; B-003-02; RI-003-05; AC 5–6 | Pending |
| S003-22 | Product READY sem reanálise e nova geração no Slice 008 | B-003-12; B-003-13; RI-003-07; AC 47 | Pending |
| S003-23 | Exclusão Big Bang transacional e arquivamento preservativo | B-003-14; RI-003-18; AC 48–52 | Done |
| S003-24 | Readiness em cards e filtro Pendente | B-003-13; AC 53 | Pending |
| S003-25 | Origem e ciclo de vida da Idempotency-Key | B-003-10; AC 54 | Pending |
| S003-26 | Estrutura, cenas e hash determinísticos | B-003-08; B-003-09; AC 24, 30 | Pending |
| S003-27 | Chave versionada do BriefValidationReport | B-003-09; RI-003-18; AC 55 | Pending |
| S003-28 | Composição de chamadas e batching | B-003-04; AC 25–26 | Pending |
| S003-29 | Projeção mínima e separação de contexto | B-003-04; Segurança; AC 43 | Pending |
| S003-30 | Stages reais antes do trabalho | B-003-04; B-003-12; AC 33, 36 | Pending |
| S003-31 | IDs server-side e observabilidade por capability/batch | B-003-07; B-003-10; AC 28, 34–35 | Pending |
**Coverage:** 31 requisitos, todos mapeados a comportamentos, invariantes e critérios de aceite.

## Success Criteria

- [ ] Um Product salvo inicia, via ação explícita `Analisar produto`, uma única geração durável sem etapa intermediária.
- [ ] Um job bem-sucedido entrega Strategy, Plan e a quantidade solicitada de Contents/Briefings `DRAFT`; `SUCCEEDED_PARTIAL` entrega D e oferece `Gerar faltantes` apenas para F objetivamente não publicados.
- [ ] Strategy e Plan ficam consultáveis no contexto do Product sem bloquear a chegada aos Briefings.
- [ ] Um job falho preserva Product/fatos, não expõe conteúdo parcial e oferece `Tentar novamente` como novo job, mantendo o terminal anterior.
- [ ] O contrato ativo rejeita `N=16` (e demais valores acima de `10`); fixtures/migrações legadas `1–30` permanecem isoladas e nenhum cenário de sucesso usa `count=16`.
- [ ] Commercial Opportunity Mapping e todos os contratos intermediários são validados antes de Strategy, Plan e publicação.
- [ ] Hard gates inválidos, cenas inválidas e schema/provider falho nunca publicam; `REVIEW` semântico recebe repair seletivo único e repair inválido preserva a parte original sem chamada extra.
- [ ] Stages persistidos correspondem ao trabalho atual e são atualizados antes da etapa.
- [ ] Lease, heartbeat, deadline e fencing impedem trabalho externo novo e publicação por owner vencido.
- [ ] Metadata por capability/batch permite medir custo, latência, retries, payloads, validações e repairs sem registrar dados sensíveis.
- [ ] Retry técnico, reclaim de lease e reentrada não duplicam job, reserva, uso ou resultado; a reserva respeita o mês UTC de origem.
- [ ] Product novo respeita `active_products`; Product já ativo e retries não consomem novamente essa unidade.
- [ ] O creator consegue navegar, fechar e reabrir a aplicação sem perder o estado real da geração.
- [ ] O indicador global comunica somente Produto, stage real, sucesso/falha e próxima ação.
- [ ] Nenhuma geração ultrapassa capacidade mensal, escopo de Tenant, CSRF ou regras de factualidade; memória recebe sinais somente de Contents `DRAFT` entregues.

## 11. Decisões registradas

- O Slice 003 começa na ação explícita `Analisar produto` sobre o Product salvo e não transforma o salvamento manual isolado do Slice 002 em geração automática.
- `targetContentCount` deve estar resolvida antes da criação do Job, usando o valor validado e persistido no Product.
- Para Product novo, `active_products`, reserva mensal e criação do Job são uma operação atômica; Product já ativo e retries não reservam novamente Products ativos.
- O job é durável, assíncrono, enfileirado no PostgreSQL e executado por worker com lease/timeout, deadline por tentativa, heartbeat, reclaim, tentativa, backoff e limite antes de falhar.
- A primeira geração usa uma chamada de Product Understanding, uma de Commercial Opportunity Mapping, uma de Strategy, uma de Content Plan e Brief Generator em batches de 4–8; capabilities conceituais não implicam uma chamada LLM por item.
- Cada capability recebe projeção de contexto allowlisted e limitada; dados externos permanecem separados das instruções confiáveis.
- O MVP permite um job ativo (`QUEUED`/`RUNNING`) por usuário e mantém a ação de nova análise visível, porém desabilitada com explicação.
- Reconnect, reentrada e recuperação do worker são retry técnico no mesmo `job.id`, chave e reserva; `Tentar novamente` após `FAILED`/`CANCELLED` é nova execução com novo job, chave e reserva, preservando o terminal anterior.
- A reserva registra o mês UTC de origem e é confirmada/liberada nesse mesmo período.
- A primeira geração usa snapshot de memória vazio, não consulta histórico/recorrência, persiste sinais estruturados de todos os Contents `DRAFT` entregues após sucesso pleno ou parcial (ADR-021) e não atualiza memória em falha/cancelamento.
- A primeira geração cria Strategy v1, ContentPlan, oportunidades e a quantidade solicitada de Contents com BriefVersions v1 iniciais em `DRAFT`; `approvedBriefVersionId` permanece ausente.
- Stages públicos são persistidos antes do trabalho correspondente e refletem a pipeline efetivamente executada, sem simular subetapas agrupadas.
- O Model Router recebe tarefas lógicas conforme a tabela canônica do ADR-029 enquanto o runtime vigente estiver ativo; a matriz de autoridade-alvo do ADR-033 não reclassifica tier ou capability sem eval A/B aprovado.
- O Router registra task, tier, provider/modelo lógico e versão/hash das instruções; qualquer mudança futura de runtime é aditiva até o cutover formal e mantém a baseline reproduzível.
- IDs persistentes, posições, versões e ownership são derivados pelo servidor; o provider devolve somente dados não confiáveis da capability/batch.
- Hard gate factual/estrutural, Fact Validator e Variety Gate são determinísticos; `Hard Gate Repair` é objetivo e limitado por `GENERATION_MAX_REPAIRS`.
- Após hard gate `PASS`, `CONTENT_QUALITY_JUDGE` retorna somente `PASS|REVIEW`; `Semantic Part Repair` é único por parte `REVIEW`, preserva o original inválido e não há re-Judge. Falha objetiva após a composição segue ADR-021. Embeddings, similaridade semântica e judge LLM de variedade/memória permanecem fora do Slice 003.
- A TikTok Commerce Creative Skill é carregada por versão e registrada na proveniência, sem controlar workflow ou persistência.
- O Creative System é conhecimento declarativo/versionado da `PlatformSkill`, com `CreativePrimitive`, `CreativeRecipe`, `CreativeBlueprint`, compatibilidade fail-closed e fluxo `load → validate → freeze → expose`; não controla workflow, persistência ou quota.
- `creativeDirection` não é escrito por esta SPEC; a fundação pode ser especificada e validada de forma aditiva, mas ativação, escrita do Blueprint e qualquer cutover dependem de SPEC/PLAN de cutover e eval aprovados. O Blueprint será interno ao `ContentOpportunity`, com leitura versionada, histórico preservado e nenhuma entidade paralela.
- O catálogo literal permanece corpus de referência/benchmark/eval e fora do prompt normal de novos caminhos; gates, repairs, Judge, cenas separadas e memória versionada permanecem preservados.
- Nenhuma remoção ou reclassificação de chamada, tier ou cena ocorre sem protocolo A/B, relatório versionado e aprovação formal conforme ADR-033.
- O App Shell usa Global Activity Indicator persistente entre navegação e reentrada, sem página permanente de Análise.
- Strategy e Plan são consultáveis na página/contexto do Product depois de `SUCCEEDED`, mas não são gate intermediário para Briefings.
- Product, job, resultados e Entitlements são escopados ao Tenant da sessão; mutações exigem proteção CSRF e erros públicos são sanitizados.
- `IntelligenceRun` registra metadata allowlisted por capability/batch — duração, tamanhos, retries, validações, repairs e códigos — sem prompts completos ou payloads brutos.
- Todo Content entregue por esta pipeline é `DRAFT`: conta para quota, não é faltante e segue o workflow normal de Content Operations.
- DELETE Big Bang remove transacionalmente o Product e todo o grafo relacionado, com isolamento por Tenant, quebra explícita do ciclo Content/BriefVersion, rollback integral em falha e resposta `204` após commit; Product inexistente ou fora do Tenant retorna `404 PRODUCT-NOT-FOUND`.
- `Idempotency-Key` nasce em cada ação intencional do creator, tem fingerprint validado server-side e não pode ser reutilizada com contexto divergente.
- `structure` é campo opcional canônico da `ContentBriefVersion` v1; cenas válidas e hash estrutural fazem parte das validações determinísticas.
- Para geração nova, `ContentSceneSet` é separado e versionado conforme ADR-019; `ContentBriefVersion` não exige nem reescreve `scenes`, e payload legado permanece read-only.
- `briefId` do `BriefValidationReport` é o identificador canônico derivado de `contentId + briefVersionId`.
- Esta revisão atualiza a SPEC aprovada para refletir a exclusão Big Bang; a implementação foi validada pelos gates reportados: service 33/33, suíte npm 216/216 sem skips, typecheck, eslint, isolamento de Tenant, rollback e concorrência worker/delete.
- Esta documentação registra a aprovação da Etapa 2; a implementação e qualquer cutover continuam condicionados aos gates ADR-029/033 e não são autorizados por esta revisão.
## 12. Especificação visual integral — Products e Product detail

### 12.1 Objetivo e fronteira

Esta seção formaliza a superfície visual do Slice 003 para Products e Product detail. Ela cobre hierarquia, composição, componentes, estados, responsividade, acessibilidade e reentrada. Não altera o domínio, APIs, persistência, provider, worker, Golden Dataset ou os limites de slices posteriores.

O objetivo é substituir a composição genérica de formulário por uma superfície operacional orientada ao Produto: identificar o objeto, entender seu estado, executar a próxima ação e revisar Strategy, Contents e History sem transformar a tela em dashboard analítico.

### 12.2 Direção visual e adaptação da referência

Fidelidade à imagem de referência:

- shell com sidebar e região principal claramente separadas;
- header contextual rico e ancorado no Produto;
- metadata factual visível (imagem, preço, marketplace, categoria e data quando disponível);
- cards/listas com densidade operacional;
- navegação interna evidente;
- Briefings como conteúdo principal, não como resumo oculto;
- maior uso da largura disponível no desktop;
- hierarquia explícita entre contexto, próxima ação e conteúdo.

Adaptação obrigatória ao `DESIGN.md` v1.6:

- Light como padrão, Instrument Sans e tokens semânticos canônicos;
- conteúdo principal sólido; glass somente em shell, toolbar, toast, sheet ou menu flutuante;
- cards somente para Product, Content e objetos operacionais reais;
- sem KPI, gráfico, scorecard, percentual decorativo ou cor própria por categoria/Produto;
- targets mínimos de `44×44px`, foco-visible, teclado, contraste e `prefers-reduced-motion`;
- mobile mantém todas as capacidades essenciais;
- disclosure não esconde erro, estado de geração ou próxima ação.

O `Global Activity Indicator` continua sendo uma capacidade do App Shell e uma fonte server-authoritative de estado, mas sua apresentação visual neste redesign é um **toast de atividade**. Não existe faixa persistente abaixo do header/toolbar.

### 12.3 Shell, navegação e toast de atividade

Desktop usa sidebar fixa de `240px`; tablet usa rail de `72px`; mobile usa header contextual de `56px` e drawer. A navegação contém somente Home, Produtos, Estúdio, Agenda e Configurações. Itens futuros sem rota são explicitamente indisponíveis, com nome acessível, `aria-disabled` e explicação.

O toast de atividade:

- aparece como superfície flutuante discreta, ancorada no canto seguro da região principal;
- não ocupa a composição do header nem cria faixa de conteúdo;
- não bloqueia navegação, foco ou ações da tela;
- permanece visível enquanto houver job `QUEUED`/`RUNNING`, resultado `SUCCEEDED` acionável ou falha recuperável, até dismiss opcional do usuário;
- ao ser dispensado, não cancela o job; reentrada e mudança de rota consultam o backend e podem reapresentá-lo quando houver informação acionável;
- informa Product, stage real em `pt-BR`, sucesso ou falha e ações qualificadas por estado: `SUCCEEDED` pleno → uma única ação, `Revisar conteúdos`; `SUCCEEDED_PARTIAL` → duas ações, `Revisar conteúdos` + `Gerar faltantes` (ADR-021); `FAILED`/`CANCELLED` → uma única ação, `Tentar novamente`;
- não mostra percentual inventado, ETA, provider, modelo, tier, prompt, log ou token;
- usa `role="status"`/`aria-live="polite"` para atividade não urgente e `role="alert"` somente para falha que exige atenção;
- possui botão `Dispensar` com nome acessível, foco-visible e alvo mínimo de `44×44px`;
- entrada/saída usa movimento curto; com `prefers-reduced-motion`, muda sem deslocamento;
- mantém ordem de foco natural e nunca captura foco automaticamente durante navegação.

### 12.4 Products

O cabeçalho da área contém `Produtos`, descrição orientada à tarefa, busca e `Adicionar produto`. A toolbar agrupa busca, filtros `Todos`, `Ativos`, `Pendentes` e `Arquivados`, sem duplicar o toast.

Cada Product card mostra, quando disponível:

- imagem com alt derivado do Produto;
- nome;
- marketplace/origem, incluindo `TikTok Shop` quando factual;
- categoria neutra;
- preço e moeda;
- data factual contextual, como cadastro ou última análise;
- badge de readiness (`Pendente`, `Analisando`, `Pronto`, `Falhou`);
- próxima ação contextual (`Abrir produto`, `Analisar produto`, `Revisar conteúdos` ou `Tentar novamente`).

O badge de análise usa hierarquia semântica: texto explícito + estrutura/ícone, token de feedback ou accent apropriado e contraste validado. Nunca comunica o estado somente por cor, não usa bolha decorativa nem aparência de métrica. `Analisando` deve ser visualmente mais informativo que `Pendente`, sem simular progresso.

Desktop pode usar grade ou lista de cards em largura aproveitada; tablet usa duas colunas quando houver espaço; mobile usa uma coluna. Filtro vazio, loading e erro têm mensagens próprias e uma próxima ação clara.

### 12.5 Product detail e header do Produto

O detail começa com breadcrumb e header do objeto real contendo:

- imagem ou placeholder semântico;
- nome do Produto;
- readiness/status;
- marketplace e categoria quando disponíveis;
- preço e moeda;
- data factual disponível;
- quantidade inicial de Briefings quando vinculada ao Produto;
- ação secundária `Arquivar produto`;
- ação principal derivada do estado (`Analisar produto`, `Revisar conteúdos` ou `Tentar novamente`).

Não inventar metadata ausente. O header ocupa a largura útil da região principal; não criar coluna estreita que produza vazio estrutural em desktop.

As regiões internas são `Visão geral`, `Estratégia`, `Conteúdos` e `Histórico`. Tabs têm alvo mínimo de `44×44px`, estado ativo por cor e indicador estrutural, sem depender somente de cor, e suporte a setas, Home/End, Enter e Space.

`Visão geral` prioriza fatos e próxima ação. O formulário de edição é secundário e não domina a primeira viewport de revisão.

`Estratégia` usa composição editorial para posicionamento, audiências, dores, desejos, benefícios, objeções, argumentos, ângulos e riscos. Não usar KPI cards.

- `Conteúdos` usa lista/tabela operacional no desktop com posição, hook, ângulo, status e ação de abrir. No mobile usa cards verticais. Cada briefing aberto mostra Hook, Ângulo, objetivo quando disponível, Roteiro, Cenas, CTA e os bullets de desenvolvimento com seu texto e CTA, em disclosure progressivo. Contents iniciais permanecem `DRAFT`; este slice não adiciona editar, regenerar, aprovar, descartar ou montar lote.
- `Histórico` mostra tentativas reais com `jobId`, readiness, status, timestamps, usage agregado, custo agregado, resultado completo e recuperação. Não expõe provider, modelo, tier, prompts, logs, pricing, capability rows ou metadata bruto.

### 12.6 Estados da interface

| Estado | Composição obrigatória |
| --- | --- |
| Loading | skeleton preservando header, cards/lista e detail; sem estratégia ou briefing simulado |
| Empty Products | explicação curta, `Adicionar produto` e fluxo URL/manual conforme disponível |
| Empty Contents | explica que Briefings aparecerão após a análise; não apresenta conteúdo parcial |
| `PENDING` | badge `Pendente`, ação `Analisar produto` e expectativa clara |
| `QUEUED`/`RUNNING` | toast persistente até dismiss opcional, Product + stage real, sem ETA/percentual; navegação livre |
| `SUCCEEDED`/`READY` | toast de sucesso acionável, header pronto, `Revisar conteúdos`, Strategy/Plan consultáveis e Briefings completos |
| `SUCCEEDED_PARTIAL`/`READY` | toast de conclusão parcial acionável, "D de N prontos", motivo sanitizado por item faltante, `Gerar faltantes` + `Revisar conteúdos`, somente Briefings aprovados visíveis (ADR-021) |
| `BLOCKED` | ação visível desabilitada, razão textual e próxima ação derivada de `generationAction` |
| Reentrada | backend é fonte de verdade; toast acionável pode reaparecer, sem localStorage como autoridade |

### 12.7 Responsividade e acessibilidade

Validar em `375×812`, `390×844`, `768×900`, `1200×900` e `1440×900`. Não pode existir overflow horizontal acidental.

- Mobile: experiência completa, cards verticais, filtros em sheet quando complexos, drawer com foco controlado, toast sem cobrir CTA.
- Tablet: rail de `72px`, grid de oito colunas, gutter de `24px`, todas as capacidades preservadas.
- Desktop: sidebar de `240px`, toolbar contextual, conteúdo aproveitando a região principal, sem painel decorativo.
- Todos os controles possuem alvo mínimo de `44×44px`, foco-visible com offset e ordem de foco coerente.
- Tabs, drawer, toast, disclosure e ações funcionam com teclado.
- Mudanças assíncronas usam `aria-live`/`role` adequado; `aria-busy` aparece durante carregamento quando aplicável.
- Erros permanecem associados ao contexto e não dependem de cor.
- Texto truncado oferece acesso ao valor completo.
- Dismiss do toast é opcional e não remove o estado do backend.
- `Escape` fecha drawer, sheet e toast dispensável sem executar ações destrutivas; foco retorna ao gatilho quando aplicável.
- `prefers-reduced-motion` remove deslocamento e reduz transições.

### 12.8 Rastreabilidade visual

| ID | Fonte | Contrato desta SPEC | Verificação |
| --- | --- | --- | --- |
| UI-003-01 | DESIGN §§2–3, 8 | Shell responsivo, sidebar/rail/drawer e cinco destinos | inspeção visual nos cinco breakpoints |
| UI-003-02 | DESIGN §§3, 8, 10 | Toast sem faixa persistente, não bloqueante, acessível e recuperável | estados queued/running/succeeded/failed + reentrada |
| UI-003-03 | DESIGN §§8, 10; PRD §§8, 39–45 | Product cards com metadata factual, readiness e próxima ação | Products com dados e estados reais |
| UI-003-04 | DESIGN §§2, 5–6; referência visual | Header rico do Product e aproveitamento da largura | comparação visual desktop/mobile |
| UI-003-05 | DESIGN §§8–9; SPEC B-003-08 | Strategy editorial e Briefings com disclosure | tabs Strategy/Contents/History |
| UI-003-06 | DESIGN §§3, 8, 10 | Loading, empty, error, blocked, reduced-motion e foco | matriz de estados + teclado |
| UI-003-07 | DESIGN §§3, 8, 10 | Targets `44×44px`, sem overflow e navegação assistiva | DOM/ARIA e medição nos cinco breakpoints |
| UI-003-08 | SLICES Slice 003; SPEC B-003-12/13 | Sem ações de Slice 004+; READY sem reanálise | inspeção de ações e smoke de reentrada |

### 12.9 Critérios de aceite visual

1. Products e Product detail seguem a hierarquia da referência, sem a composição genérica atual.
2. Products apresenta cards/lista com imagem, nome, marketplace, preço, categoria, readiness, data real quando disponível e próxima ação.
3. Product detail apresenta header rico e usa a largura útil da região principal.
4. O header contextual não contém `GlobalActivityIndicator` como faixa persistente.
5. Estados de geração aparecem em toast discreto, persistente até dismiss opcional, sem bloquear navegação e com reentrada server-authoritative.
6. Toast de atividade mantém `aria-live`, foco, dismiss acessível, sem ETA/percentual inventado e com reduced-motion.
7. Badges de readiness têm texto e estrutura semântica; cor nunca é o único sinal.
8. Strategy, Contents e History têm composição distinta e legível.
9. Contents exibe exatamente os Briefings `DRAFT` publicados após `SUCCEEDED` ou `SUCCEEDED_PARTIAL`, sem expor diagnóstico interno; cada item mostra Hook, Ângulo, Roteiro, Cenas e CTA.
11. Loading, empty, queued, running, succeeded, failed, cancelled, blocked e reentry possuem representação coerente e não duplicada.
12. A experiência é completa em mobile, usa rail no tablet e sidebar no desktop.
13. Os cinco breakpoints passam sem overflow horizontal acidental.
14. Todos os controles principais têm target mínimo de `44×44px`, teclado, foco-visible, Escape e semântica ARIA correta.
15. A implementação usa tokens e tipografia do `DESIGN.md`, sem gradientes, cores ad hoc, glass no conteúdo ou métricas decorativas.

### 12.10 Impacto da decisão do toast

A remoção da faixa persistente altera somente a apresentação frontend do estado global. O backend, polling, estados, reentrada, retry, autorização e contrato de `generationAction` permanecem inalterados. O toast torna o estado menos intrusivo e preserva continuidade de trabalho; em contrapartida, exige aria-live, reexibição em reentrada, dismiss reversível e teste para garantir que o usuário não perca uma ação de recuperação.

Esta decisão é um override visual explícito para o Slice 003 sobre a disposição descrita no contrato de shell do `DESIGN.md`; não altera os tokens, a semântica nem a existência do estado global.
