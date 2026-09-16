# ADR-021: Geração parcial declarada e retry dos faltantes

## Status

Aceito — decisão explícita do usuário após Review rejeitar `SUCCEEDED_PARTIAL` sob os contratos então vigentes (exact-N atômico). O usuário confirmou a premissa de produto: o produto é analisado uma vez e o creator pode gerar conteúdos recorrentemente; gerações (execuções) ficam ilimitadas. Este ADR substitui, **somente para a entrega dentro de um job de geração**, a atomicidade exact-N exigida por ADR-012, SPEC slice-003 (B-003-08/09) e SYSTEM-DESIGN §8.

## Contexto

QA reais (`447278ab-e387-47c0-8310-2dd99b5687cb` e anteriores) mostram o padrão: N−1 itens convergem e 1 item persiste reprovado no development após 2 rounds de repair (`GEN-REPAIR-EXHAUSTED`), reproando o lote inteiro. Sob gerações recorrentes, reprovar 10 conteúdos porque 1 falhou é o comportamento caro: o creator pode recompletar por construção. O risco inverso — publicar subconjunto sem revalidar variedade ou sem diagnóstico — é o que este ADR fecha.

## Decisão

1. **Estados do job:** `SUCCEEDED` (D=N) · `SUCCEEDED_PARTIAL` (0<D<N e F=N−D ≤ `PARTIAL_FAILURE_CAP`) · `FAILED` (D=0, F>CAP ou falha pré-briefings — comportamento anterior). `PARTIAL_FAILURE_CAP` é constante server-side (valor inicial 2), não configurável pelo cliente.
2. **Publicação e reavaliação do CAP:** em `SUCCEEDED_PARTIAL` publicam-se **somente** itens aprovados no hard gate factual/estrutural **e** no `CONTENT_QUALITY_JUDGE` (`PASS`). Nenhum item `REJECT`/exaustado é publicado ou visível. `expectedCount = deliveredCount + failedCount` sempre, com F computado **após** os drops de variedade da decisão 3: se o F final exceder `PARTIAL_FAILURE_CAP`, o job reprova inteiro (`FAILED`) sem publicar nada.
3. **Variedade do subconjunto e drop determinístico:** antes de publicar, o Variety Gate é reexecutado sobre o subconjunto entregue com teto recomputado `ceil(D/K)` (mesmos classificadores determinísticos do ADR-019, que fixa o critério completo). Total-order do drop do excedente da função concentrada: (a) maior contagem de cheques reprovados na assinatura residual (gate + judge); (b) em empate, menor número de `evidenceRefs` ancorados; (c) em empate, maior posição no plan (decrescente — estável entre execuções). Cada drop decrementa D, recomputa o teto e revalida até fechar. D final é o que publica e confirma quota.
4. **Quota (emenda ao ADR-006):** reserva N na criação; fechamento `SUCCEEDED_PARTIAL` **confirma D e libera N−D** no mês UTC de origem. Gerações (execuções) não são medidas; a quota mede conteúdo **entregue**. O retry dos faltantes cria novo job com reserva própria de F. Retry técnico permanece idempotente por `job.id`.
5. **Diagnóstico obrigatório:** `IntelligenceRun` passa a ser persistido também em `SUCCEEDED_PARTIAL` e `FAILED`, com assinatura residual por item/round — `checkCode` da cascata do repair (`factRef_invalid | action_stem_missing | connector_missing | grounding_below_min | script_claim_missing | feature_list | unverified_claim`) + diagnóstico determinístico (factRef, action, conector, contagens minGrounding esperado/casado). Sem payload bruto do provider. Parcial sem assinatura residual é inválido.
6. **Retry dos faltantes:** ação explícita do creator (`Gerar os F faltantes`) cria **novo** `CommerceIntelligenceJob` com `targetContentCount = F`, reusando `ProductStrategy` `ACTIVE`, restrições e `ProductMemorySnapshot` (itens entregues sinalizam `gerado`; o planner não repete mecanismo/função já entregues). Pipeline normal com gates/judge/repair; novo parcial segue recursivamente o mesmo contrato. Não é continuação de repair nem regenera entregues. `Tentar novamente` integral permanece para `FAILED`.
7. **Memória:** apenas itens entregues geram sinal de conteúdo; reprovados não publicam nem sinalizam (a falha vive na telemetria da decisão 5).

## O que não muda

Hard gate factual/estrutural, `CONTENT_QUALITY_JUDGE` com `REJECT` terminal por item, repair per-item limitado a 2 rounds, fail-closed, tenant scoping, idempotência por `job.id`, sanitização de telemetria, planner ainda planejando N. Parcial **declarado** substitui parcial silencioso; não relaxa qualidade — daí o CAP e a assinatura residual. O gatilho de benchmark do ADR-020 (adendo 2) continua valendo por assinatura residual, inclusive em parciais.

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Manter exact-N atômico | Rejeitada | Sob gerações recorrentes, reprovar o lote por 1 item é o custo anômalo; o creator pode completar |
| Partial silencioso (publicar D sem declarar/revalidar) | Rejeitada | Viola ADR-012/SPEC; variedade do subconjunto não verificada |
| Regenerar faltantes automaticamente no mesmo job | Rejeitada | Aumenta rounds além do contrato de repair; retry explícito preserva quota/idempotência claras |
| Fallback determinístico de conteúdo | Rejeitada | Fabricação de conteúdo, vedada por ADR-012 e gates.ts (`repairBriefs`) |

## Consequências

- Positivas: creator recebe valor mesmo com falha pontual de modelo; diagnóstico por item fecha a lacuna observada (jobs `FAILED` sem assinatura classificável); quota continua determinística (entregue = cobrado).
- Negativas/riscos: novo estado terminal na UI/worker; recomputo de variedade exige bump de `GATE_POLICY_VERSION`; parcial reduz pressão para consertar o gargalo de development — mitigado pelo CAP e pelo gatilho de benchmark; reconciliação de reserva parcial (confirma D + libera N−D) é novo caminho transacional.

## Relações

ADR-012 (atomicidade → exceção parcial declarada), ADR-006 (confirmação parcial), ADR-019 (variedade `ceil(D/K)` do subconjunto), ADR-020 (assinatura residual; gatilho de benchmark preservado), SPEC slice-003 B-003-08/09/10/12, SLICES 003/008, PRD §§1/5/8.
