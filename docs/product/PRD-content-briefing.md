# PRD — Briefing e Content Operations

## 1. Objetivo

Transformar as decisões comerciais produzidas pela Commerce Intelligence em unidades claras, editáveis, aprováveis e executáveis sem perder a lógica de venda que originou cada conteúdo.

O Briefing não existe apenas para dizer ao creator **o que gravar**. Ele deve preservar, em linguagem utilizável, **qual efeito comercial o conteúdo pretende provocar e qual mecanismo criativo ajuda a provocar esse efeito**. Esse efeito pode ser racional, emocional ou comportamental: identificação, curiosidade, desejo, confiança, percepção de valor, impulso, redução de objeção ou vontade de experimentar.

Fluxo principal:

```text
Strategy
↓
Content Plan
↓
Content Briefs
↓
Revisão
↓
Aprovação
↓
Lote de gravação
↓
Data planejada
↓
Estúdio + Agenda
↓
Execução
↓
Concluído
↓
Histórico
```

A regra é:

> **A inteligência define uma hipótese comercial e criativa de como o conteúdo pode gerar vontade de comprar. O Briefing transforma essa hipótese em execução natural para o creator. O lote apenas organiza essa execução no tempo.**

Content Operations não redefine a estratégia de venda. Sua responsabilidade é preservar essa intenção durante revisão, versionamento e execução.

---

## 2. Content Plan e Briefings

Um plano pode gerar qualquer quantidade de conteúdos.

Exemplo:

```text
Produto: Mini Aspirador

Plano
20 conteúdos
↓
20 Briefings do Conteúdo
```

Cada Briefing é independente.

A engine deve variar estrategicamente entre eles:

* públicos;
* dores;
* desejos;
* objeções;
* benefícios;
* ângulos;
* hooks;
* estruturas;
* roteiros;
* cenas;
* CTAs.

O objetivo não é produzir 20 variações superficiais da mesma ideia nem 20 formatos usados por obrigação. A variação deve explorar, quando fizer sentido, **teses de venda, emoções, situações, mecanismos persuasivos e mecanismos criativos diferentes** — por exemplo POV, demonstração, humor, surpresa, reação, transformação, comparação, storytelling ou visual-first — sempre conectados ao Produto e à intenção de venda.

---

## 3. Content e Briefing do Conteúdo

`Content` é a identidade estável da unidade de conteúdo que segue pelo workflow de revisão, aprovação e execução.

O **Briefing do Conteúdo** é a representação revisável desse `Content`. Seu material concreto é preservado em versões imutáveis e rastreáveis (`ContentBriefVersion`).

Estrutura conceitual:

```ts
interface Content {
  id: string;
  productId: string;
  planId: string;
  opportunityId?: string;

  status: ContentStatus;

  currentBriefVersionId: string;
  approvedBriefVersionId?: string;

  createdAt: string;
  updatedAt: string;
}

type ContentStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'DISCARDED';

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

  script: string;
  scenes: Scene[];

  cta: string;

  notes?: string;

  createdAt: string;
}
```

A Commerce Intelligence cria o `Content` inicialmente em `DRAFT` e sua primeira `ContentBriefVersion` válida.

O estado de revisão do `Content` deve permanecer separado do estado do lote.

Nem todos os elementos estratégicos precisam aparecer permanentemente na interface.

A interface deve priorizar aquilo que ajuda o creator a decidir:

> **“Entendo qual efeito este conteúdo quer provocar, como o Produto participa disso e consigo executar essa ideia de forma natural?”**

---

## 4. Experiência de revisão

A tela deve permitir navegar rapidamente entre vários briefings do mesmo plano dentro do contexto do Produto.

Exemplo:

```text
Mini Aspirador
20 conteúdos · 8 aprovados

Conteúdos                     Briefing #07

✓ #01 Problema                Público
✓ #02 Objeção                 Motoristas
  #03 Demonstração
  #04 Curiosidade             Ângulo
→ #07 Economia                Economia
  #08 Lifestyle
                              Hook
                              "Você gasta quanto..."

                              Roteiro
                              ...

                              Cenas
                              ...

                              CTA
                              ...

                              [Editar]
                              [Aprovar]
```

Para grandes quantidades, evitar dezenas de abas horizontais.

Preferir:

* lista lateral;
* navegação vertical;
* seletor de conteúdos;
* ou tabs apenas quando a quantidade for pequena.

