# Slices — Commerce Intelligence

## Objetivo do mapa

Este documento decompõe o MVP em **Development Slices verticais orientados a comportamentos reais do creator**.

Cada slice entrega uma capacidade utilizável, observável e testável ponta a ponta, atravessando somente os domínios e a infraestrutura necessários para aquele comportamento.

Os slices respeitam o fluxo canônico do produto:

```text
Product Import (URL → Candidate)
↓
Confirmação humana dos fatos + quantidade inicial resolvida
↓
Product
↓
CommerceIntelligenceJob (assíncrono, 1 ativo por usuário)
↓
Commerce Intelligence Engine
↓
ProductStrategy → ContentPlan → ContentOpportunity
↓
Content + ContentBriefVersion em DRAFT
↓
Revisão → Aprovação (versão fixada)
↓
RecordingBatch + data planejada
↓
Agenda + Estúdio
↓
Execução → Histórico / Product Memory
↓
Nova geração reutilizando Strategy + Memory
```

Um slice não precisa atravessá-lo inteiro; corta somente a parte necessária para entregar seu comportamento de usuário.

O primeiro valor do MVP é o creator indicar um Produto do TikTok Shop, confirmar os fatos encontrados e, sem preencher formulário estratégico ou operar a engine passo a passo, receber **Briefings do Conteúdo úteis e prontos para revisão**.

Este documento é um mapa de construção. Não é PRD, ADR, SPEC ou PLAN e não introduz decisões de produto ou arquitetura.

## Princípios usados para definir os slices

* **Comportamento antes de camada:** nenhum slice existe apenas para criar Database, Frontend, API, Auth, Worker, Product Importer ou Model Router.
* **Verticalidade suficiente:** cada slice atravessa somente os domínios necessários para entregar um comportamento real e verificável.
* **Infraestrutura just-in-time:** Product Importer, Chromium headless, Browser Harness e Agent Runner entram com a importação; job assíncrono durável, Model Router e validação de limites entram quando a primeira geração realmente precisa deles.
* **Fonte factual separada de inteligência:** Product Import encontra fatos e produz `ProductCandidate`. A Commerce Intelligence interpreta o Produto confirmado e produz Strategy, Plan, Opportunities e Briefings. Nenhuma assume o papel da outra.
* **Primeira geração sem wizard estratégico:** depois da confirmação dos fatos e da resolução da quantidade inicial, o `CommerceIntelligenceJob` começa automaticamente. Não existe aprovação obrigatória de Strategy nem botão intermediário.
* **Processamento assíncrono é parte da experiência:** um job ativo por usuário no MVP; o creator continua usando a aplicação e o App Shell comunica o estado pelo indicador global.
* **Extração agentic limitada:** o Agent Runner compreende a página com Browser Harness; ferramentas, duração, tokens, rede e navegação permanecem limitados e configuráveis.
* **Content possui identidade e Briefing possui versão:** editar, regenerar e aprovar preservam `Content` como identidade estável e criam versões rastreáveis de `ContentBriefVersion`; a versão aprovada é fixada.
* **Aprovação e execução são etapas diferentes:** aprovar não coloca em gravação; contents aprovados são selecionados para formar um `RecordingBatch`.
* **Lote significa gravação:** `RecordingBatch` é a unidade operacional do Estúdio; seus estados (`Aguardando`, `Gravando`, `Concluído`) são derivados do progresso. `lote` nunca significa nova geração de conteúdos.
* **Memória construída pelo uso:** geração, aprovação, descarte e conclusão preservam sinais que alimentam a `ProductMemorySnapshot`.
* **Modelos são detalhe interno:** capabilities usam tarefas lógicas e Model Router; `LOW/MID/HIGH`, provider e prompt não aparecem na experiência.
* **UX orientada à próxima ação:** Home, Produtos, Estúdio e Agenda comunicam o próximo comportamento útil, não a arquitetura interna.
* **Mobile completo, desktop expandido:** nenhuma capacidade essencial existe somente no desktop.
* **Escopo explícito:** publicação, social scheduling, analytics externo, ROAS, CTR, geração de mídia, embeddings obrigatórios e demais não objetivos permanecem fora do MVP.

