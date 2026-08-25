# AI-Assisted Product Engineering Framework

Um framework enxuto para transformar uma ideia de produto em software entregue por agentes de IA com contexto, arquitetura e critérios claros.

A ideia central é simples: **não pedir para a IA "criar o projeto completo"**. Primeiro estruturamos o produto. Depois entregamos o software em slices verticais, um por vez, até concluir o MVP.

## Fluxo

```text
Ideia de Produto
      ↓
Pesquisa / Validação
      ↓
PRD de Produto
      ↓
System Design
      ↓
ADRs
      ↓
Engineering Principles (Patterns)
      ↓
Design System / UX/UI
      ↓
AGENTS.md
      ↓
Slices Definition
      ↓
────────────────────────────
 LOOP DE ENTREGA POR SLICE
────────────────────────────
      ↓
SDD
Spec
 ↓
Plan
 ↓
Implementação
 ↓
Testes + Validação + Segurança
 ↓
Review
 ↓
Merge
      ↺ próximo Slice
────────────────────────────
      ↓
Deploy
      ↓
Observabilidade + Feedback
      ↓
Evolução do Produto
```

## Regra mais importante

**Ideia + Pesquisa/Validação existem para produzir um bom PRD.**

Depois que o `PRD.md` está aprovado, ele passa a ser a principal fonte de contexto funcional. O agente não precisa carregar eternamente toda a conversa, brainstorming ou pesquisa anterior para conseguir produzir System Design, ADRs, Design System ou slices.

O restante do framework deriva de fontes versionadas no repositório.

## Como usar

1. Converse com um agente sobre sua ideia e pesquise/valide as hipóteses relevantes.
2. Gere e aprove o `PRD.md`.
3. Gere o System Design a partir do PRD.
4. Registre ADRs apenas para decisões arquiteturais relevantes.
5. Defina Engineering Principles do projeto.
6. Gere o Design System/UX usando PRD + arquitetura como contexto.
7. Crie o `AGENTS.md` apontando para as fontes canônicas.
8. Derive o mapa completo de slices do MVP.
9. Para cada slice: `SPEC → PLAN → IMPLEMENT → TEST/VALIDATE/SECURITY → REVIEW → MERGE`.
10. Quando todos os slices do MVP terminarem: deploy, observe, receba feedback e evolua.

Veja [QUICKSTART.md](QUICKSTART.md) para aplicar em um projeto novo e [FRAMEWORK.md](FRAMEWORK.md) para a definição completa.

## Estrutura deste repositório

```text
docs/       explicação curta de cada etapa
templates/  modelos dos artefatos canônicos
prompts/    prompts prontos para executar cada etapa
scripts/    bootstrap e checagem simples
examples/   exemplo mínimo de organização de projeto
```

## Filosofia

- simples por padrão;
- rigor apenas onde reduz risco real;
- documentação serve ao desenvolvimento, não o contrário;
- produto antes de código;
- slices são verticais e orientados a resultado de usuário;
- especificar somente o slice atual;
- agentes só concluem quando os gates de conclusão passam;
- decisões importantes ficam no repositório, não apenas no histórico do chat.

## Status

`v0.1` — primeira versão prática. Use em projetos reais, anote atritos e refine o framework a partir de evidência.