`Conteúdos` não precisa existir como destino global de navegação no MVP. A revisão acontece no contexto do Produto e de seus planos.

---

## 5. Ações sobre o Briefing

Cada Content/Briefing pode possuir:

```text
Editar
Aprovar
Descartar
Duplicar
Regenerar
```

`Descartar` altera o workflow para `DISCARDED` e preserva a memória; não representa hard delete.

Regenerações específicas:

```text
Novo hook
Trocar ângulo
Novo CTA
Nova estrutura
Nova versão completa
```

Regenerar uma parte não deve obrigar o usuário a explicar novamente o produto ou a estratégia.

---

## 6. Aprovação e versionamento

Um `Content` não entra automaticamente em gravação.

Fluxo inicial:

```text
Content DRAFT
↓
ContentBriefVersion v1
↓
usuário revisa
↓
edita ou regenera, se necessário
↓
ContentBriefVersion v2 / v3 / ...
↓
usuário aprova uma versão
↓
Content APPROVED
+ approvedBriefVersionId
```

Ao aprovar, deve ser preservada a versão exata que foi aprovada.

A execução utiliza o snapshot indicado por `approvedBriefVersionId`.

Se o usuário editar ou regenerar novamente depois da aprovação:

```text
v3 APPROVED
↓
edição/regeneração
↓
v4 criada
↓
Content volta a exigir aprovação
```

A nova versão precisa ser aprovada antes de substituir a versão aprovada para **novas** execuções.

Lotes já existentes continuam apontando para a versão aprovada que foi selecionada quando o lote foi criado; uma edição posterior não altera silenciosamente um `RecordingBatchItem` já montado.

`DISCARDED` preserva o Content e suas versões como memória. Não equivale a exclusão destrutiva.

A política geral de retenção de versões pertence à Spec. Entretanto, nenhuma versão pode ser removida enquanto estiver referenciada como versão aprovada ou por um `RecordingBatchItem`/histórico que dependa dela.

Isso garante rastreabilidade entre:

```text
Content
↓
Briefing aprovado
↓
versão aprovada
↓
lote de gravação
↓
execução
↓
resultado produzido
```

---

## 7. Aprovação em lote

O usuário pode aprovar vários conteúdos individualmente e depois selecionar quais aprovados farão parte de um lote de gravação.

Pode existir ação em lote:

```text
[ Aprovar selecionados ]

[ Criar lote com aprovados ]
```

Edição em massa dos campos dos briefings não é necessária.

Um conteúdo aprovado não precisa ser automaticamente incluído em um lote. A seleção do lote é uma decisão operacional separada.

---

## 8. Lote de gravação

O `RecordingBatch` é a unidade operacional do Estúdio.

Ele reúne conteúdos aprovados que o creator pretende produzir na mesma sessão ou contexto de gravação.

Exemplo:

```text
Mini Aspirador

8 conteúdos aprovados
Gravação: 26 de agosto
```

Estrutura conceitual:

```ts
interface RecordingBatchItem {
  contentId: string;
  approvedVersionId: string; // referencia ContentBriefVersion.id
  completedAt?: string;
}

interface RecordingBatch {
  id: string;
  productId: string;

  items: RecordingBatchItem[];

  scheduledDate: string; // data planejada; horário não é requisito do MVP

  createdAt: string;
  completedAt?: string;
}
```

No MVP, um lote pertence a um único Produto.

A data planejada é definida ao preparar o lote para gravação.

A Agenda não é uma entidade paralela: ela é uma visão temporal dos `RecordingBatch`.

---

## 9. Planejamento da gravação

Depois de montar o lote, o usuário define quando pretende gravá-lo.

Fluxo:

```text
8 conteúdos selecionados
↓
Criar lote
↓
Quando pretende gravar?

[ Hoje ]
[ Amanhã ]
[ Escolher data ]
↓
Confirmar
```

No MVP, é suficiente armazenar a data planejada da sessão.

Não é necessário exigir:

* horário;
* duração;
* recorrência;
* lembretes customizados;
* participantes;
* sala;
* calendário externo.

A data pode ser alterada posteriormente através da ação `Reagendar`.

---

## 10. Agenda de gravação

A Agenda é o calendário interno das sessões planejadas.

Deve permitir visualizar lotes por:

```text
Dia
Semana
Mês
```

Exemplo:

```text
26 de agosto

Mini Aspirador
8 conteúdos

Escova Modeladora
5 conteúdos
```

