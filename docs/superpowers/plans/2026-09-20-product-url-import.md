# Product URL Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o Slice 012 para que uma URL pública do TikTok Shop seja consultada pela CaptAPI HTTP, vire um `ProductCandidate` transitório no mesmo formulário manual e só seja persistida após revisão e confirmação explícita.

**Architecture:** O backend valida a URL, chama exclusivamente `GET https://api.captapi.com/v1/tiktok-shop/product-details?url=...&region=BR`, normaliza uma resposta não confiável e devolve um candidato sem gravar banco. O frontend hidrata o formulário manual sem apagar valores ausentes; o POST manual existente continua sendo a única fronteira de persistência, com provenance allowlisted e sem payload bruto. `salesCount`, `ratingValue` e `reviewCount` ficam em um bloco somente leitura e nunca entram no Product.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.8, `fetch`/`AbortController` nativos, Prisma 6/PostgreSQL, Node `node:test` via `tsx`, CSS Modules e componentes shadcn existentes.

**Spec:** `docs/specs/slice-012/SPEC.md`

## Global Constraints

- Consultar somente `GET https://api.captapi.com/v1/tiktok-shop/product-details` com query `url` e `region=BR`.
- Enviar `Authorization: Bearer <CAPTAPI_API_KEY>` somente no servidor; nunca expor valor, cookie, token, payload bruto ou Authorization em logs, respostas, testes ou UI.
- URL e cadastro manual convergem em `/products/new`; importar nunca persiste e nunca inicia `CommerceIntelligenceJob`.
- `ProductCandidate` é transitório, editável e limitado a `name`, `description`, `category`, `price`, `priceCurrency`, `features`, `imageRefs`, `sourceUrl`, desconto e gaps suportados.
- `imageRefs` recebe no máximo `data.images[0]`; não enviar a galeria.
- `salesCount`, `ratingValue` e `reviewCount` são opcionais, somente leitura, sem inferência e sem persistência no Product.
- `seller`, marca, variantes e qualquer atributo sem suporte no formulário/serviço não entram no contrato nem viram gap.
- Faltas parciais e erros de URL, configuração, timeout, rede, HTTP, JSON, tamanho e shape preservam o fallback manual com mensagens `pt-BR` sanitizadas.
- Toda persistência usa o serviço/repository manual, sessão server-side, Tenant da sessão, CSRF/origin existente e idempotência do POST manual.
- Não criar tabela, migration, schema Prisma, browser runtime, portal, MCP runtime ou dependência nova.
- Seguir `DESIGN.md`: mobile completo em uma coluna, desktop expandido, próximo passo claro, foco visível, `44px` mínimo, labels persistentes, `aria-live`/`role="status"` e erro sem depender de cor.

## Review Focus

- Uma resposta completa não pode criar Product automaticamente; o teste de endpoint deve provar `product.count === 0` até o POST manual.
- Um payload parcial com `price: null` e oito imagens deve manter campos disponíveis, deixar preço vazio e conservar somente `images[0]`; o teste deve cobrir exatamente esse shape.
- Um provedor pode devolver sinais nulos, strings ou números fora da faixa; o teste deve provar que somente números válidos aparecem em `signals` e nenhum é persistido.
- Retry com a mesma chave de importação não pode transformar a consulta em replay de uma linha de Product; o teste deve provar que cada confirmação usa sua chave manual e que a consulta não consulta/insere Candidate no banco.
- Mensagens e erros do provedor não podem carregar segredo ou payload bruto; testes de erro devem inspecionar a resposta sanitizada e capturar logs sem encontrar a chave.

---

## File Map

Files are listed before tasks so the implementation boundary is explicit.

