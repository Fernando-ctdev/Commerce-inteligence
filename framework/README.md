# AI-Assisted Product Engineering Framework

Um framework enxuto para estruturar, desenvolver e evoluir software com agentes de IA usando contexto, arquitetura e critérios claros.

A ideia central é simples: **não pedir para a IA "criar o projeto completo" nem improvisar a próxima etapa**. O produto mantém fontes canônicas versionadas, o escopo atual é decomposto em slices verticais e cada slice passa por especificação, plano, implementação e verificação.

## Fluxo

```text
Ideia / Necessidade / Evolução
      ↓
Pesquisa / Validação, quando necessária
      ↓
PRD principal e/ou PRDs especializados
      ↓
System Design
      ↓
ADRs
      ↓
Engineering Principles
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
SPEC
 ↓
PLAN
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
      ↺ novas necessidades atualizam as fontes adequadas
```

## Regra mais importante

As conversas, brainstorming e pesquisas existem para amadurecer decisões. As decisões que precisam sobreviver ao histórico devem terminar em fontes versionadas no repositório.

Em um produto novo, normalmente existe um PRD principal em `docs/product/PRD.md`.

Conforme o produto evolui, `docs/product/` pode conter PRDs especializados para domínios, capacidades, funcionalidades ou frentes específicas.

O PRD principal governa o contexto global. Os PRDs especializados refinam suas respectivas áreas.

Nenhuma etapa deve assumir que existe apenas um PRD.

## Como usar

### Produto novo

1. Entenda a ideia e pesquise/valide as hipóteses relevantes.
2. Crie e aprove o PRD principal.
3. Gere o System Design.
4. Registre ADRs somente para decisões arquiteturais relevantes.
5. Defina Engineering Principles.
6. Gere o Design System/UX quando aplicável.
7. Crie o `AGENTS.md` apontando para as fontes canônicas.
8. Defina os slices do escopo atual.
9. Para cada slice: `SPEC → PLAN → IMPLEMENT → TEST/VALIDATE/SECURITY → REVIEW → MERGE`.

### Produto existente

1. Leia `AGENTS.md` e as fontes canônicas.
2. Identifique o escopo da mudança.
3. Atualize ou crie PRD especializado somente quando a mudança funcional exigir.
4. Atualize System Design/ADR/Design apenas quando suas respectivas decisões mudarem.
5. Derive os slices necessários para o novo escopo.
6. Execute o mesmo loop por slice.

Não recrie documentos que continuam válidos apenas para reiniciar o processo.

Veja [QUICKSTART.md](QUICKSTART.md) para os pontos de entrada e [FRAMEWORK.md](FRAMEWORK.md) para a definição completa.

## Estrutura deste repositório

```text
docs/       explicação curta de cada etapa
templates/  modelos dos artefatos canônicos
prompts/    prompts prontos para executar cada etapa
```

## Filosofia

- simples por padrão;
- rigor somente onde reduz risco real;
- documentação serve ao desenvolvimento, não o contrário;
- produto antes de código;
- fontes canônicas são descobertas pelo agente, não presumidas por nome único;
- slices são verticais e orientados a comportamento observável;
- especificar somente o slice atual;
- agentes só concluem quando os gates de conclusão passam;
- decisões importantes ficam no repositório, não apenas no histórico do chat;
- o framework deve funcionar tanto na criação quanto na evolução contínua do produto.

## Status

`v0.1` — primeira versão prática. Use em projetos reais, anote atritos e refine o framework a partir de evidência.
