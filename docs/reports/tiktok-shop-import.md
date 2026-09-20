# TikTok Shop Import — progresso

- [x] URL pública validada e enviada à CaptAPI com `region=BR`.
- [x] Resposta validada e mapeada ao contrato atual de Product.
- [x] Persistência pelo service existente, com tenant e idempotência.
- [x] Fallback manual preservado para URL inválida, configuração ausente, rede/timeout, 4xx/5xx, JSON/shape inválidos e preço ausente.
- [x] Testes determinísticos com `fetch` mockado; nenhum crédito real consumido.
- [ ] Validação real depende de `CAPTAPI_API_KEY` configurada no ambiente.
