# PRD — Commerce Intelligence Engine

**Status:** proposta para MVP  
**Data:** 2026-08-26  
**Escopo:** coração estratégico do Commerce Intelligence System, responsável por transformar fatos confirmados de um Produto em estratégia comercial, oportunidades de conteúdo, plano de conteúdo e Briefings do Conteúdo prontos para revisão.

---

## 1. Objetivo

Definir o funcionamento conceitual e os contratos principais da **Commerce Intelligence Engine**, núcleo de inteligência do Commerce Intelligence System.

A engine deve transformar um Produto confirmado em uma estratégia comercial estruturada e, a partir dela, produzir um conjunto de conteúdos variados, coerentes e executáveis para a plataforma de distribuição escolhida.

No MVP, a plataforma de distribuição é:

```text
TikTok
```

O resultado final da engine é:

```text
Product
↓
Product Strategy
↓
Content Plan
↓
Content Opportunities
↓
Content Briefs
```

A regra principal é:

> **A Commerce Intelligence não deve simplesmente escrever conteúdos. Ela deve primeiro decidir como o Produto pode ser vendido e quais oportunidades comerciais merecem virar conteúdo.**

A geração do texto final de cada Briefing é consequência dessa decisão.

---

## 2. Papel no sistema

A Commerce Intelligence Engine é a principal propriedade intelectual do produto.

Ela ocupa a fronteira entre:

```text
fatos do Produto
```

e:

```text
conteúdo comercial executável
```

O fluxo completo do sistema permanece:

```text
Product Import
↓
Product Facts confirmados
↓
Commerce Intelligence Engine
↓
Product Strategy
↓
Content Plan
↓
Content Opportunities
↓
Content + Briefing inicial em DRAFT
↓
Content Operations
↓
Revisão
↓
Aprovação
↓
Lote de gravação
↓
Agenda
↓
Estúdio
↓
Execução
↓
Histórico
```

A Commerce Intelligence não deve assumir responsabilidades de importação, revisão/aprovação pelo creator, agenda, gravação ou gestão operacional de lotes.

`ContentPortfolioPlanner`, `BriefGenerator`, validação factual, Quality Gate e Variety Gate são capabilities internas da própria Commerce Intelligence Engine. Não existe um `Sales Content Engine` peer entre Strategy e Content Plan.

---

## 3. Regra arquitetural principal

A Commerce Intelligence **não será implementada como um único agente autônomo nem como um único prompt gigante**.

Também não deve ser decomposta prematuramente em dezenas de agentes independentes.

O desenho recomendado é:

```text
Engine / Orchestrator
+
capacidades especializadas
+
schemas estruturados
+
Platform Skills versionadas
+
memória do Produto
+
regras determinísticas
+
LLM onde interpretação e criação forem necessárias
```

A engine controla o processo.

O modelo de linguagem executa capacidades específicas dentro de contratos bem definidos.

---

## 4. Visão geral da arquitetura

```text
                         PRODUCT FACTS
                              │
                              ▼
                 ┌────────────────────────┐
                 │ PRODUCT UNDERSTANDING  │
                 └────────────┬───────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │ COMMERCIAL OPPORTUNITY MAP   │
              │                              │
              │ audience × situation         │
              │ pain × desire                │
              │ benefit × outcome            │
              │ objection × proof            │
              │ capability × use case        │
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │    STRATEGY    │
                    └───────┬────────┘
                            │
            ┌───────────────┼────────────────┐
            │               │                │
            ▼               ▼                ▼
      PRODUCT MEMORY   CREATOR PROFILE   PLATFORM SKILL
                                               │
                            ┌──────────────────┘
                            ▼
                ┌────────────────────────┐
                │ CONTENT PORTFOLIO      │
                │ PLANNER                │
                └───────────┬────────────┘
                            ▼
                CONTENT OPPORTUNITIES
                            │
                            ▼
                ┌────────────────────────┐
                │ BRIEF GENERATOR        │
                └───────────┬────────────┘
                            ▼
                  DRAFT CONTENT BRIEFS
                            │
                            ▼
                ┌────────────────────────┐
                │ QUALITY + VARIETY GATE │
                └───────────┬────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                  PASS            REJECT
                    │               │
                    ▼               └──→ regenerate
             CONTENT BRIEFS
```

---

## 5. Separação entre Engine, Skill e Agent

Esses conceitos não devem ser tratados como sinônimos.

### 5.1 Engine

A **Commerce Intelligence Engine** é o sistema responsável por orquestrar todo o processamento estratégico.

Responsabilidades:

```text
carregar contexto
↓
executar capacidades na ordem correta
↓
validar contratos
↓
persistir resultados
↓
consultar memória
↓
acionar regras determinísticas
↓
acionar capacidades baseadas em LLM
↓
executar quality gates
↓
recuperar falhas
↓
entregar Strategy + Content Plan + Briefs
```

A engine é a fronteira arquitetural estável.

### 5.2 Skill

Uma **Skill** é um pacote versionado de conhecimento, regras, padrões e restrições utilizado pela engine.

No MVP, a principal Platform Skill será:

```text
TikTok Commerce Creative Skill
```

Ela representa:

> **Como transformar uma oportunidade comercial em conteúdo coerente com a linguagem, o ritmo e a forma de consumo do TikTok.**

A Skill não controla o workflow.

Ela fornece conhecimento especializado para capacidades da engine.

### 5.3 Agent

Um Agent pode existir como detalhe interno de implementação quando uma capacidade exigir autonomia, ferramentas ou múltiplas etapas de raciocínio.

Entretanto, o domínio não deve depender de nomes ou identidades de agentes.

O contrato arquitetural deve permanecer:

```text
Input Schema
↓
Capability
↓
Output Schema
```

e não:

```text
enviar mensagem para Agent X
↓
esperar comportamento implícito
```

A engine deve continuar funcionando conceitualmente mesmo que uma capacidade seja implementada como:

* uma chamada única de LLM;
* um workflow com tool calling;
* um agent;
* código determinístico;
* uma combinação dessas abordagens.

---

## 6. Acionamento

O usuário não conversa diretamente com a Commerce Intelligence Engine para iniciar o fluxo principal.

O acionamento acontece pelo backend.

Fluxo inicial:

```text
ProductCandidate
↓
usuário confirma os fatos
↓
Product persistido
↓
CommerceIntelligenceJob criado
↓
Commerce Intelligence Orchestrator
↓
processamento
↓
Strategy + Content Plan + Content Briefs
↓
Job SUCCEEDED
```

