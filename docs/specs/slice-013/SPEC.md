# SPEC — Slice 013: Conteúdos publicados e performance vinculada ao Produto

**Status:** Proposto — ADR governa a decisão arquitetural; esta SPEC governa comportamento e aceite. Ambos estão Proposed; a implementação aguarda revisão e aprovação explícita do usuário.
**Dependência:** Slice 002 (`Product` tenant-scoped com `provenance.sourceId`). Não depende do Slice 003.
**ADR:** ADR-032 (Proposed).
**Domain Areas:** Product (leitura), read model externo de conteúdos publicados, associação item→Product e apresentação localizada de performance.

## 1. User Outcome

Ao abrir a área Conteúdos de um Product, o creator vê automaticamente os vídeos publicados associados ao item da Vitrine daquele Product, seus campos de negócio e métricas disponíveis, seleciona um vídeo para inspecionar e reproduz o vídeo sob demanda. A experiência não apresenta esses vídeos como `Content` interno, Briefing, aprovação, gravação ou sinal para a engine.

## 2. Contexto e fontes de autoridade

O fluxo interno vigente é `Product → Strategy → Content/Briefing → revisão → execução`. `Content` e `ContentBriefVersion` pertencem à Commerce Intelligence e têm identidade, versionamento e proveniência próprios. O usuário aprovou uma leitura externa delimitada, separada e mockada para vídeos publicados e performance no contexto do Product.

Fontes: ADR-003, ADR-004, ADR-015, ADR-032, `SLICES.md`, SPECs 002/003/010/012 e o pedido explícito do usuário. Há exceção localizada aprovada pelo usuário ao escopo anterior de analytics externo: ela não altera `PRD.md`, `DESIGN.md` ou `SYSTEM-DESIGN.md`, nem amplia outros slices. `teste.json` é evidência bruta, não fixture: não pode ser consumido antes de sanitização e rotação necessárias.

## 3. Goals

- Expor, em leitura autenticada e tenant-scoped, vídeos externos associados ao Product e todos os campos de negócio allowlisted nas fixtures, inclusive métricas presentes.
- Manter `PublishedVideo` totalmente separado de `Content` e `ContentBriefVersion`.
- Preservar associação many-to-many, ordenação da fixture, `page`, `pageSize`, `total` e `hasMore` sem fabricar resultados ou métricas.
- Permitir playback sob demanda com fallback único e falha recuperável.
- Manter o CTA de roteiro derivado descobrível, mas inequivocamente indisponível nesta entrega.

## 4. In Scope

- Três fixtures sanitizadas, separadas e locais: `ShowcaseProduct`, `PublishedVideoAnalyticsPage` e `PublishedVideoItemAssociation`.
- Normalização allowlisted de cada fixture para os DTOs desta SPEC.
- Join exclusivamente server-side por `Product.provenance.sourceId === association.product_id` e `association.item_id === analytics.item_id`.
- `GET /api/products/:id/linked-contents?page&pageSize` autenticado e tenant-scoped.
- Paginação de vídeos associados, incluindo `total` e `hasMore`.
- Carga automática ao abrir Conteúdos, seleção explícita, master-detail em desktop e pilha em mobile sem carrossel.
- Estados de loading, vazio, erro, seleção, foco, paginação e playback.
- Exceção visual localizada: a área Conteúdos recebe esta visão de vídeos externos e performance, conforme decisão expressa do usuário. Ela não cria destino global, dashboard, KPI solto ou alteração de `DESIGN.md`.

## 5. Out of Scope