Um item da Agenda deve mostrar somente informação operacional suficiente para reconhecer e abrir o lote:

* Produto;
* quantidade de conteúdos;
* progresso, quando o lote já tiver começado;
* data planejada.

Ações principais:

```text
[Abrir no Estúdio]
[Reagendar]
```

A Agenda do MVP é interna ao Commerce Intelligence.

Ela não agenda publicação em TikTok, Instagram ou qualquer outra plataforma.

Ela também não sincroniza Google Calendar nem cria lembretes externos no MVP.

Essas integrações podem ser adicionadas futuramente sem alterar o modelo central de `RecordingBatch`.

---

## 11. Estúdio

O Estúdio é o centro operacional de pré-produção e acompanhamento dos lotes de gravação.

Ele organiza os lotes, apresenta os materiais necessários para cada conteúdo e acompanha o progresso informado pelo creator. A captura do vídeo acontece fora da plataforma.

A esteira possui somente três estados visíveis:

```text
Aguardando
Gravando
Concluído
```

Esses estados pertencem ao lote e são derivados automaticamente da quantidade de conteúdos concluídos.

Regra:

```text
0 concluídos de N       → Aguardando
1 até N-1 concluídos    → Gravando
N concluídos de N       → Concluído
```

`Gravando` significa apenas que a execução daquele lote já foi iniciada. Não significa que a plataforma esteja capturando vídeo ou áudio.

O usuário não altera o status do lote manualmente.

Exemplo:

```text
Mini Aspirador

3 de 8 concluídos
38%

Gravando

[Continuar lote]
```

O percentual é permitido porque representa progresso real de um objeto operacional. Ele não é analytics ou KPI.

O Estúdio não deve se transformar em uma ferramenta genérica de gestão de projetos.

Não incluir:

* sprints;
* responsáveis;
* prioridades complexas;
* dependências;
* dezenas de estados;
* gestão de tarefas genéricas.

---

## 12. Execução pelo creator

Ao abrir um lote, o usuário vê os conteúdos que o compõem e quais já foram concluídos.

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

O **Guia de Gravação** de um conteúdo deve mostrar apenas as informações necessárias para orientar a execução:

```text
Hook

Roteiro

Cenas

CTA

[Anterior]

[Concluir conteúdo]

[Próximo]
```

O Guia de Gravação não captura mídia.

No MVP, o Estúdio não deve:

* acessar ou controlar a câmera do dispositivo;
* possuir REC, obturador ou preview de câmera;
* capturar áudio ou vídeo;
* editar mídia;
* substituir o aplicativo ou equipamento utilizado pelo creator para gravar.

O creator grava externamente e utiliza o Estúdio apenas como guia operacional e acompanhamento do lote.

Regras:

* concluir um conteúdo atualiza imediatamente o progresso do lote;
* `Próximo` não conclui implicitamente o conteúdo atual;
* não existe autoavanço obrigatório após concluir;
* um conteúdo já concluído não pode ser concluído novamente por engano;
* falha ao salvar não deve perder o contexto ou os dados exibidos.

---

## 13. Conclusão do lote e histórico

Quando todos os conteúdos do lote forem concluídos:

```text
N de N concluídos
↓
100%
↓
Lote Concluído
```

O lote passa automaticamente para `Concluído`.

O histórico deve preservar:

* produto;
* plano;
* lote;
* data planejada;
* data de conclusão;
* Briefing aprovado utilizado em cada conteúdo;
* versões;
* público;
* dor;
* benefício;
* objeção;
* ângulo;
* hook;
* roteiro;
* CTA;
* status de conclusão;
* modo de execução;
* mídia final, quando existir futuramente.

O histórico permanece acessível no contexto do Produto.

`Vault` pode continuar existindo como conceito técnico de memória intelectual e operacional, mas não é um destino obrigatório da navegação do MVP.

Essa memória alimenta o controle de variedade das próximas gerações.

---

## 14. Home e continuidade operacional

A Home deve usar os dados dos lotes para responder rapidamente o que o creator precisa fazer.

Pode mostrar:

* campo para adicionar/analisar um Produto;
* lotes planejados para hoje;
* gravações iniciadas que precisam ser continuadas;
* próximas gravações já agendadas.

Não deve mostrar:

* bloco `Ainda sem data`;
* KPIs soltos;
* gráficos;
* analytics;
* números sem vínculo com Produto ou lote.

