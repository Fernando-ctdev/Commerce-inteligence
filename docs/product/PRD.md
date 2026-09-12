# PRD — MVP Commerce Intelligence System para TikTok Shop Creators

## 1. Visão do Produto

O produto é uma plataforma de inteligência comercial para creators e afiliados de social commerce, com foco inicial em TikTok Shop.

O MVP não tem como objetivo gerar vídeos ou imagens com IA.

O núcleo do produto é a engine de inteligência comercial e estratégica responsável por transformar um produto em um plano completo de conteúdo orientado a vendas.

A plataforma deve responder, de forma prática e operacional, à principal pergunta do creator:

**“O que eu devo gravar para vender este produto?”**

A partir de um produto, contexto e preferências do creator, o sistema gera e organiza:

* análise comercial do produto;
* identificação de público;
* dores;
* desejos;
* objeções;
* benefícios;
* argumentos de venda;
* posicionamento;
* ângulos de conteúdo;
* hooks;
* estruturas de vídeo;
* scripts;
* CTAs;
* variações;
* planos de conteúdo;
* Briefings do Conteúdo;
* lotes de gravação;
* agenda interna de gravação;
* execução e progresso no Estúdio;
* histórico e memória de cada Produto.

A engine estratégica é a mesma para todos os planos.

Os planos comerciais limitam principalmente quantidade de produtos, campanhas, conteúdos, gerações e uso mensal da plataforma.

No futuro, planos premium poderão adicionar produção automática por IA, utilizando exatamente a mesma inteligência estratégica já criada pelo core da plataforma.

---

# 2. Problema

Creators e afiliados de TikTok Shop trabalham com grande volume de conteúdo.

Um creator pode precisar produzir dezenas de vídeos por semana para diferentes produtos.

O principal gargalo não é necessariamente a gravação.

O problema começa antes.

O creator precisa decidir repetidamente:

* qual produto trabalhar;
* qual argumento utilizar;
* qual público atacar;
* qual dor explorar;
* qual benefício destacar;
* qual hook utilizar;
* como estruturar o vídeo;
* como diferenciar um vídeo do anterior;
* qual CTA utilizar;
* quais ideias ainda não foram exploradas;
* quais conteúdos precisam ser gravados;
* como organizar o volume de produção.

Esse processo costuma acontecer de forma fragmentada através de:

* notas;
* planilhas;
* documentos;
* chats com IA;
* mensagens;
* memória;
* improvisação.

Isso gera:

* repetição de ideias;
* conteúdo sem estratégia;
* excesso de tempo planejando;
* dificuldade em manter volume;
* dificuldade em organizar campanhas;
* fadiga criativa;
* pouca variedade;
* perda de consistência;
* dificuldade para transformar estratégia em execução.

A plataforma existe para eliminar esse caos.

---

# 3. Proposta de Valor

A proposta central do produto é:

> **Transformar qualquer produto em um plano organizado de conteúdo comercial pronto para gravação.**

A plataforma não deve ser posicionada como um simples gerador de scripts.

Também não deve ser posicionada como uma ferramenta genérica de marketing.

O valor está em combinar:

**inteligência comercial + estratégia de conteúdo + organização operacional da produção.**

O usuário entra com um produto.

O sistema devolve uma máquina de produção estruturada.

---

# 4. Público-Alvo Inicial

## 4.1 Público primário

Afiliados e creators que produzem conteúdo para TikTok Shop.

Principalmente usuários que:

* promovem múltiplos produtos;
* publicam conteúdo com alta frequência;
* dependem de conteúdo orgânico para gerar vendas;
* trabalham individualmente ou em pequenas equipes;
* precisam constantemente testar novos conteúdos;
* têm dificuldade em organizar produção em escala.

## 4.2 Perfis prioritários

### Creator iniciante

Ainda não domina copywriting, vendas ou criação estratégica.

Precisa de orientação completa.

A plataforma funciona como seu estrategista de conteúdo.

### Creator intermediário

Já entende a operação, mas sofre com escala e organização.

Precisa produzir muito mais sem depender de planejamento manual.

### Creator de alto volume

Produz dezenas de vídeos por semana ou por dia.

A principal necessidade é transformar estratégia em uma operação repetível e organizada.

---

# 5. Objetivos do MVP

O MVP deve provar que creators estão dispostos a utilizar e pagar por uma plataforma que resolve planejamento, organização e execução operacional de conteúdo antes e durante a gravação.

Os principais objetivos são:

1. reduzir o tempo necessário para transformar um produto em ideias de conteúdo;
2. impedir que o creator fique sem saber o que gravar;
3. gerar variedade estratégica;
4. transformar ideias em conteúdos realmente executáveis;
5. organizar grandes volumes de conteúdo;
6. ajudar o creator a trabalhar vários produtos simultaneamente;
7. permitir agrupar conteúdos aprovados em lotes de gravação;
8. permitir planejar quando cada lote será gravado;
9. acompanhar a execução real no Estúdio sem gestão manual de status;
10. criar recorrência de uso;
11. validar disposição de pagamento pela inteligência estratégica sem depender de geração de vídeo por IA.

---

# 6. Não Objetivos do MVP

O MVP não deve tentar resolver todo o ecossistema de social commerce.

Ficam fora do escopo inicial:

* geração automática de vídeos;
* geração automática de imagens;
* edição de vídeo;
* publicação automática;
* agendamento de publicação;
* sincronização com Google Calendar ou outros calendários externos;
* lembretes externos de calendário;
* conexão direta com TikTok para publicação ou analytics;
* integração com Instagram;
* integração com marketplaces adicionais;
* analytics avançado;
* ROAS;
* CTR;
* atribuição;
* tracking de vendas;
* automação completa de campanhas;
* gestão financeira;
* CRM;
* gestão de creators;
* gestão de influenciadores;
* scraping universal;
* análise competitiva avançada;
* pesquisa automática baseada em dados pagos externos.

