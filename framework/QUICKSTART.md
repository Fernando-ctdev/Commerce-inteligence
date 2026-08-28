# Quickstart

O framework possui pontos de entrada diferentes conforme o estado real do projeto.

## Produto ainda é uma ideia

Use os prompts em ordem:

```text
01-ideia-pesquisa-validacao.md
02-criar-prd.md
03-criar-system-design.md
04-criar-adrs.md
05-criar-principles.md
06-criar-design-system.md
07-criar-agents.md
08-definir-slices.md
```

Depois comece o loop por slice:

```text
09-criar-spec.md
10-criar-plan.md
11-implementar-slice.md
12-review-verificar-slice.md
```

## Projeto já possui definição funcional aprovada

Não recrie o PRD apenas para seguir a sequência do framework.

Leia os PRDs existentes em `docs/product/` e entre na primeira etapa que ainda precisa ser criada ou atualizada.

Exemplos:

```text
PRDs prontos, sem arquitetura
→ 03-criar-system-design.md

Arquitetura pronta, novo escopo funcional
→ atualizar/criar PRD relevante
→ atualizar arquitetura/ADR se necessário
→ 08-definir-slices.md

Fontes canônicas continuam válidas e há novo escopo já definido
→ 08-definir-slices.md

Slices já definidos
→ 09-criar-spec.md
```

O histórico anterior aos documentos canônicos não precisa ser reconstruído quando eles já contêm contexto suficiente.

## Regra de entrada

Não execute etapas anteriores apenas por cerimônia.

Antes de começar:

1. leia `AGENTS.md`, quando existir;
2. descubra as fontes canônicas existentes;
3. identifique o escopo atual;
4. determine qual é a primeira decisão ou artefato realmente ausente/desatualizado;
5. continue o fluxo a partir dali.

O framework deve preservar contexto válido, não recriá-lo.
