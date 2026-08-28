# PRD — Importação de Produtos via Product Importer

## 1. Objetivo

Permitir que o creator adicione um produto do TikTok Shop com o mínimo possível de entrada manual.

A experiência principal deve ser:

```text
Colar link do produto
↓
Product Importer abre a página em Chromium headless
↓
Agent Runner compreende e extrai os fatos
↓
Usuário confirma
↓
Produto é salvo
```

A regra é:

> **O usuário informa qual é o produto. A plataforma descobre o restante.**
## 2. Problema

O cadastro atual exige informações que o usuário não deveria precisar fornecer manualmente, como:

* descrição;
* categoria;
* preço;
* características;
* público;
* objetivo;
* estilo;
* mercado;
* contexto estratégico.

Isso contradiz o princípio do produto de manter a complexidade na engine e simplicidade na interface.

Informações factuais devem ser extraídas.

Informações estratégicas devem ser descobertas posteriormente pela Commerce Intelligence Engine.

---

## 3. Fluxo principal

### Novo produto

```text
Adicionar produto

[ URL do produto ]

[ Analisar produto ]
```

O Product Importer recebe a URL, abre a página em Chromium headless e inicia o Agent Runner especializado em Product Extraction.

```text
URL
↓
Product Importer
↓
Agent Runner + Browser Harness
↓
Chromium headless
↓
ProductCandidate
```

O agente observa e interage somente com a página analisada, usando o menor conjunto de ferramentas necessário para localizar o produto principal e seus fatos. Não há browser visual, portal, iframe, handoff ou autenticação interativa do creator.

### Sessão

O browser é efêmero na POC. Profile persistente, se necessário para uma sessão técnica do TikTok, pertence ao Product Importer e não representa uma feature ou credencial do creator.

O sistema nunca recebe ou armazena senha, cookie ou token fornecido pelo creator.
## 4. Persistência da sessão

Não armazenar login, senha, cookie ou token do TikTok na aplicação.

Na POC, o Chromium e seu estado são efêmeros. No MVP, um profile persistente poderá ser usado somente se a sessão técnica do TikTok exigir, sob responsabilidade do Product Importer, com isolamento e tratamento de segredo operacional.

O profile não é associado ao usuário como feature de produto, não é exposto à interface e não é acessado por módulos de Product.
## 5. Product Importer

O Product Importer é um único serviço/container responsável por orquestrar a extração:

```text
Commerce App / Next.js
        ↓
Product Importer
        ├── HTTP API
        ├── Agent Runner
        ├── Browser Harness
        ├── Chromium headless
        └── Model Router / LLM
```

Na POC, pode executar de forma síncrona e manter estado somente durante a requisição. No MVP, deve suportar endpoint autenticado, `202 + importId`, polling, persistência de `ProductImportAttempt`, concorrência limitada, timeout e cleanup.

O Product Importer deve validar a URL, bloquear destinos proibidos, iniciar e encerrar Chromium, executar o Agent Runner específico, limitar ferramentas/duração/tokens/rede/navegação, devolver erros sanitizados e produzir somente `ProductCandidate`.

A aplicação principal não deve implementar automação genérica de browser nem acessar CDP diretamente.

---

## 6. Browser Harness

**Browser Harness é uma dependência oficial do Product Importer**, usada como infraestrutura de controle e inspeção do Chromium.

```text
Product Importer
        ↓
Agent Runner + Browser Harness
        ↓
Chromium headless
        ↓
página do produto
```

O Harness fornece observação e interação. O Agent Runner + LLM decide quais evidências são relevantes.

Capacidades permitidas:

* Accessibility Tree seletiva;
* DOM;
* Structured Data;
* dados relevantes da página;
* rolagem;
* cliques;
* expansão de seções.

Não fornecer shell, filesystem, upload, download, novas abas ou navegação livre ao agente.

---

## 7. Product Extraction Agent

O `Product Extraction Agent` é uma capability limitada ao fluxo:

```text
URL
↓
produto principal
↓
ProductCandidate
```

Ele deve compreender a página, diferenciar o PDP de recomendações, reviews, banners, anúncios, navegação e produtos relacionados, e extrair apenas os fatos necessários.

O agente não pode criar estratégia, pesquisar concorrentes, seguir links arbitrários ou operar como browser agent genérico.

O Agent Runner executa um Agent Run por importação, com múltiplos turnos LLM/tool limitados por `maxSteps`, `maxDuration`, `maxTokens` e `maxNetworkInspections`. Esses valores devem ser calibrados com evals reais.

O Product Importer solicita a task lógica `PRODUCT_PAGE_EXTRACTION`; provider e modelo não são escolhidos diretamente pelo importador.
## 8. Product Candidate

A extração deve produzir primeiro um candidato:

```ts
interface ProductCandidate {
  name: string;

  description?: string;

  category?: string;

  brand?: string;

  price?: {
    amount: number;
    currency: string;
  };

  features: string[];

  variants?: ProductVariantCandidate[];

  images: string[];

  seller?: string;

  sourceUrl: string;
}
```

