# PLAN — Slice 003: Primeira Strategy e primeiro Plan de Content

**Spec:** `docs/specs/003-primeira-strategy-plan/SPEC.md`

## Objetivo

Migrar a implementação parcialmente iniciada para que um Product ativo confirmado por Browser ou fallback manual, sem ProductContext estratégico, receba uma primeira Generation durável com Strategy, Plan e exatamente N Contents graváveis. A operação deve preservar provenance factual do Slice 002, quota compartilhada, idempotência, fencing de worker e recuperação segura.

A engine e sua aceitação permanecem bloqueadas até o gold-standard externo aprovado e os gates operacionais de lease, retries, health, backup/restore e reconciliação estarem disponíveis. O PLAN não cria fixture ou provider implícito para contornar esses gates.

## Abordagem

- Manter monólito modular TypeScript/Next.js/PostgreSQL/Prisma; web e worker usam os mesmos casos de uso.
- Reutilizar sessão server-side, Tenant, Origin/CSRF, Product autorizado e Entitlements de Products do Slice 001/002.
- Generation coordena run/fila/lease; Strategy decide; Plan/Content validam e persistem; Entitlements reserva capacidade. Nenhum módulo acessa banco ou provider de outro módulo diretamente.
- O provider textual é uma porta mínima e seu retorno contém somente decisões/texto; servidor deriva ownership, provenance, Product, Tenant, Strategy, Plan e run da execução autorizada.
- Não criar Redis, Kafka, microserviço, provider registry, browser integration, mídia, novo lote ou operação de edição/regeneração.

## Pré-condições e gates

1. Slice 002 fornece Product com `sourceKind`, `sourceUrl` quando houver, `factsVersion`, `confirmedAt` e proveniência por fato; `getProductForGeneration` deve validar esse contrato.
2. Product-exemplo gold-standard externo possui `artifactId`, hash imutável, versão, owner e aprovador em configuração/registro server-side auditável. Um booleano do caller/worker não pode liberar a engine.
3. Provider textual e credenciais são decisão operacional separada. Enquanto não estiverem aprovados, implementar contratos, validação e execução bloqueável, sem mock apresentado como produto.
4. Operação fornece TTL de lease, máximo de tentativas, backoff, definição de job preso e limiares de health/backlog. Sem esses valores não aceitar worker em produção.
5. PostgreSQL possui mecanismo de backup/restore em cópia isolada e reconciliação idempotente para Generation/Entitlement.

## Arquivos e ownership

| Área | Responsabilidade |
|---|---|
| `prisma/schema.prisma` + migration do Slice 003 | provenance de Product, `GenerationIntent`, `GenerationRun`, `GenerationUsageReservation`, Strategy, Plan, Content, índices, FKs e constraints. |
| `src/modules/product/service.ts` e `validation.ts` | prontidão por fatos/proveniência; ProductContext não é gate; snapshot autorizado para Generation. |
| `src/modules/generation/contract.ts` | `GenerationInput v1`/`GenerationOutput v1`, strategy_context nullable, cardinalidades, provenance e validação content-only. |
| `src/modules/generation/service.ts` | iniciar/consultar/cancelar/retry, intenção, snapshot hash, transições e autorização. |
| `src/modules/generation/worker.ts` e `runtime.ts` | claim, lease, heartbeat/recovery, provider fora de tx, finalização CAS e retries limitados. |
| `src/modules/entitlements/generation.ts` | reserva, confirmação, liberação, reconciliação e período UTC compartilhado por Tenant. |
| `src/modules/strategy/service.ts` | composição de análise/Strategy e seleção estratégica; sem Next.js/Prisma/provider SDK. |
| `src/modules/content/service.ts` | Plan, distribuição soma=N, Contents graváveis, referências e provenance derivada. |
| `src/app/api/generations/**`, `src/modules/generation/http.ts` | start/status/cancel/retry, respostas sanitizadas e Origin/session checks. |
| `src/components/products/generation-panel.tsx`, `generation-api.ts`, `generation-ui-model.ts` | formulário, polling/reconnect, estados, disclosure, cancelamento e resultado read-only. |
| `scripts/worker.mts`, `src/modules/generation/health.ts`, `src/modules/generation/health-route.ts`, `src/app/api/health/generation/route.ts` e `metrics.ts` | entrypoint, liveness/readiness, backlog, lease, duração, tentativas e eventos operacionais. |
| `src/modules/generation/contract.test.ts`, `runtime.test.ts`, `service.test.ts`, `worker.test.ts`, `health.test.ts`, `http.test.ts`, `src/modules/entitlements/generation.test.ts`, testes Product/UI/HTTP | oráculos de contrato, concorrência, autorização, UX, lease, quota, provenance e gold gate. |

