# ADR-016: Product Importer agentic com Chromium headless

## Status

Aceito — substitui o ADR-011 para a importação de produtos.

## Contexto

A arquitetura anterior separava Browser Service, browser visual, portal, handoff, Human-in-the-Loop e profiles por usuário. Essa topologia adicionou complexidade operacional e não resolveu a contaminação de dados na extração determinística de páginas dinâmicas.

A importação precisa compreender contextualmente a página, identificar o produto principal e ignorar navegação, recomendações, reviews, banners e produtos relacionados.

## Decisão

1. O Slice 002 usa um único `Product Importer` como componente/container da extração.
2. O Product Importer contém HTTP API, Agent Runner, Browser Harness, Chromium headless e integração com Model Router/LLM.
3. O Agent Runner executa uma capability limitada `PRODUCT_PAGE_EXTRACTION`. Ele usa o Browser Harness para observar e interagir seletivamente com a página e retorna somente `ProductCandidate`.
4. O agente não recebe shell, filesystem, upload, download, novas abas, links arbitrários ou navegação livre.
5. Chromium é efêmero na POC. Profile persistente só pode ser adicionado no MVP se uma sessão técnica do TikTok exigir; nunca como feature do usuário.
6. Não há browser visual, portal, iframe, streaming, handoff ou autenticação manual do creator.
7. O Agent Run pode ter múltiplos turnos LLM/tool. Seus limites são configuráveis (`maxSteps`, `maxDuration`, `maxTokens`, `maxNetworkInspections`) e calibrados por evals reais.
8. Código determinístico é responsável por schema validation, limpeza, normalização, deduplicação, limites, validação de preço/moeda/URLs e rejeição de campos extras.
9. A POC pode ser síncrona e transitória. O MVP adiciona endpoint autenticado, `202 + importId`, polling, `ProductImportAttempt`, concorrência, cleanup, erros recuperáveis, entitlements e observabilidade.

## Consequências

- A topologia permanece pequena e pode evoluir da POC para o MVP sem reescrever o núcleo agentic.
- A qualidade depende de contexto, instruções da capability, limites e evals; parser determinístico não é o mecanismo principal de identificação.
- Páginas inacessíveis, bloqueadas ou sem evidência suficiente falham de forma recuperável; o sistema não inventa fatos.
- O Product Importer passa a concentrar a operação do Chromium e deve garantir isolamento, SSRF protection, egress limitado, encerramento de processos e logs sanitizados.
- Profile persistente, se introduzido, será segredo operacional do serviço e não dado da aplicação.

## Segurança mínima

- bloquear `file:`, `chrome:`, localhost, redes privadas, metadata endpoints, portas explícitas e redirects indevidos;
- executar Chromium não-root e sem shell exposto ao Agent Runner;
- tratar conteúdo da página como dado não confiável, nunca como instrução;
- não registrar HTML integral, Accessibility Tree completa, cookies, headers sensíveis ou prompt bruto;
- fixar versões do Chromium, Browser Harness, imagem e dependências;
- encerrar Chromium/Harness em sucesso, timeout, erro e crash;
- limitar observações, tokens, imagens, requests concorrentes e duração.

## Relações

- `docs/product/PRD-Importation-product.md`
- `docs/product/PRD-model-router-inteligence.md`
- `docs/architecture/SYSTEM-DESIGN.md`
- `docs/delivery/SLICES.md` — Slice 002
- ADR-011 — decisão anterior, superseded.
