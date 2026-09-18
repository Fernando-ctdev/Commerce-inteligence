# Design — Observabilidade de uso e custo de IA

**Data:** 2026-09-18  
**Status:** aprovado pelo usuário
**Escopo:** Commerce Intelligence, Model Router/LLM Gateway e Histórico do Produto.

## Objetivo

Registrar o uso real retornado pelo provider e calcular custo estimado reproduzível por chamada de capability. Exibir no Histórico do Produto somente agregados financeiros úteis, sem expor detalhes internos da engine.

## Escopo

- Capturar `inputTokens`, `outputTokens`, `reasoningTokens` e `cachedTokens` da resposta do provider. Cada campo é opcional: ausência, formato desconhecido ou provider sem suporte persiste `null`, nunca `0` inferido.
- Calcular custo por uma tabela versionada de preços para `provider + model + currency`.
- Persistir um snapshot sanitizado por chamada/capability no `IntelligenceRun.metadata`.
- Derivar agregados por capability, `Content` e `CommerceIntelligenceJob` para o Histórico do Produto.
- Disponibilizar uma leitura tenant-scoped para a aba Histórico.

## Não objetivos

- Não alterar quota, billing, entitlement, roteamento, escolha de tier ou comportamento de retry.
- Não criar analytics global, exportação, dashboard, cobrança ao creator, cache de preços externo ou nova infraestrutura de observabilidade.
- Não expor provider, modelo, tier, prompt, tokens, latência, payload, hashes ou IDs técnicos ao creator.
- Não retrocalcular custos históricos sem usage e versão de preço suficientemente registrados.

## Fonte de uso e preço

O adapter do provider é a única fonte de usage. Ele normaliza o envelope de resposta para os quatro campos conhecidos e preserva `null` quando não houver dado confiável. A engine não estima tokens por texto nem converte bytes em tokens.
O adapter preserva os contadores reportados, mas normaliza a base de cálculo sem dupla contagem: `cachedTokens` pode ser subconjunto de `inputTokens` e `reasoningTokens` pode ser subconjunto de `outputTokens`. O custo usa somente buckets não sobrepostos conforme a semântica documentada do provider. Se essa semântica não puder ser determinada, a capability fica `PARTIAL` ou `UNAVAILABLE`; nunca soma tokens sobrepostos.

Para OpenRouter, `usage.cost` e `usage.cost_details` são a fonte primária do custo da chamada. A moeda precisa estar explicitamente documentada pelo provider ou configurada no adapter; sem essa confirmação, o valor não se torna custo monetário completo. `GET /api/v1/models` é fonte secundária: antes de qualquer cálculo por rates, o adapter persiste um snapshot imutável com provider, modelo, moeda, rates, instante de coleta e hash/versionamento local. Catálogo local só é fallback para provider sem pricing oficial; nunca preenche lacuna de preço OpenRouter.

O contrato comum é provider-agnostic: cada capability registra origem `REPORTED`, `OFFICIAL_SNAPSHOT`, `LOCAL_FALLBACK` ou `UNAVAILABLE`. O primeiro usa o custo reportado; o segundo calcula buckets não sobrepostos; o terceiro somente usa catálogo local explicitamente configurado; o último não inventa preço. Mudanças de preço ou modelo nunca alteram o custo histórico porque o registro referencia o custo reportado normalizado ou o snapshot aplicado.

## Contrato persistido

`IntelligenceRun.metadata.capabilities[]` recebe somente dados allowlisted por tentativa efetiva de provider:

```ts
type CapabilityUsageCost = {
  task: LogicalTask;
  contentId?: string;
  attempt: number;
  retry: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    reasoningTokens: number | null;
    cachedTokens: number | null;
  };
  pricing: {
    source: "REPORTED" | "OFFICIAL_SNAPSHOT" | "LOCAL_FALLBACK" | "UNAVAILABLE";
    snapshotId: string | null;
    currency: string | null;
  };
  cost: {
    amountMinor: string | null;
    completeness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  };
};
```

`contentId` só existe quando a capability é semanticamente por item; capabilities de conjunto permanecem apenas no job. O contrato não inclui provider, modelo, request/response, prompt, token secreto, payload bruto ou qualquer dado do creator. A origem provider/modelo pode permanecer nos metadados internos existentes, mas não entra na projeção creator-facing.

`IntelligenceRun` continua sendo um registro idempotente por job e o metadata é atualizado apenas pelo owner/fence da tentativa vigente. Falhas sanitizadas podem registrar o usage recebido antes do erro terminal, mas nunca um corpo de resposta.

