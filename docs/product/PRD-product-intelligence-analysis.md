# PRD — Análise Assíncrona do Produto e Geração Inicial de Briefings

**Status:** proposta para MVP  
**Data:** 2026-08-26  
**Escopo:** fluxo entre a confirmação da extração do produto e a disponibilização dos primeiros Briefings do Conteúdo.

---

## 1. Objetivo

Definir a experiência e o comportamento do sistema depois que o usuário confirma os fatos extraídos de um produto e antes de começar a revisar os Briefings do Conteúdo.

A experiência desejada é simples:

```text
Colar URL
↓
Extrair fatos
↓
Usuário confirma ou edita
↓
Commerce Intelligence trabalha em segundo plano
↓
Briefings ficam prontos
↓
Usuário revisa
```

A análise estratégica não deve virar uma nova etapa burocrática ou uma tela obrigatória de aprovação.

A regra é:

> **Depois que o usuário confirma qual é o produto, a plataforma assume o trabalho até existir conteúdo útil para revisar.**

---

## 2. Problema

Depois da importação do produto, o Commerce Intelligence precisa executar várias decisões antes de produzir conteúdos utilizáveis:

* compreender o produto;
* identificar públicos relevantes;
* identificar dores e desejos;
* mapear objeções;
* compreender benefícios e argumentos;
* definir oportunidades e ângulos comerciais;
* construir a estratégia;
* montar o plano de conteúdos;
* gerar os Briefings do Conteúdo.

Expor cada uma dessas etapas como uma tela, formulário ou aprovação criaria fricção desnecessária e faria a interface refletir a complexidade interna da engine.

O usuário não precisa operar a estratégia passo a passo.

Ele precisa saber apenas:

1. que o sistema está trabalhando;
2. em qual etapa geral está;
3. qual produto está sendo processado;
4. quando o resultado estiver pronto;
5. como recuperar uma falha, caso aconteça.

---

## 3. Princípio de experiência

Não criar uma página permanente chamada `Análise`, `Commerce Intelligence` ou equivalente como etapa obrigatória do fluxo.

Depois da confirmação do produto, o processamento ocorre de forma assíncrona e o estado é apresentado através de um **indicador global de atividade** integrado ao App Shell.

O usuário pode continuar navegando pela aplicação enquanto a análise acontece.

A inteligência permanece consultável posteriormente dentro da página do Produto, na área de Estratégia, mas sua visualização não é pré-requisito para gerar os primeiros conteúdos.

---

## 4. Fluxo principal

```text
Home
↓
Usuário cola URL
↓
[Analisar produto]
↓
Product Import executa extração
↓
ProductCandidate
↓
Tela transitória de confirmação
↓
Usuário edita fatos se necessário
+ quantidade inicial é resolvida
↓
[Confirmar produto]
↓
Product é persistido
↓
CommerceIntelligenceJob é criado
↓
Indicador global aparece
↓
Commerce Intelligence executa estratégia
↓
Content Plan é criado
↓
Content Briefs são gerados
↓
Job concluído
↓
Briefings disponíveis para revisão
```

Não deve existir outra confirmação obrigatória entre `Confirmar produto` e os Briefings prontos.

---

## 5. Tela transitória de confirmação do produto

A confirmação do `ProductCandidate` continua pertencendo ao fluxo de importação.

Exemplo:

```text
Produto encontrado

[imagem]

Mini Aspirador XYZ
R$ 79,90
TikTok Shop

Descrição
...

Características
• Sem fio
• Recarregável
• Compacto

[Editar]

[Confirmar produto]
```

### Regras

* não aparece como item da sidebar;
* não deve ser uma página operacional para a qual o usuário retorna normalmente;
* deve existir apenas durante o fluxo iniciado por `Analisar produto`;
* `Editar` permite corrigir os fatos antes da persistência;
* estratégia comercial não aparece nessa etapa;
* `Confirmar produto` salva o Product e inicia automaticamente o processamento da Commerce Intelligence.

