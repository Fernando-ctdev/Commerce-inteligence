# System Design — Commerce Intelligence

**Status:** baseline de integração dos ADRs para o MVP
**Escopo:** como os limites arquiteturais se conectam; não substitui ADRs, PRD ou `DESIGN.md`.

## 1. Objetivo e escopo

Commerce Intelligence transforma um Product em uma Strategy comercial, um Plan diversificado, Contents graváveis e uma fila de Production. O primeiro valor é permitir que o creator indique um produto do TikTok Shop com o mínimo de entrada manual.

O MVP cobre:

- entrada de Product por URL através de Browser Service, Chromium, browser profile persistente e Browser Harness;
- autenticação e desafios do TikTok resolvidos manualmente pelo creator dentro do browser;
- ProductCandidate factual, confirmação humana e fallback manual;
- análise e decisão da Commerce Intelligence Engine;
- geração de Plan e Content com memória, variedade e proveniência;
- organização manual da fila de Production;
- limites de uso por Tenant e processamento assíncrono de gerações.

O MVP não cobre TikTok OAuth, TikTok Shop API, publicação/agendamento, analytics externo, seller catalog, pedidos, sincronização contínua, scraping universal, outros marketplaces, automação de CAPTCHA/QR Code/2FA/senha, colaboração, SSO, i18n operacional, embeddings/banco vetorial, mídia gerada ou microserviços.

Fontes canônicas: `docs/product/PRD.md` define o produto geral; `docs/product/PRD-Importation-product.md` define a frente de importação; `DESIGN.md` define a superfície visual; os ADRs registram decisões; este documento descreve a composição entre elas.

## 2. Forma do sistema

O sistema é um monólito modular em TypeScript/Next.js, com PostgreSQL/Prisma como persistência canônica. Web, Browser Service e worker usam os limites do mesmo repositório/deploy; serviços externos só entram por adaptadores e pela dependência oficial Browser Harness.

```text
Creator → Web/API → Application Use Cases → Domain Modules
                                      ↓
                                Browser Service
                                      ↓
                         Chromium + Browser Profile
                                      ↓
                             Browser Harness → CDP → TikTok

Worker → Application Use Cases → Strategy/Plan/Content
```

Não há serviço de importação separado no MVP. A separação importante é de responsabilidade, autorização e direção de dependências.

## 3. Mapa de módulos

| Módulo | Responsabilidade | Não possui |
|---|---|---|
| **Identity / Tenant** | sessão, usuário, Tenant/Workspace pessoal e autorização | colaboração, RBAC, SSO ou billing de equipe |
| **Browser Service** | profile persistente, Chromium, lifecycle, URL, interação humana e integração com Harness | Product, Strategy, credenciais próprias do TikTok ou automação de desafios humanos |
| **Product Import** | tentativa de extração, Product Extraction Agent, normalização, Candidate e estados | fatos confirmados sem confirmação, contexto estratégico ou Strategy |
| **Product** | fatos confirmados, origem, Candidate, fallback manual e prontidão | automação de browser, contexto estratégico ou decisão comercial |
| **Strategy** | análise comercial, taxonomia, decisão de públicos/dores/benefícios/ângulos e contrato da engine | fila, quota ou detalhes de provider |
| **Content / Plan** | Plan, Contents, dimensões, edição, proveniência e estados do conteúdo | chamada direta ao modelo, browser ou mídia |
| **Production** | fila manual, lotes, modo de gravação e estados operacionais | publicação automática ou vídeo gerado |
| **Generation** | `generation_run`, idempotência, fila, lease, retries e coordenação do worker | decisão estratégica e regra de quota |
| **Entitlements** | limite, reserva, confirmação/liberação e virada mensal | qualidade diferente por plano ou cobrança |

Os módulos são limites de código. Uma tabela pode apoiar mais de um fluxo sem transformar cada tabela em módulo próprio. Browser Service e Product Import existem porque profile, processo, interação humana e extração possuem invariantes e riscos diferentes.

## 4. Fluxo do domínio

```text
URL → Browser Profile → Chromium → TikTok → ProductCandidate → Product
                                                        ↓
                                              Strategy → Plan → Content → Production
```

