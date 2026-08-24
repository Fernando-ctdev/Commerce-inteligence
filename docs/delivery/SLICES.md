# Slices — Commerce Intelligence

## Objetivo do mapa

Este documento decompõe o MVP em **Development Slices verticais orientados a comportamento real do creator**. Cada slice atravessa somente os domínios necessários para entregar uma capacidade utilizável, observável e testável ponta a ponta.

O mapa segue o core loop canônico:

```text
Product → Strategy → Plan → Content → Production
```

O resultado esperado do MVP é o creator conseguir transformar um Product em uma sequência de Contents estratégicos, editáveis e organizados para gravação, voltar a gerar novos lotes sem repetir excessivamente o histórico e trabalhar mais de um Product sem perder contexto.

Este documento é um mapa de construção. Não é SPEC, PLAN ou decisão para alterar as fontes canônicas.

## Princípios usados para definir os slices

- **Comportamento antes de camada:** nenhum slice existe apenas para criar Database, Frontend, API, Auth, Worker, Prisma ou infraestrutura.
- **Verticalidade suficiente:** cada slice percorre apenas os domínios necessários para uma capacidade real do creator.
- **Sequência do core loop:** a ordem segue Product → Strategy → Plan → Content → Production e depois fecha o ciclo com memória, novos lotes e recorrência.
- **Primeiro valor rápido:** o creator deve sair do primeiro acesso até o primeiro Plan de Content sem conhecer toda a plataforma.
- **Infraestrutura just-in-time:** a infraestrutura de geração durável e limites de uso entra no primeiro slice que precisa gerar o primeiro resultado, não como preparação especulativa.
- **Strategy como decisão:** a engine deve produzir análise comercial, contexto estratégico, distribuição de Plan, dimensões de variedade e Contents graváveis; não apenas texto solto.
- **Memória como diferencial:** histórico, proveniência e dimensões estratégicas permanecem disponíveis para impedir repetição e sustentar novos lotes.
- **Manual-first:** Product pode começar por nome e descrição; URL é enriquecimento opcional e best-effort, sem dependência de scraping ou de TikTok Shop.
- **Produção manual:** no MVP, Production significa o creator organizar, gravar e atualizar estados; não significa gerar ou publicar mídia automaticamente.
- **UX orientada à próxima ação:** a interface deve priorizar o que o creator precisa fazer agora, com mobile completo e execução favorecida.
- **Escopo explícito:** vídeo/imagem/áudio gerados, publicação, analytics externo, colaboração, i18n operacional, embeddings e integrações de plataforma permanecem fora do MVP.

## Core loop e jornadas derivadas do PRD

### Core loop

1. O creator cria sua conta e entra em um Workspace pessoal.
2. Adiciona um Product por entrada manual-first e fornece o contexto que altera a Strategy.
3. Define objetivo e quantidade e solicita a primeira geração.
4. Recebe análise comercial, Strategy, Plan e Contents com hook, estrutura, script, cenas e CTA.
5. Revisa, edita, marca gostei/não gostei, exclui, duplica ou regenera partes sem perder o contexto.
6. Coloca Contents na Production queue, cria lotes simples e grava.
7. Marca Contents como Gravado e avança para o próximo item.
8. Consulta memória e histórico para gerar novos lotes com variedade.
9. Repete o ciclo para o mesmo Product ou para Products adicionais.

### Jornadas principais

- **Ativação:** criar conta → adicionar Product → informar contexto → gerar primeira Strategy/Plan → receber Contents.
- **Planejamento:** abrir Product → entender análise/Strategy → revisar o Plan → editar ou regenerar um Content.
- **Execução:** selecionar Contents → formar lote → abrir modo de gravação → marcar Gravado → avançar.
- **Recorrência:** consultar o que já foi explorado → solicitar novo lote → preencher lacunas estratégicas → continuar Production.
- **Operação multi-Product:** adicionar outro Product → manter Strategy, Plan, Content e Production separados → alternar sem misturar contexto.
- **Memória:** buscar e filtrar Contents por Product, status, ângulo e data, além de texto em hooks, scripts, Products e tags.

