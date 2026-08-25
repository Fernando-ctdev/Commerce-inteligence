# SPEC — Slice 001: Workspace pessoal e primeiro acesso

## User Outcome

O creator consegue criar sua conta, entrar em seu Workspace pessoal e encontrar uma próxima ação clara para começar: `Adicionar produto`.

## Contexto

Este é o primeiro slice do MVP e não depende de outro slice. O produto precisa estabelecer identidade, sessão e isolamento antes de qualquer Product ou dado operacional existir.

No MVP, cada usuário corresponde a um único Tenant/Workspace pessoal. Usuário e Tenant permanecem conceitos distintos no domínio, embora não haja colaboração, membros ou papéis neste slice. A experiência inicial acontece na superfície `Hoje`, em estado vazio e orientada à próxima ação.

A SPEC define o comportamento observável. O método de login, provedor de identidade e SSO não são definidos pelas fontes canônicas e permanecem fora deste contrato.

## In Scope

- Criar uma conta de usuário pelo fluxo de acesso disponibilizado pela aplicação.
- Criar ou resolver exatamente um Tenant/Workspace pessoal para o usuário autenticado.
- Criar uma sessão autenticada revogável e mantê-la durante o uso normal.
- Entrar novamente em uma conta existente e resolver o mesmo Workspace pessoal.
- Abrir `Hoje` após o primeiro acesso autenticado.
- Exibir `Hoje` em estado vazio quando ainda não houver Product ou trabalho operacional.
- Oferecer a ação clara `Adicionar produto` como próximo passo.
- Encerrar a sessão e impedir acesso autenticado posterior com a sessão encerrada.

## Out of Scope

- Login social, SSO, SCIM ou integração com provedor de identidade externo.
- Colaboração, múltiplos membros, convites, organizações ou RBAC.
- Billing, plano comercial ou limites de uso.
- Cadastro, edição ou análise de Product.
- Strategy, Plan, Content, Production, Generation, Vault ou analytics.
- Dashboard analítico, KPI, gráficos ou métricas decorativas.
- Escolher ou trocar de Tenant/Workspace.

## Comportamentos

### Criação e primeiro acesso

1. Uma pessoa sem conta inicia o fluxo de criação de conta.
2. Com dados válidos, a aplicação cria a conta e associa um Tenant/Workspace pessoal único.
3. A aplicação cria a sessão autenticada e direciona a pessoa para `Hoje`.
4. `Hoje` informa que ainda não há trabalho iniciado e apresenta `Adicionar produto` como ação primária.
5. A conta recém-criada não recebe Products, Contents, filas ou outros dados de outro usuário.

### Acesso recorrente

1. Uma pessoa com conta inicia o fluxo de acesso.
2. Com credenciais/dados aceitos pelo mecanismo de acesso adotado, a aplicação cria ou renova uma sessão válida.
3. A sessão resolve o mesmo usuário e o mesmo Tenant/Workspace pessoal associado à conta.
4. A aplicação direciona a pessoa autenticada para `Hoje`.
5. Se o Workspace ainda não tiver dados operacionais, `Hoje` continua no estado vazio com `Adicionar produto`.

### Sessão e saída

- Uma sessão válida permite acessar somente o Workspace resolvido para o usuário.
- Encerrar a sessão revoga ou invalida a sessão no servidor.
- Após a saída, páginas e operações autenticadas exigem novo acesso; não basta ocultar a interface no cliente.
- Sessão expirada ou revogada retorna a pessoa ao fluxo de acesso, sem revelar dados protegidos.

### Estado vazio de Hoje

- O estado vazio deve responder imediatamente à pergunta “o que faço agora?”.
- A ação primária é `Adicionar produto`; não existe uma página `Home` paralela.
- O estado não usa KPI cards, gráficos, scorecards ou números decorativos.
- A capacidade de iniciar o próximo slice permanece acessível em mobile e desktop; o mobile prioriza a ação sem remover capacidades.

## Regras e invariantes

- Após o provisionamento bem-sucedido, cada usuário possui exatamente um Tenant/Workspace pessoal no MVP.
- Cada Tenant/Workspace pessoal pertence a um único usuário no MVP.
- Toda leitura e escrita autenticada é escopada ao Tenant resolvido no servidor.
- `tenant_id` enviado pelo cliente nunca é autoridade para selecionar ou trocar o Workspace.
- Uma conta não pode acessar ou inferir dados de outro usuário ou Tenant.
- A resolução de sessão deve resultar em usuário e Tenant válidos; caso contrário, a requisição é não autenticada.
- O primeiro acesso deixa o Workspace pronto para iniciar a jornada, mas não cria Product implicitamente.
- `Hoje` não apresenta progresso ou métricas sem vínculo com um Product, Content, lote ou fila reais.
- O locale operacional do MVP é `pt-BR`.

## Validações e erros

