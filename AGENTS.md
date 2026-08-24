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
6. `docs/specs/<feature>/SPEC.md`, quando existir — comportamento e contrato da feature;
7. `docs/specs/<feature>/PLAN.md`, quando existir — plano de implementação aprovado.

### Autoridade dos documentos

- PRD governa produto, domínio e escopo.
- ADR aceito governa a decisão arquitetural específica que registra.
- SYSTEM-DESIGN representa a arquitetura vigente do sistema.
- PRINCIPLES governa práticas permanentes de engenharia.
- DESIGN governa UX/UI.
- SPEC governa o comportamento da feature.
- PLAN governa a estratégia de implementação da feature.

Em caso de conflito ou inconsistência relevante entre fontes, não escolha
silenciosamente uma interpretação. Preserve o comportamento existente e
sinalize a inconsistência antes de introduzir uma nova decisão.

## Regras operacionais

- Preserve o escopo do MVP e questione funcionalidades que não contribuam
  diretamente para o problema definido no PRD.

- Alinhe UX/UI ao `DESIGN.md`, arquitetura ao SYSTEM-DESIGN/ADRs,
  implementação ao `PRINCIPLES.md` e comportamento da feature à sua SPEC.

- Não introduza patterns, abstrações ou infraestrutura por preferência pessoal.

- Evite overengineering: reutilize o que existe, prefira a menor solução
  correta e não crie abstrações sem necessidade demonstrada.

- Respeite os limites dos módulos. Não contorne regras de domínio,
  autorização, tenant, quota ou persistência acessando infraestrutura diretamente.

- Crie ou atualize um ADR antes de implementar mudança relevante de trade-off
  arquitetural, fronteira de módulo, persistência, segurança, contrato externo,
  serviço externo ou dependência transversal relevante.

- Não altere PRD, ADR, SYSTEM-DESIGN, DESIGN ou PRINCIPLES apenas para fazer
  a implementação atual parecer compatível. Mudanças nessas fontes devem ser
  deliberadas.

- Releia as fontes relevantes quando a tarefa mudar de escopo, contrato,
  domínio ou fronteira.

- Antes de declarar uma implementação concluída, execute as validações
  relevantes disponíveis no projeto, incluindo testes, typecheck, lint e build.
  Informe explicitamente qualquer validação que não tenha sido executada.