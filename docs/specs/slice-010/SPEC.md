# SPEC — Slice 010: Histórico do Produto

**Status:** APPROVED  
**Dependências:** Slice 004 e Slice 006; contrato de custo da Commerce Intelligence  
**Domain Areas:** Product, Content Operations, Commerce Intelligence

## 1. User Outcome

No contexto de um Product, o creator consulta seu histórico intelectual e operacional e entende, quando disponível, a identificação do job, status, timestamps, usage agregado e custo agregado de cada tentativa. A interface mostra uma projeção allowlisted, não metadata bruto nem analytics técnico da engine.

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
- Projeção operacional por `CommerceIntelligenceJob`: `jobId`, status, timestamps, usage agregado e custo agregado; custo por `Content` somente quando a capability tiver `contentId` diretamente atribuível.
- Estados financeiros `COMPLETE`, `PARTIAL` e `UNAVAILABLE`.
- Endpoint dedicado, autenticado e tenant-scoped para leitura do Histórico por Product.
- Compatibilidade para jobs legados sem usage/preço: usage com campos `null` e custo `UNAVAILABLE`, sem backfill por estimativa.
- A projeção consome custo reportado pelo adapter ou snapshot imutável de preço. Para OpenRouter, `usage.cost` prevalece e o snapshot de `GET /api/v1/models` é secundário; ausência, `null` ou formato inválido de `usage.cost` nunca vira `USD 0`. Catálogo local só atende provider sem pricing oficial. Fonte e detalhes permanecem internos e nunca integram o DTO.
- Apresentação responsiva: lista densa no desktop e lista vertical legível no mobile; valores, usage e estados têm rótulo textual acessível.

## 4. Out of Scope

- Destino global de Histórico, Content Vault, dashboard, KPI, analytics externo, billing, quota ou alteração do roteamento/retry da engine.
- Provider, modelo, tier, prompts, logs, latência, hashes, payloads, capability rows, pricing source/rates ou `IntelligenceRun.metadata` bruto na API ou UI creator-facing. `jobId`, status, timestamps, usage agregado e custo agregado são a exceção allowlisted deste Slice.
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

type UsageSummary = {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
};

type ProductHistoryResponse = {
  jobs: Array<{
    jobId: string;
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED" | "CANCELLED";
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    requestedContents: number;
    usage: UsageSummary;
    cost: CostSummary;
    contents: Array<{
      position: number;
      cost: CostSummary;
    }>;
  }>;
};
```

A resposta ordena jobs por criação, do mais recente ao mais antigo. Cada `amountMinor` é uma string decimal inteira na menor unidade da respectiva `currency`; nunca é convertido por `Number` ou `float` na API. Os contadores de usage são somas de contadores reais reportados, com `null` quando a dimensão não é conhecida para todas as entradas elegíveis; não são inferidos de texto, bytes ou custo. Nenhum campo adicional do metadata, de pricing ou do Model Router cruza esse contrato.

## 6. Regras de projeção

A fonte canônica é `IntelligenceRun.metadata.capabilities[]`. Toda leitura, junção e agregação é limitada por `tenantId + productId` server-derived e falha fechada fora desse par. Totais são calculados na leitura, sem colunas duplicadas em `Content` ou `CommerceIntelligenceJob`.

- O total de job inclui cada capability efetiva do run uma vez, incluindo retry, fallback, repair e falha que tenha usage/custo conhecido.
- O total de Content inclui apenas capabilities cujo `contentId` foi derivado pelo servidor; chamadas de conjunto contribuem somente para o job.
- Usage é agregado da mesma lista por capability, sem inferir zero: uma dimensão ausente em qualquer entrada elegível permanece `null` no total; `0` só aparece quando foi explicitamente reportado.
- `COMPLETE` exige pelo menos uma entrada elegível, todas completas e na mesma moeda.
- `PARTIAL` inclui uma única entrada `PARTIAL` com `amountMinor` conhecido e também combinações com ao menos um custo conhecido e outra entrada parcial ou indisponível.
- `UNAVAILABLE` ocorre quando a lista não contém custo calculável, em metadata legado, moeda incompatível ou ausência de semântica/price/usage necessária.
- A rota não reestima tokens, não recalcula pelo preço atual e não soma moedas distintas.
- O Histórico projeta custo reportado pelo adapter quando disponível; para OpenRouter, `usage.cost` é custo real e sua ausência não é custo zero. Na ausência de custo reportado, usa somente snapshot imutável previamente aplicado de `GET /api/v1/models`; catálogo local é fallback apenas de provider sem pricing oficial. Origem, rates e breakdown não cruzam a fronteira creator-facing.

## 7. UI Contract

A aba Histórico mantém o foco no registro operacional do Product. Cada job mostra `jobId`, status, timestamps, quantidade solicitada, usage agregado e custo agregado. Valores por Content ficam em progressive disclosure e só aparecem quando diretamente atribuídos. `PARTIAL`, `UNAVAILABLE` e usage desconhecido são textos explícitos, não somente cores; ausência de usage/custo não bloqueia a consulta do restante do histórico.

Desktop pode agrupar a informação em lista densa. Mobile preserva a mesma capacidade em uma coluna vertical, sem tabela comprimida. Não há cards de KPI, gráficos, uma página de análise ou detalhe de provider/modelo/tier; `jobId`, usage agregado e custo agregado são atributos operacionais do job, não métricas de overview.

## 8. Invariantes

1. Leitura e autorização são sempre tenant-scoped no servidor.
2. A API/UI creator-facing recebe somente `jobId`, status, timestamps, usage agregado e custo agregado por job, além da posição e do custo diretamente atribuível por Content.
3. Valores históricos usam o custo reportado normalizado ou o snapshot de preço aplicado; mudanças de catálogo não os alteram.
4. `null` significa indisponibilidade honesta; `0` só representa valor explicitamente reportado, nunca ausência.
5. Custos e usage não alteram quota, billing, estados de job, retry, fallback ou resultado gerado.

## 9. Acceptance and verification

- Testes determinísticos cobrem projeção completa, parcial e indisponível; usage parcial/nulo e zero explicitamente reportado; metadata legado; falhas/retries; atribuição por Content; moedas mistas; ordenação; Product inexistente e tentativa cross-tenant.
- Teste de contrato garante a presença exclusiva de `jobId`, status, timestamps, usage agregado e custo agregado, e a ausência de provider, modelo, tier, prompt, metadata, pricing ID, source/rates, capability rows e demais campos técnicos no DTO.
- Smoke visual, autenticado, confirma a aba Histórico em desktop e mobile nos estados completo, parcial, indisponível, legado e vazio, sem metadata técnico bruto no DOM ou na árvore acessível.
