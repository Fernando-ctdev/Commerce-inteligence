# Slice 013 — Conteúdos publicados e performance vinculada ao Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task with a review gate after each task. Steps use checkbox syntax for tracking.

**Goal:** Entregar no detalhe do Product uma leitura mockada, tenant-scoped e paginada de vídeos publicados associados ao item externo, com métricas allowlisted, playback sob demanda e fallback de vídeo.

**Architecture:** O servidor mantém três fontes locais sanitizadas: o catálogo de Products da Vitrine já existente, páginas de analytics de vídeos e pares de associação vídeo–produto. O handler resolve o Product pelo Tenant da sessão, normaliza e faz o join server-side por `Product.provenance.sourceId === association.product_id` e `association.item_id === analytics.item_id`, depois pagina a coleção distinta do Product. A UI consome somente o DTO público por `GET /api/products/:id/linked-contents`; nenhum dado cru, `Content` interno ou provider real atravessa a fronteira.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma existente, CSS Modules, `tsx --test`, `node:assert/strict`, sem nova dependência.

**Spec:** `docs/specs/slice-013/SPEC.md`; decisão arquitetural em `docs/architecture/adr-032-conteudos-publicados-e-performance.md`.

## Global Constraints

- Não fazer chamada real a TikHub, TikTok ou outro provider nesta entrega.
- Não criar tabela, migration, cache persistente, fila, proxy de mídia ou armazenamento de vídeo.
- Fixtures são locais, sanitizadas, globais e não recebem `tenantId` do cliente.
- O Product é sempre buscado com o `tenantId` resolvido pela sessão server-side.
- `PublishedVideo` é independente de `Content`, `ContentBriefVersion`, Strategy, RecordingBatch e Product Memory.
- O join é somente por IDs externos estáveis; nunca por título, URL, seller ou posição.
- Campos desconhecidos, envelope, cookies, `Authorization`, tokens de autenticação/provider, `request_id`, `cache_url` e payload bruto são descartados e nunca logados.
- A única exceção de URL são `playbackUrl` e `fallbackPlaybackUrl` HTTPS em `*.tiktokcdn.com`, assinadas e expiráveis, usadas exclusivamente pelo player.
- `main_url` e `backup_url` são ambos vídeos; o player tenta o fallback no máximo uma vez.
- Nenhum zero, métrica, percentual, CTR ou valor derivado é fabricado.
- A área externa usa loading, vazio, erro, seleção, foco, teclado, alvo mínimo de 44×44 px e responsividade conforme `DESIGN.md`.
- O CTA de roteiro derivado fica visível, desabilitado e sem request.
- O `teste.json` existente é evidência bruta do usuário e não pode ser importado como fixture.

---

### Task 1: Criar contrato compartilhado, fixtures sanitizadas e join determinístico

**Files:**
- Create: `src/modules/products/published-content-contract.ts`
- Create: `src/modules/products/published-content-fixtures.ts`
- Create: `src/modules/products/published-content.ts`
- Test: `src/modules/products/published-content.test.ts`

**Interfaces:**
- Produces `PublishedVideo`, `LinkedContentsResponse`, `PublishedVideoAnalyticsPageFixture`, `PublishedVideoItemAssociationFixture` e os tipos escalares compartilhados para o cliente.
- Produces `buildLinkedContents(product, page, pageSize)` com entrada `{ id: string; provenance: unknown }` e saída `LinkedContentsResponse`.
- Throws a fixture-normalization error identificável quando uma página, associação, URL ou ID obrigatório é inválido.
- Reuses `listShowcaseItems()` de `src/modules/products/showcase.ts` para a fonte já allowlisted de Products da Vitrine; não duplica os 20 Products existentes.

- [ ] **Step 1: Escrever testes puros do contrato que falham antes da implementação**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildLinkedContents } from "./published-content.js";

test("join usa sourceId do Product, product_id da associação e item_id da analytics", () => {
  const response = buildLinkedContents(
    { id: "p-local", provenance: { sourceId: "product-external-1" } },
    1,
    20,
  );

  assert.deepEqual(response.videos.map((video) => video.itemId), ["video-1"]);
  assert.equal(response.externalProductId, "product-external-1");
  assert.equal(response.total, 1);
});
```

Também cubra, em testes separados, Product sem `sourceId` retornando coleção vazia, associação many-to-many, associação duplicada falhando fechada, referência sem analytics falhando fechada, ordem da fixture, `total` distinto antes do recorte, página além do fim e descarte de chaves desconhecidas.

- [ ] **Step 2: Executar o teste focado e confirmar a falha inicial**

Run: `npx tsx --test src/modules/products/published-content.test.ts`

Expected: FAIL porque contrato, fixture e função de join ainda não existem.

- [ ] **Step 3: Criar o contrato sem runtime server-only**

Defina em `published-content-contract.ts` os tipos públicos abaixo, sem importar Prisma, `Request`, cookies ou módulos de banco:

```ts
export type PublishedContentScalar = string | number | boolean | null;

