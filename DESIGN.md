# Design System — Commerce Intelligence

**Status:** fonte de verdade visual do produto  
**Versão:** 1.8
**Locale do MVP:** `pt-BR`  
**Escopo:** decisões de produto visual, tokens, comportamento responsivo, estados e contratos de componentes. Este documento **não implementa telas, componentes ou dependências**.

> **Memória desejada:** ao abrir a Home, o creator entende imediatamente o que precisa fazer e o que tem para gravar.

## 1. Contexto do produto

### O que é

Plataforma de inteligência comercial para creators e afiliados de TikTok Shop. Um Produto passa por estratégia, plano e Conteúdos até formar lotes executáveis no Estúdio e na Agenda de gravação.

A interface deve tornar simples na superfície uma engine complexa de análise, memória, variedade e geração. O produto não é um dashboard de métricas, uma rede social nem um wrapper de chat.

### Para quem é

- creators iniciantes que precisam de orientação para decidir o que gravar;
- creators intermediários que precisam escalar sem perder organização;
- creators de alto volume que precisam transformar estratégia em uma operação repetível;
- pequenas equipes só entram como cenário futuro, fora do MVP atual; a experiência principal continua individual.

### Tipo de produto

Aplicativo web de produtividade operacional, responsivo e orientado a workflow. A superfície principal é uma aplicação de trabalho, não uma página de marketing.

### Fontes usadas

- `docs/product/PRD.md` — domínio, core loop, entidades, estados e não objetivos;
- `docs/product/PRD-Importation-product.md`, `PRD-commerce-intelligence-engine.md`, `PRD-product-intelligence-analysis.md`, `PRD-content-briefing.md` e `PRD-model-router-inteligence.md` — frentes funcionais vigentes;
- `docs/architecture/SYSTEM-DESIGN.md`, ADRs e `docs/engineering/PRINCIPLES.md` — fronteiras técnicas que a interface respeita sem expor;
- diretrizes visuais aprovadas do produto — estética, paleta e regras de uso.

macOS/iPadOS, Things e Linear são referências de sensação, clareza e disciplina de interface, não fontes para copiar elementos proprietários.

## 2. Direção visual

### Estética

**Premium minimalista operacional.** Tipografia, ritmo, alinhamento e estados carregam a hierarquia. A interface deve parecer um instrumento profissional para trabalho recorrente: calma, rápida, confiável e pronta para ação.

- **Decoração:** mínima e intencional; nenhum ornamento que concorra com o próximo passo.
- **Composição:** grid disciplinado para o aplicativo; assimetria só quando melhora a leitura de um objeto real.
- **Densidade:** confortável para leitura contínua, com concentração maior em listas e filas no desktop.
- **Profundidade:** bordas sutis e elevação reservada a superfícies flutuantes. Conteúdo principal é sólido.
- **Referências:** a familiaridade de macOS/iPadOS, a execução direta de Things e a clareza estrutural de Linear, sem reproduzir layout, ícones, nomenclatura ou componentes dessas referências.

### Princípios não negociáveis

1. **Superfície principal completa.** Mobile concentra a experiência inteira do produto, com prioridade máxima para execução; desktop expande planejamento, organização e operações de alta densidade.
2. **Resumo responsivo:** Mobile = experiência completa + execução prioritária; Desktop = experiência expandida + planejamento em escala.
3. **Next action first.** Cada tela, estado vazio e bloco deve deixar óbvia uma próxima ação útil.
4. **Complexidade por trás, simplicidade na frente.** Mostrar o mínimo necessário para a decisão atual.
5. **Progressive disclosure.** Estratégia profunda, proveniência e explicabilidade aparecem sob demanda, sem esconder status, erro ou ação necessária.
6. **Home é operacional.** A entrada da aplicação deve responder “o que tenho para fazer agora?” e oferecer o caminho mais curto para adicionar um novo Produto ou continuar uma gravação.
7. **Estúdio contínuo.** O fluxo de gravação deve favorecer `abrir lote → concluir conteúdo → próximo`, com progresso do lote derivado automaticamente.
8. **Cards representam objetos reais.** Product, Content e, quando existir, lote de produção podem usar card. Métrica solta, agrupamento decorativo ou seção genérica não usa card.
9. **Glass é periférico.** Transparência e blur só em navegação, toolbars e elementos flutuantes. O conteúdo permanece sólido.
10. **Cor tem semântica.** `color.action.filled` sinaliza ações preenchidas; `color.brand.accent` sinaliza marca, seleção e acentos secundários. `color.intelligence` sinaliza inteligência ou geração. Tags, ângulos e categorias são neutros.
11. **Light é o padrão.** Dark usa os mesmos nomes de tokens semânticos e muda somente seus valores de tema definidos aqui.
12. **Acessibilidade é parte do visual.** Foco, erro, contraste, teclado, toque e redução de movimento não são estados posteriores.
13. **Componentes servem à jornada; não limitam o design.** Os componentes já existentes, incluindo shadcn/ui, são primitives reutilizáveis e não fronteiras da solução. A cada jornada, escolher o padrão que melhor resolve hierarquia, densidade, compreensão, responsividade, acessibilidade e qualidade percebida; criar componentes novos quando os existentes não atenderem a esses critérios. Não forçar `Tabs`, cards, accordions ou qualquer outro padrão somente porque já existe no projeto. Componentes novos devem reutilizar os tokens, contratos de acessibilidade e comportamento responsivo deste documento, sem duplicar uma capacidade que o componente existente já resolve adequadamente.

### Método 3S: Simples, Sexy, Surpreendente

Avalie estados e superfícies na ordem Simples → Sexy → Surpreendente; uma camada só entra quando a anterior já cumpre sua função. O método legitimiza expressividade com intenção — vale para qualquer superfície que precise comunicar foco, estado, marca ou progresso real, não apenas carregamento.

- **Simples:** a menor solução correta, com dados reais do domínio. Nada inventado: nunca progresso ou ETA falso.
- **Sexy:** assinatura visual construída com os tokens existentes — cor semântica, tipo e ritmo; gradiente e movimento, quando justificados, seguem suas regras condicionais (cor e motion).
- **Surpreendente:** no máximo um detalhe memorável por região, sempre honesto (derivado de estado real); o que for decorativo é silencioso para tecnologia assistiva, que continua recebendo o significado por texto.

Acessibilidade, tokens, `prefers-reduced-motion` e ausência de dados falsos não são negociáveis em nenhuma das camadas.

### Riscos deliberados e por que valem a pena

- **Mobile como experiência completa:** cadastrar Produto, gerar estratégia, revisar/editar Content, montar lote e gravar acontecem na superfície principal. A execução recebe prioridade visual, mas nenhuma capacidade é artificialmente retirada do mobile.
- **Desktop como expansão, não exclusividade:** planejamento em escala, organização, filtros, comparação e operações densas ganham espaço no desktop sem monopolizar capacidades do produto. O custo é manter dois arranjos responsivos coerentes.
- **Taxonomia visual neutra:** ângulos, tags e categorias não recebem uma cor própria. Isso protege a leitura e evita que o sistema pareça uma coleção de chips; o custo é menos diferenciação cromática imediata.

## 3. Modelo de navegação e responsividade

### Navegação principal

A ordem e a nomenclatura são fixas no MVP:

1. **Home** — entrada operacional, novo Produto, gravações de hoje e próximas gravações;
2. **Vitrine** — catálogo operacional dos Produtos, estratégia, Conteúdos e histórico de cada Produto;
3. **Estúdio** — esteira dos lotes de gravação e execução dos Conteúdos;
4. **Agenda** — calendário interno das gravações planejadas;
5. **Configurações** — conta, plano e preferências da plataforma.

