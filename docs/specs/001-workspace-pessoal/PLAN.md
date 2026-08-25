# PLAN — Slice 001: Workspace pessoal e primeiro acesso

## Objetivo

Implementar integralmente a `SPEC.md` do Slice 001: criação/acesso de conta, sessão server-side, provisionamento idempotente de um Tenant/Workspace pessoal e entrada em `Hoje` com a próxima ação `Adicionar produto`.

O repositório atual contém somente documentação canônica e nenhum código de produto. Portanto, este plano começa pela fundação mínima do monólito modular descrito no System Design, sem criar infraestrutura de slices posteriores.

## Passos de implementação

1. **Estabelecer a superfície mínima do slice**
   - Criar a estrutura mínima da aplicação Next.js/TypeScript prevista no System Design.
   - Definir as rotas/superfícies somente para acesso, saída e `Hoje`.
   - Manter o mecanismo concreto de criação/acesso compatível com a decisão ainda aberta no ADR-009; não introduzir SSO, login social ou provider externo.

2. **Modelar Identity/Tenant**
   - Persistir User, Tenant/Workspace pessoal e sessão server-side com identificadores não previsíveis.
   - Garantir a relação de um usuário para exatamente um Workspace após provisionamento bem-sucedido.
   - Aplicar unicidade e transação para impedir duplicação em submissões repetidas ou concorrentes.
   - Não criar tabelas ou workflows de membros, convites, RBAC, billing ou Product.

3. **Implementar o caso de uso de criação e acesso**
   - Validar entradas antes de persistir.
   - Selecionar o mecanismo de credencial mínimo compatível com o MVP antes da implementação; se a escolha alterar um trade-off do ADR-009, atualizar o ADR antes do código.
   - Encapsular a verificação da prova de acesso em um port de Identity; nunca considerar apenas um identificador fornecido pelo cliente como autenticação, nem armazenar credencial em texto claro.
   - Criar ou localizar a conta de forma idempotente conforme o resultado observável definido na SPEC, com falha uniforme que não enumere contas.
   - Provisionar ou resolver o Workspace na mesma fronteira transacional necessária para não deixar conta autenticável sem Workspace válido.
   - Criar a sessão server-side, rotacionando a referência opaca e emitindo cookie com os atributos exigidos.

4. **Implementar resolução, rotação e saída da sessão**
   - Resolver sessão, usuário e Tenant/Workspace em cada request protegido.
   - Invalidar a referência anterior em criação/renovação e na saída.
   - Aplicar expiração e revogação server-side.
   - Nunca aceitar `tenant_id` do cliente como autoridade.
   - Não registrar cookie, token, segredo ou payload de sessão.

5. **Proteger operações mutáveis**
   - Centralizar a proteção de origem em um port de segurança e, para requests baseados em cookie, aceitar somente a origem da aplicação configurada; rejeitar `Origin` ausente/nulo ou divergente antes da mutação.
   - Rejeitar requisições sem proteção válida antes de alterar estado.
   - Manter erros sanitizados e não enumerar contas ou Workspaces.

6. **Implementar `Hoje` vazio**
   - Renderizar a superfície `Hoje` somente após resolver sessão e Workspace.
   - Exibir estado vazio, texto orientado à próxima ação e CTA `Adicionar produto` como entrada do Slice 002.
   - Não exibir dados de Product, KPI, gráficos, scorecards ou métricas decorativas.
   - Respeitar o shell responsivo existente no DESIGN.md, foco visível, teclado, mensagens associadas e alvos de toque de `44×44px`.

7. **Cobrir falhas e concorrência**
   - Tratar validação, acesso recusado, sessão expirada/revogada, falha de provisionamento e falhas de rede como estados recuperáveis quando aplicável.
   - Garantir retry sem Workspace substituto silencioso, conta duplicada ou sessão apontando para escopo incorreto.
   - Não redirecionar para `Hoje` enquanto o Workspace não estiver resolvido.

## Áreas e componentes afetados

- Módulo **Identity / Tenant**: User, Tenant/Workspace, sessão, resolução de contexto e casos de uso de acesso.
- Camada de aplicação: casos de uso de criar/acessar conta, resolver sessão e sair.
- Ports/adapters de persistência e sessão, conforme fronteiras reais do System Design.
- Rotas ou handlers web mínimos de acesso, saída e `Hoje`.
- Componentes de interface do estado vazio de `Hoje` e do fluxo de acesso.
- Configuração mínima de execução do monólito, somente se necessária para o slice.

