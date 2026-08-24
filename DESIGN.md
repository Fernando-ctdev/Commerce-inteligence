# Design System — Commerce Intelligence

**Status:** fonte de verdade visual do produto  
**Versão:** 1.2
**Locale do MVP:** `pt-BR`  
**Escopo:** decisões de produto visual, tokens, comportamento responsivo, estados e contratos de componentes. Este documento **não implementa telas, componentes ou dependências**.

> **Memória desejada:** ao abrir a plataforma, o creator entende imediatamente o que precisa produzir agora.

## 1. Contexto do produto

### O que é

Plataforma de inteligência comercial para creators e afiliados de TikTok Shop. Um Produto passa por estratégia, plano, Conteúdo e Produção até virar uma fila de gravação executável.

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
6. **Hoje é operacional.** A pergunta principal é “o que preciso produzir agora?”.
7. **Produção contínua.** O fluxo de gravação deve favorecer `gravar → marcar → próximo`.
8. **Cards representam objetos reais.** Product, Content e, quando existir, lote de produção podem usar card. Métrica solta, agrupamento decorativo ou seção genérica não usa card.
9. **Glass é periférico.** Transparência e blur só em navegação, toolbars e elementos flutuantes. O conteúdo permanece sólido.
10. **Cor tem semântica.** `color.action.filled` sinaliza ações preenchidas; `color.brand.accent` sinaliza marca, seleção e acentos secundários. `color.intelligence` sinaliza inteligência ou geração. Tags, ângulos e categorias são neutros.
11. **Light é o padrão.** Dark usa os mesmos nomes de tokens semânticos e muda somente seus valores de tema definidos aqui.
12. **Acessibilidade é parte do visual.** Foco, erro, contraste, teclado, toque e redução de movimento não são estados posteriores.

### Riscos deliberados e por que valem a pena

- **Mobile como experiência completa:** cadastrar Produto, gerar estratégia, revisar/editar Content, montar lote e gravar acontecem na superfície principal. A execução recebe prioridade visual, mas nenhuma capacidade é artificialmente retirada do mobile.
- **Desktop como expansão, não exclusividade:** planejamento em escala, organização, filtros, comparação e operações densas ganham espaço no desktop sem monopolizar capacidades do produto. O custo é manter dois arranjos responsivos coerentes.
- **Taxonomia visual neutra:** ângulos, tags e categorias não recebem uma cor própria. Isso protege a leitura e evita que o sistema pareça uma coleção de chips; o custo é menos diferenciação cromática imediata.

## 3. Modelo de navegação e responsividade

### Navegação principal

A ordem e a nomenclatura são fixas:

1. **Hoje** — fila operacional e próxima ação;
2. **Produtos** — objetos vendidos e seus contextos;
3. **Conteúdos** — biblioteca de ideias e conteúdos estruturados;
4. **Produção** — fila, lotes e execução;
5. **Vault** — memória intelectual e operacional.

Configurações, conta e limites ficam na navegação secundária. Não criar um item `Home` paralelo a `Hoje`.

### Shell por superfície

| Superfície | Regra de layout | Prioridade de uso |
|---|---|---|
| Mobile, até `767px` | uma coluna; header contextual; navegação principal inferior fixa | experiência completa, com execução prioritária |
| Tablet, `768–1199px` | rail lateral compacta de `72px` + região principal | experiência completa, revisão e organização com mais contexto |
| Desktop, a partir de `1200px` | sidebar fixa de `240px` + região principal com toolbar | experiência expandida, planejamento em escala e operações densas |
| Wide, a partir de `1440px` | mesmo shell; somente a coluna de conteúdo é limitada | mais densidade e comparação, sem capacidade exclusiva |

**Resumo:** Mobile = experiência completa + execução prioritária; Desktop = experiência expandida + planejamento em escala.

A mudança de breakpoint altera composição, densidade e prioridade, não o modelo mental nem o conjunto de capacidades. Desktop amplia planejamento, organização e operações de alta densidade; não monopoliza nenhuma capacidade do produto.

### Contrato do shell desktop

