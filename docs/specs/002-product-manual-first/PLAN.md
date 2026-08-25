# PLAN — Slice 002: Product manual-first pronto para Strategy

## Objetivo

Implementar integralmente a `SPEC.md` do Slice 002 no monólito Next.js/TypeScript/Prisma já criado pelo Slice 001: criar e abrir Products manuais, salvar contexto `pt-BR`, aplicar entitlement default e limite de Products ativos, oferecer enriquecimento de URL best-effort sem bloquear o manual e deixar o Product no estado informativo `Produto pronto para Strategy`.

Não implementar Strategy, Plan, Content, Generation, Production, upload de mídia, scraping complexo ou integrações externas de marketplace.

## Passos de implementação

1. **Estender o domínio e a persistência de Product**
   - Adicionar módulo Product separado de Identity/Tenant.
   - Persistir Product com UUID v4 ou equivalente, `tenant_id`, fatos manuais, `price_cents` em BRL, `locale = pt-BR`, `active`, `version`, timestamps e estado de enriquecimento de URL.
   - Persistir contexto estratégico associado ao Product, mantendo os campos de `pt-BR` separados dos fatos manuais e sem criar Strategy.
   - Persistir referências de imagens como metadados limitados; não criar upload, armazenamento de mídia ou processamento de arquivos.
   - Adicionar FKs, índices por Tenant/Product e unicidade apenas onde protege a relação real; não adicionar unicidade artificial por nome ou URL.
   - Adicionar registro de idempotência escopado por Tenant e chave, com hash do payload normalizado e Product resolvido.
   - Adicionar migration reversível sem apagar Users, Tenants ou dados existentes silenciosamente.

2. **Fechar entitlement default no provisionamento existente**
   - Fazer o caso de uso de provisionamento de Tenant orquestrar Identity/Tenant e Entitlements na mesma transação; Identity não acessa diretamente tabelas de Entitlements.
   - Adicionar o entitlement inicial server-side ao fluxo transacional de criação do Tenant do Slice 001, de forma idempotente, usando o port/caso de uso do módulo Entitlements.
   - Resolver o limite `active_products` exclusivamente de configuração server-side validada; configuração ausente/inválida falha fechada.
   - Não criar preços, cobrança, upgrade, downgrade ou plano editável pelo cliente.
   - Garantir que Tenant já existente possa receber o entitlement default por backfill idempotente sem duplicação durante rollout/migration.

3. **Implementar validação e normalização de entrada**
   - Validar nome 1–200, descrição 1–5.000, categoria 120, características até 20×300, observações/contexto até 5.000 e referências de imagens até 10×2.048.
   - Normalizar textos com trim, quebras de linha canônicas e Unicode NFC, preservando caixa; normalizar campos opcionais ausentes como `null`.
   - Converter preço BRL finito de até duas casas para centavos inteiros sem arredondamento silencioso; rejeitar negativos, `NaN`, infinito e fora do limite.
   - Gerar a chave de idempotência na UI com 16 bytes aleatórios usando Web Crypto, codificados em base64url (22 caracteres); no servidor validar somente presença, charset seguro e tamanho de 22–128 caracteres, mantendo a autorização exclusivamente no Tenant da sessão.
   - Validar `http`/`https`, tamanho, ausência de credenciais e limites do comportamento de enriquecimento de URL.
   - Retornar erros associados aos campos antes de qualquer mutação.

4. **Implementar casos de uso e autorização**
   - Criar casos de uso explícitos para criar Product, abrir Product, atualizar Product/contexto e resolver o estado de prontidão.
   - Receber o contexto de Tenant resolvido pela sessão; nunca aceitar `tenant_id`, plano, limite, contador ou autorização do cliente.
   - Criar Product + contexto + registro de idempotência + consumo/ativação do entitlement na fronteira transacional necessária.
   - Para a mesma chave e payload normalizado, retornar o mesmo Product; para a mesma chave e payload diferente, retornar conflito sem mutação.
   - Usar isolamento transacional/lock ou mecanismo equivalente para que concorrência no limite não ultrapasse `active_products`.
   - Usar controle otimista de versão na atualização; versão obsoleta retorna conflito e preserva a edição mais recente.
   - Consultas por Product inexistente ou de outro Tenant retornam resposta uniforme não enumerável sem consultar escopo externo.