- Dados obrigatórios e formato dos dados de criação/acesso devem ser validados antes de criar conta ou sessão.
- Dados inválidos não criam conta, Tenant/Workspace nem sessão parcialmente.
- Tentativa de criar uma conta já existente deve falhar de modo recuperável, sem expor dados além do necessário para orientar a pessoa.
- Acesso com dados inválidos, sessão expirada ou sessão revogada deve produzir erro de autenticação recuperável e oferecer retorno ao fluxo de acesso.
- Falha ao criar ou resolver o Tenant/Workspace deve impedir a entrada em uma área autenticada; não criar um Workspace substituto silenciosamente.
- Acesso a recurso autenticado sem sessão válida deve falhar como não autorizado e não revelar se o recurso existe.
- Falhas não devem expor cookies, tokens, segredos, identificadores de sessão ou dados de outro Tenant.
- Falhas de rede ou carregamento na entrada devem preservar a possibilidade de tentar novamente sem duplicar conta ou Workspace; criação e provisionamento devem ser idempotentes para submissões repetidas ou concorrentes.

## Estados de UX relevantes

- **Não autenticado:** fluxo de criar conta/entrar disponível; nenhum dado de Workspace exposto.
- **Validando:** submissão ou resolução de sessão em andamento; impedir duplo acionamento e comunicar a atividade.
- **Erro de validação:** campos inválidos destacados com mensagem associada e correção possível.
- **Erro de acesso:** entrada recusada com mensagem recuperável, sem confirmação indevida de conta existente.
- **Erro de provisionamento:** conta não entra em `Hoje` até que o Workspace seja resolvido; oferecer retry ou retorno seguro ao acesso.
- **Autenticado / carregando Hoje:** sessão válida, mas estado da superfície ainda sendo resolvido.
- **Hoje vazio:** Workspace carregado sem Product/trabalho; `Adicionar produto` é claramente a próxima ação.
- **Sessão expirada/revogada:** interromper acesso protegido e retornar ao fluxo de acesso com contexto seguro.
- **Saída concluída:** confirmar o encerramento sem deixar conteúdo protegido navegável.

A experiência deve manter foco visível, ordem de teclado, mensagens associadas aos controles e alvos de toque mínimos de `44×44px`. O comportamento deve funcionar em mobile, tablet e desktop conforme o shell definido em `DESIGN.md`, sem depender apenas de cor para comunicar estado.

## Segurança e autorização

- Usar sessão server-side com cookie opaco `HttpOnly`, `Secure` em produção e `SameSite` apropriado, conforme ADR-009.
- Não armazenar token de acesso em local storage.
- Resolver usuário e Tenant/Workspace em cada request autenticado no servidor.
- Validar origem/CSRF para operações mutáveis de acordo com a estratégia de cookie adotada.
- Aplicar expiração, rotação e revogação server-side da sessão.
- Não registrar cookies, tokens ou dados de sessão nos logs.
- Rejeitar ausência de sessão, sessão inválida e qualquer tentativa de escopo para outro Tenant.
- Não implementar RBAC, colaboração ou troca de Tenant neste slice.

## Critérios de aceite verificáveis

1. Uma pessoa sem conta consegue concluir o fluxo de criação com dados válidos, passa a ter sessão autenticada e chega a `Hoje`.
2. A criação de conta provisiona exatamente um Workspace pessoal associado à conta; recarregar ou entrar novamente não cria outro Workspace.
3. O primeiro `Hoje` exibe estado vazio e a ação `Adicionar produto`, sem Home paralelo, KPI, gráfico ou métrica decorativa.
4. Uma pessoa com conta consegue entrar novamente e a sessão resolve o mesmo Workspace pessoal.
5. Dois usuários distintos não conseguem ler ou alterar a sessão, Workspace ou dados protegidos um do outro.
6. Uma requisição autenticada não consegue trocar seu escopo usando `tenant_id` fornecido pelo cliente.
7. Encerrar a sessão invalida o acesso protegido no servidor; acessar novamente exige novo fluxo de entrada.
8. Sessão ausente, expirada ou revogada não revela dados protegidos e conduz ao fluxo de acesso com erro recuperável.
9. Dados de criação/acesso inválidos não criam conta, Workspace ou sessão parcial e mostram mensagens associadas para correção.
10. Falha de provisionamento não cria Workspace substituto silencioso e permite retry seguro sem duplicação.
11. O fluxo completo permanece utilizável em mobile e desktop, com foco visível, teclado operável, alvos de toque de pelo menos `44×44px` e estados que não dependem somente de cor.
12. O fluxo não implementa colaboração, RBAC, SSO, cadastro/edição de Product, Strategy, Plan, Content, Production, Generation ou analytics; a ação `Adicionar produto` é apenas a entrada prevista para o Slice 002.
13. Operações mutáveis sem proteção de origem/CSRF válida, conforme a estratégia de cookie adotada, são rejeitadas e não alteram conta, sessão ou Workspace.
14. O cookie de sessão observado no navegador é opaco, `HttpOnly`, usa `Secure` em produção e `SameSite` apropriado; nenhum token de acesso é armazenado em local storage.
15. A criação de sessão e qualquer renovação devem rotacionar a referência opaca; a referência anterior deixa de autenticar e a nova referência resolve o mesmo usuário e Workspace. Uma referência revogada ou expirada falha sem revelar dados.
16. Submissões repetidas ou concorrentes do mesmo fluxo de criação, inclusive após retry de rede, resultam em uma única conta e um único Workspace pessoal, sem provisionamentos duplicados.