1. **Browser Service:** cria/reutiliza o profile do Tenant, inicia Chromium e abre a URL.
2. **Human-in-the-loop:** quando a sessão exige login, CAPTCHA, QR Code, 2FA ou confirmação, pausa e entrega o browser ao creator; não automatiza a etapa.
3. **Browser Harness:** controla e inspeciona o browser por Accessibility Tree, DOM/CDP, Structured Data e Network, nessa prioridade.
4. **Product Import:** Product Extraction Agent interpreta a página do produto, extrai fatos e produz Candidate com lacunas e proveniência.
5. **Product:** o creator revisa/edita e confirma Candidate, ou usa fallback manual. Só então Product fica ativo.
6. **Strategy:** a engine interpreta fatos confirmados e decide dimensões estratégicas.
7. **Plan/Content:** a engine distribui Contents graváveis e registra explicação/proveniência.
8. **Production:** o creator seleciona, grava e atualiza manualmente os estados.

Identity/Tenant envolve todo o fluxo. Entitlements autoriza capacidade antes da geração. Generation executa Strategy/Plan/Content de forma durável, mas não substitui esses módulos.

## 5. Direção de dependências

```text
Web/API ───────┐
Worker ────────┼──> Application Use Cases ───> Domain Rules
Browser Service┘             │                     │
                              └──────────> Ports <──┘
                                              ↑
                                  Infrastructure Adapters
```

- Web e worker chamam casos de uso; não acessam banco, profile, CDP, provider ou quota diretamente.
- Browser Service é o único dono do profile, lifecycle de Chromium e sessão operacional do browser.
- Product Import chama o Browser Service e o Harness por contratos; não acessa filesystem, cookies ou CDP direto.
- Casos de uso resolvem Tenant, aplicam autorização, orquestram módulos e definem transações curtas.
- Domínio não conhece Next.js, Prisma, HTTP, cookies, CDP, Browser Harness ou SDKs.
- Ports existem apenas para persistência, sessão, browser, fila e fronteiras externas reais.
- Um módulo não lê tabelas de outro para contornar seu contrato.

## 6. Domínio, aplicação e infraestrutura

### Domínio

Representa Product, ProductCandidate, Strategy, Plan, Content, Production, Tenant e Entitlements. Inclui invariantes de fatos confirmados, proveniência, Candidate não confiável, dimensões válidas, Content gravável e estados operacionais.

### Aplicação

Coordena ações como iniciar importação, pausar/retomar interação, confirmar Candidate, criar Product, iniciar geração, consultar resultado, editar Content e marcar Gravado. Monta snapshots, exige Tenant, verifica Entitlements, cria `generation_run` e coordena persistência. Não implementa seletores ou regras específicas do TikTok.

### Infraestrutura

Conecta Next.js, sessão server-side, PostgreSQL/Prisma, Browser Service, Chromium, volume de profiles, Browser Harness, fila PostgreSQL, worker e adapter textual. Infraestrutura não vaza detalhes de browser ou provider para o domínio.

## 7. Contratos e adaptadores

### Importação

O Browser Service expõe somente operações necessárias ao fluxo: criar/reutilizar profile, iniciar/encerrar Chromium, abrir URL, observar estado de interação e entregar/retomar browser interativo. O Browser Harness fornece inspeção e interação; o sistema não reimplementa suas capacidades.

O Product Extraction Agent devolve `ProductCandidate` factual, com estado, origem, lacunas e URL original. Nenhum Candidate vira Product sem confirmação humana. O profile guarda cookies, localStorage, IndexedDB e demais dados do Chromium, mas a aplicação principal guarda apenas `browserProfileId` e estado operacional mínimo.

### Geração

O contrato é `GenerationInput v1`/`GenerationOutput v1` do ADR-002. Ele congela o snapshot de fatos confirmados, pedido e locale, exige cardinalidade/validação, registra engine/provider/taxonomia e liga resultado à `generation_run`. O produto-exemplo gold-standard é pré-condição para aceitar a engine.

### Fronteiras externas

- **Browser:** Browser Service + Chromium + profile protegido + Browser Harness + CDP.
- **Texto/estratégia:** adapter de um provider por vez; provider preenche texto, mas não define domínio.
- **Persistência:** PostgreSQL/Prisma e JSONB versionado por ports necessários.
- **Sessão/fila:** infraestrutura server-side, escondida dos casos de uso.
- **Mídia futura:** `Content → Production Specification → Media Provider Adapter`; fora do MVP.

