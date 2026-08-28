# Slices — Commerce Intelligence

## Objetivo do mapa

Este documento decompõe o MVP em **Development Slices verticais orientados a comportamentos reais do creator**.

Cada slice deve entregar uma capacidade utilizável, observável e testável ponta a ponta, atravessando somente os domínios e a infraestrutura necessários para aquele comportamento.

Os slices devem respeitar o fluxo canônico atual do produto:

```text
Product Import
↓
ProductCandidate
↓
Confirmação humana dos fatos
+ quantidade inicial resolvida
↓
Product
↓
CommerceIntelligenceJob
↓
Commerce Intelligence Engine
↓
ProductStrategy
↓
ContentPlan
↓
ContentOpportunity
↓
Content + ContentBriefVersion em DRAFT
↓
Revisão
↓
Aprovação
↓
RecordingBatch
↓
Data planejada
↓
Agenda + Estúdio
↓
Execução
↓
Histórico / Product Memory
↓
Nova geração de conteúdos
reutilizando Strategy + Memory
```

Esse fluxo representa o domínio completo. Um slice não precisa atravessá-lo inteiro; deve cortar somente a parte necessária para entregar seu comportamento de usuário.

O primeiro valor do MVP é o creator conseguir indicar um Produto do TikTok Shop, confirmar os fatos encontrados e, sem preencher um formulário estratégico ou operar a engine passo a passo, receber **Briefings do Conteúdo úteis e prontos para revisão**.

Este documento é um mapa de construção.

Não é PRD, ADR, SPEC ou PLAN e não deve introduzir novas decisões de produto ou arquitetura.

## Princípios usados para definir os slices

* **Comportamento antes de camada:** nenhum slice existe apenas para criar Database, Frontend, API, Auth, Worker, Browser Service, Model Router ou outra infraestrutura.

* **Verticalidade suficiente:** cada slice atravessa somente os domínios necessários para entregar um comportamento real e verificável do creator.

* **Infraestrutura just-in-time:** infraestrutura entra quando uma capacidade real passa a depender dela. Browser Profile, Chromium e Browser Harness entram com Product Import; processamento assíncrono persistente, Model Router e validação de limites entram quando a primeira geração realmente precisa deles.

* **POC não é Development Slice:** riscos técnicos que precisam ser validados antes da implementação podem possuir Spikes/POCs próprios, mas não devem ser apresentados como valor entregue ao creator.

* **Fonte factual separada de inteligência:** Product Import encontra fatos e produz `ProductCandidate`. A Commerce Intelligence interpreta o Produto confirmado e produz Strategy, Plan, Opportunities e Briefings. Nenhuma das duas deve assumir o papel da outra.

* **Primeira geração sem wizard estratégico:** depois da confirmação dos fatos e da resolução da quantidade inicial, o `CommerceIntelligenceJob` começa automaticamente. Não existe aprovação obrigatória de Strategy nem botão intermediário obrigatório para gerar o Plan.

* **Processamento assíncrono é parte da experiência:** o creator pode continuar utilizando a aplicação enquanto a Commerce Intelligence trabalha. O App Shell comunica o estado através do Global Activity Indicator.

* **Human-in-the-loop explícito:** login, CAPTCHA, QR Code, 2FA e demais verificações solicitadas pelo TikTok pertencem ao creator. A automação pausa e continua depois da intervenção humana.

* **Content possui identidade e Briefing possui versão:** revisão, edição, regeneração e aprovação preservam `Content` como identidade estável e criam versões rastreáveis de `ContentBriefVersion`.

* **Aprovação e execução são etapas diferentes:** aprovar um Content não o coloca automaticamente em gravação. Contents aprovados são selecionados posteriormente para formar um `RecordingBatch`.

* **Lote significa gravação:** `RecordingBatch` é a unidade operacional do Estúdio. O termo `lote` não deve ser usado como sinônimo de geração de novos conteúdos.

* **Estados derivados quando possível:** o creator conclui Contents dentro do lote; `Aguardando`, `Gravando` e `Concluído` são derivados automaticamente do progresso e não administrados manualmente.

