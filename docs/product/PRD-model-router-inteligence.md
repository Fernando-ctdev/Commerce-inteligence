# PRD — Camada de Inteligência e Roteamento de Modelos

**Status:** proposta para MVP  
**Data:** 2026-08-26  
**Escopo:** uso de modelos de linguagem pela Commerce Intelligence e demais funcionalidades textuais da plataforma.

## 1. Objetivo

Criar uma camada de inteligência capaz de utilizar modelos diferentes conforme a complexidade de cada tarefa, evitando o uso desnecessário de modelos high-end sem comprometer a qualidade estratégica do produto.

A plataforma não deve possuir “um modelo principal”.

Ela deve trabalhar com tiers internos de inteligência:

```text
LOW
MID
HIGH
```

A regra central é:

> **Cada tarefa deve utilizar o menor nível de inteligência capaz de executá-la com a qualidade necessária.**

Modelos e providers concretos podem mudar sem alterar o comportamento do produto.

---

## 2. Problema

As tarefas executadas por IA possuem níveis de dificuldade muito diferentes.

Exemplos simples:

```text
normalizar dados
classificar informações
regenerar um CTA
ajustar um hook
```

não exigem a mesma capacidade de:

```text
compreender comercialmente um produto
definir estratégia
planejar dezenas de conteúdos
garantir variedade estratégica
```

Usar modelos high-end para todas as operações aumentaria desnecessariamente:

- custo;
- consumo de quotas;
- latência;
- dependência de providers caros.

Por outro lado, usar modelos baratos em decisões estratégicas pode reduzir justamente a qualidade que diferencia a Commerce Intelligence de um gerador genérico de conteúdo.

---

## 3. Intelligence Tiers

### LOW

Usado em tarefas simples, estruturadas, de baixa ambiguidade e facilmente verificáveis.

Exemplos:

- normalização de dados;
- classificação;
- transformação para estruturas conhecidas;
- pequenas alterações de texto;
- regeneração de CTA;
- tarefas auxiliares da extração de produtos.

### MID

Usado em tarefas que exigem compreensão contextual, criatividade controlada ou raciocínio comercial intermediário.

Exemplos:

- compreensão inicial do produto;
- identificação de públicos;
- descoberta de dores e desejos;
- identificação de objeções;
- geração de hooks;
- geração de Briefings;
- regeneração de scripts ou ângulos.

### HIGH

Reservado para decisões em que a qualidade do raciocínio afeta diretamente a estratégia do produto ou de um conjunto de conteúdos.

Exemplos:

- síntese da estratégia comercial;
- construção do Content Plan;
- distribuição estratégica dos conteúdos;
- controle global de variedade;
- auditoria final de um conjunto de Briefings.

HIGH deve ser utilizado principalmente para **decidir**, e não para executar repetidamente tarefas simples.

---

## 4. Aplicação na Commerce Intelligence

A Commerce Intelligence deve combinar diferentes níveis durante o mesmo processamento.

Fluxo conceitual:

```text
Produto
↓
Compreensão do produto
MID
↓
Públicos, dores, desejos e objeções
MID
↓
Síntese estratégica
HIGH
↓
Content Plan
HIGH
↓
Geração dos Briefings
MID
↓
Auditoria de variedade e qualidade
HIGH
```

O modelo mais forte não precisa escrever individualmente todos os conteúdos.

A estratégia preferencial é:

```text
HIGH
↓
decide o conjunto

MID
↓
executa os conteúdos

HIGH
↓
avalia o conjunto
```

Isso permite preservar inteligência estratégica enquanto reduz o custo das operações de maior volume.

Essa camada funciona internamente ao `CommerceIntelligenceJob` já definido para transformar um Product confirmado em Strategy, Content Plan e Content Briefs.

---

## 5. Aplicação na importação de produtos

A extração de produtos deve continuar priorizando dados observáveis e mecanismos determinísticos através do Browser Harness.

O LLM entra apenas quando realmente agregar valor.

Fluxo preferencial:

```text
Browser Harness
↓
DOM / Accessibility Tree / Structured Data / Network
↓
extração determinística
↓
LLM quando necessário
↓
ProductCandidate
```

Tarefas como normalizar descrição, consolidar características ou estruturar informações podem utilizar LOW.

A extração não deve utilizar modelos caros para descobrir fatos que já estão disponíveis diretamente na página. Isso preserva a separação já definida entre **Product Import**, responsável por fatos, e **Commerce Intelligence**, responsável pela estratégia.

---

## 6. Roteamento por tarefa

As funcionalidades da plataforma não devem escolher diretamente um modelo específico.

Cada operação solicita uma tarefa lógica, por exemplo:

```text
PRODUCT_UNDERSTANDING
AUDIENCE_DISCOVERY
STRATEGY_SYNTHESIS
CONTENT_PLAN_GENERATION
CONTENT_BRIEF_GENERATION
HOOK_REGENERATION
CTA_REGENERATION
VARIETY_AUDIT
```

Cada tarefa possui um `IntelligenceTier` padrão:

```text
tarefa
↓
LOW / MID / HIGH
↓
modelo disponível
↓
provider disponível
```

A relação entre tarefa e tier deve poder evoluir conforme testes reais de qualidade e custo.

Um modelo novo ou provider novo não deve exigir alterações na lógica da Commerce Intelligence.

### Terminologia canônica

`Capability` fica reservado para uma operação da Engine com contrato explícito de entrada e saída.

`LOW`, `MID` e `HIGH` são valores de `IntelligenceTier`, não capabilities.

A integração conceitual deve ser:

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

Quando uma capability puder ser resolvida de forma determinística, ela não passa pelo Model Router.

