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

