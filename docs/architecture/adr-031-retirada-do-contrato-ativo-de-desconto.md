# ADR-031: Retirada do contrato ativo de desconto do Product

## Status

Aceito — supersede ADR-024.

## Contexto

O desconto tipado (`discountType` + `discountValue`) ainda participa do cadastro, do contrato de leitura do Product e da projeção factual da Commerce Intelligence. A decisão de produto retira desconto, tipo e valor da superfície e dos contratos ativos do Product.

## Decisão

1. `discountPercentage`, `discountType` e `discountValue` deixam de integrar o cadastro, os payloads, a validação, a escrita, a leitura autenticada e a projeção da Commerce Intelligence.
2. O worker não projeta `discount`; a engine não o inclui no `mappingContext` nem no catálogo de evidências de novas gerações.
3. As colunas existentes permanecem no schema e os valores existentes não são alterados, expostos ou sobrescritos. Gerações e registros históricos já concluídos permanecem imutáveis.
4. Não há migration, backfill ou purge. A remoção física de dados exige decisão deliberada compatível com ADR-023.

## Consequências

- Novos Products e edições não carregam desconto, e novas gerações não o usam como fato.
- O contrato ativo diminui sem perda de dados históricos nem mudança de tenant, idempotência, lifecycle ou versionamento.

## Relações

- Supersede ADR-024.
- Segue a retenção de dados de ADR-023 e o precedente de contrato ativo de ADR-030.
