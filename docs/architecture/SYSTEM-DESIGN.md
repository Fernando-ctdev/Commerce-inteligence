# System Design — Commerce Intelligence

**Status:** baseline de arquitetura derivado dos PRDs vigentes em `docs/product/`.
**Escopo:** como os limites arquiteturais se conectam. Não substitui PRDs, ADRs ou `DESIGN.md`.

## 1. Objetivo e escopo

Commerce Intelligence transforma um Produto confirmado em uma `ProductStrategy`, um `ContentPlan` diversificado, `Content` + Briefings revisáveis e organiza a execução em `RecordingBatch`, Agenda e Estúdio. O primeiro valor é o creator indicar um produto do TikTok Shop com o mínimo de entrada manual.

O MVP cobre:

- entrada URL-first via Product Importer agentic, Browser Harness e Chromium headless, com fallback manual mínimo;
- `ProductCandidate` factual, confirmação humana como fronteira e proveniência por fato;
- `CommerceIntelligenceJob` assíncrono e durável — **um job ativo por usuário no MVP** — com indicador global no App Shell;
- Commerce Intelligence Engine composta por orchestrator + capabilities com contratos, gates de qualidade e variedade, repair loop e `ProductMemorySnapshot` estruturada;
- `ProductStrategy` persistente e versionada, reutilizada entre gerações;
- Model Router com `IntelligenceTier` (LOW/MID/HIGH) e provider substituível; qualidade idêntica entre planos;
- Content Operations: revisão, edição, regeneração, versionamento (`ContentBriefVersion`), aprovação, descarte;
- `RecordingBatch` com data planejada, Agenda como visão temporal e Estúdio com estados derivados;
- Entitlements server-side (produtos ativos, conteúdos/mês) com reserva transacional por job.

O MVP não cobre: publicação/agendamento externo, analytics externo (ROAS/CTR/atribuição), TikTok OAuth ou TikTok Shop API, scraping universal, outros marketplaces, automação de CAPTCHA/senha, geração de mídia, fila visual de múltiplos jobs, embeddings/banco vetorial obrigatórios, i18n operacional (locale fixo `pt-BR`), colaboração/RBAC/SSO, e microserviços.

Fontes: `docs/product/PRD.md` (produto geral), `PRD-Importation-product.md` (importação), `PRD-commerce-intelligence-engine.md` (engine), `PRD-product-intelligence-analysis.md` (job assíncrono e UX de espera), `PRD-content-briefing.md` (briefing, lotes, agenda, estúdio), `PRD-model-router-inteligence.md` (camada de modelos). ADRs registram decisões; este documento descreve a composição.

## 2. Forma do sistema

Monólito modular em TypeScript/Next.js com PostgreSQL/Prisma como fonte de registro. O Product Importer roda como um único componente/container com HTTP API, Agent Runner, Browser Harness, Chromium headless e integração com o Model Router/LLM.

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

Creator → Web/API → Product Importer
                         ↓
               Agent Runner + Browser Harness
                         ↓
                  Chromium headless → ProductCandidate
```
## 3. Mapa de módulos

| Módulo | Responsabilidade | Não possui |
|---|---|---|
| **Identity / Tenant** | sessão server-side, usuário, Tenant/workspace pessoal, autorização | colaboração, RBAC, SSO, billing |
| **Product Import** | Product Importer, Agent Runner, Browser Harness, Chromium headless, tentativa de importação, normalização, `ProductCandidate`, fallback manual | fatos sem confirmação humana, contexto estratégico |
| **Product** | fatos confirmados, origem/proveniência, correções do creator, readiness derivada (PENDING/ANALYZING/READY/FAILED) | decisão comercial, browser |
| **Commerce Intelligence** | `CommerceIntelligenceJob`, `IntelligenceRun`, orchestrator e capabilities (Product Understanding, Commercial Opportunity Mapping, Strategy Builder, Content Portfolio Planner, Brief Generator, Fact Validator, Quality Judge, Variety Gate, Repair), `ProductMemorySnapshot`, Platform Skill | revisão/aprovação, lotes, gravação |
| **Content Operations** | `Content`, `ContentBriefVersion`, revisão/edição/regeneração/aprovação/descarte, `RecordingBatch` + `RecordingBatchItem`, Agenda e Estúdio | estratégia, chamada direta a modelo |
| **Entitlements** | limites por plano, reserva/confirmação/liberação transacional, virada mensal | qualidade diferente por plano, cobrança |
| **Model Router / LLM Gateway** | tarefas lógicas → `IntelligenceTier` → provider adapter, validação de saída | decisão estratégica, regra de negócio |

Módulos são limites de código, não serviços. O Product Importer é um único componente/container da importação; não há Browser Service separado, portal ou microserviço adicional.

## 4. Fluxo do domínio

```text
URL → Product Importer → Agent Runner + Browser Harness → Chromium headless → ProductCandidate → Product
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

