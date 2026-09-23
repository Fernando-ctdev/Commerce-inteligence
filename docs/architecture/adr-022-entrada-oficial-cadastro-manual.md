# ADR-022: Entrada oficial de Product é o cadastro manual; importação URL-first é direção futura

## Status

Aceito — decisão do Gate 2 (recuperação sequencial), baseada em evidência factual de documentação e implementação.

## Contexto

A documentação canônica e a implementação divergiam sobre o fluxo oficial de entrada de Product:

- O PRD principal (`docs/product/PRD.md`) ainda descreve URL-first como fluxo principal do produto (colar URL → Product Import → Candidate → confirmação, com manual como fallback).
- O PRD da frente de entrada (`docs/product/PRD-Importation-product.md`) foi retitulado para **"Cadastro Manual de Products"** e afirma explicitamente que não existe etapa de URL, análise automática, preview de origem ou confirmação intermediária.
- `docs/specs/slice-002/SPEC.md` e `docs/delivery/SLICES.md` (Slice 002) definem o cadastro manual em `/products/new` e colocam URL, descoberta automática, Agent Runner, Browser Harness e Chromium **fora de escopo**.
- A implementação inspezada não contém fluxo de importação: as rotas de Product são apenas CRUD manual (`GET/POST/PATCH/DELETE /api/products`, `POST /api/products/:id/archive`). A tabela `ProductImportAttempt` permanece no schema/banco, referenciada apenas pela exclusão de Product por URL; não existe endpoint de importação.
- A cadeia de ADRs da importação está desfeita: ADR-010 e ADR-011 estão superseded; o ADR-008 segue marcado "Aceito", mas referencia um "ADR-016" de Product Importer que não existe mais (o ADR-016 atual trata de projeção de ação de geração).

## Decisão

**O fluxo oficial de entrada de Product é o cadastro manual**: o creator preenche os fatos do produto e a preparação em `/products/new`, salva, revisa o resumo e aciona explicitamente `Analisar produto` para iniciar a geração. Salvar não cria job.

- A importação URL-first com `ProductCandidate` (Product Importer, Browser Service/Harness, Chromium) é **direção futura do PRD**, não fluxo oficial. Reativá-la exige novo slice com SPEC/PLAN e novo ADR baseado em evidência; não pode retornar por edição implícita do PRD principal ou do SLICES.
- A confirmação humana exigida pelo ADR-008 para dados externos permanece princípio válido: se a importação voltar, Candidate continua sendo rascunho não confiável e somente confirmação cria fatos de Product.
- O registro factual de entrada (proveniência, `submittedUrl`/`sourceUrl`) permanece suportado no schema; o `ProductImportAttempt` não é removido nesta decisão — sua limpeza ou reaproveitamento será decidido em slice próprio.
- `Analisar produto` permanece a fronteira entre entrada (fatos) e inteligência (Strategy, Plan, Briefings), conforme ADR-002.
- **Momento único de criação do primeiro job:** o primeiro `CommerceIntelligenceJob` de um Product nasce exclusivamente da ação explícita `Analisar produto`, materializada em `POST /api/generations` → use case `startCommerceIntelligence` (transacional com reserva de quota). Nem o salvamento do cadastro manual, nem edição de fatos, nem archiving criam job. `retry` e `complete` criam job novo apenas para recuperar um Product já analisado (parcial/faltantes) e nunca constituem o primeiro job de um Product.

### Idempotência: cadastro e criação do job são domínios de chave independentes

Cada ação do fluxo tem seu próprio contrato de idempotência; nenhuma chave é compartilhada entre eles (evidência: `Product.createIdempotencyKey` + `@@unique([tenantId, createIdempotencyKey])` no schema; `commerceIntelligenceJob.idempotencyKey` + `@@unique([tenantId, idempotencyKey])`; `startCommerceIntelligence` em `src/modules/commerce-intelligence/service.ts`):

- **Cadastro manual (`POST /api/products`, RI-007):** exige `Idempotency-Key` válida; replay da mesma chave no tenant devolve o Product já criado (`SAVE-DUPLICATE` da SPEC-002) sem criar duplicata. **Salvar nunca cria job** — a chave do cadastro não tem efeito sobre geração.
- **`Analisar produto` (`POST /api/generations`):** exige `Idempotency-Key` própria (genérica inválida → `GEN-IDEMPOTENCY` 400). O servidor deriva um *fingerprint* sha256 de `tenantId:productId:mode:targetContentCount` (ADR-021): replay da mesma chave com fingerprint idêntico devolve o **mesmo job** — inclusive enquanto ele está ativo, cobrindo duplo clique/timeout do cliente — e a mesma chave com modo ou alvo distinto é rejeitada com `GEN-IDEMPOTENCY`.
- **`retry` / `complete` (ADR-021):** cada ação usa chave nova e entra no fingerprint com `mode` distinto; criam job novo de recuperação, nunca o primeiro job de um Product. Retry técnico reutiliza a chave e devolve o mesmo job.
- **Cliente (`use-generation-job`):** a chave nasce por ação (`createGenerationIdempotencyKey`), é reutilizada em repetição da mesma ação (duplo clique/replay) e descartada após sucesso — logo, nova ação do creator gera chave nova e job potencialmente novo conforme as regras acima.

Consequência prática: não existe estado de "confirmação" intermediário a proteger por idempotência — o par (chave do cadastro, chave da análise) cobre exatamente as duas mutações do fluxo vigente, cada uma replay-safe de forma independente.

### Um job ativo por usuário e reserva/liberação de quota

Regra vigente confirmada contra a implementação (`startCommerceIntelligence` em `service.ts`, `worker.ts`, `http-status.ts`; detalhe normativo em SPEC-003 RI-003-03/RI-003-05 e ADR-006/ADR-021):

