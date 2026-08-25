# PLAN — Slice 002: Importação de Product via Browser com confirmação

**Spec:** `docs/specs/002-product-manual-first/SPEC.md`

## Objetivo

Substituir o fluxo manual-first/API-proposto atual por uma capacidade vertical browser-based: URL → Browser Profile isolado → Chromium → interação humana quando necessária → Browser Harness → ProductCandidate → confirmação → Product ativo. O fallback manual permanece disponível e nenhuma etapa estratégica entra no cadastro.

A aceitação depende da POC real e dos gates de segurança do profile definidos na SPEC e no ADR-011. Sem Browser Harness validado, backup/restore protegido e retenção/revogação verificáveis, a implementação pode preparar estados e fallback, mas não declara importação pronta para produção.

## Abordagem

- Manter monólito modular TypeScript/Next.js/PostgreSQL/Prisma e reutilizar sessão server-side, Tenant, Origin/CSRF e Entitlements existentes.
- Criar somente as fronteiras necessárias: `Browser Service` para profile/Chromium/Harness/Human-in-the-loop e `Product Import` para Agent, Candidate e estados.
- Manter Product como dono dos fatos confirmados; Product Import nunca cria Strategy ou Product ativo sem confirmação.
- Remover o caminho API/OAuth/Connection do Slice 002. Não criar tabela de tokens, callback OAuth, scopes, registry de provider, crawler ou scraper próprio.
- Fazer chamadas ao browser fora da transação de confirmação. Recarregar Candidate server-side, validar versão/Tenant e confirmar Product em transação curta.
- Preservar `ProductContext` histórico nullable se a migração exigir, mas remover sua presença como requisito de cadastro ou `readyForStrategy`.

## Pré-condições e gates

1. Instalar e versionar o Browser Harness no ambiente oficial responsável pela automação; registrar versão e procedimento reproduzível sem secrets.
2. Disponibilizar Chromium, volume persistente por profile, permissões mínimas, isolamento de processos e caminho operacional para o Browser Service.
3. Definir configuração server-side de allowlist de origens TikTok Shop, limites de redirects/egress, timeout, retenção de Candidate/Attempt/Profile, cleanup e exposição interativa.
4. Definir proteção de backup/restore de profiles: cifragem/controle de acesso, Tenant binding, restauração apenas em cópia isolada, retenção/deleção e revogação no desprovisionamento.
5. Executar a POC: criar profile → abrir URL real → login manual → fechar → reabrir autenticado → Harness inspeciona → Agent extrai Candidate.
6. Não adicionar nenhum provider API/OAuth para contornar ausência do gate.

## Arquivos e ownership

| Área | Responsabilidade |
|---|---|
| `prisma/schema.prisma` + nova migration | `BrowserProfile`, `ProductCandidate`, `ProductImportAttempt`, fonte/proveniência de Product, fatos confirmados, versionamento, retenção, Tenant FKs e unicidades. |
| `src/modules/browser/` | profile ID, lifecycle do Chromium, allowlist/redirect/egress, sessão interativa vinculada a Tenant + operação, cleanup, orphan detection e adapter para Browser Harness. |
| `src/modules/product-import/` | iniciar/consultar/cancelar/retry, Product Extraction Agent, normalização factual, Candidate, estados, fingerprint e import attempt. |
| `src/modules/product/` | Product factual, confirmação de Candidate, fallback manual, leitura autorizada, edição factual e prontidão sem ProductContext. |
| `src/modules/entitlements/` | preflight obrigatório e fail-closed de configuração/capacidade antes de criar novo profile ou iniciar Chromium; rechecagem atômica do limite de Products ativos na confirmação, sem criar uso parcial. |
| `src/app/api/product-imports/**` | start/status/cancel/retry e transição de interação; respostas sanitizadas e escopadas. |
| `src/app/api/products/**` | confirmar Candidate, criar fallback manual, ler/editar Product factual e abrir Product existente. |
| `src/components/products/` | URL-first, browser/interação, Candidate preview/edição, confirmação, fallback, estados e acessibilidade. |
| `scripts/` | POC do Browser Harness/profile e smoke do fluxo real, sem credenciais versionadas. |
| testes atuais de Product/HTTP/UI | migrar contratos manual/context/enrichment para importação browser, Candidate, fallback e Product facts. |

