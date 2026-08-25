# PRD — Importação de Produtos via Browser

## 1. Objetivo

Permitir que o creator adicione um produto do TikTok Shop com o mínimo possível de entrada manual.

A experiência principal deve ser:

```text
Colar link do produto
↓
Sistema abre o TikTok
↓
Usuário autentica se necessário
↓
Sistema extrai os dados
↓
Usuário confirma
↓
Produto é salvo
```

A regra é:

> **O usuário informa qual é o produto. A plataforma descobre o restante.**

---

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

[ URL do TikTok Shop ]

[ Analisar produto ]
```

O backend cria ou reutiliza um browser profile associado ao usuário.

```text
URL
↓
Browser Profile
↓
Chromium
↓
TikTok
```

### Se o TikTok exigir autenticação

O browser é exibido de forma interativa dentro da aplicação.

O próprio usuário realiza:

* login;
* QR Code;
* 2FA;
* CAPTCHA;
* qualquer verificação necessária.

Depois disso, o sistema assume novamente a operação.

### Se a sessão ainda estiver válida

O browser não precisa ser mostrado.

```text
URL
↓
Chromium já autenticado
↓
extração automática
```

---

## 4. Persistência da sessão

Não armazenar login ou senha do TikTok.

O estado autenticado deve permanecer no próprio profile do Chromium:

```text
Browser Profile
├── cookies
├── localStorage
├── IndexedDB
└── demais dados do navegador
```

A aplicação principal guarda apenas a associação:

```text
userId → browserProfileId
```

O browser profile deve ser isolado por usuário.

O profile persistente do Chromium representa uma sessão autenticada e deve ser protegido como credencial, mesmo sem conter senha explícita.

A aplicação principal não deve manipular diretamente cookies, tokens ou dados internos da sessão do TikTok.

---

## 5. Browser Service

Criar uma camada isolada responsável pelos browsers.

```text
Commerce API
     ↓
Browser Service
     ↓
Chromium + Browser Profile
     ↓
Browser Harness
```

Responsabilidades:

* criar browser profile;
* reutilizar browser profile;
* iniciar Chromium;
* abrir URL;
* detectar necessidade de interação humana;
* expor browser interativo quando necessário;
* delegar navegação e inspeção ao Browser Harness;
* executar extração;
* encerrar browser quando terminar.

A aplicação principal não deve implementar diretamente automação genérica de browser.

---

## 6. Browser Harness

**Browser Harness será uma dependência oficial desta frente do sistema**, não apenas uma referência arquitetural.

A skill deverá ser instalada e versionada no ambiente responsável pela automação do browser.

Ela será utilizada pelo `Product Extraction Agent` para controlar, navegar e inspecionar o Chromium.

Arquitetura:

```text
Commerce API
     ↓
Browser Service
     ↓
Chromium + Browser Profile
     ↓
Browser Harness Skill
     ↓
CDP
     ↓
TikTok Shop
```

O Browser Harness será responsável por fornecer capacidades como:

* inspeção da Accessibility Tree;
* interação com elementos da página;
* execução de comandos via CDP;
* leitura e inspeção de DOM;
* inspeção de network quando necessário;
* navegação na sessão autenticada;
* execução de ações necessárias para revelar informações do produto.

Prioridades de inspeção:

```text
Accessibility Tree
+
DOM/CDP
+
Structured Data
+
Network
```

Evitar scrapers frágeis baseados principalmente em seletores específicos como:

```text
.product-title
.price-wrapper > span
```

O agente deve interpretar semanticamente a interface.

O sistema **não deverá reimplementar do zero as capacidades já fornecidas pelo Browser Harness**.

A implementação própria deve ficar concentrada em:

```text
Browser Service
+
gestão dos browser profiles
+
human-in-the-loop
+
Product Extraction Agent
+
normalização para ProductCandidate
```

### Dependência

Durante o setup do projeto, a skill Browser Harness deverá ser instalada e validada antes da implementação da frente de importação.

O desenvolvimento deve assumir sua disponibilidade.

### Regra

> **Browser Harness é infraestrutura da solução, não código de referência para ser refeito internamente.**

---

## 7. Product Extraction Agent

O `Product Extraction Agent` utiliza o Browser Harness como infraestrutura de navegação e inspeção.

Sua responsabilidade é exclusivamente:

> **Extrair os fatos necessários sobre o produto atualmente aberto no TikTok Shop.**

Dados desejados:

* nome;
* descrição;
* preço;
* moeda;
* categoria;
* marca;
* características;
* imagens;
* seller;
* variantes relevantes;
* URL original.

O agente pode utilizar as capacidades fornecidas pelo Browser Harness para:

* expandir descrições;
* abrir seções necessárias;
* abrir "Ver mais";
* consultar Accessibility Tree;
* consultar DOM/CDP;
* consultar Structured Data;
* inspecionar network quando útil;
* navegar apenas pelas áreas necessárias para compreender o produto.

O agente não deve implementar uma nova engine genérica de browser automation.

O agente também não deve navegar pelo TikTok sem necessidade relacionada à extração do produto.

---

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

  images: string[];

  seller?: string;

  sourceUrl: string;
}
```

