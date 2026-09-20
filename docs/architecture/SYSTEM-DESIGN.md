# System Design — Commerce Intelligence

**Status:** baseline de arquitetura derivado dos PRDs vigentes em `docs/product/`.
**Escopo:** como os limites arquiteturais se conectam. Não substitui PRDs, ADRs ou `DESIGN.md`.

## 1. Objetivo e escopo

Commerce Intelligence transforma um Produto confirmado em uma `ProductStrategy`, um `ContentPlan` diversificado, `Content` + Briefings revisáveis e organiza a execução em `RecordingBatch`, Agenda e Estúdio. O primeiro valor é o creator cadastrar os fatos do Produto em `/products/new` e acionar `Analisar produto`.

O MVP cobre:

- entrada: **cadastro manual** dos fatos do Produto em `/products/new` e entrada URL-first via CaptAPI HTTP normal (Slice 012, ADR-027/028), ambas convergindo no mesmo formulário, confirmação humana e serviço de Product; Browser Harness, Chromium, portal e MCP em runtime permanecem fora;
- ação explícita `Analisar produto` como único momento de criação do `CommerceIntelligenceJob`;
- `CommerceIntelligenceJob` assíncrono e durável — **um job ativo por usuário no MVP** — com indicador global no App Shell;
- Commerce Intelligence Engine composta por orchestrator + capabilities com contratos, gates de qualidade e variedade, repair loop e `ProductMemorySnapshot` estruturada;
- `ProductStrategy` persistente e versionada, reutilizada entre gerações;
- Model Router com `IntelligenceTier` (LOW/MID/HIGH) e provider substituível; qualidade idêntica entre planos;
- Content Operations: revisão, edição, regeneração, versionamento (`ContentBriefVersion`), aprovação, descarte;
- `RecordingBatch` com data planejada, Agenda como visão temporal e Estúdio com estados derivados;
- Entitlements server-side (produtos ativos, conteúdos/mês) com reserva transacional por job.

O MVP não cobre: publicação/agendamento externo, analytics externo (ROAS/CTR/atribuição), TikTok OAuth ou TikTok Shop API, scraping universal, outros marketplaces, automação de CAPTCHA/senha, geração de mídia, fila visual de múltiplos jobs, embeddings/banco vetorial obrigatórios, i18n operacional (locale fixo `pt-BR`), colaboração/RBAC/SSO, e microserviços.

Fontes: `docs/product/PRD.md` (produto geral), `PRD-Importation-product.md` (entrada de Produto — cadastro manual vigente), `PRD-commerce-intelligence-engine.md` (engine), `PRD-product-intelligence-analysis.md` (job assíncrono e UX de espera), `PRD-content-briefing.md` (briefing, lotes, agenda, estúdio), `PRD-model-router-inteligence.md` (camada de modelos). ADRs registram decisões; este documento descreve a composição.

## 2. Forma do sistema

Monólito modular em TypeScript/Next.js com PostgreSQL/Prisma como fonte de registro. A entrada URL-first do Slice 012 é um componente HTTP do monólito que chama a CaptAPI; Product Importer, Agent Runner, Browser Harness e Chromium headless não entram no runtime deste fluxo.

```text
Creator → Web/API → Application Use Cases → Domain Modules
                                   ↓
                        CommerceIntelligenceJob (fila PostgreSQL)
                                   ↓
                                Worker
                                   ↓
              Commerce Intelligence Orchestrator → Capabilities
                                   ↓
                    Model Router → LLM Gateway → Provider
```
## 3. Mapa de módulos

| Módulo | Responsabilidade | Não possui |
|---|---|---|
| **Identity / Tenant** | sessão server-side, usuário, Tenant/workspace pessoal, autorização | colaboração, RBAC, SSO, billing |
| **Product (entrada vigente)** | cadastro manual de fatos em `/products/new` com validação server-side, origem/proveniência, correções do creator, readiness derivada (PENDING/ANALYZING/READY/FAILED) | decisão comercial, descoberta automática de fatos |
| **Product Import (Slice 012, ADR-027/028)** | validar URL, chamar CaptAPI HTTP, normalizar `ProductCandidate`, expor lacunas no formulário e encaminhar confirmação ao caso de uso manual | persistência prematura, fatos sem confirmação humana, Browser/portal/MCP, contexto estratégico |
| **Commerce Intelligence** | `CommerceIntelligenceJob`, `IntelligenceRun`, orchestrator e capabilities (Product Understanding, Commercial Opportunity Mapping, Strategy Builder, Content Portfolio Planner, Brief Generator, Fact Validator, Quality Judge, Variety Gate, Repair), `ProductMemorySnapshot`, Platform Skill | revisão/aprovação, lotes, gravação |
| **Content Operations** | `Content`, `ContentBriefVersion`, revisão/edição/regeneração/aprovação/descarte, `RecordingBatch` + `RecordingBatchItem`, Agenda e Estúdio | estratégia, chamada direta a modelo |
| **Entitlements** | limites por plano, reserva/confirmação/liberação transacional, virada mensal | qualidade diferente por plano, cobrança |
| **Model Router / LLM Gateway** | tarefas lógicas → `IntelligenceTier` → provider adapter, validação de saída | decisão estratégica, regra de negócio |