- o shell externo usa duas regiões: `240px` para a sidebar e `minmax(0, 1fr)` para a região principal;
- a sidebar ocupa somente a primeira região, permanece fixa durante a rolagem e não participa do cálculo de `max-width` do conteúdo;
- a região principal tem `min-width: 0`, ocupa todo o espaço restante e contém a toolbar contextual;
- a toolbar tem `56px` de altura de referência e percorre a largura disponível da região principal;
- dentro da região principal, a coluna de conteúdo usa `width: min(100%, 1440px)`, fica centralizada quando houver espaço e recebe padding lateral de `32px` no desktop;
- entre `1200px` e `1439px`, a coluna usa toda a largura disponível após a sidebar e o padding, sem overflow horizontal e sem tentar atingir `1440px`;
- em `1440px` ou mais, o limite de `1440px` aplica-se somente à coluna de conteúdo; o fundo e a toolbar continuam ocupando a região principal;
- nenhum breakpoint Wide cria uma terceira coluna, uma segunda sidebar ou um painel decorativo.

### Regras mobile

- mobile é a superfície principal completa; execução tem prioridade de ordem, foco e ação;
- mobile permite cadastrar Produto, gerar estratégia, revisar e editar Content, montar lote e gravar;
- conteúdo útil começa com a ação ou o objeto mais urgente;
- uma mão deve alcançar ações primárias e navegação;
- definir `--safe-bottom` como `env(safe-area-inset-bottom, 0px)`;
- a navegação inferior é fixa, tem `64px + --safe-bottom` de área ocupada e mantém controles internos com alvo mínimo de `44×44px`;
- a região rolável recebe `padding-block-end: calc(64px + var(--safe-bottom) + 16px)` e o mesmo valor em `scroll-padding-block-end`;
- o header contextual tem `56px` de altura de referência e não cobre o primeiro bloco de conteúdo;
- a barra de ação da Produção fica sticky acima da navegação inferior, com `inset-block-end: calc(64px + var(--safe-bottom))`, e nunca cobre o CTA;
- filtros complexos entram em sheet/bottom sheet, sem transformar cada filtro em uma linha permanente;
- listas usam leitura vertical e ação direta; tabelas e colunas densas não são comprimidas;
- modo de gravação mostra apenas hook, roteiro/cenas, CTA, status e anterior/próximo;
- o avanço para o próximo Content permanece visível após marcar como Gravado, mas não acontece sozinho.

### Regras tablet

- o tablet não usa a navegação inferior do mobile nem a sidebar completa do desktop;
- usa rail lateral fixa ou persistente de `72px`, com os cinco destinos em ícone;
- cada ícone mantém nome acessível completo, tooltip ao foco/hover e alvo mínimo de `44×44px`;
- a região principal usa `minmax(0, 1fr)`, grid de oito colunas, gutter de `24px` e padding lateral de `24px`;
- a toolbar contextual permanece com `56px` de altura e pode agrupar ações secundárias;
- todas as capacidades principais continuam acessíveis; o rail apenas compacta a navegação.

### Regras desktop

- desktop expande planejamento, organização e operações de alta densidade;
- sidebar fixa de referência; o conteúdo não deve esconder a navegação ao rolar;
- toolbar contextual para busca, filtros, seleção, ordenação e ações do contexto atual;
- áreas de estratégia e Vault podem revelar mais colunas e proveniência, sem criar capacidades exclusivas;
- tabelas são permitidas quando melhoram comparação real entre objetos;
- nenhuma operação essencial de Produto, Estratégia, Conteúdo ou Produção fica bloqueada no mobile;
- nenhum painel deve ocupar espaço somente para equilibrar a composição.

### Comportamento por seção

| Destino | Mobile | Desktop |
|---|---|---|
| Hoje | próxima gravação, lote atual e ação de continuar | fila priorizada, produtos ativos e organização do dia; nunca KPI |
| Produtos | cadastrar, completar contexto e iniciar a próxima ação | lista densa, filtros, progresso operacional e organização de vários Produtos |
| Conteúdos | revisar, editar, regenerar partes e avançar | comparação, filtros, seleção e detalhes progressivos |
| Produção | montar lote, modo de gravação, marcação rápida e avanço | fila densa, lotes, agrupamento por produto/cenário e seleção para ações previstas |
| Vault | busca e histórico em leitura vertical | memória consultável com filtros, datas, dimensões e proveniência |