O `ProductCandidate` representa os fatos encontrados antes da confirmação final do usuário.

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

## 11. Human in the Loop

Quando o agente encontrar:

```text
LOGIN_REQUIRED
CAPTCHA_REQUIRED
2FA_REQUIRED
USER_INTERACTION_REQUIRED
```

ele deve parar a automação e entregar o browser ao usuário.

Fluxo:

```text
agente encontra bloqueio
↓
automação pausa
↓
browser interativo é exibido
↓
usuário resolve
↓
sistema detecta conclusão
↓
agente continua
```

O sistema não deve automatizar:

* CAPTCHA;
* senha;
* QR Code;
* 2FA;
* confirmação humana solicitada pelo TikTok.

Essas etapas pertencem ao usuário.

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

Inicialmente:

```text
Docker
↓
Browser Service
↓
Chromium
↓
Browser Harness
↓
volume persistente por browser profile
```

Exemplo:

```text
/browser-profiles/{profileId}
```

Cada usuário deve possuir profile isolado.

Exemplo:

```text
/browser-profiles/user-a
/browser-profiles/user-b
```

O profile deve poder sobreviver ao encerramento do Chromium para permitir reutilização da sessão.

---

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

A funcionalidade está pronta quando:

1. usuário cola uma URL do TikTok Shop;
2. sistema cria ou reutiliza browser profile;
3. Chromium abre o produto;
4. login manual pode ser realizado quando necessário;
5. sessão permanece reutilizável através do browser profile;
6. Browser Harness consegue controlar e inspecionar a página;
7. Product Extraction Agent extrai os principais fatos;
8. ProductCandidate é produzido;
9. ProductCandidate é apresentado ao usuário;
10. usuário pode confirmar ou editar;
11. produto é salvo;
12. produto pode seguir para a Commerce Intelligence Engine.

---

## 16. Ordem de implementação

```text
1. Instalar e validar Browser Harness

2. Criar Browser Service

3. Implementar Chromium persistente por browser profile

4. Integrar Browser Service ↔ Browser Harness

5. Implementar browser interativo / human-in-the-loop

6. Validar login manual no TikTok

7. Validar persistência e reutilização da sessão

8. Criar Product Extraction Agent

9. Criar ProductCandidate

10. Criar tela de confirmação

11. Persistir Product

12. Integrar Product com Commerce Intelligence
```

Antes de avançar para as etapas de produto, deve existir uma POC comprovando:

```text
Chromium
+
Browser Harness
+
login manual TikTok
+
profile persistente
+
reabertura autenticada
+
extração de um produto real
```

---

## 17. Regras para implementação

### Regra 1

Sempre que surgir a ideia de adicionar um campo ao cadastro:

> **A plataforma consegue descobrir isso sozinha?**

Se sim, o campo não deve existir no fluxo principal.

### Regra 2

> **Não reimplementar capacidades genéricas de browser já fornecidas pelo Browser Harness.**

### Regra 3

> **Product Extraction Agent extrai fatos. Commerce Intelligence gera estratégia.**

### Regra 4

> **Autenticação do TikTok acontece no próprio Chromium através da interação do usuário.**

### Regra 5

> **O browser profile é uma credencial sensível e deve permanecer isolado por usuário.**

---

## 18. Experiência final desejada

### Primeira utilização

```text
Adicionar produto
↓
Colar URL
↓
Analisar
↓
TikTok exige login
↓
browser é exibido
↓
usuário autentica
↓
produto é extraído
↓
confirmar
```

### Utilizações seguintes

```text
Adicionar produto
↓
Colar URL
↓
Analisar
↓
Chromium reutiliza sessão
↓
produto é extraído
↓
confirmar
```

O browser interativo deve aparecer somente quando realmente houver necessidade de intervenção humana.

---

## 19. Regra final

A experiência desejada é:

> **Cole o produto. A plataforma se vira.**

Se o creator precisar preencher manualmente informações que podem ser descobertas pelo sistema, o fluxo está errado.
