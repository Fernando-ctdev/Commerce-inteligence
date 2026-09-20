# Design — Simplificação do Judge Semântico

**Data:** 2026-09-18  
**Status:** aprovado para implementação posterior; esta entrega é somente especificação  
**Escopo:** Slice 003 / Commerce Intelligence Engine

## Problema

O contrato atual mistura curadoria semântica com bloqueio de entrega: o Judge retorna `PASS|REPAIR|REJECT`, o engine reavalia após repair e um defeito subjetivo pode transformar conteúdo objetivamente válido em item faltante. O código também mantém `unsupported_persuasion` como motivo semântico, embora alegações factuais já tenham autoridade no hard gate.

## Decisão

Separar os dois gates:

1. **Hard gates objetivos** continuam obrigatórios e bloqueantes para schema inválido, fatos contraditórios, relação ausente com Produto e cardinalidade/estrutura inválida. Variedade objetiva continua determinística.
2. **Judge semântico interno** retorna somente `PASS` ou `REVIEW`, por `contentId` e parte (`hook`, `development`, `script`, `cta`, `scenes`). Ele avalia coerência com Produto, estilo/configuração declarados do creator e plataforma. Preferência subjetiva não vira bloqueio terminal.
3. Há uma avaliação inicial por conteúdo. `PASS` segue intacto. `REVIEW` marca somente a parte indicada para repair.
4. O repair é chamado no máximo uma vez para as partes marcadas. Partes `PASS` nunca são alteradas. Não há Judge na segunda passada.
5. Se o repair falhar, retornar schema inválido ou não puder ser aplicado, a parte original permanece. O conteúdo segue como `DRAFT` quando os hard gates objetivos passam.
6. `DRAFT` é sempre o estado de saída quando os hard gates objetivos passam, independentemente do resultado operacional do repair semântico. O Judge não cria estado público, aprovação, badge, aviso ou `QUALITY_PENDING`.

`REJECT`, `unsupported_persuasion` e `QUALITY_PENDING` deixam de existir no contrato semântico e no fluxo de entrega. Não há loop adicional, fallback de modelo ou expansão para aprovação/edição.

## Contrato semântico

```text
type QualityStatus = "PASS" | "REVIEW"

type QualityJudgment = {
  part: "hook" | "development" | "script" | "cta" | "scenes"
  status: QualityStatus
  criterion: allowlisted criterion for the part
  reason: "meets_criteria" | allowlisted review reason
}
```

A resposta do Judge em lote continua indexada exclusivamente por `contentId`, com conjunto exato de IDs, sem duplicatas, ausências ou extras, e exatamente as cinco partes por conteúdo. O limite de lote permanece três. O contrato de repair continua homogêneo por parte e round, com identidade por `contentId`; cenas permanecem individuais.

`unsupported_persuasion` não é critério nem motivo. Alegações factuais passam pelo hard gate factual (`SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED`, `CONTRADICTED`) e não são reclassificadas pelo Judge. Contextos `recordsAlone`, equipamento, suporte e restrições só entram quando declarados. Contexto ausente não autoriza o Judge a presumir uma limitação.

## Fluxo

```text
Briefs gerados
  ↓
Hard gates objetivos + Variety Gate determinístico
  ├─ falha → falha objetiva; não publicar
  └─ PASS
       ↓
Judge semântico inicial (uma vez)
       ├─ PASS → parte intacta
       └─ REVIEW → repair somente da parte marcada, uma vez
                         ├─ sucesso aplicável → substituir essa parte
                         └─ falha/schema/inaplicável → manter parte original
       ↓
Sem re-Judge
       ↓
Hard gates objetivos finais sobre a composição resultante
       ├─ falha → não entregar
       └─ PASS → persistir Content + BriefVersion em DRAFT
```

A última validação objetiva protege contra repair que introduza claim, estrutura, cardinalidade ou relação inválida; ela não reabre a curadoria semântica. Se a composição resultante falhar hard gate, aplica-se o contrato objetivo existente (falha do job/parcial declarado conforme ADR-021), não um status semântico.

## Componentes e call sites afetados