export type ShowcaseLabel = {
  text?: string | null;
  type?: number | null;
  theme?: number | null;
  iconUrl?: string | null;
};

export type ShowcaseProduct = {
  externalProductId: string;
  title: string;
  categoryName?: string;
  priceLabel?: string;
  sellerName?: string;
  sellerId?: string | null;
  stockCount?: number | null;
  canAdd?: boolean | null;
  commission?: string | number | null;
  commissionRate?: number | null;
  commissionExpense?: number | null;
  labels?: ShowcaseLabel[] | null;
};

export type PublishedVideo = {
  itemId: string;
  productIds: string[];
  title?: string;
  coverUrl?: string;
  publishedAt?: string;
  playbackUrl?: string;
  fallbackPlaybackUrl?: string;
  business: Record<string, PublishedContentScalar>;
  metrics: Record<string, PublishedContentScalar>;
};


export type LinkedContentsResponse = {
  productId: string;
  externalProductId: string;
  showcaseProduct?: ShowcaseProduct;
  videos: PublishedVideo[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};
```

Os tipos de origem de analytics e associação ficam em `published-content-fixtures.ts`; o contrato compartilhado não importa Prisma, `Request`, cookies ou módulos de banco. Serialize somente os campos documentados na SPEC.

- [ ] **Step 4: Criar fixtures sanitizadas a partir das notas aprovadas**
Use tipos de origem separados do DTO público:

```ts
type PublishedVideoAnalyticsFixture = {
  item_id: string;
  title?: string;
  cover_url?: string;
  main_url?: string;
  backup_url?: string;
  published_at?: string;
  business: Record<string, PublishedContentScalar>;
  metrics: Record<string, PublishedContentScalar>;
};

type PublishedVideoAnalyticsPageFixture = {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: PublishedVideoAnalyticsFixture[];
};

type PublishedVideoItemAssociationFixture = {
  item_id: string;
  product_id: string;
};
```

`PublishedVideoAnalyticsPageFixture` usa os nomes de origem somente dentro do fixture; `projectVideo` produz o contrato camelCase compartilhado.

Em `published-content-fixtures.ts`:

1. Reuse `listShowcaseItems()` para Products da Vitrine; projete apenas `id`, título, categoria, preço, seller, estoque, comissão, labels e os demais campos allowlisted.
2. Copie manualmente das notas `post-https-api-tikhub-io-ap` somente os campos normalizados de analytics: `item_id`, nome/título, data de publicação, thumbnail quando disponível, `main_url`, `backup_url`, métricas `new_follower_cnt`, `vv_cnt`, `ctr`, `gmv`, `direct_gmv`, `item_sold_cnt` e `completion_rate`. Normalize os nomes para camelCase e preserve valores zero, falso e nulo.
3. Organize os 21 itens da resposta aprovada em páginas locais coerentes com `page`, `pageSize`, `total` e `hasMore`; não preencha itens ausentes entre páginas.
4. Copie da nota `post-https-api-tikhub-io-ap-2` somente pares `{ item_id, product_id }` e os dados de produto necessários para a associação. Não copie cookies, envelope, `cache_url`, `request_id`, URLs de imagens não usadas ou payload bruto.
5. Não leia `teste.json` no runtime, no teste ou em script de geração.

Use hosts HTTPS `*.tiktokcdn.com` somente nos dois campos de playback; rejeite qualquer URL de outro host durante a normalização. Não adicione uma URL de player alternativa inventada.

- [ ] **Step 5: Implementar normalização e join server-side**

Implemente `buildLinkedContents` com estes helpers internos, todos cobertos pelos testes:

- `readSourceId(value: unknown): string | null` aceita somente `provenance` objeto com `sourceId` string não vazia.
- `emptyResponse(productId: string, page: number, pageSize: number): LinkedContentsResponse` retorna `videos: []`, `total: 0` e `hasMore: false`.
- `projectVideo(...)` copia somente campos allowlisted e valida playback URLs.

A sequência de associação e recorte deve preservar a ordem da fixture de analytics:

```ts
const externalProductId = readSourceId(product.provenance);
if (!externalProductId) return emptyResponse(product.id, page, pageSize);

const associatedIds = new Set(
  associations
    .filter((edge) => edge.product_id === externalProductId)
    .map((edge) => edge.item_id),
);
const videos = analyticsItems.filter((item) => associatedIds.has(item.item_id));
const selected = videos.slice((page - 1) * pageSize, page * pageSize);
```

Valide antes do recorte: IDs não vazios, nenhuma associação duplicada, nenhuma referência de analytics ausente, páginas contíguas e metadados coerentes. Gere `productIds` distintos e ordenados deterministicamente para cada vídeo. Normalize URLs sem logar query strings; ausência ou host inválido deixa o campo opcional ausente. O `total` público é o número de vídeos distintos associados ao Product, não o `total` bruto de uma página de origem.

- [ ] **Step 6: Executar testes focados e confirmar o contrato completo**

Run: `npx tsx --test src/modules/products/published-content.test.ts`

Expected: PASS para join correto, isolamento de dados operacionais, many-to-many, fail-closed, paginação local e URL de playback allowlisted.

- [ ] **Step 7: Commitar a unidade de backend puro**

```bash
git add src/modules/products/published-content-contract.ts src/modules/products/published-content-fixtures.ts src/modules/products/published-content.ts src/modules/products/published-content.test.ts
git commit -m "feat(slice-013): add published content read model"
```

---

### Task 2: Expor o endpoint autenticado e tenant-scoped

**Files:**
- Modify: `src/modules/products/http.ts`
- Create: `src/app/api/products/[id]/linked-contents/route.ts`
- Test: `src/modules/products/published-content-http.test.ts`

**Interfaces:**
- Produces `handleGetLinkedContents(req: Request, id: string): Promise<Response>` from `src/modules/products/http.ts`.
- Route exports `GET` and awaits `params: Promise<{ id: string }>` using the Next.js 16 route convention already used by `/api/products/[id]/history`.
- Error bodies use the stable codes `AUTH-SESSION`, `LINKED-CONTENTS-PAGINATION`, `PRODUCT-NOT-FOUND` and `LINKED-CONTENTS-UNAVAILABLE`.

- [ ] **Step 1: Escrever os casos HTTP que falham**

Cubra sem sessão, Product de outro Tenant, Product sem `sourceId`, query default, `page=0`, decimal, negativo, texto, `pageSize=51`, overflow, sucesso, página além do fim e fixture inválida. O caso sem sessão deve afirmar o contrato existente:

```ts
assert.deepEqual(await response.json(), {
  error: "Sessão necessária para acessar conteúdos publicados.",
  code: "AUTH-SESSION",
});
```

- [ ] **Step 2: Executar o teste HTTP focado e confirmar falha inicial**

Run: `npx tsx --test src/modules/products/published-content-http.test.ts`

Expected: FAIL porque o handler e a rota ainda não existem.

- [ ] **Step 3: Implementar parsing seguro de paginação**

Dentro do handler, leia `page` e `pageSize` com `URL(req.url).searchParams`. Ausência usa `page=1` e `pageSize=20`; aceite somente strings decimais que representem inteiros positivos dentro dos limites `page <= 10_000` e `1 <= pageSize <= 50`. Rejeite zero, sinal, decimal, texto, repetição ambígua e qualquer multiplicação que exceda `Number.MAX_SAFE_INTEGER`; responda `400` com `LINKED-CONTENTS-PAGINATION` antes de consultar o Product.

- [ ] **Step 4: Implementar autenticação, tenant lookup e projeção**

Reuse `sessionOf(req)` e `jsonBody` de `src/modules/products/http.ts`; não duplique a leitura de cookie. Consulte somente `{ id, provenance }` com `where: { id, tenantId: session.tenantId }`. Retorne `404 PRODUCT-NOT-FOUND` para inexistente ou outro Tenant. Passe o Product mínimo ao `buildLinkedContents`; converta erro de fixture para `500 LINKED-CONTENTS-UNAVAILABLE` com envelope sanitizado. Não inclua stack, fixture, URL, query string ou objeto Prisma no erro.

- [ ] **Step 5: Adicionar a rota App Router**

```ts
import { handleGetLinkedContents } from "@/modules/products/http";

type ProductRouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: ProductRouteContext) {
  const { id } = await params;
  return handleGetLinkedContents(req, id);
}
```

- [ ] **Step 6: Executar os testes HTTP focados**

Run: `npx tsx --test src/modules/products/published-content-http.test.ts src/modules/products/published-content.test.ts`

Expected: PASS para autenticação, isolamento de Tenant, validação de query, erros estáveis e resposta paginada.

- [ ] **Step 7: Commitar o endpoint**

```bash
git add src/modules/products/http.ts src/app/api/products/[id]/linked-contents/route.ts src/modules/products/published-content-http.test.ts
git commit -m "feat(slice-013): expose linked contents endpoint"
```

---

### Task 3: Criar o cliente tipado do read model

**Files:**
- Create: `src/components/products/published-contents-api.ts`
- Test: `src/components/products/published-contents-api.test.ts`

**Interfaces:**
- Produces `loadPublishedContents(productId: string, page?: number, pageSize?: number): Promise<LinkedContentsResponse>`.
- Consumes the shared types from `src/modules/products/published-content-contract.ts` with `import type` only.
- Reuses `ProductApiError` for status, code and sanitized message handling.

- [ ] **Step 1: Escrever testes do request e dos erros**

```ts
test("carrega página com query e credenciais same-origin", async () => {
  const result = await loadPublishedContents("prod/1", 2, 10);
  assert.equal(mock.calls[0].input, "/api/products/prod%2F1/linked-contents?page=2&pageSize=10");
  assert.equal((mock.calls[0].init?.credentials), "same-origin");
  assert.equal(result.page, 2);
});
```

Cubra erro sanitizado preservando `status` e `code`, falha de rede como status zero e payload sem `videos` sendo rejeitado em vez de projetado silenciosamente.

- [ ] **Step 2: Executar o teste para confirmar a falha inicial**

Run: `npx tsx --test src/components/products/published-contents-api.test.ts`

Expected: FAIL porque o loader ainda não existe.

- [ ] **Step 3: Implementar o loader mínimo**

Use `fetch` com `GET`, `credentials: "same-origin"` e `Accept: "application/json"`. Encode somente o Product ID no path; passe números como query. Em resposta não-2xx, leia apenas `{ error, code }` e lance `ProductApiError`. Em resposta 2xx, valide a presença de `videos`, `page`, `pageSize`, `total` e `hasMore`; não normalize métricas no cliente nem aceite chaves operacionais.

- [ ] **Step 4: Executar o teste focado**

Run: `npx tsx --test src/components/products/published-contents-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commitar o cliente**