## Sequência completa dos slices

### Slice 001 — Workspace pessoal e primeiro acesso

**User Outcome**

> O creator consegue criar sua conta, entrar em seu Workspace pessoal e encontrar uma próxima ação clara para começar.

**Depends On**

* `None`

**Domain Areas**

* Identity / Tenant

**Scope**

* Criar conta e sessão de acesso do usuário.
* Resolver um Tenant/Workspace pessoal para o usuário.
* Isolar o espaço pessoal desde o primeiro acesso.
* Abrir Hoje em estado vazio, orientando para `Adicionar produto`.

**Out of Scope**

* Login social, SSO, organizações, múltiplos membros, RBAC e convites.
* Billing por equipe ou qualquer colaboração.
* Dashboard analítico ou métricas externas.

---

### Slice 002 — Product manual-first pronto para Strategy

**User Outcome**

> O creator consegue cadastrar um Product com fatos suficientes, completar seu contexto e deixá-lo pronto para gerar uma Strategy.

**Depends On**

* Slice 001 — Workspace pessoal e primeiro acesso

**Domain Areas**

* Product
* Entitlements

**Scope**

* Criar e abrir um Product a partir de nome e descrição manual.
* Aceitar categoria, preço, características, imagens, observações e URL como informações opcionais.
* Tratar URL somente como enriquecimento best-effort; falha ou conteúdo incompleto não bloqueia o Product manual.
* Registrar contexto estratégico em `pt-BR`, incluindo objetivo, público, estilo, presença do creator, experiência, restrições, mercado e observações quando relevantes.
* Permitir começar com poucos dados e complementar o Product antes da geração.
* Aplicar o limite de Products ativos do Tenant sem confiar em dados enviados pelo cliente.
* Quando a URL for tentada, respeitar os limites de entrada e rede definidos no ADR-008; falha, bloqueio ou conteúdo incompleto continuam sem bloquear o Product manual.
* Não pressupor unicidade de Product por Workspace; Products adicionais devem poder existir dentro dos limites de Entitlements.

**Out of Scope**

* Scraping complexo, crawler, login ou conexão com TikTok/TikTok Shop.
* Importação em lote ou atualização automática de catálogo.
* Decisão comercial, Plan ou Content.

---

### Slice 003 — Primeira Strategy e primeiro Plan de Content

**User Outcome**

> O creator consegue definir quantidade e objetivo e receber uma Strategy comercial com um Plan diversificado de Contents graváveis para o Product.

**Depends On**

* Slice 001 — Workspace pessoal e primeiro acesso
* Slice 002 — Product manual-first pronto para Strategy

**Domain Areas**

* Strategy
* Plan
* Content
* Generation
* Entitlements

**Scope**

* Solicitar a primeira geração informando quantidade válida e objetivo opcional.
* Mostrar os estados compreensíveis de uma geração durável: na fila, gerando, concluída, falha recuperável ou cancelada.
* Permitir cancelar uma execução em estado cancelável, com autorização no Tenant correto e liberação do uso reservado.
* Permitir tentar novamente após falha ou cancelamento, retornando a um estado de geração sem duplicar Content ou uso.
* Respeitar a capacidade autorizada do Tenant: limite de Contents gerados no mês, reserva antes da execução e liberação em falha/cancelamento.
* Usar a mesma inteligência estratégica independentemente do plano; Entitlements limita capacidade, não qualidade.
* Entregar uma análise comercial do Product com problema, diferenciais, benefícios, riscos, argumentos, públicos, dores, desejos, objeções e ângulos relevantes.
* Entregar um Plan cuja distribuição resulte da Strategy e das lacunas do contexto, não de uma tabela fixa.
* Criar exatamente a quantidade solicitada de Contents, cada um estruturalmente gravável e contendo, quando aplicável, público, dor, desejo/benefício, objeção, ângulo, hook, estrutura, script, cenas e CTA.
* Exibir a proveniência e a explicação estratégica necessária para o creator entender por que uma ideia foi criada, sem expor a complexidade inteira da engine.
* Não apresentar Content parcial como sucesso; permitir recuperação clara de uma falha.
* Manter Strategy, Plan e Content explicitamente vinculados ao Product de origem durante a geração.