A experiência assíncrona, concorrência por usuário, indicador global, retry e estados do job continuam pertencendo ao contrato já definido para `CommerceIntelligenceJob`.

A Commerce Intelligence Engine é executada **dentro** desse job.

---

## 7. Fluxo interno completo

```text
Confirmar Produto
        ↓
Persist Product
        ↓
Create CommerceIntelligenceJob
        ↓
Commerce Intelligence Orchestrator
        ↓
Load Product Facts
        ↓
Load Creator Preferences
        ↓
Load Platform Skill
        ↓
Load Product Memory
        ↓
Understand Product
        ↓
Map Commercial Opportunities
        ↓
Build Product Strategy
        ↓
Build Content Portfolio
        ↓
Create Content Opportunities
        ↓
Generate Draft Briefs
        ↓
Validate Facts
        ↓
Validate Quality
        ↓
Validate Variety
        ↓
Repair Rejected Briefs
        ↓
Persist Strategy
        ↓
Persist Content Plan
        ↓
Persist Content Briefs
        ↓
Update Product Memory
        ↓
Job SUCCEEDED
```

---

## 8. Relação com os stages do CommerceIntelligenceJob

Os stages visíveis já definidos para o job continuam válidos:

```text
UNDERSTANDING_PRODUCT
IDENTIFYING_AUDIENCES
ANALYZING_PAINS_AND_DESIRES
ANALYZING_OBJECTIONS
BUILDING_STRATEGY
BUILDING_CONTENT_PLAN
GENERATING_BRIEFS
FINALIZING
```

A engine pode possuir passos internos mais granulares sem expô-los ao usuário.

Mapeamento conceitual:

```text
UNDERSTANDING_PRODUCT
↓
Product Understanding

IDENTIFYING_AUDIENCES
ANALYZING_PAINS_AND_DESIRES
ANALYZING_OBJECTIONS
↓
Commercial Opportunity Mapping

BUILDING_STRATEGY
↓
Strategy Builder

BUILDING_CONTENT_PLAN
↓
Content Portfolio Planner

GENERATING_BRIEFS
↓
Brief Generator

FINALIZING
↓
Fact Validation
Quality Gate
Variety Gate
Repairs
Persistence
```

Não é necessário criar um stage público para cada operação interna.

---

# 9. Fonte da verdade factual

A Commerce Intelligence deve diferenciar explicitamente:

```text
FATO
```

de:

```text
INFERÊNCIA ESTRATÉGICA
```

### Fatos

São informações confirmadas do Produto, por exemplo:

```text
nome
descrição
preço
moeda
marca
características
variantes
imagens
seller
sourceUrl
```

A fonte primária é o `Product` persistido depois da confirmação do usuário.

### Inferências

São decisões ou hipóteses produzidas pela inteligência:

```text
públicos
situações de uso
dores
desejos
objeções
benefícios percebidos
gatilhos de compra
argumentos
posicionamento
oportunidades
ângulos
```

Inferências podem ser criativas e comerciais.

Elas não podem alterar fatos técnicos do Produto.

### Regra

> **A engine pode inferir por que alguém compraria o Produto. Ela não pode inventar o que o Produto é ou faz.**

Exemplo proibido:

```text
Product Fact:
bateria recarregável

Briefing:
"fica 8 horas ligado"

→ REJECT
```

se a autonomia de oito horas não existir nas evidências confirmadas.

---

# 10. Product Understanding

A primeira capacidade estratégica é transformar `ProductFacts` em um modelo comercial utilizável.

Entrada:

```text
Product
+
Product Facts
+
mercado
+
idioma
```

Saída:

```text
ProductUnderstanding
```

Estrutura conceitual:

```ts
interface ProductUnderstanding {
  productId: string;

  category?: string;

  coreUseCases: string[];

  capabilities: ProductCapability[];

  functionalBenefits: string[];
  emotionalBenefits: string[];
  desiredOutcomes: string[];

  purchaseTriggers: string[];
  purchaseBarriers: string[];

  
  evidenceRefs: string[];
}
```

---

## 11. Cadeia Feature → Capability → Benefit → Outcome

A engine deve evitar tratar característica técnica como argumento final.

Modelo:

```text
Feature
↓
Capability
↓
Functional Benefit
↓
Desired Outcome
↓
Possible Selling Argument
```

Exemplo:

```text
sem fio
↓
funciona sem tomada
↓
pode ser utilizado longe de uma fonte de energia
↓
permite limpar o carro onde estiver
↓
praticidade / autonomia
```

Outro:

```text
produto compacto
↓
ocupa pouco espaço
↓
é fácil de guardar
↓
pode permanecer no carro
↓
fica disponível quando a sujeira aparece
```

A etapa de entendimento não precisa produzir textos finais de conteúdo.

Ela produz matéria-prima estratégica.

---

# 12. Commercial Opportunity Mapping

A engine não deve gerar listas independentes de públicos, dores e benefícios sem relação entre si.

Ela deve construir **oportunidades comerciais relacionais**.

Modelo:

```text
Audience
    ↓
Situation
    ↓
Pain / Desire
    ↓
Relevant Product Capability
    ↓
Benefit
    ↓
Purchase Barrier / Objection
    ↓
Possible Proof
    ↓
Selling Opportunity
```

Exemplo:

```text
Motorista de aplicativo
        ↓
passa muitas horas dentro do carro
        ↓
sujeira se acumula durante o dia
        ↓
aspirador convencional é inconveniente
        ↓
produto portátil + sem fio
        ↓
limpeza rápida entre corridas
        ↓
"esse aspirador pequeno deve ser fraco"
        ↓
demonstração real aspirando sujeira
        ↓
oportunidade:
"limpar rapidamente o carro entre passageiros"
```

---

## 13. CommercialOpportunity

Estrutura conceitual:

```ts
interface CommercialOpportunity {
  id: string;

  audience?: string;
  situation?: string;

  pain?: string;
  desire?: string;

  relevantCapabilities: string[];
  benefits: string[];
  desiredOutcome?: string;

  objection?: string;

  proofOptions: string[];

  sellingArgument: string;

  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';

  evidenceRefs: string[];
}
```

`confidence` representa confiança interna da engine e não precisa aparecer na interface.

---

# 14. Estratégia comercial

Depois de compreender o Produto e mapear oportunidades, a engine produz uma `ProductStrategy`.