A **Agenda interna de gravação** faz parte do MVP. Ela serve apenas para organizar quando o creator pretende gravar seus lotes e não deve ser confundida com agendamento de publicação ou integração externa de calendário.

O produto precisa permanecer extremamente focado.

---

# 7. Princípio Central do Produto

O sistema não deve simplesmente gerar conteúdo.

Ele deve tomar decisões estratégicas.

Existe uma diferença essencial entre:

> “Gere 30 hooks para este produto.”

e:

> “Crie uma estratégia de 30 conteúdos para este produto, distribuindo diferentes públicos, dores, objeções, benefícios, níveis de consciência, formatos e argumentos comerciais para evitar repetição.”

A segunda abordagem representa a inteligência central da plataforma.

---

# 8. Core Loop

O principal ciclo de uso deve ser:

```text
Adicionar produto
      ↓
Product Import extrai os fatos
      ↓
ProductCandidate
      ↓
Usuário confirma ou edita os fatos
      ↓
Quantidade inicial é resolvida
na confirmação, por preferência ou por default
      ↓
Product é persistido
      ↓
CommerceIntelligenceJob é criado
      ↓
Commerce Intelligence trabalha em segundo plano
      ↓
ProductStrategy é persistida
      ↓
ContentPlan é criado
      ↓
Content Opportunities são planejadas
      ↓
Content + Briefing em DRAFT ficam disponíveis
      ↓
Usuário revisa, edita, regenera, descarta ou aprova
      ↓
Aprovados formam um lote de gravação
      ↓
Usuário escolhe quando pretende gravar
      ↓
Lote aparece na Agenda e no Estúdio
      ↓
Creator grava externamente e conclui conteúdos no Estúdio
      ↓
Progresso do lote é atualizado automaticamente
      ↓
Lote é concluído
      ↓
Histórico e Product Memory são preservados
      ↓
Usuário solicita novos conteúdos
      ↓
Engine reutiliza Strategy, consulta Memory
e aplica restrições da nova geração quando existirem
```

Na primeira geração, `targetContentCount` precisa estar resolvido antes da criação do `CommerceIntelligenceJob`. Isso não deve criar uma etapa de navegação separada.

Depois de `Confirmar produto`, não existe uma segunda confirmação obrigatória da estratégia nem um botão obrigatório `Gerar estratégia`: o processamento segue de forma assíncrona até existirem conteúdos úteis para revisão.

Esse ciclo deve poder ser repetido continuamente.

A plataforma precisa fechar o espaço entre **“tenho ideias aprovadas”** e **“sei o que vou gravar e consigo executar”**.

---

# 9. Estrutura Conceitual do Sistema

O produto possui os seguintes objetos e camadas conceituais principais:

```text
ProductCandidate
   ↓
Product
   ↓
CommerceIntelligenceJob
   ↓
ProductStrategy
   ↓
ContentPlan
   ↓
ContentOpportunity
   ↓
Content
   ↓
ContentBriefVersion
   ↓
RecordingBatch
   ↓
Execução
```

`Content` é a identidade estável de um conteúdo ao longo do workflow. O **Briefing do Conteúdo** é a representação que o creator revisa e executa; alterações e regenerações geram versões rastreáveis (`ContentBriefVersion`).

A **Agenda** é uma visão temporal dos `RecordingBatch`.

O **Estúdio** é a superfície operacional onde esses lotes são executados.

O **Histórico** preserva a memória intelectual e operacional vinculada ao Produto e alimenta a Product Memory.

Agenda, Estúdio e Histórico não precisam existir como entidades independentes quando uma projeção ou representação derivada for suficiente.

Nos contratos de domínio e código, usar identificadores canônicos em inglês (`Product`, `ProductStrategy`, `ContentPlan`, `Content`, `ContentBriefVersion`, `RecordingBatch`). Na interface do MVP, manter nomenclatura humana em `pt-BR` conforme o Design System.

---

# 10. Produto

Produto representa aquilo que o creator pretende vender.

Cada produto deve possuir um espaço próprio dentro da plataforma.

## Informações mínimas

O usuário poderá informar:

* nome do produto;
* URL;
* descrição;
* categoria;
* preço, quando relevante;
* principais características;
* imagens;
* observações.

Nem todas devem ser obrigatórias.

O sistema deve permitir começar rapidamente.

No fluxo principal, o usuário fornece preferencialmente uma URL e o Product Import tenta descobrir os fatos automaticamente. Entrada manual continua disponível como fallback quando não houver URL, quando a extração falhar ou quando o creator preferir corrigir/complementar os fatos antes da confirmação.

Informações estratégicas não pertencem ao cadastro factual do Produto.

---

# 11. Contexto da Estratégia

O cadastro do Produto deve solicitar somente fatos que não possam ser descobertos ou confirmados automaticamente.

Informações estratégicas como públicos, dores, desejos, objeções, benefícios, posicionamento e ângulos são responsabilidade da Commerce Intelligence Engine.

O sistema pode considerar dois contextos adicionais, sem misturá-los com Product Facts:

### CreatorPreferences

Preferências persistentes do creator que podem influenciar a execução dos conteúdos, por exemplo:

* idioma;
* mercado;
* presença ou ausência do creator em câmera;
* preferência por voice-over;
* duração preferida;
* tom;
* estilo de execução;
* restrições;
* observações recorrentes.

Na Engine, essas preferências podem ser carregadas como um `CreatorContext` adequado à capability em execução.

### GenerationConstraints

Parâmetros válidos para uma geração específica.

Na primeira geração, `targetContentCount` precisa estar resolvido antes do `CommerceIntelligenceJob`.

Em gerações posteriores, o usuário pode opcionalmente direcionar o novo plano, por exemplo:

* objetivo específico;
* foco em determinado público;
* foco em objeções;
* preferência por determinados ângulos;
* duração específica para aquela geração;
* observações pontuais.

