# Task 1 Report — Slice 013 (published content): contrato, fixtures sanitizadas e join determinístico

## Status

**DONE** — estado final após repairs 1 e 2. Suíte focada final: **20/20 pass**; `npm run typecheck` limpo. Cadeia de commits: `772e628` → `1d6cde1` → `8061310`.

> **ADENDO FINAL (repair 2, commit `8061310` `fix(slice-013): reject playback URL credentials`):** re-review exigiu 2 correções, aplicadas sem mudança de contrato/fixtures: (1) regressão TDD provando que playback com credenciais na URL (`https://user:pass@v58.tiktokcdn.com/...`) fica sem `playbackUrl` — `playbackUrl` agora rejeita `parsed.username || parsed.password`; host permitido com assinatura na query continua aceito; (2) este relatório corrigido (contagens finais e cadeia de commits). Resultado: vermelho 19/20 → verde **20/20**; typecheck limpo. Detalhes: `task-1-repair2-report.md`.

> **ADENDO (repair 1, commit `1d6cde1` `fix(slice-013): harden published content read model validation`) — histórico, estado intermediário 19/19:** a revisão (REQUEST_CHANGES) exigiu 5 correções fail-closed, todas aplicadas em backend puro — (1) `item_id` duplicado global na analytics rejeitado; (2) `association.product_id` precisa existir em `SHOWCASE_PRODUCT_FIXTURES`; (3) `business`/`metrics` filtrados por `BUSINESS_FIELD_ALLOWLIST`/`METRIC_FIELD_ALLOWLIST` da SPEC §6.1 (0/false/null preservados, sem derivação) e `gmv`/`directGmv`/`itemSoldCnt` movidos para `metrics` nas 10 fixtures; (4) sequência de páginas estrita (início em 1, `pageSize` único, intermediárias cheias com `hasMore: true`, última `false`, totais coerentes); (5) `product.id` vazio/malformado rejeitado e hostname `*.tiktokcdn.com` validado por regex. Detalhes: `task-1-repair-report.md` (referência válida, na mesma pasta).

## Commits (cadeia final: `772e628` → `1d6cde1` → `8061310`)

- `8061310` `fix(slice-013): reject playback URL credentials` — repair 2: guard de userinfo em `playbackUrl` + regressão (2 arquivos, 29 inserções).
- `1d6cde1` `fix(slice-013): harden published content read model validation` — repair 1: validações fail-closed dos 5 findings (3 arquivos, 276 inserções / 42 deleções).
- `772e628` `feat(slice-013): add published content read model` — implementação original; branch `feat/ceonteudos-creator`; 4 arquivos, 718 inserções:
  - `src/modules/products/published-content-contract.ts` (novo) — tipos públicos (`PublishedContentScalar`, `ShowcaseLabel`, `ShowcaseProduct`, `PublishedVideo`, `LinkedContentsResponse`), sem Prisma/Request/cookies/banco.
  - `src/modules/products/published-content-fixtures.ts` (novo) — tipos de origem (snake_case) + fixtures: `SHOWCASE_PRODUCT_FIXTURES` (reuso de `listShowcaseItems()`, sem duplicar os 20 itens), `PUBLISHED_VIDEO_ANALYTICS_PAGES` (2 páginas locais coerentes, 5+5, ordem original da resposta), `PUBLISHED_VIDEO_ITEM_ASSOCIATIONS` (2 pares `{item_id, product_id}` da nota `post-https-api-tikhub-io-ap-2`).
  - `src/modules/products/published-content.ts` (novo) — `PublishedContentFixtureError`, `readSourceId`, `emptyResponse`, `playbackUrl`, `projectVideo`, `validatedSource`, `buildLinkedContents(product, page, pageSize, source?)` (4º parâmetro opcional só para testes de falha; chamada de produção é a do brief).
  - `src/modules/products/published-content.test.ts` (novo; 12 testes naquele commit, 20 no estado final) — testes puros (sem DB/rede): join por `sourceId`/`product_id`/`item_id`, coleção vazia sem `sourceId`, many-to-many com `productIds` distintos e ordenados, associação duplicada fail-closed, referência sem analytics fail-closed, ordem da fixture, `total` distinto antes do recorte, página além do fim, descarte de chaves desconhecidas (shape exato projetado), allowlist de playback (host inválido descartado sem erro; backup válido permanece), página/pageSize inválidos fail-closed, coerência da fixture padrão.