A geração de Strategy, Plan e Contents é tratada como uma capacidade vertical única porque o contrato `GenerationInput v1`/`GenerationOutput v1` e o System Design definem a primeira operação como geração de Strategy e Plan com cardinalidade de Contents. A interface pode revelar Strategy e Plan em etapas de leitura, mas o slice não inventa uma operação intermediária que as fontes ainda não definiram.

**Out of Scope**

* Edição manual, feedback, duplicação e regeneração de partes.
* Novos lotes baseados em memória histórica.
* Production queue, lotes de gravação e modo de gravação.
* Geração de vídeo, imagem, voice-over ou publicação.

---

### Slice 004 — Revisão e controle de Content

**User Outcome**

> O creator consegue compreender, adaptar e controlar cada Content gerado antes de colocá-lo em Production.

**Depends On**

* Slice 003 — Primeira Strategy e primeiro Plan de Content

**Domain Areas**

* Content
* Plan
* Strategy

**Scope**

* Visualizar o hook, ângulo, status e próxima ação de cada Content.
* Abrir progressivamente Strategy, dimensões, cenas, CTA, explicação e proveniência quando necessário.
* Editar hook, script, cenas, CTA, título interno e observações, preservando o contexto estratégico e o conteúdo originalmente gerado.
* Editar, quando expostos, elementos estratégicos como públicos, dores, desejos, objeções, benefícios e ângulos, sem transformar a interface em uma aula de marketing.
* Registrar feedback operacional simples: gostei, não gostei, excluir, editar e duplicar.
* Retirar um Content da visão ativa sem apagar a memória necessária para controlar variedade.

**Out of Scope**

* Regenerar hook, ângulo, CTA, estrutura ou versão completa.
* Escolher múltiplos Contents para um lote de gravação.
* Edição em massa de campos.
* Aprendizado automático baseado no feedback.

---

### Slice 005 — Regeneração contextual de Content

**User Outcome**

> O creator consegue regenerar uma parte ou uma versão de um Content sem repetir todo o contexto do Product e sem perder seu histórico.

**Depends On**

* Slice 004 — Revisão e controle de Content

**Domain Areas**

* Strategy
* Content
* Generation
* Entitlements

**Scope**

* Solicitar novo hook, troca de ângulo, novo CTA, nova estrutura ou nova versão completa.
* Preservar Product, contexto, Strategy e vínculo de proveniência durante a regeneração.
* Consumir a capacidade de geração conforme a regra do plano, sem permitir bypass por retry ou concorrência.
* Manter a versão anterior e registrar a nova geração como uma execução rastreável.
* Aplicar memória e controle de variedade à nova versão, salvo escolha explícita de repetição/override.
* Tratar falha, cancelamento e retry sem publicar resultado parcial nem perder edições já feitas.

**Out of Scope**

* Novo lote de Contents.
* Aprendizado de preferências, avaliação semântica ou ranking por performance externa.
* Geração de mídia.

---

### Slice 006 — Fila de Production e lotes de gravação

**User Outcome**

> O creator consegue selecionar Contents e organizá-los em uma fila e em lotes simples de gravação.

**Depends On**

* Slice 003 — Primeira Strategy e primeiro Plan de Content

**Domain Areas**

* Production
* Content

**Scope**

* Mover Contents para uma fila operacional sem duplicar o corpus do Product.
* Selecionar múltiplos Contents e formar um lote simples.
* Organizar lote e fila por Product e por atributos operacionais já disponíveis; cenário, tipo de gravação, objeto necessário ou estilo só entram quando já fizerem parte do Content, sem criar dimensões novas para este slice.
* Exibir e atualizar manualmente os estados `Ideia`, `Pronto para gravar`, `Gravado`, `Publicado` e `Arquivado`.
* Manter a fila vinculada ao Content, seu Product e sua proveniência.
* Manter cada fila e lote de Production vinculados ao Product de origem, inclusive quando houver Products simultâneos no mesmo Workspace.