```bash
git add src/components/products/published-contents-api.ts src/components/products/published-contents-api.test.ts
git commit -m "feat(slice-013): add linked contents client"
```

---

### Task 4: Construir a UI master-detail de conteúdos publicados

**Files:**
- Create: `src/components/products/published-contents-view.tsx`
- Create: `src/components/products/published-contents-view.module.css`
- Test: `src/components/products/published-contents-view.test.tsx`

**Interfaces:**
- Produces `PublishedContentsView({ active: boolean; productId: string })`.
- Consumes `loadPublishedContents`, `LinkedContentsResponse` e `PublishedVideo`.
- Renderiza desktop master-detail e mobile empilhado sem carrossel.

- [ ] **Step 1: Escrever testes de markup para os invariantes do contrato**

Use o padrão existente de `renderToStaticMarkup` e mock CSS. Verifique que uma resposta com métricas presentes renderiza título, data, valores zero, botão de seleção, `<video controls preload="none" playsInline>`, CTA disabled e ausência explícita para campo inexistente. Verifique que markup não contém `ContentBriefVersion`, geração ou request de roteiro.

- [ ] **Step 2: Executar o teste para confirmar falha inicial**

Run: `npx tsx --test src/components/products/published-contents-view.test.tsx`

Expected: FAIL porque o componente ainda não existe.