O usuário não precisa clicar posteriormente em `Gerar estratégia` ou `Analisar com IA`.

---

## 6. Quantidade inicial de conteúdos

Antes de iniciar o `CommerceIntelligenceJob`, o sistema precisa conhecer a quantidade de conteúdos que deverão ser preparados.

Essa informação não deve exigir uma nova tela intermediária.

Ela deve ser resolvida por uma das seguintes fontes, em ordem de preferência definida pelo produto:

```text
preferência já definida pelo usuário
ou
valor padrão do produto/plano
ou
seletor compacto dentro da confirmação do produto
```

Exemplo, quando o seletor for necessário:

```text
Quantos conteúdos deseja preparar?

[10] [20] [30] [Outro]

[Confirmar produto]
```

A decisão sobre qual valor será o padrão do MVP fica fora deste PRD.

Regra:

> **A quantidade precisa estar resolvida antes do job começar, mas não deve criar uma nova etapa de navegação.**

---

## 7. CommerceIntelligenceJob

A análise deve ser implementada como trabalho assíncrono persistente.

Estrutura conceitual:

```ts
interface CommerceIntelligenceJob {
  id: string;
  userId: string;
  productId: string;

  targetContentCount: number;

  status:
    | 'QUEUED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED';

  stage:
    | 'UNDERSTANDING_PRODUCT'
    | 'IDENTIFYING_AUDIENCES'
    | 'ANALYZING_PAINS_AND_DESIRES'
    | 'ANALYZING_OBJECTIONS'
    | 'BUILDING_STRATEGY'
    | 'BUILDING_CONTENT_PLAN'
    | 'GENERATING_BRIEFS'
    | 'FINALIZING';

  errorCode?: string;
  errorMessage?: string;

  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

O job representa o processamento completo necessário para sair de um Product confirmado e chegar aos Briefings disponíveis para revisão.

---

## 8. Etapas visíveis

O sistema pode traduzir os estados internos para mensagens humanas curtas.

Exemplo:

```text
UNDERSTANDING_PRODUCT
→ Entendendo o produto...

IDENTIFYING_AUDIENCES
→ Identificando públicos relevantes...

ANALYZING_PAINS_AND_DESIRES
→ Entendendo dores e desejos...

ANALYZING_OBJECTIONS
→ Mapeando objeções...

BUILDING_STRATEGY
→ Definindo a melhor estratégia para este produto...

BUILDING_CONTENT_PLAN
→ Organizando as oportunidades de conteúdo...

GENERATING_BRIEFS
→ Preparando os Briefings do Conteúdo...

FINALIZING
→ Finalizando...
```

### Regra crítica

Essas mensagens devem refletir **etapas reais da pipeline**.

Não trocar frases apenas por tempo ou animação para simular trabalho.

Não mostrar percentual inventado.

Se a engine não conhece progresso quantitativo real, a interface mostra somente a etapa atual.

---

## 9. Indicador global de atividade

Quando existir um `CommerceIntelligenceJob` ativo, todas as superfícies autenticadas da aplicação devem poder mostrar seu estado.

O componente faz parte do App Shell e fica imediatamente abaixo da região superior de navegação/toolbar.

Exemplo compacto:

```text
✦ Mini Aspirador · Entendendo dores e desejos...
```

Uma variação com indicação de etapas pode existir quando houver espaço:

```text
Produto ✓  →  Públicos ✓  →  Estratégia •  →  Conteúdos ○
```

O indicador deve permanecer discreto e não transformar a aplicação em uma tela de loading.

### Deve mostrar

* nome do Produto;
* atividade em andamento;
* etapa atual em linguagem humana;
* erro, se existir;
* ação para revisar o resultado quando concluído.

### Não deve mostrar

* percentual falso;
* tempo restante inventado;
* logs técnicos;
* tokens;
* prompts;
* detalhes da cadeia interna da engine;
* várias animações simultâneas.

---

## 10. Comportamento por superfície

### Desktop

O indicador global pode ocupar uma linha compacta abaixo da toolbar contextual.

### Tablet

Mantém a mesma função, com texto resumido quando necessário.

### Mobile

Deve aparecer abaixo do header contextual e preservar o espaço da navegação inferior.

O texto pode ser reduzido para:

```text
✦ Mini Aspirador
Criando estratégia...
```

Tocar no indicador pode revelar mais contexto em uma sheet, sem criar uma página permanente de análise.

---

## 11. Concorrência no MVP

No MVP, permitir **apenas um `CommerceIntelligenceJob` ativo por usuário**.

Enquanto um job estiver em `QUEUED` ou `RUNNING`:

* o usuário continua utilizando Home, Produtos, Estúdio, Agenda e Configurações;
* pode revisar Briefings e operar lotes já existentes;
* `Analisar produto` não pode iniciar uma segunda análise;
* a ação deve ficar desabilitada com explicação clara.

Exemplo:

```text
[Analisar produto]  disabled

