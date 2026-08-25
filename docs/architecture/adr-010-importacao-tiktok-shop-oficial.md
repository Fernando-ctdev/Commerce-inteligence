# ADR-010: Importação oficial TikTok Shop

## Status

Superseded — a nova definição de produto exige importação por Browser Service, profile persistente e Browser Harness. A decisão vigente está em [ADR-011](./adr-011-importacao-browser-profile-e-harness.md).

## Contexto histórico

Este ADR registrou uma proposta anterior para importar Products por API oficial do TikTok Shop, com OAuth, Connection, Candidate e fallback manual. A proposta foi criada antes de `docs/product/PRD-Importation-product.md` definir o fluxo browser-based com autenticação realizada pelo próprio creator dentro do Chromium.

## Decisão anterior

A decisão anterior previa POC de API, OAuth oficial, armazenamento backend de tokens, resolução URL → Product ID e uso de `ProductImportService` baseado em provider oficial.

Essa decisão não governa mais o Slice 002 e não deve ser usada como base para código novo. Nenhuma Connection OAuth, tabela de tokens, callback, scope ou adapter de API deve ser adicionado para cumprir o novo PRD.

## Motivo da substituição

- O novo PRD define Chromium + Browser Profile como caminho principal.
- O novo PRD proíbe armazenar login/senha e não pede TikTok OAuth ou TikTok Shop API.
- Browser Harness é infraestrutura oficial obrigatória, não uma capacidade a ser reimplementada.
- A autenticação e os desafios do TikTok pertencem ao usuário em um fluxo human-in-the-loop.

## Consequências

- O histórico desta decisão permanece para rastreabilidade, mas suas alternativas, scopes, tokens e Connection não são requisitos atuais.
- ProductCandidate, confirmação humana e fallback manual continuam válidos somente na forma definida pelo ADR-008 e ADR-011.
- Qualquer retomada de API oficial exige novo ADR baseado em evidência e não pode reativar silenciosamente este documento.

## Relações

- [ADR-008](./adr-008-entrada-de-produto-manual-first.md) — URL-first, confirmação e fallback.
- [ADR-011](./adr-011-importacao-browser-profile-e-harness.md) — decisão vigente.
- `docs/product/PRD-Importation-product.md` — fonte de produto vigente.