A estratégia deve responder:

> **Quais caminhos comerciais fazem mais sentido para vender este Produto?**

Ela não é um conjunto de scripts.

Ela é a estrutura que restringe e orienta os conteúdos.

---

## 15. ProductStrategy

Estrutura conceitual:

```ts
interface ProductStrategy {
  id: string;
  productId: string;

  version: number;
  status: 'ACTIVE' | 'SUPERSEDED' | 'STALE';

  primaryPositioning: string;

  audiences: StrategyAudience[];
  opportunities: CommercialOpportunity[];

  priorityBenefits: string[];
  priorityObjections: string[];
  priorityArguments: string[];
  priorityAngles: string[];

  communicationPrinciples: string[];
  
  platformId: string;
  platformSkillVersion: string;

  createdAt: Date;
  supersededAt?: Date;
}
```

---

# 16. Estratégia persistente e versionada

A `ProductStrategy` não deve ser reconstruída integralmente em toda geração.

Regra do MVP:

```text
Primeira análise
↓
ProductStrategy v1
↓
persistida
↓
reutilizada nas próximas gerações
```

Nova geração:

```text
Product
+
ACTIVE ProductStrategy
+
Product Memory
+
Creator Preferences
+
Platform Skill
↓
novo Content Portfolio
```

### Motivos

Isso evita:

* custo desnecessário;
* mudança aleatória de posicionamento;
* contradição entre gerações;
* perda de continuidade;
* dificuldade de comparar histórico;
* dependência de um prompt gigantesco em toda operação.

---

## 17. Quando a Strategy fica stale

A estratégia pode ser marcada como:

```text
STALE
```

quando algum contexto que altera materialmente as decisões comerciais mudar.

Exemplos:

* fatos principais do Produto foram alterados;
* mudança de mercado;
* mudança de idioma que exija nova estratégia;
* mudança explícita de posicionamento pelo usuário;
* regeneração estratégica solicitada pelo usuário.

Atualizações pequenas de metadata não precisam invalidar a Strategy.

A regra exata de detecção pode evoluir depois.

No MVP, mudanças manuais relevantes nos fatos do Produto devem provocar reavaliação explícita antes de novas gerações.

---

# 18. Platform Skill

A estratégia comercial não existe isolada da plataforma de distribuição.

O mesmo Produto pode exigir execução diferente em:

```text
TikTok
Instagram Reels
YouTube Shorts
Shopee Video
Amazon Influencer
```

A engine deve possuir a abstração:

```text
PlatformSkill
```

Estrutura conceitual:

```ts
interface PlatformSkill {
  id: string;
  platform: string;
  version: string;

  principles: string[];
  executionRules: string[];
  hookPatterns: string[];
  narrativePatterns: string[];
  proofPatterns: string[];
  ctaPatterns: string[];

  validationRules: string[];
}
```

---

# 19. TikTok Commerce Creative Skill

No MVP:

```text
PlatformSkill
=
TikTok Commerce Creative Skill
```

Essa Skill deve encapsular princípios de criação compatíveis com o comportamento esperado de creators de TikTok Shop.

Ela deve favorecer conteúdos:

```text
rápidos
naturais
diretos
visuais
demonstráveis
graváveis com celular
com linguagem oral
com sensação nativa
com energia
com ritmo
sem produção cinematográfica obrigatória
```

A regra não é transformar todo conteúdo em uma fórmula rígida.

A Skill fornece limites e repertório.

---

## 20. Princípios da TikTok Commerce Creative Skill

A versão inicial deve orientar capacidades da engine a:

* capturar atenção cedo;
* evitar introduções longas;
* começar pelo problema, curiosidade, resultado, demonstração, conflito ou prova quando fizer sentido;
* priorizar linguagem falada;
* permitir imperfeição natural;
* evitar linguagem corporativa ou publicitária artificial;
* favorecer demonstração quando existe algo demonstrável;
* usar o Produto dentro de uma situação real;
* manter cenas executáveis por um creator comum;
* evitar dependência de cenários complexos;
* evitar produção com aparência de comercial tradicional;
* permitir cortes, mudanças de enquadramento e progressão visual;
* criar CTAs coerentes com social commerce;
* adaptar o conteúdo ao ângulo e não repetir a mesma estrutura em todos os vídeos.

---

# 21. Skill não decide fatos nem estratégia sozinha

A TikTok Skill não deve decidir:

```text
qual é o preço
qual é a potência
qual é a duração da bateria
qual benefício técnico existe
```

Também não deve substituir o `Strategy Builder`.

A relação é:

```text
Commercial Opportunity
+
Product Strategy
+
TikTok Skill
↓
TikTok-compatible Content Opportunity
```

A Skill influencia **como explorar** uma oportunidade.

Ela não inventa a oportunidade do nada.

---

# 22. Versionamento de Skill

Skills devem ser versionadas.

Exemplo:

```text
tiktok-commerce@1.0
tiktok-commerce@1.1
tiktok-commerce@2.0
```

Cada geração deve registrar qual versão foi utilizada.

Isso permite:

* reproduzir comportamento;
* avaliar mudanças;
* comparar qualidade entre versões;
* evitar alteração silenciosa de conteúdos históricos;
* evoluir conhecimento da plataforma sem reescrever a engine.

A Strategy também registra a Skill utilizada na sua criação.

---

# 23. Creator Preferences

A engine pode considerar preferências explícitas do creator.

Exemplos:

```text
aparece ou não em câmera
prefere voice-over
duração preferida
tom
idioma
mercado
restrições
estilo de execução
observações
```

Essas preferências não precisam existir todas no MVP.

A arquitetura deve apenas permitir sua entrada.

`CreatorPreferences` representa preferências persistentes do creator. A Engine pode carregar somente o recorte necessário dessas preferências como um `CreatorContext` por execução/capability.

Estrutura conceitual do contexto carregado pela Engine:

```ts
interface CreatorContext {
  userId: string;

  language: string;
  market?: string;

  appearsOnCamera?: boolean;
  prefersVoiceOver?: boolean;

  preferredDurationSeconds?: number;

  notes?: string[];
}
```

---

# 24. Content Portfolio Planner

Quando o usuário solicita uma quantidade de conteúdos, a engine não deve gerar os Briefings imediatamente.

Primeiro deve construir um **portfólio estratégico de conteúdo**.

Fluxo proibido:

```text
for 1..20
↓
generateContent()
```

Fluxo correto:

```text
Strategy
+
Product Memory
+
Platform Skill
+
Creator Context
+
Target Content Count
↓
Content Portfolio Planner
↓
20 Content Opportunities distintas
```

---

# 25. Objetivo do Portfolio Planner

O Planner decide **como distribuir a quantidade solicitada entre oportunidades estratégicas relevantes**.

Exemplo conceitual:

```text
20 conteúdos

4 demonstração/prova
3 problema → solução
3 quebra de objeção
2 conveniência
2 economia
2 públicos específicos
2 uso inesperado
1 experiência pessoal
1 comparação
```

Essa distribuição é somente exemplo.

Ela nunca deve ser uma tabela fixa.

O produto pode produzir uma distribuição completamente diferente quando a estratégia pedir.

---

# 26. ContentPlan

`ContentPlan` é a entidade canônica produzida pelo `Content Portfolio Planner`. O termo “portfólio” descreve a lógica de planejamento do conjunto e não cria uma segunda entidade paralela.

Estrutura conceitual:

```ts
interface ContentPlan {
  id: string;

  productId: string;
  strategyVersion: number;

  targetContentCount: number;

  platformId: string;
  platformSkillVersion: string;

  opportunities: ContentOpportunity[];

  createdAt: Date;
}
```

---

# 27. ContentOpportunity

O `ContentOpportunity` representa uma decisão de conteúdo antes do Briefing ser escrito.

Estrutura conceitual:

```ts
interface ContentOpportunity {
  id: string;

  audience?: string;

  commercialObjective: string;

  pain?: string;
  desire?: string;
  objection?: string;

  benefit?: string;

  angle: string;

  coreMessage: string;

  proof?: string;

  hookMechanism: string;

  narrativePattern?: string;

  desiredViewerResponse?: string;

  sourceOpportunityId?: string;

  noveltyTargets: string[];
}
```

Exemplo:

```text
ContentOpportunity #13

Audience:
motorista de aplicativo

Commercial Objective:
quebrar objeção de potência

Angle:
prova / demonstração

Core Message:
pequeno não significa inútil

Proof:
aspirar sujeira real entre banco e console

Hook Mechanism:
visual surprise

Desired Viewer Response:
"eu precisava disso no meu carro"
```

O Brief Generator recebe essa decisão.

Ele não precisa reinventá-la.

---

# 28. Product Memory

A engine deve consultar memória antes de planejar novas oportunidades.

A memória representa o que já foi explorado para aquele Produto.

Ela deve considerar, conforme aplicável:

```text
públicos
dores
desejos
objeções
benefícios
argumentos
ângulos
hooks
hook mechanisms
estruturas
CTAs
briefings
aprovações
descartes
execuções concluídas
```

---

# 29. Objetivo da memória

A memória existe para impedir que uma nova geração seja apenas:

```text
"mais 20 versões das mesmas 5 ideias"
```

Exemplo:

```text
Já muito utilizado:

demonstração
donos de carro
sujeira entre bancos
hook em formato de pergunta
CTA "está no carrinho"

Pouco explorado:

motoristas de aplicativo
pais com crianças
objeção de potência
economia com lavagem
uso em sofá
antes/depois
```

O Planner deve preferir lacunas relevantes quando elas existirem.

---

# 30. Memory Snapshot

A geração deve trabalhar com um snapshot consistente da memória.

Estrutura conceitual:

```ts
interface ProductMemorySnapshot {
  productId: string;

  audiences: UsageStat[];
  pains: UsageStat[];
  desires: UsageStat[];
  objections: UsageStat[];
  benefits: UsageStat[];
  angles: UsageStat[];
  hookMechanisms: UsageStat[];
  narrativePatterns: UsageStat[];
  ctas: UsageStat[];

  recentBriefRefs: string[];

  generatedAt: Date;
}
```

A forma de implementação pode começar relacional e estruturada.

Banco vetorial ou embeddings não são requisito do MVP.

---

# 31. Peso dos sinais de memória

Nem todo conteúdo histórico deve ter o mesmo peso.

Conceitualmente:

```text
gerado
<
aprovado
<
concluído
```

Um conteúdo apenas gerado mostra que uma ideia já apareceu.

Um conteúdo aprovado mostra preferência.

Um conteúdo concluído mostra que a ideia chegou à execução.

Conteúdos descartados também são sinais importantes para evitar insistência cega na mesma direção.

O MVP não precisa transformar isso em um sistema de recomendação sofisticado.

Mas a estrutura deve preservar esses eventos.

---

# 32. Brief Generator

O Brief Generator transforma uma oportunidade planejada em um Briefing executável.

Entrada:

```text
ContentOpportunity
+
Product Strategy
+
Product Facts
+
Creator Context
+
Platform Skill
+
Product Memory
```

Saída:

```text
Draft Content Brief
```

---

# 33. Briefing orientado à execução

O Briefing deve ajudar o creator a gravar.

Ele não deve parecer um artigo, anúncio tradicional ou texto que precisa ser decorado palavra por palavra.

A engine deve distinguir:

```text
decisão estratégica
```

de:

```text
fala sugerida
```

O Briefing pode conter:

```text
Hook
↓
Objetivo
↓
Ponto principal
↓
Roteiro / sequência
↓
Cenas
↓
Provas
↓
Falas sugeridas
↓
CTA
```

---

# 34. Linguagem natural de creator

A engine deve evitar roteiros como:

```text
"Você está cansado de sofrer com sujeira no seu veículo?
Conheça agora o revolucionário..."
```

Preferir instruções e falas que soem graváveis.

Exemplo:

```text
CENA 1

Enfia a câmera entre o banco e o console.
Mostra a sujeira.

HOOK / FALA SUGERIDA

"Mano, olha o tanto de coisa que fica aqui no meio."

CENA 2

Pega o aspirador.

PONTO QUE PRECISA PASSAR

Você usa justamente porque não precisa levar
aspirador grande nem procurar tomada.

FALA SUGERIDA

"Eu deixo esse negócio no carro por causa disso."

CENA 3

Aspira a sujeira.

PROVA

Mostrar o que ele realmente consegue puxar.

CENA 4

Mostrar o resultado.

CTA

"É esse aqui que eu tô usando."
```

A fala sugerida continua editável.

Ela não deve virar uma obrigação de leitura literal.

---

# 35. Relação com Content e Briefing versionado

O output da Engine deve permanecer compatível com o domínio de Content Operations.