- Modify `src/modules/products/captapi.ts`: define o contrato factual do candidato, normalização allowlisted, sinais opcionais, primeira imagem, timeout e erros recuperáveis.
- Modify `src/modules/products/captapi.test.ts`: testes unitários determinísticos de `fetch` mockado, CaptAPI BR, partial data, sinais, imagem e falhas.
- Modify `src/modules/products/import-http.ts`: tornar `POST /api/products/import` somente consulta/candidate; remover persistência automática e lookup de Product por chave.
- Modify `src/modules/products/http.ts`: aceitar apenas a marca de provenance allowlisted no POST manual e continuar delegando validação/persistência ao service.
- Modify `src/modules/products/service.ts`: manter o contrato de `createManualProduct`, gravar apenas `provenance: { origin }` e garantir que nenhum campo externo bruto atravesse a persistência.
- Modify `src/modules/products/service.test.ts`: provar confirmação manual, Tenant, idempotência, provenance `captapi`, primeira imagem e ausência de payload bruto.
- Modify `src/components/products/product-api.ts`: alinhar `ProductImportCandidate`/`ProductImportResult`, normalizar `sourceUrl`, `signals` e gaps sem atributos legados.
- Create `src/components/products/product-api.test.ts`: mockar `fetch` do browser client e provar que a resposta candidate é reduzida ao contrato público sem segredos/atributos desconhecidos.
- Modify `src/components/products/product-import-model.ts`: substituir o draft legado com `seller`/`variants` por tipos de Candidate, gaps, signals, estados e helpers de merge/validação.
- Create `src/components/products/product-import-model.test.ts`: testar merge preservando input manual, gaps, sinais read-only e cálculo do primeiro erro.
- Modify `src/components/products/product-form-model.ts`: manter o payload manual como contrato único e acrescentar somente a provenance allowlisted; nunca emitir candidate, gaps ou signals.
- Modify `src/components/products/product-form-model.test.ts`: provar payload manual sem campos de importação e com `imageRefs` limitado pela hidratação do candidato.
- Modify `src/components/products/product-create-form.tsx`: integrar URL e manual no mesmo draft, estados acessíveis, candidate parcial/completo, sinais read-only, fallback e confirmação manual.
- Modify `src/components/products/product-form.module.css`: estilizar status, gaps e sinais usando tokens existentes, sem quebrar mobile/desktop ou alvos de toque.
- UI behavior is covered by the pure model/API tests and the required desktop/mobile smoke QA; do not add a component-test dependency.
- Modify `docs/reports/tiktok-shop-import.md`: registrar a implementação do Slice 012, contrato de provenance sem payload bruto, comandos de validação e limitações do smoke real.

## Implementation Tasks

### Task 1: Lock the CaptAPI candidate contract with deterministic unit tests

**Files:**
- Modify: `src/modules/products/captapi.test.ts`
- Modify: `src/modules/products/captapi.ts`

**Interfaces:**
- Consumes: current `fetchCaptApiProduct(submittedUrl, fetchImpl?)` and `validateTikTokShopUrl(value)`.
- Produces: `ProductCandidate`, `CandidateGap`, `ProductSignals`, `CaptApiImportError`, and `fetchCaptApiProduct()` returning a transient candidate with `sourceUrl`.

- [ ] **Step 1: Add the failing complete-payload contract test**

Use the existing `node:test` file and mocked `fetchImpl`; assert the request URL has `region=BR` and the exact submitted URL, Authorization is `Bearer configured` only inside the mock assertion, and the returned candidate has `sourceUrl`, facts, discount, `gaps: []`, no seller/brand/variants and no raw response field.

- [ ] **Step 2: Add the failing partial/signal/image test**

Return `success: true` with `price: null`, `images` containing eight URLs, valid numeric `salesCount`, `ratingValue`, `reviewCount`, plus invalid/null signal values in a second case. Assert `price` and `priceCurrency` are absent when unavailable, `gaps` contains only supported missing fields, `imageRefs` equals `[images[0]]`, valid signals are present, invalid signals are omitted, and no unsupported field is exposed.

- [ ] **Step 3: Add the failing error matrix tests**

Keep the existing mock style and assert exact codes for invalid URL, missing `CAPTAPI_API_KEY`, `AbortError`, thrown network error, 4xx/5xx, invalid JSON, oversized body, `success !== true`, missing `data`, invalid discount and invalid signal shape. Assert no error message contains the configured key or raw body.

- [ ] **Step 4: Run only the focused CaptAPI test file**