- TikHub, TikTok, outro provider, rede, OAuth, credenciais, cookies, tokens de autenticação/provider, scraping, polling, retry, refresh, webhooks ou sincronização real. A única exceção de leitura é `playbackUrl`/`fallbackPlaybackUrl`: capability URLs HTTPS `*.tiktokcdn.com` assinadas e expiráveis, permitidas exclusivamente para playback e nunca tratadas como credencial segura.
- Tabela, migration, cache persistente, fila, serviço, proxy de mídia ou armazenamento de vídeo.
- Mutação de Product, Content, ContentBriefVersion, Strategy, batch, memória, quota ou entitlement.
- Geração, edição, aprovação, publicação, agendamento ou roteiro derivado.
- Aprendizado, ranking, recomendação, atribuição, ROAS, CTR calculado ou alteração automática de Strategy/nova geração.
- Exposição de envelope, cookies, `Authorization`, tokens de autenticação/provider, `request_id`, `cache_url`, documentação do provider, payload bruto ou campos operacionais não allowlisted; a exceção limitada são somente as capability URLs de playback já definidas nesta SPEC.

## 6. Contratos e DTOs

### 6.1 Fixtures de origem

As fixtures são dados não confiáveis e não são respostas brutas de provider:

```ts
type ShowcaseProductFixture = {
  product_id: string;
  title: string;
  category_name?: string;
  price_label?: string;
  seller_name?: string;
  seller_id?: string | null;
  stock_count?: number | null;
  can_add?: boolean | null;
  commission?: string | number | null;
  commission_rate?: number | null;
  commission_expense?: number | null;
  labels?: ShowcaseLabelFixture[] | null;
};

type ShowcaseLabelFixture = {
  text?: string | null;
  type?: number | null;
  theme?: number | null;
  iconUrl?: string | null;
};

type PublishedVideoAnalyticsFixture = {
  // Vem de video_meta.item_id: identifica o vídeo, não o produto.
  item_id: string;
  title?: string;
  cover_url?: string;
  main_url?: string;
  backup_url?: string;
  published_at?: string;
  business: Record<string, string | number | boolean | null>;
  metrics: Record<string, string | number | boolean | null>;
};

type PublishedVideoAnalyticsPageFixture = {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: PublishedVideoAnalyticsFixture[];
};

type PublishedVideoAnalyticsPagesFixture = {
  pages: PublishedVideoAnalyticsPageFixture[];
};

type PublishedVideoItemAssociationFixture = {
  item_id: string; // vídeo
  product_id: string; // produto externo
};
```

As fixtures são globais e não carregam `tenantId`; o Tenant vem exclusivamente do Product autenticado. As listas fechadas normalizadas são:

```ts
type BusinessField =
  | "productTitle" | "title" | "categoryName" | "priceLabel"
  | "sellerName" | "sellerId" | "stockCount" | "canAdd"
  | "commission" | "commissionRate" | "commissionExpense" | "labels";

type MetricField =
  | "views" | "vvCnt" | "newFollowerCnt" | "ctr" | "gmv"
  | "directGmv" | "itemSoldCnt" | "completionRate" | "likes"
  | "comments" | "shares" | "productClicks" | "productUnits"
  | "productRevenue";
```

`BUSINESS_FIELD_ALLOWLIST` e `METRIC_FIELD_ALLOWLIST` são exatamente esses conjuntos. A normalização pode mapear nomes raw para esses nomes camelCase, mas todo campo de negócio/métrica fora das listas é descartado e nenhum campo fora delas entra no DTO. Cada chave allowlisted presente é mantida, inclusive valor `0`, `false` ou `null`; chave ausente permanece ausente. A normalização não cria zero, média, percentual, CTR, ROAS ou outro valor derivado, nem usa `teste.json` para completar campos.

`PublishedVideoItemAssociation` é a associação canônica. `item_id` ou `product_id` vazio, referência sem analytics/Product de fixture, ou par `{ item_id, product_id }` repetido é erro de normalização fail-closed: a API responde erro sanitizado e não infere vínculo.

`PublishedVideoAnalyticsPagesFixture.pages` é a sequência local de `PublishedVideoAnalyticsPageFixture`. O adapter lê e normaliza todas as páginas locais necessárias antes do join; `page`, `pageSize`, `total` e `hasMore` descrevem cada página de origem e não são reaproveitados como a paginação do endpoint. O adapter não inventa itens, não preenche lacunas entre páginas e falha fechada para metadados de página inválidos ou itens repetidos conflitantes.