* **Memória construída pelo uso:** geração, aprovação, descarte e conclusão preservam sinais que alimentam Product Memory e permitem que gerações posteriores reduzam repetição sem reprocessar toda a Strategy.

* **Modelos são detalhe interno:** capabilities que exigem LLM usam tarefas lógicas e Model Router. `LOW`, `MID`, `HIGH`, provider, modelo, prompt e tokens não fazem parte da experiência do creator.

* **UX orientada à próxima ação:** Home, Produtos, Estúdio e Agenda devem comunicar o próximo comportamento útil, não a arquitetura interna do sistema.

* **Mobile completo, desktop expandido:** nenhuma capacidade essencial existe somente no desktop. O desktop aumenta densidade e planejamento; o mobile mantém o workflow completo com prioridade para execução.

* **Escopo explícito:** publicação, social scheduling, analytics externo, ROAS, CTR, geração de mídia, integrações adicionais, colaboração avançada, embeddings obrigatórios e demais não objetivos permanecem fora do MVP.

## Jornadas principais

### Ativação

```text
Criar conta
↓
colar URL do primeiro Produto
↓
abrir TikTok utilizando Browser Profile
↓
resolver autenticação manual quando necessário
↓
extrair fatos
↓
ProductCandidate
↓
confirmar ou corrigir fatos
+ resolver quantidade inicial
↓
Product persistido
↓
CommerceIntelligenceJob iniciado automaticamente
↓
Commerce Intelligence trabalha em segundo plano
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
reutilizar Browser Profile autenticado
↓
extrair fatos
↓
confirmar ProductCandidate
+ resolver quantidade inicial
↓
iniciar geração
```

O browser interativo só aparece quando existir necessidade real de intervenção humana.

### Recuperação de importação

```text
importação automática falha
↓
apresentar falha recuperável
↓
tentar novamente
ou
adicionar manualmente fatos mínimos
↓
confirmar Produto
↓
seguir para geração
```

Uma falha de browser não pode bloquear permanentemente a entrada do Produto.

### Primeira geração

```text
Product confirmado
+ targetContentCount resolvido
↓
CommerceIntelligenceJob
↓
Global Activity Indicator
↓
ProductStrategy
↓
ContentPlan
↓
ContentOpportunities
↓
Content + ContentBriefVersion em DRAFT
↓
resultado completo disponível para revisão
```

Strategy e Plan existem e permanecem consultáveis, mas não são gates obrigatórios da primeira experiência.

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

Editar ou regenerar cria nova `ContentBriefVersion`.

Aprovar preserva a versão exata escolhida.

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

A Agenda organiza **quando gravar**.

Ela não agenda publicação.

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
progresso do lote é atualizado
↓
Aguardando → Gravando → Concluído
```

O status do lote é derivado automaticamente da quantidade de itens concluídos.

### Recorrência

```text
Product existente
↓
solicitar nova geração de conteúdos
↓
informar targetContentCount
+ GenerationConstraints opcionais
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

A recorrência deve buscar novas oportunidades relevantes e reduzir repetição sem reconstruir desnecessariamente toda a inteligência do Produto.


## Sequência completa dos slices

### Slice 001 — Workspace pessoal e primeiro acesso

**User Outcome:** O creator consegue criar sua conta, entrar em seu Workspace pessoal e encontrar uma próxima ação clara para começar.

**Depends On:** `None`

**Domain Areas:** Identity / Tenant

**Scope:**

- Criar conta e sessão de acesso.
- Resolver um Tenant/Workspace pessoal para o usuário.
- Isolar o espaço pessoal desde o primeiro acesso.
- Abrir Hoje em estado vazio, orientando para `Adicionar produto`.

**Out of Scope:** Login social, SSO, organizações, múltiplos membros, RBAC, convites, billing por equipe, dashboard analítico e métricas externas.

---

### Slice 002 — Importação de Product via Browser com confirmação

**User Outcome:** O creator consegue colar uma URL do TikTok Shop, reutilizar ou criar seu browser profile isolado, autenticar manualmente quando necessário, revisar os fatos extraídos e confirmar um Product ativo; quando a importação falhar, consegue usar o fallback manual.

