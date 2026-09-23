# Slices — Commerce Intelligence

## Objetivo do mapa

Este documento decompõe o MVP em **Development Slices verticais orientados a comportamentos reais do creator**.

Cada slice entrega uma capacidade utilizável, observável e testável ponta a ponta, atravessando somente os domínios e a infraestrutura necessários para aquele comportamento.

Os slices respeitam o fluxo canônico do produto:

```text
Cadastro manual dos fatos + preparação (/products/new)
↓
Salvamento do Product (sem criar job)
↓
Ação explícita `Analisar produto`
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

O primeiro valor do MVP é o creator cadastrar os fatos do Produto em `/products/new`, acionar `Analisar produto` e, sem preencher formulário estratégico ou operar a engine passo a passo, receber **Briefings do Conteúdo úteis e prontos para revisão**.

Este documento é um mapa de construção. Não é PRD, ADR, SPEC ou PLAN e não introduz decisões de produto ou arquitetura.

## Princípios usados para definir os slices

* **Comportamento antes de camada:** nenhum slice existe apenas para criar Database, Frontend, API, Auth, Worker, Product Importer ou Model Router.
* **Verticalidade suficiente:** cada slice atravessa somente os domínios necessários para entregar um comportamento real e verificável.
* **Infraestrutura just-in-time:** a entrada URL-first do Slice 012 usa somente HTTP normal contra a CaptAPI; Browser Harness, Chromium, Browser Agent, portal e MCP não entram no runtime. Job assíncrono durável, Model Router e validação de limites entram quando a primeira geração realmente precisa deles.
* **Fonte factual separada de inteligência:** o cadastro factual (manual em `/products/new` ou candidato transitório vindo da CaptAPI no Slice 012) produz os fatos confirmados do Product somente após confirmação explícita. A Commerce Intelligence interpreta o Produto confirmado e produz Strategy, Plan, Opportunities e Briefings. Nenhuma assume o papel da outra.
* **Primeira geração sem wizard estratégico:** depois do salvamento e com a quantidade inicial já resolvida, a ação explícita `Analisar produto` inicia o `CommerceIntelligenceJob` automaticamente. Não existe aprovação obrigatória de Strategy nem botão intermediário.
* **Processamento assíncrono é parte da experiência:** um job ativo por usuário no MVP; o creator continua usando a aplicação e o App Shell comunica o estado pelo indicador global.
* **Extração externa limitada:** o Slice 012 aceita somente a resposta factual normalizada da CaptAPI HTTP, com allowlist, timeout, limites de resposta e fallback manual. Não há extração agentic, Browser Harness, portal ou MCP no runtime.
* **Content possui identidade e Briefing possui versão:** editar, regenerar e aprovar preservam `Content` como identidade estável e criam versões rastreáveis de `ContentBriefVersion`; a versão aprovada é fixada.
* **Aprovação e execução são etapas diferentes:** aprovar não coloca em gravação; contents aprovados são selecionados para formar um `RecordingBatch`.
* **Lote significa gravação:** `RecordingBatch` é a unidade operacional do Estúdio; seus estados (`Aguardando`, `Gravando`, `Concluído`) são derivados do progresso. `lote` nunca significa nova geração de conteúdos.
* **Memória construída pelo uso:** geração, aprovação, descarte e conclusão preservam sinais que alimentam a `ProductMemorySnapshot`.
* **Modelos são detalhe interno:** capabilities usam tarefas lógicas e Model Router; `LOW/MID/HIGH`, provider e prompt não aparecem na experiência.
* **UX orientada à próxima ação:** Home, Produtos, Estúdio e Agenda comunicam o próximo comportamento útil, não a arquitetura interna.
* **Mobile completo, desktop expandido:** nenhuma capacidade essencial existe somente no desktop.
* **Escopo explícito:** publicação, social scheduling, analytics externo, ROAS, CTR, geração de mídia, embeddings obrigatórios e demais não objetivos permanecem fora do MVP.

## Jornadas principais

> Fluxo de entrada vigente: **cadastro manual** (`/products/new`) ou URL pública analisada pela CaptAPI no Slice 012. Ambos convergem no mesmo formulário, exigem confirmação explícita antes de persistir e iniciam análise somente pela ação `Analisar produto`. O candidato URL-first é transitório e mantém fallback manual por faltas ou falhas.

### Ativação

```text
Criar conta
↓
cadastrar o primeiro Produto em /products/new (fatos + preparação)
↓
salvar Product (sem criar job)
↓
resumo factual e de preparação
↓
`Analisar produto`
↓
CommerceIntelligenceJob iniciado
↓
Briefings ficam disponíveis
↓
revisar primeiro Content
```

### Próximos Produtos

```text
Adicionar Produto
↓
/products/new (fatos + preparação)
↓
salvar Product
↓
`Analisar produto`
↓
iniciar geração
```

### Slice 012 — Entrada de Product por URL via CaptAPI HTTP

O Slice 012 está pendente e documentado em `docs/specs/slice-012/SPEC.md`; o PLAN ainda não foi criado. O creator cola uma URL pública, solicita análise explícita e recebe um candidato transitório no mesmo formulário manual. Campos ausentes permanecem editáveis sem valores inventados; falhas de URL, rede, HTTP, JSON, shape ou timeout devolvem o fluxo ao cadastro manual. A confirmação explícita usa o service/repository manual existente e somente então persiste o Product no Tenant.

O contrato aceita somente dados suportados pelo formulário: fatos disponíveis, no máximo a primeira imagem, e sinais opcionais `salesCount`, `ratingValue` e `reviewCount` apenas para leitura. Não há persistência de candidato, galeria completa, seller/brand/variants, Browser/portal/MCP em runtime, alteração de schema ou execução de código neste slice.

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
**Status possíveis:** `Pendente` · `Em andamento` · `Done`


### Slice 001 — Workspace pessoal e primeiro acesso
**Status:** `Done`


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

### Slice 002 — Cadastro manual de Product
**Status:** `Done`


**User Outcome:** O creator abre a subpágina `/products/new` dentro de Produtos, cadastra manualmente os fatos do Product com todos os campos obrigatórios, salva o registro escopado ao Tenant e abre seu resumo factual e de preparação. A análise só começa quando o creator aciona `Analisar produto`; editar e salvar alterações permanecem disponíveis antes dessa ação.

**Depends On:** Slice 001

**Domain Areas:** Product, Tenant

**Scope:**

- Disponibilizar a subpágina autenticada `/products/new` dentro de Produtos.
- Preservar os campos e o conteúdo do modal manual existente: Nome do produto, Descrição, Categoria, Preço, Moeda, Características — uma por linha — e a seção Preparação dos conteúdos.
- Exigir Nome, Descrição, Categoria, Preço, Moeda, ao menos uma Característica não vazia e Observações ou restrições.
- Validar Preço como valor não negativo, válido e com no máximo duas casas decimais; Preço e Moeda são ambos obrigatórios.
- Exibir `*` em Quantidade inicial de conteúdos, Formato do creator e Observações ou restrições; o asterisco é apenas indicação visual.
- Iniciar Preparação dos conteúdos com quantidade default `5`, intervalo inteiro `1–10`, formato default `Tanto faz` e notas/restrições obrigatórias até `300` caracteres.
- Validar todos os campos obrigatórios no HTML/cliente e no servidor.
- Persistir as preferências de preparação como restrições da primeira geração, sem iniciar geração nesta etapa.
- Salvar um `Product` com os fatos preenchidos, escopado ao `Tenant` resolvido pela sessão server-side.
- Após salvar, abrir o resumo do Product com fatos e preparação; o creator escolhe `Analisar produto`, `Editar produto` ou, durante edição, `Salvar alterações`.
- Manter validação, mensagens de erro, estado de salvamento, acessibilidade e experiência mobile alinhados ao `DESIGN.md`.

**Out of Scope:** URL, serviço automatizado de descoberta de produto, LLM, Model Router, Agent Runner, Browser Harness, Chromium, browser headless ou interativo, Docker, descoberta automática de dados, geração de Strategy, Plan, Content ou Briefing, criação/execução de `CommerceIntelligenceJob`, publicação, agendamento, analytics, sincronização de catálogo, outros marketplaces, campos estratégicos, upload de arquivos, captura de mídia, criação de SPEC ou PLAN.

**Critérios necessários:**

1. `/products/new` é acessível a partir de Produtos para usuário autenticado.
2. O formulário apresenta os campos factuais e a seção de preparação do modal manual existente.
3. Nome, Descrição, Categoria, Preço, Moeda, ao menos uma Característica não vazia e Observações ou restrições obrigatoriamente preenchidos bloqueiam o salvamento quando ausentes, vazios ou inválidos.
4. Preço deve ser não negativo, válido e ter no máximo duas casas decimais; Moeda deve ser informada.
5. A preparação usa defaults `5`, `1–10` e `Tanto faz`; Quantidade e Formato aparecem com `*`, e Observações ou restrições são obrigatórias e limitadas a `300` caracteres.
6. O asterisco é apenas indicação visual; HTML/cliente e servidor validam os campos obrigatórios.
7. O salvamento persiste os fatos preenchidos e as restrições da primeira geração sem iniciar geração ou criar job.
8. O Product é escopado ao Tenant da sessão e não é visível para outro Tenant.
9. Após salvar, o creator abre o resumo factual e de preparação; `Analisar produto` é uma ação explícita e não um efeito do salvamento.
10. Cancelar não cria Product; erros mantêm os valores preenchidos e permitem nova tentativa.

---

### Slice 003 — Primeira geração: CommerceIntelligenceJob até Briefings
**Status:** `Pendente`


**User Outcome:** Depois de acionar `Analisar produto` sobre o Produto salvo, o creator recebe, sem etapas intermediárias, uma Strategy comercial e um conjunto consistente de Briefings em `DRAFT` prontos para revisão — podendo continuar usando a aplicação enquanto a análise trabalha.

**Depends On:** Slice 002

**Domain Areas:** Commerce Intelligence (engine + job), Model Router, Entitlements, Content (criação), App Shell

**Scope:**

- A ação explícita `Analisar produto` sobre o Product salvo cria automaticamente o `CommerceIntelligenceJob` com a `targetContentCount` resolvida.
- Execução assíncrona durável: fila no PostgreSQL, worker com lease, estados `QUEUED`/`RUNNING`/`SUCCEEDED`/`SUCCEEDED_PARTIAL`/`FAILED`/`CANCELLED`, stages públicos com mensagens humanas reais e retry idempotente.
- Um job ativo por usuário: `Analisar produto` desabilitado com explicação enquanto existir job `QUEUED`/`RUNNING`.
- Indicador global de atividade no App Shell: Produto, etapa real, sucesso, falha recuperável e ação seguinte; sobrevive a navegação e ao fechamento da aba.
- Primeira análise da engine: Product Understanding → Commercial Opportunity Mapping → ProductStrategy v1 → Content Portfolio Planner → Brief Generator.
- Carregar a TikTok Commerce Creative Skill versionada como dependência da geração.
- Roteamento de modelos por tarefa lógica com `IntelligenceTier` (LOW/MID/HIGH) e um provider atrás de adapter; capabilities determinísticas fora do router.
- Fact Validation, Quality Gate e Variety Gate com Repair Loop limitado; `BriefValidationReport` por briefing; nenhum sucesso parcial silencioso — parcial somente como `SUCCEEDED_PARTIAL` declarado, revalidado e com retry dos faltantes (ADR-021).
- Reservar capacidade mensal na criação do job e confirmar/liberar transacionalmente; sem cobrança duplicada em retry técnico.
- Persistir Strategy, ContentPlan, ContentOpportunities e `Content` + `ContentBriefVersion` iniciais em `DRAFT`.
- Strategy consultável depois na página do Produto; readiness do Produto alimenta o filtro `Pendentes`.
- Falha preserva Product e fatos; retry reutiliza o contexto confirmado.
- **Responsabilidade única do parcial e do retry dos faltantes (ADR-021):** o Slice 003 é o único responsável por `SUCCEEDED_PARTIAL` — publicação dos aprovados, variedade revalidada, motivo sanitizado por item, quota D confirmada/N−D liberada e a ação `Gerar faltantes` (novo job com reserva F, reusando Strategy e sinais já persistidos). O Slice 008 não implementa nem duplica esse fluxo.

**Out of Scope:** Fila visual de múltiplos jobs, prioridade manual, cancelamento como ação primária, edição/regeneração de briefing, lotes, memória histórica na primeira geração, aprendizado por performance, escolha de provider na UI, exposição de prompts/tiers/modelos.

---

### Slice 004 — Revisão e controle de Content
**Status:** `Pendente`


**User Outcome:** O creator compreende, edita, aprova ou descarta cada Briefing gerado, com versionamento rastreável.

**Depends On:** Slice 003

**Domain Areas:** Content Operations

**Scope:**

- Revisar Briefings no contexto do Produto, com navegação fluida entre os contents.
- Editar qualquer briefing (hook, script, cenas, CTA, título interno, observações) criando nova `ContentBriefVersion`.
- Aprovar fixando a versão exata (`approvedBriefVersionId`); edição posterior a aprovado exige nova aprovação para futuras execuções.
- Descartar (`DISCARDED`) preservando o Content e suas versões como memória — nunca exclusão destrutiva.
- Duplicar um Content existente.
- Explicabilidade curta e proveniência sob demanda (progressive disclosure), sem expor prompts ou detalhes internos.
- Aprovação individual e aprovação em lote dos selecionados.

**Out of Scope:** Regeneração de partes ou versão completa (Slice 005), seleção para lote, edição em massa, sinais `gostei`/`não gostei`, aprendizado automático.

---

### Slice 005 — Regeneração contextual de Content
**Status:** `Pendente`


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
**Status:** `Pendente`


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
**Status:** `Pendente`


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
**Status:** `Pendente`


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
- `Gerar faltantes` após `SUCCEEDED_PARTIAL` **pertence exclusivamente ao Slice 003** (ADR-021); este slice trata apenas de novas gerações arbitrárias com `targetContentCount` e constraints escolhidos pelo creator.

**Out of Scope:** Embeddings, banco vetorial, similaridade/deduplicação semântica e judge LLM de variedade ou memória, análise de performance externa, mudança automática de Strategy. `CONTENT_QUALITY_JUDGE` interno pertence ao Slice 003: executa após o hard gate, limitado a hook, development, script, CTA e cenas, com repair seletivo (máximo 2 rounds) e falha fail-closed; entrega parcial segue o contrato declarado do ADR-021; não oferece UI, aprovação humana, ranking ou seleção de modelo.

---

### Slice 009 — Home operacional
**Status:** `Pendente`


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
**Status:** `Pendente`

**User Outcome:** O creator consulta, dentro do Produto, a memória intelectual e operacional dos seus conteúdos e lotes.

**Depends On:** Slice 004 e Slice 006

**Domain Areas:** Content Operations, Product

**Scope:**

- Área `Histórico` do Produto: lotes concluídos, contents concluídos, briefings aprovados e versões, dimensões utilizadas (público, dor, benefício, objeção, ângulo, hook, CTA).
- Busca por hooks, scripts e conteúdos do contexto do Produto; filtros por status e data.
- Exibir proveniência dos contents.
- Alimentar a memória usada pelas gerações subsequentes (os eventos já são persistidos; este slice expõe a visão).
- Exibir, por job, `jobId`, status, timestamps, usage agregado e custo estimado agregado; por Content, somente custo quando houver atribuição direta. Custo usa `COMPLETE`, `PARTIAL` ou `UNAVAILABLE`; usage ausente permanece `null`, e ausência de custo reportado não vira `USD 0`.
- Leitura dedicada do Histórico por Product, autenticada e tenant-scoped; jobs legados sem usage/preço mostram usage nulo e custo `UNAVAILABLE`, sem backfill estimado.

**Out of Scope:** `Content Vault` como destino global de navegação, biblioteca de mídia, busca semântica, embeddings, analytics externo, campanhas obrigatórias, dashboard/KPI global e exposição creator-facing de provider, modelo, tier, prompts, logs, latência, hashes, pricing source/rates, capability rows ou metadata bruto.
---

### Slice 011 — Meu estilo e CreatorContext
**Status:** `Pendente — documentação concluída; código bloqueado até coordenação`

**User Outcome:** O creator abre `Meu estilo` pelo botão já existente na sidebar, salva preferências recorrentes e recebe novas gerações adaptadas ao seu estilo sem misturar preferências, fatos de Product e `GenerationConstraints`.

**Depends On:** Slice 001; Slice 003 para a integração da geração

**Domain Areas:** Identity/Tenant, Creator Preferences, Commerce Intelligence, Configurações

**Scope:**

- Persistir `CreatorPreferences` no registro one-to-one `TenantPreference`, scoped por `tenantId`.
- Expor leitura e atualização autenticadas via Configurações.
- Validar defaults, tipos, limites, cardinalidade e campos desconhecidos server-side.
- Capturar snapshot estável no `CommerceIntelligenceJob`.
- Projetar `CreatorContext` por capability com allowlist e limite de contexto.
- Preservar o botão `Meu estilo` na sidebar em desktop, tablet e mobile.
- Registrar na SPEC/PLAN a exceção explícita do usuário à navegação fixa do `DESIGN.md`; não alterar `DESIGN.md`.

**Out of Scope:** preferências por Product, equipes/RBAC, geração de áudio/vídeo, publicação, analytics, recomendação automática, reescrita de Strategy, nova navegação operacional e alteração do `DESIGN.md`.

**Documentação:** `docs/architecture/adr-018-creator-preferences-e-context.md`, `docs/specs/slice-011/SPEC.md`, `docs/plans/slice-011/PLAN.md`.

---

### Slice 012 — Entrada de Product por URL via CaptAPI HTTP
**Status:** `Pendente — SPEC para revisão; PLAN ainda não criado`

**User Outcome:** O creator cola uma URL pública de produto, analisa explicitamente e revisa o candidato no mesmo formulário de cadastro manual antes de confirmar e salvar o Product.

**Depends On:** Slice 002; o Product confirmado alimenta o fluxo de geração do Slice 003.

**Domain Areas:** Product, Product Import, Identity/Tenant, segurança de integração externa

**Scope:** CaptAPI HTTP normal com `GET /v1/tiktok-shop/product-details`, `region=BR` e Bearer somente do ambiente; candidato transitório com campos suportados pelo formulário; primeira imagem apenas; sinais opcionais somente leitura; estados de importação e fallback manual; confirmação explícita e persistência pelos serviços existentes; tenant, segurança, idempotência e testes determinísticos.

**Out of Scope:** Browser, Chromium, Browser Harness, portal, MCP em runtime, scraping, OAuth, nova tabela/schema, persistência de candidato, galeria completa, seller/brand/variants, valores inventados, PLAN e implementação.

**Documentação:** `docs/specs/slice-012/SPEC.md`, `docs/architecture/adr-027-importacao-tiktok-shop-captapi.md`, `docs/architecture/adr-028-slice-012-candidate-transitorio-captapi-http.md`.

---

### Slice 013 — Conteúdos publicados e performance vinculada ao Produto
**Status:** `Pendente — implementação bloqueada até aprovação da SPEC`

**User Outcome:** No detalhe de um Product, o creator abre Conteúdos e vê os vídeos publicados associados ao item da Vitrine daquele Product, incluindo dados de negócio e métricas fornecidos, com reprodução sob demanda e sem confundir esses vídeos externos com os Briefings gerados pela Commerce Intelligence.

**Depends On:** Slice 002 para `Product.provenance.sourceId`; é independente do Slice 003 porque o read model externo não reutiliza `Content` nem `ContentBriefVersion`.

**Domain Areas:** Product (leitura autenticada), Conteúdos publicados (read model externo transitório), associação item→Product, apresentação de performance.

**Scope:** fixtures sanitizadas e separadas para Products da Vitrine, analytics paginado de vídeos e associação `item_id (vídeo) → product_id (produto externo)`; join server-side pelo `Product.provenance.sourceId === association.product_id`; `GET /api/products/:id/linked-contents?page&pageSize` tenant-scoped; associação many-to-many; preservação de `total`, `hasMore` e paginação; reprodução de `main_url` com um único fallback para `backup_url`; carga automática ao abrir Conteúdos; CTA de gerar roteiro derivado visível, desabilitado e explicado; master-detail desktop e pilha mobile.

**Out of Scope:** chamada TikHub ou qualquer provedor externo, OAuth, cookies/tokens de autenticação, persistência, tabela/migração, mutação de Product/Content/Strategy, geração de roteiro, publicação, agendamento, sincronização, retry de rede, aprendizado por performance, ranking, alteração automática de Strategy ou nova geração. A exceção de leitura é somente `main_url`/`backup_url` normalizados como URLs HTTPS expiráveis de playback em `*.tiktokcdn.com`.

**Documentação:** `docs/specs/slice-013/SPEC.md`, `docs/architecture/adr-032-conteudos-publicados-e-performance.md`.

---

### Atualização deliberada de navegação

O `DESIGN.md` mantém sua lista fixa como baseline visual, mas a decisão explícita do usuário prevalece para este slice: `Meu estilo` é um botão adicional da sidebar. Ele aponta somente para a área de preferências e não cria destinos paralelos para Hoje, Produção, Conteúdos ou Vault.

---


## Dependências entre slices

```text
001 Workspace
 └─ 002 Entrada de Product: cadastro manual + ação explícita `Analisar produto`
      ├─ 003 Primeira geração (job + engine + briefings)
      │   ├─ 004 Revisão e controle de Content
      │   │   ├─ 005 Regeneração contextual
      │   │   └─ 006 Lote e Agenda
      │   │       └─ 007 Estúdio e execução
      │   │           └─ 009 Home operacional (também depende de 006)
      │   ├─ 008 Nova geração com memória (após 004/005 para o loop completo)
      │   ├─ 010 Histórico do Produto (depende de 004 e 006)
      │   └─ 011 Meu estilo e CreatorContext (depende de 001 e integra geração após 003)
      ├─ 012 Entrada URL via CaptAPI: candidato transitório + confirmação no formulário manual
      └─ 013 Conteúdos publicados e performance (leitura externa mockada; independente de 003)