**Out of Scope**

* Publicação automática, agendamento ou conexão com TikTok.
* Upload, armazenamento ou edição de mídia.
* Otimização automática de lote baseada em performance.

---

### Slice 007 — Modo de gravação contínua

**User Outcome**

> O creator consegue usar a plataforma durante uma sessão real de gravação, marcar um Content como Gravado e escolher o próximo.

**Depends On**

* Slice 006 — Fila de Production e lotes de gravação

**Domain Areas**

* Production
* Content

**Scope**

* Abrir um Content pronto para gravar em uma experiência simplificada.
* Mostrar somente o necessário para execução: posição, ângulo, hook, script/cenas, CTA e status.
* Permitir `Anterior`, `Próximo` e `Marcar como gravado`.
* Manter o avanço para o próximo Content visível, mas nunca gravar ou avançar automaticamente.
* Pedir confirmação ao tocar `Próximo` antes de marcar o Content, oferecendo continuar sem marcar ou permanecer nesta gravação.
* Impedir duplo acionamento de marcação, confirmar `Gravado` e preservar o item em caso de erro.
* Permitir retry após falha de marcação sem limpar o conteúdo ou o contexto de execução.

**Out of Scope**

* Captura, upload, edição ou geração de vídeo.
* Publicação automática.
* Autoavanço ou marcação implícita ao tocar `Próximo`.

---

### Slice 008 — Novo lote com memória e variedade

**User Outcome**

> O creator consegue solicitar um novo lote para o Product e receber Contents que priorizam lacunas estratégicas em vez de repetir excessivamente o histórico.

**Depends On**

* Slice 003 — Primeira Strategy e primeiro Plan de Content

**Domain Areas**

* Strategy
* Plan
* Content
* Generation
* Entitlements

**Scope**

* Iniciar novo lote informando quantidade e objetivo opcional.
* Consultar o histórico autorizado do Product, incluindo Contents gerados, aprovados, descartados, excluídos e Gravados.
* Considerar cobertura e frequência de públicos, dores, benefícios, objeções, ângulos, estruturas, hooks e CTAs.
* Priorizar dimensões sub-representadas e penalizar combinações repetidas.
* Bloquear duplicatas exatas ou equivalentes apenas por formatação em hooks e textos normalizados.
* Persistir o novo lote no mesmo histórico intelectual e operacional, mantendo proveniência entre gerações.
* Aplicar novamente limite, reserva, confirmação/liberação e idempotência de geração.

**Out of Scope**

* Embeddings, banco vetorial, deduplicação semântica sofisticada, LLM-as-judge ou aprendizado por vendas.
* Análise de performance externa.
* Escolha de Contents por métricas de conversão.

---

### Slice 009 — Hoje como fila operacional

**User Outcome**

> O creator consegue abrir Hoje e saber imediatamente o que precisa produzir agora, retomando a próxima ação de um Product ou lote real.

**Depends On**

* Slice 006 — Fila de Production e lotes de gravação
* Slice 007 — Modo de gravação contínua

**Domain Areas**

* Production
* Product

**Scope**

* Priorizar Contents pendentes de gravação, lote atual, próximos Products e ação de continuar Production.
* Mostrar progresso somente quando ligado a um Product, Content ou lote real, como `18/30 produzidos`.
* Oferecer ações diretas como `Adicionar produto` e `Continuar produção`.
* Quando o Slice 008 estiver implementado, Hoje passa a expor `Gerar novo lote` para Products que já possuam Strategy/Plan.
* Manter a mesma capacidade em mobile e desktop, com execução prioritária no mobile e mais densidade operacional no desktop.

**Out of Scope**

* Dashboard de analytics, KPI cards, gráficos, scorecards e métricas decorativas.
* CTR, ROAS, atribuição, vendas ou qualquer performance externa.
* Página `Home` paralela a `Hoje`.

---

### Slice 010 — Content Vault consultável

**User Outcome**