1. **Product Import:** valida a URL e inicia o Product Importer.
2. **Extração:** o Agent Runner usa o Browser Harness para observar/interagir seletivamente com Chromium headless e produz `ProductCandidate`; o LLM identifica o produto principal e os fatos relevantes.
3. **Confirmação:** creator revisa/edita e confirma (ou usa fallback manual com nome e descrição obrigatórios). `targetContentCount` é resolvido na mesma confirmação.
4. **Job:** confirmar persiste o `Product` ativo e cria o `CommerceIntelligenceJob` automaticamente.
5. **Engine:** dentro do job, o orchestrator executa Understanding → Opportunity Mapping → Strategy Builder → Portfolio Planner → Brief Generator → gates → persistência.
6. **Revisão:** contents entram em `DRAFT`; o creator edita/regenera, aprova ou descarta.
7. **Execução:** aprovados formam um `RecordingBatch` com data planejada; Agenda e Estúdio organizam a execução.

Identity/Tenant envolve todo o fluxo. Entitlements autoriza antes do job. Nenhuma camada assume a responsabilidade da outra.

## 5. Direção de dependências

```text
Web/API ───────┐
Worker ────────┼──> Application Use Cases ───> Domain Rules
Product Importer┘             │                      │
                             └─────────> Ports <────┘
                                               ↑
                                   Infrastructure Adapters
```

- Web, worker e Product Importer chamam casos de uso; não acessam banco, CDP, provider ou quota diretamente.
- O domínio não conhece Next.js, Prisma, HTTP, CDP, Browser Harness, prompts ou SDKs de provider.
- Ports existem para persistência, sessão, browser, fila e provider de modelo somente quando há fronteira real.
- Um módulo não lê tabelas de outro para contornar seu contrato.

## 6. Domínio, aplicação e infraestrutura

**Domínio:** Product e fatos confirmados com proveniência; Candidate não confiável; `ProductStrategy` versionada (ACTIVE/SUPERSEDED/STALE); `ContentPlan`/`ContentOpportunity`; `Content` + `ContentBriefVersion` imutáveis; `RecordingBatch`/`RecordingBatchItem`; regras derivadas de estado do lote; memória estruturada com pesos `gerado < aprovado < concluído`.

**Aplicação:** iniciar importação, consultar status, executar o Agent Runner, confirmar Candidate, criar Product + job, expor Strategy/Plan/Briefings, ações de revisão, criar/agendar lote, concluir conteúdo e resolver Entitlements. Chama o provider fora de transação; transações curtas.

**Infraestrutura:** Next.js, sessão server-side, PostgreSQL/Prisma, fila no PostgreSQL, worker, Product Importer (Docker, Chromium headless e Browser Harness), LLM Gateway/adapters de provider. Sem Browser Service separado, portal ou infraestrutura visual.

## 7. Contratos

### Importação

- `ProductCandidate` factual: nome, descrição, preço/moeda, categoria, marca, características, imagens, seller, variantes relevantes, `sourceUrl` — lacunas permanecem lacunas; nenhum campo estratégico.
- Confirmação humana é a única fronteira para `Product` ativo; correções confirmadas prevalecem sobre reextração; proveniência por fato (`browser-extraction | creator-confirmed`).
- A aplicação guarda apenas `tenantId → browserProfileId` e estado operacional mínimo. Nunca senha, cookie, token ou conteúdo do profile.

