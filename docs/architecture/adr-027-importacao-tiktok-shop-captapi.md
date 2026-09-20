# ADR-027: Importação URL-first do TikTok Shop via CaptAPI

## Status

Accepted for `feat/tiktok-shop-import`.

## Decisão

O fluxo de entrada por URL pública do TikTok Shop usa `GET /v1/tiktok-shop/product-details` da CaptAPI, sempre com `region=BR` e `Authorization: Bearer` vindo exclusivamente de `CAPTAPI_API_KEY`. A resposta é validada no módulo Products, convertida ao contrato factual atual e persistida por `createManualProduct`, mantendo o mesmo tenant, idempotência e fallback manual.

Não são usados browser automation, scraping, OAuth do TikTok ou credenciais do usuário. Timeout, falha de rede/provedor, JSON inválido, shape incompleto e preço ausente retornam erros de domínio recuperáveis; a chave nunca aparece em logs ou respostas.

## Consequências

- A integração externa é síncrona e limitada a uma requisição por importação.
- O Product só é persistido depois de uma resposta válida com os fatos mínimos do contrato atual.
- A criação continua sem iniciar análise; `Analisar produto` permanece ação explícita.
- A direção browser-based anterior permanece substituída para este fluxo pelo pedido explícito desta tarefa.