> O creator consegue encontrar e consultar a memória dos seus Contents por Product, status, ângulo, data e texto relevante.

**Depends On**

* Slice 004 — Revisão e controle de Content
* Slice 006 — Fila de Production e lotes de gravação

**Domain Areas**

* Content
* Product
* Production

**Scope**

* Consultar o histórico intelectual e operacional de Contents, não uma biblioteca de mídia.
* Buscar Products, hooks, scripts e tags por texto.
* Filtrar por Product, status, ângulo e data.
* Exibir Content, hook, ângulo, Product, status, data, campanha quando houver agrupamento opcional e tags.
* Revelar proveniência e histórico suficiente para entender o que já foi explorado.
* Tratar Campanha, se utilizada, somente como agrupamento opcional de Products/Contents, sem módulo, quota ou workflow obrigatório próprio.

**Out of Scope**

* Armazenamento de mídia, biblioteca de vídeos ou edição de mídia.
* Busca semântica, embeddings ou banco vetorial.
* Analytics externo e ranking por vendas.
* Campanhas obrigatórias, automação completa ou gestão de campanhas.

## Dependências entre slices

A sequência mínima de construção é:

```
001 Workspace
  ↓
002 Product + contexto
  ↓
003 primeira Strategy + Plan + Contents
  ├──→ 004 revisão e controle de Content
  │      └──→ 005 regeneração contextual
  ├──→ 006 fila e lotes de Production
  │      └──→ 007 modo de gravação
  └──→ 008 novo lote com memória e variedade

006 + 007 ──→ 009 Hoje operacional
003 + 004 + 006 ──→ 010 Content Vault
```

Observações sobre a ordem:

- Slice 003 é o primeiro ponto que exige geração durável, estados de execução, validação de saída e Entitlements. Nenhuma infraestrutura de fila ou provider deve ser criada antes de existir esse comportamento de usuário.
- Slice 005 não é pré-requisito para o primeiro Plan; ele adiciona regeneração depois que o creator já consegue revisar um Content.
- Slice 008 usa a memória criada pelos Contents anteriores. Ele foi colocado depois de Slice 007 para fechar o ciclo `gerar → organizar → gravar → marcar`, mas não depende funcionalmente da gravação.
- Slice 010 é uma consulta sobre o mesmo corpus de Content, não uma cópia ou módulo técnico separado.

## Matriz de cobertura do PRD