A Home é uma entrada operacional, não um dashboard analítico.

---

## 15. AI Content Production — futuro Premium

A execução por IA utiliza exatamente a mesma estratégia e o mesmo Briefing aprovado.

```text
Approved Content Brief
↓
Production Specification
↓
AI Content Production
↓
Provider
↓
Vídeo
```

Providers poderão incluir, por exemplo:

```text
Seedance
outros providers de vídeo
imagem
voice-over
```

A AI Production Engine não deve redefinir:

* público;
* dor;
* estratégia;
* ângulo;
* hook;
* roteiro;
* CTA.

Ela recebe uma decisão já tomada e executa.

A diferença entre creator e IA é somente o executor:

```text
                 Approved Brief
                       ↓
             ┌─────────┴─────────┐
             ↓                   ↓
          Creator               IA
             ↓                   ↓
           mídia                mídia
```

A geração automática permanece fora do primeiro MVP.

A introdução futura de IA como executor não deve exigir reconstrução do Briefing ou da inteligência estratégica.

---

## 16. Separação de responsabilidades

```text
Commerce Intelligence Engine
= decide como o conteúdo pode mover o público em direção à compra
+ constrói ProductStrategy
+ planeja o conjunto em ContentPlan / ContentOpportunity
+ cria Content + Briefing inicial em DRAFT
```

```text
Content Operations
= revisão, edição, regeneração, versionamento, aprovação,
descarte, lotes, agenda interna, estúdio, execução e histórico
```

```text
AI Content Production
= executa a mídia quando solicitado futuramente
```

`ContentPortfolioPlanner` e `BriefGenerator` são capabilities internas da Commerce Intelligence Engine. Não existe um `Sales Content Engine` peer entre Strategy e Content Operations.

Nenhum desses domínios deve assumir a responsabilidade do outro.

A Agenda organiza **quando gravar**. Ela não decide estratégia nem agenda publicação.

---

## 17. Fora do escopo

Não incluir nesta frente do MVP:

* publicação automática;
* agendamento de publicação;
* sincronização com Google Calendar;
* lembretes externos de calendário;
* analytics externo;
* ROAS;
* CTR;
* atribuição;
* gestão complexa de projetos;
* dezenas de estados de workflow;
* aprovação com múltiplos níveis;
* colaboração avançada;
* geração automática de mídia.

A **Agenda interna de gravação** faz parte do MVP e não deve ser confundida com esses itens.

---

## 18. Critérios de aceite

A frente está pronta quando:

1. um Plan pode possuir múltiplos Briefings;
2. cada Briefing pode ser aberto individualmente;
3. usuário pode navegar entre 10, 20 ou mais conteúdos;
4. usuário pode editar cada Briefing;
5. usuário pode regenerar partes específicas;
6. usuário pode descartar conteúdos;
7. usuário pode aprovar individualmente ou selecionar aprovados;
8. Content possui identidade estável e a versão aprovada fica preservada;
9. usuário pode criar um lote com conteúdos aprovados;
10. lote pertence a um Produto e possui data planejada de gravação;
11. Agenda consegue exibir os lotes por dia, semana e mês;
12. lote pode ser reagendado;
13. Estúdio apresenta `Aguardando`, `Gravando` e `Concluído`;
14. status do lote é derivado automaticamente pelo número de conteúdos concluídos;
15. creator pode abrir o lote e concluir conteúdos individualmente;
16. progresso do lote é atualizado imediatamente;
17. ao concluir todos os conteúdos, o lote passa automaticamente para `Concluído`;
18. Home pode mostrar gravações de hoje e próximas gravações sem criar um bloco `Ainda sem data`;
19. histórico permanece acessível no contexto do Produto;
20. arquitetura permite futuramente usar IA como executor sem redefinir o Briefing.

---

## 19. Regra final

O fluxo deve permanecer:

```text
Gerar
↓
Entender
↓
Editar se necessário
↓
Aprovar
↓
Organizar em lote
↓
Definir quando gravar
↓
Acompanhar no Estúdio
↓
Concluir
↓
Preservar histórico
```

O usuário nunca deve precisar compreender a complexidade interna da engine para executar a estratégia, mas deve conseguir perceber a intenção comercial do conteúdo que está revisando.

> **O Briefing do Conteúdo é a ponte entre a lógica de decisão de compra criada pela inteligência e a execução do creator. O lote de gravação apenas organiza essa execução em uma sessão.**