Essas restrições influenciam o `ContentPlan` daquela geração. Elas não reescrevem automaticamente a `ProductStrategy` persistente.

Mudanças estruturais, como fatos relevantes do Produto, mercado ou outra alteração que afete materialmente a Strategy, devem seguir as regras de versionamento e `STALE` definidas pela Commerce Intelligence Engine.

---

# 12. Commerce Intelligence Engine

Esta é a principal propriedade intelectual do produto.

A engine deve interpretar o produto como uma oportunidade comercial e não apenas como um objeto.

A análise deve produzir uma estrutura estratégica reutilizável.

## 12.1 Análise do produto

A engine deve identificar:

* problema que o produto resolve;
* benefícios funcionais;
* benefícios emocionais;
* diferenciais;
* características relevantes;
* possíveis casos de uso;
* contexto de utilização;
* gatilhos de compra;
* barreiras de compra;
* possíveis argumentos de venda.

---

# 13. Público

A engine deve identificar potenciais públicos compradores.

Não basta produzir uma persona genérica.

O objetivo é descobrir diferentes grupos que permitam criar conteúdo comercial.

Exemplo:

Um mini aspirador pode ser vendido para:

* donos de carro;
* pais;
* pessoas com animais;
* pessoas preocupadas com limpeza;
* motoristas de aplicativo;
* pessoas que trabalham no carro.

Cada público pode gerar estratégias diferentes.

---

# 14. Dores

A engine deve identificar diferentes tipos de dores.

### Dor funcional

Problema concreto.

Exemplo:

> sujeira acumulada entre os bancos do carro.

### Dor emocional

Sentimento associado.

Exemplo:

> vergonha de oferecer carona em um carro sujo.

### Dor de conveniência

Exemplo:

> dificuldade de levar aspirador convencional até o carro.

### Dor financeira

Exemplo:

> pagar lavagem constantemente.

Dores devem ser utilizadas como matéria-prima para criação de conteúdo.

---

# 15. Desejos

A engine deve identificar aquilo que o consumidor pretende alcançar.

Exemplos:

* praticidade;
* economia;
* aparência;
* conforto;
* organização;
* status;
* rapidez;
* segurança;
* autonomia.

---

# 16. Objeções

A plataforma deve trabalhar explicitamente com objeções.

Exemplos:

* “isso funciona mesmo?”;
* “parece fraco”;
* “é caro”;
* “já tenho algo parecido”;
* “parece difícil de usar”;
* “não preciso disso”.

As objeções devem virar ângulos próprios de conteúdo.

---

# 17. Benefícios

A engine deve diferenciar:

**feature**

> bateria de 4.000 mAh

de:

**benefício**

> você consegue utilizar sem depender de tomada.

e:

**resultado desejado**

> consegue limpar o carro onde estiver.

O conteúdo deve priorizar benefício e resultado em vez de apenas características técnicas.

---

# 18. Ângulos de Conteúdo

Ângulo representa a perspectiva comercial utilizada para vender o produto.

A plataforma deverá possuir uma taxonomia própria de ângulos.

Exemplos:

* problema → solução;
* antes e depois;
* demonstração;
* transformação;
* comparação;
* objeção;
* curiosidade;
* descoberta;
* prova;
* conveniência;
* economia;
* lifestyle;
* desejo;
* experiência pessoal;
* erro comum;
* oportunidade;
* uso inesperado;
* reação;
* benefício específico.

A engine deve selecionar ângulos baseando-se no produto e no contexto.

Não deve utilizar categorias aleatórias simplesmente para atingir quantidade.

---

# 19. Hooks

Cada conteúdo deve possuir um hook.

Hooks devem ser gerados com função estratégica.

Exemplos de objetivos:

* interromper scroll;
* criar curiosidade;
* evidenciar problema;
* prometer resultado;
* gerar identificação;
* quebrar objeção;
* demonstrar descoberta.

O sistema deve evitar repetir estruturas excessivamente semelhantes.

---

# 20. Estrutura do Conteúdo

Cada conteúdo precisa possuir uma narrativa.

Exemplo:

```text
Hook
↓
Problema
↓
Introdução do produto
↓
Demonstração
↓
Resultado
↓
CTA
```

Outro:

```text
Hook
↓
Objeção
↓
Teste
↓
Prova
↓
Conclusão
↓
CTA
```

A engine deve escolher a estrutura adequada ao ângulo.

---

# 21. Script

O script deve ser gravável.

O sistema não deve entregar textos longos com aparência de artigo.

O script deve considerar:

* fala;
* ação;
* cena;
* produto;
* demonstração;
* mudança de enquadramento;
* CTA.

Exemplo:

```text
Cena 1
Mostrar sujeira entre os bancos.

Fala:
“Olha a quantidade de sujeira que fica aqui e você nem percebe.”

Cena 2
Mostrar o produto.

Fala:
“Eu comecei a usar esse mini aspirador justamente por causa disso.”

Cena 3
Demonstrar.

Cena 4
Mostrar resultado.

CTA:
“Eu deixei esse modelo aqui no carrinho.”
```

---

# 22. CTA

CTAs devem fazer parte da estratégia.

A engine deve variar CTAs de acordo com o contexto.

Exemplos:

* descoberta;
* compra;
* urgência;
* curiosidade;
* preço;
* disponibilidade;
* continuidade.

A plataforma deve evitar que todos os conteúdos terminem de maneira idêntica.

---

# 23. Content Plan

O plano de conteúdo é uma coleção organizada de conteúdos planejados para um produto ou objetivo.

Exemplo:

```text
Produto: Escova modeladora

Meta: 30 conteúdos
```

A engine pode distribuir:

```text
6 problema/solução
5 demonstrações
4 objeções
4 transformações
3 comparações
3 curiosidades
3 benefícios
2 lifestyle
```

Essa distribuição não deve ser fixa.

Deve ser resultado da estratégia.