| Requisito/capacidade do MVP | Slice responsável |
| --------------------------- | ----------------- |
| Criar conta e chegar rapidamente ao primeiro valor | Slice 001 |
| Tenant/Workspace pessoal e isolamento de dados | Slice 001; aplicado em todos os slices mutáveis |
| Cadastrar Product manualmente | Slice 002 |
| Começar com nome/descrição e complementar depois | Slice 002 |
| URL opcional sem dependência de scraping | Slice 002 |
| Contexto de Strategy: objetivo estratégico, estilo, presença, experiência, público, mercado e restrições | Slice 002; quantidade e objetivo opcional do lote em Slice 003 |
| Análise comercial do Product | Slice 003 |
| Públicos, dores, desejos e objeções | Slice 003 |
| Benefícios, diferenciais, características, casos de uso, gatilhos, barreiras, riscos e argumentos | Slice 003 |
| Taxonomia e seleção de ângulos | Slice 003 |
| Hooks com função estratégica | Slice 003 |
| Estruturas narrativas adequadas ao ângulo | Slice 003 |
| Scripts graváveis com fala, ação, cena, produto e demonstração | Slice 003 |
| CTAs estratégicos e variados | Slice 003 |
| Escolher quantidade de Contents | Slice 003 |
| Plan com distribuição estratégica, não fixa | Slice 003 |
| Content com Strategy context e dimensões de variedade | Slice 003 |
| Geração assíncrona durável, estados, retry/cancelamento e ausência de sucesso parcial | Slice 003; reutilizado em Slices 005 e 008 |
| Limite de Products ativos | Slice 002; isolamento entre Products exercitado transversalmente em Slices 002, 003 e 006 |
| Limite mensal de Contents e reserva/liberação/confirmação de uso | Slice 003; reutilizado em Slices 005 e 008 |
| Mesma inteligência estratégica em todos os planos | Slice 003; capacidade limitada por Entitlements em Slices 002, 005 e 008 |
| Editar hook, script, cenas, CTA, título e observações | Slice 004 |
| Gostei, não gostei, excluir, editar e duplicar | Slice 004 |
| Preservar memória ao excluir Content | Slice 004; regra usada em Slice 008 |
| Regenerar hook, ângulo, CTA, estrutura ou versão completa | Slice 005 |
| Preservar contexto e proveniência em regenerações | Slice 005 |
| Consultar histórico e controlar repetição | Slice 008; consulta operacional em Slice 010 |
| Novo lote com quantidade e objetivo opcional | Slice 008 |
| Variedade por público, dor, benefício, objeção, ângulo, estrutura, hook e CTA | Slice 008 |
| Planejar Production queue | Slice 006 |
| Selecionar múltiplos Contents para lote simples | Slice 006 |
| Estados Ideia, Pronto para gravar, Gravado, Publicado e Arquivado | Slice 006 |
| Modo de gravação | Slice 007 |
| Marcar Content como Gravado | Slice 007 |
| Anterior/Próximo sem autoavanço e com recuperação de erro | Slice 007 |
| Trabalhar múltiplos Products simultaneamente | Critério transversal exercitado em Slices 002, 003 e 006; não cria slice independente |
| Dashboard operacional do que produzir agora | Slice 009 |
| Ações de Hoje: novo Product e continuar Production | Slice 009; `Gerar novo lote` é acrescentado quando Slice 008 existir |
| Content Vault como memória intelectual/operacional | Slice 010 |
| Busca por Products, hooks, scripts e tags | Slice 010 |
| Filtros por Product, status, ângulo e data | Slice 010 |
| Campanha opcional como agrupamento, sem virar estrutura obrigatória | Slice 010, quando utilizado |
| Mobile com experiência completa e execução prioritária | Slices 002–010 na superfície de Hoje/Produtos/Conteúdos/Produção/Vault |
| Desktop expandindo planejamento e operações densas sem criar capacidades exclusivas | Slices 006, 009 e 010 |
| Complexidade da engine escondida por progressive disclosure | Slices 003, 004, 007 e 010 |
| Conteúdo editável e creator no controle final | Slice 004; preservado em Slices 005 e 008 |
| Memória e proveniência como diferenciação do produto | Slices 003, 004, 005, 008 e 010 |
| Métricas internas de ativação, engajamento, retenção e North Star | Acompanhamento transversal do MVP; não cria slice de analytics |
| Disposição de pagamento pela inteligência estratégica | Validação de produto associada ao uso e aos limites; não cria billing ou slice de cobrança no MVP |

### Capacidades explicitamente fora da cobertura do MVP

Não recebem slice: geração automática de vídeo, imagem ou áudio; edição de vídeo; publicação e agendamento; integrações TikTok/TikTok Shop/Instagram/marketplaces; analytics externo, ROAS, CTR, atribuição e tracking de vendas; CRM, gestão financeira, creators ou influenciadores; scraping complexo; análise competitiva avançada; pesquisa automática com dados pagos; colaboração, RBAC, SSO, i18n operacional; embeddings, banco vetorial, aprendizado automático e produção multimídia.

## Validação do mapa

### 1. Cobertura do PRD

A matriz acima cobre as treze etapas da definição final do MVP (§58):

1. Product cadastrado — Slice 002.
2. Contexto básico fornecido — Slice 002.
3. Análise comercial recebida — Slice 003.
4. Strategy recebida — Slice 003.
5. Quantidade escolhida — Slice 003.
6. Plan estratégico diversificado recebido — Slice 003 e Slice 008 para recorrência.
7. Hooks, scripts, cenas e CTAs visualizados — Slice 003.
8. Partes editadas e regeneradas — Slices 004 e 005.
9. Contents organizados em fila — Slice 006.
10. Modo de gravação utilizado — Slice 007.
11. Contents marcados como Gravado — Slice 007.
12. Histórico consultado — Slice 010.
13. Novos lotes sem repetição excessiva — Slice 008.

