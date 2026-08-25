# Prompt — Criar SPEC do Slice Atual

Leia `AGENTS.md`, as fontes canônicas e `docs/delivery/SLICES.md`.

Selecione somente o próximo slice aprovado ainda sem SPEC, respeitando suas dependências e o estado real do repositório.

Crie:

`docs/specs/<slice>/SPEC.md`

A SPEC deve definir:

- User Outcome;
- contexto;
- In Scope;
- Out of Scope;
- comportamentos;
- regras e invariantes;
- validações e erros;
- estados de UX relevantes;
- segurança/autorização aplicável;
- critérios de aceite verificáveis.

Regras:

- não implemente;
- não escreva PLAN;
- não antecipe slices futuros;
- não invente decisões ausentes;
- SPEC define comportamento, não implementação;
- siga a terminologia e os boundaries das fontes canônicas.

Após criar a SPEC, delegue sua revisão aos agentes especializados relevantes ao slice.

Se houver reprovação, corrija a SPEC e submeta novamente à revisão.

Repita até obter `APPROVED`.

Quando aprovada, execute o prompt `10-criar-plan`.