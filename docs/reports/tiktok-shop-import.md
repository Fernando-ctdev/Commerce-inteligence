# TikTok Shop Import — implementação

- [x] Importação URL-only candidate: consulta o endpoint HTTP normal da CaptAPI
  `GET /v1/tiktok-shop/product-details` com `region=BR`; a chave vem somente do
  ambiente do servidor e nunca aparece em testes, respostas ou logs.
- [x] O resultado é mapeado para o contrato allowlisted de Product, preservando
  a primeira imagem e expondo `salesCount`, `ratingValue` e `reviewCount` apenas
  como signals opcionais, read-only e não persistidos.
- [x] A importação não faz auto-save: o candidate hidrata o formulário e exige
  confirmação manual explícita; somente o fluxo manual persiste o Product,
  mantendo `origin: manual`.
- [x] Fallback manual preservado para URL inválida, configuração ausente,
  rede/timeout, 4xx/5xx, JSON/shape inválidos e dados incompletos, sem criar
  Product inválido.
- [x] Allowlist de URLs restrita às rotas oficiais de produto e aos short
  links mobile `https://vt.tiktok.com/<token>` e `https://vm.tiktok.com/<token>`
  (HTTPS, sem credenciais, um único segmento); resposta CaptAPI limitada
  incrementalmente a 1 MB e abortada ao exceder esse limite.
- [x] Short links resolvidos server-side antes da CaptAPI com `redirect:
  "manual"`: cada `Location` revalidado contra HTTPS, allowlist TikTok
  (`vt`/`vm`/`shop`/`www.tiktok.com`) e ausência de credenciais, máximo de 5
  hops, detecção de loop, sem follow de destino arbitrário; somente a URL
  final de produto válida é enviada à CaptAPI e vira `sourceUrl`. URLs
  completas seguem sem resolução. Nenhum payload bruto persistido.
- [x] Timeout total (resolução + CaptAPI) elevado de 8s para 60s: a captura
  autenticada real levou ~46s e estourava o limite anterior; `AbortController`
  e erro sanitizado (`IMPORT-TIMEOUT`) preservados.
- [x] Testes determinísticos com `fetch` mockado (focused captapi + service):
  53 passaram, 0 falharam e 0 pulados; nenhum crédito real consumido.
- [x] Typecheck: `tsc --noEmit` concluído sem erros neste ambiente.
- [ ] QA desktop/mobile: não executado neste merge.
- [ ] Validação real depende de `CAPTAPI_API_KEY` configurada no ambiente.