Módulos são limites de código, não serviços. O Product Import é um componente do monólito que chama a CaptAPI por HTTP; não há Browser Service, portal, MCP em runtime, container adicional ou microserviço para esta entrada.

## 4. Fluxo do domínio

```text
Cadastro manual dos fatos + preparação (/products/new)
                                                                                         ↓
                                                                              Product salvo (sem job)
                                                                                         ↓
                                                        ação explícita `Analisar produto`
                                                                                         ↓
                                                                             CommerceIntelligenceJob
                                                                                         ↓
                                         ProductStrategy → ContentPlan → ContentOpportunity
                                                                                         ↓
                                                     Content + ContentBriefVersion (DRAFT)
                                                                                         ↓
                                                   revisão → APPROVED → RecordingBatch
                                                                                         ↓
                                                         Agenda / Estúdio → Execução
                                                                                         ↓
                                                       Histórico / Product Memory

1. **Cadastro:** o creator preenche os fatos do Produto e a preparação em `/products/new`; validação server-side; `targetContentCount` é resolvido no cadastro.
2. **Salvamento:** persiste o `Product` ativo, escopado ao Tenant, sem criar job.
3. **Analisar produto:** ação explícita do creator; único momento de criação do `CommerceIntelligenceJob` (`POST /api/generations` → `startCommerceIntelligence`, transacional com reserva de Entitlement).
4. **Engine:** dentro do job, o orchestrator executa Understanding → Opportunity Mapping → Strategy Builder → Portfolio Planner → Brief Generator → gates → persistência.
5. **Revisão:** contents entram em `DRAFT`; o creator edita/regenera, aprova ou descarta.
6. **Execução:** aprovados formam um `RecordingBatch` com data planejada; Agenda e Estúdio organizam a execução.

Identity/Tenant envolve todo o fluxo. Entitlements autoriza antes do job. Nenhuma camada assume a responsabilidade da outra.

## 5. Direção de dependências

```text
Web/API ───────┐
Worker ────────┼──> Application Use Cases ───> Domain Rules
                             │                      │
                             └─────────> Ports <────┘
                                               ↑
                                   Infrastructure Adapters
