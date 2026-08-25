# Quickstart

## Projeto ainda é uma ideia

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

## Projeto já possui PRD aprovado

Comece diretamente em `03-criar-system-design.md`.

O histórico anterior ao PRD não precisa ser reconstruído se o PRD contém a definição necessária do produto.

## Inicializar estrutura de arquivos

```bash
./scripts/init-project.sh /caminho/do/projeto
```

O script copia somente os templates essenciais. Preencha-os através dos prompts conforme o projeto evolui.

## Conferir contexto mínimo

```bash
./scripts/check-project.sh /caminho/do/projeto
```

O checker verifica presença dos artefatos principais; ele não substitui revisão humana ou validação técnica.
