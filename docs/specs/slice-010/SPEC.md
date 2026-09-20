# SPEC — Slice 010: Histórico do Produto

**Status:** APPROVED  
**Dependências:** Slice 004 e Slice 006; contrato de custo da Commerce Intelligence  
**Domain Areas:** Product, Content Operations, Commerce Intelligence

## 1. User Outcome

No contexto de um Product, o creator consulta seu histórico intelectual e operacional e, quando disponível, entende o custo estimado agregado de cada job e de cada Content diretamente atribuído. A interface mostra somente valor, moeda e completude; ela não transforma o Histórico em analytics técnico da engine.

## 2. Fontes de autoridade

- `docs/delivery/SLICES.md`, Slice 010;
- `docs/product/PRD.md`, §29;
- `docs/product/PRD-content-briefing.md`, §13;
- `docs/architecture/SYSTEM-DESIGN.md`, Commerce Intelligence e Histórico/Product Memory;
- `docs/architecture/adr-013-model-router-e-intelligence-tier.md`;
- `docs/engineering/PRINCIPLES.md`;
- `DESIGN.md`, Produto, Histórico, responsive e progressive disclosure;
- `docs/superpowers/specs/2026-09-18-token-cost-observability-design.md`.

## 3. In Scope

- Histórico dentro do Product: lotes e Contents concluídos, briefings e versões aprovados, dimensões usadas e proveniência de Contents, conforme Slice 010.
- Projeção financeira por `CommerceIntelligenceJob` e por `Content` somente quando a capability tiver `contentId` diretamente atribuível.
- Estados financeiros `COMPLETE`, `PARTIAL` e `UNAVAILABLE`.
- Endpoint dedicado, autenticado e tenant-scoped para leitura do Histórico por Product.
- Compatibilidade para jobs legados sem usage/preço: custo `UNAVAILABLE`, sem backfill por estimativa.
- A projeção consome custo reportado pelo adapter ou snapshot imutável de preço. Para OpenRouter, `usage.cost`/`cost_details` prevalece e o snapshot de `GET /api/v1/models` é secundário; catálogo local só atende provider sem pricing oficial. Fonte e detalhes permanecem internos e nunca integram o DTO.
- Apresentação responsiva: lista densa no desktop e lista vertical legível no mobile; valores e estados têm rótulo textual acessível.

## 4. Out of Scope

- Destino global de Histórico, Content Vault, dashboard, KPI, analytics externo, billing, quota ou alteração do roteamento/retry da engine.
- Provider, modelo, tier, tokens, prompts, logs, latência, hashes, IDs técnicos, payloads ou `IntelligenceRun.metadata` bruto na API ou UI creator-facing.
- Conversão de moeda, estimativa retroativa ou soma de valores de moedas diferentes.
- Atribuir custo de capability de conjunto, Strategy ou planejamento a um Content.

## 5. HTTP Contract

### `GET /api/products/:id/history`

O servidor resolve a sessão e o `tenantId`; o cliente não envia nem controla o tenant. Toda leitura, junção e agregação recebe o par server-derived `tenantId + productId` e falha fechada fora desse escopo. O Product é buscado no mesmo limite autorizado. Product inexistente ou pertencente a outro tenant retorna a resposta uniforme `404`. A rota não usa cache (`Cache-Control: no-store`).

```ts
type CostSummary = {
  currency: string | null;
  amountMinor: string | null;
  completeness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
};

type ProductHistoryResponse = {
  jobs: Array<{
    // Contexto creator-facing: status, datas e quantidade; nenhum ID técnico.
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED" | "CANCELLED";
    createdAt: string;
    finishedAt: string | null;
    requestedContents: number;
    cost: CostSummary;
    contents: Array<{
      // Posição no conjunto do job; nenhum ID técnico.
      position: number;
      cost: CostSummary;
    }>;
  }>;
};
```

A resposta ordena jobs por criação, do mais recente ao mais antigo. Cada `amountMinor` é uma string decimal inteira na menor unidade da respectiva `currency`; nunca é convertido por `Number` ou `float` na API. Nenhum campo adicional do metadata, de pricing ou do Model Router cruza esse contrato.

## 6. Regras de projeção

A fonte canônica é `IntelligenceRun.metadata.capabilities[]`. Toda leitura, junção e agregação é limitada por `tenantId + productId` server-derived e falha fechada fora desse par. Totais são calculados na leitura, sem colunas duplicadas em `Content` ou `CommerceIntelligenceJob`.

- O total de job inclui cada capability efetiva do run uma vez, incluindo retry, fallback, repair e falha que tenha usage/custo conhecido.
- O total de Content inclui apenas capabilities cujo `contentId` foi derivado pelo servidor; chamadas de conjunto contribuem somente para o job.
- `COMPLETE` exige pelo menos uma entrada elegível, todas completas e na mesma moeda.
- `PARTIAL` inclui uma única entrada `PARTIAL` com `amountMinor` conhecido e também combinações com ao menos um custo conhecido e outra entrada parcial ou indisponível.
- `UNAVAILABLE` ocorre quando a lista não contém custo calculável, em metadata legado, moeda incompatível ou ausência de semântica/price/usage necessária.
- A rota não reestima tokens, não recalcula pelo preço atual e não soma moedas distintas.
- O Histórico projeta custo reportado pelo adapter quando disponível; para OpenRouter, na ausência dele usa somente snapshot imutável previamente aplicado de `GET /api/v1/models`. Catálogo local é fallback apenas de provider sem pricing oficial. Origem, rates e breakdown não cruzam a fronteira creator-facing.

## 7. UI Contract

A aba Histórico mantém o foco no registro operacional do Product. Cada job pode mostrar status, data, quantidade solicitada e custo estimado agregado. Valores por Content ficam em progressive disclosure e só aparecem quando diretamente atribuídos. `PARTIAL` e `UNAVAILABLE` são textos explícitos, não somente cores; a ausência de custo não bloqueia a consulta do restante do histórico.

Desktop pode agrupar a informação em lista densa. Mobile preserva a mesma capacidade em uma coluna vertical, sem tabela comprimida. Não há cards de KPI, gráficos, uma página de análise ou qualquer detalhe técnico da engine.

## 8. Invariantes

1. Leitura e autorização são sempre tenant-scoped no servidor.
2. A API/UI creator-facing recebe apenas `currency`, `amountMinor` e `completeness` como dados de custo.
3. Valores históricos usam o custo reportado normalizado ou o snapshot de preço aplicado; mudanças de catálogo não os alteram.
4. `null` significa indisponibilidade honesta, não zero ou estimativa.
5. Custos não alteram quota, billing, estados de job, retry, fallback ou resultado gerado.

## 9. Acceptance and verification

- Testes determinísticos cobrem projeção completa, parcial e indisponível; metadata legado; falhas/retries; atribuição por Content; moedas mistas; ordenação; Product inexistente e tentativa cross-tenant.
- Teste de contrato garante ausência de provider, modelo, tier, token, prompt, metadata, pricing ID e demais campos técnicos no DTO.
- Smoke visual, autenticado, confirma a aba Histórico em desktop e mobile nos estados completo, parcial, indisponível, legado e vazio, sem detalhes técnicos no DOM ou na árvore acessível.
