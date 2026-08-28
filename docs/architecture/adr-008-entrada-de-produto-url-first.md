# ADR-008: Product URL-first com Product Importer e fallback manual

## Status

Aceito — base de entrada factual; os detalhes do Product Importer, Chromium headless e Agent Runner estão no ADR-016.

## Contexto

O creator normalmente já possui a URL do produto. O Product Importer abre essa URL em Chromium headless e usa um Agent Runner com Browser Harness para compreender contextualmente o produto principal. A aplicação não recebe login, cookie ou token do TikTok.

A entrada externa é não confiável. Um preview nunca é Product ativo: fatos, lacunas e origem precisam ser apresentados para confirmação humana. Quando a importação não puder ser concluída, o primeiro valor ainda deve ser possível pelo fallback manual mínimo.
## Decisão

URL é o caminho principal para iniciar a entrada de Product. O Product Importer executa o Agent Runner e devolve um `ProductCandidate` factual com origem e lacunas. O Candidate é sempre um rascunho não confiável; somente confirmação humana cria ou atualiza fatos confirmados do Product.

O Candidate pode conter nome, descrição, preço/moeda, categoria, marca, características, imagens, seller, variantes relevantes e URL original. Valores ausentes permanecem ausentes. A aplicação não inventa fatos com IA e não pede contexto estratégico durante o cadastro.

O creator pode revisar e corrigir fatos antes de confirmar. Correções confirmadas prevalecem sobre novas extrações automáticas, e a proveniência original permanece rastreável. Products ativos continuam escopados ao Tenant e sujeitos ao Entitlement server-side.

Quando a URL for inválida, a página exigir interação não resolvida, a extração falhar ou o creator preferir não usar o browser, `Adicionar manualmente` é o fallback explícito. Ele exige apenas nome e descrição; demais fatos são opcionais. O fallback não é o caminho principal e não inicia Strategy.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Product Importer agentic + confirmação + fallback (escolhida) | Menos digitação, compreensão contextual e recuperação manual | Depende da página e pode falhar quando não houver evidência suficiente |
| Manual-first + URL opcional | Mais previsível | Faz o creator repetir fatos que a plataforma pode descobrir |
| Product criado diretamente da página | Rejeitada | Dados externos não são autoridade e podem estar incompletos |
| API/OAuth oficial como caminho principal | Rejeitada nesta decisão | Não corresponde ao novo PRD; histórico permanece no ADR-010 superseded |

## Consequências positivas

- O caminho comum é `colar URL → analisar → confirmar`.
- A interface não mistura fatos de Product com público, dores, desejos, objetivos ou outras decisões estratégicas.
- Falha do browser não bloqueia o creator: o fallback manual mantém o fluxo utilizável.
- Product Import pode mudar a técnica de extração sem alterar o contrato de Product ou Strategy.

## Consequências negativas e riscos

- Candidate pode ser incompleto e exige revisão humana.
- Mudanças de página, bloqueios externos e páginas inacessíveis podem causar falhas.
- Profile persistente, se necessário no MVP, é material sensível e precisa ser protegido como segredo operacional.
- Fatos confirmados e correções precisam impedir sobrescrita silenciosa por reimportação.

## Segurança e operação

- Aceitar apenas URL `http`/`https` sem credenciais e bloquear destinos privados, metadata, portas explícitas e redirects indevidos.
- Não coletar, persistir ou logar senha, cookie, token, session ID ou conteúdo integral do browser.
- Toda operação resolve o Tenant pela sessão; IDs enviados pelo cliente não concedem autorização.
- ProductCandidate, URL, página e saída do agente são entradas não confiáveis: validar schema, tamanhos, URLs de imagem, preço e cardinalidade antes de confirmar.
- Chamadas ao browser ficam fora da transação curta de confirmação; somente o Candidate validado é recarregado para persistência.
- Erros retornados ao creator são sanitizados e orientam retry ou fallback sem revelar detalhes internos.

## Relações

- `docs/product/PRD-Importation-product.md` — fonte de produto vigente.
- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — Product, Candidate e proveniência.
- [ADR-006](./adr-006-limites-de-plano-e-uso.md) — limite de Products ativos.
- [ADR-009](./adr-009-identidade-autorizacao-e-tenant-inicial.md) — sessão e Tenant.
- [ADR-016](./adr-016-product-importer-agentic-headless.md) — Product Importer, Agent Runner, Browser Harness e Chromium headless.
