# Prompt — Definir Development Slices

Analise o projeto atual e crie o mapa completo de Development Slices necessários para implementar o escopo definido para a etapa atual do projeto.

Antes de definir qualquer slice, leia `AGENTS.md` e todas as fontes canônicas indicadas nele.

Descubra e leia **todos os PRDs existentes em `docs/product/`** que sejam relevantes para o escopo atual.

O projeto pode possuir:

- um PRD principal de produto, responsável pela visão global, core loop, escopo e regras gerais;
- PRDs especializados, responsáveis por detalhar domínios, capacidades, funcionalidades ou frentes específicas do mesmo produto.

Trate o conjunto desses documentos como fonte funcional do produto.

O PRD principal governa o contexto e as regras globais. PRDs especializados refinam suas respectivas áreas e devem ser considerados sempre que forem relevantes para o escopo sendo decomposto.

Não assuma que todos os requisitos existentes nos PRDs precisam fazer parte da etapa atual. Identifique primeiro qual escopo está sendo trabalhado e derive apenas os slices necessários para entregá-lo.

Se houver conflito material entre fontes canônicas, não o resolva silenciosamente. Registre o conflito e pare para revisão antes de derivar comportamento incompatível.

## Objetivo

Decompor o escopo atual em uma sequência coerente de **vertical slices orientados a comportamento real do usuário ou capacidade observável do sistema**.

Um slice deve ser pequeno o suficiente para um agente compreender completamente seu contexto e grande o suficiente para entregar uma capacidade real e testável.

## Regras

- não criar slices por camada técnica;
- não criar slices chamados `Database`, `Frontend`, `API`, `Auth`, `Worker` ou equivalentes;
- infraestrutura entra no primeiro slice que realmente necessitar dela;
- cada slice deve terminar em comportamento observável e verificável;
- não criar SPEC, PLAN ou código nesta etapa;
- não adicionar funcionalidades fora do escopo atual;
- identificar dependências reais entre slices;
- ordenar pela sequência mais lógica e segura de entrega;
- reutilizar a linguagem de domínio do projeto;
- considerar requisitos distribuídos entre PRD principal e PRDs especializados;
- não tratar ausência de um requisito no PRD principal como exclusão automática quando ele estiver definido por um PRD especializado compatível;
- não incluir automaticamente requisitos futuros apenas porque aparecem em algum PRD;
- preservar boundaries e decisões já estabelecidas pelas fontes canônicas.

## Formato

### Slice XXX — Nome

**Outcome:** ...  
**Depends On:** ...  
**Domain Areas:** ...  
**Scope:** ...  
**Out of Scope:** ...

## Validação

Ao final, crie uma matriz:

`Requisito/capacidade → PRD de origem → Slice responsável`

Confirme que:

- todo o escopo selecionado possui um slice responsável;
- nenhum requisito relevante ficou sem cobertura;
- nenhum slice existe apenas para entregar uma camada técnica;
- nenhum requisito fora do escopo atual foi introduzido indevidamente.

Crie `docs/delivery/SLICES.md` e pare para revisão. Não inicie a próxima etapa do fluxo automaticamente.
