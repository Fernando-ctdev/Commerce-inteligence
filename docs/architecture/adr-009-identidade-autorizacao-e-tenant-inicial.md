# ADR-009: Identidade, autorização e tenant inicial

## Status

Aceito — modelo de identidade do MVP.

## Contexto

O produto possui conta, produtos, histórico e limites de uso; portanto, todo dado precisa de um dono e de isolamento server-side. O MVP ainda não precisa resolver colaboração em equipe nem identidade corporativa.

**Relação com o PRD:** §§ 4, 31, 34, 47, 49 e 58.

## Decisão

No MVP, cada usuário corresponde a um único tenant/workspace pessoal (`1 usuário = 1 tenant`). Usuário e tenant continuam conceitos distintos no modelo para que os dados já carreguem `tenant_id` e possam evoluir para membros depois.

Usar sessão server-side com cookie opaco `HttpOnly`, `Secure` e `SameSite` apropriado. O navegador não guarda token de acesso em local storage e não envia `tenant_id` como autoridade.

Cada request autenticado resolve a sessão para usuário e tenant; casos de uso e consultas exigem esse contexto e aplicam o escopo no servidor. Ausência de sessão ou acesso a outro tenant resulta em falha de autorização. Este ADR não escolhe método de login, provedor de identidade ou SSO.

O caminho de evolução é adicionar associação usuário–tenant, membros, convites e papéis sem remover `tenant_id` dos dados existentes. Colaboração só entra quando houver requisito de produto.

## Rationale

1. Isola dados desde o primeiro modelo sem introduzir RBAC e convites prematuros.
2. Sessão revogável server-side é adequada ao monólito web e reduz exposição de tokens no browser.
3. A fronteira usuário/tenant preserva uma migração simples para equipes.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| Um usuário por tenant + sessão server-side (escolhida) | Simples, revogável e suficiente para o MVP | Não suporta colaboração ainda |
| Tenant multiusuário com RBAC desde o início | Pronto para equipes | Convites, papéis e casos de autorização extras |
| JWT no browser | Escala stateless | Revogação, exposição e escopo mais difíceis |

## Consequências

- Toda entidade do domínio deve ser alcançável pelo tenant e toda leitura deve ser filtrada por ele.
- A sessão exige persistência e limpeza/expiração operacional.
- O modelo não promete SSO, organizações empresariais ou múltiplos membros no MVP.

## Segurança / Operação

- Cookies de sessão devem usar HTTPS em produção, expiração, rotação e revogação server-side.
- Operações mutáveis devem validar origem/CSRF de acordo com a estratégia de cookie adotada.
- Logs não devem registrar cookies, tokens ou dados de sessão.
- Testes de autorização devem cobrir tentativa de acessar produto, conteúdo, geração e quota de outro tenant.

## Fora do MVP

Colaboração, múltiplos membros, RBAC, convites, organizações, SSO, SCIM, social login e billing por equipe.

## Gatilhos de revisão

- segundo usuário precisar acessar o mesmo workspace;
- papéis ou convites virarem requisito de produto;
- requisito enterprise de SSO/SCIM;
- volume de sessões exigir armazenamento dedicado.