Uma análise já está em andamento.
```

### Motivo

Permitir uma fila visível de múltiplos produtos no MVP exigiria resolver prematuramente:

* ordem da fila;
* remoção da fila;
* prioridade;
* cancelamento individual;
* múltiplas falhas;
* limites por plano;
* consumo de créditos;
* concorrência;
* representação visual de vários jobs;
* notificações de vários resultados.

Ainda não existe evidência de que essa complexidade seja necessária para validar o produto.

---

## 12. Arquitetura preparada para fila futura

A restrição de um job ativo é de produto, não uma limitação estrutural da engine.

A infraestrutura deve tratar análises como jobs persistentes desde o início.

Evolução futura possível:

```text
Produto A · RUNNING
Produto B · QUEUED
Produto C · QUEUED
```

Quando essa necessidade for validada, o indicador global poderá evoluir para uma pequena central de atividades, por exemplo:

```text
✦ Analisando Mini Aspirador
+ 2 análises aguardando
```

Essa evolução fica fora do MVP.

---

## 13. Bloqueio de `Analisar produto`

Enquanto houver uma análise ativa:

```text
job.status === QUEUED || RUNNING
```

A ação `Analisar produto` deve ficar indisponível.

O controle deve explicar o motivo do bloqueio.

Não esconder completamente a funcionalidade.

Exemplo:

```text
[Analisar produto] disabled

Conclua a análise atual para iniciar outro produto.
```

A importação em andamento ou outras intervenções de browser relacionadas ao mesmo produto não devem criar um segundo `CommerceIntelligenceJob`.

---

## 14. Persistência e navegação

O job não pertence à página que o iniciou.

Depois de confirmar o produto, o usuário pode:

* voltar à Home;
* abrir Produtos;
* usar o Estúdio;
* consultar a Agenda;
* alterar Configurações;
* fechar e reabrir a aplicação.

O job continua no backend até alcançar um estado terminal.

Ao retornar à aplicação, o App Shell consulta jobs ativos e restaura o indicador global.

A análise não deve depender da aba do navegador permanecer aberta.

---

## 15. Estado do Produto durante a análise

Depois da confirmação do `ProductCandidate`, o Product já existe mesmo que os Briefings ainda não estejam prontos.

Na área Produtos, ele pode aparecer como pendente:

```text
Mini Aspirador

Analisando produto...
```

Esse estado deve alimentar o filtro `Pendentes` já definido para Produtos.

Abrir o Produto durante o processamento pode mostrar uma superfície mínima de estado, sem apresentar conteúdo estratégico parcial como definitivo.

Exemplo:

```text
Mini Aspirador