- [ ] **Step 3: Implementar estados e carga sob demanda**

Mantenha estado local para `response`, `selectedItemId`, `error`, `loading`, `loadingMore`, `currentPage` e `fallbackUsed`. O efeito só dispara quando `active` for verdadeiro; ao mudar `productId`, invalide resposta e seleção anteriores. A primeira entrada é selecionada somente na primeira página quando não houver seleção; carregar páginas seguintes nunca troca a seleção. Ignore respostas que chegarem depois de Product ou aba terem mudado.

Implemente retry local apenas para o erro do endpoint/fixture; não faça chamada externa nem retry de rede automático. Para página posterior vazia, preserve itens já renderizados e desligue `Carregar mais`.

- [ ] **Step 4: Implementar o master list**

Renderize contagem contextual `Conteúdos vinculados (total)`, preserve a ordem da fixture/endpoint e não adicione busca ou ordenação client-side que possa sugerir dados fora das páginas carregadas. Cada item deve ter botão de seleção acessível, título, data, thumbnail opcional ou fallback visual, duração somente se estiver presente no DTO, e métricas disponíveis sem substituir zero por ausência.

- [ ] **Step 5: Implementar o detail e playback**

Renderize o conteúdo selecionado com `<video controls preload="none" playsInline>`. `playbackUrl` e `fallbackPlaybackUrl` são as únicas fontes; em `onError`, troque uma única vez para fallback diferente e, após nova falha, mostre erro no player sem loop. Não use autoplay, `fetch`, download ou proxy. O fallback deve ser resetado ao selecionar outro item.