## Passos de implementação

### Passo 1 — Migrar Product e prontidão

- [ ] Aplicar o contrato factual do Slice 002 ao modelo Product: `sourceKind`, `sourceUrl`, `factsVersion`, `confirmedAt` e `factProvenance`; preservar histórico existente em migration sem inventar provenance retroativa.
- [ ] Atualizar `src/modules/product/service.ts` para retornar facts/provenance server-side e calcular `readyForStrategy` pela regra concreta: nome confirmado + (descrição não vazia **ou** categoria confirmada e pelo menos uma característica confirmada), sem depender de `p.context`.
- [ ] Remover de `productToInput`/`startGeneration` qualquer `throw` ou bloqueio por ausência de ProductContext. Contexto estratégico não criado no cadastro fica `strategy_context` nullable.
- [ ] Manter `ProductContext` histórico nullable somente se necessário para compatibilidade; não renderizar nem atualizar seus campos neste slice.
- [ ] Criar testes separados: Product manual com nome/descrição e Product importado com provenance + facts suficientes iniciam; Product com provenance válida mas facts insuficientes é bloqueado antes de formulário/run/reserva; Product inativo/cross-tenant também é bloqueado.

### Passo 2 — Fixar contratos v1 e regras puras

- [ ] Definir `GenerationInput v1` com `contract_version`, operação, snapshot de Product contendo explicitamente `sourceKind`, `sourceUrl` quando houver, `factsVersion`, `confirmedAt` e `factProvenance` por fato, `strategy_context` (`audience`, `style`, `creator_presence`, `experience`, `constraints`, `market`, `notes` nullable), `history_snapshot=[]` e `request` (`quantity`, `objective`). Validar origem server-side e incluir todos esses campos no `inputSnapshotHash`; Objective permanece request-only.
- [ ] Definir `GenerationOutput v1` com análise/Strategy, Plan e Contents. O adapter expõe somente conteúdo/decisões normalizados; remove/rejeita qualquer `tenantId`, `productId`, `generationRunId`, Strategy/Plan ID, provenance, timestamps, provider/model ou ownership vindo do provider. Servidor constrói toda provenance e metadata a partir da run/snapshot/configuração autorizados.
- [ ] Validar quantidade 1–50, objetivo normalizado, locale `pt-BR`, coleções 1–8 (objeções 0–8), Contents exatamente N, IDs únicos, campos não vazios, referências internas e hooks normalizados únicos.
- [ ] Validar Plan único, cada distribuição com quantidade positiva e soma exatamente N; nenhuma categoria fixa ou memória histórica na primeira geração.
- [ ] Validar cada Content com público, dor, desejo/benefício, ângulo, hook, estrutura, script gravável, ao menos uma cena e CTA; falha invalida a saída inteira.
- [ ] Derivar `generation_run_id`, Tenant, Product, Strategy/Plan links, snapshot hash, engine/taxonomia/provider/model e timestamps do servidor/run com lease. Mismatch da saída externa falha antes da persistência.
- [ ] Implementar leitura server-side do gold-standard por artifactId/hash/owner/approval; ausência, hash divergente ou gate não aprovado mantém engine bloqueada. Não aceitar `goldStandardApproved: true` do caller.

### Passo 3 — Criar/ajustar persistência durável

- [ ] Criar ou ajustar migration para `GenerationIntent` única por `(tenantId, idempotencyKey)`, com fingerprint, snapshot hash, run, criação e expiração configurada.
- [ ] Manter `GenerationRun` com Tenant/Product, operação, estado, quantidade, objective, input snapshot/hash, history snapshot vazio, attempts, `leaseToken`, `leaseExpiresAt`, `nextAttemptAt`, timestamps, erro sanitizado, engine/provider metadata e `previousRunId`.
- [ ] Manter `GenerationUsageReservation` única por `generationRunId`, com Tenant, mês UTC da criação, quantidade, estado (`reserved/confirmed/released`), motivo e timestamps; criar tabela `GenerationUsageReservationTransition` append-only com `reservationId` obrigatório e FK composta `(tenantId,reservationId)`, `generationRunId`, Tenant, estado anterior/novo, quantidade, motivo, instante e chave idempotente única por `(reservationId, transitionKey)`. Gravar estado atual + evento na mesma transação; DB CHECK/ENUM e trigger/policy impedem UPDATE/DELETE, aceitam somente `NULL→reserved` e `reserved→confirmed/released`, e reconciliação não pode apagar/alterar histórico.
- [ ] Persistir Strategy/Plan/Content ligados a run, Product e Tenant; Plan único por run; Content position/hook normalizado únicos. A migration implementa FKs concretas de ownership e produto: UNIQUE `(tenantId,id)` para Tenant scope; UNIQUE `(tenantId,productId,id)` em Run/Strategy/Plan/Content/Reservation; FKs `(tenantId,productId,foreignId)` para cada link Product-scoped e `(tenantId,productId,generationRunId,...)` para Run→Strategy→Plan→Content/Reservation, incluindo `previousRunId`, `reservationId` e transições. Adicionar CHECKs/ENUMs de estados, quantidade 1–50, período UTC, lease/attempt e legalidade de transição. Testar rejeição cross-tenant/cross-product no banco e no caso de uso.
- [ ] Não backfillar provenance ausente com valores inventados. Migration deve ser reversível em cópia e preservar Identity, Tenant, Product, Context e Entitlements.