### 6.2 Resposta pública

```ts
type PublishedVideo = {
  itemId: string;
  productIds: string[];
  title?: string;
  coverUrl?: string;
  publishedAt?: string;
  playbackUrl?: string;
  fallbackPlaybackUrl?: string;
  business: Record<string, string | number | boolean | null>;
  metrics: Record<string, string | number | boolean | null>;
};

type LinkedContentsResponse = {
  productId: string;
  externalProductId: string;
  showcaseProduct?: {
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
  videos: PublishedVideo[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

type ShowcaseLabel = {
  text?: string | null;
  type?: number | null;
  theme?: number | null;
  iconUrl?: string | null;
};
```

`playbackUrl` vem somente de `main_url` e `fallbackPlaybackUrl` somente de `backup_url`; ambos são URLs de vídeo, não thumbnail nem link documental. URL ausente, inválida, não HTTPS ou fora de `*.tiktokcdn.com` é omitida. A API não retorna URL de player inventada nem substitui um campo ausente pelo outro.

### 6.3 Endpoint

`GET /api/products/:id/linked-contents?page&pageSize`

- `:id` é o ID de Product; o servidor o busca com `tenantId` da sessão.
- Sessão ausente retorna `401 AUTH-SESSION`, herdado do contrato canônico de Identity, com o mesmo shape de erro sanitizado e estável usado pelos demais erros deste endpoint; não inclui Product, Tenant, cookies, `Authorization` ou detalhes de sessão.
- `page` é inteiro positivo, default `1`, máximo `10_000`; `pageSize` é inteiro positivo, default `20`, mínimo `1`, máximo `50`. Ausência usa defaults; decimal, sinal, texto, zero, limite excedido ou overflow de `page * pageSize` retornam `400 LINKED-CONTENTS-PAGINATION`.
- A paginação ocorre após a associação server-side, conta `itemId` distintos associados ao Product e preserva a ordem da fixture de analytics. `total` é a contagem distinta antes do recorte; `hasMore = page * pageSize < total`.
- Product inexistente ou de outro Tenant retorna `404 PRODUCT-NOT-FOUND`, sem revelar se ele existe para outro Tenant.
- `provenance.sourceId` ausente, vazio ou sem associação retorna `200` com `videos: []`, `total: 0` e `hasMore: false`; página além do fim retorna a mesma coleção vazia com `total` real e `hasMore: false`.
- Falha de normalização de fixture retorna `500 LINKED-CONTENTS-UNAVAILABLE` sanitizado; nunca vaza campo bruto, stack, cookies, `Authorization`, token de autenticação/provider ou envelope. Os únicos erros estáveis deste endpoint são `401 AUTH-SESSION`, `400 LINKED-CONTENTS-PAGINATION`, `404 PRODUCT-NOT-FOUND` e `500 LINKED-CONTENTS-UNAVAILABLE`.

## 7. Normalização e associação

```text
Product tenant-scoped
  ↓ provenance.sourceId
product_id da associação sanitizada
  ↓ many-to-many
item_id da analytics sanitizada
  ↓ normalize/allowlist/paginar
LinkedContentsResponse
```

Não há join pelo título, URL, seller, posição, conteúdo de briefing ou IDs de `Content`. Product manual sem `sourceId` não possui conteúdos vinculados nesta visão. Um vídeo aparece uma vez no contexto de cada Product associado; `productIds` contém os produtos externos distintos associados a esse vídeo. Vários vídeos do mesmo Product aparecem todos, respeitada a página.

## 8. Fluxo e estados HTTP/UI

