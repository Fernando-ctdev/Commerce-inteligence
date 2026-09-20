# ADR-027: Publicação com `QUALITY_PENDING` após repair semântico esgotado

## Status
Aceito — decisão explícita do usuário. Aplica-se somente ao resultado `REPAIR` de `CONTENT_QUALITY_JUDGE` que não converge nos dois rounds globais depois de o Content passar integralmente o hard gate factual, estrutural, de plataforma, cenas e variedade.

## Contexto
O hard gate determina limites não negociáveis: schema, cardinalidade, fatos, claims, segurança de produção e variedade. O Judge semântico melhora qualidade comercial e editorial, mas um `REPAIR` que não converge pode reter um Content factualmente seguro e estruturalmente gravável. O contrato anterior tratava qualquer estado final diferente de `PASS` como faltante e não o publicava.

O produto precisa separar esses dois riscos: nunca publicar conteúdo inseguro ou inconsistente; não descartar automaticamente um conteúdo seguro cuja melhoria semântica não convergiu.

## Decisão

1. **Pré-condição estrita.** Um Content só pode ser publicado como `QUALITY_PENDING` se, na composição final, todos os gates determinísticos passarem: schema, hard gate factual/estrutural/plataforma, `ContentSceneSet` disponível e válido e Variety Gate do conjunto entregue. Falha, `REJECT` semântico, output de schema inválido, erro/timeout de provider ou qualquer hard gate não-PASS continuam não publicáveis.
2. **Gatilho único.** Após exatamente dois rounds globais, uma ou mais partes do `CONTENT_QUALITY_JUDGE` permanecem em `REPAIR` — sem qualquer `REJECT` — e as pré-condições do item 1 passam. O servidor persiste o Content e sua `ContentBriefVersion` v1 com `Content.status = "QUALITY_PENDING"`. Não cria texto de fallback, não faz terceiro round, não chama provider extra nem mascara o diagnóstico.
3. **Status de Content.** `QUALITY_PENDING` é um novo estado persistido de `Content`, distinto de `DRAFT`, `APPROVED` e `DISCARDED`. Significa “publicado para revisão, factual e estruturalmente válido, mas com melhoria semântica pendente”. Não é aprovação do creator, não é aprovação de qualidade e não é elegível para `RecordingBatch`. O caminho futuro de revisão/edição/regeneração deve tratá-lo como não aprovado; somente uma versão que passe os gates aplicáveis pode tornar-se `DRAFT` revisável/`APPROVED` conforme o contrato de Content Operations.
4. **Estado do job.** `SUCCEEDED` continua significando que foram persistidos exatamente N Contents publicáveis. Esses N podem ser `DRAFT` ou `QUALITY_PENDING`; o job não se torna parcial apenas porque contém pendências semânticas. `SUCCEEDED_PARTIAL` continua reservado a 0 < D < N, com F itens não publicáveis depois das regras de parcial. `FAILED` continua para D=0, F acima do CAP ou falha pré/publicação. O job registra `qualityPendingCount`, independente de `deliveredCount` e `failedCount`; `expectedCount = deliveredCount + failedCount` permanece verdadeiro.
5. **Quota e memória.** `QUALITY_PENDING` é conteúdo entregue: entra em `deliveredCount`, confirma uma unidade da reserva e gera o mesmo sinal estruturado `gerado` dos demais Contents publicados. Em sucesso completo, confirma N; em parcial, confirma D incluindo `QUALITY_PENDING` e libera N−D. Não há reserva extra, desconto ou cobrança por round de repair.
6. **Persistência e diagnóstico.** Na mesma transação fenced de finalização que cria Content/BriefVersion/SceneSet/Reports, persiste o status e a metadata sanitizada por item: `qualityPending: true`, partes ainda `REPAIR`, rounds consumidos e critérios/motivos allowlisted. `IntelligenceRun` mantém a assinatura residual; jamais persiste payload, rationale livre, prompt, resposta bruta, token ou segredo. Se o CAS de `owner + attempt` falhar, não persiste Content, Run, quota nem memória.
7. **API e UI.** Leituras autenticadas serializam `status: "QUALITY_PENDING"` sem ocultar o Content nem expor o diagnóstico interno. A UI mostra o Content como “Revisão de qualidade pendente”, com explicação humana curta de que os fatos e a estrutura passaram, mas a revisão semântica não convergiu; não mostra partes, rounds, provider, modelo, prompt ou reason bruto. Ele não entra em seletores de aprovação/gravação. Para manter compatibilidade, consumidores devem aceitar o novo valor; valores existentes preservam comportamento. Nenhum endpoint, feature flag ou ação automática é criado neste ADR.