`Conteúdos`, `Produção` e `Vault` continuam existindo como conceitos de domínio quando necessários, mas não são destinos de primeiro nível da interface. Conteúdos pertencem ao contexto de um Produto e ao lote em execução; histórico e memória intelectual aparecem dentro do Produto e dos fluxos que precisam deles.

Não criar itens paralelos como `Hoje`, `Produção`, `Conteúdos` ou `Vault` na navegação principal do MVP.

### Modelo mental da navegação

A sidebar deve refletir tarefas naturais do creator, não a arquitetura interna:

```text
Home
↓
O que faço agora?

Vitrine
↓
O que estou promovendo e quais conteúdos existem para isso?

Estúdio
↓
O que está esperando, sendo gravado ou já foi concluído?

Agenda
↓
Quando vou gravar cada lote?

Configurações
↓
Como minha conta e a plataforma estão configuradas?
```

### Shell por superfície

| Superfície                    | Regra de layout                                                              | Prioridade de uso                                                |
| ----------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Mobile, até `767px`           | uma coluna; header contextual; Sidebar shadcn/ui em modo drawer (off-canvas) | experiência completa, com execução prioritária                   |
| Tablet, `768–1199px`          | rail lateral compacta de `72px` + região principal                           | experiência completa, revisão e organização com mais contexto    |
| Desktop, a partir de `1200px` | sidebar fixa de `240px` + região principal com toolbar                       | experiência expandida, planejamento em escala e operações densas |
| Wide, a partir de `1440px`    | mesmo shell; somente a coluna de conteúdo é limitada                         | mais densidade e comparação, sem capacidade exclusiva            |

**Resumo:** Mobile = experiência completa + execução prioritária; Desktop = experiência expandida + planejamento em escala.

A mudança de breakpoint altera composição, densidade e prioridade, não o modelo mental nem o conjunto de capacidades.

### Contrato do shell desktop

- o shell externo usa duas regiões: `240px` para a sidebar e `minmax(0, 1fr)` para a região principal;
- a sidebar contém os cinco destinos principais e permanece fixa durante a rolagem;
- a região principal tem `min-width: 0`, ocupa todo o espaço restante e contém a toolbar contextual quando a tela precisar dela;
- a toolbar tem `56px` de altura de referência e percorre a largura disponível da região principal;
- dentro da região principal, a coluna de conteúdo usa `width: min(100%, 1440px)`, fica centralizada quando houver espaço e recebe padding lateral de `32px` no desktop;
- entre `1200px` e `1439px`, a coluna usa toda a largura disponível após a sidebar e o padding, sem overflow horizontal e sem tentar atingir `1440px`;
- em `1440px` ou mais, o limite de `1440px` aplica-se somente à coluna de conteúdo; fundo e toolbar continuam ocupando a região principal;
- nenhum breakpoint Wide cria terceira coluna, segunda sidebar ou painel decorativo.

### Padrão de largura de conteúdo por página

O limite de `1440px` do shell é o teto da região principal, não a largura que cada tela deve usar internamente. Para evitar páginas com proporções inconsistentes entre si, toda tela operacional segue uma de duas categorias, sem valores intermediários ad hoc:

- **Full-width operacional:** telas cujo conteúdo principal é o objeto de trabalho — Home operacional, Vitrine (grade/lista), Product detail, Estúdio e Agenda — ocupam toda a largura útil da coluna de conteúdo (até o teto de `1440px` do shell). Grades de cards usam colunas responsivas (`auto-fill`/`minmax`) para não formar cards artificialmente largos nem vazio estrutural quando a coluna crescer.
- **Coluna de leitura:** reservada exclusivamente a mensagens de estado — vazio, erro, loading textual e confirmação — que não representam a grade/lista principal da tela. Usa `max-width` entre `560px` e `640px`, centralizada, para manter a leitura curta legível.

Nenhuma tela usa uma coluna de leitura para sua composição operacional principal (header do objeto, grade de cards, tabs ou lista de itens); a coluna estreita é exclusiva de estados de mensagem.

### Regras mobile

- mobile é uma superfície completa; execução continua tendo prioridade de ordem, foco e ação;
- mobile permite adicionar Produto, acompanhar criação, revisar Conteúdos, executar lotes e consultar/reagendar a Agenda;
- conteúdo útil começa com a ação ou o objeto mais urgente;
- uma mão deve alcançar ações primárias e navegação;
- definir `--safe-bottom` como `env(safe-area-inset-bottom, 0px)`;
- a navegação principal no mobile usa a Sidebar shadcn/ui em modo drawer (off-canvas), aberta a partir do header contextual; o drawer respeita `--safe-bottom`, mantém controles com alvo mínimo de `44×44px` e fecha com Escape, scrim ou seleção de destino;
- o header contextual tem `56px` de altura de referência e não cobre o primeiro bloco de conteúdo;
- a barra de ação do modo de gravação fica sticky na base da tela, com `inset-block-end: var(--safe-bottom)`, e nunca cobre o CTA;
- filtros complexos entram em sheet/bottom sheet;
- listas usam leitura vertical e ação direta; tabelas e colunas densas não são comprimidas;
- modo de gravação mostra somente o necessário para executar: hook, roteiro/cenas, CTA, estado e navegação anterior/próximo;
- concluir um Conteúdo não avança sozinho para o próximo.

### Regras tablet

- o tablet não usa o drawer do mobile nem a sidebar completa do desktop;
- usa rail lateral fixa ou persistente de `72px`, com os cinco destinos em ícone;
- cada ícone mantém nome acessível completo, tooltip ao foco/hover e alvo mínimo de `44×44px`;
- a região principal usa `minmax(0, 1fr)`, grid de oito colunas, gutter de `24px` e padding lateral de `24px`;
- a toolbar contextual permanece com `56px` de altura e pode agrupar ações secundárias;
- todas as capacidades principais continuam acessíveis; o rail apenas compacta a navegação.

### Regras desktop

- desktop usa sidebar persistente como estrutura principal de orientação;
- toolbar contextual é usada para busca, filtros, seleção, ordenação e ações do contexto atual, sem duplicar a sidebar;
- Vitrine pode usar grade/lista de cards e filtros por estado;
- Estúdio pode usar esteira/colunas ou listas agrupadas por status de lote;
- Agenda pode usar calendário de dia, semana ou mês;
- nenhuma operação essencial fica bloqueada no mobile;
- nenhum painel deve ocupar espaço somente para equilibrar a composição.

### Home

A Home é a entrada operacional e não um dashboard de analytics.

Ordem de prioridade:

1. **próxima ação urgente**, quando existir lote de gravação para hoje ou em andamento;
2. **Adicionar produto**, com URL e `Analisar produto`;
3. **Gravações de hoje**, mostrando lotes reais e seu progresso;
4. **Próximas gravações**, mostrando os próximos lotes já agendados.

Para um usuário novo ou sem trabalho operacional ativo, `Adicionar produto` pode assumir a maior prioridade visual. Para um usuário recorrente com lote em andamento, `Continuar gravação` deve aparecer antes.

A Home não possui bloco `Ainda sem data`, lista de pendências genéricas, gráfico, KPI card ou overview analítico.

### Vitrine

Vitrine é a superfície operacional de listagem de cada objeto vendido. `Vitrine` é nomenclatura somente de UI; `Product` permanece a linguagem de domínio e as rotas e contratos continuam em `/products`.

A listagem principal pode possuir:

- busca;
- filtro `Ativos`;
- filtro `Pendentes`, para Produtos cujo fluxo de análise/estratégia/conteúdo ainda não foi finalizado;
- filtro `Arquivados`;

`Pendente` é uma projeção operacional da readiness da inteligência, derivada do processamento/resultado disponível. Não deve ser confundida com o lifecycle persistente do Produto, como `Ativo` ou `Arquivado`.

