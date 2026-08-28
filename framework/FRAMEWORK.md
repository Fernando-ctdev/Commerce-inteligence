# Framework de Engenharia de Produto Assistida por IA

Este documento define o fluxo canônico do framework.

O fluxo não precisa começar sempre na primeira etapa. Em projetos existentes, entre no ponto correspondente à necessidade atual e preserve as fontes canônicas que continuam válidas.

## 1. Ideia / Necessidade de Produto

Comece pela necessidade como ela existe, mesmo incompleta.

Em produto novo, isso pode ser uma ideia ainda em formação.

Em produto existente, pode ser uma nova capacidade, mudança de comportamento, evolução de domínio, correção estrutural ou nova etapa de entrega.

**Saída:** contexto suficiente para decidir se pesquisa, PRD ou outra fonte canônica precisa ser criada ou alterada.

## 2. Pesquisa / Validação

Use pesquisa externa quando disponível e relevante para confrontar hipóteses sobre dor, alternativas, concorrência, comportamento, mercado, restrições e viabilidade.

Pesquisa não precisa virar artefato permanente. Ela serve para amadurecer decisões que depois serão registradas na fonte canônica adequada.

**Saída:** decisão suficientemente informada para atualizar a definição do produto.

## 3. PRDs de Produto

PRDs transformam decisões funcionais em definição versionada do produto.

O projeto pode possuir:

- um PRD principal, normalmente `docs/product/PRD.md`, responsável pela visão global, problema, público, proposta, core loop, escopo e regras gerais;
- PRDs especializados em `docs/product/`, responsáveis por detalhar domínios, capacidades, funcionalidades ou frentes específicas.

O conjunto dos PRDs relevantes forma a fonte funcional do produto.

O PRD principal governa o contexto global. PRDs especializados refinam suas respectivas áreas.

Não crie um PRD especializado quando uma alteração pequena puder ser representada com clareza no documento já existente.

Depois de aprovadas, essas fontes substituem a necessidade de carregar eternamente brainstorming e pesquisa anteriores.

**Artefatos:** `docs/product/*.md`

## 4. System Design

Desenha tecnicamente o sistema como um todo a partir dos PRDs relevantes: módulos, boundaries, fluxos, persistência, integrações, requisitos não funcionais, segurança e evolução.

Em produto existente, atualize somente quando a arquitetura vigente realmente mudar.

**Artefato:** `docs/architecture/SYSTEM-DESIGN.md`

## 5. ADRs

Registre apenas decisões arquiteturais relevantes com alternativas e trade-offs reais.

ADR não é diário de implementação e não deve existir para toda escolha pequena.

**Artefato:** `docs/architecture/adr-XXX-*.md`

## 6. Engineering Principles

Define como equipe e agentes devem pensar a implementação: linguagem de domínio, boundaries, padrões permitidos, anti-overengineering, testes, validação, segurança e quando criar ADRs.

**Artefato:** `docs/engineering/PRINCIPLES.md`

## 7. Design System / UX/UI

Define a fonte de verdade de UX/UI: princípios, comportamento responsivo, design tokens, componentes, estados, acessibilidade e direção visual.

Atualize somente quando decisões de experiência ou linguagem visual realmente mudarem.

**Artefato:** `DESIGN.md`

## 8. AGENTS.md

É o entrypoint dos agentes.

Deve ser curto. Sua função é apontar para as fontes canônicas, definir autoridade entre documentos e estabelecer regras operacionais de implementação e verificação.

O `AGENTS.md` deve orientar o agente a descobrir os PRDs relevantes dentro de `docs/product/`, sem assumir uma única fonte funcional.

**Artefato:** `AGENTS.md`

## 9. Slices Definition

Antes de implementar um escopo relevante, derive das fontes canônicas o mapa de slices necessário para aquela etapa de entrega.

Slice é a menor capacidade vertical que:

- entrega comportamento observável ao usuário ou ao sistema;
- pode ser testada de ponta a ponta;
- atravessa apenas as camadas necessárias;
- é pequena o bastante para receber uma SPEC própria.

Não criar slices como Banco, API, Frontend, Auth ou Worker.

Infraestrutura entra no primeiro slice que realmente precisar dela.

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

Transforma a SPEC aprovada em tarefas técnicas incrementais e testáveis considerando o estado real do repositório.

### Implementação

Executa o plano sem expandir o escopo.

### Testes + Validação + Segurança

Prova comportamento e invariantes relevantes.

Verifica testes, typecheck, lint, build e demais gates aplicáveis.

### Review

Primeiro confira conformidade com a SPEC.

Depois confira qualidade de código, arquitetura, Principles, Design e segurança aplicáveis.

### Merge

Só ocorre quando o slice está realmente concluído.

## 11. Deploy

Quando o escopo planejado estiver pronto e verificado, publique através do processo apropriado ao projeto.

Nem toda entrega precisa necessariamente resultar em deploy imediato; siga a estratégia real do projeto.

## 12. Observabilidade + Feedback

Observe erros, comportamento real, uso e feedback.

A observabilidade deve responder problemas reais do produto e operação, não existir como decoração de engenharia.

## 13. Evolução do Produto

Feedback pode voltar para diferentes pontos:

- mudança de produto → PRD principal ou PRD especializado correspondente;
- mudança arquitetural → System Design + ADR quando necessário;
- mudança visual/UX → DESIGN;
- nova capacidade → fontes funcionais relevantes + novo mapa de slices;
- mudança local de implementação → SPEC/PLAN quando não altera fontes superiores.

O framework é um loop de evolução, não uma sequência descartada após a primeira entrega.

## Autoridade dos documentos

| Fonte | Governa |
|---|---|
| PRD principal | contexto global, produto e regras funcionais gerais |
| PRD especializado | domínio/capacidade funcional específica dentro de sua fronteira |
| `SYSTEM-DESIGN.md` | arquitetura vigente |
| ADR aceito | decisão arquitetural específica |
| `PRINCIPLES.md` | regras permanentes de engenharia |
| `DESIGN.md` | UX/UI |
| `SLICES.md` | decomposição macro do escopo atual |
| `SPEC.md` | comportamento do slice atual |
| `PLAN.md` | estratégia de implementação do slice atual |
| Código + testes | implementação real, que deve permanecer compatível com as fontes acima |

Uma fonte mais específica refina a fonte global dentro de sua fronteira, mas não pode contradizê-la silenciosamente.

Conflitos relevantes não devem ser resolvidos silenciosamente pelo agente.