Run: `npx tsx --test src/modules/products/captapi.test.ts`

Expected before implementation: the new contract assertions fail while the existing baseline tests remain visible; no real CaptAPI request is made.

- [ ] **Step 5: Implement the minimal normalizer**

In `src/modules/products/captapi.ts`, replace the current `CaptApiProduct`/`CaptApiCandidate` shape with the SPEC names. Normalize only allowlisted `data.title`, `data.description`, `data.categories[0].name`, `data.price`, `data.currency`, `data.saleProperties[].values[].name`, `data.discount`, `data.images[0]`, `data.salesCount`, `data.ratingValue` and `data.reviewCount`. Treat `null` as absence, keep zero as a valid numeric value, validate finite non-negative counts/rating, and return `sourceUrl` from the canonical validated URL. Do not retain `data.url`, seller, brand, variants, response status or raw payload.

- [ ] **Step 6: Keep the existing HTTP boundary protections**

Preserve `AbortController` at 8 seconds, the 1 MB response ceiling, `CAPTAPI_API_KEY` server-only lookup, `Authorization` header construction and sanitized `CaptApiImportError` codes. The only outbound request remains the CaptAPI endpoint with `region=BR`.

- [ ] **Step 7: Run the focused test file again**

Run: `npx tsx --test src/modules/products/captapi.test.ts`

Expected: all CaptAPI mapping and failure tests pass without network access or real credits.

### Task 2: Make the import endpoint candidate-only and preserve safe manual provenance

**Files:**
- Modify: `src/modules/products/import-http.ts`
- Modify: `src/modules/products/http.ts`
- Modify: `src/modules/products/service.ts`
- Modify: `src/modules/products/service.test.ts`

**Interfaces:**
- Consumes: `ProductCandidate`, `fetchCaptApiProduct`, `readJsonBody`, session Tenant and the existing `createManualProduct(tenantId, input, idempotencyKey, provenanceOrigin?)`.
- Produces: `POST /api/products/import` returning `{ candidate, partial, gaps, message }` for every valid CaptAPI response, while `POST /api/products` remains the sole Product mutation and accepts only `provenanceOrigin: "manual" | "captapi"`.

- [ ] **Step 1: Add the failing endpoint test for complete candidates**

Extend the existing Tenant setup in `src/modules/products/service.test.ts`: mock `globalThis.fetch` with a complete BR payload, call `handleImportProduct` using a same-origin authenticated request and a valid import key, assert `200` with candidate data and `partial: false`, then assert `prisma.product.count({ where: { tenantId } }) === 0`.

- [ ] **Step 2: Add the failing endpoint test for partial candidates**

Return `price: null` and eight images; assert `200`, `partial: true`, only `images[0]`, no `productId`, no Product row, and no raw CaptAPI payload in the JSON response.

- [ ] **Step 3: Add the failing confirmation/provenance test**

Use the candidate fields to call `handleCreateProduct` with a distinct manual idempotency key and `provenanceOrigin: "captapi"`; assert one Product in the authenticated Tenant, valid fields and `provenance === { origin: "captapi" }`. Assert the row contains no raw response object or signals.

- [ ] **Step 4: Add the failing idempotency and fallback tests**

Assert import keys are format-validated, invalid URL/config/provider/JSON/shape errors return recoverable sanitized errors, and repeating import does not return a Product replay. Assert same manual key replays the single persisted Product and a different Tenant cannot see it.

- [ ] **Step 5: Run the focused backend tests**

Run: `npx tsx --test src/modules/products/captapi.test.ts src/modules/products/service.test.ts`

Expected before implementation: the complete-candidate test reveals the current premature persistence path; DATABASE-backed cases may be skipped when `DATABASE_URL` is unavailable, but no test may call the real CaptAPI.

- [ ] **Step 6: Remove automatic persistence from `import-http.ts`**

Keep same-origin, session, idempotency-key format, URL validation and error mapping. Remove `findTenantProductByIdempotencyKey` and `createManualProduct` from this route. Call `fetchCaptApiProduct` once and return the candidate with `partial: candidate.gaps.length > 0`; never return `id`, `version`, `replay` or `productId` from this endpoint.