## Agregações e consistência

A fonte canônica é sempre a lista por capability em `IntelligenceRun.metadata`; não há coluna de total duplicada em `Content` ou `CommerceIntelligenceJob`.

- **Capability:** custo e completude da entrada individual.
- **Content:** soma as entradas cujo `contentId` corresponde ao Content; não inclui chamadas de conjunto, estratégia ou planejamento.
- **Job:** soma todas as entradas do run, incluindo conjunto e por Content.

A agregação preserva a moeda única do job. Se houver mais de uma moeda, não soma valores: retorna indisponível até existir conversão versionada explicitamente aprovada. Um total é `COMPLETE` apenas se todas as entradas elegíveis tiverem custo completo; é `PARTIAL` se ao menos uma entrada tiver custo conhecido e outra estiver parcial/indisponível; é `UNAVAILABLE` quando nenhuma entrada tiver custo calculável. Campos de usage nulos não impedem a persistência nem inventam custo.

Retries, fallback de provider/modelo e repair são entradas distintas por tentativa efetiva e entram no custo do job. Tentativas que falham antes de usage não criam custo; se o provider retornar usage em uma resposta falha, ela entra com seu status correspondente. O mesmo evento não pode ser contado duas vezes: a chave lógica inclui job, capability, tentativa e retry.

## Leitura para Histórico e UI

Criar endpoint dedicado, autenticado e tenant-scoped, por Product. Ele resolve o Product dentro do tenant da sessão, lista jobs históricos do Product e calcula a projeção no servidor; o cliente não recebe metadata completo nem IDs de pricing. A resposta contém somente totais financeiros por job e, quando houver Content associado, por Content, com `currency`, `amountMinor | null` e `completeness`.

A aba Histórico usa progressive disclosure: mostra custo estimado agregado e estado `parcial` ou `indisponível` de forma explícita. Não mostra provider, modelo, tier, tokens, prompts, logs, latência ou detalhes técnicos. A informação não cria KPI card ou dashboard; fica subordinada ao registro operacional do Product. Acessibilidade inclui rótulo textual do estado e valor monetário localizado, sem depender somente de cor.

## Migração e compatibilidade

A migration adiciona a estrutura versionada de preços e amplia apenas a allowlist de `IntelligenceRun.metadata`. Linhas existentes permanecem válidas: capabilities sem o novo campo projetam custo `UNAVAILABLE`. Não há backfill por estimativa. Escritores novos devem aceitar respostas de provider antigas ou incompletas, mantendo campos nulos. Leitores toleram metadata sem usage/pricing/cost.

## Invariantes

1. Usage vem exclusivamente da resposta real do provider; ausência é `null`.
2. Custo histórico referencia o custo reportado normalizado ou o snapshot de preço aplicado e nunca é recalculado por preço atual.
3. O total é derivado da fonte por capability e não é persistido em duplicidade.
4. Toda leitura é isolada por tenant e Product; identificadores do cliente não definem escopo.
5. A UI creator-facing não recebe nem exibe dados técnicos da engine.
6. Custo nunca altera quota, estado do job, retry ou resultado da geração.

## Revisões documentais necessárias

Antes da implementação, revisar ADR-013 para substituir a proibição absoluta de custo na UI pela exceção limitada: somente agregados financeiros no Histórico, sem provider/modelo/tokens. Atualizar a SPEC e o slice responsável pelo Histórico para incluir o endpoint, os estados de completude e a apresentação. A decisão não altera o contrato dos demais slices.

## Testes e validação

Testes determinísticos devem cobrir: normalização de todos os campos de usage e nulos; cálculo por dimensão e versão de preço; arredondamento exato; preço/modelo/moeda ausentes; retries, fallback e falhas com/sem usage; deduplicação por tentativa; agregação capability/Content/job; e isolamento de tenant no endpoint. Um smoke visual verifica a aba Histórico em desktop e mobile, incluindo estados completo, parcial e indisponível, sem vazamento de campos internos.

## Riscos

- Providers podem mudar envelopes ou não cobrar/relatar todas as dimensões; o estado parcial/indisponível evita falsa precisão.
- Preços podem variar por região, modalidade ou data; o snapshot versionado preserva auditabilidade, mas exige operação disciplinada da tabela.
- Repair e fallback podem elevar custo rapidamente; esta proposta torna o efeito visível sem mudar a política atual.
- Exposição indevida de metadata violaria ADR-013 e o Design System; o endpoint deve ser uma projeção allowlisted, não um passthrough.