```

- Web e worker chamam casos de uso; não acessam banco, CDP, provider ou quota diretamente. O componente de importação do Slice 012 chama o caso de uso da CaptAPI e encaminha o Candidate transitório ao fluxo manual.
- O domínio não conhece Next.js, Prisma, HTTP, CDP, Browser Harness, prompts ou SDKs de provider.
- Ports existem para persistência, sessão, browser, fila e provider de modelo somente quando há fronteira real.
- Um módulo não lê tabelas de outro para contornar seu contrato.

## 6. Domínio, aplicação e infraestrutura

**Domínio:** Product e fatos confirmados com proveniência (cadastro manual e Candidate não confiável do Slice 012); `ProductStrategy` versionada (ACTIVE/SUPERSEDED/STALE); `ContentPlan`/`ContentOpportunity`; `Content` + `ContentBriefVersion` imutáveis; `RecordingBatch`/`RecordingBatchItem`; regras derivadas de estado do lote; memória estruturada com pesos `gerado < aprovado < concluído`.

**Aplicação:** importar URL por CaptAPI, apresentar/confirmar Candidate no formulário manual, cadastrar Product, `Analisar produto` (criar job + reserva), consultar status, expor Strategy/Plan/Briefings, ações de revisão, criar/agendar lote, concluir conteúdo e resolver Entitlements. A chamada CaptAPI ocorre fora da transação; a confirmação usa a transação curta do serviço manual.

**Infraestrutura:** Next.js, sessão server-side, PostgreSQL/Prisma, fila no PostgreSQL, cliente HTTP da CaptAPI, worker, LLM Gateway/adapters de provider. Não há Browser Service, Chromium headless, portal, MCP ou infraestrutura visual para importação.

## 7. Contratos

### Entrada de Product (manual + CaptAPI, Slice 012)

- Fatos do Produto informados pelo creator em `/products/new` e validados server-side; nenhum campo estratégico; proveniência declarada (`submittedUrl`/`sourceUrl` informados, não verificados).
- Salvamento nunca cria job; a ação explícita `Analisar produto` é o único momento de criação do `CommerceIntelligenceJob`.
- URL e manual convergem em `/products/new`; a importação retorna Candidate e não persiste.
- A confirmação humana no mesmo formulário usa o serviço manual e valida todos os campos do contrato vigente.

### Importação por CaptAPI HTTP (Slice 012, ADR-027/028)

- `ProductCandidate` factual: somente campos suportados pelo formulário/serviço; lacunas permanecem lacunas; `imageRefs` contém apenas `data.images[0]`.
- `salesCount`, `ratingValue` e `reviewCount` são sinais opcionais de leitura, sem invenção e sem persistência no Product.
- Confirmação humana é a única fronteira para `Product` ativo; correções confirmadas prevalecem sobre a extração; proveniência segue o mecanismo existente.
- A única credencial é `CAPTAPI_API_KEY` no servidor. Nunca senha, cookie, token do TikTok, payload bruto ou segredo em UI/log.

### Commerce Intelligence

- Schemas canônicos versionados: `ProductUnderstanding`, `CommercialOpportunity`, `ProductStrategy`, `ContentPlan`, `ContentOpportunity`, `Content`, `ContentBriefVersion`, `ProductMemorySnapshot`, `BriefValidationReport`, `IntelligenceRun`.
- Job público: `status` (QUEUED/RUNNING/SUCCEEDED/SUCCEEDED_PARTIAL/FAILED/CANCELLED — parcial declarado conforme ADR-021) + `stage` (UNDERSTANDING_PRODUCT → … → FINALIZING) com mensagens humanas mapeadas 1:1 para etapas reais. Sem percentual ou ETA inventados.
- `IntelligenceRun` registra engine version, skill version, modelo/provider por capability, custo, latência, retries — interno, nunca na UI.
- Todo Product `ACTIVE` retornado por leitura autenticada inclui `generationAction`: `AVAILABLE` com `reason`/`nextAction` nulos, ou `BLOCKED` com o par `GEN-ACTIVE`/`VIEW_ACTIVE_ANALYSIS` ou `GEN-CAPACITY`/`WAIT_FOR_CAPACITY`. Product `ARCHIVED` não serializa o campo; archive/reactivate retornam mutação mínima e a UI recarrega o Product. Não há novo código de bloqueio. O `POST` revalida e reserva transacionalmente. Ver ADR-016.
- Capacities seguem `Input Schema → Capability → Output Schema`. LLM nunca decide regra de sistema (estado de job, quota, persistência, versões).
- Fato ≠ inferência: a engine pode inferir por que alguém compraria; não pode inventar o que o Produto é. Fact Validator classifica claims (`SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED`, `CONTRADICTED`).
- Gates e repairs: hard gate determinístico por briefing/conjunto (schema, estrutural, factual, cenas e variedade) é obrigatório antes e depois da composição. `Hard Gate Repair` é objetivo, anterior ao Judge, usa `CONTENT_BRIEF_REPAIR` por item e pode executar até `GENERATION_MAX_REPAIRS` rounds server-side; o hard gate decide se sua exaustão vira parcial/falha pelo ADR-021. Só depois de hard gate `PASS`, `CONTENT_QUALITY_JUDGE` avalia em batch homogêneo até três Contents e retorna `PASS|REVIEW`. `Semantic Part Repair` chama um único `CONTENT_PART_REPAIR` por parte `REVIEW`; partes `PASS` e reparos inválidos preservam o original, sem re-Judge. Semântica não bloqueia conteúdo objetivamente válido: hard gates finais decidem `DRAFT` ou o parcial declarado. Não há `REJECT` semântico nem `QUALITY_PENDING`.

### Model Router

```text
Engine Capability → Logical Intelligence Task → Model Router
  → IntelligenceTier (LOW/MID/HIGH) → Model Selection
  → LLM Gateway / Provider Adapter → Structured Output
  → Capability Contract Validation