---

# 24. Controle de Variedade

Uma das funções mais importantes do produto é impedir repetição.

A plataforma deve monitorar o que já foi criado para aquele produto.

Deve considerar:

* ângulos utilizados;
* hooks utilizados;
* dores utilizadas;
* benefícios utilizados;
* objeções trabalhadas;
* estruturas utilizadas;
* CTAs utilizados;
* públicos trabalhados.

Ao gerar novos conteúdos, deve preferir lacunas e variações relevantes.

Exemplo:

```text
Conteúdos anteriores:

12 demonstração
8 problema/solução
6 benefício
1 objeção
0 comparação
```

A próxima geração pode priorizar:

* objeções;
* comparações;
* novas dores;
* novos públicos.

---

# 25. Content Memory

A plataforma precisa possuir memória do histórico de cada produto.

Ela deve saber:

* quais conteúdos foram gerados;
* quais foram aprovados;
* quais foram descartados;
* quais foram concluídos;
* quais ângulos já foram utilizados;
* quais hooks já foram utilizados;
* quais estratégias já foram exploradas;
* quais Briefings aprovados foram executados;
* quais lotes de gravação já foram concluídos.

Essa memória é fundamental para diferenciar o produto de uma interface genérica de IA.

Datas e progresso de gravação pertencem à memória operacional. Eles podem ser preservados no histórico, mas não devem alterar a estratégia comercial sem uma regra explícita que justifique isso.

---

# Briefing do Conteúdo

Cada `Content` deve possuir um Briefing do Conteúdo revisável pelo creator.

O `Content` representa a identidade estável do conteúdo dentro do Produto e do Plano. O material concreto do Briefing é preservado em versões rastreáveis (`ContentBriefVersion`).

O Briefing reúne tudo que o creator precisa para entender, revisar e produzir aquele conteúdo:

* objetivo;
* público;
* dor, desejo ou objeção trabalhada;
* benefício;
* ângulo;
* hook;
* roteiro;
* cenas;
* CTA;
* duração ou orientações relevantes.

Um plano com 20 conteúdos gera 20 `Content`, cada um com ao menos uma versão inicial de Briefing.

Cada conteúdo pode ser:

* revisado;
* editado;
* regenerado parcialmente;
* descartado;
* aprovado.

Editar ou regenerar algo que altere o Briefing cria uma nova `ContentBriefVersion`. Ao aprovar, a versão exata aprovada deve ser preservada.

Somente conteúdos em `APPROVED` podem ser selecionados para um lote de gravação.

Um `RecordingBatchItem` deve preservar a referência ao `Content` e à versão aprovada usada naquela execução. Edições posteriores não podem alterar silenciosamente a versão já vinculada a um lote.

No MVP, o creator utiliza o Estúdio para organizar e acompanhar a execução do Briefing durante sua sessão de gravação.

A captura do vídeo acontece fora da plataforma, utilizando a câmera, celular ou equipamento que o creator já utiliza.

Futuramente, a mesma versão aprovada poderá ser executada pela AI Content Production Engine.

O Briefing do Conteúdo é o contrato entre a estratégia criada pela plataforma e sua execução.

---

# 26. Estúdio e Lotes de Gravação

Depois da aprovação, o creator seleciona conteúdos aprovados para formar um **lote de gravação**.

O lote é a unidade operacional do Estúdio.

No MVP:

* um lote pertence a um único Produto;
* contém um ou mais conteúdos aprovados;
* possui uma data planejada de gravação;
* possui progresso calculado pela quantidade de conteúdos concluídos;
* seu estado visível é derivado automaticamente.

Estados visíveis do lote:

```text
Aguardando
Gravando
Concluído
```

Regra:

```text
0 concluídos de N       → Aguardando
1 até N-1 concluídos    → Gravando
N concluídos de N       → Concluído
```

`Gravando` significa apenas que a execução daquele lote já foi iniciada. Não significa que a plataforma esteja capturando vídeo ou áudio.

O usuário não deve administrar esse status manualmente.

O Estúdio pode organizar os lotes por esses três estados, utilizando colunas, listas ou outra composição simples conforme definido pelo Design System.

O Estúdio é um centro operacional de pré-produção e acompanhamento dos lotes. Ele organiza o que será gravado, apresenta o material necessário para cada conteúdo e acompanha o progresso informado pelo creator. Não realiza a gravação propriamente dita.

Não transformar o Estúdio em uma ferramenta genérica de gestão de projetos.

---

# 27. Guia de Gravação

Ao abrir um lote no Estúdio, o creator vê quais conteúdos pertencem à sessão e quais já foram concluídos.

Exemplo:

```text
Mini Aspirador
3 de 8 concluídos

✓ Conteúdo #01
✓ Conteúdo #02
✓ Conteúdo #03
○ Conteúdo #04
○ Conteúdo #05
○ Conteúdo #06
○ Conteúdo #07
○ Conteúdo #08
```

Ao abrir um conteúdo, o **Guia de Gravação** deve mostrar apenas o necessário para orientar sua execução:

```text
VÍDEO 4 DE 8

HOOK

ROTEIRO

CENAS

CTA

[Anterior]

[Concluir conteúdo]

[Próximo]
```

O Guia de Gravação não é uma interface de captura de vídeo.

No MVP, o Estúdio não deve:

* acessar ou controlar a câmera do dispositivo;
* possuir botão de REC, obturador ou preview de câmera;
* capturar áudio ou vídeo;
* editar mídia;
* substituir o aplicativo ou equipamento utilizado pelo creator para gravar.

A gravação acontece externamente. A plataforma permanece aberta apenas como guia operacional e mecanismo de acompanhamento do lote.

Regras:

* concluir um conteúdo atualiza imediatamente o progresso do lote;
* `Próximo` não conclui implicitamente;
* o creator decide quando avançar;
* não existe necessidade de alterar o estado do lote manualmente;
* ao concluir todos os conteúdos, o lote passa automaticamente para `Concluído`.

