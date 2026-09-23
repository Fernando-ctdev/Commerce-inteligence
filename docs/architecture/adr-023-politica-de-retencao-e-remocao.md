# ADR-023: Política de retenção e remoção de dados de geração

## Status

Aceito — consolida a política aprovada no Gate 4 (itens 1–4), registrada na SPEC slice-003 como RI-003-21 (retenção mínima), RI-003-22 (modalidades de remoção), RI-003-23 (rastreabilidade sob retenção obrigatória) e RI-003-24 (integridade referencial pós-remoção/arquivamento). Nenhuma alteração de código é introduzida por este ADR: ele formaliza como decisão de arquitetura o comportamento vigente verificado na implementação.

## Contexto

Os dados de geração de um Product compreendem três famílias: **histórico** (sem tabela própria — derivado de `CommerceIntelligenceJob` por tentativa, `IntelligenceRun` por job e `GenerationUsageReservation` reconciliada), **versões de conteúdo** (`ContentBriefVersion` append-only com ponteiros `current`/`approved` como únicos mutáveis; `BriefValidationReport` e `ContentSceneSet` solidários à versão) e **memória** (`ProductMemorySnapshot` append-only com merge acumulativo em snapshot novo). Faltava uma decisão canônica sobre o que fica retido, como é removido e como a rastreabilidade e as referências sobrevivem a remoção e arquivamento.

## Decisão

1. **Retenção enquanto o Product existir:** nenhuma purga automática, TTL ou política por idade. Histórico, versões e memória permanecem retidos e consultáveis enquanto o Product existir no Tenant; a aba `Histórico` deriva das linhas reais, nunca de cópia separada.
2. **Archive é estado operacional, não remoção:** `Product.lifecycle` (`ACTIVE` ↔ `ARCHIVED`) é reversível via `transitionTenantProduct`, preserva integralmente os dados retidos e libera **somente capacidade** (`activeProductsUsed`). Archive responde "este Product está em uso?" — nunca "estes dados devem deixar de existir?".
3. **Exclusão física é a única remoção:** o `DELETE` transacional Big Bang do Product (iniciado pelo usuário) é o único gatilho que remove os dados retidos, em cascata atômica numa única transação — sem janela de estado parcialmente removido.
4. **Não há soft delete:** nenhum marcador de remoção (`deletedAt` ou equivalente) é introduzido — duplicaria o papel do archive, exigiria filtragem em todo caminho de leitura e criaria uma terceira semi-remoção com semântica ambígua, sem requisito que a peça.
5. **Rastreabilidade por construção:** tabelas retidas são append-only (payloads nunca atualizados; `ContentSceneSet` é create/upsert idempotente com `update` vazio); ponteiros movem sem apagar versões; `IntelligenceRun` é idempotente por job com fencing `leaseOwnerId`/`attempt` (tentativa antiga nunca sobrescreve o run; contador `attempt` preserva a contagem; retry explícito cria novo job+run); memória grava sempre snapshot novo. Nenhuma rotina de limpeza existe fora do Big Bang.
6. **Referências íntegras nas duas transições:** FKs restritivas (sem `onDelete` no schema) + ordem transacional do Big Bang (todos os filhos antes dos pais; ponteiros anulados primeiro para quebrar o ciclo `Content` ↔ `ContentBriefVersion`; `Product` por último). Geração só **inicia** para Product `ACTIVE` (`startCommerceIntelligence`, fail-fast). Se o Product for arquivado durante o `RUNNING`, o resultado depende da ordem do lock de linha na finalização (`SELECT … FOR UPDATE` no Product), que serializa com o `UPDATE` do archive: **archive commita antes do lock** → a finalização vê `ARCHIVED`, aborta antes de qualquer escrita (rollback de strategy, plan, contents, briefs, scene sets e memória), job `FAILED` com `GEN-PRODUCT` e reserva `RELEASED`; **finalização adquire o lock primeiro** → a publicação persiste de forma consistente enquanto o Product ainda está `ACTIVE`, e o archive espera o commit e então arquivar preserva integralmente o histórico, as versões e a memória recém-publicadas. Não existe janela em que resultado seja persistido para Product já `ARCHIVED`.

## O que não muda

`DELETE` Big Bang transacional (RI-003-18), ciclo de archive/reativação vigente, append-only de versões e memória, idempotência por `job.id`, tenant scoping, regras de exclusão de RI-003-18 e RI-003-19/20. O ADR não altera comportamento: formaliza o contrato verificado.

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Exclusão lógica (soft delete `deletedAt`) | Rejeitada | Duplica o archive; filtragem em todo caminho de leitura; terceira semi-remoção ambígua sem requisito |
| TTL/purga automática de histórico, versões ou memória | Rejeitada | Rastreabilidade é obrigatória sob retenção; nenhuma exigência de expiração |
| Archive com liberação de dados (retenção parcial) | Rejeitada | Arquivar deve ser reversível e preservativo; libera apenas capacidade ativa |
| Revalidação de lifecycle sem lock na finalização | Rejeitada | Janela TOCTOU: archive podia commitar entre a leitura e as escritas do resultado |

## Consequências

- Positivas: política única e verificável (append-only + FKs restritivas + ordem transacional + lock de lifecycle); archive permanece barato e reversível; rastreabilidade integral até a remoção deliberada; memória reconstrutível por job.
- Negativas/riscos: crescimento contínuo dos dados retidos (aceito — sem TTL por decisão); a exclusão física é total e irreversível (por design, única via deliberada); cenários futuros de expiração legal/LGPD exigirão emenda explícita a este ADR.

## Relações

- SPEC slice-003: RI-003-16 (retry técnico/explícito), RI-003-17 (memória), RI-003-18 (DELETE Big Bang), RI-003-21–24 (política deste ADR).
- ADR-003 (PostgreSQL, memória e rastreabilidade), ADR-005 (gerações assíncronas e duráveis), ADR-019 (cenas por brief version), ADR-021 (retry de faltantes).
