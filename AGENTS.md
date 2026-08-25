## Design System

Sempre leia `DESIGN.md` antes de tomar decisões visuais ou de UI.
Fontes, cores, espaçamento, comportamento responsivo, acessibilidade e
direção estética definidos ali são a fonte de verdade. Desvios exigem
justificativa e aprovação explícita.

Em QA, sinalize qualquer implementação que não corresponda ao `DESIGN.md`.

## Fontes canônicas e comportamento dos agentes

Este `AGENTS.md` é a instrução canônica descoberta pelo projeto.
Não crie arquivos paralelos de instrução como `CLAUDE.md`.

Antes de implementar, consulte nesta ordem:

1. `docs/product/PRD.md` — objetivo, domínio, fluxo e escopo do MVP;
2. `docs/architecture/SYSTEM-DESIGN.md` — arquitetura vigente, módulos e dependências;
3. `docs/architecture/adr-*.md` — decisões e trade-offs arquiteturais aceitos;
4. `docs/engineering/PRINCIPLES.md` — regras permanentes de engenharia;
5. `DESIGN.md` — UX/UI, responsividade, acessibilidade, estados e direção visual;
6. `docs/delivery/SLICES.md` — mapa oficial de construção do MVP, ordem, dependências e boundaries dos slices;
7. `docs/specs/<slice>/SPEC.md`, quando existir — comportamento e contrato do slice atual;
8. `docs/specs/<slice>/PLAN.md`, quando existir — plano de implementação aprovado.

### Autoridade dos documentos

- PRD governa produto, domínio e escopo.
- SYSTEM-DESIGN representa a arquitetura vigente.
- ADR aceito governa a decisão arquitetural específica que registra.
- PRINCIPLES governa práticas permanentes de engenharia.
- DESIGN governa UX/UI.
- SLICES governa a decomposição e sequência macro de entrega do MVP.
- SPEC governa o comportamento do slice atual.
- PLAN governa a estratégia de implementação do slice atual.

Antes de iniciar um novo slice, consulte `docs/delivery/SLICES.md`.

Não implemente comportamento pertencente a slices futuros apenas por conveniência.
Se a implementação revelar que o mapa precisa ser dividido, unido, reordenado ou corrigido, atualize o mapa deliberadamente antes de expandir o escopo.

Em caso de conflito ou inconsistência relevante entre fontes, não escolha
silenciosamente uma interpretação. Preserve o comportamento existente e
sinalize a inconsistência antes de introduzir uma nova decisão.

## Regras operacionais

- Preserve o escopo do MVP e questione funcionalidades que não contribuam
  diretamente para o problema definido no PRD.

- Alinhe UX/UI ao `DESIGN.md`, arquitetura ao SYSTEM-DESIGN/ADRs,
  implementação ao `PRINCIPLES.md` e comportamento do slice à sua SPEC.

- Não introduza patterns, abstrações ou infraestrutura por preferência pessoal.

- Evite overengineering: reutilize o que existe, prefira a menor solução
  correta e não crie abstrações sem necessidade demonstrada.

- Respeite os limites dos módulos. Não contorne regras de domínio,
  autorização, tenant, quota ou persistência acessando infraestrutura diretamente.

- Crie ou atualize um ADR antes de implementar mudança relevante de trade-off
  arquitetural, fronteira de módulo, persistência, segurança, contrato externo,
  serviço externo ou dependência transversal relevante.

- Não altere PRD, ADRs, SYSTEM-DESIGN, DESIGN, PRINCIPLES ou SLICES
  apenas para fazer a implementação atual parecer compatível.
  Mudanças nessas fontes devem ser deliberadas.

- Releia as fontes relevantes quando a tarefa mudar de escopo, contrato,
  domínio ou fronteira.

- Antes de declarar uma implementação concluída, execute as validações
  relevantes disponíveis no projeto, incluindo testes, typecheck, lint e build.
  Informe explicitamente qualquer validação que não tenha sido executada.

  ## Framework operacional

Os prompts e templates do framework ficam em `framework/`.

Quando uma etapa do processo exigir um prompt específico, leia e siga o arquivo correspondente em `framework/prompts/`.

Não duplique esses prompts em arquivos paralelos.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