## Jornadas principais

### Ativação

```text
Criar conta
↓
colar URL do primeiro Produto
↓
Product Importer abre a página em Chromium headless
↓
Agent Runner extrai fatos
↓
ProductCandidate
↓
confirmar ou corrigir fatos + resolver quantidade inicial
↓
Product persistido
↓
CommerceIntelligenceJob iniciado automaticamente
↓
Briefings ficam disponíveis
↓
revisar primeiro Content
```

### Reutilização da sessão

```text
Adicionar Produto
↓
colar URL
↓
executar Product Importer com browser efêmero
↓
extrair fatos
↓
confirmar + quantidade
↓
iniciar geração
```
### Recuperação de importação

```text
importação automática falha
↓
apresentar falha recuperável
↓
tentar novamente ou adicionar manualmente os fatos mínimos
↓
confirmar Produto
↓
seguir para geração
```

Uma falha de acesso ou extração não pode bloquear permanentemente a entrada do Produto; o fallback manual permanece disponível.

### Primeira geração

```text
Product confirmado + targetContentCount resolvido
↓
CommerceIntelligenceJob
↓
indicador global no App Shell
↓
ProductStrategy → ContentPlan → ContentOpportunities
↓
Content + ContentBriefVersion em DRAFT
↓
resultado completo disponível para revisão
```

Strategy e Plan permanecem consultáveis, mas não são gates obrigatórios.

### Revisão

```text
abrir Produto
↓
Conteúdos
↓
revisar Content
↓
editar / regenerar / descartar / aprovar
↓
preservar versões
```

Editar ou regenerar cria nova `ContentBriefVersion`. Aprovar preserva a versão exata escolhida.

### Organização da gravação

```text
selecionar Contents APPROVED
↓
criar RecordingBatch
↓
definir data planejada
↓
lote aparece na Agenda e no Estúdio
```

A Agenda organiza **quando gravar**; não agenda publicação.

### Execução

```text
abrir RecordingBatch no Estúdio
↓
consultar Guia de Gravação
↓
creator grava externamente
↓
Concluir conteúdo
↓
progresso do lote atualiza
↓
Aguardando → Gravando → Concluído
```

### Recorrência

```text
Product existente
↓
solicitar nova geração com targetContentCount
(+ GenerationConstraints opcionais)
↓
reutilizar ProductStrategy ativa
↓
consultar Product Memory
↓
planejar novas ContentOpportunities
↓
gerar novos Contents em DRAFT
↓
revisar
```

A recorrência busca novas oportunidades relevantes e reduz repetição sem reconstruir desnecessariamente toda a Strategy.

## Sequência completa dos slices

### Slice 001 — Workspace pessoal e primeiro acesso

**User Outcome:** O creator cria sua conta, entra em seu Workspace pessoal e encontra uma próxima ação clara para começar.

**Depends On:** `None`

**Domain Areas:** Identity / Tenant

**Scope:**

- Criar conta e sessão de acesso.
- Resolver um Tenant/Workspace pessoal para o usuário.
- Isolar o espaço pessoal desde o primeiro acesso.
- Abrir a Home em estado vazio, orientando para `Adicionar produto`.
- Configurações mínimas de conta e preferências básicas.

**Out of Scope:** Login social, SSO, organizações, múltiplos membros, RBAC, convites, billing por equipe, dashboard analítico e métricas externas.

---

### Slice 002 — Importação de Product via Product Importer

**User Outcome:** O creator fornece uma URL pública de produto; o Product Importer abre a página em Chromium headless, usa um Agent Runner especializado com Browser Harness para compreender o produto principal e devolve um `ProductCandidate` limpo para confirmação. Quando a extração falhar, o creator usa o fallback manual.

**Depends On:** Slice 001

**Domain Areas:** Product Import, Product, Entitlements

**Scope:**

**POC do fluxo definitivo:**

