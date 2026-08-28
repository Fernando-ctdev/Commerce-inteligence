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
CONVERGE
 ↓
MERGE
 ↺
```

## Convergence Loop

Review não leva diretamente a Merge.

Quando houver desvio, identifique a origem e volte ao nível correto:

```text
desvio de código
→ IMPLEMENT

desvio do plano
→ PLAN

desvio de comportamento
→ SPEC

descoberta arquitetural
→ SYSTEM DESIGN / ADR

descoberta de UX/UI
→ DESIGN

descoberta funcional ou de produto
→ PRD aplicável
```

Não altere uma fonte superior somente para acomodar a implementação existente. Se o código estiver errado em relação a uma decisão aprovada, corrija o código ou o artefato inferior responsável.

Quando uma fonte superior realmente mudar, revise os artefatos derivados afetados. Depois de qualquer correção, execute novamente as validações impactadas e faça novo Review.

O ciclo termina somente quando intenção, fontes canônicas, SPEC, PLAN, implementação e evidências de verificação estiverem coerentes.

## Definition of Done

Um agente não conclui porque escreveu código. O slice termina quando:

- critérios da SPEC foram atendidos;
- testes relevantes passam;
- typecheck/lint/build passam quando disponíveis;
- riscos de segurança do slice foram revisados;
- UX relevante está coerente com DESIGN;
- arquitetura está coerente com System Design/ADRs/Principles;
- não há expansão silenciosa de escopo;
- divergências encontradas no Review passaram pelo ciclo de convergência;
- documentação canônica foi atualizada somente se realmente mudou;
- um Review final confirma que os gates continuam satisfeitos após as correções.

Merge só acontece depois dessa convergência.