## Passos de implementação

### Passo 1 — Remover o contrato antigo antes de adicionar o novo

- [ ] Retirar `enrichmentStatus`, handlers e textos que tratam URL como enriquecimento pós-criação. O Product não deve ser criado primeiro para depois buscar uma fonte.
- [ ] Retirar do fluxo de criação os campos de `ProductContext` estratégico (`goal`, `audience`, `style`, `creatorPresence`, `experience`, `constraints`, `market`, `notes`). Campos não pertencem ao cadastro.
- [ ] Manter qualquer `ProductContext` histórico nullable somente como compatibilidade de dados; nenhum caso de uso, view ou readiness pode depender de sua existência.
- [ ] Remover do contrato executável qualquer Marketplace Connection, OAuth, token, refresh, endpoint de API, external Product ID obrigatório ou enriquecimento automático.
- [ ] Atualizar `src/modules/product/service.ts`, `src/modules/product/http.ts`, `src/modules/product/validation.ts`, `src/app/api/products/**` e componentes de Product para que Product só seja criado por confirmação de Candidate ou fallback manual.

### Passo 2 — Criar persistência factual e de sessão do browser

- [ ] Adicionar `BrowserProfile` escopado a Tenant/usuário com ID opaco, status operacional, timestamps, versão e associação única ao Tenant. Não persistir path sensível, cookie, token, senha, conteúdo do profile ou CDP secret na aplicação principal.
- [ ] Adicionar `ProductCandidate` escopado a Tenant e `BrowserProfile`, com status, versão, `sourceUrl`, payload factual normalizado, lacunas, proveniência por fato, fingerprint da intenção, `importAttemptId`, timestamps e expiração configurável.
- [ ] Adicionar `ProductImportAttempt` com Tenant, profile, status, tipo de entrada, chave de idempotência, fingerprint/hash canônico, duração, erro sanitizado e timestamps. A chave é única por `(tenant, idempotency_key)`; sua retenção/TTL server-side é maior que o tempo máximo de uma tentativa ativa. Após expiração, manter tombstone/fingerprint terminal suficiente para replay/conflict sem nova mutação; payload divergente sempre conflita.
- [ ] Estender Product com `sourceKind` (`browser`/`manual`), `sourceUrl` quando houver, `factsVersion`, `confirmedAt`, `factProvenance`, marca, seller, variantes, moeda e preço sem assumir BRL quando a fonte não informar. Preservar imagens como referências externas.
- [ ] Definir identidade de duplicação server-side como `tenant + canonicalSourceUrl` quando Browser Service comprovar uma origem canônica, independentemente de `sourceKind`; URL manual opcional só participa quando for normalizada/provada. Não deduplicar por nome ou URL não normalizada; variantes sem identidade comprovada seguem confirmação normal.
- [ ] Manter FKs e índices por Tenant/status/expiração; proteger concorrência de confirmação com unicidade e transação. Migration deve ser reversível em cópia e não apagar Users, Tenants, Products ou histórico válido.

### Passo 3 — Implementar Browser Service e o gate operacional