5. **Implementar enriquecimento de URL best-effort**
   - Criar somente o port/adaptador necessário para fonte opcional de Product, usando `fetch` nativo.
   - Confirmar a transação manual de Product antes de qualquer tentativa de URL; a criação nunca aguarda nem depende do fetch.
   - Persistir `pending` quando houver URL e disparar uma ação separada de enriquecimento após o Product existir; a resposta de criação permanece sucesso manual mesmo se a ação não iniciar.
   - Executar a ação fora da transação de Product, com timeout total de 5s, no máximo 3 redirecionamentos, limite de 1 MiB, tipos textuais suportados e estado explícito `pending`, `completed` ou `unavailable`.
   - Validar o destino final em cada redirecionamento e rejeitar loopback, redes privadas, link-local, multicast e faixas reservadas, incluindo a resolução efetiva usada no request.
   - Nunca enviar credenciais ao destino e nunca substituir fatos manuais por conteúdo externo.
   - Falha, bloqueio, MIME não suportado ou conteúdo incompleto preserva o Product manual e permite retry opcional.
   - Não adicionar crawler, fila, scraping complexo ou dependência externa.

6. **Implementar rotas e superfície web**
   - Criar `/products` para listar Products do Tenant atual, `/products/new` como formulário real do Slice 002 e `/products/[id]` para abrir/editar um Product existente.
   - Criar `POST /api/products/[id]/enrichment` como ação opcional pós-criação; ela nunca é necessária para salvar Product manual.
   - Manter `/today` e `Adicionar produto` apontando para a criação real, sem criar item `Home` paralelo.
   - Criar handlers protegidos para criação, leitura, atualização de Product/contexto e enriquecimento, reutilizando a política Origin/CSRF do Slice 001.
   - Garantir respostas uniformes para sessão inválida, Product fora do Tenant, limite atingido, conflito de versão, chave de idempotência conflitante e falha opcional de URL.
   - Exibir formulário completo em mobile; tablet usa rail de `72px`; desktop usa sidebar de `240px` e toolbar conforme `DESIGN.md`.
   - Implementar no mobile navegação inferior fixa, `--safe-bottom`, `padding-block-end`/`scroll-padding-block-end`, header contextual e ação de salvar alcançável; no tablet manter rail e grid de oito colunas; no desktop manter toolbar de `56px`, conteúdo limitado e sidebar fixa.
   - Implementar labels persistentes, hierarquia de headings, foco-visible, ordem de teclado, `prefers-reduced-motion`, `aria-invalid`, `aria-describedby`, `role=alert/status`, foco no primeiro erro, `aria-busy`, bloqueio de duplo envio e alvos mínimos de `44×44px`.
   - Mapear no componente os estados de lista vazia/carregando/erro, criação, edição, salvando, salvo, conflito com `Recarregar`/`Continuar`, enriquecimento `pending`/`completed`/`unavailable`, limite e retry.
   - Exibir `Completar contexto` quando o registro `pt-BR` ainda não foi salvo; depois mostrar somente o estado informativo `Produto pronto para Strategy`, sem botão/rota executável de Strategy.
   - Enriquecimento pendente/indisponível nunca desabilita o salvamento manual.