### Limites de overview e métricas

Hoje é uma fila priorizada, não um overview analítico. São proibidos no MVP:

- KPI cards, cards de métricas soltas, gráficos, scorecards, porcentagens decorativas e painéis de overview;
- contagens ou números sem vínculo direto com Produto, Content, lote ou fila de Produção;
- composição que use números para preencher espaço ou simular progresso de negócio.

Números podem aparecer somente como atributo de um objeto real ou estado operacional, por exemplo `18/30 conteúdos produzidos` dentro de um Produto ou `vídeo 12 de 30` dentro da fila. A métrica de produto pode existir no domínio, mas não vira elemento visual da aplicação sem uma ação operacional associada.

## 4. Tokens semânticos de cor

Não criar cores ad hoc para telas, categorias, ângulos, tipos de Content ou planos. Os IDs abaixo são canônicos e preservam os hexes oficiais, exceto pelo token específico de ação preenchida em Light.

### Tokens canônicos por tema

| ID canônico | Light | Dark | Uso |
|---|---:|---:|---|
| `color.brand.accent` | `#5B6CFF` | `#7885FF` | marca, acento secundário, seleção e estados não preenchidos |
| `color.action.filled` | `#3D4CC6` | `#7885FF` | ações preenchidas com texto normal acessível |
| `color.intelligence` | `#8A63D2` | `#8A63D2` | inteligência explícita, geração e explicabilidade |
| `color.canvas` | `#F7F7F8` | `#0F1115` | fundo geral |
| `color.surface.default` | `#FFFFFF` | `#161A20` | conteúdo principal sólido |
| `color.surface.secondary` | `#F1F2F4` | `#1D222A` | agrupamentos e campos neutros |
| `color.border.default` | `#E4E6E8` | `#2A3039` | divisores e contornos |
| `color.text.primary` | `#17191C` | `#F4F6F8` | títulos, corpo e instruções |
| `color.text.secondary` | `#666B73` | `#A7ADB7` | contexto e metadados |
| `color.text.muted` | `#969CA5` | `#6F7782` | informação auxiliar não essencial |
| `color.content.on-surface` | `#17191C` | `#F4F6F8` | conteúdo normal sobre superfície |
| `color.content.on-action` | `#FFFFFF` | `#0F1115` | texto normal sobre ação preenchida |
| `color.focus.ring` | `#5B6CFF` | `#7885FF` | foco-visible e indicação de seleção |
| `color.feedback.success` | `#2E9B66` | `#2E9B66` | confirmação e avanço concluído |
| `color.feedback.warning` | `#C9892B` | `#C9892B` | atenção e ação pendente |
| `color.feedback.danger` | `#C94B50` | `#C94B50` | erro, destruição e falha recuperável |

`#3D4CC6` é a única adição cromática: uma variação mais escura do azul de marca, reservada a preenchimentos de ação no Light. Seu contraste é `6.89:1` com `#FFFFFF` e `6.36:1` com `#F4F6F8`, permitindo texto normal. Os demais hexes oficiais permanecem inalterados.

### Matriz normativa de combinações

Critério usado: texto normal exige contraste mínimo de `4.5:1`; texto grande e gráficos/contornos não textuais exigem `3:1`. Um par não listado como permitido é proibido por padrão. Os valores abaixo são contraste WCAG arredondado para duas casas.

