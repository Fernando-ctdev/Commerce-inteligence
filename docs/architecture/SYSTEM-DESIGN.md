# System Design — Commerce Intelligence

**Status:** baseline de arquitetura derivado dos PRDs vigentes em `docs/product/`.
**Escopo:** como os limites arquiteturais se conectam. Não substitui PRDs, ADRs ou `DESIGN.md`.

## 1. Objetivo e escopo

Commerce Intelligence transforma um Produto confirmado em uma `ProductStrategy`, um `ContentPlan` diversificado, `Content` + Briefings revisáveis e organiza a execução em `RecordingBatch`, Agenda e Estúdio. O primeiro valor é o creator indicar um produto do TikTok Shop com o mínimo de entrada manual.

O MVP cobre:

- entrada URL-first via Browser Service + Browser Harness, com human-in-the-loop para login/CAPTCHA/QR Code/2FA e fallback manual mínimo;
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

Monólito modular em TypeScript/Next.js com PostgreSQL/Prisma como fonte de registro. Web app e worker compartilham o mesmo código e deploy. O Browser Service roda como componente isolado (container com Chromium, volume persistente de profiles, superfície interativa noVNC para human-in-the-loop) e usa o Browser Harness como dependência oficial de inspeção/CDP.

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

Creator → Web/API → Browser Service → Chromium + Browser Profile
                                          ↓
                                  Browser Harness → CDP → TikTok
```

## 3. Mapa de módulos

| Módulo | Responsabilidade | Não possui |
|---|---|---|
| **Identity / Tenant** | sessão server-side, usuário, Tenant/workspace pessoal, autorização | colaboração, RBAC, SSO, billing |
| **Browser Service** | browser profile persistente, lifecycle de Chromium, URL guard, human-in-the-loop, integração com Harness | Product, Strategy, credenciais do TikTok, automação de desafios |
| **Product Import** | tentativa de importação, Product Extraction Agent, normalização, `ProductCandidate`, fallback manual | fatos sem confirmação humana, contexto estratégico |
| **Product** | fatos confirmados, origem/proveniência, correções do creator, readiness derivada (PENDING/ANALYZING/READY/FAILED) | decisão comercial, browser |
| **Commerce Intelligence** | `CommerceIntelligenceJob`, `IntelligenceRun`, orchestrator e capabilities (Product Understanding, Commercial Opportunity Mapping, Strategy Builder, Content Portfolio Planner, Brief Generator, Fact Validator, Quality Judge, Variety Gate, Repair), `ProductMemorySnapshot`, Platform Skill | revisão/aprovação, lotes, gravação |
| **Content Operations** | `Content`, `ContentBriefVersion`, revisão/edição/regeneração/aprovação/descarte, `RecordingBatch` + `RecordingBatchItem`, Agenda e Estúdio | estratégia, chamada direta a modelo |
| **Entitlements** | limites por plano, reserva/confirmação/liberação transacional, virada mensal | qualidade diferente por plano, cobrança |
| **Model Router / LLM Gateway** | tarefas lógicas → `IntelligenceTier` → provider adapter, validação de saída | decisão estratégica, regra de negócio |

Módulos são limites de código, não serviços. Uma tabela pode apoiar mais de um fluxo. Browser Service existe separado porque profile, processo Chromium e interação humana têm invariantes e riscos próprios.

## 4. Fluxo do domínio

```text
URL → Browser Profile → Chromium → TikTok → ProductCandidate → Product
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
```

1. **Product Import:** valida URL, cria/reutiliza browser profile do Tenant, abre a página via Browser Service; com bloqueio humano (`LOGIN_REQUIRED`, `CAPTCHA_REQUIRED`, `2FA_REQUIRED`, `USER_INTERACTION_REQUIRED`), pausa e entrega o browser ao creator.
2. **Extração:** o Product Extraction Agent usa o Browser Harness (prioridade: Accessibility Tree → DOM/CDP → Structured Data → Network) e produz `ProductCandidate` com lacunas e proveniência.
3. **Confirmação:** creator revisa/edita e confirma (ou usa fallback manual com nome e descrição obrigatórios). `targetContentCount` é resolvido na mesma confirmação (preferência, default ou seletor compacto) sem nova navegação.
4. **Job:** confirmar persiste o `Product` ativo (limite server-side) e cria o `CommerceIntelligenceJob` automaticamente. O App Shell mostra o indicador global; o creator continua navegando.
5. **Engine:** dentro do job, o orchestrator executa Understanding → Opportunity Mapping → Strategy Builder (reutilizando `ProductStrategy` ACTIVE quando existir) → Portfolio Planner → Brief Generator → Fact Validation → Quality/Variety Gate → Repair → persistência.
6. **Revisão:** contents entram em `DRAFT`; o creator edita/regenera (nova `ContentBriefVersion`), aprova (fixa `approvedBriefVersionId`) ou descarta (preserva memória).
7. **Execução:** aprovados formam um `RecordingBatch` com data planejada; Agenda é visão temporal; Estúdio deriva `Aguardando`/`Gravando`/`Concluído` do progresso; histórico alimenta a memória.

Identity/Tenant envolve todo o fluxo. Entitlements autoriza antes do job. Nenhuma camada assume a responsabilidade da outra.

## 5. Direção de dependências

```text
Web/API ───────┐
Worker ────────┼──> Application Use Cases ───> Domain Rules
Browser Service┘             │                      │
                             └─────────> Ports <────┘
                                               ↑
                                   Infrastructure Adapters