7. **Cobrir testes comportamentais**
   - Testar normalização, limites de campos, BRL/centavos, URLs inválidas, MIME, SSRF e chave de idempotência.
   - Testar criação válida, criação com opcionais ausentes, completar contexto, reabertura, atualização e conflito de versão.
   - Testar retry com mesma chave/payload dentro de 24h, conflito com payload diferente, expiração e Products iguais com chaves distintas.
   - Testar entitlement default idempotente, configuração ausente/inválida, limite zero/atingido e concorrência no limite.
   - Testar isolamento entre dois Tenants em leitura, atualização e tentativa de consumir entitlement alheio.
   - Testar Origin ausente/nula/divergente, sessão expirada/revogada e respostas sem enumeração ou secrets.
   - Testar URL best-effort com estados `pending`, `completed` e `unavailable`, timeout, redirecionamento proibido, destino privado, MIME não suportado, conteúdo parcial e preservação dos fatos manuais.
   - Testar estados de UX em mobile/tablet/desktop, foco, teclado, mensagens associadas, loading, sucesso, erro, conflito, retry e estado informativo final.
   - Criar um runner reproduzível `npm run smoke:product` que execute o smoke autenticado descrito abaixo e falhe quando qualquer oráculo não for satisfeito.

## Áreas e componentes afetados

- `prisma/schema.prisma` e nova migration de Product, contexto, idempotência e entitlement.
- `src/modules/identity/application/` e `src/modules/entitlements/`: caso de uso de provisionamento orquestra o entitlement default; Identity não acessa diretamente a persistência de Entitlements.
- Novo módulo `src/modules/product/` para domínio, validação, casos de uso, ports e adapters necessários.
- Novo módulo `src/modules/entitlements/` somente para resolução e consumo de `active_products` neste slice.
- Handlers em `src/app/api/products/**` e páginas/componentes em `src/app/products/**`.
- Componentes compartilhados de shell/formulário somente quando a reutilização for real; manter o Slice 001 compatível.
- Testes em `src/modules/product/*.test.ts`, `src/modules/entitlements/*.test.ts` e testes de integração/E2E existentes.

Não alterar PRD, DESIGN, PRINCIPLES ou SLICES além da atualização deliberada já registrada para fechar o ciclo de entitlement no ADR-006 e no risco correspondente do mapa. Não criar áreas de Strategy, Plan, Content, Production ou Generation.

## Persistência e migrations

- Product, contexto, idempotência e entitlement devem ter IDs não previsíveis, FKs para Tenant/Product e índices por Tenant.
- O registro de idempotência deve garantir unicidade `(tenant_id, idempotency_key)` enquanto a linha estiver vigente, guardar hash do payload normalizado, Product resolvido, `created_at` e `expires_at`.
- Em cada criação, a transação deve bloquear a chave `(tenant_id, idempotency_key)`; se encontrar linha expirada, deve removê-la/expirá-la atomicamente antes de inserir o novo resultado. Assim, retry dentro de 24h reutiliza o Product original e, após expiração, a mesma chave cria obrigatoriamente novo Product sem alterar o anterior.
- Product deve garantir `version` monotônica para atualização otimista e impedir escrita de versão obsoleta.
- Entitlement deve garantir um registro default por Tenant e um limite server-side validado; a criação deve convergir sob retry/concorrência.
- Ativação e consumo de capacidade devem ser atômicos com a criação do Product, sem contador parcial em erro.
- A migration deve ser reversível em cópia e não pode remover dados de Identity/Tenant.

## Segurança e autorização

- Reutilizar a resolução server-side de sessão e Tenant do Slice 001.
- Rejeitar Origin ausente, nula ou divergente antes de toda mutação baseada em cookie.
- Nunca aceitar `tenant_id`, Product ID externo, plano, limite, período, contador ou versão enviados pelo cliente como autoridade de autorização.
- Usar escopo de Tenant em todas as consultas, updates, idempotência e entitlement.
- Manter erros e logs sem cookies, tokens, segredos, IDs de sessão ou dados cross-tenant.
- Aplicar defesa SSRF no adaptador de URL em cada redirect e resolução efetiva; não permitir credenciais, rede interna ou acesso a metadata/segredos.
- Não armazenar conteúdo externo além do necessário para o enriquecimento observável e não substituir fatos manuais.