| Tema | Foreground | Background | Contraste | Texto normal | Grande/gráfico | Política |
|---|---|---|---:|---:|---:|---|
| Light | `color.text.primary` | `color.surface.default` | `17.61:1` | Sim | Sim | corpo e títulos |
| Light | `color.text.secondary` | `color.surface.default` | `5.36:1` | Sim | Sim | contexto legível |
| Light | `color.text.muted` | `color.surface.default` | `2.76:1` | Não | Não | somente auxiliar não textual |
| Light | `color.brand.accent` | `color.surface.default` | `4.17:1` | Não | Sim | borda, foco, ícone ou texto grande |
| Light | `color.content.on-action` | `color.action.filled` | `6.89:1` | Sim | Sim | ação preenchida segura |
| Light | `color.intelligence` | `color.surface.default` | `4.38:1` | Não | Sim | ícone, borda ou texto grande |
| Light | `color.feedback.success` | `color.surface.default` | `3.50:1` | Não | Sim | sempre acompanhado de texto |
| Light | `color.feedback.warning` | `color.surface.default` | `2.96:1` | Não | Não | nunca como único sinal visual |
| Light | `color.feedback.danger` | `color.surface.default` | `4.56:1` | Sim | Sim | mensagem pode usar o token |
| Dark | `color.text.primary` | `color.canvas` | `17.44:1` | Sim | Sim | corpo e títulos |
| Dark | `color.text.secondary` | `color.surface.default` | `7.74:1` | Sim | Sim | contexto legível |
| Dark | `color.text.muted` | `color.surface.default` | `3.86:1` | Não | Sim | auxiliar ou texto grande |
| Dark | `color.brand.accent` | `color.surface.default` | `5.49:1` | Sim | Sim | acento textual em superfície |
| Dark | `color.content.on-action` | `color.action.filled` | `5.94:1` | Sim | Sim | ação preenchida segura |
| Dark | `color.intelligence` | `color.surface.default` | `3.99:1` | Não | Sim | ícone, borda ou texto grande |
| Dark | `color.feedback.success` | `color.surface.default` | `4.99:1` | Sim | Sim | mensagem semântica |
| Dark | `color.feedback.warning` | `color.surface.default` | `5.90:1` | Sim | Sim | mensagem semântica |
| Dark | `color.feedback.danger` | `color.surface.default` | `3.83:1` | Não | Sim | texto explicativo em `color.text.primary` |

Regras de aplicação:

- ações preenchidas usam `color.action.filled` com `color.content.on-action`; nunca usar `color.text.primary` como exigência fixa sobre a ação;
- `color.brand.accent` permanece o azul de marca e acento secundário; no Light não é texto normal sobre Surface;
- `color.feedback.warning`, `color.feedback.success`, `color.intelligence` e qualquer par abaixo de `4.5:1` não podem ser texto normal isolado;
- cor sem texto, ícone, contorno estrutural ou estado não comunica nada sozinha;
- foco usa `color.focus.ring` com offset visível e deve ser validado contra a superfície real;
- não há gradientes nem cores intermediárias fora desses tokens.

### Glass e superfícies

Glass não é um token de conteúdo. Quando necessário, usar a Surface do tema com transparência controlada, Border do tema e blur discreto somente em:

- sidebar/navegação;
- toolbar contextual;
- barras de ação flutuantes;
- sheets, popovers e menus que flutuam sobre conteúdo.

Não aplicar glass a Product, Content, estratégia, scripts, filas, tabelas ou texto principal.

## 5. Tipografia

### Escolhas

| Papel | Família | Pesos normativos | Fallback aprovado | Rationale |
|---|---|---|---|---|
| Headings, body, UI e números | **Instrument Sans** | 400, 500, 600, 700 | `Instrument Sans, sans-serif` | uma voz única mantém leitura, hierarquia e densidade coerentes em toda a experiência |
| Código e proveniência técnica | **Geist Mono** | 400, 500 | `Geist Mono, monospace` | separa identificadores técnicos sem criar uma segunda voz para a interface |

Instrument Sans é a família principal para todos os elementos visuais de produto, incluindo números com `tabular-nums`. Geist Mono só aparece em código, IDs, hashes ou proveniência técnica explicitamente exposta.

### Fallback

Usar exatamente as stacks aprovadas acima quando a família principal ou um peso não estiver disponível. Não escolher outra família por tela e não sintetizar pesos. Os únicos pesos normativos são `400`, `500`, `600` e `700`.

### Escala tipográfica

A escala usa passos compactos para não transformar um aplicativo operacional em landing page. Valores são referência de design; line-height inclui espaço para leitura e toque.