### Commerce Intelligence

- Schemas canônicos versionados: `ProductUnderstanding`, `CommercialOpportunity`, `ProductStrategy`, `ContentPlan`, `ContentOpportunity`, `Content`, `ContentBriefVersion`, `ProductMemorySnapshot`, `BriefValidationReport`, `IntelligenceRun`.
- Job público: `status` (QUEUED/RUNNING/SUCCEEDED/SUCCEEDED_PARTIAL/FAILED/CANCELLED — parcial declarado conforme ADR-021) + `stage` (UNDERSTANDING_PRODUCT → … → FINALIZING) com mensagens humanas mapeadas 1:1 para etapas reais. Sem percentual ou ETA inventados.
- `IntelligenceRun` registra engine version, skill version, modelo/provider por capability, custo, latência, retries — interno, nunca na UI.
- Todo Product `ACTIVE` retornado por leitura autenticada inclui `generationAction`: `AVAILABLE` com `reason`/`nextAction` nulos, ou `BLOCKED` com o par `GEN-ACTIVE`/`VIEW_ACTIVE_ANALYSIS` ou `GEN-CAPACITY`/`WAIT_FOR_CAPACITY`. Product `ARCHIVED` não serializa o campo; archive/reactivate retornam mutação mínima e a UI recarrega o Product. Não há novo código de bloqueio. O `POST` revalida e reserva transacionalmente. Ver ADR-016.
- Capacities seguem `Input Schema → Capability → Output Schema`. LLM nunca decide regra de sistema (estado de job, quota, persistência, versões).
- Fato ≠ inferência: a engine pode inferir por que alguém compraria; não pode inventar o que o Produto é. Fact Validator classifica claims (`SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED`, `CONTRADICTED`).
- Gates: hard Quality Gate determinístico por briefing/conjunto (estrutural, factual e variedade) seguido de judge semântico interno obrigatório por hook, development, script, CTA e cenas. Repair substitui somente partes não-PASS, preserva PASS e revalida hard gate e judge em cada composição; após no máximo 2 rounds globais, parte ainda não-PASS reprova o ITEM (nunca publica) — item reprovado é faltante no contrato de entrega do ADR-021 (`SUCCEEDED_PARTIAL` dentro do teto de falhas, `FAILED` fora dele; `SUCCEEDED` pleno mantém exact-N). `ContentSceneSet` continua entidade separada e é condição de sucesso.

### Model Router

```text
Engine Capability → Logical Intelligence Task → Model Router
  → IntelligenceTier (LOW/MID/HIGH) → Model Selection
  → LLM Gateway / Provider Adapter → Structured Output
  → Capability Contract Validation
```

- Capabilities determinísticas não passam pelo router. Tarefas lógicas (ex.: `PRODUCT_UNDERSTANDING`, `STRATEGY_SYNTHESIS`, `CONTENT_BRIEF_GENERATION`, `VARIETY_AUDIT`) têm tier padrão evoluível por evals.
- Padrão de custo: HIGH decide o conjunto, MID executa, HIGH audita. Curadoria usa `CONTENT_QUALITY_JUDGE`/HIGH e repair pontual `CONTENT_PART_REPAIR`/HIGH, sem fallback oculto. Regenerações locais reutilizam contexto (CTA → LOW; hook → LOW/MID; script → MID; replanejar conjunto → HIGH).
- Um provider por vez no MVP, atrás do adapter. Provider nunca entra na regra de negócio. Tiers nunca variam por plano comercial.
- Conteúdo extraído de páginas é dado não confiável, nunca instrução: separação explícita entre system instructions, contexto confiável da engine e conteúdo do Produto.

### Content Operations