A análise está em andamento.
Entendendo dores e desejos...
```

O indicador global continua sendo a representação principal da atividade.

---

## 16. Conteúdo parcial

Resultados internos parciais podem ser persistidos para permitir recuperação técnica, mas não devem ser apresentados como estratégia ou Briefings concluídos antes de `SUCCEEDED` — ou de `SUCCEEDED_PARTIAL` declarado, que publica somente os Briefings aprovados, informa os faltantes com motivo sanitizado e oferece `Gerar faltantes` (ADR-021). Parcial nunca é silencioso: nenhum Briefing reprovado é exibido.

Não mostrar ao usuário:

```text
3 de 20 briefings prontos
```

como se esses conteúdos já estivessem disponíveis para revisão enquanto a estratégia ainda pode mudar.

Regra:

> **Ou o conjunto inicial terminou com consistência suficiente para revisão, ou continua em processamento.**

---

## 17. Conclusão do job

Quando o processamento termina com sucesso:

```text
status = SUCCEEDED
```

O sistema deve:

1. persistir a estratégia do Produto;
2. persistir o Content Plan;
3. persistir todos os Content Briefs gerados;
4. tornar os Briefings disponíveis na página do Produto;
5. remover o bloqueio de nova análise;
6. atualizar o indicador global para estado concluído.

Exemplo:

```text
✓ Mini Aspirador pronto · 20 conteúdos preparados

[Revisar conteúdos]
```

---

## 18. Navegação após conclusão

Não interromper o usuário à força se ele estiver trabalhando em outra área da aplicação.

### Se o usuário permaneceu no contexto iniciado pela análise

A interface pode realizar a transição natural para os Briefings assim que o resultado estiver pronto.

```text
Análise concluída
↓
Produto
↓
Conteúdos
↓
Briefing #01
```

### Se o usuário navegou para outra área

Não redirecionar automaticamente.

O indicador global passa para estado concluído:

```text
✓ Mini Aspirador pronto

[Revisar conteúdos]
```

Ao clicar, o usuário abre o Produto diretamente na área de Conteúdos/Briefings.

---

## 19. Tela de Briefings como destino

O resultado útil desse fluxo é a experiência de revisão já definida para o Produto.

Exemplo conceitual no desktop:

```text
Mini Aspirador
20 conteúdos

Conteúdos                     Briefing #04

✓ #01 Problema                Público
✓ #02 Demonstração            Donos de carro
  #03 Economia
→ #04 Objeção                 Ângulo
  #05 Curiosidade             Objeção
                              
                              Hook
                              "Eu achei que..."
                              
                              Roteiro
                              ...
                              
                              Cenas
                              ...
                              
                              CTA
                              ...
                              
                              [Editar]
                              [Regenerar]
                              [Descartar]
                              [Aprovar]
```

Não criar uma aprovação obrigatória da estratégia antes de chegar aqui.

---

## 20. Estratégia consultável depois

Embora não exista uma tela intermediária obrigatória, a estratégia gerada permanece um objeto real do Produto.

Na página do Produto:

```text
Visão geral
Estratégia
Conteúdos
Histórico
```

A área Estratégia pode apresentar posteriormente:

* públicos;
* dores;
* desejos;
* objeções;
* benefícios;
* argumentos;
* posicionamento;
* ângulos prioritários;
* explicabilidade quando útil.

Essa área existe para compreensão, edição e confiança, não como bloqueio do fluxo inicial.

---

## 21. Falha

Se a análise falhar:

```text
status = FAILED
```

O indicador global deve apresentar erro recuperável.

Exemplo:

```text
Não foi possível concluir a análise de Mini Aspirador.

