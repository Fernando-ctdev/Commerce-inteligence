# ADR-015: Content Operations — versionamento de briefing e RecordingBatch

## Status

Aceito — domínio de revisão e execução do MVP.

## Contexto

A engine entrega `Content` em `DRAFT` com uma versão inicial de briefing. A partir daí o creator revisa, edita, regenera, descarta e aprova; aprovados viram sessões de gravação organizadas por data. O PRD de Briefing exige rastreabilidade entre o briefing aprovado e cada execução, e proíbe que edições posteriores alterem silenciosamente um lote já montado. Estados de revisão, estados do lote e estados do job são dimensões distintas.

## Decisão

1. **Content é identidade estável** (`DRAFT` / `APPROVED` / `DISCARDED`); o material revisável vive em `ContentBriefVersion` **imutável** (objective, público, dor, desejo, objeção, benefício, angle, hook, script, scenes, cta, notes).
2. **Editar ou regenerar cria nova versão** — nunca sobrescreve. Regeneração parcial (novo hook, novo CTA, nova estrutura, nova versão completa) reutiliza o contexto persistido; `DISCARDED` preserva o Content e suas versões como memória, sem exclusão destrutiva.
3. **Aprovar fixa a versão exata** em `approvedBriefVersionId`. Editar um aprovado cria versão nova que precisa ser aprovada antes de valer para **futuras** execuções.
4. **RecordingBatch** pertence a um único Produto, contém `RecordingBatchItem`s (`contentId` + `approvedVersionId` + `completedAt`) e tem `scheduledDate` (data planejada; horário/recorrência/lembretes ficam fora do MVP). Lote montado nunca é alterado por edição posterior do briefing.
5. **Estados do lote são derivados** do progresso — `0/N → Aguardando`, `1..N-1 → Gravando`, `N/N → Concluído` — nunca administrados manualmente. `Gravando` significa execução iniciada; a plataforma não captura mídia.
6. **Agenda é visão temporal dos RecordingBatch** (dia/semana/mês), interna, sem sincronização externa. Estúdio organiza lotes nesses três estados e apresenta o Guia de Gravação (hook, roteiro, cenas, CTA) com `Anterior` / `Concluir conteúdo` / `Próximo`; concluir é decisão do creator e `Próximo` não conclui implicitamente.
7. Campanha permanece agrupamento opcional sem aggregate próprio; `Vault`/`Histórico` são projeções do mesmo corpus (ver ADR-003).

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Versões imutáveis + aprovação fixando versão (escolhida) | Rastreabilidade total briefing → lote → execução | Volume de versões exige política de retenção na Spec |
| Editar briefing in place | Simples | Perde a versão aprovada executada; quebra memória e auditoria |
| Status do lote administrado manualmente | Controle aparente | Divergência e trabalho manual que o produto quer eliminar |
| Lote multi-produto | Flexibilidade | Complexidade de contexto sem necessidade do MVP |

## Consequências positivas

- Rastreabilidade: Content → versão aprovada → lote → execução → histórico.
- Memória preservada (incluindo descartes) alimenta variedade das próximas gerações.
- Interface simples: o creator vê "Briefing do Conteúdo", não o maquinário de versões.

## Consequências negativas e riscos

- Edições pós-aprovação criam ciclo extra de aprovação — aceito como custo de rastreabilidade.
- Retenção de versões referenciadas impede limpeza agressiva de dados.

## Segurança / Operação

- Todas as operações escopadas ao Tenant; conclusão de conteúdo exige posse do lote.
- Transição de conclusão é idempotente: conteúdo concluído não pode ser concluído novamente por engano; falha de salvamento não perde contexto.
- Progresso e percentuais exibidos derivam de dados reais do lote.

## Relações

- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — persistência, histórico e projeções.
- [ADR-004](./adr-004-variedade-por-memoria-estruturada.md) — sinais de memória (aprovado/concluído/descartado).
- [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) — entrega `Content`/`ContentBriefVersion` em `DRAFT`.
- `PRD-content-briefing.md` — fonte de produto vigente.