## O que não muda

- O provider não decide estado, quota, IDs, persistência, tenant ou autorização.
- Hard gates, `REJECT` terminal, `GEN-SCHEMA`, `GEN-PROVIDER`, cenas inválidas e qualquer falha factual/estrutural continuam fail-closed e não publicam.
- O Judge continua obrigatório, com batch/repair, limites e dois rounds do ADR-025.
- `SUCCEEDED_PARTIAL`, retry dos faltantes, CAP e revalidação de variedade continuam para itens realmente não publicáveis.
- Fencing, idempotência, proveniência, isolamento de Tenant e chamadas externas fora de transação permanecem inalterados.

## Alternativas consideradas

| Opção | Decisão | Motivo |
| --- | --- | --- |
| Manter `REPAIR` esgotado como faltante | Rejeitada | Descarta conteúdo seguro e gravável por uma melhoria semântica não convergida. |
| Publicar também `REJECT` ou hard gate falho | Rejeitada | Relaxaria factualidade, segurança e estrutura; risco inaceitável. |
| Marcar job como `SUCCEEDED_PARTIAL` com N Contents publicados | Rejeitada | Viola a semântica mensurável de parcial: `D < N`. |
| Criar campo/entidade paralela de qualidade | Rejeitada | `Content.status` já é a fronteira persistente e precisa apenas de um estado explícito. |
| Tentar repair adicional ou fallback de modelo | Rejeitada | Altera o orçamento e os limites aprovados; não é necessário para a decisão. |

## Consequências e riscos

- **Benefício:** o creator recebe conteúdo seguro e gravável sem transformar não convergência editorial em perda automática de entrega.
- **Risco de confiança:** conteúdo sem qualidade semântica plena pode ser percebido como pronto. Mitigação: estado explícito, copy clara e inelegibilidade para aprovação/gravação.
- **Risco de cobrança:** quota confirma conteúdo publicado mesmo pendente. É intencional pela regra de quota por conteúdo entregue; a UI não pode apresentá-lo como plenamente aprovado.
- **Risco de consumidores fechados:** clientes que assumem apenas três status precisam ser atualizados antes do rollout.
- **Risco de regressão:** qualquer caminho que trate `QUALITY_PENDING` como `DRAFT`, aprovado ou elegível para lote viola este ADR.

## Handoff obrigatório

**Backend Developer:** adicionar `QUALITY_PENDING` ao contrato persistente/API; decidir terminal usando a matriz deste ADR; calcular `qualityPendingCount`; persistir status, reports, run, quota e memória na única transação fenced; não alterar chamadas, rounds ou reparos; cobrir `REPAIR` esgotado elegível, `REJECT`, hard gate, schema/provider, completo/parcial e fence perdido.

**Review:** rejeitar implementação que publique sem todos os hard gates/cenas/variedade, que conte pendência como falha, que crie estado parcial com D=N, que cobre/libere quota diferente da matriz, que transporte payload/razão livre, que permita approval/lote, ou que adicione chamada/round/provider fallback.

## Relações

ADR-012, ADR-015, ADR-019, ADR-020, ADR-021, ADR-025, ADR-026 e SPEC Slice 003 B-003-05, B-003-08 a B-003-13.