## 8. Fronteiras críticas

### Persistência

PostgreSQL é a fonte de registro para Tenant, associação de browser profile, tentativa de importação, Candidate, Product, Strategy, Plan, Content, Production, `generation_run` e uso. Campos usados em autorização, estados, busca e variedade permanecem estruturados; payloads evolutivos usam JSONB versionado.

A persistência nunca armazena senha, login, cookie, token ou conteúdo integral do profile do TikTok. Candidate é rascunho server-side versionado e retido conforme configuração. Confirmar Candidate preserva origem e correções.

### Autorização e isolamento

O cookie contém referência opaca a uma sessão server-side. A sessão resolve usuário e Tenant; cada caso de uso aplica o escopo. Tenant enviado pelo cliente nunca é autoridade. Browser profile, browser interativo, Candidate, Product, Generation e resultados são sempre escopados ao Tenant.

### Browser e human-in-the-loop

O browser interativo é exibido somente quando necessário. Login, senha, CAPTCHA, QR Code, 2FA e confirmação humana são ações do creator. A automação pausa, verifica a conclusão e retoma. Uma falha de extração não apaga o profile e oferece retry ou fallback manual.

O Browser Service deve encerrar processos sem destruir profile, detectar processos órfãos e redigir erros. O profile é tratado como credencial em permissões, volume, backup, restauração e retenção.

### Geração

O web app inicia uma execução em transação curta, reserva Entitlements com `generation_run.id`, enfileira e devolve `queued`. O worker chama o provider fora da transação, valida a saída v1 e finaliza Strategy/Plan/Content e uso em transação curta. Falhas, retries e cancelamentos não publicam Content parcial.

## 9. Fluxos de sistema

### Fluxo de importação

1. Resolver sessão e Tenant.
2. Validar URL e iniciar/reutilizar browser profile isolado.
3. Abrir Chromium via Browser Service.
4. Se necessário, entregar o browser ao creator e aguardar login/desafio humano.
5. Retomar e executar Product Extraction Agent na página indicada.
6. Exibir Candidate, fatos, lacunas e proveniência.
7. Confirmar/editar Candidate ou escolher fallback manual.
8. Persistir Product ativo com limite server-side e encerrar Chromium preservando profile.
9. Encaminhar para Slice 003 sem iniciar Strategy.

### Fluxo de geração

1. Carregar Product ativo com fatos confirmados.
2. Receber quantidade e objetivo/preferência opcional.
3. Criar `generation_run` e reserva em transação curta.
4. Worker reivindica run com lease e chama provider fora de transação.
5. Validar GenerationOutput v1, cardinalidade, referências, hooks e gravabilidade.
6. Persistir Strategy/Plan/Content, proveniência e confirmação/liberação de uso.
7. Exibir sucesso completo, falha sanitizada ou cancelamento; retries não duplicam resultado.

## 10. Relação com os ADRs

| Documento | Papel neste desenho |
|---|---|
| [ADR-001](./adr-001-monolito-modular-e-stack-do-mvp.md) | monólito modular, stack e deploy |
| [ADR-002](./adr-002-engine-estrategica-como-core.md) | core estratégico e contratos v1 |
| [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) | persistência, memória e proveniência |
| [ADR-004](./adr-004-variedade-por-memoria-estruturada.md) | variedade baseada em memória |
| [ADR-005](./adr-005-geracoes-assincronas-e-duraveis.md) | run, worker, transações e idempotência |
| [ADR-006](./adr-006-limites-de-plano-e-uso.md) | Entitlements e quota |
| [ADR-007](./adr-007-fronteira-de-producao-de-midia-futura.md) | mídia futura |
| [ADR-008](./adr-008-entrada-de-produto-manual-first.md) | URL-first, Candidate, confirmação e fallback |
| [ADR-009](./adr-009-identidade-autorizacao-e-tenant-inicial.md) | identidade, Tenant e autorização |
| [ADR-010](./adr-010-importacao-tiktok-shop-oficial.md) | histórico superseded |
| [ADR-011](./adr-011-importacao-browser-profile-e-harness.md) | Browser Service, profile, Harness e Human-in-the-loop |

Se uma implementação contrariar um ADR, o ADR deve ser revisado antes da mudança. Se apenas conectar decisões já aceitas, este documento pode ser atualizado sem criar nova decisão.
