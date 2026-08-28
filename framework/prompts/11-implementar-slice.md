# Prompt — Implementar Slice

Leia `AGENTS.md`, as fontes canônicas, `docs/delivery/SLICES.md`,
a `SPEC.md` aprovada e o `PLAN.md` aprovado do slice atual.

Implemente integralmente somente o slice atual seguindo o PLAN e respeitando
a SPEC como contrato de comportamento.

Regras:

- não antecipe slices futuros;
- não expanda a SPEC;
- siga System Design, ADRs, PRINCIPLES e DESIGN quando aplicável;
- implemente os testes previstos junto do comportamento;
- preserve regras de domínio, tenant, autorização, quota e segurança;
- não introduza abstrações ou infraestrutura especulativas.

Se durante a implementação surgir algo que invalide materialmente a SPEC ou
o PLAN, corrija o artefato correspondente e passe novamente por revisão
antes de continuar.

Quando a implementação prevista no PLAN estiver concluída, execute
`12-review-verificar-slice`.