- Executar o Product Importer em um único container com HTTP API, Agent Runner, Browser Harness, Chromium headless e integração com LLM.
- Aceitar uma URL pública de produto, validando formato, tamanho, ausência de credenciais e destinos proibidos.
- Abrir a URL no Chromium headless e executar um Agent Runner especializado em Product Extraction.
- Permitir ao agente observar e interagir somente com a página analisada usando o menor conjunto de ferramentas necessário: Accessibility Tree, DOM, Structured Data, rolagem, cliques e expansão de seções.
- Usar a task lógica `PRODUCT_PAGE_EXTRACTION` sem selecionar provider/modelo diretamente no Product Importer.
- Restringir o agente ao produto principal da URL; ignorar navegação, reviews, banners, anúncios, recomendações e produtos relacionados.
- Proibir shell, filesystem, upload, download, novas abas, links arbitrários e navegação livre.
- Produzir `ProductCandidate` com nome, descrição, preço/moeda, categoria, marca, características, imagens, seller, variantes relevantes e URL original, preservando lacunas e proveniência.
- Aplicar schema validation, limpeza, normalização, deduplicação, limites e validação final de forma determinística depois do Agent Run.
- Usar browser efêmero, timeout simples, erro técnico genérico, logs básicos e execução síncrona aceitável na POC.
- Calibrar limites configuráveis (`maxSteps`, `maxDuration`, `maxTokens`, `maxNetworkInspections`) com 20–30 produtos públicos.
- Avaliar localização do produto principal, contaminação por conteúdo externo, campos ausentes, claims inventados e custo.

**Endurecimento do MVP no mesmo slice:**

- Expor endpoint autenticado `POST /product-imports` com resposta `202` e `importId`.
- Consultar o estado por `GET /product-imports/{id}`, com execução assíncrona e polling.
- Persistir `ProductImportAttempt`, estados terminais e erros recuperáveis.
- Aplicar concorrência limitada, timeout e cleanup garantidos.
- Registrar observabilidade mínima sanitizada.
- Evoluir para o schema canônico completo, incluindo `variants`.
- Usar profile persistente somente se a sessão técnica do TikTok exigir.
- Aplicar entitlement e limites de uso server-side.
- Adicionar regressão/evals com produtos reais.
- Apresentar o Candidate para revisão; resolver a quantidade inicial de conteúdos na mesma confirmação.
- Oferecer fallback manual com nome e descrição obrigatórios e demais fatos opcionais, sem campos estratégicos.
- Aplicar limite server-side de Products ativos com entitlement default provisionado por Tenant.

**Out of Scope:** Browser Service separado, browser interativo, portal, iframe, streaming visual, handoff, autenticação manual do creator, profile persistente por creator na POC, estados específicos de login/CAPTCHA/2FA, TikTok OAuth, TikTok Shop API, login por senha/cookies fornecidos ao sistema, armazenamento de credenciais do TikTok, scraping universal, crawler, automação de CAPTCHA/2FA/QR Code, Strategy, Plan, Content, geração, publicação, agendamento, analytics, sincronização de catálogo, outros marketplaces, download obrigatório de imagens, shell, filesystem, upload/download pelo agente, proxy, event bus, MCP, fila distribuída e microserviços adicionais.

---

### Slice 003 — Primeira geração: CommerceIntelligenceJob até Briefings

**User Outcome:** Depois de confirmar o Produto, o creator recebe, sem etapas intermediárias, uma Strategy comercial e um conjunto consistente de Briefings em `DRAFT` prontos para revisão — podendo continuar usando a aplicação enquanto a análise trabalha.

**Depends On:** Slice 002

**Domain Areas:** Commerce Intelligence (engine + job), Model Router, Entitlements, Content (criação), App Shell

**Scope:**