## Tratamento de erros

- Erros de validação: retorno associado aos campos, sem persistência parcial.
- Sessão ausente/inválida: redirecionamento ao acesso conforme Slice 001.
- Product inexistente/cross-tenant: `404` uniforme, sem enumeração.
- Chave de idempotência com payload diferente: conflito recuperável, sem nova mutação.
- Versão obsoleta: conflito recuperável, dados atuais preservados e ação de recarregar.
- Limite atingido/configuração ausente: erro recuperável de capacidade, sem Product/uso parcial.
- URL indisponível, bloqueada, timeout, MIME não suportado ou conteúdo parcial: Product manual salvo, estado de enriquecimento não bloqueante e retry opcional.
- Falha inesperada de persistência: resposta sanitizada, transação revertida e chave de idempotência sem resultado parcial.

## Estratégia de testes

Testar contratos observáveis e invariantes, não nomes internos:

- fluxo E2E `Hoje → Adicionar produto → criar → abrir → contexto → Produto pronto para Strategy`;
- persistência BRL/centavos, locale `pt-BR`, referências opcionais e Product UUID;
- idempotência por chave, normalização, retry e conflito de payload;
- optimistic concurrency e preservação da versão mais recente;
- entitlement default, limite configurado, limite zero/atingido, configuração inválida e corrida concorrente;
- isolamento entre dois Tenants em Product, contexto e entitlement;
- Origin/CSRF, sessão inválida, cross-tenant `404`, ausência de vazamento e ausência de autoridade em `tenant_id`;
- URL SSRF, redirects, DNS/rebinding, timeout, limite de bytes, MIME e preservação manual;
- acessibilidade e responsividade em 375px, tablet e desktop, com estados de formulário verificáveis;
- ausência de Strategy/Plan/Content/Generation/Production criada ou exposta.

### Matriz de rastreabilidade dos critérios

Cada critério da SPEC terá ao menos o seguinte caso e oráculo:

| Critério | Camada | Caso executável | Oráculo |
|---:|---|---|---|
| 1 | E2E | `Hoje → Adicionar produto` | `/products/new` autenticado renderiza criação |
| 2 | Integração + E2E | Criar Product com nome, descrição e chave base64url de 16 bytes | `201`, Product ativo no Tenant da sessão, ID UUID v4 |
| 3 | E2E | Criar sem opcionais; reabrir e completar | dados opcionais vazios são aceitos e depois persistidos |
| 4 | Integração | Salvar categoria, BRL, características, imagens, observações e URL válidos | valores normalizados aparecem no mesmo Product; preço em centavos |
| 5 | Integração + E2E | Salvar contexto com locale `pt-BR` | contexto ligado ao Product correto e locale preservado |
| 6 | Integração + E2E | Duas edições com a mesma versão | primeira salva; segunda retorna `409`, versão mais recente intacta |
| 7 | Integração | Criar Products distintos até a capacidade configurada | Products distintos coexistem no mesmo Tenant |
| 8 | Integração + E2E | Tenant B tenta ler/alterar Product de Tenant A | `404` uniforme, sem efeito e sem enumeração; IDs UUID v4 |
| 9 | Integração concorrente | Fixture `active_products = 2`, estado inicial 1, duas criações concorrentes | exatamente uma vence com `201`, outra recebe erro de capacidade, contagem final 2, zero Product/uso parcial perdedor |
| 10 | Integração | Provisionar/repetir Tenant e testar config ausente/inválida | um entitlement default; config inválida bloqueia sem fallback |
| 11 | Integração + E2E | Tenant A envia `tenant_id`, Product ID e contador de B | erro uniforme, capacidade e Products de B inalterados |
| 12 | Integração + E2E | Repetir mesma chave/payload dentro de 24h; repetir chave com payload diferente; repetir após expiração; mesmo nome com chave nova | dentro da retenção mesmo Product; conflito não muta; após expiração novo Product; chave nova cria Product distinto |
| 13 | Unit + integração | Adapter fake para URL `pending`, URL inválida, timeout, redirect privado, MIME não suportado, conteúdo parcial e conteúdo válido | criação salva `pending` sem aguardar fetch; falhas terminam `unavailable`, sucesso `completed`; Product manual byte-a-byte preservado |
| 14 | Integração + E2E | Inspecionar rotas/mutações expostas e banco após fluxo | nenhuma Strategy, Plan, Content, Generation ou Production criada/exposta |
| 15 | E2E | Sessão ausente, revogada e expirada em create/read/update | redirect ao acesso, nenhum dado Product revelado |
| 16 | Integração + E2E | Origin válido, ausente, nulo e divergente em cada mutação | somente válido altera estado; demais retornam `403` antes da transação |
| 17 | Unit + E2E | Campos inválidos, foco e retry | erros associados, foco no primeiro inválido, zero persistência parcial |
| 18 | E2E | Duplo clique, falha de rede, conflito e retry de save | `aria-busy`/disabled, valores preservados e recuperação sem duplicação |
| 19 | E2E visual | Browser em 375px, tablet e desktop com Tab/teclado | sem overflow; shell/breakpoints corretos; foco e alvos ≥44px |
| 20 | E2E | Salvar nome/descrição + contexto `pt-BR` vazio | texto informativo `Produto pronto para Strategy`, sem botão/rota/efeito de Strategy |

