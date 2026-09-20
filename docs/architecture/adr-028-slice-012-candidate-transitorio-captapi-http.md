# ADR-028: Slice 012 com Candidate transitório via CaptAPI HTTP

**Status:** Accepted for Slice 012 documentation

## Contexto

O ADR-027 registra a integração TikTok Shop com a CaptAPI, mas não define o
contrato de entrada URL-first do Slice 012: a resposta pode ser parcial, a
consulta não deve persistir um Product e URL/manual precisam convergir no mesmo
formulário. Também é necessário limitar imagens, sinais opcionais e a
superfície de runtime sem reabrir a direção Browser/portal/MCP.

## Decisão

O Slice 012 usa somente HTTP normal para `GET
https://api.captapi.com/v1/tiktok-shop/product-details`, com `region=BR` e
`Authorization: Bearer` derivado exclusivamente de `CAPTAPI_API_KEY` no
servidor. A resposta validada é normalizada em um `ProductCandidate` transitório
e editável, limitado aos campos suportados pelo formulário e serviço manual.

O Candidate aparece no mesmo formulário de cadastro manual. Campos ausentes
continuam vazios e editáveis, sem valores inventados; lacunas ou falhas de URL,
rede, HTTP, JSON, shape ou timeout mantêm fallback manual. Nenhum Candidate é
persistido. O Product só é persistido pelo fluxo manual existente após revisão,
complementação dos campos obrigatórios e confirmação explícita no mesmo
formulário; resposta parcial nunca cria registro inválido.

`imageRefs` pode conter somente `data.images[0]`. `salesCount`, `ratingValue` e
`reviewCount` são sinais opcionais, somente leitura, não inventados e não
persistidos como fatos do Product. Seller, marca, variantes e outros atributos
sem suporte não entram no Candidate nem viram gaps editáveis.

Browser automation, scraping, portal, MCP em runtime, OAuth, credenciais do
creator, nova tabela/schema e galeria completa estão fora da decisão. A
consulta e a confirmação usam idempotência distinta, ambas escopadas ao Tenant;
segredos, Authorization, cookies, tokens e payload bruto não aparecem em logs,
respostas ou testes.

## Consequências

- O fluxo URL-first pode ser revisado e completado sem uma etapa paralela.
- A confirmação humana continua sendo a fronteira de persistência e mantém o
  fallback manual já existente.
- A ausência de dados do provedor é representada como ausência, não como erro
  fatal nem como fato inferido.
- A implementação futura do Slice 012 não altera schema para armazenar
  Candidate e não reintroduz infraestrutura de browser.

## Relação com decisões existentes

Este ADR complementa o ADR-027; não o substitui nem altera seu escopo de
integração CaptAPI. O ADR-022 continua sendo referência histórica para a
confirmação manual, com o comportamento URL-first especificado agora pelo
Slice 012. ADR-023 e ADR-024 permanecem inalterados.