- Confirmar o Product persiste e cria automaticamente o `CommerceIntelligenceJob` com a `targetContentCount` resolvida.
- Execução assíncrona durável: fila no PostgreSQL, worker com lease, estados `QUEUED`/`RUNNING`/`SUCCEEDED`/`FAILED`/`CANCELLED`, stages públicos com mensagens humanas reais e retry idempotente.
- Um job ativo por usuário: `Analisar produto` desabilitado com explicação enquanto existir job `QUEUED`/`RUNNING`.
- Indicador global de atividade no App Shell: Produto, etapa real, sucesso, falha recuperável e ação seguinte; sobrevive a navegação e ao fechamento da aba.
- Primeira análise da engine: Product Understanding → Commercial Opportunity Mapping → ProductStrategy v1 → Content Portfolio Planner → Brief Generator.
- Carregar a TikTok Commerce Creative Skill versionada como dependência da geração.
- Roteamento de modelos por tarefa lógica com `IntelligenceTier` (LOW/MID/HIGH) e um provider atrás de adapter; capabilities determinísticas fora do router.
- Fact Validation, Quality Gate e Variety Gate com Repair Loop limitado; `BriefValidationReport` por briefing; nenhum sucesso parcial silencioso.
- Reservar capacidade mensal na criação do job e confirmar/liberar transacionalmente; sem cobrança duplicada em retry técnico.
- Persistir Strategy, ContentPlan, ContentOpportunities e `Content` + `ContentBriefVersion` iniciais em `DRAFT`.
- Strategy consultável depois na página do Produto; readiness do Produto alimenta o filtro `Pendentes`.
- Falha preserva Product e fatos; retry reutiliza o contexto confirmado.

**Out of Scope:** Fila visual de múltiplos jobs, prioridade manual, cancelamento como ação primária, edição/regeneração de briefing, lotes, memória histórica na primeira geração, aprendizado por performance, escolha de provider na UI, exposição de prompts/tiers/modelos.

---

### Slice 004 — Revisão e controle de Content

**User Outcome:** O creator compreende, edita, aprova ou descarta cada Briefing gerado, com versionamento rastreável.

**Depends On:** Slice 003

**Domain Areas:** Content Operations

**Scope:**

- Revisar Briefings no contexto do Produto, com navegação fluida entre 10, 20 ou mais contents (lista lateral, não dezenas de abas).
- Editar qualquer briefing (hook, script, cenas, CTA, título interno, observações) criando nova `ContentBriefVersion`.
- Aprovar fixando a versão exata (`approvedBriefVersionId`); edição posterior a aprovado exige nova aprovação para futuras execuções.
- Descartar (`DISCARDED`) preservando o Content e suas versões como memória — nunca exclusão destrutiva.
- Duplicar um Content existente.
- Explicabilidade curta e proveniência sob demanda (progressive disclosure), sem expor prompts ou detalhes internos.
- Aprovação individual e aprovação em lote dos selecionados.

**Out of Scope:** Regeneração de partes ou versão completa (Slice 005), seleção para lote, edição em massa, sinais `gostei`/`não gostei`, aprendizado automático.

---

### Slice 005 — Regeneração contextual de Content

**User Outcome:** O creator regenera uma parte ou a versão completa de um Content sem repetir todo o contexto e sem perder o histórico.

**Depends On:** Slice 004

**Domain Areas:** Commerce Intelligence (Brief Generator / Repair), Entitlements, Content Operations

**Scope:**

- Regenerar novo hook, novo CTA, nova estrutura, trocar ângulo ou versão completa.
- Reutilizar contexto persistido (Product, Strategy, versões); o usuário nunca re-explica o Produto.
- Toda regeneração cria nova `ContentBriefVersion` que precisa ser aprovada.
- Consumir capacidade de conteúdos gerados via Entitlements.
- Aplicar restrições de variedade sobre o histórico do Produto.
- Tratar falha de regeneração de forma recuperável, sem duplicar versões nem consumo.

**Out of Scope:** Replanejamento do conjunto (Slice 008), novos lotes, aprendizado por performance, avaliação semântica sofisticada, geração de mídia.

---

### Slice 006 — Lote de gravação e Agenda

**User Outcome:** O creator seleciona Contents aprovados, organiza um lote de gravação e escolhe quando pretende gravá-lo, visualizando tudo na Agenda.