Não alterar PRD, ADRs, SYSTEM-DESIGN, DESIGN, PRINCIPLES ou SLICES. Não criar áreas de Product, Strategy, Plan, Content, Production, Generation, Entitlements ou Vault além de referências necessárias para manter a ausência explícita no estado vazio.

## Persistência e migrations

- Criar apenas as tabelas/campos necessários para User, Tenant/Workspace e sessão server-side.
- Persistir `tenant_id` nas estruturas protegidas que existirem; não criar entidades de slices futuros.
- Definir FKs e campos não nulos para preservar User↔Tenant/Workspace e Session↔User/Workspace; impedir referências órfãs ou escopo inconsistente.
- Adicionar restrição de unicidade que impeça mais de um Workspace pessoal por usuário.
- Adicionar índices necessários para resolver sessão e escopo de usuário/tenant sem varredura ampla.
- Tornar criação de conta + Workspace atômica; retry/concorrência deve convergir para um único par User/Workspace.
- Sessões devem permitir expiração, revogação e rotação da referência sem armazenar token de acesso em claro quando a estratégia escolhida permitir hash/referência derivada.
- Definir política operacional de expiração, renovação, revogação e limpeza de sessões; validar que sessões expiradas/revogadas não autenticam e podem ser removidas sem afetar sessões válidas.
- Migration deve ser reversível sem apagar dados de usuário silenciosamente.

## Segurança e autorização

- Cookie de sessão opaco, `HttpOnly`, `Secure` em produção e `SameSite` apropriado.
- Nenhum token em local storage.
- Contexto de usuário e Tenant sempre derivado da sessão server-side.
- `tenant_id` recebido do cliente é ignorado ou rejeitado como escopo de autorização.
- Validar `Origin` contra a origem da aplicação configurada em toda operação mutável baseada em cookie; rejeitar origem ausente, nula ou divergente.
- Expiração, rotação e revogação no servidor; referência anterior inválida após rotação.
- Mensagens e logs não podem revelar cookies, tokens, segredos, IDs de sessão ou existência de recursos protegidos.
- Testar tentativa de acesso cruzado entre usuários/Workspaces e tentativa de manipular escopo.
- Testar redaction de logs e respostas de erro para confirmar ausência de cookies, tokens, segredos e IDs de sessão.

## Tratamento de erros

- Validação: resposta associada aos campos, sem persistência parcial.
- Acesso inválido ou conta já existente: falha recuperável sem enumeração indevida.
- Falha de transação/provisionamento: não entrar em `Hoje`; retry idempotente ou retorno seguro ao acesso.
- Sessão ausente, inválida, expirada ou revogada: impedir recurso protegido e conduzir ao acesso.
- CSRF/origin inválido: rejeitar antes da mutação.
- Falha de carregamento de `Hoje`: preservar sessão, informar estado recuperável e permitir retry sem criar dados.

## Estratégia de testes

Testar contratos observáveis, não nomes ou estrutura interna:

- fluxo válido de criação → sessão → `Hoje` vazio → `Adicionar produto`;
- prova de acesso inválida não cria sessão, não revela existência de conta e não permite takeover;
- acesso recorrente resolve o mesmo Workspace;
- criação repetida e concorrente produz um único User/Workspace;
- validação e falha de provisionamento não deixam estado parcial;
- FKs, campos não nulos e unicidade impedem User/Workspace/Session órfãos ou escopos inconsistentes;
- saída, expiração, revogação e rotação invalidam referências antigas; limpeza não remove sessões válidas;
- atributos do cookie e ausência de token em local storage;
- requests mutáveis com `Origin` válido funcionam; `Origin` ausente, nulo ou divergente são rejeitados;
- isolamento entre dois usuários/Workspaces e rejeição de `tenant_id` manipulável;
- logs e respostas de erro não contêm cookies, tokens, segredos ou IDs de sessão;
- estados de UX de acesso, erro, loading, sessão inválida e `Hoje` vazio em mobile e desktop;
- acessibilidade mínima: teclado, foco-visible, mensagens associadas e alvos de toque.

## Validações finais

- Executar migrations em banco limpo e verificar criação idempotente sob repetição/concorrência.
- Executar testes de comportamento do fluxo completo e de autorização.
- Executar teste de rollback/reversão em cópia do banco e confirmar que dados existentes não são apagados silenciosamente.
- Executar typecheck, lint e build disponíveis no projeto.
- Iniciar a aplicação e verificar manualmente o fluxo real de criação/acesso, saída, retorno a `Hoje` e CTA `Adicionar produto`.
- Verificar que nenhuma capacidade de slices futuros foi implementada ou exposta além do CTA de entrada.
- Verificar a superfície em mobile e desktop conforme `DESIGN.md` antes de declarar o slice concluído.