```

- Web e worker chamam casos de uso; não acessam banco, profile, CDP, provider ou quota diretamente.
- Casos de uso resolvem Tenant pela sessão, aplicam autorização, verificam Entitlements, criam job/reserva e coordenam transações curtas.
- O domínio não conhece Next.js, Prisma, HTTP, cookies, CDP, Browser Harness, prompts ou SDKs de provider.
- Ports existem para persistência, sessão, browser, fila e provider de modelo. Sem fronteira real, sem interface.
- Um módulo não lê tabelas de outro para contornar seu contrato.

## 6. Domínio, aplicação e infraestrutura

**Domínio:** Product e fatos confirmados com proveniência; Candidate não confiável; `ProductStrategy` versionada (ACTIVE/SUPERSEDED/STALE); `ContentPlan`/`ContentOpportunity`; `Content` + `ContentBriefVersion` imutáveis; `RecordingBatch`/`RecordingBatchItem`; regras derivadas de estado do lote; memória estruturada com pesos `gerado < aprovado < concluído`.

**Aplicação:** iniciar importação, entregar/retomar browser, confirmar Candidate, criar Product + job, consultar status do job, expor Strategy/Plan/Briefings, ações de revisão, criar/agendar lote, concluir conteúdo, resolver Entitlements. Chama o provider fora de transação; transações curtas.

**Infraestrutura:** Next.js, sessão server-side, PostgreSQL/Prisma, fila no PostgreSQL, worker, Browser Service (Docker, Xvfb, noVNC, volume de profiles), Browser Harness, LLM Gateway/adapters de provider. Sem Redis/Kafka/banco vetorial no MVP.

## 7. Contratos

### Importação

- `ProductCandidate` factual: nome, descrição, preço/moeda, categoria, marca, características, imagens, seller, variantes relevantes, `sourceUrl` — lacunas permanecem lacunas; nenhum campo estratégico.
- Confirmação humana é a única fronteira para `Product` ativo; correções confirmadas prevalecem sobre reextração; proveniência por fato (`browser-extraction | creator-confirmed`).
- A aplicação guarda apenas `tenantId → browserProfileId` e estado operacional mínimo. Nunca senha, cookie, token ou conteúdo do profile.

### Commerce Intelligence

- Schemas canônicos versionados: `ProductUnderstanding`, `CommercialOpportunity`, `ProductStrategy`, `ContentPlan`, `ContentOpportunity`, `Content`, `ContentBriefVersion`, `ProductMemorySnapshot`, `BriefValidationReport`, `IntelligenceRun`.
- Job público: `status` (QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED) + `stage` (UNDERSTANDING_PRODUCT → … → FINALIZING) com mensagens humanas mapeadas 1:1 para etapas reais. Sem percentual ou ETA inventados.
- `IntelligenceRun` registra engine version, skill version, modelo/provider por capability, custo, latência, retries — interno, nunca na UI.
- Capacities seguem `Input Schema → Capability → Output Schema`. LLM nunca decide regra de sistema (estado de job, quota, persistência, versões).
- Fato ≠ inferência: a engine pode inferir por que alguém compraria; não pode inventar o que o Produto é. Fact Validator classifica claims (`SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED`, `CONTRADICTED`).
- Gates: Quality Gate por briefing (estrutural + factual + semântica quando necessária); Variety Gate no conjunto (subordinado à relevância); Repair Loop com causa da rejeição e limite de tentativas; briefings aprovados no gate são preservados durante repair dos demais.

### Model Router

```text
Engine Capability → Logical Intelligence Task → Model Router
  → IntelligenceTier (LOW/MID/HIGH) → Model Selection
  → LLM Gateway / Provider Adapter → Structured Output
  → Capability Contract Validation