- [ ] Executar preflight obrigatório de Entitlement/configuração server-side antes de criar novo profile ou iniciar Chromium; configuração ausente/inválida e quota atingida falham fechado. Profile já existente pode ser reutilizado, e confirmação repete Entitlement atomicamente; uma corrida perdedora não cria Product/uso parcial. Profile existente nunca é apagado automaticamente por quota/falha.
- [ ] Implementar início/encerramento de Chromium e cleanup em sucesso, erro, cancelamento, timeout e crash. Persistir ownership/lease por attempt, revogar handoff antes do cleanup, executar sweeper no startup e periodicamente, usar retries limitados/alerta e matar somente processo owned; detectar órfãos e verificar que endpoint não continua acessível sem afetar outro Tenant. Em erro/corrupção, marcar o profile `PROFILE_UNAVAILABLE` e preservar o único profile para recuperação operacional explícita; cleanup remove somente processos/handles, nunca apaga automaticamente profile.
- [ ] Validar URL com allowlist configurada de origens TikTok Shop, egress deny-by-default, sem userinfo/portas não permitidas; limitar hops por configuração finita, detectar loops, rejeitar downgrade HTTPS→HTTP, revalidar cada redirect e origem final e resolver/validar IPv4/IPv6 imediatamente antes de cada conexão para impedir DNS rebinding. Bloquear loopback, rede privada, link-local, multicast, metadata e DNS para faixas reservadas; limitar popups, navegação e subresources às origens aprovadas; permitir somente tracking conhecido que não altere identidade e nunca registrar query/fragment com credencial.
- [ ] Expor interação por transporte mediado pelo servidor: handle opaco de uso único vinculado a Tenant resolvido + `importAttemptId`, TTL e autorização em toda ação; revogar em cancelamento, conclusão, logout, desprovisionamento ou perda de autorização. Não abrir porta/CDP bruto ao frontend e nunca aceitar profile ID/path do cliente como autoridade.
- [ ] Instalar o Browser Harness conforme o procedimento oficial do ambiente e validar que Browser Service é o único dono de profile, filesystem, lifecycle e CDP bruto.
- [ ] Implementar desprovisionamento de Tenant/usuário: revogar handles e CDP, parar somente Chromium owned, negar restore/backup para Tenant revogado, aplicar deleção/destruição criptográfica conforme retenção e impedir ressurreição. Restore cria handles novos e invalida todos os handles anteriores.
- [ ] Registrar no smoke da POC somente versão, estados, duração e razões sanitizadas; não salvar profile, screenshot de credencial, token, cookie ou payload externo integral.

### Passo 4 — Implementar Product Import e Human-in-the-loop

- [ ] Implementar `startImport`, `getImport`, `cancelImport` e retry idempotente. Gerar/persistir `importAttemptId` e chave server-side antes de abrir o browser; retry igual retorna o estado original e payload divergente conflita.
- [ ] Modelar estados `IDLE`, `OPENING`, `LOGIN_REQUIRED`, `CAPTCHA_REQUIRED`, `2FA_REQUIRED`, `USER_INTERACTION_REQUIRED`, `PAUSED`, `CANCELLED`, `EXTRACTING`, `READY` e `ERROR`. QR Code é detalhe de `LOGIN_REQUIRED`, não novo enum.
- [ ] Classificar os estados persistidos da tentativa (`opening`, `paused`, `extracting`, `ready`, `error`, `cancelled`, terminal) e os estados derivados da UI (`IDLE`, `CONFIRMING`, `CONFIRMED`, `DUPLICATE`, `PROFILE_UNAVAILABLE`, `LIMIT`), incluindo `LOGIN_REQUIRED`, `CAPTCHA_REQUIRED`, `2FA_REQUIRED` e `USER_INTERACTION_REQUIRED` como bloqueios derivados de `paused` com entrada após detecção e saída por verificação/cancelamento. Documentar transições/guards: URL inválida → ERROR; cancelamento em qualquer operação → CANCELLED; retry só de ERROR/CANCELLED/PROFILE_UNAVAILABLE/LIMIT; READY incompleto só edita; READY válido confirma; duplicação canônica → DUPLICATE; quota/config → LIMIT; confirmação → CONFIRMED.
- [ ] Ao detectar bloqueio, pausar automação, entregar browser interativo com nome acessível/foco/retorno/cancelamento e não automatizar senha, QR Code, CAPTCHA, 2FA ou confirmação humana. `Cancelar análise` preserva URL, tentativa, chave e profile.
- [ ] Retomar somente após Browser Service verificar a conclusão da interação. Se a superfície não puder ser fechada imediatamente, cancelar server-side e comunicar cleanup pendente sem prender o creator.
- [ ] Implementar Product Extraction Agent como consumidor do contrato de observação/ação do Browser Service. O Agent não toca CDP, filesystem ou cookies diretamente.
- [ ] Restringir o Agent à página/áreas do produto atual. Tratar DOM, Accessibility Tree, Structured Data, Network e textos da página como dados não confiáveis; permitir somente ações necessárias à extração e ignorar instruções/prompt injection da página.
- [ ] Extrair fatos na ordem Accessibility Tree → DOM/CDP → Structured Data → Network, normalizar sem inventar e produzir Candidate conforme o contrato do PRD.
- [ ] Definir no Candidate preview o contrato de edição factual: name, description, category, brand, seller, price+currency, features, variants e images; adicionar/editar/remover variants respeita limite de 20 itens/300 caracteres, ausência é `undefined`/lacuna e lista vazia explícita não vira fato inventado. Cada alteração usa versão otimista, `creator-confirmed` por campo e não é sobrescrita por extração sem nova confirmação.
- [ ] Separar Candidate válido incompleto (`READY`, lacunas visíveis, edição factual) de Candidate inválido/expirado/inconsistente (`ERROR`, sem confirmar, retry/fallback apenas).