- ação `Adicionar produto`.

Cada Product card mostra somente informações úteis para decidir a próxima ação, como:

- imagem;
- nome;
- categoria ou contexto curto quando relevante;
- estado atual;
- quantidade operacional de Conteúdos quando útil;
- próxima ação, como `Abrir produto` ou `Continuar`.

Ao abrir um Produto, a página usa as regiões:

```text
Visão geral
Estratégia
Conteúdos
Histórico
```

- **Visão geral:** fatos do Produto, origem, preço, descrição e características relevantes;
- **Estratégia:** públicos, dores, desejos, objeções, benefícios, posicionamento e ângulos;
- **Conteúdos:** Briefings do Conteúdo pertencentes ao Produto, com revisão, edição, regeneração e aprovação;
- **Histórico:** lotes e Conteúdos já concluídos, mantendo a memória operacional sem expor `Vault` como destino global.

O termo `Briefing do Conteúdo` permanece reservado ao briefing de um Conteúdo individual. Não chamar a página inteira do Produto de briefing.

### Estúdio

Estúdio é a superfície de produção e gravação.

A unidade principal é o **lote de gravação**, formado por vários Conteúdos aprovados. Os estados visíveis do lote são:

```text
Aguardando
Gravando
Concluído
```

Esses estados são derivados automaticamente do progresso dos Conteúdos do lote:

```text
0 concluídos de N       → Aguardando
1 até N-1 concluídos    → Gravando
N concluídos de N       → Concluído
```

O usuário não escolhe o status do lote manualmente.

Cada lote pode mostrar:

- Produto;
- data planejada de gravação;
- quantidade total de Conteúdos;
- quantidade concluída;
- progresso textual `3 de 8 concluídos`;
- percentual/barra de progresso operacional quando útil;
- ação `Começar gravação` ou `Continuar gravação`.

Percentual é permitido aqui porque representa o progresso real de um lote, não uma métrica de negócio.

Ao abrir um lote, o usuário vê a lista dos Conteúdos e marca os que já concluiu. O lote deve atualizar imediatamente seu progresso. Ao atingir 100%, muda automaticamente para `Concluído`.

No modo de gravação, priorizar:

```text
Vídeo X de N
Hook
Roteiro
Cenas
CTA
Anterior
Concluir conteúdo
Próximo
```

### Agenda

Agenda é o calendário interno de gravação da plataforma.

Ela responde apenas:

> **Quando pretendo gravar estes Conteúdos?**

A Agenda pode oferecer as visões:

```text
Dia
Semana
Mês
```

Os eventos representam lotes de gravação e mostram, de forma compacta:

- Produto;
- quantidade de Conteúdos;
- progresso quando a gravação já começou;
- horário somente se o produto futuramente decidir torná-lo necessário.

Ao selecionar um lote na Agenda, o usuário pode:

- abrir o lote no Estúdio;
- começar ou continuar a gravação;
- reagendar a data.

No MVP, a Agenda é **100% interna à aplicação**. Não sincroniza Google Calendar, não cria lembretes externos e não agenda publicação em TikTok, Instagram ou qualquer outra plataforma.

A integração futura com calendários externos pode usar os lotes e suas datas como fonte, sem alterar o modelo mental do MVP.

### Configurações

Configurações concentra assuntos não pertencentes ao fluxo operacional diário:

- conta;
- plano atual e uso;
- assinatura/billing quando disponível;
- idioma;
- mercado;
- preferências de conteúdo e criação;
- aparência;
- integrações futuras.

Configurações não deve receber funcionalidades de Produto, Conteúdo, Estúdio ou Agenda apenas para evitar criar uma tela contextual adequada.

### Limites de overview e métricas

A Home e as demais telas operacionais não são dashboards analíticos. São proibidos no MVP:

- KPI cards, cards de métricas soltas, gráficos, scorecards e painéis de overview;
- contagens ou números sem vínculo direto com Produto, Content ou lote;
- composição que use números para preencher espaço ou simular progresso de negócio.

Números podem aparecer somente como atributo de um objeto real ou estado operacional, por exemplo `3 de 8 concluídos` em um lote, `18 conteúdos` dentro de um Produto ou `vídeo 4 de 8` no modo de gravação.

Barra e percentual de progresso são permitidos exclusivamente quando representam conclusão real de um lote ou outro objeto operacional, nunca performance comercial.

## 4. Tokens semânticos de cor

Não criar cores ad hoc para telas, categorias, ângulos, tipos de Content ou planos. Os IDs abaixo são canônicos e preservam os hexes oficiais, exceto pelo token específico de ação preenchida em Light.

### Tokens canônicos por tema

| ID canônico                |     Light |      Dark | Uso                                                         |
| -------------------------- | --------: | --------: | ----------------------------------------------------------- |
| `color.brand.accent`       | `#5B6CFF` | `#7885FF` | marca, acento secundário, seleção e estados não preenchidos |
| `color.action.filled`      | `#3D4CC6` | `#7885FF` | ações preenchidas com texto normal acessível                |
| `color.intelligence`       | `#8A63D2` | `#8A63D2` | inteligência explícita, geração e explicabilidade           |
| `color.canvas`             | `#F7F7F8` | `#0F1115` | fundo geral                                                 |
| `color.surface.default`    | `#FFFFFF` | `#161A20` | conteúdo principal sólido                                   |
| `color.surface.secondary`  | `#F1F2F4` | `#1D222A` | agrupamentos e campos neutros                               |
| `color.border.default`     | `#E4E6E8` | `#2A3039` | divisores e contornos                                       |
| `color.text.primary`       | `#17191C` | `#F4F6F8` | títulos, corpo e instruções                                 |
| `color.text.secondary`     | `#666B73` | `#A7ADB7` | contexto e metadados                                        |
| `color.text.muted`         | `#969CA5` | `#6F7782` | informação auxiliar não essencial                           |
| `color.content.on-surface` | `#17191C` | `#F4F6F8` | conteúdo normal sobre superfície                            |
| `color.content.on-action`  | `#FFFFFF` | `#0F1115` | texto normal sobre ação preenchida                          |
| `color.focus.ring`         | `#5B6CFF` | `#7885FF` | foco-visible e indicação de seleção                         |
| `color.feedback.success`   | `#2E9B66` | `#2E9B66` | confirmação e avanço concluído                              |
| `color.feedback.warning`   | `#C9892B` | `#C9892B` | atenção e ação pendente                                     |
| `color.feedback.danger`    | `#C94B50` | `#C94B50` | erro, destruição e falha recuperável                        |

`#3D4CC6` é a única adição cromática: uma variação mais escura do azul de marca, reservada a preenchimentos de ação no Light. Seu contraste é `6.89:1` com `#FFFFFF` e `6.36:1` com `#F4F6F8`, permitindo texto normal. Os demais hexes oficiais permanecem inalterados.

### Matriz normativa de combinações

Critério usado: texto normal exige contraste mínimo de `4.5:1`; texto grande e gráficos/contornos não textuais exigem `3:1`. Um par não listado como permitido é proibido por padrão. Os valores abaixo são contraste WCAG arredondado para duas casas.

