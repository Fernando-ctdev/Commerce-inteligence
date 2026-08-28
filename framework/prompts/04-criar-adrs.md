# Prompt — Criar ADRs

Leia `AGENTS.md` quando existir, os PRDs relevantes em `docs/product/`, `docs/architecture/SYSTEM-DESIGN.md` e ADRs já aceitos.

Identifique apenas decisões arquiteturais relevantes com alternativas e trade-offs reais.

Para cada nova decisão necessária, crie um ADR em:

`docs/architecture/adr-XXX-<slug>.md`

Cada ADR deve conter:

- Context;
- Decision;
- Alternatives Considered;
- Positive Consequences;
- Negative Consequences;
- Related.

Não crie ADR para:

- detalhes locais de implementação;
- preferências pessoais;
- decisões reversíveis de baixo impacto;
- decisões já plenamente governadas por outro ADR.

Em projeto existente, não recrie ADRs apenas para documentar novamente decisões já aceitas.

Ao final, verifique se System Design e ADRs formam uma arquitetura coerente com os PRDs relevantes.