[Tentar novamente]
```

### Regras

* Product confirmado não é apagado;
* informações extraídas e corrigidas não são perdidas;
* não apresentar resultados parciais como concluídos;
* retry reutiliza o mesmo contexto confirmado;
* retry técnico do mesmo processamento não deve criar Briefings duplicados;
* nova tentativa deve ser idempotente sempre que possível.

Depois de falhar, `Analisar produto` pode permanecer bloqueado enquanto a falha exigir retry explícito ou pode ser liberado conforme a política definida pela implementação. O comportamento deve ser consistente e deixar clara a ação recomendada.

---

## 22. Cancelamento

O modelo de job suporta `CANCELLED` para permitir evolução e controle operacional.

No MVP, o cancelamento pelo usuário não precisa ser uma ação primária.

Se for oferecido, deve ficar em progressive disclosure e somente quando a infraestrutura puder cancelar com segurança.

Cancelar não deve apagar o Product confirmado.

Depois do cancelamento, o usuário poderá iniciar uma nova análise ou executar novamente a atual.

---

## 23. Reentrada e recuperação

Ao abrir a aplicação:

```text
App Shell
↓
consultar job ativo do usuário
↓
restaurar indicador global
```

Se o job concluiu enquanto o usuário estava fora:

```text
✓ Mini Aspirador pronto
[Revisar conteúdos]
```

Se falhou:

```text
Falha na análise de Mini Aspirador
[Tentar novamente]
```

Nenhuma etapa depende de memória local do frontend para ser recuperada.

---

## 24. Relação com limites e créditos

Limites comerciais podem controlar quantas análises ou conteúdos o usuário pode gerar.

Este PRD não define a política comercial de créditos.

Entretanto:

* validação de limite deve acontecer antes de iniciar o job;
* retries técnicos do mesmo job não devem provocar cobrança duplicada;
* um job não pode ser criado se o usuário não tiver capacidade para gerar a quantidade solicitada;
* erro de infraestrutura não deve produzir consumo duplicado em uma nova tentativa automática.

---

## 25. Separação de responsabilidades

### Product Import

Responsável por descobrir e confirmar fatos:

```text
URL
nome
preço
descrição
imagens
características
seller
variantes
```

### Commerce Intelligence Engine

Responsável pelo processamento estratégico completo entre o Product confirmado e os conteúdos revisáveis em `DRAFT`:

```text
Product Understanding
públicos
dores
desejos
objeções
benefícios
argumentos
posicionamento
ângulos
ProductStrategy
ContentPlan
ContentOpportunity
Content + Briefing inicial em DRAFT
```

`ContentPortfolioPlanner`, `BriefGenerator` e os gates de qualidade/variedade são capabilities internas da Commerce Intelligence Engine. Não existe um segundo engine peer responsável por assumir a Strategy e produzir Plan/Briefs.

### Content Operations

Responsável a partir do momento em que existem conteúdos revisáveis:

```text
revisão
edição
regeneração
versionamento operacional
aprovação
descarte
RecordingBatch
Agenda
Estúdio
execução
histórico operacional
```

### App Shell / Activity Indicator

Responsável por comunicar:

```text
job ativo
produto processado
etapa atual
sucesso
falha
ação seguinte
```

Nenhuma dessas camadas deve assumir a responsabilidade da outra.

---

## 26. Estados conceituais

### Product

Durante esse fluxo, a interface pode derivar uma dimensão de **readiness da inteligência** a partir do job e dos resultados existentes:

```text
PENDING
ANALYZING
READY
FAILED
```

Essa dimensão não deve ser confundida com o lifecycle do Produto, como `ACTIVE` ou `ARCHIVED`. O MVP pode derivar readiness de `CommerceIntelligenceJob`/`ProductStrategy` em vez de persistir um enum monolítico no Product.

Na UI, o filtro `Pendentes` pode representar Produtos cujo fluxo inicial ainda não atingiu `READY`.

### Job

```text
QUEUED
RUNNING
SUCCEEDED
FAILED
CANCELLED
```

### Content

Depois da conclusão bem-sucedida do job, os conteúdos entram no workflow de revisão como:

```text
DRAFT
APPROVED
DISCARDED
```

`APPROVED` e `DISCARDED` são decisões posteriores do creator em Content Operations; a Engine entrega o conteúdo inicialmente em `DRAFT`.

Os estados do job não devem se misturar com os estados de revisão do Content nem com os estados derivados do lote no Estúdio.

---

## 27. Experiência desejada

### Caminho normal

```text
Home
↓
colar URL
↓
Analisar produto
↓
produto encontrado
↓
Confirmar produto
↓
✦ Entendendo o produto...
↓
✦ Identificando públicos relevantes...
↓
✦ Entendendo dores e desejos...
↓
✦ Mapeando objeções...
↓
✦ Definindo a melhor estratégia...
↓
✦ Preparando os Briefings do Conteúdo...
↓
✓ Produto pronto
↓
Briefings para revisão
```

### Enquanto processa

O usuário pode continuar usando a aplicação normalmente.

### Resultado

O próximo momento em que o sistema exige decisão do usuário é quando existem Briefings reais para:

```text
Editar
Regenerar
Descartar
Aprovar
```

---

## 28. Fora do escopo do MVP

Não incluir nesta frente:

* fila visual de múltiplas análises por usuário;
* múltiplos jobs concorrentes para o mesmo usuário;
* prioridade manual de jobs;
* drag and drop da fila;
* análise estratégica como wizard de múltiplas telas;
* aprovação obrigatória de cada parte da estratégia;
* percentual de progresso estimado sem base real;
* ETA inventado;
* streaming de Briefings parciais como resultado final;
* logs da engine para o usuário;
* exposição de prompts internos;
* edição da estratégia durante o job;
* Google Calendar;
* Estúdio;
* Agenda de gravação;
* publicação ou social scheduling.

Essas últimas superfícies pertencem às etapas posteriores do produto e não ao processamento inicial descrito aqui.

---

## 29. Evoluções futuras

Depois de validar o comportamento real de creators, podem ser avaliados:

### Fila de análises

```text
1 executando
N aguardando
```

### Central compacta de atividades

```text
✦ Mini Aspirador · Criando briefings
+ 2 análises aguardando
```

### Notificações

Aviso in-app, push ou outros canais quando uma análise terminar.

### Priorização

Permitir alterar prioridade somente se existir evidência de uso que justifique essa complexidade.

Nenhuma dessas evoluções deve ser implementada antecipadamente no MVP.

---

## 30. Critérios de aceite

A funcionalidade está pronta quando:

1. usuário consegue iniciar a importação por URL;
2. ProductCandidate é apresentado para confirmação;
3. usuário consegue editar fatos antes de confirmar;
4. confirmar persiste o Product;
5. confirmar inicia automaticamente o CommerceIntelligenceJob;
6. não existe aprovação obrigatória de estratégia durante o fluxo inicial;
7. App Shell mostra um indicador global enquanto o job está ativo;
8. indicador mostra Produto e etapa real atual;
9. indicador aparece nas principais superfícies autenticadas;
10. usuário pode navegar normalmente durante o processamento;
11. `Analisar produto` não inicia outro job enquanto houver um ativo;
12. sistema não apresenta percentual ou ETA falsos;
13. job sobrevive à navegação e ao fechamento da aba;
14. reabrir a aplicação restaura o estado do job;
15. Product aparece como pendente enquanto a inteligência trabalha;
16. resultados parciais não aparecem como Briefings concluídos;
17. sucesso persiste Strategy, Content Plan e Content Briefs;
18. sucesso libera nova análise;
19. usuário que permaneceu no contexto pode seguir naturalmente aos Briefings;
20. usuário que navegou para outra área não é redirecionado à força;
21. estado concluído oferece `Revisar conteúdos`;
22. falha preserva Product e fatos confirmados;
23. retry não duplica Briefings nem consumo por erro técnico;
24. Briefings finais podem ser editados, regenerados, descartados e aprovados;
25. estratégia continua consultável depois dentro da página do Produto.

---

## 31. Regra final

O fluxo não deve ensinar ao usuário como a Commerce Intelligence funciona internamente.

Ele deve comunicar apenas o necessário para manter confiança e continuidade:

> **“Recebi seu produto, estou trabalhando nele e vou avisar quando existir algo útil para você revisar.”**

A complexidade estratégica permanece na engine.

A próxima decisão relevante do creator deve acontecer somente quando os Briefings estiverem prontos.