**Depends On:** Slice 004

**Domain Areas:** Content Operations (RecordingBatch), Agenda

**Scope:**

- Selecionar múltiplos Contents `APPROVED` e criar um `RecordingBatch` pertencente a um único Produto.
- Cada item do lote referencia `contentId` + versão aprovada; edições posteriores não alteram o lote montado.
- Definir a data planejada na criação (`Hoje`, `Amanhã`, `Escolher data`), sem horário, recorrência ou lembretes.
- Reagendar o lote.
- Agenda com visões Dia, Semana e Mês; eventos mostram Produto, quantidade, progresso quando iniciado e data planejada.
- Ações `Abrir no Estúdio` e `Reagendar` nos eventos da Agenda.
- Agenda 100% interna; estados do lote derivados (`Aguardando` antes do primeiro conteúdo concluído).

**Out of Scope:** Publicação automática, agendamento de publicação, Google Calendar/lembretes externos, lote multi-produto, upload ou armazenamento de mídia.

---

### Slice 007 — Estúdio e execução contínua

**User Outcome:** Durante uma sessão real de gravação, o creator usa o Estúdio como guia, marca conteúdos concluídos e vê o lote avançar sem gestão manual de status.

**Depends On:** Slice 006

**Domain Areas:** Content Operations (Estúdio)

**Scope:**

- Esteira do Estúdio com os três estados derivados: `Aguardando`, `Gravando`, `Concluído` (0/N, 1..N-1/N, N/N concluídos).
- Abrir um lote e ver a lista de conteúdos com os já concluídos.
- Guia de Gravação por conteúdo: hook, roteiro, cenas e CTA, com `Anterior`, `Concluir conteúdo` e `Próximo`.
- Concluir atualiza imediatamente o progresso; `Próximo` não conclui implicitamente; sem autoavanço; conteúdo concluído não é concluído novamente por engano.
- Ao concluir todos, o lote passa automaticamente para `Concluído`.
- Recuperação de falha de marcação mantendo contexto e dados exibidos.
- Percentuais/progresso permitidos apenas como conclusão real do lote.
- Modo de gravação mobile com barra de ação sticky e navegação de uma mão.

**Out of Scope:** Captura, upload, edição ou geração de vídeo/áudio; câmera, REC ou preview; gestão de projetos genérica (sprints, responsáveis, dependências); publicação.

---

### Slice 008 — Nova geração com memória e variedade

**User Outcome:** O creator solicita um novo conjunto de conteúdos para um Produto existente e recebe Briefings que priorizam lacunas estratégicas em vez de repetir o histórico.

**Depends On:** Slice 003 (e Slice 005 para regenerações locais)

**Domain Areas:** Commerce Intelligence (Planner, gates, memória), Entitlements

**Scope:**

- Solicitar nova geração com `targetContentCount` e `GenerationConstraints` opcionais (objetivo, público, objeções, ângulos, duração, observações).
- Reutilizar a `ProductStrategy` ativa; restrições locais não reescrevem a Strategy.
- Construir `ProductMemorySnapshot` com pesos `gerado < aprovado < concluído` e descarte como sinal.
- Planner prioriza lacunas relevantes (públicos, dores, objeções, ângulos, hooks, estruturas, CTAs) e bloqueia duplicatas normalizadas.
- Variety Gate avalia o conjunto; relevância antes de variedade.
- Reavaliar explicitamente a Strategy quando fatos relevantes mudarem (regra `STALE`); Strategy substituída vira `SUPERSEDED` e contents históricos permanecem vinculados à versão usada.
- Persistir proveniência completa e aplicar quota/idempotência por job.

**Out of Scope:** Embeddings, banco vetorial, deduplicação semântica sofisticada, LLM-as-judge obrigatório, análise de performance externa, mudança automática de Strategy.

---

### Slice 009 — Home operacional

**User Outcome:** O creator abre a Home e sabe imediatamente o que precisa produzir agora, com o caminho mais curto para a próxima ação.

**Depends On:** Slice 006 e Slice 007