- [ ] **Step 7: Add the provenance allowlist to the manual POST**

In `http.ts`, derive `const provenanceOrigin = body.provenanceOrigin === "captapi" ? "captapi" : "manual"`, pass it as the existing fourth service argument, and do not pass arbitrary client keys. In `service.ts`, preserve `provenance: { origin: provenanceOrigin }` only; do not add raw CaptAPI response, signals or candidate to Prisma data. Keep all existing manual validation and Tenant/idempotency behavior.

- [ ] **Step 8: Run focused backend tests after implementation**

Run: `npx tsx --test src/modules/products/captapi.test.ts src/modules/products/service.test.ts`

Expected: mocked complete/partial import tests and manual confirmation tests pass; real provider is never contacted.

### Task 3: Align the client API and pure import state helpers

**Files:**
- Modify: `src/components/products/product-api.ts`
- Create: `src/components/products/product-api.test.ts`
- Modify: `src/components/products/product-import-model.ts`
- Create: `src/components/products/product-import-model.test.ts`
- Modify: `src/components/products/product-form-model.ts`
- Modify: `src/components/products/product-form-model.test.ts`

**Interfaces:**
- Consumes: endpoint JSON `{ candidate, partial, gaps, message }` and `ProductPayload`.
- Produces: client `ProductImportCandidate` with optional supported facts, `sourceUrl`, `gaps: CandidateGap[]`, optional `signals`, and `ProductImportResult`; pure helpers `mergeImportedCandidate`, `candidateState`, and `candidateSignalsForDisplay`.

- [ ] **Step 1: Write failing response-normalization tests**

Mock `globalThis.fetch` in `product-api.test.ts`; call `importProduct(url, key)` and assert the client sends only `{ url }` plus `Idempotency-Key`, maps `sourceUrl`, preserves optional fields, filters `signals` to valid numbers, and drops unknown seller/brand/variants/raw payload fields.

- [ ] **Step 2: Write failing pure-model tests**

In `product-import-model.test.ts`, assert a candidate with missing price does not overwrite an existing manual price, a supplied name/description/category does overwrite those fields, `imageRefs` becomes one newline-delimited first image, gaps remain ordered, candidate state is `candidate-ready` when no gaps and `candidate-partial` otherwise, and signals are display-only.

- [ ] **Step 3: Write failing payload tests**

In `product-form-model.test.ts`, assert `buildManualProductPayload` includes the supported facts and `provenanceOrigin: "captapi"` only when supplied, while `candidate`, `gaps`, `signals`, seller, brand, variants and raw response are absent. Keep manual URL and image validation unchanged.

- [ ] **Step 4: Run the pure focused tests**

Run: `npx tsx --test src/components/products/product-api.test.ts src/components/products/product-import-model.test.ts src/components/products/product-form-model.test.ts`

Expected before implementation: new imports/helpers fail to compile or assertions fail; no database or CaptAPI network is involved.

- [ ] **Step 5: Implement the client contract**

Update `ProductImportCandidate` and `ProductImportResult` in `product-api.ts`; normalize only the SPEC fields and keep `sourceUrl` as the URL shown in the manual form. In `product-import-model.ts`, remove legacy candidate fields for seller/brand/variants and provide typed merge/state helpers. Update `ProductPayload` and `buildManualProductPayload` to carry only the allowlisted provenance marker; never serialize candidate metadata into the save request.

- [ ] **Step 6: Run pure focused tests again**

Run: `npx tsx --test src/components/products/product-api.test.ts src/components/products/product-import-model.test.ts src/components/products/product-form-model.test.ts`

Expected: all client contract and merge tests pass.

### Task 4: Integrate URL and manual entry in the accessible form

**Files:**
- Modify: `src/components/products/product-create-form.tsx`
- Modify: `src/components/products/product-form.module.css`