| Token | Tamanho / line-height | Peso | Uso |
|---|---:|---:|---|
| `type.display` | `32px / 36px` | 700 | título principal de contexto, usado com parcimônia |
| `type.heading-1` | `24px / 30px` | 600 | título de página ou objeto |
| `type.heading-2` | `20px / 26px` | 600 | seção e agrupamento real |
| `type.title` | `17px / 22px` | 600 | título de Product, Content ou item de fila |
| `type.body` | `15px / 22px` | 400 | leitura principal |
| `type.body-medium` | `15px / 22px` | 500 | ênfase em instruções e valores |
| `type.body-small` | `13px / 18px` | 400 | metadados e descrições secundárias |
| `type.label` | `12px / 16px` | 600 | labels, status e controles; sem excesso de caixa alta |
| `type.numeric` | `24px / 28px` | 600 | contagem ligada a objeto real, nunca métrica decorativa |
| `type.code` | `12px / 18px` | 400 | identificadores e proveniência técnica em Geist Mono |

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

| Token | Valor | Uso típico |
|---|---:|---|
| `space.0` | `0px` | ausência intencional |
| `space.hairline` | `1px` | borda/divisor |
| `space.2xs` | `2px` | relação de ícone com texto muito curto |
| `space.xs` | `4px` | label e valor próximo |
| `space.sm` | `8px` | gap interno compacto |
| `space.sm-plus` | `12px` | controles e metadados |
| `space.md` | `16px` | padding padrão e distância entre campos |
| `space.md-plus` | `20px` | separação de blocos relacionados |
| `space.lg` | `24px` | seção e card |
| `space.xl` | `32px` | distância entre grupos |
| `space.2xl` | `40px` | respiro de contexto |
| `space.3xl` | `48px` | abertura de seção |
| `space.4xl` | `64px` | início/fim de região ampla |
| `space.5xl` | `80px` | somente composição excepcional |

Não usar espaçamento para criar caixas decorativas. Primeiro definir a relação semântica, depois o gap menor que preserve leitura.

### Grid

| Breakpoint | Colunas | Gutter | Padding lateral |
|---|---:|---:|---:|
| Mobile `<768px` | 4 | `16px` | `16px` |
| Tablet `768–1199px` | 8 | `24px` | `24px` |
| Desktop `≥1200px` | 12 | `24px` | `32px` |
| Wide `≥1440px` | 12 | `24px` | conteúdo limitado pela coluna principal |

O max-width de `1440px` pertence apenas à coluna de conteúdo descrita no shell desktop. Sidebar, região principal, toolbar e fundo não são limitados por esse valor. `space.hairline` e `space.2xs` são exceções restritas a borda e micro-relação; o ritmo estrutural continua baseado em 4px.
### Raios

Raios são hierárquicos, não universais:

| Token | Valor | Uso |
|---|---:|---|
| `radius.none` | `0px` | divisores, regiões sem contêiner |
| `radius.xs` | `4px` | pequenos indicadores e campos muito compactos |
| `radius.control` | `8px` | inputs, botões, selects e menus |
| `radius.card` | `12px` | Product, Content e lote de produção |
| `radius.sheet` | `16px` | sheet, modal e superfície flutuante grande |
| `radius.pill` | `9999px` | status/tags neutros e somente quando o conteúdo for curto |

Não arredondar todas as superfícies. Cards sem objeto real não existem; logo, não recebem `radius.card`.

### Bordas e elevação

- estado repouso: Border sutil ou nenhuma borda quando a separação já for clara;
- cards de objetos: Surface sólida + Border; sombra não é requisito;
- superfícies flutuantes: uma camada de elevação discreta, sempre sobre Surface do tema;
- foco: contorno `color.focus.ring` com offset visível;
- não usar sombra para simular hierarquia em cada bloco.

## 7. Motion

**Abordagem:** minimal-functional. Movimento explica causa e efeito; não entretém.

| Token | Duração | Uso |
|---|---:|---|
| `motion.micro` | `80ms` | foco, cor de controle e feedback imediato |
| `motion.short` | `160ms` | seleção, hover, expansão pequena |
| `motion.medium` | `240ms` | disclosure, troca de estado e reordenação local |
| `motion.long` | `360ms` | sheet, modal e transição de região |