- **Um job ativo por usuário:** no máximo um `CommerceIntelligenceJob` `QUEUED`/`RUNNING` por `tenantId+userId` — rejeição `GEN-ACTIVE`. O enforcement é serialização concreta com dois advisory locks de transação adquiridos no início da transação de `startCommerceIntelligence`, em ordem fixa (único caminho que os adquire, sem deadlock): (1) **lock tenant-wide da quota** `pg_advisory_xact_lock(hashtext(tenantId), -1)` — serializa o par capacidade→reserva (aggregate + create) entre todos os usuários do Tenant; sem ele, usuários distintos consumiam a mesma capacidade em paralelo; (2) **lock por usuário** `pg_advisory_xact_lock(hashtext(tenantId), hashtext(userId))` — protege a regra de job ativo e o replay de idempotência sob requests concorrentes do mesmo usuário. Todo caminho de criação de reserva passa pelos dois locks (o único `generationUsageReservation.create` do sistema está em `startCommerceIntelligence`). O lease do worker (`leaseOwnerId`/`leaseDeadlineAt`/`attempt`) impede execução duplicada do mesmo job, não substituindo nenhuma das duas regras. Divergência corrigida nesta decisão: antes dos locks, a checagem de job ativo era TOCTOU (duas requests com chaves distintas podiam criar dois jobs `QUEUED`) e, mesmo após o lock por usuário, a capacidade mensal seguia desprotegida entre usuários distintos do mesmo Tenant (o FOR UPDATE do entitlement só existia com entitlement presente). Correção provada contra o PostgreSQL: mesma sessão do par usuário bloqueia; segundo usuário do mesmo Tenant adquire o lock por usuário mas bloqueia no lock tenant-wide da quota; Tenant distinto adquire sem esperar.
- **Reserva:** a capacidade mensal agrega reservas `RESERVED+CONFIRMED` do Tenant no mês UTC contra `GENERATED_CONTENTS_MONTH_LIMIT` (`GEN-CAPACITY`). Job e reserva (`quantity = targetContentCount`) nascem na mesma transação; o limite de `active_products` é enforced no cadastro e nas transições de lifecycle (`GEN-PRODUCT-CAPACITY`), e a análise apenas reconta `activeProductsUsed` sob bloqueio do entitlement.
- **Liberação/confirmação por estado terminal:** `SUCCEEDED` confirma a quantidade cheia; `SUCCEEDED_PARTIAL` confirma D entregues e libera N−D no mês de origem (ADR-021); `FAILED`, cancelamento em `QUEUED` e lease expirado sem tentativas liberam a reserva (`RELEASED`) na mesma transação do fence do estado terminal.
- **Retry/complete do creator:** novo job com reserva própria (somente os faltantes, no `complete`); o job terminal anterior e sua reserva já reconciliada permanecem intactos.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Cadastro manual como fluxo oficial (escolhida) | Reflete PRD vigente da frente, SPEC/SLICES do Slice 002 e a implementação real; elimina a ambiguidade | Creator digita os fatos que a importação futura poderia descobrir |
| URL-first com ProductCandidate como fluxo oficial (ADR-008) | Rejeitada no estado atual | Depende de Product Importer/Browser Harness inexistentes na implementação; exigiria reconstruir a cadeia de ADRs desfeita |
| Declarar ambos como oficiais (manual + URL) | Rejeitada | Mantém a ambiguidade que o Gate 2 existe para resolver; dois caminhos de entrada sem contrato único de criação de job |

## Consequências positivas

- A documentação canônica vigente da frente de entrada (PRD da frente, SPEC/SLICES do Slice 002 e Slice 003), os ADRs e o código descrevem o mesmo fluxo de entrada. O PRD principal permanece com as jornadas URL-first como direção futura do produto — divergência residual conhecida, resolvida somente quando a importação for retomada com novo slice e ADR.
- O contrato de criação do primeiro job (próximos itens do Gate 2) tem um único ponto de partida: a ação explícita `Analisar produto` sobre um Product salvo.
- Nenhuma dependência de infraestrutura de browser é exigida do caminho crítico atual.

## Consequências negativas e riscos

- Enquanto a importação não voltar, a experiência descrita nas jornadas URL-first do PRD principal não corresponde ao produto entregue.
- `ProductImportAttempt` permanece no schema sem fluxo que a popule (custo de schema morto até decisão futura).
- Produtos cadastrados manualmente podem carregar `submittedUrl`/`sourceUrl` informados pelo creator; a proveniência é declarada, não verificada.

## Segurança e operação

- O cadastro manual é entrada não confiável como qualquer outra: validação server-side de fatos, escopo ao Tenant resolvido pela sessão e idempotência de submissão permanecem obrigatórios (Slice 002).
- Se a importação for retomada, valem integralmente as restrições de segurança do ADR-008 (URL validada, sem credenciais, erros sanitizados) e um novo ADR de arquitetura de browser.

## Relações

- [ADR-002](./adr-002-engine-estrategica-como-core.md) — fronteira entre fato e inteligência.
- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — proveniência e memória no PostgreSQL.
- [ADR-006](./adr-006-limites-de-plano-e-uso.md) — limite de Products ativos.
- [ADR-008](./adr-008-entrada-de-produto-url-first.md) — superseded por esta decisão; princípios de confirmação humana e segurança de URL permanecem referência para a importação futura.
- `docs/product/PRD-Importation-product.md` — PRD vigente da frente (Cadastro Manual de Products).
- `docs/specs/slice-002/SPEC.md` e `docs/delivery/SLICES.md` (Slice 002) — escopo entregue.