```

- Capabilities determinísticas não passam pelo router. Tarefas lógicas (ex.: `PRODUCT_UNDERSTANDING`, `STRATEGY_SYNTHESIS`, `CONTENT_BRIEF_GENERATION`, `VARIETY_AUDIT`) têm tier padrão evoluível por evals.
- Padrão de custo: HIGH decide o conjunto, MID executa, HIGH audita. Regenerações locais reutilizam contexto (CTA → LOW; hook → LOW/MID; script → MID; replanejar conjunto → HIGH).
- Um provider por vez no MVP, atrás do adapter. Provider nunca entra na regra de negócio. Tiers nunca variam por plano comercial.
- Conteúdo extraído de páginas é dado não confiável, nunca instrução: separação explícita entre system instructions, contexto confiável da engine e conteúdo do Produto.

### Content Operations

- `Content` é identidade estável (`DRAFT`/`APPROVED`/`DISCARDED`); `ContentBriefVersion` é imutável; editar/regenerar cria versão; aprovar fixa a versão exata; edição posterior a aprovado exige nova aprovação para futuras execuções.
- `RecordingBatchItem` referencia `contentId` + `approvedVersionId`; edições posteriores não alteram lote montado. `DISCARDED` preserva memória — não é delete.
- Estados do lote são derivados: 0/N → `Aguardando`, 1..N-1 → `Gravando`, N/N → `Concluído`. Nunca administrados manualmente.

## 8. Fronteiras críticas

### Persistência

PostgreSQL é a fonte de registro: tenants/sessions, products, product_import_attempts/candidates, browser_profiles, strategy versions, plans/opportunities, contents/brief versions, recording batches/items, intelligence jobs/runs, memory stats, entitlements/uso. Campos de busca, filtro, variedade e autorização permanecem estruturados; payloads evolutivos da engine usam JSONB versionado. A busca textual inicial usa capacidades nativas; sem plataforma de busca.

### Autorização e isolamento

Cookie opaco → sessão server-side → usuário + Tenant. Todo caso de uso aplica escopo; `tenantId` do cliente nunca é autoridade. Browser profile, browser interativo, Candidate, Product, job e resultados são sempre escopados ao Tenant. Um Tenant jamais acessa profile, browser ou CDP de outro.

### Browser e human-in-the-loop

O browser interativo (noVNC) aparece somente quando necessário. Automação pausa, verifica conclusão e retoma; nunca automatiza CAPTCHA/senha/QR/2FA. Falha de extração não destrói profile; oferece retry ou fallback manual. Profile é tratado como credencial: volume protegido, permissões, backup/restore, retenção e sweeper de sessões órfãs são requisitos operacionais do Browser Service.

### Processamento assíncrono

Uma transação curta persiste Product, cria `CommerceIntelligenceJob`, reserva Entitlement e devolve; o worker reivindica com lease, executa a engine fora de transação e finaliza em transação curta. `job.id` é a chave idempotente compartilhada com a reserva; retry técnico não duplica Strategy/Plan/Briefings nem consumo. MVP: um job ativo por usuário — `Analisar produto` fica desabilitado com explicação enquanto `QUEUED`/`RUNNING`. O job sobrevive a navegação e fechamento de aba; reabrir restaura o indicador global. Falha preserva Product e fatos; retry reutiliza o contexto confirmado.

### Segurança de LLM

Prompt orienta, validação obriga. Nenhuma regra crítica vive só em prompt. Contexto mínimo por capability (slices de Strategy/Skill/Memory, não o mundo). Saída de provider é não confiável: schema, tamanho, cardinalidade, duplicatas e factualidade antes de persistir. Sem sucesso parcial silencioso: ou o conjunto fecha consistente, ou o job falha de forma recuperável.

## 9. Requisitos não funcionais mínimos

- **Durabilidade:** job persistente, retomável, sobrevive a deploy e reconnect; lease/timeout no worker.
- **Idempotência:** retry técnico e reentrada não duplicam resultado, consumo nem memória.
- **Observabilidade interna:** etapa/capability que falhou, skill/strategy/modelo usados, briefings rejeitados e motivos, repairs, custo e latência por capability. Nada disso vira UI.
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
| ADR-011 | Browser Service, profile persistente, Harness e human-in-the-loop (POC validada) |
| [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) | contratos canônicos da engine, gates, repair, memória e rastreabilidade |
| [ADR-013](./adr-013-model-router-e-intelligence-tier.md) | Model Router, `IntelligenceTier` e independência de provider |
| [ADR-014](./adr-014-platform-skill-versionada.md) | Platform Skill versionada (TikTok Commerce Creative Skill) |
| [ADR-015](./adr-015-content-operations-e-recording-batch.md) | Content Operations: versões de briefing, aprovação, `RecordingBatch`, estados derivados |

Se a implementação contrariar um ADR, o ADR é revisado antes. Se apenas conectar decisões já aceitas, este documento pode ser atualizado sem novo ADR.

## 12. Registro das decisões desta revisão

Novos: [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) (contratos canônicos da engine), [ADR-013](./adr-013-model-router-e-intelligence-tier.md) (Model Router e `IntelligenceTier`), [ADR-014](./adr-014-platform-skill-versionada.md) (Platform Skill versionada) e [ADR-015](./adr-015-content-operations-e-recording-batch.md) (Content Operations e `RecordingBatch`).

Revisões in-place: ADR-002 (contrato v1 superseded), ADR-004 (pesos de sinal e descarte como sinal), ADR-005 (`CommerceIntelligenceJob`, um job ativo por usuário, indicador global), ADR-006 (reserva por `job.id`), ADR-011 (aprendizados da POC). ADR-008 renomeado para `adr-008-entrada-de-produto-url-first.md` — o slug antigo ("manual-first") contradizia a decisão URL-first registrada nele.