| Tema  | Foreground                | Background              | Contraste | Texto normal | Grande/gráfico | Política                                  |
| ----- | ------------------------- | ----------------------- | --------: | -----------: | -------------: | ----------------------------------------- |
| Light | `color.text.primary`      | `color.surface.default` | `17.61:1` |          Sim |            Sim | corpo e títulos                           |
| Light | `color.text.secondary`    | `color.surface.default` |  `5.36:1` |          Sim |            Sim | contexto legível                          |
| Light | `color.text.muted`        | `color.surface.default` |  `2.76:1` |          Não |            Não | somente auxiliar não textual              |
| Light | `color.brand.accent`      | `color.surface.default` |  `4.17:1` |          Não |            Sim | borda, foco, ícone ou texto grande        |
| Light | `color.content.on-action` | `color.action.filled`   |  `6.89:1` |          Sim |            Sim | ação preenchida segura                    |
| Light | `color.intelligence`      | `color.surface.default` |  `4.38:1` |          Não |            Sim | ícone, borda ou texto grande              |
| Light | `color.feedback.success`  | `color.surface.default` |  `3.50:1` |          Não |            Sim | sempre acompanhado de texto               |
| Light | `color.feedback.warning`  | `color.surface.default` |  `2.96:1` |          Não |            Não | nunca como único sinal visual             |
| Light | `color.feedback.danger`   | `color.surface.default` |  `4.56:1` |          Sim |            Sim | mensagem pode usar o token                |
| Dark  | `color.text.primary`      | `color.canvas`          | `17.44:1` |          Sim |            Sim | corpo e títulos                           |
| Dark  | `color.text.secondary`    | `color.surface.default` |  `7.74:1` |          Sim |            Sim | contexto legível                          |
| Dark  | `color.text.muted`        | `color.surface.default` |  `3.86:1` |          Não |            Sim | auxiliar ou texto grande                  |
| Dark  | `color.brand.accent`      | `color.surface.default` |  `5.49:1` |          Sim |            Sim | acento textual em superfície              |
| Dark  | `color.content.on-action` | `color.action.filled`   |  `5.94:1` |          Sim |            Sim | ação preenchida segura                    |
| Dark  | `color.intelligence`      | `color.surface.default` |  `3.99:1` |          Não |            Sim | ícone, borda ou texto grande              |
| Dark  | `color.feedback.success`  | `color.surface.default` |  `4.99:1` |          Sim |            Sim | mensagem semântica                        |
| Dark  | `color.feedback.warning`  | `color.surface.default` |  `5.90:1` |          Sim |            Sim | mensagem semântica                        |
| Dark  | `color.feedback.danger`   | `color.surface.default` |  `3.83:1` |          Não |            Sim | texto explicativo em `color.text.primary` |

Regras de aplicação:

- ações preenchidas usam `color.action.filled` com `color.content.on-action`; nunca usar `color.text.primary` como exigência fixa sobre a ação;
- `color.brand.accent` permanece o azul de marca e acento secundário; no Light não é texto normal sobre Surface;
- `color.feedback.warning`, `color.feedback.success`, `color.intelligence` e qualquer par abaixo de `4.5:1` não podem ser texto normal isolado;
- cor sem texto, ícone, contorno estrutural ou estado não comunica nada sozinha;
- foco usa `color.focus.ring` com offset visível e deve ser validado contra a superfície real;
- gradientes são condicionais, não proibidos: permitidos quando comunicam algo real — foco, profundidade, marca ou estado — sempre derivados dos tokens semânticos existentes (interpolação entre cores de token, inclusive com transparência, sem cor nova ou intermediária arbitrária), com contraste validado contra a superfície real, em área contida (sem lavar a página inteira) e sem ruído; uso decorativo sem significado permanece proibido.

### Glass e superfícies

Glass não é um token de conteúdo. Quando necessário, usar a Surface do tema com transparência controlada, Border do tema e blur discreto somente em:

- sidebar/navegação;
- toolbar contextual;
- barras de ação flutuantes;
- sheets, popovers e menus que flutuam sobre conteúdo.

Não aplicar glass a Product, Content, estratégia, scripts, filas, tabelas ou texto principal.

## 5. Tipografia

### Escolhas

| Papel                         | Família             | Pesos normativos   | Fallback aprovado             | Rationale                                                                            |
| ----------------------------- | ------------------- | ------------------ | ----------------------------- | ------------------------------------------------------------------------------------ |
| Headings, body, UI e números  | **Instrument Sans** | 400, 500, 600, 700 | `Instrument Sans, sans-serif` | uma voz única mantém leitura, hierarquia e densidade coerentes em toda a experiência |
| Código e proveniência técnica | **Geist Mono**      | 400, 500           | `Geist Mono, monospace`       | separa identificadores técnicos sem criar uma segunda voz para a interface           |

Instrument Sans é a família principal para todos os elementos visuais de produto, incluindo números com `tabular-nums`. Geist Mono só aparece em código, IDs, hashes ou proveniência técnica explicitamente exposta.

### Fallback

Usar exatamente as stacks aprovadas acima quando a família principal ou um peso não estiver disponível. Não escolher outra família por tela e não sintetizar pesos. Os únicos pesos normativos são `400`, `500`, `600` e `700`.

### Escala tipográfica

A escala usa passos compactos para não transformar um aplicativo operacional em landing page. Valores são referência de design; line-height inclui espaço para leitura e toque.

| Token              | Tamanho / line-height | Peso | Uso                                                     |
| ------------------ | --------------------: | ---: | ------------------------------------------------------- |
| `type.display`     |         `32px / 36px` |  700 | título principal de contexto, usado com parcimônia      |
| `type.heading-1`   |         `24px / 30px` |  600 | título de página ou objeto                              |
| `type.heading-2`   |         `20px / 26px` |  600 | seção e agrupamento real                                |
| `type.title`       |         `17px / 22px` |  600 | título de Product, Content ou item de fila              |
| `type.body`        |         `15px / 22px` |  400 | leitura principal                                       |
| `type.body-medium` |         `15px / 22px` |  500 | ênfase em instruções e valores                          |
| `type.body-small`  |         `13px / 18px` |  400 | metadados e descrições secundárias                      |
| `type.label`       |         `12px / 16px` |  600 | labels, status e controles; sem excesso de caixa alta   |
| `type.numeric`     |         `24px / 28px` |  600 | contagem ligada a objeto real, nunca métrica decorativa |
| `type.code`        |         `12px / 18px` |  400 | identificadores e proveniência técnica em Geist Mono    |

Regras de composição:

- títulos usam sentence case e linguagem do produto;
- não usar peso, caixa alta e cor ao mesmo tempo para criar hierarquia;
- no mobile, reduzir display para `24px / 30px` quando o título competir com a ação;
- corpo não deve ficar abaixo de `15px` em contexto de execução;
- números usam `tabular-nums` apenas quando existe comparação real;
- truncamento preserva o início do hook/título e sempre oferece forma acessível de ler o conteúdo completo.

## 6. Espaçamento, grid e layout

### Espaçamento

**Unidade base:** `4px`.  
**Densidade:** confortável, com compressão controlada em filas e tabelas desktop.

| Token            |  Valor | Uso típico                              |
| ---------------- | -----: | --------------------------------------- |
| `space.0`        |  `0px` | ausência intencional                    |
| `space.hairline` |  `1px` | borda/divisor                           |
| `space.2xs`      |  `2px` | relação de ícone com texto muito curto  |
| `space.xs`       |  `4px` | label e valor próximo                   |
| `space.sm`       |  `8px` | gap interno compacto                    |
| `space.sm-plus`  | `12px` | controles e metadados                   |
| `space.md`       | `16px` | padding padrão e distância entre campos |
| `space.md-plus`  | `20px` | separação de blocos relacionados        |
| `space.lg`       | `24px` | seção e card                            |
| `space.xl`       | `32px` | distância entre grupos                  |
| `space.2xl`      | `40px` | respiro de contexto                     |
| `space.3xl`      | `48px` | abertura de seção                       |
| `space.4xl`      | `64px` | início/fim de região ampla              |
| `space.5xl`      | `80px` | somente composição excepcional          |