**Depends On:** Slice 001 — Workspace pessoal e primeiro acesso

**Domain Areas:** Browser Service, Product Import, Product, Entitlements

**Scope:**

- Instalar, versionar e validar o Browser Harness como dependência oficial antes da aceitação do fluxo.
- Executar uma POC real que comprove Chromium + profile persistente + login manual + reabertura autenticada + extração de um produto TikTok Shop.
- Aceitar URL de produto TikTok Shop como entrada principal e validar formato, tamanho e ausência de credenciais.
- Criar ou reutilizar um browser profile persistente associado ao Tenant/usuário; manter profiles isolados e armazenados em volume protegido.
- Abrir Chromium através do Browser Service e delegar navegação, Accessibility Tree, DOM/CDP, Structured Data e Network ao Browser Harness.
- Detectar bloqueios de interação humana e pausar com estados `LOGIN_REQUIRED`, `CAPTCHA_REQUIRED`, `2FA_REQUIRED` ou `USER_INTERACTION_REQUIRED`.
- Exibir o browser interativo para o creator resolver login, QR Code, CAPTCHA, 2FA ou confirmação humana; nunca automatizar essas etapas.
- Retomar a operação após a sessão ficar pronta e executar o Product Extraction Agent somente na página do produto indicado.
- Produzir um `ProductCandidate` com nome, descrição, preço/moeda, categoria, marca, características, imagens, seller, variantes relevantes e URL original, preservando lacunas e proveniência.
- Apresentar Candidate para revisão; permitir confirmar ou editar fatos antes de criar o Product ativo.
- Oferecer fallback manual com nome e descrição obrigatórios e demais fatos opcionais, sem campos estratégicos.
- Aplicar limite server-side de Products ativos e manter isolamento entre Tenants e Products.
- Encerrar o browser ao fim da operação sem destruir o profile persistente.
- Encaminhar para o Slice 003 somente depois da confirmação do Product; não iniciar Strategy no cadastro.

**Out of Scope:** TikTok OAuth, TikTok Shop API, login por senha/cookies fornecidos ao sistema, armazenamento de credenciais do TikTok, scraping universal, crawler, automação de CAPTCHA/2FA/QR Code, Strategy, Plan, Content, Generation, publicação, agendamento, analytics, sincronização de catálogo, outros marketplaces e download obrigatório de imagens.

---

### Slice 003 — Primeira Strategy e primeiro Plan de Content

**User Outcome:** O creator consegue definir quantidade e objetivo e receber, para um Product ativo confirmado por importação via Browser ou fallback manual, uma Strategy comercial com um Plan diversificado de Contents graváveis.

**Depends On:** Slice 001 — Workspace pessoal e primeiro acesso; Slice 002 — Importação de Product via Browser com confirmação

**Domain Areas:** Strategy, Plan, Content, Generation, Entitlements

**Scope:**

- Aceitar somente Product ativo, pertencente ao Tenant da sessão, com fatos confirmados suficientes e proveniência rastreável.
- Solicitar quantidade válida e objetivo/preferência opcional somente no momento da geração.
- Criar execução assíncrona durável, reservar capacidade mensal antes da fila e expor estados `queued`, `running`, `succeeded`, `failed` e `cancelled`.
- Permitir cancelamento seguro e retry do creator após falha/cancelamento sem duplicar execução, Content ou uso.
- Congelar fatos confirmados, proveniência, pedido e locale no `GenerationInput v1`; a primeira geração não consulta memória histórica.
- Entregar análise comercial com problema, benefícios, diferenciais, características, casos de uso, gatilhos, barreiras, riscos, argumentos, públicos, dores, desejos, objeções e ângulos relevantes.
- Entregar um Plan cuja distribuição seja consequência da Strategy e do pedido, não uma tabela fixa.
- Criar exatamente a quantidade solicitada de Contents graváveis, com público, dor, desejo/benefício, ângulo, hook, estrutura, script, cena e CTA; objeção quando aplicável.
- Exibir explicação estratégica curta e proveniência sem expor prompts, secrets ou complexidade desnecessária.
- Usar a mesma inteligência em todos os planos; Entitlements limita capacidade, nunca qualidade.

