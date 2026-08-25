# Prompt — Review e Verificação do Slice

Revise a implementação do slice atual contra:

1. `SPEC.md` — conformidade funcional;
2. `DESIGN.md` — quando houver UI;
3. System Design + ADRs — arquitetura;
4. `PRINCIPLES.md` — qualidade e patterns;
5. segurança e isolamento relevantes.

Delegue a revisão aos agentes especializados relevantes ao slice quando útil.

Depois execute todas as verificações disponíveis:

- testes;
- typecheck;
- lint;
- build;
- migrations, quando aplicável;
- demais critérios verificáveis da SPEC.

Se encontrar problemas dentro do escopo do slice:

1. corrija;
2. execute novamente as validações afetadas;
3. revise novamente;
4. repita até aprovação.

O slice só pode ser marcado como `DONE` quando:

- todos os critérios da SPEC estiverem satisfeitos;
- o checklist `SLICE-DONE` estiver satisfeito;
- as revisões estiverem aprovadas;
- todas as verificações aplicáveis estiverem passando.

Não esconda validações que não puderam ser executadas.

Quando o slice estiver `DONE`:

1. consulte novamente `docs/delivery/SLICES.md`;
2. identifique o próximo slice não concluído cujas dependências estejam satisfeitas;
3. se existir, execute `09-criar-spec` para ele;
4. repita o ciclo até todos os slices estarem concluídos.

Se não houver mais slices pendentes, encerre com:

`DELIVERY COMPLETE`