- entrada: `ease-out`;
- saída: `ease-in`;
- deslocamento/reordenação: `ease-in-out`;
- não usar bounce, spring chamativo, parallax, auto-scroll decorativo ou contagem animada;
- geração assíncrona pode indicar atividade, mas nunca deve inventar percentual de progresso;
- marcar `Gravado` deve dar feedback imediato e manter o próximo passo visível;
- erro não treme o campo; a mensagem e o foco resolvem a orientação;
- com `prefers-reduced-motion`, remover deslocamento e reduzir transições a mudança de estado instantânea ou microfeedback essencial.
### Máquina de estados mobile de Produção

A máquina abaixo descreve estados de interface e status visíveis do Content. O estado inicial é `Pronto para gravar`; o autoavanço é **desligado por padrão**.

| Estado de interface | Entrada | Ações permitidas | Saída e foco |
|---|---|---|---|
| `ready` / Pronto para gravar | abrir Content não gravado | `Marcar como gravado`, `Próximo`, `Anterior` | `Marcar` inicia `marking`; `Próximo` não marca implicitamente |
| `next-confirmation` | tocar `Próximo` antes de marcar | `Continuar sem marcar`, `Ficar nesta gravação` | continuar não altera status e move para o próximo Content; ficar retorna foco ao CTA |
| `marking` | tocar `Marcar como gravado` | nenhuma ação duplicada; `Cancelar` não é oferecido para esta ação curta | botão fica loading e bloqueado; não há duplo toque |
| `recorded` / Gravado | confirmação do estado Gravado | `Próximo`, `Anterior`, editar | mantém o Content visível, anuncia sucesso e move foco para `Próximo`; não avança sozinho |
| `mark-error` | falha ao marcar | `Tentar novamente`, `Ficar nesta gravação` | preserva hook, roteiro/cenas e CTA; foco vai para o erro inline e depois para Retry |
| `already-recorded` | abrir Content já Gravado | `Próximo`, `Anterior`, editar | não oferece segunda marcação; foco começa no estado e segue para `Próximo` |

Regras de transição:

- `Próximo` permanece visível em todos os estados e nunca grava, cancela ou regenera implicitamente;
- `Tentar novamente` repete a ação após uma falha e mantém o conteúdo visível;
- a ação de marcar não expõe cancelamento porque é curta; cancelamento aparece somente nos estados assíncronos que o oferecem;
- ao sucesso, anunciar `Gravado` sem mover a tela automaticamente; o creator decide quando tocar `Próximo`;
- ao erro, manter o item e os dados editados, não limpar o formulário e não perder o foco do contexto;
- se o Content já estiver Gravado, a interface não permite repetir a transição;
- `prefers-reduced-motion` remove qualquer deslocamento; foco e texto continuam obrigatórios.

## 8. Contratos de componentes

A lista abaixo define linguagem e comportamento, não implementação. Componentes devem servir o core loop Produto → Estratégia → Plano → Conteúdo → Produção.

### App shell

- mantém navegação principal persistente conforme a superfície;
- fornece título de contexto e uma ação primária clara;
- nunca esconde erro, estado de geração ou bloqueio de uso em uma área apenas visual;
- desktop usa sidebar fixa e toolbar contextual; mobile usa header contextual e navegação inferior.

### Navegação principal

- cinco destinos: Hoje, Produtos, Conteúdos, Produção, Vault;
- item ativo usa `color.brand.accent`/`color.focus.ring` e indicador estrutural adicional, como peso, fundo Surface Secondary ou linha;
- ícone de traço simples, 16–20px; o label pode ficar visualmente oculto no tablet, mas o nome acessível permanece sempre presente;
- não usar bolhas coloridas, ícones decorativos em círculos ou badges para criar urgência falsa;
- área tocável mínima: `44×44px`.

### Toolbar contextual

- pode usar glass porque é uma camada de navegação/controle;
- contém busca, filtros, ordenação, seleção e ações do contexto atual;
- prioriza uma ação primária, agrupa o restante em progressive disclosure;
- no mobile, transforma filtros em sheet e mantém o contexto visível.

### Action button

