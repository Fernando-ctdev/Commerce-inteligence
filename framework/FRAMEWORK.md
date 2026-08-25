# Framework de Engenharia de Produto Assistida por IA

Este documento define o fluxo canônico do framework.

## 1. Ideia de Produto

Comece pela ideia como ela existe, mesmo incompleta. O objetivo aqui não é documentar formalmente: é entender o problema, o público, a proposta e as principais hipóteses.

**Saída:** contexto suficiente para pesquisar e validar.

## 2. Pesquisa / Validação

Use pesquisa externa quando disponível para confrontar hipóteses sobre dor, alternativas, concorrência, comportamento, mercado, restrições e viabilidade.

A pesquisa não precisa virar um artefato permanente. Ela serve para amadurecer a decisão de produto.

**Saída:** decisão suficientemente informada para escrever o PRD.

## 3. PRD de Produto

O PRD transforma a ideia validada em definição funcional do produto: problema, público, proposta, escopo, core loop, requisitos, não objetivos e critérios de sucesso.

Depois de aprovado, o PRD passa a ser a **principal fonte canônica funcional**. Brainstorming e pesquisa anteriores deixam de ser contexto obrigatório.

**Artefato:** `docs/product/PRD.md`

## 4. System Design

Desenha tecnicamente o sistema como um todo a partir do PRD: módulos, boundaries, fluxos, persistência, integrações, requisitos não funcionais, segurança e evolução.

**Artefato:** `docs/architecture/SYSTEM-DESIGN.md`

## 5. ADRs

Registre apenas decisões arquiteturais relevantes com trade-offs reais. ADR não é diário de implementação e não deve existir para toda escolha pequena.

**Artefato:** `docs/architecture/adr-XXX-*.md`

## 6. Engineering Principles

Define como a equipe/agentes devem pensar a implementação: linguagem de domínio, boundaries, padrões permitidos, anti-overengineering, testes, validação, segurança e quando criar ADRs.

**Artefato:** `docs/engineering/PRINCIPLES.md`

## 7. Design System / UX/UI

Define a fonte de verdade de UX/UI: princípios, comportamento responsivo, design tokens, componentes, estados, acessibilidade e direção visual.

**Artefato:** `DESIGN.md`

## 8. AGENTS.md

É o entrypoint dos agentes. Deve ser curto. Sua função é apontar para as fontes canônicas, definir autoridade entre documentos e regras operacionais de implementação/verificação.

**Artefato:** `AGENTS.md`

## 9. Slices Definition

Antes de implementar, derive do PRD o mapa completo de slices do MVP.

Slice é a menor capacidade vertical que:

- entrega um resultado real ao usuário;
- pode ser testada de ponta a ponta;
- atravessa apenas as camadas necessárias;
- é pequena o bastante para receber uma SPEC própria.

Não criar slices como Banco, API, Frontend, Auth ou Worker. Infraestrutura entra no primeiro slice de produto que realmente precisar dela.

**Artefato:** `docs/delivery/SLICES.md`

## 10. Loop de Entrega por Slice

Para cada slice, execute sempre:

```text
Slice atual
  ↓
SPEC
  ↓
PLAN
  ↓
IMPLEMENTAÇÃO
  ↓
TESTES + VALIDAÇÃO + SEGURANÇA
  ↓
REVIEW
  ↓
MERGE
  ↺ próximo Slice
```

### SPEC

Define o comportamento e os critérios de aceite do slice atual, sem escolher implementação desnecessariamente.

### PLAN

Transforma a SPEC aprovada em tarefas técnicas incrementais e testáveis.

### Implementação

Executa o plano sem expandir o escopo.

### Testes + Validação + Segurança

Prova comportamento e invariantes relevantes. Verifica typecheck/lint/build quando aplicável e riscos de segurança do slice.

### Review

Primeiro confira conformidade com SPEC. Depois qualidade de código, arquitetura, Principles e Design.

### Merge

Só ocorre quando o slice está realmente concluído.

## 11. Deploy

Com os slices necessários prontos e verificados, publique através do processo apropriado ao projeto.

## 12. Observabilidade + Feedback

Observe erros, comportamento real, uso e feedback. A observabilidade deve responder problemas reais do produto e operação, não existir como decoração de engenharia.

## 13. Evolução do Produto

Feedback pode voltar para diferentes pontos:

- mudança de produto → PRD;
- mudança arquitetural → System Design + ADR quando necessário;
- mudança visual/UX → DESIGN;
- nova capacidade → mapa de slices e novo ciclo SDD.

O framework é um loop de evolução, não uma sequência descartada após o primeiro deploy.

## Autoridade dos documentos

| Fonte              | Governa                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `PRD.md`           | produto, domínio e escopo funcional                                    |
| `SYSTEM-DESIGN.md` | arquitetura vigente                                                    |
| ADR aceito         | decisão arquitetural específica                                        |
| `PRINCIPLES.md`    | regras permanentes de engenharia                                       |
| `DESIGN.md`        | UX/UI                                                                  |
| `SLICES.md`        | decomposição macro da entrega                                          |
| `SPEC.md`          | comportamento do slice atual                                           |
| `PLAN.md`          | estratégia de implementação do slice atual                             |
| Código + testes    | implementação real, que deve permanecer compatível com as fontes acima |

Conflitos relevantes não devem ser resolvidos silenciosamente pelo agente.