Não usar espaçamento para criar caixas decorativas. Primeiro definir a relação semântica, depois o gap menor que preserve leitura.

### Grid

| Breakpoint          | Colunas | Gutter |                         Padding lateral |
| ------------------- | ------: | -----: | --------------------------------------: |
| Mobile `<768px`     |       4 | `16px` |                                  `16px` |
| Tablet `768–1199px` |       8 | `24px` |                                  `24px` |
| Desktop `≥1200px`   |      12 | `24px` |                                  `32px` |
| Wide `≥1440px`      |      12 | `24px` | conteúdo limitado pela coluna principal |

O max-width de `1440px` pertence apenas à coluna de conteúdo descrita no shell desktop. Sidebar, região principal, toolbar e fundo não são limitados por esse valor. `space.hairline` e `space.2xs` são exceções restritas a borda e micro-relação; o ritmo estrutural continua baseado em 4px.

### Raios

Raios são hierárquicos, não universais:

| Token            |    Valor | Uso                                                       |
| ---------------- | -------: | --------------------------------------------------------- |
| `radius.none`    |    `0px` | divisores, regiões sem contêiner                          |
| `radius.xs`      |    `4px` | pequenos indicadores e campos muito compactos             |
| `radius.control` |    `8px` | inputs, botões, selects e menus                           |
| `radius.card`    |   `12px` | Product, Content e lote de produção                       |
| `radius.sheet`   |   `16px` | sheet, modal e superfície flutuante grande                |
| `radius.pill`    | `9999px` | status/tags neutros e somente quando o conteúdo for curto |

Não arredondar todas as superfícies. Cards sem objeto real não existem; logo, não recebem `radius.card`.

### Bordas e elevação

- estado repouso: Border sutil ou nenhuma borda quando a separação já for clara;
- cards de objetos: Surface sólida + Border; sombra não é requisito;
- superfícies flutuantes: uma camada de elevação discreta, sempre sobre Surface do tema;
- foco: contorno `color.focus.ring` com offset visível;
- não usar sombra para simular hierarquia em cada bloco.

## 7. Motion

**Abordagem:** minimal-functional. Movimento explica causa e efeito; não entretém.

| Token           | Duração | Uso                                             |
| --------------- | ------: | ----------------------------------------------- |
| `motion.micro`  |  `80ms` | foco, cor de controle e feedback imediato       |
| `motion.short`  | `160ms` | seleção, hover, expansão pequena                |
| `motion.medium` | `240ms` | disclosure, troca de estado e reordenação local |
| `motion.long`   | `360ms` | sheet, modal e transição de região              |

- entrada: `ease-out`;
- saída: `ease-in`;
- deslocamento/reordenação: `ease-in-out`;
- side drawers, side sheets, bottom sheets e modais de sobreposição — incluindo o drawer de `Adicionar produto` — usam `motion.medium` (240ms) na abertura e no fechamento, com `ease-out` na entrada e `ease-in` na saída; é o padrão de plataforma para overlays, mais rápido que `motion.long`, e bottom sheets mantêm movimento vertical;
- interações e skeletons reutilizam estes tokens e curvas, sem criar tokens de motion, exceto ciclos contínuos de indicadores reais já permitidos. Devem preservar acessibilidade e, com `prefers-reduced-motion`, mudar de estado sem deslocamento;
- movimento existe quando explica algo — estado, causa e efeito, entrada, feedback ou delight intencional — sempre curto (tokens de duração; indicadores contínuos de atividade real podem ter ciclo próprio), performático (transform/opacity) e desligável com `prefers-reduced-motion`;
- continuam proibidos: progresso ou ETA falsos, loops decorativos sem informação, bounce, spring chamativo, parallax, auto-scroll decorativo e contagem animada;
- geração assíncrona pode indicar atividade, mas nunca deve inventar percentual de progresso;
- progresso de lote pode animar discretamente quando um Conteúdo é concluído, porque representa um valor real;
- concluir um Conteúdo deve dar feedback imediato e manter o próximo passo visível;
- erro não treme o campo; a mensagem e o foco resolvem a orientação;
- com `prefers-reduced-motion`, remover deslocamento e reduzir transições a mudança de estado instantânea ou microfeedback essencial.

### Máquina de estados do modo de gravação

A máquina abaixo descreve estados visíveis de um Conteúdo dentro de um lote do Estúdio. O autoavanço é **desligado por padrão**.

| Estado de interface            | Entrada                            | Ações permitidas                                 | Saída e foco                                                                              |
| ------------------------------ | ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `ready` / Aguardando conclusão | abrir Conteúdo ainda não concluído | `Concluir conteúdo`, `Próximo`, `Anterior`       | `Concluir conteúdo` inicia `marking`; `Próximo` não conclui implicitamente                |
| `next-confirmation`            | tocar `Próximo` antes de concluir  | `Continuar sem concluir`, `Ficar neste conteúdo` | continuar mantém o item pendente e move para o próximo; ficar retorna foco ao CTA         |
| `marking`                      | tocar `Concluir conteúdo`          | nenhuma ação duplicada                           | botão fica loading e bloqueado; não há duplo toque                                        |
| `completed` / Concluído        | confirmação da conclusão           | `Próximo`, `Anterior`, editar quando permitido   | mantém o Conteúdo visível, atualiza o lote e move foco para `Próximo`; não avança sozinho |
| `mark-error`                   | falha ao concluir                  | `Tentar novamente`, `Ficar neste conteúdo`       | preserva hook, roteiro/cenas e CTA; foco vai para o erro inline e depois para Retry       |
| `already-completed`            | abrir Conteúdo já concluído        | `Próximo`, `Anterior`, editar quando permitido   | não oferece segunda conclusão; foco começa no estado e segue para `Próximo`               |

Regras de transição:

- `Próximo` permanece visível e nunca conclui, cancela ou regenera implicitamente;
- `Tentar novamente` repete a ação após falha e mantém o Conteúdo visível;
- ao sucesso, atualizar imediatamente `concluídos / total` e o progresso do lote;
- o lote passa para `Gravando` quando o primeiro Conteúdo é concluído e para `Concluído` quando todos forem concluídos;
- ao erro, manter o item e os dados editados, não limpar o formulário e não perder o contexto;
- se o Conteúdo já estiver concluído, a interface não permite repetir a transição;
- `prefers-reduced-motion` remove qualquer deslocamento; foco e texto continuam obrigatórios.

## 8. Contratos de componentes

A lista abaixo define linguagem e comportamento, não implementação. Componentes devem servir o core loop Produto → Estratégia → Plano → Conteúdos → Lote → Estúdio → Conclusão.

### App shell

- mantém navegação principal persistente conforme a superfície;
- fornece título de contexto e uma ação primária clara;
- nunca esconde erro, estado de geração ou bloqueio de uso em uma área apenas visual;
- desktop usa sidebar fixa e toolbar contextual; mobile usa header contextual e a Sidebar shadcn/ui em modo drawer.

### Navegação principal

- cinco destinos: Home, Produtos, Estúdio, Agenda e Configurações;
- item ativo usa `color.brand.accent`/`color.focus.ring` e indicador estrutural adicional, como peso, fundo Surface Secondary ou linha;
- ícone de traço simples, 16–20px; o label pode ficar visualmente oculto no tablet, mas o nome acessível permanece sempre presente;
- não usar bolhas coloridas, ícones decorativos em círculos ou badges para criar urgência falsa;
- área tocável mínima: `44×44px`.

### Toolbar contextual

- pode usar glass porque é uma camada de navegação/controle;
- contém busca, filtros, ordenação, seleção e ações do contexto atual;
- prioriza uma ação primária, agrupa o restante em progressive disclosure;
- no mobile, transforma filtros em sheet e mantém o contexto visível.

### Indicador global de atividade