**Out of Scope:** Importação, Browser Service, Browser Harness, autenticação TikTok, edição/feedback/duplicação/regeneração de Content, novos lotes por memória, Production queue, modo de gravação, mídia, publicação, analytics externo, billing, colaboração, provider textual específico e LLM-as-judge.

---

### Slice 004 — Revisão e controle de Content

**User Outcome:** O creator consegue compreender, adaptar e controlar cada Content gerado antes de colocá-lo em Production.

**Depends On:** Slice 003 — Primeira Strategy e primeiro Plan de Content

**Domain Areas:** Content, Plan, Strategy

**Scope:** Visualizar dimensões e próxima ação; abrir Strategy progressivamente; editar hook, script, cenas, CTA, título e observações; registrar gostei/não gostei, excluir, editar e duplicar; preservar proveniência e memória ao retirar um Content da visão ativa.

**Out of Scope:** Regeneração de partes ou versão completa, seleção para lote, edição em massa e aprendizado automático.

---

### Slice 005 — Regeneração contextual de Content

**User Outcome:** O creator consegue regenerar uma parte ou uma versão de um Content sem repetir todo o contexto do Product e sem perder seu histórico.

**Depends On:** Slice 004 — Revisão e controle de Content

**Domain Areas:** Strategy, Content, Generation, Entitlements

**Scope:** Novo hook, ângulo, CTA, estrutura ou versão completa; preservar Product, Strategy, edições e proveniência; consumir capacidade; manter versões; aplicar variedade; tratar falha, cancelamento e retry.

**Out of Scope:** Novo lote, aprendizado por performance, avaliação semântica sofisticada e geração de mídia.

---

### Slice 006 — Fila de Production e lotes de gravação

**User Outcome:** O creator consegue selecionar Contents e organizá-los em uma fila e em lotes simples de gravação.

**Depends On:** Slice 003 — Primeira Strategy e primeiro Plan de Content

**Domain Areas:** Production, Content

**Scope:** Mover Contents para fila sem duplicar o corpus; selecionar múltiplos Contents; criar lote simples; organizar por Product e atributos já disponíveis; atualizar `Ideia`, `Pronto para gravar`, `Gravado`, `Publicado` e `Arquivado`; manter vínculos e isolamento.

**Out of Scope:** Publicação automática, agendamento, upload, armazenamento/edição de mídia e otimização por performance.

---

### Slice 007 — Modo de gravação contínua

**User Outcome:** O creator consegue usar a plataforma durante uma sessão real de gravação, marcar um Content como Gravado e escolher o próximo.

**Depends On:** Slice 006 — Fila de Production e lotes de gravação

**Domain Areas:** Production, Content

**Scope:** Mostrar hook, roteiro/cenas, CTA e status; permitir `Anterior`, `Próximo` e `Marcar como gravado`; confirmar avanço sem autoavanço; impedir duplo acionamento; recuperar falha de marcação.

**Out of Scope:** Captura, upload, edição ou geração de vídeo e publicação automática.

---

### Slice 008 — Novo lote com memória e variedade

**User Outcome:** O creator consegue solicitar um novo lote para o Product e receber Contents que priorizam lacunas estratégicas em vez de repetir excessivamente o histórico.

**Depends On:** Slice 003 — Primeira Strategy e primeiro Plan de Content

**Domain Areas:** Strategy, Plan, Content, Generation, Entitlements

**Scope:** Solicitar novo lote; consultar histórico autorizado; medir cobertura de públicos, dores, benefícios, objeções, ângulos, estruturas, hooks e CTAs; priorizar lacunas; bloquear duplicatas normalizadas; persistir proveniência e aplicar quota/idempotência.

**Out of Scope:** Embeddings, banco vetorial, deduplicação semântica sofisticada, LLM-as-judge e análise de performance externa.

---

### Slice 009 — Hoje como fila operacional