```

Nenhuma alteração deste mapa antecipa código, SPEC ou PLAN de um slice futuro.

## Matriz de cobertura — Requisito/capacidade do PRD → Slice

| Requisito/capacidade (PRD) | Slice |
|---|---|
| §31 Onboarding: conta, workspace, primeira ação clara | 001 |
| §31–32, §58 (1–2): URL → Candidate → confirmação | 012 (CaptAPI HTTP; candidato transitório e confirmação no formulário manual) |
| §10, §58 (2): entrada/fallback manual | 002 / 012 |
| §8, §58 (3): quantidade inicial resolvida no cadastro | 002 |
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
| PRD §11 e PRD-Engine §23: CreatorPreferences persistente e CreatorContext por capability | 011 |
| Decisão explícita do usuário: botão Meu estilo na sidebar | 011; exceção registrada em SPEC/PLAN, sem alterar DESIGN |
| §46: explicabilidade | 004 |
| §39: busca e filtros contextuais | 004 / 006 / 007 / 010 |
| §49–50: métricas de produto (instrumentação) | transversal aos slices, sem slice próprio |
| Decisão explícita do usuário: vídeos publicados e performance mockada no contexto do Product | 013; exceção localizada, sem alterar PRD/DESIGN/SYSTEM-DESIGN |

Todo requisito do MVP está coberto por exatamente um slice responsável; nenhum slice é puramente técnico.
