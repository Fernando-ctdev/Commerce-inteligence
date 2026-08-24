# System Design — Commerce Intelligence

**Status:** baseline de integração dos ADRs para o MVP  
**Escopo:** como os limites arquiteturais se conectam; não substitui ADRs, PRD ou `DESIGN.md`.

## 1. Objetivo e escopo

Commerce Intelligence transforma um Produto em uma Estratégia comercial, um Plano diversificado, Contents graváveis e uma fila de Production. O sistema existe para responder, de forma operacional, **o que o creator deve gravar para vender o produto**.

O MVP cobre:

- cadastro manual-first de Produto e contexto estratégico;
- análise e decisão da Commerce Intelligence Engine;
- geração de Plan e Content com memória, variedade e proveniência;
- organização e atualização manual da fila de Production;
- limites de uso por tenant e processamento assíncrono de gerações.

O MVP não cobre vídeo/imagem/áudio gerados, publicação ou agendamento, integrações TikTok/TikTok Shop, analytics externo, colaboração, SSO, i18n operacional, scraping complexo, embeddings/banco vetorial ou microserviços.

Fontes canônicas: `docs/product/PRD.md` define produto e escopo; `DESIGN.md` define a superfície visual; os ADRs registram decisões com trade-offs; este documento descreve a composição entre elas.

## 2. Forma do sistema

O sistema é um monólito modular em TypeScript/Next.js, com PostgreSQL/Prisma como persistência canônica. Web e worker usam os mesmos módulos e contratos; o worker pode ser um processo separado do mesmo deploy. Serviços externos só entram por adaptadores.

```text
Creator -> Web/API -> Application Use Cases -> Domain Modules
Worker -> Application Use Cases
Infrastructure Adapters -> Ports <- Application Use Cases
```

Não há uma separação física entre serviços no MVP. A separação importante é de responsabilidade e direção de dependências.

## 3. Mapa de módulos

| Módulo | Responsabilidade | Não possui |
|---|---|---|
| **Identity / Tenant** | sessão, usuário, tenant/workspace pessoal, resolução de autorização e escopo | colaboração, RBAC, SSO ou billing de equipe |
| **Product** | fatos do produto, contexto, locale `pt-BR`, entrada manual e fonte URL opcional | estratégia comercial ou scraping obrigatório |
| **Strategy** | análise comercial, taxonomia, decisão de públicos/dores/benefícios/ângulos e contrato da engine | fila, quota ou detalhes de provider |
| **Content / Plan** | plano, Contents, dimensões de variedade, edição, proveniência e estados do conteúdo | chamada direta ao modelo ou mídia |
| **Production** | fila manual, lotes simples, modo de gravação e estados operacionais | publicação automática ou vídeo gerado |
| **Generation** | `generation_run`, idempotência, fila, lease, retries e coordenação do worker | decisão estratégica e regra de quota |
| **Entitlements** | plano, limite, reserva, confirmação/liberação e virada mensal de uso | qualidade diferente por plano ou cobrança |

Os módulos são limites de código. Uma tabela pode apoiar mais de um fluxo sem transformar cada tabela em um agregado ou em um módulo próprio.

Campanha, quando existir, é apenas um agrupamento opcional de Products/Contents. Não é requisito do fluxo do MVP, não cria módulo próprio e não participa das quotas de Entitlements.

## 4. Fluxo do domínio

O fluxo principal é:

```text
Product → Strategy → Plan → Content → Production
```

1. **Product:** o creator fornece descrição manual e contexto mínimo; URL pode enriquecer sem bloquear.
2. **Strategy:** a engine interpreta a oportunidade comercial, consulta histórico autorizado e decide dimensões estratégicas.
3. **Plan:** o caso de uso solicita uma quantidade permitida e a engine distribui Contents conforme contexto e lacunas, não por tabela fixa.
4. **Content:** cada item recebe hook, estrutura, script, cenas, CTA, dimensões de variedade e proveniência; permanece editável.
5. **Production:** o creator seleciona, grava e atualiza manualmente Ideia, Pronto para gravar, Gravado, Publicado ou Arquivado.

Identity/Tenant envolve todo o fluxo. Entitlements autoriza a capacidade antes da geração. Generation executa Strategy/Plan/Content de forma durável, mas não substitui esses módulos.

## 5. Direção de dependências

As dependências seguem para dentro:

```text
Web/API ───────┐
Worker ────────┼──> Application Use Cases ───> Domain Rules
               │             │                     │
               └─────────────┴──> Ports <──────────┘
                                      ↑
                           Infrastructure Adapters
```

- Web e worker chamam casos de uso; não acessam banco, provider ou regra de quota diretamente.
- Casos de uso carregam contexto de tenant, aplicam autorização, orquestram módulos e definem transações curtas.
- Domínio contém decisões, invariantes e políticas; não conhece Next.js, Prisma, HTTP, cookies ou SDKs.
- Ports existem apenas onde há uma fronteira real: persistência, sessão, fila e sistemas externos.
- Adapters implementam ports e convertem falhas externas para erros operacionais compreensíveis.
- Um módulo não lê tabelas de outro módulo para contornar seu contrato; usa um caso de uso ou uma consulta explicitamente compartilhada.

## 6. Domínio, aplicação e infraestrutura

### Domínio

Representa linguagem e regras de Product, Strategy, Plan, Content, Production, Tenant e Entitlements. Inclui invariantes como dimensões de variedade válidas, Content estruturalmente gravável e estados de produção permitidos. Só cria um limite de consistência quando há comportamento e invariantes juntos; não cria um agregado por tabela.

### Aplicação