**User Outcome:** O creator consegue abrir Hoje e saber imediatamente o que precisa produzir agora, retomando a próxima ação de um Product ou lote real.

**Depends On:** Slice 006 — Fila de Production e lotes de gravação; Slice 007 — Modo de gravação contínua

**Domain Areas:** Production, Product

**Scope:** Priorizar Contents pendentes, lote atual, Products ativos e ação de continuar; exibir progresso ligado a Product/Content/lote; oferecer `Adicionar produto`, `Continuar produção` e, após Slice 008, `Gerar novo lote`.

**Out of Scope:** Dashboard analítico, KPI, gráficos, scorecards, CTR, ROAS, atribuição, vendas e página Home paralela.

---

### Slice 010 — Content Vault consultável

**User Outcome:** O creator consegue encontrar e consultar a memória dos seus Contents por Product, status, ângulo, data e texto relevante.

**Depends On:** Slice 004 — Revisão e controle de Content; Slice 006 — Fila de Production e lotes de gravação

**Domain Areas:** Content, Product, Production

**Scope:** Consultar histórico intelectual/operacional; buscar Products, hooks, scripts e tags; filtrar Product, status, ângulo e data; exibir proveniência; tratar Campanha somente como agrupamento opcional.

**Out of Scope:** Biblioteca de mídia, busca semântica, embeddings, analytics externo, campanhas obrigatórias e automação completa.

## Dependências entre slices

```text
001 Workspace
  ↓
002 Product via Browser + confirmação
  ↓
003 primeira Strategy + Plan + Contents
  ├──→ 004 revisão e controle
  │      └──→ 005 regeneração contextual
  ├──→ 006 fila e lotes de Production
  │      └──→ 007 modo de gravação
  └──→ 008 novo lote com memória e variedade

006 + 007 ──→ 009 Hoje operacional
003 + 004 + 006 ──→ 010 Content Vault
```

Observações:

- Slice 002 é aceito somente após a POC comprovar Browser Harness, profile persistente, login manual, reabertura autenticada e extração de produto real.
- Slice 003 é o primeiro ponto que exige Generation durável, fila PostgreSQL, worker, reserva mensal e validação de saída.
- Slice 003 não exige `ProductContext` estratégico no cadastro; fatos confirmados do Product e preferências da geração bastam.
- Slice 008 usa memória de Contents anteriores; não antecipa essa regra na primeira geração.
- Não há slice técnico intermediário: Browser Service entra em 002 e Generation/worker entra em 003 porque cada um termina em comportamento observável.

## Matriz de cobertura — requisito/capacidade do PRD → Slice responsável

| Requisito/capacidade | Slice responsável |
|---|---|
| Criar conta, sessão e Workspace pessoal | 001 |
| Colar URL TikTok Shop como entrada principal | 002 |
| Criar/reutilizar browser profile isolado por usuário | 002 |
| Persistir sessão no profile sem guardar login/senha | 002 |
| Iniciar Chromium e abrir URL | 002 |
| Browser Harness como dependência oficial validada | 002 |
| Inspeção semântica por Accessibility Tree, DOM/CDP, Structured Data e Network | 002 |
| Pausar para login, CAPTCHA, QR Code, 2FA ou interação humana | 002 |
| Retomar automação após intervenção humana | 002 |
| Product Extraction Agent extrair fatos | 002 |
| Produzir e revisar ProductCandidate | 002 |
| Confirmar/editar e persistir Product | 002 |
| Fallback manual mínimo | 002 |
| Limite de Products ativos e isolamento por Tenant | 002; transversal |
| Quantidade e objetivo opcional | 003 |
| Strategy e análise comercial | 003 |
| Públicos, dores, desejos, objeções e benefícios | 003 |
| Ângulos, hooks, estruturas, scripts, cenas e CTAs | 003 |
| Plan com distribuição estratégica | 003 |
| Generation assíncrona, estados, retry/cancelamento | 003; reutilizado em 005/008 |
| Quota mensal e reserva/liberação/confirmação | 003; reutilizado em 005/008 |
| Mesma inteligência em todos os planos | 003 |
| Edição, feedback e controle de Content | 004 |
| Regeneração contextual | 005 |
| Novo lote com memória e variedade | 008 |
| Production queue e lotes | 006 |
| Modo de gravação e marcação como Gravado | 007 |
| Hoje operacional | 009 |
| Content Vault, busca e filtros | 010 |
| Mobile completo e desktop expandido | 002–010, conforme superfície |
| Complexidade escondida por progressive disclosure | 003, 004, 007 e 010 |
| Proveniência e memória como diferencial | 002–010, conforme objeto |