Abrir Conteúdos dispara automaticamente um único GET para o Product corrente. Trocar de Product invalida a visualização anterior; somente a resposta do Product ainda ativo pode preencher a tela. `Carregar mais` usa a próxima página somente quando `hasMore` for verdadeiro e não há requisição pendente.

| Situação | HTTP/API | UI |
|---|---|---|
| Sem sessão | 401 `AUTH-SESSION` | estado autenticável, sem dados antigos |
| Product ausente/sem acesso | 404 | erro sanitizado no contexto do Product |
| Query inválida/overflow | 400 `LINKED-CONTENTS-PAGINATION` | erro recuperável; controles preservam página válida |
| Dados disponíveis | 200 | lista, detalhe da seleção e métricas presentes |
| `sourceId` ausente/vazio ou nenhuma associação | 200 vazio | estado vazio honesto, sem CTA de geração |
| Página posterior vazia | 200 vazio | mantém itens já carregados; não oferece mais carga |
| Fixture inválida | 500 `LINKED-CONTENTS-UNAVAILABLE` | erro recuperável; retry local permitido, sem chamada externa |
| Playback principal falha | não muda API | tenta fallback uma vez; depois exibe erro no player |

No desktop, a lista é o master e o vídeo selecionado é o detail ao lado. No mobile, lista e detalhe ficam empilhados; selecionar move o foco para o título do detalhe sem carrossel, swipe obrigatório ou reprodução automática. Ao chegar dados, a primeira entrada é selecionada somente se o usuário ainda não tiver feito seleção naquela carga; páginas posteriores não trocam a seleção.

## 9. Playback, acessibilidade e responsividade

- O player é `<video controls preload="none" playsInline>` e não reproduz automaticamente.
- Em erro de `playbackUrl`, troca para `fallbackPlaybackUrl` uma única vez se ela existir e for diferente; erro do fallback encerra a tentativa. Não há loop, retry automático, download ou proxy.
- URLs CDN assinadas e expiráveis são aceitas exclusivamente pela exigência explícita de playback. Não são tratadas nem apresentadas como credenciais seguras. A UI informa indisponibilidade sem culpar o creator; media proxy é evolução condicionada a evidência de expiração/CORS/autorização, conforme ADR-032.
- Lista, `Carregar mais`, seleção, player e CTA têm foco visível, teclado e alvo mínimo de `44×44px`; loading usa `aria-live="polite"` e erro `role="alert"`.
- Métricas não dependem apenas de cor, não viram gráfico ou scorecard e mostram ausência explicitamente quando o campo não existe.
- O CTA **Gerar roteiro derivado** é visível e `disabled`, com texto: “Disponível em uma etapa futura; esta visualização não gera roteiros.” Não realiza request.

## 10. Segurança e privacidade

- Fixtures são globais e não carregam `tenantId`. Sessão server-side resolve Tenant a partir do Product; cliente não escolhe `tenantId`, `externalProductId`, `itemId` ou conjunto de vídeos.
- O endpoint é somente leitura e não inicia job, não reserva quota e não escreve em Product, Content, Strategy, memória ou qualquer read model.
- Cookies, `Authorization`, tokens de autenticação/provider, `request_id`, `cache_url`, envelope, documentação e payload bruto de provider não entram nas fixtures/respostas nem são logados. A única exceção são `playbackUrl`/`fallbackPlaybackUrl`: capability URLs HTTPS `*.tiktokcdn.com` assinadas e expiráveis, permitidas exclusivamente pela decisão expressa de playback e não tratadas como credencial segura.
- URLs de playback são dados externos expiráveis; o browser recebe somente as capability URLs allowlisted. Não há credenciais de provider nem proxy server-side.

## 11. Testes previstos