- rótulo é verbo + resultado: `Continuar produção`, `Adicionar produto`, `Marcar como gravado`;
- um único primary action por região; ações secundárias são neutras ou textuais; ações preenchidas usam `color.action.filled`;
- não usar gradiente;
- estados: default, hover, pressed, focus-visible, disabled, loading, success e error;
- loading preserva o rótulo e informa atividade sem trocar a ação por um spinner solto;
- destructive exige confirmação e usa `color.feedback.danger` apenas como semântica, nunca como decoração.

### Product card

Card permitido porque representa o objeto Product. Exibe apenas o necessário para agir:

- nome do produto;
- contexto curto ou categoria neutra;
- estado/progresso operacional real, como conteúdos pendentes ou próximo passo;
- ação primária contextual;
- metadados secundários sob demanda.

Não transformar Product card em painel de analytics, não adicionar mini-gráficos e não pintar cada categoria.

### Content card

Card permitido porque representa o objeto Content. Ordem recomendada:

1. posição ou identificação;
2. hook, como conteúdo dominante;
3. ângulo e status neutros;
4. próxima ação;
5. estratégia, cenas, CTA e proveniência em disclosure.

No mobile, mostrar hook, roteiro/cenas, CTA e ação de avanço. Desktop pode revelar dimensões de variedade e explicabilidade. Seleção múltipla só pode alimentar ações operacionais explicitamente previstas; edição em massa não faz parte do MVP.

### Production row e lote

Fila e lote são objetos operacionais reais. Usar row/lista por padrão; usar card somente quando o lote precisar ser tratado como unidade. Status mínimos do PRD:

- Ideia;
- Pronto para gravar;
- Gravado;
- Publicado;
- Arquivado.

Status são labels + texto/ícone e, quando útil, semântica `color.feedback.success`. Não usar uma cor exclusiva por status.

### Tabs e segmented control

- tabs representam regiões do mesmo objeto, como Estratégia, Conteúdos, Produção e Histórico;
- segmented control representa uma escolha curta e mutuamente exclusiva;
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
- entrada de Produto começa por descrição manual; URL é opcional e não bloqueia o fluxo.

### Busca e filtros

- busca textual deve encontrar produtos, hooks, scripts e tags;
- filtros do MVP: produto, status, ângulo e data;
- filtros são neutros por padrão; seleção usa `color.brand.accent`;
- filtros ativos são resumidos em uma linha removível, sem cores arbitrárias;
- desktop permite combinar filtros e seleção múltipla para ações operacionais previstas; edição em massa de campos não faz parte do MVP;
- mobile usa sheet e aplicação explícita.

### Status, alertas e feedback

- `color.feedback.success` confirma algo concluído;
- `color.feedback.warning` pede atenção antes de continuar;
- `color.feedback.danger` explica falha, destruição ou recuperação;
- `color.intelligence` indica inteligência/generation somente;
- inline alert é preferível a toast quando a pessoa precisa agir;
- toast serve apenas para confirmação breve não bloqueante e nunca é a única forma de comunicar erro;
- ícone, texto e ordem da mensagem acompanham a cor.

### Empty, loading e error

- **Empty:** explica o que falta e oferece a próxima ação; não usar ilustração decorativa como conteúdo principal;
- **Loading:** preserva estrutura esperada e informa o estado; não simular conteúdo estratégico ainda inexistente;
- **Access/limit:** explica por que a ação não está disponível e aponta o próximo caminho possível, sem ocultar o conteúdo já existente;

### Estados de geração assíncrona

Esta matriz descreve somente a experiência visível de geração.

| Estado | Representação | Ações do usuário | Feedback |
|---|---|---|---|
| `queued` | Na fila, com contexto do pedido | `Cancelar`, consultar status | confirmação de que o pedido foi recebido; nenhum Content parcial |
| `running` | Gerando, com atividade sem percentual inventado | consultar status; `Cancelar` quando disponível | atividade visível; nenhum Content parcial |
| `succeeded` | Concluído | consultar resultado, editar, iniciar novo lote | resultado completo disponível |
| `failed` | Falhou | `Tentar novamente`, consultar detalhes | erro compreensível e recuperação clara |
| `cancelled` | Cancelado | consultar histórico, `Gerar novamente` | cancelamento confirmado; nenhum resultado parcial |

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
- `Hoje`, `Produtos`, `Conteúdos`, `Produção` e `Vault` são nomes oficiais;
- `Content` é o conceito de domínio; a interface pode usar `conteúdo` para leitura humana;
- estados usam a nomenclatura do PRD: Ideia, Pronto para gravar, Gravado, Publicado, Arquivado;
- explicar estratégia em uma frase quando necessário, por exemplo: “Este vídeo trabalha a objeção de que o produto é fraco.”;
- evitar “gerar mais conteúdo” como ação genérica quando o resultado puder ser nomeado: “Gerar novo lote”, “Gerar novo hook”, “Trocar CTA”.