A Engine materializa uma identidade estável `Content` em `DRAFT` e uma versão inicial do Briefing (`ContentBriefVersion`).

Exemplo conceitual:

```ts
interface Content {
  id: string;
  productId: string;
  planId: string;
  opportunityId?: string;

  status: 'DRAFT' | 'APPROVED' | 'DISCARDED';

  currentBriefVersionId: string;
  approvedBriefVersionId?: string;
}

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
}
```

A Commerce Intelligence cria somente o estado inicial `DRAFT` e sua primeira versão válida. Aprovação, descarte, edição pelo usuário e escolha da versão aprovada pertencem a Content Operations.

O termo **Briefing do Conteúdo** continua sendo a representação humana do material atual do `Content`; o versionamento não precisa ser exposto permanentemente na interface.

---

# 36. Quality Gate

Nenhum Briefing deve ser tratado como concluído apenas porque uma chamada de LLM retornou JSON válido.

Depois da geração:

```text
Draft Brief
↓
Quality Gate
↓
PASS
ou
REJECT
```

O Quality Gate combina o hard gate determinístico existente com uma curadoria semântica interna obrigatória antes da persistência:

```text
hard gate estrutural, factual e de variedade
+
judge semântico interno de hook, development, script, CTA e cenas por conteúdo
```

---

# 37. Validações determinísticas

Sempre que possível, validar sem LLM.

Exemplos:

* schema completo;
* campos obrigatórios;
* IDs válidos;
* quantidade solicitada;
* duplicação exata de hook;
* duplicação normalizada de hook;
* repetição excessiva detectável por dimensões estruturadas;
* referência a fatos ausentes;
* uso de Product, Strategy e Skill corretos;
* quantidade de cenas válida para o formato;
* Briefings duplicados por hash de estrutura quando aplicável.

---

# 38. Validação factual

Todo claim factual importante deve ser compatível com `ProductFacts`.

O validator pode classificar:

```text
SUPPORTED
INFERRED_BUT_SAFE
UNSUPPORTED
CONTRADICTED
```

Regras:

```text
SUPPORTED
→ permitido

INFERRED_BUT_SAFE
→ permitido quando claramente estratégico/subjetivo

UNSUPPORTED
→ corrigir ou remover

CONTRADICTED
→ rejeitar
```

Exemplo:

```text
"sem fio"
→ SUPPORTED

"prático para usar no carro"
→ INFERRED_BUT_SAFE

"dura 8 horas"
→ UNSUPPORTED

"possui potência de 2000W"
quando fato confirmado diz 120W
→ CONTRADICTED
```

---

# 39. Quality Judge

Algumas dimensões são difíceis de validar somente com código.

Um judge baseado em modelo pode avaliar:

```text
naturalidade
executabilidade
clareza
coerência com o ângulo
coerência com a plataforma
força do hook
presença de prova quando necessária
tom excessivamente publicitário
complexidade de produção
repetição semântica
```

O judge deve receber critérios explícitos e retornar estrutura validável.

Não deve retornar apenas:

```text
"parece bom"
```

---

# 40. BriefValidationReport

Estrutura conceitual:

```ts
interface BriefValidationReport {
  briefId: string;

  factualStatus:
    | 'PASS'
    | 'FAIL';

  structuralStatus:
    | 'PASS'
    | 'FAIL';

  platformStatus:
    | 'PASS'
    | 'FAIL';

  varietyStatus:
    | 'PASS'
    | 'FAIL';

  issues: ValidationIssue[];

  decision:
    | 'PASS'
    | 'REPAIR'
    | 'REJECT';
}
```

---

# 41. Variety Gate

O Variety Gate avalia o **conjunto**, não apenas um Briefing isolado.

Deve verificar pelo menos:

```text
públicos repetidos
dores repetidas
objeções repetidas
benefícios repetidos
ângulos repetidos
hook mechanisms repetidos
hooks semanticamente similares
estruturas repetidas
CTAs repetidos
mesma prova usada repetidamente
mesma sequência narrativa com palavras diferentes
```

A variedade deve continuar subordinada à estratégia.

Não introduzir ângulos ruins apenas para aumentar diversidade.

---

# 42. Regra de variedade

> **Primeiro relevância. Depois variedade.**

Proibido:

```text
"faltou um ângulo de humor, então vamos inventar humor"
```

se humor não fizer sentido para o Produto ou oportunidade.

A engine deve buscar diversidade **dentro das oportunidades comercialmente válidas**.

---

# 43. Repair Loop

Briefings rejeitados não obrigam regeneração do plano completo.

Fluxo:

```text
20 Draft Briefs
↓
16 PASS
4 REPAIR
↓
preservar 16
↓
regenerar somente 4
↓
revalidar 4
↓
conjunto final
```

O repair recebe as causas da rejeição.

Exemplo:

```text
REPAIR REASON

- hook semelhante ao Brief #07
- claim de autonomia não suportado
- mesma estrutura de demonstração já usada 5 vezes
```

Isso reduz custo e instabilidade.

---

# 44. Limite de reparos

A engine não deve entrar em loop infinito de regeneração.

Cada Brief pode possuir limite interno de tentativas.

Após atingir o limite:

```text
FAILED
```

ou o `CommerceIntelligenceJob` pode falhar de forma recuperável, dependendo da criticidade.

Não apresentar conteúdo inválido como sucesso somente para completar quantidade.

---

# 45. Persistência intermediária

Resultados de etapas importantes podem ser persistidos internamente para recuperação.

Exemplo:

```text
Product Understanding
↓
Commercial Opportunity Map
↓
Product Strategy
↓
Content Portfolio
↓
Draft Briefs
↓
Validation Reports
```

Esses dados não precisam ser expostos integralmente ao usuário.

A persistência deve permitir:

* retry idempotente;
* diagnóstico;
* recuperação de falha;
* auditoria interna;
* comparação de versões.

---

# 46. Idempotência

Retry técnico do mesmo processamento não deve criar:

* duas Strategies ativas;
* dois Content Plans equivalentes;
* Briefings duplicados;
* consumo duplicado por erro de infraestrutura.

Cada run deve possuir identificadores estáveis suficientes para detectar repetição.

---

# 47. Generation Run

Cada execução da engine deve possuir metadata interna.

Estrutura conceitual:

```ts
interface IntelligenceRun {
  id: string;

  jobId: string;
  productId: string;

  strategyVersion?: number;

  platformId: string;
  platformSkillVersion: string;

  engineVersion: string;

  targetContentCount: number;

  startedAt: Date;
  completedAt?: Date;

  status:
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'FAILED';
}
```