**Interfaces:**
- Consumes: `importProduct`, `ProductImportCandidate`, pure import helpers, existing `ProductManualDraft`, `ProductApiError` and `buildManualProductPayload`.
- Produces: one `/products/new` surface with manual idle, importing, ready, partial, fallback, saving and saved states; explicit save/analyze controls remain unchanged.

- [ ] **Step 1: Add failing pure state assertions for the UI contract**

In `product-import-model.test.ts`, assert that the UI state model renders a live status for importing/ready/partial/fallback, preserves manual values for absent candidate fields, exposes signals as text-only data, disables import while loading, and never represents a candidate import as a saved Product. The browser-level rendering is covered by the smoke checklist; do not install a component-test dependency.

- [ ] **Step 2: Add candidate application with non-destructive merge**

In `product-create-form.tsx`, keep `importState`, `importMessage`, `importGaps`, `importSignals` and `importedFromCaptApi` local to the create form. Apply only candidate properties that are present; leave manually entered values untouched for absent fields. Set `url` to `sourceUrl`, set `imageReferences` from the single `imageRefs[0]`, clear file-upload preview only when the imported image is actually applied, and never copy seller/brand/variants.

- [ ] **Step 3: Keep complete and partial candidates in the same confirmation flow**

Remove the current success branch that routes complete imports directly to `router.push`. Both complete and partial results remain on the facts form, show the next action `Confira e salve o produto`, and use the existing preparation/summary/save flow. Set `provenanceOrigin` only after a candidate has been applied; reset it when the user starts a fresh manual form or clears the imported URL.

- [ ] **Step 4: Implement accessible states and fallback**

Render one `role="status"`/`aria-live="polite"` region for importing, ready, partial and fallback messages. Associate the URL field error with its existing `aria-describedby`; preserve typed field errors and focus the first invalid field after save. Show gaps as text with field names, not color alone. Keep import disabled during `importing`/`saving`, preserve draft data on errors, expose `salesCount`, `ratingValue` and `reviewCount` in a read-only list only when valid, and never announce secrets or raw provider text.

- [ ] **Step 5: Style the smallest responsive surface**

Add only the status/gap/signal rules to `product-form.module.css`, reusing existing semantic tokens, `44px` controls, visible focus and `prefers-reduced-motion`. At `max-width: 767px`, keep one-column flow and wrap actions without horizontal overflow; at desktop preserve the full-width operational form and existing spacing.

- [ ] **Step 6: Run the focused client tests and typecheck**

Run: `npx tsx --test src/components/products/product-api.test.ts src/components/products/product-import-model.test.ts src/components/products/product-form-model.test.ts`

Then run: `npm run typecheck`

Expected: focused client tests pass and TypeScript reports no new errors.

### Task 5: Verify provenance, persistence boundaries and documentation

**Files:**
- Modify: `src/modules/products/service.test.ts` if an assertion is still missing after Task 2
- Modify: `docs/reports/tiktok-shop-import.md`

**Interfaces:**
- Consumes: completed endpoint/manual flow and `Product.provenance` Prisma JSON.
- Produces: durable provenance limited to `{ origin: "manual" | "captapi" }`, no Candidate table/schema, and an implementation note that can be audited without provider secrets.

- [ ] **Step 1: Add the exact persistence assertions**

Use the existing Prisma integration setup to assert confirmed CaptAPI data stores `submittedUrl`/existing source URL and `provenance: { origin: "captapi" }`, while `provenance` has no `signals`, `candidate`, `payload`, `response`, Authorization or key fields. Assert partial import alone leaves zero Product rows.

- [ ] **Step 2: Run the persistence-focused backend command**

Run: `npx tsx --test src/modules/products/service.test.ts`

Expected: deterministic unit tests pass; database tests pass when `DATABASE_URL` is reachable and otherwise report the existing skip condition, without contacting CaptAPI.

- [ ] **Step 3: Update the TikTok import report**

Record the Slice 012 implementation boundary, endpoint/query/timeout, candidate-only import, confirmation path, supported signals, first-image rule, provenance shape, fallback/error codes, and the exact focused test/typecheck commands. Do not include API keys, Authorization values, raw CaptAPI payloads or real product response data.

