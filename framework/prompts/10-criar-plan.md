# Prompt — Criar PLAN do Slice Atual

Leia `AGENTS.md`, as fontes canônicas, `docs/delivery/SLICES.md`
e a SPEC aprovada do slice atual.

Crie:

`docs/specs/<slice>/PLAN.md`

O PLAN deve definir como implementar integralmente a SPEC no estado real atual do repositório.

Inclua somente o necessário para o slice:

- passos de implementação;
- áreas/componentes afetados;
- persistência ou migrations quando necessárias;
- segurança e autorização;
- tratamento de erros;
- estratégia de testes;
- validações finais.

Regras:

- não implemente código;
- não expanda o escopo da SPEC;
- não antecipe slices futuros;
- respeite System Design, ADRs e Engineering Principles;
- prefira a menor solução correta;
- não introduza infraestrutura ou abstrações especulativas.

Após criar o PLAN, delegue sua revisão aos agentes especializados relevantes ao slice.

Se houver reprovação, corrija o PLAN e submeta novamente à revisão.

Repita até obter `APPROVED`.

Quando aprovado, execute o prompt `11-implementar-slice`.