- `Content` é identidade estável (`DRAFT`/`APPROVED`/`DISCARDED`); `ContentBriefVersion` é imutável; editar/regenerar cria versão; aprovar fixa a versão exata; edição posterior a aprovado exige nova aprovação para futuras execuções.
- `RecordingBatchItem` referencia `contentId` + `approvedVersionId`; edições posteriores não alteram lote montado. `DISCARDED` preserva memória — não é delete.
- Estados do lote são derivados: 0/N → `Aguardando`, 1..N-1 → `Gravando`, N/N → `Concluído`. Nunca administrados manualmente.

## 8. Fronteiras críticas

### Persistência

PostgreSQL é a fonte de registro: tenants/sessions, products, product_import_attempts/candidates, strategy versions, plans/opportunities, contents/brief versions, recording batches/items, intelligence jobs/runs, memory stats, entitlements/uso. O browser do Product Importer é efêmero na POC; profile persistente condicional é detalhe operacional do MVP e não é exposto ao domínio.
### Autorização e isolamento

Cookie opaco → sessão server-side → usuário + Tenant. Todo caso de uso aplica escopo; `tenantId` do cliente nunca é autoridade. Candidate, Product, job e resultados são escopados ao Tenant. O Product Importer valida URL, egress, limites e isolamento do Chromium.

### Browser headless

O Product Importer executa Chromium headless e Agent Runner com Browser Harness. Não há browser interativo, noVNC, portal, handoff ou autenticação manual do creator. Conteúdo da página é dado não confiável; ferramentas, duração, tokens, rede e navegação são limitados. Falha de acesso ou extração é recuperável e nunca produz candidato inventado.
### Processamento assíncrono

Uma transação curta persiste Product, cria `CommerceIntelligenceJob`, reserva Entitlement e devolve; o worker reivindica com lease, executa a engine fora de transação e finaliza em transação curta. `job.id` é a chave idempotente compartilhada com a reserva; retry técnico não duplica Strategy/Plan/Briefings nem consumo. MVP: um job ativo por usuário — `Analisar produto` fica desabilitado com explicação enquanto `QUEUED`/`RUNNING`. O job sobrevive a navegação e fechamento de aba; reabrir restaura o indicador global. Falha preserva Product e fatos; retry reutiliza o contexto confirmado.

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
| ADR-008 | URL-first, Candidate, confirmação e fallback manual |
| ADR-009 | identidade, Tenant e autorização |
| ADR-010 | superseded (API oficial) |
| ADR-011 | superseded — arquitetura Browser Service/portal/HITL removida |
| [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) | contratos canônicos da engine, gates, repair, memória e rastreabilidade |
| [ADR-013](./adr-013-model-router-e-intelligence-tier.md) | Model Router, `IntelligenceTier` e independência de provider |
| [ADR-014](./adr-014-platform-skill-versionada.md) | Platform Skill versionada (TikTok Commerce Creative Skill) |
| [ADR-016](./adr-016-projecao-de-acao-de-geracao.md) | projeção server-authoritative de `generationAction` para Product ativo |
| [ADR-015](./adr-015-content-operations-e-recording-batch.md) | Content Operations: versões de briefing, aprovação, `RecordingBatch`, estados derivados |
| [ADR-017](./adr-017-correlacao-sanitizada-de-provider.md) | correlação sanitizada de chamadas ao provider |

Se a implementação contrariar um ADR, o ADR é revisado antes. Se apenas conectar decisões já aceitas, este documento pode ser atualizado sem novo ADR.

## 12. Registro das decisões desta revisão

Novos: [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) (contratos canônicos da engine), [ADR-013](./adr-013-model-router-e-intelligence-tier.md) (Model Router e `IntelligenceTier`), [ADR-014](./adr-014-platform-skill-versionada.md) (Platform Skill versionada) e [ADR-015](./adr-015-content-operations-e-recording-batch.md) (Content Operations e `RecordingBatch`).

Revisões in-place: ADR-002 (contrato v1 superseded), ADR-004 (pesos de sinal e descarte como sinal), ADR-005 (`CommerceIntelligenceJob`, um job ativo por usuário, indicador global). ADR-008 foi alinhado ao Product Importer. ADR-011 foi superseded após a remoção do Browser Service, portal, HITL e profiles por usuário.