### Passo 5 — Confirmar Product ou executar fallback manual

- [ ] Recarregar Candidate por Tenant + attempt/version no servidor; nunca aceitar snapshot factual confiável enviado pelo cliente.
- [ ] Validar nome, descrição, categoria, preço/moeda, features, imagens, seller, variantes, URL e proveniência. Rejeitar valores inválidos sem mutação parcial.
- [ ] Aplicar correções confirmadas pelo creator e gravar `sourceKind`, `sourceUrl`, `factsVersion`, `confirmedAt` e proveniência por fato. Nova extração não sobrescreve correção sem uma confirmação nova explícita.
- [ ] Verificar duplicação somente pela identidade canônica definida no Passo 2; retornar `Abrir produto` sem duplicar quando comprovada.
- [ ] Aplicar limite de Products ativos na mesma transação. Falha de quota não invalida profile existente e não cria Product/uso; o fallback manual só confirma quando a capacidade estiver disponível.
- [ ] Criar Product manual com nome/descrição e opcionais válidos, `sourceKind=manual`, sem iniciar Strategy ou context.
- [ ] Encerrar Chromium preservando profile e retornar Product/fallback com próxima ação condicional do Slice 003.

### Passo 6 — Expor HTTP e a superfície responsiva

- [ ] Criar handlers protegidos para start/status/cancel/retry de Product Import e confirm/manual Product. Reutilizar sessão, Origin/CSRF, `json`, `readCookie` e respostas uniformes existentes.
- [ ] Retornar apenas estado, Candidate factual necessário, lacunas e ações; nunca profile path, CDP endpoint, cookie, token, senha, prompt, payload bruto ou erro cru.
- [ ] Renderizar URL-first e fallback manual; preservar URL, idempotency key, attempt e Candidate em falha/reload. Candidate inválido não exibe `Confirmar`.
- [ ] Implementar `aria-busy`, `role=status`, `role=alert`, labels persistentes, `name`, `aria-invalid`, `aria-describedby`, foco no primeiro erro, modal/sheet com trapping/Escape/retorno, `Escape` sem mutação e browser interativo com nome/foco/cancelamento/retorno equivalentes.
- [ ] Implementar a matriz de estados observáveis: `IDLE` mostra URL + `Analisar produto` + fallback; `OPENING`/`EXTRACTING` preservam URL, bloqueiam duplicação e mantêm `Cancelar análise` no app; bloqueios `LOGIN_REQUIRED`/`CAPTCHA_REQUIRED`/`2FA_REQUIRED`/`USER_INTERACTION_REQUIRED` mostram browser somente quando intervenção é necessária; `PAUSED` aguarda verificação; `CANCELLED` preserva URL/attempt/key/profile e oferece retry/manual; `READY` mostra facts/origin/gaps/warning + `Editar candidate` e só mostra `Confirmar` quando válido; `ERROR` usa mensagem inline sanitizada, foco e retry/fallback; `CONFIRMING` desabilita duplicação e retorna foco; `CONFIRMED` anuncia sucesso + `Abrir produto`/Products e CTA condicional do Slice 003; `DUPLICATE` mostra `Você já adicionou este produto` + `Abrir produto`; `PROFILE_UNAVAILABLE` oferece retry/manual; `LIMIT` preserva Candidate e oferece revisar Products/retry sem upgrade fictício.
- [ ] Fazer o handoff interativo ter accessible name/instrução, foco inicial no contexto, controle de cancelar operável por teclado, retorno ao gatilho e sessão não reutilizável. Se a superfície não fechar, o cancelamento app-level continua disponível e informa cleanup pendente; `Retomar análise` só após verificação do Browser Service.
- [ ] Renderizar URL-first e fallback manual antes/depois de qualquer erro, interação abandonada ou preferência do creator; preservar URL, idempotency key, attempt e Candidate em reload/crash; Candidate inválido/expirado não exibe `Confirmar`.
- [ ] Seguir `DESIGN.md`: `<768px` uma coluna com 4 colunas, gutter/padding 16px, header contextual 56px, navegação inferior fixa de `64px + --safe-bottom`, `--safe-bottom: env(safe-area-inset-bottom, 0px)`, safe-area/padding/scroll end `calc(64px + var(--safe-bottom) + 16px)` sem cobrir CTA; `768–1199px` rail 72px, grid 8 colunas/gutter 24px/padding 24px, nomes acessíveis/tooltips ao foco; `≥1200px` sidebar fixa 240px + main `minmax(0,1fr)` + toolbar 56px + grid 12 colunas/gutter 24px/padding 32px; `≥1440px` limita somente conteúdo a `min(100%, 1440px)`, sem terceira coluna/overflow.
- [ ] Manter todas as capacidades em mobile/tablet/desktop e validar tokens canônicos `color.brand.accent`, `color.action.filled`, `color.intelligence`, `color.canvas`, `color.surface.default/secondary`, `color.border.default`, `color.text.primary/secondary/muted`, `color.content.on-surface/on-action`, `color.focus.ring` e todos os tokens de feedback. Aplicar a matriz completa do DESIGN: qualquer par abaixo de 4.5:1 (incluindo muted/intelligence/warning no Light e success/danger quando aplicável) nunca é texto normal isolado; foco tem offset, nenhum estado depende só de cor, Light/Dark preservam tokens sem cores ad hoc/gradientes; Instrument Sans/type scale, unidade 4px, radii/elevation, uma ação primária por região, conteúdo Product/Candidate sólido, glass somente nav/sheets e sem toast como único erro.
- [ ] Garantir `prefers-reduced-motion: reduce` sem animações essenciais, manter feedback/status por texto e testar cada estado/ação no mobile: sheet/modal full-screen acessível, edição de variants, HITL, confirmação, retry e fallback sem hover, teclado desktop ou controle exclusivo de desktop; todos os alvos têm `44×44px`.

