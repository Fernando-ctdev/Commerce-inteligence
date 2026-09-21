# ADR-024: Contrato do desconto tipado (exclusivamente `discountType` + `discountValue`)

## Status

Supersedido por ADR-031 — este registro preserva a decisão então vigente.

## Contexto

O Product carregava duas representações de desconto: a coluna `discountPercentage` (percentual 0–100, com CHECK na migration `20260911040000`) e o par tipado `discountType` (`PERCENTAGE`|`FIXED`) + `discountValue` (migration aditiva `20260914120000`). Antes do Gate 5 coexistiam caminhos que aceitavam o residual na escrita, o liam como fallback (service, worker, cliente) e uma divergência de chave entre o fato projetado pelo worker (`discount`) e a leitura da engine (`facts.discountPercentage`, chave nunca enviada — o fato chegava `undefined` ao mapping). O sistema está em desenvolvimento: não existe base legada a preservar.

## Decisão

1. **O desconto é exclusivamente o tipado:** `discountType` (`PERCENTAGE`|`FIXED`) + `discountValue` (não negativo, até duas casas decimais). Não existe contrato de compatibilidade com qualquer outra representação.
2. **`FIXED` é validado contra o preço:** não excede `priceAmount` (código `VAL-DISCOUNT-RANGE`) e exige `priceCurrency` (`VAL-DISCOUNT-CURRENCY`). `PERCENTAGE` fica em 0–100.
3. **Migration aditiva, sem backfill:** `20260914120000_discount_type_value` apenas adiciona colunas nullable, sem defaults; os dados anteriores permanecem intactos. Ausência de backfill não significa ausência de migration.
4. **`discountPercentage` é residual, sem status de contrato:** não é aceito na escrita (o service ignora o campo e não persiste a coluna), não entra como fato de desconto na geração e não é derivado no cliente; permanece apenas exposto na leitura como campo do schema. Nenhuma purga de dados residuals é introduzida.
5. **Fato do desconto na geração:** o worker projeta a chave `discount` (string formatada) exclusivamente do tipado — `PERCENTAGE` → "X% de desconto", `FIXED` → "CUR X de desconto"; ausente/residual sem tipado → `undefined` (o desconto nunca é inventado). A engine consome a mesma chave na projeção compacta do `mappingContext` e o fato entra no catálogo de evidências como `fact:discount`.
6. **Ausência por camada (representação factual, sem mudança de comportamento):** no **armazenamento** (colunas nullable do schema) a ausência é `NULL` em todos os campos de desconto; na **leitura autenticada** do Product (API) é `null` em todos os campos; na **projeção interna de geração** (`engineFacts`) é `undefined` — a chave `discount` só existe quando há desconto tipado (ver Decisão 5).

## O que não muda

Schema (nenhuma migration nova), comportamento de geração aprovado nos Gates 4–5, tenant scoping, idempotência de criação, ADR-022 (entrada oficial do cadastro manual) e ADR-023 (retenção — o residual `discountPercentage` segue sujeito à mesma política).

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Compatibilidade legada (`discountPercentage` aceito/lido quando o tipado está ausente) | Rejeitada | Não existe base legada — sistema em desenvolvimento; duplicava a representação do mesmo fato e exigia precedência em toda projeção |
| Corrigir somente a chave da engine, mantendo fallbacks | Rejeitada | A divergência de chave era sintoma; a causa era a coexistência de duas representações |
| Purgar/migrar o residual `discountPercentage` | Rejeitada | Sem requisito; ADR-023 proíbe remoção fora do DELETE deliberado |
| Nova migration para remover a coluna residual | Rejeitada | Nenhuma necessidade funcional; a coluna deixa de ser escrita/lida pelo contrato |

## Consequências

- Positivas: representação única do fato desconto; validação de sanidade (`FIXED` ≤ preço) no ponto de entrada; fato de geração realmente chega ao mapping (antes chegava `undefined` por chave errada); caminhos de escrita/leitura/projeção alinhados ponta a ponta.
- Negativas/riscos: linhas residuais com `discountPercentage` deixam de ter efeito semântico (aceito — dados de desenvolvimento); clientes que ainda enviassem o campo residual têm o valor silenciosamente ignorado (registrado na SPEC RI-002).

## Relações

- SPEC slice-002: RI-002 (parágrafo "Contrato oficial do desconto (Gate 5)").
- ADR-022 (entrada oficial do cadastro manual), ADR-023 (política de retenção — residual sujeito à mesma política).