O `ProductCandidate` representa os fatos encontrados antes da confirmação final do usuário.

`variants` faz parte do contrato factual quando existirem variantes relevantes. A estrutura exata de `ProductVariantCandidate` permanece para a Spec; este PRD não define atributos universais que todos os produtos precisariam possuir.

A política de persistência de `ProductCandidate` antes da confirmação não é requisito deste PRD. A implementação pode tratá-lo como estado transitório ou persistência temporária, desde que a confirmação humana continue sendo a fronteira para criação do `Product` ativo.

---

## 9. Confirmação

Depois da extração:

```text
Produto encontrado

[imagem]

Mini Aspirador XYZ

R$ 79,90

Descrição...

• Sem fio
• Recarregável
• Compacto

[ Confirmar ]

[ Editar ]
```

Editar é fallback, não fluxo principal.

O objetivo é que, na maior parte dos casos:

```text
colar URL
↓
analisar
↓
confirmar
```

seja suficiente.

---

## 10. Separação de responsabilidades

### Product Import

Responsável por fatos:

```text
nome
preço
descrição
características
imagens
categoria
marca
seller
variantes
```

### Commerce Intelligence

Responsável por estratégia:

```text
públicos
dores
desejos
objeções
benefícios
argumentos
posicionamento
ângulos
hooks
scripts
CTA
```

Nunca pedir ao usuário informações estratégicas durante o cadastro do produto.

Também não utilizar o Product Extraction Agent para gerar estratégia comercial.

---

## 12. Fallback manual

Se a extração falhar completamente:

```text
Não conseguimos importar automaticamente.

Nome *
Descrição *

[ Salvar produto ]
```

Campos adicionais permanecem opcionais.

O fallback manual existe para impedir que uma falha técnica bloqueie completamente o usuário.

Ele não deve virar o fluxo principal.

---

## 13. Desenvolvimento local

Na POC:

```text
Docker
↓
Product Importer
├── Agent Runner
├── Browser Harness
├── Chromium headless
└── LLM
```

O browser é efêmero e a execução pode ser síncrona. Não adicionar fila distribuída, proxy, MCP, event bus ou microserviço adicional.

No MVP, o mesmo Product Importer pode adicionar endpoint autenticado, polling, persistência, concorrência, cleanup, observabilidade e profile persistente condicional.
## 14. Fora do escopo

Não implementar nesta frente:

* TikTok OAuth;
* TikTok Shop API;
* analytics;
* publicação;
* agendamento;
* tracking de vendas;
* scraping universal;
* integração com outros marketplaces;
* automação de CAPTCHA;
* sistema próprio de autenticação do TikTok;
* armazenamento de login ou senha do TikTok.

APIs oficiais poderão ser adicionadas futuramente como otimização interna.

---

## 15. Critérios de aceite

A POC está pronta quando:

1. uma URL pública é validada;
2. o Product Importer abre a página em Chromium headless;
3. o Agent Runner usa Browser Harness para observar/interagir;
4. o agente localiza o produto principal;
5. recomendações, navegação e produtos relacionados são ignorados;
6. dados espalhados pela página são encontrados quando necessário;
7. `ProductCandidate` limpo e schema-valid é produzido;
8. lacunas permanecem lacunas;
9. a saída não contém claims inventados nem dados de outros produtos;
10. o Candidate é apresentado para confirmação/edição;
11. o Product é salvo após confirmação;
12. a POC funciona em 20–30 produtos públicos com métricas registradas.

O MVP adiciona os contratos operacionais de autenticação, `202 + polling`, persistência, concorrência, cleanup, erros recuperáveis, entitlements e evals de regressão.
## 16. Ordem de implementação

```text
1. Instalar e validar Browser Harness
2. Criar Product Importer
3. Integrar Chromium headless
4. Implementar Agent Runner restrito
5. Integrar task PRODUCT_PAGE_EXTRACTION
6. Produzir e validar ProductCandidate
7. Validar com 20–30 produtos públicos
8. Criar tela de confirmação
9. Persistir Product
10. Adicionar endurecimento do MVP
```
## 17. Regras para implementação

### Regra 1

> **Product Importer é a única fronteira de browser.**

### Regra 2

> **O Agent Runner compreende a página; código determinístico valida e normaliza a saída.**

### Regra 3

> **Product Extraction Agent extrai fatos. Commerce Intelligence gera estratégia.**

### Regra 4

> **O agente não recebe shell, filesystem, credenciais ou navegação livre.**

### Regra 5

> **Uma falha de acesso ou extração nunca inventa um ProductCandidate.**
## 18. Experiência final desejada

```text
Adicionar produto
↓
Colar URL
↓
Analisar
↓
Product Importer abre Chromium headless
↓
Agent Runner extrai o produto principal
↓
confirmar ou editar
↓
Produto salvo
```

Se a importação falhar, o creator pode preencher nome e descrição manualmente.
## 19. Regra final

> **Cole a URL. O Product Importer compreende a página e devolve somente os fatos do produto.**