### Passo 7 — Migrar testes e POC

- [ ] Substituir fixtures manual-first/enrichment por Candidate browser/manual com fonte, versão, lacunas, confirmação e Tenant.
- [ ] Adicionar testes de URL/redirect/SSRF: deny-by-default, máximo de hops, loop, downgrade HTTPS→HTTP, validação IPv4/IPv6 no momento da conexão, DNS rebinding, popups/subresources e query/fragment com credencial.
- [ ] Adicionar testes de profile/session binding: handle opaco de uso único, TTL, autorização por ação, revogação em cancel/logout/desprovisionamento/restore, sweeper startup/periódico, retries/alerta e cleanup apenas de processos owned; profile corrompido permanece `PROFILE_UNAVAILABLE` sem auto-delete.
- [ ] Adicionar teste de backup/restore em cópia isolada: Tenant binding, proteção, retenção/deleção, revogação no desprovisionamento, negação de restore para Tenant revogado e invalidação de handles antigos; não executar contra produção.
- [ ] Adicionar testes HTTP/UI para mensagens, focus, keyboard, Escape, modal/sheet sem mutação, Candidate/estado matrix, mobile/tablet/desktop, contraste/tokens e ausência de secrets.
- [ ] Atualizar `scripts/smoke-product.mts` para manual fallback e criar o smoke POC separado para Browser Harness; nenhum smoke usa credencial versionada.

## Segurança e tratamento de erros

