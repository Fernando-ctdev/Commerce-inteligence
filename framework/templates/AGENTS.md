# AGENTS.md

Antes de implementar:

1. descubra e leia os PRDs relevantes em `docs/product/`;
2. leia `docs/architecture/SYSTEM-DESIGN.md` — arquitetura vigente;
3. leia `docs/architecture/adr-*.md` relevantes — decisões arquiteturais aceitas;
4. leia `docs/engineering/PRINCIPLES.md` — regras de engenharia;
5. leia `DESIGN.md` quando houver impacto de UX/UI;
6. leia `docs/delivery/SLICES.md` — mapa macro do escopo atual;
7. leia `docs/specs/<slice>/SPEC.md` e `PLAN.md`, quando existirem — contrato e plano do slice atual.

## PRDs

`docs/product/` pode conter:

- `PRD.md` como PRD principal;
- PRDs especializados para domínios, capacidades ou frentes específicas.

Não assuma que existe apenas um PRD.

Leia somente os especializados relevantes ao escopo atual, além do contexto global necessário.

## Autoridade

- PRD principal governa contexto global, produto e regras funcionais gerais.
- PRD especializado governa sua fronteira funcional específica sem contradizer silenciosamente o principal.
- ADR aceito governa a decisão específica que registra.
- System Design representa a arquitetura vigente.
- Principles governa práticas permanentes de engenharia.
- Design governa UX/UI.
- SLICES governa a decomposição macro do escopo atual.
- SPEC governa o comportamento do slice atual.
- PLAN governa sua estratégia de implementação.

Em conflito relevante, não invente uma resolução silenciosa.

## Regras operacionais

- preserve o escopo atual;
- implemente verticalmente, um slice por vez;
- não introduza patterns ou infraestrutura por preferência;
- crie ou atualize ADR antes de mudar trade-off arquitetural relevante;
- não altere fontes canônicas apenas para justificar uma implementação;
- não recrie fontes que continuam válidas;
- antes de concluir, execute testes, typecheck, lint, build e demais verificações aplicáveis;
- reporte explicitamente o que não pôde ser executado.