**Domain Areas:** Home (App Shell), Product, RecordingBatch

**Scope:**

- Campo para adicionar/analisar um novo Produto (respeitando o bloqueio de job ativo).
- Gravações planejadas para hoje, com progresso real.
- Lote iniciado que precisa ser continuado (`Continuar gravação`).
- Próximas gravações já planejadas.
- Para usuário novo, `Adicionar produto` assume a prioridade visual.

**Out of Scope:** Dashboard analítico, KPI, gráficos, scorecards, bloco `Ainda sem data`, números sem vínculo com Produto/lote, página Home paralela.

---

### Slice 010 — Histórico do Produto

**User Outcome:** O creator consulta, dentro do Produto, a memória intelectual e operacional dos seus conteúdos e lotes.

**Depends On:** Slice 004 e Slice 006

**Domain Areas:** Content Operations, Product

**Scope:**

- Área `Histórico` do Produto: lotes concluídos, contents concluídos, briefings aprovados e versões, dimensões utilizadas (público, dor, benefício, objeção, ângulo, hook, CTA).
- Busca por hooks, scripts e conteúdos do contexto do Produto; filtros por status e data.
- Exibir proveniência dos contents.
- Alimentar a memória usada pelas gerações subsequentes (os eventos já são persistidos; este slice expõe a visão).

**Out of Scope:** `Content Vault` como destino global de navegação, biblioteca de mídia, busca semântica, embeddings, analytics externo, campanhas obrigatórias.

## Dependências entre slices

```text
001 Workspace
 └─ 002 Importação com confirmação
     └─ 003 Primeira geração (job + engine + briefings)
         ├─ 004 Revisão e controle de Content
         │   ├─ 005 Regeneração contextual
         │   └─ 006 Lote e Agenda
         │       └─ 007 Estúdio e execução
         │           └─ 009 Home operacional (também depende de 006)
         ├─ 008 Nova geração com memória (após 004/005 para o loop completo)
         └─ 010 Histórico do Produto (depende de 004 e 006)
```

Nenhuma alteração deste mapa antecipa código, SPEC ou PLAN de um slice futuro.

## Matriz de cobertura — Requisito/capacidade do PRD → Slice

| Requisito/capacidade (PRD) | Slice |
|---|---|
| §31 Onboarding: conta, workspace, primeira ação clara | 001 |
| §31–32, §58 (1–2): URL → Candidate → confirmação | 002 |
| §10, §58 (2): fallback manual | 002 |
| §8, §58 (3): quantidade inicial resolvida na confirmação | 002 |
| §58 (4): Product persistido + job automático | 003 |
| §29 (analysis): job assíncrono, 1 ativo/usuário, indicador global, recuperação | 003 |
| §12–18 (PRD): análise, públicos, dores, desejos, objeções, benefícios, ângulos | 003 |
| §23: Content Plan com distribuição estratégica | 003 |
| §45, §58 (6–7): Strategy/Plan/Contents em `DRAFT` com Briefing | 003 |
| §34, §58 (13): limites de uso (produtos ativos) | 002 |
| §34, §58 (13): limites de uso (conteúdos/mês) | 003 / 005 / 008 |
| §36, §37, §58 (8): revisão, edição, aprovação, descarte com versões | 004 |
| §35, §58 (8): regeneração preservando contexto | 005 |
| §26, §58 (9–11): lote com data planejada + Agenda | 006 |
| §27, §58 (12–15): Estúdio, Guia de Gravação, conclusão, estados derivados | 007 |
| §24–25, §33, §58 (17): memória, variedade, nova geração reutilizando Strategy | 008 |
| §30: Home operacional | 009 |
| §29, §58 (16): histórico no contexto do Produto | 010 |
| §46: explicabilidade | 004 |
| §39: busca e filtros contextuais | 004 / 006 / 007 / 010 |
| §49–50: métricas de produto (instrumentação) | transversal aos slices, sem slice próprio |

Todo requisito do MVP está coberto por exatamente um slice responsável; nenhum slice é puramente técnico.