O `Global Activity Indicator` pertence ao App Shell e representa `CommerceIntelligenceJob` ativo, concluído com ação pendente ou falha recuperável.

Posicionamento:

- desktop: linha compacta imediatamente abaixo da toolbar contextual;
- tablet: mesma região, com texto resumido quando necessário;
- mobile: imediatamente abaixo do header contextual, sem interferir na navegação (drawer);

Conteúdo mínimo:

- Produto processado;
- etapa real atual em linguagem humana;
- estado de sucesso ou falha;
- ação `Revisar conteúdos` quando o resultado estiver pronto fora do contexto original;
- ação `Tentar novamente` quando a falha for recuperável.

Regras:

- `queued` e `running` mostram atividade sem percentual inventado;
- `succeeded` pode permanecer temporariamente acionável até o usuário abrir o resultado;
- `failed` preserva contexto e mostra recuperação;
- nunca mostrar ETA falso, logs, tokens, prompt, provider, modelo, `LOW/MID/HIGH` ou detalhes internos da engine;
- tocar no indicador no mobile pode abrir uma sheet de contexto, sem criar uma página permanente de Análise;
- o indicador não bloqueia o restante da aplicação;
- enquanto existir um único job ativo permitido pelo MVP, `Analisar produto` permanece visível porém desabilitado com explicação do motivo.

### Action button

- rótulo é verbo + resultado: `Analisar produto`, `Começar gravação`, `Continuar gravação`, `Concluir conteúdo`, `Reagendar`;
- um único primary action por região; ações secundárias são neutras ou textuais; ações preenchidas usam `color.action.filled`;
- não usar gradiente;
- estados: default, hover, pressed, focus-visible, disabled, loading, success e error;
- loading preserva o rótulo e informa atividade sem trocar a ação por um spinner solto;
- destructive exige confirmação e usa `color.feedback.danger` apenas como semântica, nunca como decoração.

### Product card

Card permitido porque representa o objeto Product. Exibe apenas o necessário para agir:

- imagem quando disponível;
- nome do Produto;
- contexto curto ou categoria neutra;
- estado real do fluxo, como `Ativo`, `Pendente` ou `Arquivado` quando essa informação for necessária;
- quantidade de Conteúdos somente quando ajudar na decisão;
- ação primária contextual, como `Abrir produto` ou `Continuar`;
- metadados secundários sob demanda.

Não transformar Product card em painel de analytics, não adicionar mini-gráficos e não pintar cada categoria.

### Página de Produto

A página do Produto usa tabs ou navegação interna para:

- `Visão geral`;
- `Estratégia`;
- `Conteúdos`;
- `Histórico`.

A página não se chama `Briefing`. `Briefing do Conteúdo` pertence a um Conteúdo individual.

Conteúdos aprovados podem ser selecionados para formar um lote de gravação. Ao preparar o lote, o usuário define a data pretendida de gravação antes de enviá-lo ao Estúdio/Agenda.

### Content card

Card permitido porque representa o objeto Content. Ordem recomendada:

1. posição ou identificação;
2. hook, como conteúdo dominante;
3. ângulo e status neutros;
4. próxima ação;
5. estratégia, cenas, CTA e proveniência em disclosure.

No mobile, mostrar hook, roteiro/cenas, CTA e ação de avanço. Desktop pode revelar dimensões de variedade e explicabilidade. Seleção múltipla só pode alimentar ações operacionais previstas, como aprovação e montagem de lote; edição em massa não faz parte do MVP.

### Lote do Estúdio

Lote é um objeto operacional real e pode usar card. Deve mostrar somente:

- Produto;
- data planejada;
- status derivado `Aguardando`, `Gravando` ou `Concluído`;
- total de Conteúdos;
- total concluído;
- progresso textual e, quando útil, barra/percentual operacional;
- ação `Começar gravação`, `Continuar gravação` ou `Abrir lote`.

O status nunca é editado manualmente por select/dropdown.

### Linha de Conteúdo no lote

A lista de um lote deve permitir identificar e concluir rapidamente cada Conteúdo:

- checkbox/controle de conclusão com alvo de toque adequado;
- posição no lote;
- início do hook ou título interno;
- estado concluído/não concluído;
- ação de abrir o briefing ou modo de gravação quando necessário.

Concluir/desconcluir deve obedecer às regras de integridade do domínio. Se a reversão de conclusão não for suportada pelo MVP, não mostrar checkbox que sugira toggle irrestrito; usar controle de conclusão de uma via com ação explícita de correção.

### Calendário da Agenda

O calendário representa lotes reais e suporta três escalas:

- Dia;
- Semana;
- Mês.

Um evento de Agenda mostra Produto e quantidade de Conteúdos. Quando o lote já começou, pode mostrar progresso compacto. Não usar cores próprias por Produto ou categoria; seleção e foco usam tokens semânticos existentes.

Ao abrir um evento, oferecer `Abrir no Estúdio` e `Reagendar`. A Agenda do MVP não contém controles de publicação, social scheduling ou sincronização externa.

### Tabs e segmented control

- tabs representam regiões do mesmo objeto, como `Visão geral`, `Estratégia`, `Conteúdos` e `Histórico`;
- segmented control representa escolha curta e mutuamente exclusiva, como `Dia`, `Semana`, `Mês`;
- estado ativo tem indicador estrutural e `color.brand.accent`; não depender apenas de cor;
- no mobile, tabs podem rolar horizontalmente, mas não devem virar carrossel sem indicação de continuidade.

### Disclosure

- título curto e informativo;
- resumo mostra o valor da seção antes da abertura;
- abertura revela estratégia profunda, explicabilidade, cenas ou proveniência;
- o estado aberto/fechado permanece ao navegar, editar e retornar dentro do mesmo objeto e fluxo;
- trocar de objeto, concluir o fluxo, iniciar nova sessão, sair da conta ou executar ação destrutiva reseta o estado, salvo confirmação explícita do usuário;
- nunca esconder próxima ação, erro ou estado de geração atrás de disclosure.

### Campo de formulário

- label persistente acima do campo; placeholder não substitui label;
- descrição curta só quando muda a decisão;
- erro aparece junto do campo, explica como corrigir e mantém o valor digitado;
- foco visível em teclado e toque;
- área tocável mínima de `44px`;
- entrada de Product começa por URL com a ação primária `Analisar produto`;
- `Analisar produto` mostra loading, preview, origem, lacunas e falha recuperável; extração nunca aparece como fato confirmado automaticamente;
- `Adicionar manualmente` permanece visível como fallback quando não houver URL, a análise falhar ou o creator preferir informar os fatos;
- a confirmação humana cria o Product ativo; antes dela, o preview pode ser corrigido campo a campo;
- a confirmação resolve também a quantidade inicial de Conteúdos (`targetContentCount`) por preferência do creator, valor padrão ou seletor compacto na própria confirmação — sem criar etapa de navegação;
- depois de confirmado, edição de fatos é uma ação excepcional e explícita, sem formulário de público, Strategy ou contexto estratégico no cadastro;
- labels, erros, foco, `aria-busy`, teclado, alvos de `44×44px` e estados de confirmação seguem as regras deste documento.

### Busca e filtros

- Vitrine deve permitir busca e filtros por `Ativos`, `Pendentes` e `Arquivados`;
- Conteúdos dentro de Produto podem usar filtros por status, ângulo e data quando isso ajudar revisão e seleção;
- Estúdio pode filtrar por Produto, status do lote e data;
- Agenda já representa a dimensão temporal e não deve duplicar uma barra pesada de filtros sem necessidade;
- filtros são neutros por padrão; seleção usa `color.brand.accent`;
- filtros ativos são resumidos de forma removível, sem cores arbitrárias;
- mobile usa sheet e aplicação explícita quando houver mais de poucos filtros.