Também estão cobertos Identity/Tenant, Entitlements, execução assíncrona, múltiplos Products, Hoje, busca, filtros, estados de Production e restrições de UX que aparecem no System Design, ADRs e DESIGN.md.

### 2. Dependências

- Nenhum slice de usuário depende de uma capacidade posterior.
- O primeiro resultado real é entregue em Slice 003, depois de Product e contexto.
- Geração assíncrona, limite de uso e recuperação de falhas entram junto do primeiro comportamento que os exige.
- Novos lotes dependem de histórico já existente; Production depende de Contents gerados; Hoje depende de fila, lotes e progresso reais; Vault depende do corpus produzido, mas nenhuma dessas capacidades exige múltiplos Products.
- Não há slice técnico intermediário necessário apenas para fazer outro slice funcionar.

### 3. Qualidade dos slices

| Slice | Resultado principal | Cenário E2E e oráculo observável |
| ----- | ------------------- | -------------------------------- |
| 001 | Workspace acessível e próxima ação | Criar conta → entrar → sessão resolve o Workspace correto, Hoje vazio oferece `Adicionar produto` e acesso não autorizado falha. |
| 002 | Product pronto para Strategy | Criar dois Products no mesmo Workspace, tentar URL com falha e salvar contexto → ambos permanecem acessíveis, isolados e prontos para geração. |
| 003 | Primeiro Plan com Contents graváveis | Solicitar geração para dois Products → estados terminam em sucesso/erro/cancelamento; cardinalidade, vínculo ao Product e uso permanecem corretos. |
| 004 | Content controlável pelo creator | Editar, marcar gostei/não gostei, duplicar e excluir → alterações persistem, memória permanece e o Content continua rastreável ao Product. |
| 005 | Regeneração contextual | Regenerar hook/CTA/parte → nova execução preserva Product/contexto, versão anterior, quota e edições; falha não publica parcial. |
| 006 | Fila e lote de Production | Selecionar Contents de Products distintos → criar lote e mudar estados → nenhum Content cruza Product e somente transições válidas aparecem. |
| 007 | Sessão de gravação contínua | Abrir Content → tocar `Próximo` sem marcar exige confirmação; marcar Gravado confirma, não duplica e erro permite retry. |
| 008 | Novo lote variado | Gerar segunda rodada com histórico fixture → dimensões sub-representadas são priorizadas e duplicatas normalizadas são bloqueadas. |
| 009 | Próxima ação operacional em Hoje | Abrir Hoje com fila/lote → ação exibida leva a continuar ou adicionar Product; quando Slice 008 existir, também leva a novo lote. |
| 010 | Histórico encontrável | Buscar e filtrar Content → resultados respeitam Product/status/ângulo/data, texto e Tenant e abrem proveniência. |
* dois Products no mesmo Workspace nunca misturam contexto, Strategy, Plan, Content, Production, progresso, memória ou quota; essa propriedade é exercitada nos Slices 002, 003 e 006.

Critérios transversais de aceite, aplicados aos slices que possuem interface, sem criar slices técnicos:

* toda leitura e escrita permanece autorizada pelo Tenant resolvido no servidor;
* mobile mantém a capacidade completa, alvos de toque de `44×44px`, foco visível, ordem de teclado e mensagens associadas;
* estados empty, loading, success, error, limit, queued, running, failed e cancelled comunicam a próxima ação sem depender apenas de cor;
* geração e marcação não permitem duplo acionamento; falhas preservam o contexto editado e oferecem recuperação;
* a validação E2E de cada slice deve declarar entrada, ação, estado esperado e oráculo observável; nenhum slice é considerado validado apenas por existir uma tela ou registro.

## Riscos e dúvidas reais encontrados