Renderize todas as entradas `business` e `metrics` allowlisted presentes. Use `—` para ausência, preserve `0`, `false` e `null`, e não calcule CTR, porcentagens, totais financeiros ou scores. Labels de chaves conhecidas podem usar um mapa estático; chaves desconhecidas nunca devem chegar da API.

Inclua o CTA “Gerar roteiro derivado” com `disabled`, texto explicando que é etapa futura e nenhum `onClick` de geração.

- [ ] **Step 6: Implementar acessibilidade e CSS responsivo**

Use foco visível, `aria-selected`/`aria-pressed` coerente, título do detail focável após seleção no mobile, `aria-live="polite"` no loading e `role="alert"` no erro. Garanta alvos de 44×44 px. Em desktop use duas colunas; em até 767 px empilhe lista e detalhe, sem overflow horizontal, carrossel ou swipe obrigatório. Respeite `prefers-reduced-motion: reduce`.

- [ ] **Step 7: Executar o teste focado**

Run: `npx tsx --test src/components/products/published-contents-view.test.tsx src/components/products/published-contents-api.test.ts`

Expected: PASS nos estados renderizados, atributos do player, CTA disabled, métricas e fallback documentado.

- [ ] **Step 8: Commitar a UI isolada**

```bash
git add src/components/products/published-contents-view.tsx src/components/products/published-contents-view.module.css src/components/products/published-contents-view.test.tsx
git commit -m "feat(slice-013): render published contents detail"
```

---

### Task 5: Integrar o read model ao detalhe do Product sem perder o fluxo interno

**Files:**
- Modify: `src/components/products/product-detail.tsx`
- Modify: `src/components/products/generation-toast.tsx` only if the hash target requires it
- Modify: `src/components/products/generation-views.tsx` only for an existing generated-content anchor label if required
- Test: `src/components/products/generation-views.test.tsx` when existing deep-link markup changes

**Interfaces:**
- `Conteúdos` becomes the external `PublishedContentsView` and loads only while active.
- `Roteiros` retains the existing internal `StrategyView`, `GenerationActions` and `ContentsView`; no `PublishedVideo` is passed to those components.
- Existing `/products/:id#generated-contents` generation deep-link continues opening the internal Roteiros panel, while the external tab uses a separate `#published-contents` target.

- [ ] **Step 1: Add the new view to ProductDetail without changing the active default**

Import `PublishedContentsView`. In `SectionSwitcherContent value="contents"`, render only the external view with `active={tab === "contents"}` and `productId={product.id}`. Preserve `Conteúdos` as the initial tab so opening the Product loads the approved read model.

- [ ] **Step 2: Preserve internal generated briefings under Roteiros**

Move the existing `GenerationActions` and `ContentsView` markup from the external Contents panel into the existing `strategy` panel next to `StrategyView`. Keep their existing props and generation behavior unchanged. This keeps internal `Content` reachable without presenting it as a published external video.

- [ ] **Step 3: Separate deep-link hashes**

Change the tab hash mapping so `#generated-contents` selects `strategy` and `#published-contents` selects `contents`. Update `changeTab` to write the matching hash. Keep the global generation toast link working and do not change its user-visible copy unless the existing target becomes ambiguous.

- [ ] **Step 4: Run existing generation tests and the new focused set**

Run: `npx tsx --test src/components/products/generation-views.test.tsx src/components/products/published-contents-view.test.tsx src/components/products/published-contents-api.test.ts`

Expected: existing generated-briefing behavior remains green and the new external panel mounts with the approved tab/URL behavior.

- [ ] **Step 5: Commit the integration**