- Toda rota/caso de uso resolve sessão e Tenant; campos de Tenant, profile, quota, Product, state e identidade enviados pelo cliente não concedem autoridade.
- Browser profile é material de sessão sensível: permissões, volume, backup, restore, retenção e revogação devem ser configurados e verificados antes de produção. Restore é cópia isolada, Tenant-bound e invalida handles/processos anteriores; desprovisionamento nega acesso e impede ressurreição.
- URL e página são não confiáveis; allowlist/redirect/DNS/egress deny-by-default, limites finitos, validação por conexão e ação do Agent são restritos. O Browser Service nunca entrega CDP bruto.
- Falhas de login/desafio pausam; falhas de profile/Harness/browser produzem erro sanitizado e fallback; falhas de Candidate não confirmam Product; falhas de quota/configuração não criam estado parcial.
- Cleanup é obrigatório em todos os terminais, tem ownership/lease, sweeper e retries limitados, e verifica ausência de processo/endpoint órfão sem matar recurso de outro Tenant; profile corrompido fica preservado para recuperação explícita.
- Logs estruturados usam allowlist de `importAttemptId`, estado, duração, classe de erro, resultado de quota/idempotência, handoff/revoke/cleanup, backup/restore e autorização negada; não registram URL/página/query, profile path, payload, cookies, tokens ou credenciais. Retenção e acesso seguem configuração operacional e são testados negativamente.

## Estratégia de testes

| Cenário | Ação | Oráculo |
|---|---|---|
| POC completa | Abrir URL real, login manual, fechar/reabrir, extrair | Profile reutiliza sessão; Candidate real; nenhum secret persistido |
| Profile isolado | Tenant A/B executam imports | IDs/profiles/browser/CDP não atravessam Tenant |
| Redirect inseguro | URL TikTok redireciona a rede privada/metadata | Cada hop/final é rejeitado; nenhum conteúdo interno lido |
| Handoff humano | Login/CAPTCHA/QR/2FA/interação | Pausa, browser acessível, cancelamento/retomada manual, sem bypass |
| Retry | Repetir mesma chave e alterar payload | Mesmo attempt no replay; conflito sem nova mutação |
| Candidate incompleto | Extração sem descrição/característica suficiente | READY com lacunas e edição factual; não confirmar enquanto inválido |
| Candidate inválido | Payload inconsistente/expirado | ERROR sem Confirmar; retry/fallback somente |
| Confirmação | Confirmar/editar Candidate | Product ativo, factsVersion/proveniência/correção preservados |
| Duplicação | Repetir URL canônica no mesmo Tenant | Abrir Product existente; nome não cria falsa deduplicação |
| Quota concorrente | Confirmar Products no limite | Capacidade server-side; no máximo limite; nenhum Product/uso parcial |
| Profile recovery | Cancelar, crashar e restaurar cópia | Cleanup/orphan; restore Tenant-bound; retenção/revogação corretas |
| Fallback | Falhar importação e criar manual | Nome/descrição criam Product; sem contexto/Strategy |
| UX | Exercitar estados em 375px, tablet e desktop | Próxima ação, foco, teclado, aria, safe area e alvos 44px |

## Validações finais

- [ ] Verificar POC Browser Harness/profile/login/reabertura/extração com evidência sanitizada.
- [ ] Verificar backup/restore de profile em cópia isolada, Tenant binding, cifragem/controle, retenção/deleção e revogação no desprovisionamento.
- [ ] Aplicar migration em banco limpo e estado atual; verificar FKs, índices, unicidades, rollback em cópia e ausência de perda de dados.
- [ ] Executar testes do Slice 002 e regressão do Slice 001/003.
- [ ] Executar `npm run test`, `npm run typecheck`, `npm run lint` e `npm run build`.
- [ ] Executar smoke manual fallback e, somente com ambiente/gate aprovado, smoke browser real.
- [ ] Confirmar que nenhuma rota/tabela/fixture implementa OAuth, TikTok Shop API, Connection, token próprio, scraping universal, publicação ou contexto estratégico no cadastro.
- [ ] Confirmar que Product confirmado só encaminha para Slice 003 e que Generation não exige ProductContext.