### Passo 4 — Implementar start, quota e idempotência

- [ ] Handler resolve sessão/Origin/Tenant e chama caso de uso Generation; não consulta Prisma diretamente nem aceita snapshot, quota, Tenant ou provenance do cliente.
- [ ] Validar Product no módulo Product, quantidade/objetivo e `Idempotency-Key` antes da mutação. Chave usa política vigente de 22–128 caracteres e retenção operacional de 24 horas.
- [ ] Para intenção nova, gerar snapshot server-side, `intentFingerprint` e hash completo; adquirir lock/linha de Entitlement do Tenant; verificar capacidade mensal compartilhada; criar intenção, reserva e run `queued` na mesma transação curta.
- [ ] Replay igual retorna mesma run/estado/snapshot; payload diferente conflita sem nova run/reserva. Retry creator usa nova chave, `operation=first-generation-retry`, `previousRunId` obrigatório e recarrega a run terminal no Tenant correto para copiar snapshot imutável; o fingerprint inclui operação e run anterior.
- [ ] Start da primeira operação rejeita Product com qualquer run anterior `failed`/`cancelled` ou `succeeded`; depois de uma falha/cancelamento, somente o caso de uso de retry cria nova run vinculada e mantém a run terminal original imutável. Concorrência ativa também bloqueia novo start; novo lote fica no Slice 008.
- [ ] Não criar Strategy/Plan/Content no start. Resposta contém apenas run ID, estado, Product/quantidade necessários e mensagem sanitizada.

### Passo 5 — Implementar fila, lease e fencing

- [ ] Claim usa update condicional de `queued` + `nextAttemptAt`, incrementa attempt e grava novo token/expiração; não mantém transação aberta durante provider.
- [ ] Heartbeat/recovery detecta lease expirado segundo configuração operacional, invalida tentativa antiga e reenfileira com backoff ou marca failed ao esgotar tentativas.
- [ ] Finalização exige CAS de `status=running`, `leaseToken` e attempt atuais, além de Tenant/Product/run consistentes. Worker obsoleto não persiste Strategy/Plan/Content, não confirma/libera reservation e não muda terminal.
- [ ] Cancelamento de `queued`/`running` usa transação condicional; corrida com finalização escolhe uma transição terminal e reconcilia reserva uma vez.
- [ ] Provider/engine roda fora de transação com snapshot imutável; validar/normalizar toda resposta antes da transação curta de finalização.
- [ ] Em erro transitório, reenfileirar mesma run dentro do limite; ao esgotar, marcar failed, registrar classe sanitizada e liberar reserva. Não criar nova run para retry operacional.

### Passo 6 — Compor Strategy, Plan e Content após gates

- [ ] Criar somente a porta mínima do provider textual aprovado e manter SDK na borda. `Strategy` implementa composição de domínio sem conhecer Next.js, Prisma, provider ou quota; o caso de uso Generation entrega input e recebe output validado, e `Content/Plan` usa a porta de persistência apenas na finalização.
- [ ] Compor análise comercial a partir dos facts/provenance confirmados e `strategy_context` nullable; não consultar browser, ProductContext obrigatório ou histórico anterior.
- [ ] Construir Strategy com problema, benefícios, diferenciais, características, casos de uso, contexto, gatilhos, barreiras, riscos, argumentos, públicos, dores, desejos, objeções aplicáveis e ângulos.
- [ ] Construir Plan único com distribuição explicável e soma N; não preencher categorias artificialmente.
- [ ] Produzir N Contents graváveis com referências às dimensões da própria Strategy, hooks únicos, cenas e CTA.
- [ ] Comparar distribuição/gravabilidade ao gold-standard aprovado. Se gate ausente, deixar a run em falha bloqueada/sanitizada conforme política e não exibir sucesso.
- [ ] Persistir resultado completo em uma transação: Strategy, Plan, N Contents, provenance server-derived e reserva confirmada. Falha deixa zero resultado publicável.