Fixtures obrigatórias:

- `active_products = 2` para concorrência: começar com 1 Product ativo, disparar duas requisições com chaves diferentes e verificar um sucesso, uma rejeição e contagem final 2.
- Adapter de URL determinístico para retornar timeout, redirect para rede privada, MIME inválido, conteúdo parcial e conteúdo válido; cada cenário deve terminar em `unavailable` ou `completed` sem alterar fatos manuais.
- Retenção de idempotência de 24 horas: repetir dentro da janela retorna o Product; após expiração a transação remove a linha expirada sob lock, a mesma chave cria novo Product e o Product anterior permanece inalterado.
- Dois Tenants com um Product e entitlement cada para provar isolamento de leitura, escrita e capacidade.

Smoke final mínimo:

1. Criar conta com Slice 001, abrir `/products/new`, criar Product e capturar `201`/ID UUID.
2. Reabrir `/products/[id]`, salvar contexto `pt-BR`, observar o estado informativo final.
3. Repetir a criação com a mesma chave e confirmar o mesmo ID; repetir com payload diferente e confirmar `409`.
4. Criar segundo usuário, tentar IDs/tenant_id/contador cruzados e confirmar `404`/nenhum efeito.
5. Executar duas criações concorrentes no fixture de limite e confirmar um vencedor, um erro e contagem final.
6. Exercitar URL inválida/falha e confirmar Product manual intacto.
7. Executar mutations com Origin válido, ausente, nulo e divergente e confirmar somente o válido muta.
8. Verificar `localStorage`, foco, teclado, mobile/tablet/desktop e ausência de rotas/efeitos de Strategy.

## Validações finais

- Executar migration em banco limpo e em banco com Slice 001 existente; verificar reversão em cópia sem apagar Identity/Tenant.
- Executar `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npx prisma migrate status` e `npm run smoke:product`.
- Iniciar a aplicação e executar smoke autenticado com dois usuários, dois Tenants, Products distintos, retry, conflito de edição, limite e URL falha.
- Verificar Origin válido, ausente, nulo e divergente em toda mutação de Product/contexto.
- Verificar cookie/session scoping herdado, ausência de localStorage de tokens e ausência de exposição cross-tenant.
- Verificar mobile, tablet e desktop contra `DESIGN.md`, incluindo foco, teclado, safe area, rail/sidebar e ação de salvar.
- Confirmar que o estado final é apenas `Produto pronto para Strategy` e que nenhuma capacidade de Slice 003 ou posterior foi implementada.
