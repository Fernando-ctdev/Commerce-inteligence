# Prompt — Definir Development Slices do MVP

Analise o projeto atual e crie o mapa completo de Development Slices necessários para implementar o MVP.

Antes de definir qualquer slice, leia `AGENTS.md` e todas as fontes canônicas indicadas nele. Trate `docs/product/PRD.md` como fonte de verdade do escopo funcional.

## Objetivo

Decompor todo o MVP em uma sequência coerente de **vertical slices orientados a comportamento real do usuário**.

Um slice deve ser pequeno o suficiente para um agente compreender completamente seu contexto e grande o suficiente para entregar uma capacidade real e testável ao usuário.

## Regras

- não criar slices por camada técnica;
- não criar `Database`, `Frontend`, `API`, `Auth`, `Worker` etc.;
- infraestrutura entra no primeiro slice que realmente necessitar dela;
- cada slice termina com comportamento observável do produto;
- não criar SPEC, PLAN ou código;
- não adicionar funcionalidades fora do MVP;
- identificar dependências;
- ordenar pela sequência mais lógica e segura do core loop;
- reutilizar a linguagem de domínio do projeto.

## Formato

### Slice XXX — Nome

**User Outcome:** O usuário consegue...  
**Depends On:** ...  
**Domain Areas:** ...  
**Scope:** ...  
**Out of Scope:** ...

## Validação

Ao final, crie uma matriz `Requisito/capacidade do PRD → Slice responsável` e confirme que todo o MVP está coberto sem slices puramente técnicos.

Crie `docs/delivery/SLICES.md` e pare para revisão. Não inicie SDD.