## 12. Fora do sistema visual do MVP

Este documento não autoriza nem antecipa:

- telas implementadas, componentes de código ou dependências;
- geração automática de vídeo, imagem, voice-over ou publicação;
- analytics avançado, ROAS, CTR ou gráficos de performance externa;
- KPI cards, gráficos, scorecards, porcentagens decorativas ou overview analítico no MVP;
- integração obrigatória com TikTok/TikTok Shop;
- banco vetorial, embeddings ou deduplicação semântica;
- colaboração, RBAC, múltiplos membros ou billing por equipe;
- edição em massa de campos ou bulk edit; seleção múltipla só existe para ações operacionais previstas;
- cores próprias para categorias, ângulos, planos ou tipos de conteúdo;
- framework de temas diferente dos tokens semânticos definidos aqui.

## 13. Checklist de coerência antes de implementar

- [ ] A tela responde visualmente “o que faço agora?”
- [ ] Existe uma ação primária clara e nomeada com verbo.
- [ ] Mobile oferece a experiência completa: cadastrar Produto, gerar estratégia, revisar/editar Content, montar lote e gravar.
- [ ] Mobile dá prioridade de ordem, foco e ação à execução.
- [ ] Desktop amplia planejamento, organização e operações de alta densidade sem monopolizar capacidades.
- [ ] Os cinco destinos oficiais permanecem reconhecíveis.
- [ ] Todo card representa um objeto real.
- [ ] Conteúdo principal é sólido; glass só aparece em camada periférica.
- [ ] Tokens canônicos, matriz de contraste e semânticas estão sendo usados no papel correto.
- [ ] Light é a referência; Dark reutiliza os mesmos tokens semânticos.
- [ ] Estados de foco, erro, loading, empty, geração e reduced motion foram definidos.
- [ ] Nenhuma métrica ou decoração foi adicionada sem melhorar uma decisão.

## 14. Registro de decisões

| Data | Decisão | Rationale |
|---|---|---|
| 2026-08-24 | Light mode é o tema de referência e padrão | A interface precisa ser legível e familiar como ferramenta de produtividade; Dark é uma variação dos mesmos tokens, não um redesign. |
| 2026-08-24 | Mobile é a superfície principal completa, com execução prioritária | O creator precisa cadastrar Produto, gerar estratégia, revisar/editar Content, montar lote e gravar sem depender do desktop. |
| 2026-08-24 | Desktop é experiência expandida para planejamento em escala | Mais espaço suporta organização, comparação e operações densas, mas não cria capacidades exclusivas. |
| 2026-08-24 | Hoje substitui Home como entrada operacional | A primeira pergunta do produto é o que produzir agora, não um resumo analítico. |
| 2026-08-24 | Instrument Sans é a família principal; Geist Mono é técnico | Uma família única mantém coerência entre headings, body, UI e números; a mono fica restrita à proveniência técnica. |
| 2026-08-24 | `#5B6CFF` é brand/accent e `#3D4CC6` é ação preenchida Light | O azul original permanece na identidade; a variação mais escura garante texto normal acessível em ações preenchidas. |
| 2026-08-24 | Grid de 4px, layout híbrido e raios hierárquicos | Mantém disciplina e densidade confortável sem arredondar ou decorar tudo. |
| 2026-08-24 | Cards restritos a objetos reais e glass restrito à periferia | Protege a diferença entre interface operacional e dashboard SaaS decorativo. |
| 2026-08-24 | Motion minimal-functional | Movimento deve explicar seleção, disclosure, fila e feedback, respeitando redução de movimento. |