Coordena ações como criar Produto, iniciar geração, consultar resultado, editar Content, marcar Gravado e iniciar novo lote. Monta snapshots, exige `tenant_id`, verifica Entitlements, cria a `generation_run`, chama a engine e coordena persistência. É o lugar de workflow e transação, não de regra específica de provider.

### Infraestrutura

Conecta Next.js, sessões server-side, PostgreSQL/Prisma, fila baseada no PostgreSQL, processo worker, adaptador de fonte URL e adaptador do provider textual. A implementação futura de mídia também ficará aqui. Infraestrutura não deve vazar detalhes para o domínio.

## 7. Contratos e adaptadores

O contrato de geração é o `GenerationInput v1`/`GenerationOutput v1` do ADR-002. Ele congela o snapshot de entrada, exige cardinalidade/validação, registra engine/provider/taxonomia e liga o resultado à `generation_run`. O produto-exemplo gold-standard é pré-condição para implementar a engine.

As fronteiras externas são:

- **Fonte de Produto:** `ProductSourceAdapter` opcional para URL best-effort; descrição manual continua canônica.
- **Texto/estratégia:** adapter de um provider por vez; o provider preenche texto, mas não possui a regra do domínio.
- **Persistência:** acesso relacional e payloads JSONB versionados por ports necessários, sem repositórios genéricos universais.
- **Sessão/fila:** infraestrutura de sessão e execução durável, escondida dos casos de uso por contratos mínimos.
- **Mídia futura:** `Content → Production Specification → Media Provider Adapter`; nenhum provider ou registry é implementado no MVP.

Contratos de domínio são versionados quando sua mudança altera consumidores, proveniência ou interpretação. Uma simples refatoração interna não exige novo contrato nem ADR.

## 8. Fronteiras críticas

### Persistência

PostgreSQL é a fonte de registro para tenant, Product, Strategy snapshots, Plan, Content, Production, `generation_run` e uso. Campos usados em autorização, busca, estados e variedade são estruturados; JSONB guarda payloads evolutivos e versionados. Vault, Content e fila consultam o mesmo corpus. Campanha, se usada, permanece agrupamento opcional e não é quota.

Excluir um Content não pode apagar a memória usada para controlar variedade. A modelagem deve preservar essa memória por tombstone/flag de exclusão ou por registro separado; a escolha do schema fica para a implementação.

### Autorização

O cookie contém uma referência opaca a uma sessão server-side. A sessão resolve usuário e tenant; cada caso de uso aplica o escopo no servidor. `tenant_id` vindo do cliente nunca é autoridade. A regra inicial é um usuário para um tenant/workspace, com caminho posterior para membros e papéis.

### Geração

O web app inicia uma execução em transação curta, reserva Entitlements com a mesma `generation_run.id` usada como chave idempotente e enfileira o trabalho. O worker chama o provider fora de transação, valida a saída v1 e finaliza persistência/memória/uso em nova transação curta. Falhas, retries e cancelamentos não publicam Content parcial.

O período mensal de quota é definido pela criação da run em UTC. O locale do MVP é `pt-BR`; não há infraestrutura de i18n nesta fase.

### Mídia futura

No MVP, Production significa o creator gravar e atualizar status. No futuro, Content poderá produzir uma especificação neutra para um executor de mídia. Provider, artefato, credenciais, custo e armazenamento permanecem fora do core estratégico e fora do MVP.

## 9. Fluxos de sistema

### Fluxo web

1. Resolver sessão e tenant.
2. Criar ou completar Product manualmente; tentar URL apenas como enriquecimento isolado.
3. Receber contexto e quantidade, carregar histórico autorizado e aplicar Entitlements.
4. Criar `generation_run` e reserva em transação curta; devolver identificador e estado `queued`.
5. Consultar estado até `succeeded`, `failed` ou `cancelled`; exibir resultado completo, erro recuperável ou limite sem esconder o contexto.
6. Permitir edição e atualização manual de Production.

### Fluxo worker

1. Reivindicar uma run com lease.
2. Carregar snapshot de entrada, estratégia/histórico e escopo de tenant.
3. Chamar o provider fora de transação.
4. Validar `GenerationOutput v1`, dimensões, cardinalidade e proveniência.
5. Persistir Strategy/Plan/Content, memória e confirmação/liberação de uso em transação curta.
6. Marcar sucesso ou falha sanitizada; retries reutilizam a mesma chave e não duplicam resultado.

## 10. Relação com os ADRs

| Documento | Papel neste desenho |
|---|---|
| [ADR-001](./adr-001-monolito-modular-e-stack-do-mvp.md) | monólito modular, stack e forma de deploy |
| [ADR-002](./adr-002-engine-estrategica-como-core.md) | core estratégico e contratos v1 da engine |
| [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) | persistência, memória e proveniência |
| [ADR-004](./adr-004-variedade-por-memoria-estruturada.md) | regra de variedade baseada em memória |
| [ADR-005](./adr-005-geracoes-assincronas-e-duraveis.md) | run, worker, transações curtas e idempotência |
| [ADR-006](./adr-006-limites-de-plano-e-uso.md) | Entitlements, reserva e quota mensal |
| [ADR-007](./adr-007-fronteira-de-producao-de-midia-futura.md) | fronteira de mídia futura |
| [ADR-008](./adr-008-entrada-de-produto-manual-first.md) | entrada manual e URL best-effort |
| [ADR-009](./adr-009-identidade-autorizacao-e-tenant-inicial.md) | identidade, tenant e autorização |

Se uma implementação contrariar um ADR, o ADR deve ser revisado antes da mudança. Se apenas conectar decisões já aceitas, este documento pode ser atualizado sem criar nova decisão.
