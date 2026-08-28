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

Se encontrar problemas dentro do escopo do slice:

1. corrija;
2. execute novamente as validações afetadas;
3. revise novamente;
4. repita até aprovação.

O slice só pode ser marcado como `DONE` quando:

* todos os critérios da SPEC estiverem satisfeitos;
* o checklist `SLICE-DONE` estiver satisfeito;
* as revisões estiverem aprovadas;
* todas as verificações aplicáveis estiverem passando.

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