```bash
git add src/components/products/product-detail.tsx src/components/products/generation-toast.tsx src/components/products/generation-views.tsx src/components/products/generation-views.test.tsx
git commit -m "feat(slice-013): integrate published contents into product"
```

Only include files that actually changed; do not create a no-op commit for untouched files.

---

### Task 6: Review, browser smoke test and full validation

**Files:**
- Modify only files required by review findings.
- Test: existing focused tests plus project validation commands.

**Interfaces:**
- The completed flow is observable at `/products/:id` for an authenticated Product with `provenance.sourceId` matching the sanitized association fixture.
- No raw fixture, provider envelope or auth secret is visible in the response or browser console.

- [ ] **Step 1: Ask Code Reviewer to inspect the implementation diff**

Review specifically tenant lookup, source ID join direction, fixture fail-closed behavior, stable errors, URL allowlist, query-string logging, direct playback exposure, DTO separation from internal Content and absence of migrations/provider calls. Apply only evidence-backed blockers.

- [ ] **Step 2: Ask QA Engineer to execute the acceptance matrix**

Cover authenticated success, no session, other Tenant Product, missing sourceId, empty state, invalid pagination, page beyond end, fixture error, selection persistence, loading/error/focus, mobile stack, desktop master-detail, principal playback failure, one fallback attempt, fallback failure and disabled CTA.

- [ ] **Step 3: Launch the actual application for browser smoke**

Run: `npm run dev`

Use the browser against the real Product detail surface. Verify visually that Conteúdos loads on tab open, list/detail hierarchy matches `DESIGN.md`, selecting a row updates the detail, the video request starts only on Play, fallback does not loop, and mobile width stacks without horizontal scroll. Stop the dev server after the smoke test.

- [ ] **Step 4: Run focused tests**

Run: `npx tsx --test src/modules/products/published-content.test.ts src/modules/products/published-content-http.test.ts src/components/products/published-contents-api.test.ts src/components/products/published-contents-view.test.tsx src/components/products/generation-views.test.tsx`

Expected: PASS with no skipped new coverage.

- [ ] **Step 5: Run repository validation**

Run:

```bash
npm run lint
npm run typecheck
npm test
npx next build
```

Expected: lint, typecheck, test and Next build pass. If the Windows Prisma engine rename reproduces the already-known `npm run build` EPERM, report that exact limitation separately; do not hide or reinterpret it as a passing build.

- [ ] **Step 6: Inspect the final change boundary**

Run: `git diff --check && git status --short`

Expected: only intended Slice 013 implementation files remain changed; the user-owned `teste.json` may remain modified in the worktree and is not staged by this work.

- [ ] **Step 7: Commit review corrections and notify the squad**

Use the smallest applicable Conventional Commit, for example:

```bash
git add src/modules/products/published-content-contract.ts src/modules/products/published-content-fixtures.ts src/modules/products/published-content.ts src/modules/products/published-content.test.ts src/modules/products/published-content-http.test.ts src/modules/products/http.ts src/app/api/products/[id]/linked-contents/route.ts src/components/products/published-contents-api.ts src/components/products/published-contents-api.test.ts src/components/products/published-contents-view.tsx src/components/products/published-contents-view.module.css src/components/products/published-contents-view.test.tsx src/components/products/product-detail.tsx src/components/products/generation-toast.tsx src/components/products/generation-views.tsx src/components/products/generation-views.test.tsx
git commit -m "fix(slice-013): close published content review findings"
```

Notify the squad with the validation evidence and the exact remaining limitation, if any.

## Self-review

- **Spec coverage:** Tasks 1–2 cover sanitized fixtures, server-side join, tenant isolation, stable errors, normalization and pagination; Tasks 3–5 cover the public DTO, automatic load, master-detail/stack, playback, fallback, metrics, accessibility and disabled CTA; Task 6 covers browser behavior and every acceptance state.
- **No new infrastructure:** no provider client, migration, table, queue, proxy, cache or dependency is introduced.
- **Type consistency:** the shared contract is created before the server adapter, route, client loader and UI; all later tasks consume `LinkedContentsResponse` and `PublishedVideo` from that contract.
- **Boundary safety:** `teste.json` is never read by runtime or tests; direct URLs are limited to the approved playback fields and hosts.
- **Existing behavior:** generated internal Contents remain under Roteiros and the generation deep-link remains distinct from published external contents.
- **Verification:** focused tests precede integration, browser smoke exercises the actual page, and lint/typecheck/full test/build run before completion.