O objetivo é orientar o creator durante sessões reais de gravação, deixando claro o que falar, mostrar e concluir, sem realizar a captura do conteúdo.

---

# 28. Agenda de Gravação

Ao criar um lote, o creator define quando pretende gravá-lo.

Fluxo mínimo:

```text
Conteúdos aprovados
↓
Criar lote
↓
Quando pretende gravar?

[Hoje]
[Amanhã]
[Escolher data]
↓
Agenda
```

A Agenda é uma visão temporal dos lotes e deve permitir visualizar:

```text
Dia
Semana
Mês
```

Cada item deve mostrar apenas informação operacional suficiente:

* Produto;
* quantidade de conteúdos;
* progresso, quando já iniciado;
* data planejada.

Ações principais:

```text
[Abrir no Estúdio]
[Reagendar]
```

No MVP, a data é suficiente. Horário, duração, recorrência e lembretes customizados não são obrigatórios.

A Agenda é interna à plataforma. Sincronização com Google Calendar, criação de lembretes externos e agendamento de publicação ficam para evoluções futuras.

---

# 29. Histórico e Memória Operacional

O histórico representa a memória intelectual e operacional do usuário.

Deve preservar, conforme aplicável:

* Produto;
* plano;
* conteúdo;
* Briefing aprovado e suas versões;
* hook;
* ângulo;
* estratégia utilizada;
* lote de gravação;
* data planejada;
* data de conclusão;
* status;
* campanha;
* mídia final, quando existir futuramente.

No MVP, essa memória deve aparecer principalmente no contexto do próprio Produto, através da área `Histórico`.

`Content Vault` pode permanecer como conceito de domínio ou nome técnico interno, mas não precisa existir como destino global da navegação.

O histórico não é simplesmente armazenamento de mídia. Ele sustenta continuidade operacional e controle de variedade.

---

# 30. Home

A Home é a entrada operacional da aplicação.

Ela não deve parecer um dashboard de analytics.

A prioridade é mostrar a próxima ação útil.

Pode conter:

* campo para adicionar/analisar um novo Produto;
* gravações planejadas para hoje;
* lote iniciado que precisa ser continuado;
* próximas gravações já planejadas.

Exemplo:

```text
Home

[ Cole a URL de um produto... ] [Analisar produto]

Gravações de hoje

Mini Aspirador
3 de 8 concluídos
[Continuar lote]

Próximas gravações

Amanhã · Escova Modeladora · 5 conteúdos
Sexta · Mini Projetor · 10 conteúdos
```

A Home não deve possuir:

* bloco `Ainda sem data`;
* KPI cards;
* gráficos;
* scorecards;
* analytics;
* números soltos sem vínculo com Produto ou lote.

Percentual ou contagem podem aparecer quando representarem progresso real de um lote.

---

# 31. Fluxo Principal de Onboarding

O onboarding deve conduzir rapidamente ao primeiro valor.

Fluxo desejado:

```text
Criar conta
↓
Colar URL do primeiro Produto
↓
Product Import extrai os fatos
↓
ProductCandidate
↓
Confirmar ou corrigir fatos
+ resolver quantidade inicial
↓
CommerceIntelligenceJob inicia automaticamente
↓
Usuário pode continuar navegando
↓
Briefings ficam disponíveis
↓
Revisar conteúdos
```

O onboarding não deve exigir que o creator opere a Strategy passo a passo nem preencher público, dores, objeções ou outros elementos estratégicos que a plataforma consegue inferir.

A meta deve ser fazer o usuário chegar aos primeiros conteúdos úteis para revisão rapidamente.

O onboarding não deve ensinar toda a plataforma. O próprio produto deve ensinar através do uso.

---

# 32. Fluxo de Novo Produto

```text
Novo Produto
↓
Colar URL ou usar fallback manual
↓
Extrair ou informar fatos
↓
ProductCandidate
↓
Confirmar Produto + quantidade inicial
↓
Product é persistido
↓
CommerceIntelligenceJob inicia automaticamente
↓
Strategy + ContentPlan + Briefings em DRAFT
↓
Briefings prontos para revisão
```

Não existe uma etapa obrigatória separada de `Definir contexto`, `Gerar estratégia`, `Visualizar estratégia` ou `Gerar plano` no fluxo inicial. A Strategy permanece consultável posteriormente dentro do Produto.

---

# 33. Fluxo de Nova Geração

Após um Produto já possuir uma `ProductStrategy` ativa:

```text
Produto
↓
Gerar novos conteúdos
↓
GenerationConstraints
(targetContentCount obrigatório;
outros direcionamentos opcionais)
↓
Engine reutiliza Strategy ativa
↓
Engine consulta Product Memory
↓
Content Portfolio Planner planeja o conjunto
↓
Engine evita repetição e preserva relevância
↓
Novos Content + Briefings em DRAFT
são adicionados ao Produto
```

Uma restrição local da geração não deve reescrever automaticamente a Strategy principal.

`Lote de gravação` é um conceito operacional posterior à aprovação. Não utilizar `lote` como sinônimo de uma nova geração de conteúdos para evitar ambiguidade.

---

# 34. Quantidades e Planos

A inteligência estratégica deve permanecer igual em todos os planos pagos.

A diferença comercial será baseada principalmente em capacidade de uso.

Possíveis limitadores:

* quantidade de Produtos ativos;
* conteúdos gerados por mês;
* campanhas;
* quantidade de gerações;
* quantidade de lotes de gravação ativos, se fizer sentido comercialmente;
* armazenamento/histórico;
* membros, futuramente;
* funcionalidades operacionais adicionais.

Não deve existir:

> IA ruim no plano básico e IA boa no plano premium.

Isso prejudicaria a proposta do produto.

---

# 35. Regeneração

Usuários devem poder rejeitar ou regenerar elementos específicos.