### Passo 7 — Expor HTTP e UX

- [ ] Implementar start/status/cancel/retry nas rotas existentes; GET também exige sessão/Tenant e retorna `404` uniforme fora do escopo.
- [ ] Mapear Product não pronto com fatos/lacunas confirmados e `Voltar para revisar o produto`, sem formulário executável; mapear `queued`/`running` com `Acompanhar geração` + `Cancelar geração`, sem percentual inventado/Content parcial; mapear `failed`/`cancelled` com erro sanitizado, Product/quantity/objective preservados e `Tentar novamente`; resultado incompleto nunca é sucesso.
- [ ] Distinguir `quota_insufficient` (`Ajustar quantidade`, capacidade compartilhada, inputs preservados, sem upgrade/preço) de `capacity_unavailable` (`Tentar novamente`, indisponibilidade segura, sem claims comerciais).
- [ ] Em start/retry, gerar chave uma vez antes do primeiro POST e reutilizar replay; preservar quantity/objective em erro, reload, offline e retorno à aba.
- [ ] Polling usa intervalo operacional configurado, pausa/sinaliza stale em aba oculta/offline, e ao visibility/network/reload/POST ambíguo refaz GET server-authoritative antes de renderizar; nunca apresentar cache antigo como sucesso atual. Anunciar somente mudanças de estado.
- [ ] Cancelamento usa diálogo com foco, trapping de Tab, Escape sem mutar, aria-busy, anúncio de transição e retorno ao gatilho; retry desabilita duplo acionamento, mantém aria-busy, foca status/primeiro erro e anuncia queued/erro após retorno.
- [ ] Succeeded mostra no mobile ação/estado → contexto operacional → resumo da Strategy → Plan/distribuição → Contents → explicação/proveniência técnica. Summaries/triggers são acessíveis; disclosure persiste no mesmo Product/fluxo, reseta ao trocar Product/concluir/nova sessão/logout e nunca esconde status, erro ou ação necessária. Tablet/desktop aumentam densidade, não retiram ações; scripts/cenas têm leitura completa e provenance em disclosure; edição/regeneração/novo lote não aparecem.
- [ ] Implementar formulário com labels persistentes, `name`, `type=number`, `min=1`, `max=50`, `aria-describedby`, `aria-invalid`, erro associado, foco no primeiro erro, headings/landmarks/skip link, `role=status`/`aria-live` sem anúncios duplicados, `aria-busy` no form e botão disabled durante start/retry.
- [ ] Remover de `generation-panel.tsx` a mensagem/formulário “Complete o contexto” e qualquer CTA baseado em `readyForStrategy = product.context !== null`.
- [ ] Seguir `DESIGN.md`: mobile `--safe-bottom: env(safe-area-inset-bottom, 0px)`, nav fixa `64px + safe`, padding/scroll end `calc(64px + var(--safe-bottom) + 16px)`; tablet rail 72px + grid 8 colunas/gutter 24/padding 24; desktop sidebar fixa 240px, main `minmax(0,1fr)`, toolbar 56px, padding 32px e coluna `min(100%,1440px)` sem overflow/terceira coluna; validar contraste/foco/tokens.

### Passo 8 — Dar ownership à operação

- [ ] Manter `scripts/worker.mts` como entrypoint do mesmo deploy; liveness verifica apenas processo/heartbeat. Readiness falha fechado se PostgreSQL/fila não estiverem legíveis/reivindicáveis ou se TTL de lease, máximo de attempts, backoff, stuck-job, provider/credential e gold-gate config estiverem ausentes/inválidos; worker recusa claim enquanto não estiver ready, e a rotina operacional alerta/escalona falhas de heartbeat/readiness/DB/fila/provider/gold-gate sem expor Tenant/secret.
- [ ] Registrar apenas correlation ID seguro, estado, attempt, duração, fila, classe de erro e contadores; redigir Product/objective text, URLs, prompts, output, cookies, tokens, profile e payload bruto.
- [ ] Medir idade da fila, duração, attempts, erro, backlog e idade máxima; emitir evento quando limiar configurado persistir e notificar o owner operacional definido, com retenção/acesso dos eventos configurados.
- [ ] Implementar recovery/reconciliation idempotente por `generationRunId`, conferindo resultados completos, tenant/product links, reservation e histórico append-only de transições, com CAS sem alterar run terminal.
- [ ] Implementar/operar scheduler do backup automatizado e do restore periódico em cópia isolada, com frequência, freshness gate/SLO, retenção, cifragem/controle, owner/alerta configurados; restaurar somente em cópia Tenant-bound, validar que credenciais/handles revogados não são reativados, registrar last-success/freshness, verificar FKs/constraints, exact-N, links/provenance, estados/reservas, reconciliação e tenant isolation. Falha registra evento, notifica/escalona owner e bloqueia aceitação operacional.

