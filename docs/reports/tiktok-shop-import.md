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
- [x] Allowlist de URLs restrita às rotas oficiais de produto; resposta CaptAPI
  limitada incrementalmente a 1 MB e abortada ao exceder esse limite.
- [x] Testes determinísticos com `fetch` mockado: 14 passaram, 0 falharam e 31
  foram pulados por `DATABASE_URL` inacessível; nenhum crédito real consumido.
- [ ] Typecheck: não concluído neste merge por dependências do ambiente.
- [ ] QA desktop/mobile: não executado neste merge.
- [ ] Validação real depende de `CAPTAPI_API_KEY` configurada no ambiente.