## Capacidades explicitamente fora da cobertura do MVP

Não recebem slice: TikTok OAuth; TikTok Shop API; publicação/agendamento; analytics externo, ROAS, CTR, atribuição e tracking de vendas; seller catalog, pedidos, sincronização contínua; scraping universal/crawler; automação de CAPTCHA, QR Code, 2FA ou senha; armazenamento de login/senha do TikTok; outros marketplaces; geração/edição de vídeo, imagem ou áudio; CRM, finanças, colaboração, RBAC, SSO, i18n operacional; embeddings, banco vetorial, LLM-as-judge e aprendizado automático.

## Validação do mapa

### Cobertura

O mapa cobre o fluxo do PRD de Importação — URL → profile → Chromium → TikTok → interação humana quando necessária → extração → ProductCandidate → confirmação → Product — no Slice 002, e conecta o Product confirmado à Commerce Intelligence Engine no Slice 003. O restante do MVP geral segue Product → Strategy → Plan → Content → Production e fecha recorrência, fila, Hoje e Vault.

### Qualidade dos slices

| Slice | Resultado observável | Cenário E2E e oráculo |
|---|---|---|
| 001 | Workspace acessível | Criar conta → entrar → Hoje oferece `Adicionar produto`; outro Tenant não acessa os dados. |
| 002 | Product factual confirmado | Colar URL → abrir profile → resolver interação manual se necessário → extrair → confirmar; repetir com profile existente; falhar e usar manual; Product preserva fatos/proveniência e não duplica. |
| 003 | Primeiro Plan gravável | Product confirmado → informar quantidade → acompanhar `queued/running` → sucesso com Strategy, Plan e exatamente N Contents, ou falha/cancelamento recuperável. |
| 004 | Content controlável | Editar/feedback/duplicar/excluir → conteúdo e memória permanecem rastreáveis. |
| 005 | Regeneração contextual | Regenerar parte/versão → nova execução preserva contexto, quota e versão anterior. |
| 006 | Fila e lote | Selecionar Contents de Products distintos → criar lote → transições válidas sem misturar Products. |
| 007 | Gravação contínua | Abrir Content → avançar exige confirmação quando necessário → marcar Gravado → retry preserva contexto. |
| 008 | Novo lote variado | Gerar segunda rodada com histórico → lacunas priorizadas e duplicatas normalizadas rejeitadas. |
| 009 | Próxima ação em Hoje | Abrir Hoje com fila/lote → continuar ou adicionar Product; depois 008, também novo lote. |
| 010 | Histórico encontrável | Buscar/filtrar → resultados respeitam Product, status, ângulo, data, texto, Tenant e proveniência. |

### Riscos reais preservados para SPEC/PLAN

1. A POC do Browser Harness e a extração de um produto real são gates de 002; sem evidência, não declarar importação pronta.
2. O profile persistente é uma credencial sensível mesmo sem senha explícita; isolamento, permissões, volume e encerramento seguro precisam ser verificáveis.
3. A integração com TikTok é browser-based e human-in-the-loop; não converter o Browser Service em uma engine genérica de automação nem automatizar desafios humanos.
4. `ProductCandidate` continua não confiável até confirmação; o Product não recebe fatos inventados nem inicia Strategy antes da confirmação.
5. O gold-standard exigido pelo ADR-002 continua pré-condição de aceitação da engine de 003.
6. O método de login da aplicação e os valores comerciais de Entitlements continuam governados pelas decisões existentes; não inventar números no mapa.

Nenhuma alteração deste mapa antecipa código, SPEC ou PLAN de um slice futuro.
