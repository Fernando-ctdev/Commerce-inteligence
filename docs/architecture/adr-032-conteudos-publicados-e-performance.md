# ADR-032: Conteúdos publicados e performance como read model externo

## Status

Proposed — este ADR governa a decisão arquitetural; a SPEC do Slice 013 governa comportamento e aceite. Ambos estão Proposed, e a implementação permanece bloqueada até aprovação explícita da SPEC.

## Contexto

O contrato vigente trata `Content` e `ContentBriefVersion` como inteligência estratégica interna, com identidade, versões e lifecycle próprios. Vídeos já publicados e suas métricas pertencem a outra fonte e não podem ser apresentados como se fossem resultados gerados, aprovados ou concluídos pelo fluxo interno.

O usuário aprovou uma entrega localizada no detalhe de Product: leitura de fixtures sanitizadas para Vitrine, analytics de vídeos publicados e associação `item_id` (vídeo) → `product_id` (produto externo). Essa decisão é uma exceção explícita e limitada à regra anterior que mantinha analytics externo fora do MVP. PRD, DESIGN e SYSTEM-DESIGN não são alterados por este ADR. `teste.json` é evidência bruta e não pode ser lido como fixture até sanitização e rotação dos dados que exigir.

## Decisão

1. Introduzir somente um **read model externo transitório**, sem tabela, migration, cache persistente, fila, chamada TikHub ou outro egress. As três fontes globais, sem `tenantId`, são fixtures sanitizadas e separadas: Products da Vitrine (`product_id`), analytics paginado de vídeos (`item_id`) e associação `{ item_id, product_id }`.
2. O endpoint autenticado `GET /api/products/:id/linked-contents?page&pageSize` resolve o Product pelo Tenant da sessão e realiza o join server-side `Product.provenance.sourceId === association.product_id` e `association.item_id === analytics.item_id`. Ausência de `sourceId` retorna coleção vazia. A associação é many-to-many: um vídeo aparece uma vez no contexto de cada produto associado; par repetido, ou item/produto ausente, é falha de normalização fail-closed.
3. `PublishedVideo` é um DTO independente, com `itemId` para o vídeo e `productIds` para seus produtos externos associados. Nunca usa IDs, estados, payloads, versões ou relações de `Content`, `ContentBriefVersion`, Strategy, RecordingBatch ou Product Memory.
4. O adapter normaliza todas as páginas locais de analytics necessárias antes do join, sem inventar itens; a paginação pública é calculada depois do filtro por Product e conta vídeos distintos. O endpoint devolve somente campos de negócio e métricas explicitamente allowlisted nas fixtures, descarta chaves desconhecidas e preserva ausência como ausência. Cookies, `Authorization`, tokens de autenticação/provider, `request_id`, `cache_url`, envelope, documentação do provedor e payload bruto não atravessam a fronteira. A única exceção é `playbackUrl`/`fallbackPlaybackUrl`: capability URLs HTTPS `*.tiktokcdn.com` assinadas e expiráveis, permitidas exclusivamente pela decisão expressa de playback e nunca tratadas como credencial segura.
5. `main_url` e `backup_url` são fontes de vídeo. O DTO expõe `playbackUrl` e `fallbackPlaybackUrl` somente para URLs HTTPS em hosts `*.tiktokcdn.com` allowlisted nas fixtures sanitizadas; a UI usa `<video controls preload="none" playsInline>` e tenta o fallback uma única vez após erro da fonte principal.
6. URLs CDN assinadas e expiráveis são aceitas exclusivamente pela exigência explícita de playback desta entrega; não são alegadas como credenciais seguras. Não há proxy, renovação ou download: erro posterior ao fallback é recuperável na UI. Um media proxy só será considerado quando expiração mensurável ou requisitos de autenticação, CORS, auditoria ou retenção justificarem serviço, custo e política próprios.
7. Performance é observável apenas no contexto do Product e não entra na engine, memória, ranking, quota ou mutação automática de Strategy.

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Read model por fixtures, separado | Escolhida | Entrega a leitura aprovada sem inventar integração, persistência ou ownership de domínio. |
| Reutilizar `Content`/`ContentBriefVersion` | Rejeitada | Mistura vídeo externo com briefing interno e quebra proveniência/lifecycle. |
| Persistir analytics agora | Rejeitada | Exige schema, retenção, atualização, autorização e reconciliação antes de existir fonte real. |
| Proxy de mídia agora | Rejeitada | Oculta o teto de URLs assinadas e adiciona infraestrutura sem evidência. |

## Consequências

- A UI precisa nomear a área como conteúdos publicados/externos, não como Briefings ou execução interna.
- O contrato preserva paginação, `total` e `hasMore`, inclusive quando não há resultados ou quando campos de métrica estão ausentes.
- O CTA de roteiro derivado permanece visível, desabilitado e com motivo explícito; ele não chama geração nem altera entidade alguma.
- A implementação futura de fonte real requer novo ADR ou emenda: contrato, credenciais, autenticação, limites, retries, idempotência, retenção, proveniência, atualização e autorização terão de ser decididos então.

## Relações

- Slice 013 e sua SPEC são a fonte comportamental desta decisão.
- ADR-003 preserva a separação entre dados relacionais internos e analytics externo; esta decisão não cria armazenamento de analytics.
- ADR-015 mantém `Content`/`ContentBriefVersion` como domínio interno de revisão e execução.
- ADR-004 continua proibindo que performance externa alimente aprendizado ou otimização de geração nesta entrega.