```

- Capabilities determinísticas não passam pelo router. O mapa de tier runtime, retries/fallback e autoridade é a tabela canônica do ADR-029; `ROUTER_MAP` atual é configuração operacional evolutiva por evals, não a heurística histórica “HIGH decide, MID executa, HIGH audita”.
- Um provider por vez no MVP, atrás do adapter. Provider nunca entra na regra de negócio. Tiers nunca variam por plano comercial.
- Conteúdo extraído de páginas é dado não confiável, nunca instrução: separação explícita entre system instructions, contexto confiável da engine e conteúdo do Produto.

### Content Operations

- `Content` é identidade estável (`DRAFT`/`APPROVED`/`DISCARDED`); `ContentBriefVersion` é imutável; editar/regenerar cria versão; aprovar fixa a versão exata; edição posterior a aprovado exige nova aprovação para futuras execuções.
- `RecordingBatchItem` referencia `contentId` + `approvedVersionId`; edições posteriores não alteram lote montado. `DISCARDED` preserva memória — não é delete.
- Estados do lote são derivados: 0/N → `Aguardando`, 1..N-1 → `Gravando`, N/N → `Concluído`. Nunca administrados manualmente.

## 8. Fronteiras críticas

### Persistência

PostgreSQL é a fonte de registro: tenants/sessions, products, strategy versions, plans/opportunities, contents/brief versions, recording batches/items, intelligence jobs/runs, memory stats, entitlements/uso. O Slice 012 não cria tabela de Candidate nem altera schema: a consulta é transitória e só o Product confirmado é persistido pelo serviço manual. `product_import_attempts` permanece como remanescente legado até decisão própria.
### Autorização e isolamento

Cookie opaco → sessão server-side → usuário + Tenant. Todo caso de uso aplica escopo; `tenantId` do cliente nunca é autoridade. Candidate e Product são escopados ao Tenant da sessão. A importação valida URL/egress, limita timeout e tamanho da resposta e chama somente a CaptAPI HTTP allowlisted; não executa Browser, portal ou MCP.

### Importação HTTP externa (Slice 012, ADR-027/028)

CaptAPI é chamada fora da transação de persistência. Conteúdo retornado é dado
não confiável; schema, tamanho, cardinalidade, preço, moeda, imagens e sinais
são validados antes de aparecer no Candidate. Falha de URL, configuração, rede,
HTTP, JSON ou shape é recuperável e mantém o fallback manual. Nenhum browser,
portal, MCP, cookie ou login é necessário ou permitido no runtime.
### Processamento assíncrono

O salvamento do cadastro manual persiste o Product **sem** criar job. A ação explícita `Analisar produto` executa uma transação curta que cria o `CommerceIntelligenceJob`, reserva Entitlement e devolve; o worker reivindica com lease, executa a engine fora de transação e finaliza em transação curta. `job.id` é a chave idempotente compartilhada com a reserva; retry técnico não duplica Strategy/Plan/Briefings nem consumo. MVP: um job ativo por usuário — `Analisar produto` fica desabilitado com explicação enquanto `QUEUED`/`RUNNING`. O job sobrevive a navegação e fechamento de aba; reabrir restaura o indicador global. Falha preserva Product e fatos; retry reutiliza o contexto confirmado.

### Segurança de LLM

Prompt orienta, validação obriga. Nenhuma regra crítica vive só em prompt. Contexto mínimo por capability (slices de Strategy/Skill/Memory, não o mundo). Saída de provider é não confiável: schema, tamanho, cardinalidade, duplicatas e factualidade antes de persistir. Sem sucesso parcial **silencioso**: o job fecha completo (`SUCCEEDED`), fecha parcial declarado (`SUCCEEDED_PARTIAL`, somente itens aprovados, variedade revalidada e retry dos faltantes — ADR-021), ou falha de forma recuperável.

## 9. Requisitos não funcionais mínimos

- **Durabilidade:** job persistente, retomável, sobrevive a deploy e reconnect; lease/timeout no worker.
- **Idempotência:** retry técnico e reentrada não duplicam resultado, consumo nem memória.
- **Observabilidade interna:** etapa/capability que falhou, skill/strategy/modelo usados, briefings rejeitados e motivos, repairs, custo e latência por capability; em falha de provider, identificador opaco e validado da chamada com origem (`header`/`body.id`), quando disponível. Nada disso vira UI, nem inclui payload bruto.
- **Segurança:** segredos fora de código e logs; erros sanitizados; sem payload bruto de provider persistido por padrão.
- **Testes:** unitários determinísticos (schema, estado, variedade, idempotência), contract tests por capability, evaluation tests com Golden Dataset de produtos reais (8+ categorias) e regressão entre versões de engine/Skill/prompt/modelo.
- **Custo:** metadados de tokens/custo por run; `IntelligenceRun` permite comparar qualidade/custo por tarefa (base dos evals do Model Router).

## 10. Evolução futura já conhecida

Fila visual de análises e central de atividades (após validação); notificações de conclusão; aprendizado a partir de performance externa (preserva rastreabilidade hoje para viabilizar depois); AI Content Production como executor alternativo do Briefing aprovado (`Production Specification` → Media Provider Adapter, fronteira do ADR-007); novas Platform Skills (Instagram/YouTube/Shopee); membros/equipes sobre `tenant_id`; i18n operacional. Nenhum desses itens antecipa infraestrutura no MVP.

## 11. Relação com os ADRs

| Documento | Papel neste desenho |
|---|---|
| ADR-001 | monólito modular, stack e deploy |
| ADR-002 | engine como core estratégico (contrato v1 superseded pelo ADR-012) |
| ADR-003 | PostgreSQL, memória e rastreabilidade |
| ADR-004 | variedade por memória estruturada |
| ADR-005 | processamento assíncrono durável — `CommerceIntelligenceJob`, um job ativo por usuário, indicador global |
| ADR-006 | Entitlements e reserva transacional |
| ADR-007 | fronteira de produção de mídia futura |
| ADR-008 | superseded pelo ADR-022/ADR-027 — confirmação humana e segurança de URL permanecem referência |
| ADR-022 | decisão anterior de entrada manual; substituído para URL-first pelo Slice 012/ADR-027 |
| ADR-027 | integração URL-first por CaptAPI HTTP |
| ADR-028 | Candidate transitório, confirmação no formulário e limites do Slice 012 |
| ADR-009 | identidade, Tenant e autorização |
| ADR-010 | superseded (API oficial) |
| ADR-011 | superseded — arquitetura Browser Service/portal/HITL removida |
| [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) | contratos canônicos da engine, gates, repair, memória e rastreabilidade |
| [ADR-013](./adr-013-model-router-e-intelligence-tier.md) | Model Router, `IntelligenceTier` e independência de provider |
| [ADR-014](./adr-014-platform-skill-versionada.md) | Platform Skill versionada (TikTok Commerce Creative Skill) |
| [ADR-016](./adr-016-projecao-de-acao-de-geracao.md) | projeção server-authoritative de `generationAction` para Product ativo |
| [ADR-015](./adr-015-content-operations-e-recording-batch.md) | Content Operations: versões de briefing, aprovação, `RecordingBatch`, estados derivados |
| [ADR-017](./adr-017-correlacao-sanitizada-de-provider.md) | correlação sanitizada de chamadas ao provider |
| [ADR-029](./adr-029-pipeline-hibrida-deterministica-e-criativa.md) | fronteira híbrida: gates e skeleton determinísticos; plano, cenas e copy criativos; judge/repair semânticos limitados |

Se a implementação contrariar um ADR, o ADR é revisado antes. Se apenas conectar decisões já aceitas, este documento pode ser atualizado sem novo ADR.

## 12. Registro das decisões desta revisão

Novos: [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) (contratos canônicos da engine), [ADR-013](./adr-013-model-router-e-intelligence-tier.md) (Model Router e `IntelligenceTier`), [ADR-014](./adr-014-platform-skill-versionada.md) (Platform Skill versionada), [ADR-015](./adr-015-content-operations-e-recording-batch.md) (Content Operations e `RecordingBatch`) e [ADR-029](./adr-029-pipeline-hibrida-deterministica-e-criativa.md) (fronteira híbrida determinística/criativa). ADR-028 complementa ADR-027 de importação para formalizar Candidate transitório, confirmação explícita e limites do Slice 012.

Revisões in-place: ADR-002 (contrato v1 superseded), ADR-004 (pesos de sinal e descarte como sinal), ADR-005 (`CommerceIntelligenceJob`, um job ativo por usuário, indicador global). ADR-008 foi alinhado ao Product Importer. ADR-011 foi superseded após a remoção do Browser Service, portal, HITL e profiles por usuário.
