# Prompt — Review e Verificação do Slice

Revise a implementação do slice atual contra:

1. `SPEC.md` — conformidade funcional;
2. `DESIGN.md` — quando houver UI;
3. System Design + ADRs — arquitetura;
4. `PRINCIPLES.md` — qualidade e patterns;
5. segurança e isolamento relevantes.

Delegue a revisão aos agentes especializados relevantes ao slice quando útil.

Depois execute todas as verificações disponíveis:

* testes;
* typecheck;
* lint;
* build;
* migrations, quando aplicável;
* demais critérios verificáveis da SPEC.

## Convergência obrigatória

Review não autoriza Merge diretamente.

Se encontrar qualquer problema ou divergência, primeiro classifique onde está o desvio:

```text
implementação não cumpre uma decisão aprovada
→ corrigir IMPLEMENTAÇÃO

PLAN não representa corretamente a implementação necessária
→ corrigir PLAN e ajustar IMPLEMENTAÇÃO afetada

SPEC está incompleta, ambígua ou incorreta diante do comportamento realmente requerido
→ corrigir SPEC e revisar PLAN + IMPLEMENTAÇÃO afetados

descoberta altera uma decisão arquitetural
→ atualizar SYSTEM DESIGN e/ou ADR aplicável, depois revisar artefatos derivados

descoberta altera uma decisão de UX/UI
→ atualizar DESIGN, depois revisar SPEC/PLAN/IMPLEMENTAÇÃO afetados

descoberta altera produto ou comportamento funcional canônico
→ atualizar o PRD principal ou especializado aplicável, depois revisar os artefatos derivados
```

Regra crítica:

> Não altere PRD, DESIGN, System Design, ADR, SPEC ou PLAN apenas para justificar código já escrito.

Se a implementação contrariar uma fonte aprovada e não existir nova decisão válida que mude essa fonte, corrija o nível inferior.

Se uma fonte superior realmente precisar mudar, trate a mudança como decisão explícita e reavalie tudo que deriva dela dentro do escopo afetado.

Depois de qualquer correção:

1. execute novamente todas as validações afetadas;
2. revise novamente contra SPEC e fontes canônicas;
3. verifique se a correção introduziu novo desvio;
4. repita o ciclo até convergir.

O slice só pode ser marcado como `DONE` quando:

* todos os critérios da SPEC estiverem satisfeitos;
* o checklist `SLICE-DONE` estiver satisfeito;
* as revisões estiverem aprovadas;
* todas as verificações aplicáveis estiverem passando;
* não existir divergência relevante entre fontes canônicas, SPEC, PLAN e implementação;
* um Review final tiver sido executado depois da última correção.

Não esconda validações que não puderam ser executadas.

Quando o slice estiver `DONE`:

1. crie um commit semântico contendo exclusivamente as alterações do slice concluído;
2. escreva a mensagem do commit em **pt-BR**;
3. utilize o padrão de Conventional Commits, como `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:` ou outro tipo semanticamente adequado;
4. a mensagem completa do commit deve ter **no máximo 250 caracteres**;
5. descreva de forma objetiva o resultado entregue pelo slice, evitando mensagens genéricas como `feat: implementa slice`;
6. somente após o commit ser criado, consulte novamente `docs/delivery/SLICES.md`;
7. identifique o próximo slice não concluído cujas dependências estejam satisfeitas;
8. se existir, execute `09-criar-spec` para ele;
9. repita o ciclo até todos os slices estarem concluídos.

Exemplo de commit válido:

`feat: adiciona cadastro de persona com validações, persistência e testes do fluxo principal`

Se não houver mais slices pendentes, encerre com:

`DELIVERY COMPLETE`