### Status, alertas e feedback

- `color.feedback.success` confirma algo concluído;
- `color.feedback.warning` pede atenção antes de continuar;
- `color.feedback.danger` explica falha, destruição ou recuperação;
- `color.intelligence` indica inteligência/generation somente;
- inline alert é preferível a toast quando a pessoa precisa agir;
- toast serve apenas para confirmação breve não bloqueante e nunca é a única forma de comunicar erro;
- ícone, texto e ordem da mensagem acompanham a cor.

### Empty, loading e error

- **Empty Home:** prioriza `Adicionar produto` quando o usuário ainda não possui trabalho ativo;
- **Empty Vitrine:** explica que ainda não há Produto e oferece URL + `Analisar produto`;
- **Empty Estúdio:** informa que não existem lotes de gravação e aponta para os Conteúdos aprovados dentro da Vitrine;
- **Empty Agenda:** informa que ainda não existem gravações planejadas; não cria bloco `Ainda sem data`;
- **Loading:** preserva estrutura esperada e informa o estado; não simular conteúdo estratégico ainda inexistente;
- **Access/limit:** explica por que a ação não está disponível e aponta o próximo caminho possível, sem ocultar o conteúdo já existente.

### Estados de geração assíncrona

Esta matriz descreve somente a experiência visível de geração.

| Estado      | Representação                                   | Ações do usuário                               | Feedback                                                         |
| ----------- | ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| `queued`    | Na fila, com contexto do pedido                 | `Cancelar`, consultar status                   | confirmação de que o pedido foi recebido; nenhum Content parcial |
| `running`   | Gerando, com atividade sem percentual inventado | consultar status; `Cancelar` quando disponível | atividade visível; nenhum Content parcial                        |
| `succeeded` | Concluído                                       | consultar resultado, editar, iniciar novo lote | resultado completo disponível                                    |
| `failed`    | Falhou                                          | `Tentar novamente`, consultar detalhes         | erro compreensível e recuperação clara                           |
| `cancelled` | Cancelado                                       | consultar histórico, `Gerar novamente`         | cancelamento confirmado; nenhum resultado parcial                |

`Retry` é uma ação de recuperação disponível após `failed` ou `cancelled`; a interface volta a exibir `queued` enquanto aguarda o resultado. `Cancel` é uma ação explícita em `queued` e, quando disponível, em `running`; a confirmação evita cancelamento acidental.

Enquanto uma geração estiver ativa, o controle de iniciar outra fica desabilitado para evitar duplo toque. Falhas, cancelamentos e retries nunca apresentam conteúdo parcial como sucesso.

### Modal, sheet e menu

- sheet é preferido no mobile para filtros e decisões contextuais;
- modal é reservado a confirmação, edição focada ou informação que exige atenção;
- superfície flutuante pode usar glass; conteúdo interno continua sólido e legível;
- foco deve entrar, permanecer e retornar ao gatilho;
- Escape fecha sheet/menu não destrutivo e retorna foco ao gatilho; em confirmação destrutiva, Escape cancela a confirmação e mantém o objeto intacto, sem executar a ação.

## 9. Progressive disclosure aplicado ao produto

O design deve revelar em camadas:

1. **Ação imediata:** o que fazer agora e em qual objeto;
2. **Contexto operacional:** status, hook, quantidade, próximo passo e restrição relevante;
3. **Estratégia útil:** ângulo, dor, benefício, objeção, público e CTA quando ajudam a gravar;
4. **Profundidade:** explicabilidade, cobertura de variedade, proveniência e histórico.

A camada 4 é importante para confiança e memória, mas não deve competir com a execução. O conteúdo gerado continua editável; a interface não deve parecer uma caixa-preta nem expor toda a engine de uma vez.

## 10. Acessibilidade e estados

### Requisitos

- contraste deve ser validado pela matriz normativa de tokens para cada combinação de texto, fundo, borda e foco;
- não usar `color.text.muted` para instrução, erro, ação ou informação única;
- `color.focus.ring` deve ser perceptível com contorno e offset, não apenas mudança de cor;
- todos os controles devem funcionar por teclado e ter ordem de foco coerente;
- alvos de toque têm pelo menos `44×44px`;
- headings seguem hierarquia; labels e mensagens de erro são associados ao controle;
- estados de seleção, ativo, carregando, sucesso, aviso e erro têm texto, ícone ou estrutura além da cor;
- conteúdo truncado tem acesso ao valor completo;
- animações respeitam redução de movimento;
- não usar placeholder como único rótulo;
- navegação mobile e ações de produção devem ser confortáveis com uma mão.

### Estados mínimos por controle

Todo controle interativo define, no mínimo: default, hover quando aplicável, pressed, focus-visible, disabled, loading quando aplicável, erro quando aplicável e sucesso quando houver confirmação.

Estado desabilitado reduz ação sem apagar a razão. Estado de erro não limpa entrada. Estado de loading não permite duplicar geração ou marcar duas vezes. Estado de sucesso não interrompe o fluxo seguinte.

## 11. Conteúdo e nomenclatura visual

- idioma do MVP: `pt-BR`;
- usar verbos curtos, concretos e orientados a resultado;
- `Home`, `Vitrine`, `Estúdio`, `Agenda` e `Configurações` são os nomes oficiais da navegação principal;
- `Vitrine` é rótulo de UI para a navegação e listagem; `Product` permanece linguagem de domínio, com rotas e contratos em `/products`.
- `Content` é o conceito de domínio; a interface usa `conteúdo` para leitura humana;
- `Briefing do Conteúdo` significa o briefing de um Conteúdo individual, não a página inteira do Produto;
- estados visíveis de lote no Estúdio são `Aguardando`, `Gravando` e `Concluído`;
- `Concluído` em lote significa que todos os Conteúdos daquele lote foram concluídos;
- `Vault` pode permanecer como conceito técnico/memória de domínio, mas não é nomenclatura de navegação do MVP;
- explicar estratégia em uma frase quando necessário, por exemplo: “Este vídeo trabalha a objeção de que o produto é fraco.”;
- evitar “gerar mais conteúdo” como ação genérica quando o resultado puder ser nomeado: `Gerar novo lote`, `Gerar novo hook`, `Trocar CTA`;
- usar `Começar gravação`, `Continuar gravação`, `Concluir conteúdo` e `Reagendar` em vez de ações genéricas como `Abrir` quando a intenção for conhecida.

## 12. Fora do sistema visual do MVP

Este documento não autoriza nem antecipa:

- telas implementadas, componentes de código ou dependências;
- geração automática de vídeo, imagem, voice-over ou publicação;
- analytics avançado, ROAS, CTR ou gráficos de performance externa;
- KPI cards, gráficos, scorecards, porcentagens decorativas ou overview analítico no MVP;
- agendamento ou publicação automática em TikTok, Instagram ou outras plataformas;
- sincronização com Google Calendar, Apple Calendar, Outlook ou lembretes externos no MVP;
- conexão obrigatória com TikTok/TikTok Shop além do fluxo de importação de Produto definido em sua frente específica;
- banco vetorial, embeddings ou deduplicação semântica;
- colaboração, RBAC, múltiplos membros ou billing por equipe;
- edição em massa de campos ou bulk edit; seleção múltipla só existe para ações operacionais previstas;
- cores próprias para categorias, ângulos, Produtos, planos ou tipos de conteúdo;
- framework de temas diferente dos tokens semânticos definidos aqui.

A **Agenda interna de gravação** faz parte do MVP e não deve ser confundida com agendamento de publicação ou integração externa de calendário.

## 13. Checklist de coerência antes de implementar

