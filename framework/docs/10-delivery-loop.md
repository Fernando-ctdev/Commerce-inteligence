# Slice Delivery Loop

```text
Slice
 ↓
SPEC
 ↓
PLAN
 ↓
IMPLEMENT
 ↓
TEST + VALIDATE + SECURITY
 ↓
REVIEW
 ↓
MERGE
 ↺
```

## Definition of Done

Um agente não conclui porque escreveu código. O slice termina quando:

- critérios da SPEC foram atendidos;
- testes relevantes passam;
- typecheck/lint/build passam quando disponíveis;
- riscos de segurança do slice foram revisados;
- UX relevante está coerente com DESIGN;
- arquitetura está coerente com System Design/ADRs/Principles;
- não há expansão silenciosa de escopo;
- documentação canônica foi atualizada somente se realmente mudou.
