# Prompt — Criar ou Atualizar System Design

Leia `AGENTS.md` se existir.

Descubra e leia **todos os PRDs relevantes em `docs/product/`** para o escopo atual. Não assuma que `docs/product/PRD.md` é a única fonte funcional.

Leia também System Design e ADRs existentes, quando houver.

Crie ou atualize `docs/architecture/SYSTEM-DESIGN.md` com a arquitetura técnica integrada necessária para sustentar o produto e o escopo atual.

Defina, conforme aplicável:

- módulos/domínios e boundaries;
- fluxos principais;
- persistência;
- integrações;
- autenticação e autorização;
- processamento assíncrono;
- requisitos não funcionais;
- segurança;
- observabilidade necessária;
- evolução já conhecida que afete fronteiras arquiteturais atuais.

Projete para o produto real e para as necessidades atuais.

Antecipe apenas fronteiras futuras cuja existência já seja relevante para evitar acoplamento incorreto. Não implemente infraestrutura especulativa.

Em projeto existente, preserve decisões válidas e altere somente o que a nova necessidade realmente exigir.

Não crie ADRs ainda. Ao final, liste somente decisões relevantes com alternativas e trade-offs que mereçam ADR separado.

Se PRDs relevantes entrarem em conflito material, não escolha uma interpretação silenciosamente: registre o conflito e pare para revisão.
