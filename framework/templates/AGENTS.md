# AGENTS.md

Antes de implementar, leia nesta ordem:

1. `docs/product/PRD.md` — produto, domínio e escopo;
2. `docs/architecture/SYSTEM-DESIGN.md` — arquitetura vigente;
3. `docs/architecture/adr-*.md` — decisões arquiteturais aceitas;
4. `docs/engineering/PRINCIPLES.md` — regras de engenharia;
5. `DESIGN.md` — UX/UI;
6. `docs/delivery/SLICES.md` — mapa macro da entrega;
7. `docs/specs/<slice>/SPEC.md` e `PLAN.md`, quando existirem — contrato e plano do slice atual.

## Autoridade

- PRD governa produto e escopo.
- ADR aceito governa a decisão específica que registra.
- System Design representa a arquitetura vigente.
- Principles governa práticas de engenharia.
- Design governa UX/UI.
- SPEC governa o comportamento do slice atual.
- PLAN governa sua estratégia de implementação.

Em conflito relevante, não invente uma resolução silenciosa.

## Regras operacionais

- preserve o escopo do MVP;
- implemente verticalmente, um slice por vez;
- não introduza patterns/infraestrutura por preferência;
- crie/atualize ADR antes de mudar trade-off arquitetural relevante;
- não altere fontes canônicas apenas para justificar uma implementação;
- antes de concluir, execute testes, typecheck, lint e build disponíveis e reporte o que não pôde ser executado.