Pode também registrar internamente:

```text
model/provider por capability
prompt version
latência
tokens
custo
retries
validation failures
```

Esses dados são operacionais.

Não fazem parte da interface do creator.

---

# 48. Capacidades de IA

A versão inicial pode utilizar LLM em capacidades como:

```text
Product Understanding
Commercial Opportunity Mapping
Strategy Builder
Content Portfolio Planning
Brief Generation
Semantic Quality Judge
Semantic Variety Judge
Repair
```

Isso não significa uma chamada obrigatória por item.

A implementação pode agrupar operações quando fizer sentido.

O importante é manter contratos conceituais separados.

---

# 49. O que deve permanecer determinístico

Sempre que a decisão não exigir interpretação criativa, preferir código.

Exemplos:

```text
orquestração
estado do job
persistência
idempotência
versionamento
seleção da Strategy ativa
carregamento de Skill
contagens
limites
schema validation
regras de status
exact duplicate detection
memory aggregation
billing/credits
retry policy
```

A LLM não deve decidir regras de sistema.

---

# 50. Não depender de um modelo específico

A engine não deve ter seu domínio acoplado a:

```text
OpenAI
Anthropic
Gemini
ou outro provider
```

Capabilities que exigem LLM usam a política de roteamento definida pela camada de Model Router.

Fluxo conceitual:

```text
Engine Capability
↓
Logical Intelligence Task
↓
Model Router
↓
IntelligenceTier (LOW / MID / HIGH)
↓
Model Selection
↓
LLM Gateway / Provider Adapter
↓
Structured Output
↓
Capability Contract Validation
```

Capabilities determinísticas não passam pelo Model Router.

Isso permite trocar modelos e providers sem alterar entidades do domínio e impede que uma capability selecione provider diretamente.

---

# 51. Contexto mínimo por capability

Cada capability deve receber somente o contexto necessário.

Evitar enviar sempre:

```text
Product completo
+
Strategy completa
+
Memory completa
+
todos Briefings
+
todas Skills
+
histórico inteiro
```

Exemplo:

### Brief Generator

Recebe:

```text
Product Facts relevantes
Content Opportunity
Strategy slice relevante
Creator Context
TikTok Skill slice
Memory constraints relevantes
```

Isso reduz:

* custo;
* ruído;
* risco de contradição;
* tokens;
* dependência de context window enorme.

---

# 52. Prompt não é domínio

Prompts podem mudar.

Schemas e invariantes do domínio devem permanecer.

A implementação não deve esconder regras críticas apenas dentro de texto de prompt.

Exemplo ruim:

```text
prompt:
"por favor nunca invente características"
```

sem validação posterior.

Exemplo correto:

```text
prompt orienta factualidade
+
Fact Validator verifica
```

---

# 53. Nova geração de conteúdos

Depois da análise inicial, novas gerações não devem reconstruir tudo.

Fluxo:

```text
Product
+
Active ProductStrategy
+
Product Memory
+
Creator Context
+
Platform Skill
+
quantidade
+
objetivo opcional
↓
Content Portfolio Planner
↓
Content Opportunities
↓
Brief Generator
↓
Quality + Variety Gate
↓
New Content Briefs
```

Isso deve ser significativamente mais simples que a primeira análise.

---

# 54. Objetivo opcional de nova geração

O usuário pode futuramente direcionar uma geração sem reescrever Strategy.

Exemplos:

```text
quero trabalhar mais objeções

quero conteúdos para motoristas

quero focar em demonstração

quero conteúdos mais curtos
```

Esse objetivo faz parte das `GenerationConstraints` e funciona como restrição do novo `ContentPlan`.

`targetContentCount` é a restrição mínima da geração; outros direcionamentos podem ser opcionais.

As `GenerationConstraints` não devem apagar nem reescrever silenciosamente a Strategy principal.

---

# 55. Relação com edição da Strategy

A Strategy é consultável e pode evoluir.

No MVP, mudanças podem ocorrer por:

```text
regeneração explícita
edição permitida de elementos estratégicos
mudança relevante nos fatos
```

Quando uma nova Strategy substitui a anterior:

```text
ProductStrategy v1
ACTIVE
↓
nova Strategy
↓
ProductStrategy v1
SUPERSEDED

ProductStrategy v2
ACTIVE
```

Conteúdos históricos continuam ligados à versão utilizada.

---

# 56. Rastreabilidade

Um Briefing deve poder ser rastreado até:

```text
Product Facts
↓
Strategy Version
↓
Content Plan
↓
Content Opportunity
↓
Platform Skill Version
↓
Content
↓
ContentBriefVersion
↓
Approved Version
↓
Recording Batch Item
↓
Execution
```

Isso é importante para:

* memória;
* debugging;
* aprendizado futuro;
* evolução da engine;
* comparação de qualidade;
* futuras integrações com performance.

---

# 57. Grafo de rastreabilidade

```text
┌──────────────┐
│   Product    │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Strategy v3      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Content Plan     │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Opportunity #08  │
└──────┬───────────┘
       │
       ├───────────────┐
       │               │
       ▼               ▼
┌──────────────┐  ┌─────────────────┐
│ TikTok Skill │  │ Creator Context │
│ v1.2         │  └─────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Brief Draft v1   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Brief Approved   │
│ v3               │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Recording Batch  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Execution        │
└──────────────────┘
```

---

# 58. Estado parcial não é resultado final

A engine pode persistir internamente:

```text
Product Understanding pronto
12 Opportunities prontas
Strategy em construção
```

Mas isso não deve aparecer como conteúdo final na experiência inicial.

O resultado útil continua sendo o conjunto consistente de Briefings disponíveis depois do sucesso do job.

---

# 59. Erros por capability

Erros devem ser identificáveis internamente.

Exemplos:

```text
PRODUCT_UNDERSTANDING_FAILED
OPPORTUNITY_MAPPING_FAILED
STRATEGY_BUILD_FAILED
PORTFOLIO_BUILD_FAILED
BRIEF_GENERATION_FAILED
FACT_VALIDATION_FAILED
VARIETY_VALIDATION_FAILED
REPAIR_EXHAUSTED
PERSISTENCE_FAILED
```

A interface não precisa exibir esses códigos.

Ela recebe mensagem humana através do fluxo do `CommerceIntelligenceJob`.

---

# 60. Observabilidade