1. **Strategy e Plan aparecem como etapas separadas no PRD, mas o contrato arquitetural v1 as entrega na mesma operação.** O mapa agrupa a primeira geração no Slice 003 e permite leitura progressiva de Strategy e Plan. Se o produto exigir aprovação explícita da Strategy antes de gerar o Plan, essa mudança precisa ser deliberada em uma decisão posterior; não foi inventada neste mapa.
2. **O produto-exemplo gold-standard é pré-condição para implementar a engine, mas não existe um artefato desse exemplo entre as fontes lidas.** Isso é uma dependência de validação da engine, não um slice técnico adicional.
3. **O ADR-009 não escolhe o método de login.** Slice 001 define o comportamento de conta, sessão e Workspace pessoal, mas a escolha do mecanismo de autenticação continua uma decisão aberta de implementação.
4. **A URL é apresentada no PRD como uma forma conveniente de iniciar, enquanto ADR-008 torna a descrição manual o caminho canônico.** O mapa adota manual-first, trata URL apenas como enriquecimento opcional e já atribui ao Slice 002 os limites de tamanho, tempo, redirecionamento, tipos aceitos e proteção de rede exigidos antes da SPEC.
5. **Campanha é opcional no PRD e explicitamente não é módulo ou requisito do fluxo no System Design.** Por isso não recebe slice próprio; quando usada, é apenas agrupamento dentro do Content/Vault, sem quota ou workflow independente.
6. **O PRD chama a superfície de Dashboard, enquanto o DESIGN.md substitui `Home` por `Hoje` e proíbe overview analítico.** O mapa segue `Hoje` como fila operacional com números ligados a Products, Contents ou lotes reais.
7. **Os valores de plano, limites iniciais e preços não estão definidos nas fontes.** Os slices cobrem a semântica de Entitlements e bloqueio seguro, não inventam pricing ou números comerciais.
8. **A heurística de variedade detecta repetição exata/estrutural, não toda paráfrase semântica.** O mapa mantém essa simplificação deliberada; embeddings e avaliação semântica ficam fora do MVP.
9. **A qualidade estratégica pode falhar mesmo com contrato estrutural válido.** O MVP preserva edição, regeneração, proveniência e revisão humana, mas as fontes não definem ainda um critério operacional completo para avaliar qualidade textual.

10. **A regeneração parcial do Slice 005 exige uma extensão versionada do contrato `GenerationInput`/`GenerationOutput` v1.** O PRD exige a capacidade, mas os contratos canônicos atuais descrevem inicialmente geração de Strategy/Plan; a extensão deve ser decidida antes da SPEC do slice, sem criar provider ou abstração paralela.
11. **O ciclo de vida inicial de Entitlements ainda não está definido.** As fontes definem limites e semântica de reserva, mas não definem plano default, ativação/desativação ou valores comerciais; esses pontos precisam ser fechados antes das SPECs de Product e Generation.
12. **Requisitos operacionais da geração não são slices de usuário, mas precisam de owner no Slice 003.** Lease, retries limitados, jobs presos, health checks, métricas de fila/latência/erro e backup/restauração devem ser tratados como critérios operacionais da capacidade de geração, não como slices técnicos separados.
13. **Tags, duplicação e Campanha ainda não têm semântica completa de criação/atribuição.** O mapa cobre consulta e agrupamento opcional conforme as fontes, mas a SPEC deve decidir se esses metadados são editáveis pelo creator ou apenas derivados; não criar workflow próprio sem requisito.
14. **A heurística de variedade precisa de um fixture e de um oráculo de aceitação.** O mapa não inventa um limiar semântico; a validação deve demonstrar cobertura, normalização e ausência de duplicatas exatas/estruturais com o gold-standard.
15. **A edição de elementos da Strategy pode alterar futuras gerações sem reescrever silenciosamente Contents já existentes.** O Slice 004 cobre a edição exigida pelo PRD; a semântica de impacto, proveniência e escopo precisa ser fechada antes da SPEC, preservando o histórico.
Nenhuma inconsistência acima foi resolvida alterando PRD, ADRs, SYSTEM-DESIGN.md, PRINCIPLES.md ou DESIGN.md.