- [ ] **Step 4: Run documentation formatting validation**

Run: `git diff --check`

Expected: no whitespace errors and no code/schema files included in the documentation update.

### Task 6: Smoke and QA the convergent flow on desktop and mobile

**Files:**
- No source changes; validate the files from Tasks 1–5.

**Interfaces:**
- Consumes: running local app, test Tenant/session, mocked CaptAPI in automated tests, and optional real `CAPTAPI_API_KEY` only for an explicitly authorized smoke.
- Produces: recorded evidence that the same form supports manual, complete candidate, partial candidate, fallback and explicit save at desktop/mobile widths.

- [ ] **Step 1: Start the local app without printing secrets**

Run: `npm run dev -- --hostname 127.0.0.1`

Load `/products/new` with a test session. Do not print `.env.local` or any key.

- [ ] **Step 2: QA desktop at 1440px and 1200px**

At 1440px and 1200px, verify URL label/instruction, Importar button, manual fields, candidate facts, read-only signals, partial gaps, fallback message, Save/Analisar actions, visible keyboard focus, no premature navigation/persistence and no horizontal overflow.

- [ ] **Step 3: QA mobile at 390px and 767px**

At 390px and 767px, verify one-column layout, wrapped action controls, reachable 44px targets, status announcements, field error association, preserved manual values, first-image-only behavior, and that complete/partial/fallback states remain usable without desktop-only controls.

- [ ] **Step 4: Run the deterministic smoke command**

Run: `npx tsx --test src/modules/products/captapi.test.ts src/modules/products/service.test.ts src/components/products/product-api.test.ts src/components/products/product-import-model.test.ts src/components/products/product-form-model.test.ts`

Expected: all mocked CaptAPI/contract tests pass; any skipped database cases are reported with their reason.

- [ ] **Step 5: Run optional real smoke only when explicitly configured**

When `CAPTAPI_API_KEY` is present, use the exact Brazilian URL from the SPEC through the application flow once, without logging the key or raw response. Confirm the provider returns data, the UI remains on the confirmation form, and the manual save creates one Tenant-scoped Product with masked title/id/price/currency and `provenance.origin = "captapi"`. If the key is absent or provider timeout persists, report the blocked real smoke and retain deterministic mock evidence; do not retry repeatedly or spend credits.

### Task 7: Run final project validation and handoff

**Files:**
- No additional source files; review the implementation diff and report.

- [ ] **Step 1: Run typecheck, lint and build**

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands pass; any existing environment/database limitation is reported with the command and exact failure, without weakening the acceptance criteria.

- [ ] **Step 2: Run final focused tests once more**

Run: `npx tsx --test src/modules/products/captapi.test.ts src/modules/products/service.test.ts src/components/products/product-api.test.ts src/components/products/product-import-model.test.ts src/components/products/product-form-model.test.ts`

Expected: pass/fail/skip counts are recorded and no real CaptAPI call occurs in the test process.

- [ ] **Step 3: Review the final diff for forbidden data and scope**

Run: `git diff --check` and `git status --short`.

Confirm no `.env.local`, secret, temporary file, raw payload, browser runtime, MCP runtime, Prisma schema or migration is staged. Confirm the endpoint never calls `createManualProduct` and the save path remains the only persistence boundary.

- [ ] **Step 4: Commit the implementation on its implementation branch**

Run:

```bash
git add src/modules/products/captapi.ts src/modules/products/captapi.test.ts src/modules/products/import-http.ts src/modules/products/http.ts src/modules/products/service.ts src/modules/products/service.test.ts src/components/products/product-api.ts src/components/products/product-api.test.ts src/components/products/product-import-model.ts src/components/products/product-import-model.test.ts src/components/products/product-form-model.ts src/components/products/product-form-model.test.ts src/components/products/product-create-form.tsx src/components/products/product-form.module.css docs/reports/tiktok-shop-import.md
git commit -m "feat(tiktok-shop-import): implement Slice 012 CaptAPI candidate flow"
```

Expected: only the reviewed feature files are committed; this planning branch is not used to implement code.