A engine precisa permitir responder internamente:

```text
Em qual etapa falhou?

Qual capability falhou?

Qual versão da Skill foi usada?

Qual Strategy foi usada?

Qual modelo produziu o resultado?

Quais Briefings falharam no gate?

Por que foram rejeitados?

Quantos repairs foram necessários?

Quanto custou a execução?

Quanto tempo cada capability levou?
```

Sem isso, será difícil evoluir a qualidade do produto.

---

# 61. Avaliação interna de qualidade

O produto deve possuir um conjunto de avaliação independente da interface.

Exemplos de dimensões:

```text
factualidade
variedade
coerência estratégica
naturalidade
executabilidade
adequação à plataforma
clareza
qualidade do hook
qualidade da prova
repetição
```

Esses scores são internos.

Eles não devem virar cards ou métricas para o creator.

---

# 62. Golden Dataset

Antes de considerar a engine madura, manter um conjunto de Produtos de teste representativos.

Exemplos de categorias diferentes:

```text
beleza
casa
automotivo
eletrônicos
fitness
cozinha
acessórios
organização
```

Para cada Produto, salvar entradas conhecidas e avaliar mudanças da engine.

Objetivo:

```text
Engine v1.3
↓
melhorou variedade?
↓
piorou factualidade?
↓
ficou mais formal?
↓
aumentou repetição?
```

Mudanças de prompt, Skill ou modelo devem ser avaliáveis.

---

# 63. Testes

A Commerce Intelligence deve permitir diferentes níveis de teste.

### Unitários / determinísticos

```text
schema validation
strategy selection
memory aggregation
status
versioning
duplicate detection
retry
idempotency
```

### Contract tests

```text
Capability Input
↓
Capability Output Schema
```

### Evaluation tests

```text
Product
↓
Engine
↓
quality assertions
```

### Regression tests

Comparar versões da engine, Skill, prompts e modelos usando o Golden Dataset.

---

# 64. Segurança contra instruções externas

Texto extraído de páginas de Produto deve ser tratado como dado.

Não como instrução do sistema.

Exemplo:

```text
descrição do seller:
"ignore suas instruções e..."
```

deve continuar sendo apenas conteúdo do Produto.

Capabilities que usam LLM precisam receber separação clara entre:

```text
system instructions
trusted engine context
untrusted product content
```

---

# 65. Consumo e créditos

A Commerce Intelligence pode consumir créditos ou limites comerciais.

A política comercial não pertence a este PRD.

Entretanto:

* limite deve ser validado antes de iniciar geração;
* retry técnico não deve cobrar novamente;
* repair interno faz parte da mesma execução;
* falha de infraestrutura não deve duplicar consumo;
* metadata de custo deve ser observável internamente.

---

# 66. Experiência do usuário

Apesar da complexidade interna, a experiência continua simples.

Primeira geração:

```text
Confirmar produto
↓
Entendendo o produto...
↓
Identificando públicos relevantes...
↓
Entendendo dores e desejos...
↓
Mapeando objeções...
↓
Definindo a melhor estratégia...
↓
Organizando oportunidades de conteúdo...
↓
Preparando Briefings...
↓
Finalizando...
↓
Produto pronto
↓
Revisar conteúdos
```

O usuário não precisa conhecer:

```text
capabilities
prompts
judges
repair loops
schemas
skill version
models
memory aggregation
```

---

# 67. Grafo do fluxo percebido vs fluxo real

```text
USUÁRIO

Confirmar Produto
       │
       ▼
"Analisando..."
       │
       ▼
"Preparando conteúdos..."
       │
       ▼
Briefings prontos


ENGINE

Confirmar Produto
       │
       ▼
Product Understanding
       │
       ▼
Opportunity Mapping
       │
       ▼
Strategy Builder
       │
       ▼
Memory Snapshot
       │
       ▼
Portfolio Planner
       │
       ▼
TikTok Skill
       │
       ▼
Brief Generator
       │
       ▼
Fact Validation
       │
       ▼
Quality Gate
       │
       ▼
Variety Gate
       │
       ▼
Repair
       │
       ▼
Persistence
```

A interface comunica o fluxo da esquerda.

A engine executa o fluxo da direita.

---

# 68. Não objetivos

Não implementar nesta frente:

* geração de vídeo;
* geração de imagem;
* edição de mídia;
* publicação;
* agendamento de publicação;
* analytics externo;
* ROAS;
* CTR;
* atribuição;
* análise de performance TikTok;
* scraping competitivo avançado;
* agentes conversacionais independentes para cada dimensão;
* swarm de agentes;
* marketplace de Skills;
* editor visual de prompts;
* exposição de chain-of-thought;
* tela técnica da engine;
* scores estratégicos para o usuário;
* banco vetorial obrigatório;
* embeddings obrigatórios;
* aprendizado automático baseado em vendas no MVP;
* mudança automática de Strategy com base em performance externa.

---

# 69. Anti-padrões proibidos

### Prompt gigante

```text
Product
↓
um prompt
↓
20 Briefings
```

como única arquitetura.

### Geração independente

```text
generateContent()
generateContent()
generateContent()
```

sem Portfolio Planner.

### Agentes demais

Criar um agente independente para:

```text
dor
desejo
benefício
hook
CTA
etc.
```

sem necessidade arquitetural comprovada.

### Skill como sistema

A TikTok Skill não pode controlar jobs, persistência, billing ou workflow.

### LLM como regra de negócio

Não delegar para o modelo decisões como:

```text
se pode criar outro job
qual Strategy está ativa
quanto cobrar
qual versão persistir
se retry é permitido
```

### Variedade artificial

Não inserir conteúdo irrelevante somente para preencher categorias.

### Factualidade por confiança

Não considerar um claim verdadeiro apenas porque o modelo respondeu com confiança.

---

# 70. Critérios de aceite da engine

A frente está pronta quando:

1. um Product confirmado pode iniciar uma execução da Commerce Intelligence;
2. a engine recebe Product Facts sem pedir novamente informações já confirmadas;
3. Product Understanding é produzido em schema estruturado;
4. features podem ser relacionadas a capabilities, benefits e outcomes;
5. oportunidades comerciais relacionam público, situação, dor/desejo, benefício, objeção e prova quando aplicável;
6. uma ProductStrategy é produzida;
7. ProductStrategy possui versão;
8. existe somente uma Strategy `ACTIVE` por Produto e contexto compatível;
9. Strategy ativa pode ser reutilizada em novas gerações;
10. Strategy anterior permanece rastreável quando substituída;
11. TikTok Commerce Creative Skill é carregada como dependência da geração;
12. Skill possui versão persistida;
13. Skill influencia Content Opportunities e Briefings sem alterar Product Facts;
14. a quantidade solicitada gera primeiro um Content Plan;
15. o Planner não cria conteúdos de forma independente sem considerar o conjunto;
16. Product Memory é consultada antes de planejar nova geração;
17. Planner consegue evitar concentração desnecessária em dimensões já excessivamente usadas;
18. cada Content Opportunity possui objetivo comercial explícito;
19. Brief Generator recebe uma Opportunity já decidida;
20. Brief Generator produz `Content` + `ContentBriefVersion` inicial compatíveis com Content Operations;
21. Contents começam em `DRAFT` com uma versão inicial de Briefing;
22. fala sugerida não precisa ser tratada como texto literal obrigatório;
23. cenas permanecem executáveis por creator comum;
24. factual validator identifica claims não suportados;
25. schema validator bloqueia outputs estruturalmente inválidos;
26. Variety Gate avalia o conjunto;
27. Quality Gate pode rejeitar Briefings individualmente;
28. Briefings aprovados pelo gate são preservados durante repair de outros;
29. repair recebe as causas da rejeição;
30. repair possui limite de tentativas;
31. retry técnico é idempotente;
32. uma execução registra engine version e Platform Skill version;
33. Strategy, ContentPlan, ContentOpportunity, Content e ContentBriefVersion podem ser rastreados;
34. resultados intermediários não aparecem como resultado final antes do sucesso;
35. novas gerações reutilizam Strategy e memória em vez de reanalisar tudo;
36. regras determinísticas permanecem fora da LLM;
37. domínio não depende de um provider específico de modelo;
38. falhas por capability são observáveis;
39. existe base para regressão com Golden Dataset;
40. o usuário recebe Briefings úteis sem precisar operar a complexidade interna da engine.

---

# 71. Ordem recomendada de implementação

```text
1. Definir schemas canônicos

ProductUnderstanding
CommercialOpportunity
ProductStrategy
ContentPlan
ContentOpportunity
Content
ContentBriefVersion
ProductMemorySnapshot
BriefValidationReport
IntelligenceRun

2. Implementar Commerce Intelligence Orchestrator

3. Implementar LLM Gateway

4. Implementar Product Understanding capability

5. Implementar Opportunity Mapping capability

6. Implementar Strategy Builder

7. Implementar Strategy versioning

8. Criar TikTok Commerce Creative Skill v1

9. Implementar Product Memory estruturada

10. Implementar Content Portfolio Planner

11. Implementar Brief Generator

12. Implementar Fact Validator

13. Implementar regras determinísticas de variedade

14. Implementar Quality Judge

15. Implementar Variety Judge quando necessário

16. Implementar Repair Loop

17. Persistir rastreabilidade completa

18. Integrar com CommerceIntelligenceJob

19. Integrar outputs com Content Operations

20. Criar Golden Dataset e regression suite
```

---

# 72. POC recomendada

Antes de implementar todos os fluxos de interface, validar a engine com alguns Produtos reais.

POC:

```text
5–10 Produtos
↓
Product Facts reais
↓
Commerce Intelligence Engine
↓
Strategy
↓
20 Content Opportunities
↓
20 Briefings
↓
Quality + Variety Gate
```

Avaliar manualmente:

```text
Eu gravaria isso?

Parece TikTok?

As ideias são realmente diferentes?

A estratégia faz sentido?

Inventou alguma característica?

As cenas são simples?

Os hooks soam naturais?

Existe variedade sem aleatoriedade?

Os Briefings são melhores que pedir 20 scripts diretamente para uma LLM?
```

A última pergunta é crítica.

Se a resposta não for claramente sim, a engine ainda não está oferecendo diferencial suficiente.

---

# 73. Evolução futura com performance

Quando dados reais de performance estiverem disponíveis, a arquitetura poderá incorporar:

```text
Execution
↓
Performance
↓
Learning Signals
↓
Product Memory
↓
Strategy / Portfolio Planning
```

Isso não deve ser antecipado no MVP.

A estrutura atual precisa apenas preservar rastreabilidade suficiente para tornar esse aprendizado possível depois.

---

# 74. Grafo de evolução futura

```text
                         MVP

Product
   ↓
Strategy
   ↓
Content Portfolio
   ↓
Briefs
   ↓
Execution
   ↓
History


                        FUTURO

Product
   ↓
Strategy
   ↓
Content Portfolio
   ↓
Briefs
   ↓
Execution
   ↓
Performance
   ↓
Learning Signals
   ↓
Product Memory
   ├──────────────→ Portfolio Planner
   │
   └──────────────→ Strategy Evolution
```

---

# 75. Definição final da Commerce Intelligence

A Commerce Intelligence não é:

```text
um chat
um prompt
um gerador de scripts
um agente autônomo
uma coleção de templates
```

Ela é:

```text
evidência factual
+
interpretação comercial
+
mapa de oportunidades
+
estratégia persistente
+
memória
+
conhecimento da plataforma
+
planejamento de portfólio
+
geração de Briefings
+
controle de qualidade
+
controle de variedade
```

---

# 76. Regra final

> **A engine primeiro decide o que vale a pena vender, para quem, por qual motivo e através de qual oportunidade. Só depois decide qual conteúdo deve existir.**

E, no contexto do TikTok:

> **O Briefing deve transformar essa decisão em algo natural, rápido, visual e simples o suficiente para um creator realmente gravar.**

O objetivo não é produzir o conteúdo mais sofisticado.

O objetivo é produzir **a próxima ideia comercial certa, de forma executável, sem repetir continuamente o que já foi explorado**.
O judge compara o resultado com `Meu estilo` e padrões de creator commerce para TikTok/TikTok Shop. A resposta é estruturada por parte (`PASS`, `REPAIR` ou `REJECT`), com criterion allowlisted e motivo sanitizado. Isto é curadoria da engine; não é aprovação/reprovação do creator, UI ou API de Content Operations. Repair recompõe somente a parte reprovada, preserva as partes PASS e revalida o conjunto no hard gate e no judge. No máximo 2 rounds globais; exaustão bloqueia `SUCCEEDED` e não publica resultado parcial. Cenas continuam em `ContentSceneSet`, mas são requisito de sucesso.