### Passo 9 — Migrar testes e smoke

- [ ] Atualizar fixtures para Product manual/browser com `sourceKind`, `factsVersion`, `confirmedAt`, `factProvenance` e context nullable.
- [ ] Testar primeira geração, replay/concurrency, conflito, retry creator, retry worker, quota entre Products/Tenants, cancel/fencing, lease recovery, saída inválida, Plan sum=N e gold gate.
- [ ] Testar output ownership: IDs externos de Tenant/Product/run/Strategy/Plan são ignorados/rejeitados; persistência usa run/snapshot server-side.
- [ ] Testar FKs compostas/CHECKs de Tenant/Product/Run/Strategy/Plan/Content/Reservation/Transition, legalidade de estados/transições e tentativa de persistir cada combinação cross-tenant/cross-product.
- [ ] Testar HTTP/session/Origin/404 uniforme/ausência de secrets e UI states/polling/reload/offline/disclosure/foco em mobile/tablet/desktop.
- [ ] Testar health/lease/backlog com DB/fila/config ausente e backup-restore/reconciliation periódico com relógio/configuração controlados; falha deve alertar owner.
- [ ] Smoke: Product confirmado → quantidade/objetivo → `queued` → worker → resultado completo; Product manual sem Context inicia; Product incompleto bloqueia; retry/cancel/quota preservam invariantes.

## Segurança e tratamento de erros

- Toda operação resolve sessão e Tenant; não confiar em Product ID fora do escopo, snapshot/provenance/quota/limite enviados pelo cliente.
- Provider recebe somente facts/provenance autorizados e `strategy_context` necessário; nunca Browser Profile, cookies, tokens, secrets ou payload de outro Tenant.
- Provider output é não confiável e content-only; ownership/provenance deriva da run com lease e Product snapshot.
- Claim, heartbeat, cancelamento, finalização e reconciliação são condicionais ao token/attempt atual; tentativa obsoleta não grava nem reconcilia.
- Reserva mensal é server-side, Tenant-shared, única por run, com histórico append-only de transições e reconciliação idempotente; falha/cancelamento libera uma vez.
- Logs redigem todos os textos/URLs/prompts/output e registram somente allowlist operacional; readiness/health não expõem Tenant ou secret.
- Não chamar TikTok/Browser durante Generation; Product source foi confirmado no Slice 002.

## Validações finais

- [ ] Verificar migration em banco limpo e estado atual, constraints/FKs compostas tenant-scoped e consistência Product/Run/Strategy/Plan/Content/Reservation, rollback em cópia e ausência de perda.
- [ ] Verificar Product readiness sem ProductContext e provenance sourceKind/factsVersion/confirmedAt/factProvenance no snapshot/hash.
- [ ] Executar testes unitários, integração, concorrência, HTTP, worker, health-route e UI/E2E dos caminhos reais listados no ownership table.
- [ ] Executar `npm run test` após atualizar o script para incluir `src/components/products/generation-api.test.ts`, `generation-ui-model.test.ts` e todos os caminhos `src/modules/generation/{contract,http,health,runtime,service,worker}.test.ts`; executar separadamente os testes de integração que exigem PostgreSQL.
- [ ] Exercitar smoke do worker com lease expirado, cancelamento concorrente, retry idempotente, quota compartilhada, run terminal anterior e reservation transition history.
- [ ] Verificar liveness/readiness com processo ativo, heartbeat obsoleto, DB/fila/config ausente, provider/gold gate ausente e claimability; readiness falha fechado sem dados de Tenant.
- [ ] Verificar backup automatizado e restore periódico em cópia isolada conforme frequência/retention/owner: cifragem/controle, FKs/constraints, exact-N, provenance, states/reservations, Tenant isolation, reconciliação e alerta de falha.
- [ ] Verificar gold-standard artifactId/hash/version/owner/approver server-side antes de aceitar engine; sem ele, declarar gate bloqueado e não sucesso.
- [ ] Inspecionar rotas/persistência para confirmar ausência de edição, feedback, regeneração parcial, novo lote, Production, browser, mídia, publicação e analytics neste slice.