- normalização mantém todos os campos allowlisted de negócio e métricas, inclusive `0`, `false` e `null`, sem inventar chave ou valor;
- páginas locais de analytics normalizam `page`, `pageSize`, `total`, `hasMore` e `items`; o adapter lê as páginas necessárias antes do join, não inventa itens e o `total` do endpoint conta somente vídeos distintos depois do filtro pelo Product;
- `showcaseProduct` preserva `sellerId`, `stockCount`, `canAdd`, `commission`, `commissionRate`, `commissionExpense` e `labels` allowlisted, inclusive `0`, `false` e `null`;
- envelope/cookies/`Authorization`/tokens de autenticação-provider/`request_id`/`cache_url`/payload bruto nunca chegam ao DTO ou resposta; capability URLs só podem ocupar os campos de playback;
- Product de outro Tenant não é observável; fixtures globais nunca definem Tenant; Product sem `sourceId` retorna vazio;
- join por `provenance.sourceId === association.product_id` e `association.item_id === analytics.item_id`, many-to-many, par duplicado e referência ausente são cobertos fail-closed;
- paginação preserva ordem, `total` e `hasMore`, inclusive página além do fim;
- carregamento automático, loading, vazio, erro, foco, seleção persistente e `Carregar mais` são cobertos;
- player não usa autoplay, tenta backup uma única vez e apresenta falha final;
- capability URLs HTTPS assinadas em `*.tiktokcdn.com` são aceitas somente nos campos de playback; expiração/falha do principal tenta o fallback único e não vaza query signature para logs;
- `teste.json` bruto não é consumível como fixture, DTO ou resposta antes de sanitização e rotação;
- CTA é visível, desabilitado, explicado e não dispara geração ou mutação.

## 12. Critérios de aceite

1. Abrir Conteúdos consulta automaticamente o endpoint tenant-scoped do Product.
2. `PublishedVideo` não reutiliza `Content`, `ContentBriefVersion` ou seus IDs.
3. Associação é server-side por `provenance.sourceId === association.product_id` e `association.item_id === analytics.item_id`, suporta many-to-many e falha fechada para par duplicado ou referência ausente.
4. A resposta mantém todos os campos allowlisted de negócio e métricas presentes, sem zeros ou métricas inventadas.
5. O adapter normaliza as páginas locais de analytics antes do join; o `total` público conta `itemId` distintos após o filtro do Product, não o total bruto de uma página de origem.
6. A API preserva `page`, `pageSize`, `total` e `hasMore`; UI só carrega mais quando houver próxima página.
7. Nenhuma tabela, migration, chamada externa ou mutação de domínio é criada.
8. Player usa URLs de vídeo principal/backup, sem autoplay, e faz no máximo um fallback.
9. Desktop usa master-detail; mobile usa pilha sem carrossel; loading, vazio, erro, seleção e foco são perceptíveis e acessíveis.
10. O CTA de roteiro derivado permanece desabilitado, com motivo e sem geração.
11. Nenhum dado operacional ou sensível excluído por esta SPEC é retornado.
12. Capability URLs HTTPS assinadas de `*.tiktokcdn.com` só aparecem como `playbackUrl`/`fallbackPlaybackUrl`; expiração preserva o fallback único e não transforma a URL em credencial de provider.

## 13. Perguntas resolvidas

- O read model é externo e transitório; não há persistência nem reaproveitamento do domínio de conteúdos internos.
- A fonte desta entrega são fixtures sanitizadas, não TikHub nem TikTok real.
- A associação é many-to-many e é resolvida no servidor por identidade externa estável do Product; `itemId` identifica vídeo e `productIds` identifica produtos externos, sem heurística textual.
- Performance é leitura contextual: não realimenta engine, memória ou Strategy.
- O teto de URLs CDN assinadas é assumido e visível; proxy é uma evolução futura, não infraestrutura antecipada.

## 14. Self-review

Esta SPEC não contém placeholders, TODOs ou decisões deixadas implícitas. IDs, associação, fail-closed, allowlists concretas, paginação local e pública, `showcaseProduct`, capability URLs de playback e ausência de persistência estão explícitos e consistentes com ADR-032. Ela aguarda revisão e aprovação explícita do usuário antes de qualquer implementação.