---

## 7. Qualidade igual entre planos

LOW, MID e HIGH são classificações internas de execução.

Não representam planos comerciais.

É proibido utilizar algo como:

```text
Plano básico
↓
modelos LOW

Plano premium
↓
modelos HIGH
```

A qualidade estratégica da Commerce Intelligence deve permanecer a mesma entre os planos.

Os planos comerciais podem limitar volume e funcionalidades, mas não oferecer propositalmente uma inteligência estratégica inferior.

Essa regra mantém o princípio já definido no PRD principal de que a engine estratégica é a mesma entre os planos.

---

## 8. Providers e modelos

A plataforma deve permanecer independente de um provider ou modelo específico.

Providers possíveis podem incluir:

```text
OpenRouter
OpenAI
Anthropic
Google
providers diretos
outros compatíveis
```

OpenCode Go pode ser utilizado durante desenvolvimento como ambiente de:

- experimentação;
- comparação de modelos;
- benchmarks;
- evals;
- POCs;
- prompt engineering.

Seu uso como provider da aplicação em produção depende de termos comerciais compatíveis com o atendimento de usuários do SaaS.

Nenhum provider deve se tornar parte da regra de negócio da Commerce Intelligence.

---

## 9. Avaliação dos modelos

A escolha de LOW, MID e HIGH não deve depender apenas de benchmarks públicos ou reputação geral do modelo.

A plataforma precisa avaliar modelos utilizando tarefas reais da Commerce Intelligence.

Os testes devem considerar produtos de diferentes categorias e aspectos como:

- compreensão do produto;
- qualidade dos públicos encontrados;
- dores e objeções;
- raciocínio comercial;
- qualidade da estratégia;
- variedade;
- naturalidade para TikTok;
- qualidade de hooks;
- capacidade de produzir scripts graváveis;
- aderência à estrutura solicitada;
- latência;
- custo;
- confiabilidade.

Um modelo pode ser melhor em uma tarefa e pior em outra.

Portanto, não precisa existir um único ranking global de modelos.

A finalidade dos evals é responder:

> **Qual modelo entrega a melhor relação entre qualidade, confiabilidade e custo para esta tarefa?**

---

## 10. Regenerações e operações menores

Operações realizadas depois que Strategy e Briefing já existem devem reutilizar o contexto persistido.

Exemplos:

```text
Novo CTA
→ LOW

Novo hook
→ LOW ou MID

Novo script
→ MID

Trocar ângulo
→ MID

Replanejar o conjunto
→ HIGH
```

O sistema não deve recalcular toda a inteligência do Produto para realizar uma alteração local.

Isso reduz custo, latência e inconsistência.

O Briefing continua sendo o contrato entre a inteligência estratégica e a execução do creator.

---

## 11. Experiência do usuário

Toda a decisão de modelo deve permanecer invisível para o creator.

O usuário pode ver estados como:

```text
Entendendo o produto...
Identificando públicos relevantes...
Definindo a melhor estratégia...
Preparando os Briefings...
```

Não deve ver:

```text
LOW
MID
HIGH
provider
modelo
tokens
prompt
fallback
```

A interface continua seguindo o princípio de **complexidade por trás, simplicidade na frente**.

---

## 12. Fora do escopo

Este PRD não define:

- implementação do router;
- interfaces de código;
- adapters de providers;
- estratégia de retry;
- circuit breaker;
- schemas técnicos;
- formato de configuração;
- tracing;
- estrutura de logs;
- armazenamento de prompts;
- implementação de evals;
- estratégia detalhada de fallback;
- observabilidade técnica;
- deployment;
- geração de vídeo;
- geração de imagem;
- voice-over.

Essas decisões pertencem aos ADRs, Specs, Slices e Plans derivados deste PRD.

A produção futura de mídia deve possuir uma camada própria e continuar recebendo o Briefing aprovado como entrada, sem redefinir a estratégia.

---

## 13. Critérios de aceite

Esta frente atende ao produto quando:

1. tarefas de IA podem receber um `IntelligenceTier` LOW, MID ou HIGH;
2. tarefas diferentes podem utilizar modelos diferentes;
3. a Commerce Intelligence consegue combinar tiers dentro do mesmo job;
4. decisões estratégicas importantes podem utilizar HIGH;
5. tarefas de grande volume podem utilizar MID ou LOW quando suficiente;
6. regenerações locais não exigem refazer toda a estratégia;
7. Product Import prioriza extração determinística antes de LLM;
8. modelos e providers podem mudar sem alterar a regra de negócio;
9. LOW, MID e HIGH não dependem do plano comercial do usuário;
10. modelos podem ser avaliados por tarefas reais da plataforma;
11. a escolha do modelo permanece invisível para o creator;
12. a arquitetura não depende obrigatoriamente do OpenCode Go ou de qualquer outro provider específico;
13. Engine Capabilities que usam LLM solicitam tarefas lógicas ao Model Router em vez de selecionar modelos diretamente;
14. capabilities determinísticas podem executar em código sem passar pelo Model Router.

---

## 14. Regra final

> **Use código quando código resolver. Use LOW quando LOW for suficiente. Use MID quando a tarefa exigir compreensão. Reserve HIGH para decisões em que a qualidade estratégica realmente dependa dele.**

A propriedade intelectual da Commerce Intelligence não deve depender do modelo mais caro disponível.

Ela deve estar na combinação de:

```text
produto
+
contexto
+
memória
+
workflow
+
estratégia comercial
+
controle de variedade
+
roteamento de inteligência
```

Modelos e providers são componentes substituíveis dessa engine, não o produto em si.