- [ ] A tela responde visualmente “o que faço agora?”
- [ ] Existe uma ação primária clara e nomeada com verbo.
- [ ] A navegação principal usa somente Home, Vitrine, Estúdio, Agenda e Configurações.
- [ ] Home prioriza ação, gravações de hoje, novo Produto e próximas gravações sem virar dashboard.
- [ ] Home não possui bloco `Ainda sem data`.
- [ ] Vitrine usa cards de objetos reais e permite distinguir Ativos, Pendentes e Arquivados.
- [ ] A página de Produto separa Visão geral, Estratégia, Conteúdos e Histórico.
- [ ] `Briefing do Conteúdo` é usado somente para Conteúdo individual.
- [ ] Estúdio trabalha com lote e deriva automaticamente Aguardando, Gravando e Concluído.
- [ ] O progresso do lote vem da quantidade real de Conteúdos concluídos.
- [ ] Agenda possui visão de Dia, Semana e Mês e agenda gravação interna, não publicação.
- [ ] Mobile oferece a experiência completa: adicionar Produto, revisar Conteúdos, operar Estúdio e consultar Agenda.
- [ ] Desktop amplia planejamento e organização sem criar capacidades exclusivas.
- [ ] Todo card representa um objeto real.
- [ ] Conteúdo principal é sólido; glass só aparece em camada periférica.
- [ ] Tokens canônicos, matriz de contraste e semânticas estão sendo usados no papel correto.
- [ ] Light é a referência; Dark reutiliza os mesmos tokens semânticos.
- [ ] Estados de foco, erro, loading, empty, geração e reduced motion foram definidos.
- [ ] CommerceIntelligenceJob ativo/concluído/falho possui Global Activity Indicator coerente no App Shell.
- [ ] Nenhuma métrica ou decoração foi adicionada sem melhorar uma decisão operacional.

## 14. Registro de decisões

| Data       | Decisão                                                                                                 | Rationale                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-24 | Light mode é o tema de referência e padrão                                                              | A interface precisa ser legível e familiar como ferramenta de produtividade; Dark é uma variação dos mesmos tokens, não um redesign.                                                                          |
| 2026-08-24 | Mobile é a superfície principal completa, com execução prioritária                                      | O creator precisa adicionar Produto, revisar/editar Content, montar lote e gravar sem depender do desktop.                                                                                                    |
| 2026-08-24 | Desktop é experiência expandida para planejamento em escala                                             | Mais espaço suporta organização, comparação e operações densas, mas não cria capacidades exclusivas.                                                                                                          |
| 2026-08-24 | Instrument Sans é a família principal; Geist Mono é técnico                                             | Uma família única mantém coerência entre headings, body, UI e números; a mono fica restrita à proveniência técnica.                                                                                           |
| 2026-08-24 | `#5B6CFF` é brand/accent e `#3D4CC6` é ação preenchida Light                                            | O azul original permanece na identidade; a variação mais escura garante texto normal acessível em ações preenchidas.                                                                                          |
| 2026-08-24 | Grid de 4px, layout híbrido e raios hierárquicos                                                        | Mantém disciplina e densidade confortável sem arredondar ou decorar tudo.                                                                                                                                     |
| 2026-08-24 | Cards restritos a objetos reais e glass restrito à periferia                                            | Protege a diferença entre interface operacional e dashboard SaaS decorativo.                                                                                                                                  |
| 2026-08-24 | Motion minimal-functional                                                                               | Movimento deve explicar seleção, disclosure, fila e feedback, respeitando redução de movimento.                                                                                                               |
| 2026-08-26 | Home volta a ser a entrada principal                                                                    | O creator entende `Home` imediatamente; a tela permanece operacional e minimalista, sem virar dashboard analítico.                                                                                            |
| 2026-08-26 | Navegação principal passa a ser Home, Produtos, Estúdio, Agenda e Configurações                         | Os destinos passam a representar tarefas naturais do creator em vez de conceitos internos de domínio.                                                                                                         |
| 2026-09-21 | `Produtos` passa a se chamar `Vitrine` na navegação e listagem                                           | Decisão explícita de UI-only: preserva ordem dos destinos, `Product` como domínio e as rotas/contratos em `/products`; não requer ADR arquitetural.                                                           |
| 2026-08-26 | Conteúdos e Vault deixam de ser destinos globais                                                        | Conteúdos pertencem ao Produto e aos lotes; histórico/memória aparece no contexto do Produto, reduzindo duplicação de navegação.                                                                              |
| 2026-08-26 | Produção passa a ser apresentada como Estúdio                                                           | `Estúdio` comunica execução e gravação de forma mais natural para creators sem alterar o domínio interno de produção.                                                                                         |
| 2026-08-26 | Estúdio usa lotes com estados Aguardando, Gravando e Concluído                                          | O status é consequência do número real de Conteúdos concluídos e não exige gerenciamento manual.                                                                                                              |
| 2026-08-26 | Progresso percentual de lote é permitido                                                                | Percentual representa conclusão operacional real do lote, não analytics ou performance comercial.                                                                                                             |
| 2026-08-26 | Agenda interna de gravação entra no MVP                                                                 | O creator escolhe quando pretende gravar um lote; isso fecha o intervalo entre aprovação e execução sem introduzir social scheduling.                                                                         |
| 2026-08-26 | Integrações de calendário permanecem futuras                                                            | Google Calendar e outros calendários poderão receber eventos/lembretes depois, mas não fazem parte do MVP.                                                                                                    |
| 2026-08-26 | Home não mostra `Ainda sem data`                                                                        | A entrada deve mostrar somente ação útil, gravações de hoje e próximas gravações já planejadas.                                                                                                               |
| 2026-08-26 | Job assíncrono usa indicador global no App Shell                                                        | A análise continua durante a navegação; o usuário precisa ver Produto, etapa, sucesso/falha e próxima ação sem entrar numa página técnica de análise.                                                         |
| 2026-08-26 | `Pendente` é readiness operacional, não lifecycle do Produto                                            | Evita misturar análise em andamento com estados persistentes como Ativo/Arquivado.                                                                                                                            |
| 2026-08-27 | Realinhamento aos PRDs vigentes (engine, job assíncrono, briefing/lotes, model router)                  | O design v1.3 já refletia o core loop e o indicador global; a revisão atualizou as fontes canônicas, incluiu a resolução da quantidade inicial na confirmação e manteu tokens, estética e navegação vigentes. |
| 2026-08-28 | Navegação mobile substitui a bottom nav pela Sidebar shadcn/ui (drawer off-canvas)                      | Com cinco destinos, a barra inferior empilha botões e prejudica a navegação; a Sidebar uniformiza o shell nas três superfícies e aproveita componente de biblioteca em vez de navegação custom.               |
| 2026-08-28 | Componentes de UI nascem de shadcn/ui: buscar componente pronto e adaptá-lo antes de criar algo próprio | Reuso de biblioteca reduz código custom, mantém acessibilidade e consistência; componente custom é exceção com motivo registrado.                                                                             |
| 2026-09-19 | Adoção do Método 3S (Simples, Sexy, Surpreendente) e regras condicionais para gradientes e movimento | Expressividade com intenção substitui proibições absolutas: gradiente e movimento valem quando comunicam algo real — foco, profundidade, marca ou estado — sempre derivados de tokens, com acessibilidade e reduced-motion; dados falsos (progresso/ETA) continuam proibidos. |
| 2026-09-21 | Drawers, sheets e modais de sobreposição usam `motion.medium` (240ms) na abertura/fechamento — padrão de plataforma | `motion.long` (360ms) estava lento na prática na abertura do drawer de `Adicionar produto`; 240ms mantém suavidade com resposta mais rápida e passa a valer para todas as sobreposições da plataforma. |