## Ciclo TDD

1. Testes escritos antes da implementação — run inicial **FAIL** (módulos inexistentes), conforme esperado.
2. Implementação dos 3 arquivos.
3. Correções durante o ciclo: helper de teste olhava só a página 1 (itens alvo estão na página 2) e asserção de shape não incluía `fallbackPlaybackUrl` (backup_url válida na fixture) — ambas eram asserções do teste, não do runtime.

## Comando e resultado do teste focado

**Estado final (após repairs 1 e 2, commit `8061310`):**

```
npx tsx --test src/modules/products/published-content.test.ts
# tests 20 | pass 20 | fail 0 | cancelled 0 | skipped 0   (719 ms)
```

`npm run typecheck` (`tsc --noEmit`): sem erros. Formatter/lint/suite completa **não** rodados, conforme instrução.

**Histórico (contagens rotuladas por commit):** `772e628` — 12 testes, 12/12 pass (922 ms), typecheck limpo; `1d6cde1` — 19 testes (7 regressões da revisão), 19/19 pass, typecheck limpo; `8061310` — 20 testes (regressão de userinfo), vermelho 19/20 antes do guard → 20/20 pass, typecheck limpo.

## Rulings aplicados

- `teste.json` nunca lido em runtime, teste ou geração (as fixtures vêm das notas conectadas `post-https-api-tikhub-io-ap` e `post-https-api-tikhub-io-ap-2`, extraídas por script que copia somente os campos allowlisted).
- `post_url` assinado **não** usado como `coverUrl`: nenhuma capa foi copiada (todas as thumbnails da nota são URLs assinadas); campo fica ausente e a UI usa o fallback visual.
- Money normalizado ao escalar `amount_formatted` (`gmv`/`directGmv` como string; `commission` da Vitrine via `commissionWithCurrency`).
- `total` público = vídeos distintos do Product após o join; metadados de página da origem servem só à validação da fixture.
- Valores zero/falso/nulo preservados (`ctr: "0.0000"`, `itemSoldCnt: 0`, `newFollowerCnt: 0`).
- Playback: somente `main_url`/`backup_url` com host https `*.tiktokcdn.com` (hosts observados: `v58/v16m/v45.tiktokcdn.com`); nenhuma URL de player inventada; query strings nunca logadas.

## Concerns

1. **21 × 10 itens de analytics (esperado, registrado):** a nota aprovada `post-https-api-tikhub-io-ap` contém exatamente **10** `stats` (`"item_id"` ocorre 10 vezes no arquivo inteiro); o `total: 21`/`total_page: 3` do upstream é metadado de paginação — as páginas 2–3 não vieram na resposta capturada. A fixture preserva os 10 reais em páginas locais coerentes (5+5, `total: 10`, última `hasMore: false`); os 11 itens ausentes **não foram inventados**. Se as páginas restantes forem capturadas depois, basta estender `PUBLISHED_VIDEO_ANALYTICS_PAGES`.
2. **Apenas 2 associações item→produto** na nota `…-ap-2`; ambas apontam para `product_id` presentes na Vitrine (`1736673359055521380`, `1733261213619029438`). Os outros 8 vídeos ficam na fixture, porém sem Product vinculado (coleção vazia para eles) — comportamento fail-closed correto do join.
3. **`teste.json` aparece deletado na árvore de trabalho** (`git status`: ` D teste.json`, não staged). Não fui eu — nenhuma operação minha tocou o arquivo; não foi incluído no commit. Requer decisão do usuário (restaurar com `git checkout -- teste.json` ou confirmar a exclusão).
4. Fonte injetável (4º parâmetro opcional de `buildLinkedContents`) existe exclusivamente para os testes de falha; o handler (Task 2) deve chamar a assinatura de 3 argumentos e importar só `published-content.ts`/contrato — nunca os internals de fixture (ruling 1→2 do ledger).