Exemplos:

* gerar novo hook;
* trocar ângulo;
* mudar CTA;
* gerar nova estrutura;
* gerar nova versão completa.

O sistema deve preservar contexto.

O usuário não deve precisar explicar novamente todo o produto.

---

# 36. Feedback sobre Conteúdo

No MVP, os sinais principais devem estar ligados ao workflow real do conteúdo:

* aprovar;
* descartar;
* regenerar;
* editar;
* duplicar.

`Descartar` é uma decisão de negócio e preserva o conteúdo como sinal de memória para futuras gerações. Não deve ser tratado como exclusão destrutiva.

`Gostei` e `não gostei` podem ser avaliados futuramente como sinais adicionais de personalização, mas não são necessários enquanto não houver comportamento de produto claramente associado a eles.

Hard delete, soft delete e política de retenção são decisões técnicas/administrativas separadas do estado `DISCARDED` e permanecem fora deste PRD.

---

# 37. Edição Manual

Todo conteúdo gerado deve ser editável.

O creator mantém controle final sobre:

* hook;
* script;
* cenas;
* CTA;
* título interno;
* observações.

A plataforma é um sistema de inteligência e produtividade, não uma caixa-preta.

---

# 38. Campanhas

Campanha pode existir como agrupamento opcional.

Exemplo:

```text
Black Friday
↓
Air Fryer
Escova
Projetor
```

Entretanto, o MVP não deve transformar campanhas em uma estrutura obrigatória nem exigir um aggregate próprio para validar o core loop. Quando existir, campanha funciona apenas como agrupamento opcional.

Produto deve continuar sendo o principal objeto da experiência.

---

# 39. Busca e Filtros

Busca e filtros devem aparecer no contexto em que ajudam uma ação real.

Em **Produtos**:

* busca por nome;
* filtro por ativos;
* filtro por pendentes, quando a criação ainda não foi finalizada;
* filtro por arquivados.

Dentro de um **Produto**, a busca pode localizar hooks, scripts e conteúdos daquele contexto.

No **Estúdio**, filtros opcionais podem incluir:

* Produto;
* status do lote;
* data.

Na **Agenda**, a dimensão temporal já é a organização principal e não deve ser duplicada por uma barra pesada de filtros.

Filtros não devem adicionar complexidade apenas porque os dados permitem.

---

# 40. Interface

O princípio visual do produto deve ser:

**complexidade por trás, simplicidade na frente.**

A engine pode ser altamente sofisticada.

A interface não deve expor essa complexidade desnecessariamente.

Evitar:

* dashboards analíticos;
* gráficos;
* indicadores sem ação associada;
* porcentagens decorativas;
* scores;
* métricas técnicas;
* excesso de estados e controles.

Percentuais são permitidos quando representam progresso concreto de um lote de gravação.

A pergunta visual deve sempre ser:

> “Qual é a próxima coisa útil que o creator precisa fazer?”

As superfícies principais devem representar tarefas naturais do creator e não necessariamente os nomes internos dos domínios técnicos.

---

# 41. Navegação Principal

A navegação principal do MVP é:

```text
Home

Produtos

Estúdio

Agenda

Configurações
```

Responsabilidades:

* **Home** — entrada operacional, novo Produto, gravações de hoje e próximas gravações;
* **Produtos** — produtos promovidos, estratégia, planos, conteúdos e histórico;
* **Estúdio** — lotes aguardando, em gravação ou concluídos e modo de execução;
* **Agenda** — calendário interno de gravações planejadas;
* **Configurações** — conta, plano e preferências da plataforma.

`Conteúdos`, `Produção` e `Vault` podem continuar existindo como conceitos de domínio, mas não são destinos globais de primeiro nível no MVP.

---

# 42. Tela de Produto

A página de Produto deve funcionar como centro de inteligência e histórico daquele objeto.

Lista global de Produtos pode utilizar cards com:

* imagem;
* nome;
* estado operacional relevante;
* próxima ação.

Filtros principais:

```text
Ativos
Pendentes
Arquivados
```

`Pendentes` representa Produtos cujo processo de importação, estratégia ou criação inicial de conteúdo ainda não foi concluído. É uma projeção operacional de readiness e não deve ser confundida com o lifecycle persistente do Produto, como `Ativo` ou `Arquivado`.

Ao abrir um Produto, a organização principal deve ser:

```text
[Visão geral]
[Estratégia]
[Conteúdos]
[Histórico]
```

### Visão geral

Fatos principais do Produto e próxima ação.

### Estratégia

Públicos, dores, desejos, objeções, benefícios, argumentos e ângulos utilizados pela engine.

### Conteúdos

Planos, Briefings, revisão, edição, regeneração, aprovação e criação de lotes.

### Histórico

Lotes e conteúdos já concluídos, além da memória necessária para continuidade e controle de variedade.

A estratégia não precisa ocupar permanentemente a tela. Ela deve servir como base para tudo.

---

# 43. Página de Estratégia

Deve permitir ao creator compreender rapidamente como o sistema pretende vender o produto.

Exemplo:

```text
Produto
Mini Projetor XYZ

Principais públicos
- casais
- estudantes
- famílias
- pessoas sem TV

Principais dores
- tela pequena
- TV cara
- pouco espaço

Desejos
- cinema em casa
- praticidade
- entretenimento

Objeções
- qualidade
- brilho
- tamanho
- instalação

Ângulos prioritários
...
```

O usuário pode editar ou regenerar elementos quando essa capacidade estiver disponível. Alterações estratégicas materiais devem produzir uma nova versão de `ProductStrategy` ou seguir a regra de `STALE`; conteúdos históricos continuam vinculados à versão utilizada. A matriz exata de campos editáveis pertence à Spec da Strategy.

---

# 44. Página do Plano

A página do Plano deve mostrar uma visão organizada dos conteúdos planejados para aquele Produto.

Exemplo:

```text
30 conteúdos

8 Problema
6 Demonstração
5 Curiosidade
4 Objeção
3 Comparação
2 Lifestyle
2 Benefício
```

Abaixo:

```text
#01
“Se sua TV ocupa metade do quarto…”

Problema → solução
Aprovado

#02
“Eu achei que isso seria muito pior que uma TV…”

Objeção
Rascunho
```

Os estados de revisão do Briefing não devem ser confundidos com os estados do lote no Estúdio.

No contexto de revisão, estados mínimos podem ser:

```text
Rascunho
Aprovado
Descartado
```

No Estúdio, o lote usa exclusivamente:

```text
Aguardando
Gravando
Concluído
```

---

# 45. Objeto Content

`Content` é a identidade estável de um conteúdo ao longo de revisão, versionamento e execução.

Estrutura conceitual mínima:

```ts
interface Content {
  id: string;
  productId: string;
  planId: string;
  opportunityId?: string;

  status: ContentStatus;

  currentBriefVersionId: string;
  approvedBriefVersionId?: string;

  createdAt: Date;
  updatedAt: Date;
}

type ContentStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'DISCARDED';
```

O material revisável e executável pertence às versões do Briefing:

```ts
interface ContentBriefVersion {
  id: string;
  contentId: string;
  version: number;

  objective?: string;
  targetAudience?: string;
  pain?: string;
  desire?: string;
  objection?: string;
  benefit?: string;

  angle: string;
  hook: string;
  structure?: string;
  script: string;
  scenes: Scene[];
  cta: string;
  notes?: string;

  createdAt: Date;
}
```

A interface humana pode continuar chamando a versão atual de **Briefing do Conteúdo**; não é necessário expor a estrutura de versionamento permanentemente.

Regras:

* a Commerce Intelligence cria o `Content` em `DRAFT` e sua versão inicial;
* editar ou regenerar o Briefing cria uma nova `ContentBriefVersion`;
* aprovar define a versão exata em `approvedBriefVersionId`;
* editar um conteúdo aprovado cria nova versão que precisa ser aprovada antes de substituir a versão aprovada para futuras execuções;
* lotes já criados continuam referenciando a versão aprovada usada quando foram montados;
* `DISCARDED` preserva a memória e não equivale a apagar o registro;
* conclusão de gravação pertence ao `RecordingBatchItem`, não ao `ContentStatus`.

Essa separação mantém inteligência, rastreabilidade e uma interface simples.

---

# 46. Princípio de Explicabilidade

O sistema pode opcionalmente mostrar por que determinada ideia foi criada.

Exemplo:

> “Este vídeo trabalha a objeção de que o produto é fraco.”

Isso ajuda o creator a compreender estratégia sem transformar a experiência em curso de marketing.

---

# 47. Personalização

O sistema deve começar genérico, mas preparado para aprender preferências.

Possíveis informações futuras:

* estilo do creator;
* duração média;
* presença em câmera;
* tom;
* tipos favoritos de hook;
* categorias mais utilizadas;
* formato de script preferido.

No MVP, personalização pode ser baseada principalmente em configurações explícitas.

---

# 48. Internacionalização

Mesmo com TikTok Shop como foco inicial, o domínio do produto deve ser preparado para diferentes mercados.

Os elementos estratégicos são universais:

* dor;
* desejo;
* objeção;
* benefício;
* hook;
* CTA;
* script;
* ângulo.

Textos e terminologias podem ser adaptados por idioma e mercado.

---

# 49. Métricas de Produto

As métricas do MVP devem medir comportamento dentro da plataforma. Elas são métricas de produto para validação do negócio e não justificam dashboards analíticos na interface do creator.

## Ativação

* usuário adicionou primeiro Produto;
* estratégia foi gerada;
* primeiro plano foi criado;
* primeiro Briefing foi aprovado;
* primeiro lote de gravação foi criado e recebeu uma data;
* primeiro conteúdo foi concluído no Estúdio.

## Engajamento

* conteúdos gerados por usuário;
* Produtos ativos;
* sessões por semana;
* conteúdos revisados;
* Briefings aprovados;
* lotes criados;
* lotes iniciados;
* conteúdos concluídos no Estúdio.

## Retenção

* usuários que retornam para gerar novos lotes;
* usuários que continuam usando o mesmo Produto;
* usuários que retornam para executar gravações planejadas;
* usuários ativos semanalmente.

## Conversão

* free → pago, caso exista free;
* trial → pago;
* upgrade por limite de utilização.

---

# 50. North Star Metric

Uma candidata forte para métrica principal é:

**Quantidade de conteúdos planejados que são efetivamente concluídos no Estúdio.**

Isso conecta inteligência à execução real.

Métrica complementar:

**Creators que concluem pelo menos um conteúdo através da plataforma por semana.**

Outra medida operacional útil é a proporção de lotes criados que chegam a `Concluído`, sem transformar essa métrica em elemento obrigatório da interface.

---

# 51. Critérios de Sucesso do MVP

O MVP estará validado se houver evidência consistente de que:

1. usuários adicionam Produtos;
2. geram estratégias;
3. revisam e aprovam Briefings;
4. utilizam os conteúdos produzidos pela plataforma;
5. criam lotes de gravação;
6. planejam uma data para esses lotes;
7. retornam à Home e à Agenda para saber o que gravar;
8. utilizam o Estúdio durante a execução;
9. concluem conteúdos dentro dos lotes;
10. concluem lotes completos;
11. retornam semanalmente para gerar novos conteúdos ou executar gravações;
12. mantêm múltiplos Produtos;
13. atingem limites de uso;
14. demonstram disposição de pagamento.

A métrica mais importante não será número de textos gerados.

Será:

> **A plataforma está entrando no processo real de produção do creator?**

---

# 52. Hipótese Principal

A hipótese central do MVP é:

> Creators de TikTok Shop que precisam produzir conteúdo em alto volume pagarão por uma plataforma que transforme produtos em estratégias comerciais completas e conteúdos organizados prontos para gravação.

---

# 53. Hipóteses Secundárias

### Hipótese A

Creators têm dificuldade recorrente para decidir o que gravar.

### Hipótese B

Ferramentas genéricas de IA não resolvem adequadamente organização e memória operacional.

### Hipótese C

Variedade estratégica aumenta valor percebido.

### Hipótese D

Organização por lotes, Agenda e Estúdio aumenta retenção porque aproxima planejamento da execução real.

### Hipótese E

Creators trabalharão múltiplos produtos dentro da plataforma.

### Hipótese F

A geração automática de vídeo não é necessária para validar o valor central.

---

# 54. Riscos do MVP

## Qualidade estratégica

Se os conteúdos parecerem genéricos, o produto perde valor.

## Repetição

Gerar variações superficiais do mesmo conteúdo destruirá a percepção de inteligência.

## Complexidade da UX

Se a plataforma expuser toda a engine, ficará pesada demais.

## Produto percebido como “wrapper de ChatGPT”

O diferencial precisa aparecer através de:

* memória;
* estrutura;
* estratégia;
* workflow;
* organização;
* continuidade;
* contexto acumulado.

## Ausência de performance externa

Sem integração com TikTok, inicialmente o sistema não sabe automaticamente qual conteúdo vendeu melhor.

Isso deve ser aceito no MVP.

---

# 55. Diferenciação

O produto não compete apenas através da geração textual.

A vantagem está na soma:

```text
Conhecimento comercial especializado
+
Estratégia de conteúdo
+
Contexto permanente
+
Memória de Produto
+
Controle de variedade
+
Briefings executáveis
+
Lotes de gravação
+
Agenda interna
+
Estúdio operacional
+
Histórico operacional
```

É essa composição que precisa tornar o sistema mais útil que simplesmente conversar com um modelo de linguagem.

O diferencial não é apenas responder **o que gravar**, mas transformar essa decisão em uma operação organizada até a conclusão.

---

# 56. Fora do MVP, mas Preparado Conceitualmente

## AI Production

No futuro:

```text
Approved Content Brief
↓
Production Specification
↓
AI Video Provider
↓
Vídeo
```

A estratégia permanece exatamente a mesma.

A diferença é o executor.

### Creator

```text
Briefing aprovado
↓
Lote de gravação
↓
Estúdio
↓
Creator grava
```

### IA

```text
Briefing aprovado
↓
AI Production
↓
IA produz
```

A execução por IA não deve redefinir público, dor, ângulo, hook, roteiro ou CTA.

Essa expansão não deve exigir reconstrução do core estratégico ou do Briefing.

---

# 57. Evoluções Futuras

Após validar o MVP:

### Fase 2

* melhorias avançadas de histórico e memória operacional;
* integração opcional com Google Calendar;
* eventos e lembretes externos para sessões de gravação;
* aprendizado de preferências;
* análise manual de performance;
* sugestões baseadas em conteúdos vencedores;
* templates especializados;
* colaboração.

### Fase 3

* integração TikTok;
* importação de dados de performance;
* performance por conteúdo;
* aprendizado baseado em vendas;
* otimização automática de estratégia.

### Fase 4

* geração de vídeo;
* geração de imagem;
* geração de voice-over;
* produção multimodal;
* múltiplos providers;
* créditos.

### Fase 5

Expansão para:

* Instagram;
* Shopee;
* Amazon;
* outras plataformas de social commerce.

---

# 58. Definição Final do MVP

O MVP deve permitir que um creator:

1. adicione um Produto, preferencialmente por URL;
2. receba um `ProductCandidate` com fatos extraídos e possa corrigi-los;
3. confirme os fatos e resolva a quantidade inicial antes do processamento;
4. tenha o `Product` persistido e o `CommerceIntelligenceJob` iniciado automaticamente;
5. continue usando a aplicação enquanto a Commerce Intelligence trabalha em segundo plano;
6. receba uma `ProductStrategy` persistente, um `ContentPlan` diversificado e conteúdos em `DRAFT`;
7. visualize Briefings com hooks, roteiros, cenas e CTAs;
8. edite, regenere, descarte e aprove conteúdos com versionamento rastreável;
9. selecione conteúdos aprovados para formar um lote de gravação preservando a versão aprovada;
10. escolha quando pretende gravar o lote;
11. consulte seus lotes pela Agenda em visão de dia, semana ou mês;
12. acompanhe no Estúdio lotes `Aguardando`, `Gravando` e `Concluído`;
13. utilize um Guia de Gravação simplificado, sem captura de mídia;
14. conclua conteúdos individualmente e veja o progresso do lote subir automaticamente;
15. conclua o lote sem alterar status manualmente;
16. consulte o histórico no contexto do Produto e preserve sinais para Product Memory;
17. gere novos conteúdos reutilizando Strategy e Memory, sem repetir excessivamente o que já foi explorado.

Se essas dezessete etapas funcionarem muito bem, temos o produto.

Todo o resto pode esperar.

---

# 59. Definição de Produto em Uma Frase

> **Uma plataforma de inteligência comercial para creators de TikTok Shop que transforma produtos em estratégias e conteúdos de venda, organiza sessões de gravação e acompanha a execução até a conclusão.**

---

# 60. Regra de Produto

Sempre que surgir uma nova funcionalidade durante o desenvolvimento do MVP, ela deve responder a pelo menos uma das seguintes perguntas:

> Isso ajuda o creator a saber **o que gravar**?

> Isso ajuda o creator a saber **como gravar**?

> Isso ajuda o creator a **organizar quando e o que precisa gravar**?

> Isso ajuda o creator a **executar e concluir uma sessão de gravação**?

> Isso ajuda a plataforma a evitar **repetição e estratégia ruim**?

Se a resposta for não, provavelmente não pertence ao MVP.