- `src/modules/commerce-intelligence/semantic-quality.ts`: tipos, listas allowlisted, parsers de Judge/repair, projeção de falhas e aplicação parcial.
- `src/modules/commerce-intelligence/provider.ts`: instruções e schemas de `CONTENT_QUALITY_JUDGE` e `CONTENT_PART_REPAIR`; remover REJECT e `unsupported_persuasion`.
- `src/modules/commerce-intelligence/engine.ts`: uma avaliação inicial; selecionar somente `REVIEW`; repair único por parte; preservar originais em erro; remover re-Judge e bloqueio por Judge.
- `src/modules/commerce-intelligence/model-router.ts`: manter tarefas lógicas e tier HIGH; não adicionar fallback, task ou status.
- `src/modules/commerce-intelligence/gates.ts` e `contract.ts`: manter hard gates objetivos; separar seus resultados de `QualityStatus`; não usar o Judge para factualidade.
- Testes existentes: `semantic-quality.test.ts`, `engine.test.ts`, `engine-pipeline.test.ts`, `gates.test.ts`, `gates-negative.test.ts`, `gates-repair.test.ts`, `adr-025-evaluation.test.ts`, `regression-verdict.test.ts`, `locator-leak.test.ts`, `creator-context.test.ts`, `provider.test.ts`, `http-status*.test.ts`. Atualizar expectativas de REJECT/re-Judge e acrescentar apenas os comportamentos desta decisão.

## Invariantes

- Hard gates objetivos permanecem autoridade para schema, factualidade, relação, cardinalidade, estrutura e variedade determinística.
- Judge semântico retorna somente `PASS|REVIEW`; nunca decide regra de sistema.
- Uma avaliação inicial por conteúdo e exatamente cinco partes.
- Repair toca somente partes marcadas `REVIEW`, no máximo uma vez; partes `PASS` permanecem byte-a-byte intactas.
- Falha de repair nunca apaga nem substitui a parte original.
- Não há segunda chamada de Judge.
- Conteúdo objetivamente válido termina `DRAFT`.
- IDs, ownership, Strategy, quota, quantidade do plano e status de Content não são fornecidos pelo provider nem alterados pelo repair.
- `contentId` é a única identidade de resposta em batches; cardinalidade e shape são validados.
- Nenhum aviso, badge, `QUALITY_PENDING`, `REJECT` ou bloqueio terminal por estilo é criado.
- Dados do creator só restringem quando declarados; ausência significa não aplicar aquela restrição.
- Nenhuma alegação factual é autorizada por repair sem evidência hard-gated.

## Migração documental e de implementação

1. Substituir deliberadamente o adendo de curadoria do ADR-019 por este contrato; manter cenas separadas e os hard gates objetivos.
2. Atualizar ADR-025: batching segue transporte; Judge inicial único, retorno `PASS|REVIEW`, repair seletivo uma vez, sem re-Judge; remover critérios de sucesso baseados em zero `REJECT`.
3. Atualizar SPEC do Slice 003 em B-003-09 e na decisão de conflito: Judge não bloqueia conteúdo objetivamente válido; `SUCCEEDED_PARTIAL` só decorre de falha objetiva, não de REVIEW sem repair aplicável.
4. Alinhar ADR-021 apenas onde ele nomeia `REJECT` como decisão semântica: sua regra de parcial/quota permanece, mas faltantes devem resultar de hard-gate ou falha objetiva de composição.
5. Implementar depois, em mudança separada, removendo tipos, instruções, branches, eventos e assertions obsoletos; não criar shim compatível.
6. Não alterar PRDs.

## Riscos e mitigação

- **Repair pode introduzir defeito objetivo:** hard gates finais continuam obrigatórios.
- **Sem re-Judge, repair pode continuar semanticamente fraco:** contrato aceita fallback original e DRAFT; qualidade subjetiva permanece revisável pelo creator em slices posteriores.
- **Redução de rigor subjetivo:** critérios allowlisted continuam auditáveis internamente; não bloquear por preferência evita falsos negativos.
- **Confusão entre falha objetiva e REVIEW:** tipos e relatórios devem separar explicitamente os dois domínios; `QualityStatus` não deve ser reutilizado por `BriefValidationReport`.
- **Mudança de observabilidade:** registrar avaliação inicial e repair aplicado/fallback, sem payload bruto; não expor diagnóstico na UI.
- **ADR-027 ausente:** não existe `docs/architecture/adr-027*.md` nem referência encontrada no repositório. A implementação não deve inventar esse ADR; o conflito fica registrado para o Maestro decidir se há documento externo a anexar.

## Fora de escopo

Sem alteração de PRD, UI, status público, aprovação/edição, nova capability, novo provider, fallback de tier, novo loop, reanálise semântica, judge de variedade/memória ou implementação de código nesta fase.
