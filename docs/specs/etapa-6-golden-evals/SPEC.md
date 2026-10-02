# SPEC — Etapa 6: Golden Dataset e Evals

**Identificador documental:** `etapa-6-golden-evals`

**Natureza:** precondição documental transversal do Slice 003; não é Slice de produto e não altera o Slice 004.

**Status:** `APPROVED_FOR_CANDIDATE_INTEGRATION` — autoriza a preparação E2E/E6 e a execução futura da primeira geração pelo Maestro/time sob os gates abaixo; recorrência permanece `NOT_EXECUTED`, dependente do Slice 008 nesta fase. A implementação offline do evaluator v2 descrita nesta SPEC foi revisada e verificada por testes; isso não constitui coleta live, resultado, aprovação de V2 ou cutover realizado.

**Runtime atual:** Engine V2 default por decisão do usuário, efetiva no commit `8d1833b`, no estado `V2_DEFAULT_PENDING_ACCEPTANCE`. ADR-029/`@1.2` permanece baseline histórico/experimental reproduzível. Esta SPEC não declara resultado, não-regressão, aprovação ou rollback.

**Histórico `8d1833b`:** o loader de Skill usava `@1.2` e o Planner recebia `@1.3` de fixture congelada. **Candidata atual nesta branch:** o código usa Skill `@1.3` e binding `runtime-skill`; isso não comprova consistência operacional observada com provider vivo nem aceite, conforme [ADR-033 §7](../../architecture/adr-033-determinismo-llm-e-creative-system.md).

## 1. Objetivo e fronteira

E6 deve produzir evidência auditável, após concluir as Etapas 2–6, para:

1. comparar end-to-end ADR-029/`@1.2` e V2 final/`@1.3`, em A/B conduzida pelo Maestro/time contra todas as premissas da nota conectada;
2. avaliar primeira geração e manter recorrência como requisito obrigatório de E6 integral para `V2_ACCEPTED`, indisponível nesta fase (`NOT_EXECUTED`, dependência `SLICE_008`);
3. medir invariantes, qualidade, custo, latência e cobertura, inclusive o efeito agregado das migrações LLM → código;
4. permitir ao Review reprovar protocolo, execução, relatório ou candidato antes de qualquer correção de runtime.

Por instrução expressa do usuário, o Maestro/time assume a operação dos scripts, DB/app/worker em ambiente de avaliação isolado, validações offline, coleta live autorizada, assignments e relatório. Esta direção substitui as restrições anteriores de A/B exclusiva pelo usuário ou de não execução pelo time. Antes de qualquer chamada externa, o usuário ou autoridade humana responsável deve aprovar thresholds, exceções explícitas e teto de gasto, além de autorizar a coleta sobre o freeze pré-coleta revisado por Review e Software Architect. Credenciais nunca são solicitadas ou expostas em chat, logs ou artefatos; são disponibilizadas por ambiente/secret store seguro. Atos que exijam autoridade humana ou não devam ser executados pelo time são sinalizados explicitamente. Atribuições individuais continuam opcionais para diagnóstico solicitado, não gate de `V2_ACCEPTED`.

**Fronteira desta fase:** a autorização atual pavimenta E6 sem implementar Slice 008 nem executar recorrência. `complete-after-partial` é recuperação de faltantes do [ADR-021](../../architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md), nunca recurrence nem evidência substituta de recorrência. Esta emenda altera somente SPEC/PLAN E6 e ADR-033, sem fetch, chamada externa, provider ou coleta. O escopo documental não descreve o diff combinado da branch: código/testes do evaluator foram revisados e verificados separadamente em modo offline, sem registro de freeze, coleta ou aceite.

Esta SPEC não cria capability, endpoint, estado de Job, worker, serviço, tabela, migration, adapter, flag ou persistência. Não corrige writer, memória, Skill, prompt, Risk ou Judge.

## 2. Fontes e precedência

1. Pedido expresso atual do usuário: execução E2E/E6 pelo Maestro/time sob os gates desta SPEC; supersede as restrições anteriores de ownership da nota imutável “Plano de recalibração da commerce inteligence”, sem alterar a nota nem dispensar aprovação humana, critérios ou aceite final.
2. PRDs vigentes.
3. [SYSTEM-DESIGN](../../architecture/SYSTEM-DESIGN.md).
4. [ADR-013](../../architecture/adr-013-model-router-e-intelligence-tier.md), [ADR-019](../../architecture/adr-019-gate-versionada-e-cenas.md), [ADR-021](../../architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md), [ADR-029](../../architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md) e [ADR-033](../../architecture/adr-033-determinismo-llm-e-creative-system.md).
5. [SLICES](../../delivery/SLICES.md), Slice 003 e Slice 004.
6. [Etapa 4 SPEC](../etapa-4-skill-brief/SPEC.md) e [PLAN](../../plans/etapa-4-skill-brief/PLAN.md).
7. [Etapa 5 SPEC](../etapa-5-risk-quality/SPEC.md) e [PLAN](../../plans/etapa-5-risk-quality/PLAN.md).
8. [Call map estático da Etapa 1](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/baseline-call-map.md) — evidencia o call graph e a divergência de binding em `8d1833b`, não auditoria live completa: chamadas físicas, tokens, custo e latência observados seguem `UNAVAILABLE` até execução real.

## 3. Estado operacional e estado de aceitação

| Tema | Estado |
|---|---|
| Runtime default | Engine V2 |
| Aceitação formal | pendente |
| Baseline E6 | ADR-029/`@1.2`, fixada por commit |
| Candidato E6 integral | Runtime candidato nesta feature branch usa Skill `@1.3` em Strategy/Planner/Run e requer fixação por commit e comparação end-to-end com provider vivo; a fixture congelada do Planner isoladamente não demonstra proveniência operacional |
| Rollback | somente por decisão explícita do usuário |
| Supersessão formal do ADR-029 | somente em `V2_ACCEPTED` |

Falha, invalidade ou incompletude de E6 mantém V2 default em `V2_DEFAULT_PENDING_ACCEPTANCE`; não promove o candidato nem restaura ADR-029 implicitamente.

## 4. Classes de evidência

### 4.1 Evidence offline determinística/replay

Pode demonstrar:

- schema, cardinalidade, refs e canonicalização;
- policies/gates determinísticos;
- Planner/Blueprint, compatibilidade e seed;
- idempotência, fencing, partial/retry e quota em harness;
- redaction, hashes, fingerprints e pareamento;
- replay exato de resposta de provider já congelada.

Não pode satisfazer thresholds de:

- qualidade semântica real;
- naturalidade, criatividade, persuasão ou perceived templating do modelo vivo;
- usage/tokens reais;
- custo real;
- latência, timeout, retry ou fallback reais do provider.

Fixture, mock, adapter in-memory ou replay deixa essas métricas `UNAVAILABLE` para aceitação operacional.

### 4.2 Evidence com provider vivo

É obrigatória para:

- comportamento real do modelo;
- critérios subjetivos de qualidade;
- usage/tokens;
- custo e completude;
- latência por tentativa/capability e end-to-end;
- timeout, retry, fallback e cobertura operacional.

Provider vivo não substitui testes determinísticos. As classes são complementares e identificadas separadamente no relatório.

## 5. Golden Dataset e fixtures

**Artefatos existentes preservados:** [`manifest.json`](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/manifest.json) declara `golden-dataset.v1`/`golden-case.v1`, rubrica `golden-rubric.v1`, threshold `THRESHOLD_POLICY_GOLDEN_V1` e `FROZEN`; [`rubrics.json`](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/rubrics.json) cobre somente `NATURALNESS` por `CONTENT`; [`threshold-policy.json`](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/threshold-policy.json) usa `risk-assessment.v1`, `JUDGE_EXECUTED_CONTENTS` e thresholds de Judge reduction. Esse congelamento preserva apenas a evidência offline parcial do experimento de atribuição do Judge; não congela o pacote full E6, não contém execução live e não aprova o pipeline. Nenhum artefato v1 é reescrito ou revalidado retroativamente pelo contrato abaixo.

**Diferença de contrato para E6 integral:** versionar e hashar novos manifesto/cases/fixtures, rubricas por dimensão/unidade com âncoras e dupla anotação cega, aggregation policy por categoria, threshold policy para end-to-end, protocolo/comparabilidade de provider e classes de evidência. Aprovar e congelar esse **novo conjunto** antes da coleta; registrar relação e diferenças explícitas com v1. `FROZEN` de v1 não é herança de cobertura, thresholds ou aprovação full.

**Preparação offline em 2026-09-30:** [`full-e6/draft.json`](../../../src/modules/commerce-intelligence/evaluation/full-e6/draft.json) contém oito entradas redigidas cobrindo seis categorias de compra, N=10 e injeção adversarial; [`full-e6/rubrics.json`](../../../src/modules/commerce-intelligence/evaluation/full-e6/rubrics.json) descreve treze dimensões com âncoras e anotação cega dupla. `npx tsx scripts/eval-full-e6.mts verify` valida e calcula SHA-256 canônico dos insumos. O pacote permanece `DRAFT`, `OFFLINE_INPUT_ONLY` e **não** habilita coleta live: commits dos braços, provider/model/params, agregação, thresholds, avaliações humanas, revisão Architect e aceite do usuário continuam ausentes. O verificador rejeita promoção implícita; o pacote v1 `FROZEN` permanece intacto e não supre essas lacunas.

O shape a seguir descreve o alvo documental de E6 integral, não a representação já congelada de `golden-dataset.v1`:

```ts
type GoldenDatasetManifestFullE6 = {
  datasetId: "commerce-intelligence-golden";
  datasetVersion: string;
  schemaVersion: string; // versão nova pré-registrada; não reutilizar golden-case.v1 sem compatibilidade comprovada
  rubricVersion: string;
  thresholdPolicyVersion: string;
  hashAlgorithm: "SHA-256";
  manifestHash: string;
  caseIds: readonly string[];
  categories: readonly string[];
  status: "DRAFT" | "FROZEN" | "RETIRED";
};

type GoldenCaseFullE6 = {
  caseId: string;
  datasetVersion: string;
  category: string;
  scenario:
    | "HAPPY_PATH"
    | "BOUNDARY"
    | "ADVERSARIAL"
    | "HARD_FAILURE"
    | "SCENE_FAILURE"
    | "PARTIAL"
    | "TECHNICAL_RETRY"
    | "MISSING_DATA";
  fixtureRefs: {
    product: FixtureRefV1;
    evidence: FixtureRefV1;
    creatorContext: FixtureRefV1;
    memory?: FixtureRefV1;
    providerResponses?: readonly FixtureRefV1[];
  };
  request: {
    targetContentCount: number;
    briefBatchSize: number;
    productId: string;
    jobId: string;
  };
  policyRefs: Record<string, string>;
  expected: Record<string, unknown>;
  inputHash: string;
  caseHash: string;
};

type FixtureRefV1 = {
  fixtureId: string;
  fixtureVersion: string;
  contentHash: string;
  encoding: "canonical-json-utf8";
};
```

Regras:

1. somente o **novo manifesto full E6** `FROZEN`, com rubricas/aggregation/thresholds próprios aprovados e hashados, habilita coleta integral; o `FROZEN` v1 continua elegível apenas para seu escopo Judge reduction;
2. canonical JSON UTF-8, ordem estável e SHA-256;
3. Product Facts, evidence, creator context e memory são snapshots redacted/allowlisted;
4. sem segredo, cookie, token, PII desnecessária, URL viva, payload bruto ou dado cross-tenant;
5. IDs são de fixture, nunca IDs de produção;
6. hash/referência divergente torna o case `INVALID`;
7. provider response fixture é apenas replay offline;
8. categorias e população full E6 são fixadas antes da coleta e não herdadas automaticamente de v1.

## 6. Protocolo pareado e comparabilidade

Cada braço registra:

- commit e engine version;
- provider e model ID/version efetivos;
- tier;
- parâmetros efetivos: reasoning, temperature, top-p, max tokens, schema/response mode, timeout, retry e fallback;
- `platformSkillVersion`, Skill binding e Creative System version;
- contract, schema, gate, Risk e Judge-selection policy versions;
- prompt/instructions e contexto allowlisted por artefato versionado e hash;
- Product Facts/evidence, creator context e memory por bytes/hash;
- dataset, case, categoria e ordem;
- seed, `seedDerivationVersion` e algoritmo;
- capabilities/tentativas executadas e cobertura;
- usage/tokens por categoria disponível;
- pricing source/snapshot, moeda, custo e completude;
- latência por tentativa/capability e end-to-end;
- retries, repairs, timeout, fallback e erros.

### 6.1 Controles

Na comparação end-to-end, controles externos ao pipeline permanecem iguais. Diferenças inerentes entre ADR-029 e V2 são listadas antes da coleta em um manifest de diferenças.

Se o usuário solicitar experimentos de atribuição após a avaliação do conjunto, cada um altera uma única variável declarada e possui protocolo próprio. Diferença não pré-registrada, mudança de provider/model/version/params, prompt/contexto ausente, seed divergente ou cobertura incompatível invalida o par ou a métrica afetada conforme policy.

### 6.2 Seed e fingerprint

```text
pairFingerprint = H(
  protocolVersion,
  datasetVersion + manifestHash,
  caseId + caseHash + inputHash,
  baselineCommit + candidateCommit,
  provider + modelVersion + tier + parameterHash,
  skill + contract + policy hashes,
  promptArtifactHash + contextArtifactHash,
  seedDerivationVersion + jobSeed,
  thresholdPolicyVersion
)
```

O mesmo `jobSeed` é usado no par quando a variável avaliada não é seed. Timestamp, UUID aleatório e `Math.random` não são seed reproduzível.

## 7. Avaliação A/B end-to-end final

Após concluir todas as Etapas 2–6 e aprovar o freeze pré-coleta, o Maestro/time poderá executar a comparação A/B da primeira geração; esta fase não atribui execução recorrente ao time:

- ADR-029/`@1.2` por commit versus V2 final/`@1.3` por commit;
- primeira geração; recorrência continua obrigatória para o aceite integral, mas é `NOT_EXECUTED` nesta fase, dependente do Slice 008;
- execução offline dos invariantes e execução com provider vivo das métricas operacionais/semânticas;
- todas as premissas da nota conectada, inclusive qualidade comercial e criativa, diversidade, ausência de dor obrigatória e templating, factualidade, redução de chamadas, custo, latência, repairs e falhas.

Antes da coleta, executar validações comportamentais por etapa e preparar o protocolo; chamadas externas permanecem bloqueadas até as aprovações previstas nesta SPEC. Atribuições de PU/Strategy, Plan, cenas, Judge, catálogo/Blueprint, recipe/free composition, Skill ou tiers são diagnósticos opcionais posteriores, se solicitados pelo usuário. A/B end-to-end é gate de aceite; atribuição individual não a substitui nem é condição obrigatória.

## 8. Rubricas subjetivas auditáveis

```ts
type GoldenRubricV2 = {
  rubricId: string;
  rubricVersion: string;
  dimension: string;
  unit: "CONTENT" | "PART" | "SCENE" | "CASE" | "JOB";
  labels: readonly string[];
  anchors: {
    positive: readonly string[];
    negative: readonly string[];
    boundary: readonly string[];
  };
  evidenceRequired: boolean;
  blind: true;
  adjudicationPolicyVersion: string;
  aggregationPolicyVersion: string;
};
```

Dimensões mínimas:

- naturalidade;
- criatividade/originalidade;
- especificidade ao Produto;
- potencial persuasivo;
- atenção;
- integração do Produto;
- realização do Blueprint;
- diversidade psicológica e criativa;
- perceived templating;
- aderência à plataforma;
- recipe coherence e free-composition coherence.

Para cada dimensão, o protocolo fixa antes da coleta:

1. pergunta e definição operacional;
2. unidade de avaliação;
3. labels/escala e âncoras;
4. evidência mínima;
5. população, categorias e denominador;
6. regra de `NOT_ANNOTATED`;
7. agregação e threshold.

## 9. Cegamento, independência e adjudicação

Cada unidade recebe no mínimo duas avaliações humanas independentes e cegas, com adjudicação humana dos conflitos conforme a policy pré-registrada; agentes/LLMs não substituem esses julgamentos. O time organiza assignments, coleta as avaliações e consolida o relatório; os avaliadores não precisam ser o usuário. O anotador não recebe braço, commit, provider, modelo, tier, reasoning, custo, latência, retries, Risk, Judge runtime ou resultado esperado.

```ts
type BlindAssignmentV1 = {
  assignmentId: string;
  caseId: string;
  evaluationUnitId: string;
  opaqueArmId: string;
  opaqueAnnotatorId: string;
  rubricVersion: string;
  assignmentSeed: string;
  assignmentHash: string;
  status: "ASSIGNED" | "ANNOTATED" | "ADJUDICATED" | "INVALID";
};
```

Regras:

- mapeamento do braço fica separado da anotação;
- Views para anotadores só são geradas quando os conteúdos/direção necessários estão disponíveis; unidades sem evidência permanecem no mapping privado e nos denominadores, sem distribuir conteúdo nulo.
- avaliação bruta nunca é sobrescrita;
- conflito segue policy pré-registrada;
- adjudicador não vê custo/latência nem deve receber o braço quando tecnicamente possível;
- relatório preserva avaliações, conflito, exclusão e decisão adjudicada;
- assignment vazado, duplicado ou incompatível é `INVALID`.

Anotação/adjudicação nunca preenche `JudgeResult` nem altera Brief, Content, Job, D/F, quota ou publicação.

O Judge runtime registra `JudgeExecution=EXECUTED|NOT_EXECUTED|FAILED|NOT_APPLICABLE`; `JudgeResult=PASS|REVIEW` existe somente quando `EXECUTED`. Falha ou ausência entram na cobertura e nunca criam `PASS`, `REVIEW` ou repair sintético. O RiskAssessment histórico ADR-029 baseado em `sources.judge=NOT_EXECUTED` fica `PARTIAL|UNAVAILABLE`; no alvo V2 a seleção de Risk pré-Judge não depende desse resultado.

## 10. Agregação e categorias

Antes da coleta, `AggregationPolicyVersion` fixa:

- agregação dentro da unidade;
- tratamento de múltiplas partes/cenas por Content;
- agregação por case;
- macro, micro ou ambas;
- peso de case e categoria;
- cobertura/tamanho mínimo por categoria;
- estatística pareada e incerteza;
- tratamento de empate, missing e unidade inválida;
- regra de total e de cada categoria.

O relatório mostra por braço e delta pareado:

- amostra/denominador;
- score/label agregado;
- incerteza;
- cobertura;
- missing/inválidos;
- resultado total e por categoria.

Unidades, categorias, pesos, exclusões e função de agregação não mudam após observar resultados.

## 11. ThresholdPolicyVersion

```ts
type ThresholdPolicyVersionV2 = {
  policyVersion: string;
  datasetVersion: string;
  rubricVersion: string;
  aggregationPolicyVersion: string;
  metricPolicies: readonly {
    metricId: string;
    evidenceClass: "OFFLINE" | "LIVE_PROVIDER";
    unit: string;
    population: string;
    denominator: string;
    categories: readonly string[];
    missingDataRule: string;
    comparison: string;
    threshold: string;
  }[];
  regressionRule: "ANY_AGGREGATE_OR_CATEGORY_REGRESSION_REJECTS";
  approvalStatus: "DRAFT" | "APPROVED";
  policyHash: string;
};
```

Valores numéricos são definidos no protocolo aprovado, nunca inventados nesta SPEC. A policy é aprovada antes da coleta. Economia isolada não aprova. Regressão no agregado ou em categoria reprova, salvo exceção explícita do usuário registrada antes da coleta.

## 12. Métricas

### 12.1 Determinísticas/offline

- schema/cardinalidade/refs;
- factualidade objetiva e hard-gate decisions;
- scenes/gates/variety;
- Planner/Blueprint/compatibilidade;
- Risk policy/selection/fail-safe;
- D/N, partial/retry, quota, fencing e idempotência;
- hashes, seeds, coverage e reprodução.

### 12.2 Provider vivo

- todas as dimensões subjetivas da seção 8;
- chamadas lógicas e tentativas;
- coverage por capability/Judge;
- input/output/cache/reasoning tokens quando reportados;
- `usage.cost`, moeda, pricing source e completude;
- custo por Content entregue;
- latência por tentativa/capability e end-to-end, p50/p95;
- timeout, retry, fallback, repair e failure.

Ausência de usage/custo não é zero. Moedas incompatíveis não são somadas. `D_content=0` torna custo por Content `UNAVAILABLE`. Métrica live sem provider vivo é `UNAVAILABLE`, não inferida de fixture.

## 13. Missing data e invalidade

Estados:

```text
MISSING | NOT_APPLICABLE | UNAVAILABLE | PARTIAL |
NOT_EXECUTED | FAILED | NOT_ANNOTATED | INVALID
```

Hash, seed, assignment, fingerprint ou control mismatch crítico produz `INVALID`. Missing não crítico é reportado por case, categoria, braço, motivo e denominador. Exclusão pós-hoc é proibida.

### 13.1 Contrato-alvo do evaluator v2 — recorrência diferida

Nomenclatura confirmada com BackDev; estes requisitos descrevem o contrato aprovado do target/v2. A implementação offline do evaluator E6 foi revisada e verificada por testes; não há evidência de execução live nem aceitação.

- No freeze, recorrência usa `executionPolicy: DEFERRED`, `dependency: SLICE_008` e `requiredForAcceptance: true`.
- Na evidência, usa `executionStatus: NOT_EXECUTED` e `reason: DEPENDENCY_SLICE_008`; no relatório, `state: NOT_EXECUTED` e blocker `RECURRENCE_DEPENDS_ON_SLICE_008`. Esses valores não criam estados de Job.
- Métricas recorrentes são `UNAVAILABLE`; enquanto faltar evidência recorrente real, `verdict: INCOMPLETE` e `acceptanceStatus: V2_DEFAULT_PENDING_ACCEPTANCE`. Primeira geração ou recuperação bem-sucedida não removem esse bloqueio.
- Cases e unidades recorrentes continuam nos denominadores esperados. Não excluir, marcar `NOT_APPLICABLE`, imputar zero, fabricar snapshot/output nem gerar assignments humanos com conteúdo sintético; registrar a ausência das avaliações.
- Se a dependência for satisfeita ou evidência executada contrariar um freeze `DEFERRED`, esse freeze fica obsoleto: rejeitar fail-closed com `FREEZE_POLICY_CONFLICT`, sem reinterpretar a política, herdar aprovações ou promover o candidato. Exigir novo freeze com hashes, revisão Review/Architect e aprovações humanas pré-coleta.
- Versionar os contratos-alvo como `full-e6-freeze.v2`, `full-e6-preparation.v2` e `full-e6-report.v2`; preservar os artefatos v1 sem migração/reclassificação silenciosa. O bump não altera `draft.json`, rubrics, thresholds ou matriz, nem significa execução ou aprovação; a implementação offline dos contratos do evaluator foi verificada separadamente, sem declarar freeze, coleta, resultados ou aceitação.

### 13.2 Contrato v2 — manifests de routing e pricing do evaluator E6

Este contrato rege somente os artefatos importados offline pelo evaluator E6; sua validação foi implementada e verificada por testes, sem alterar engine, runtime, router ou provider. O freeze root adiciona `routingManifest`, `routingManifestHash`, `pricingManifest` e `pricingHash`; cada entrada de `arms` guarda somente `commit` e `engineVersion`. Os demais artefatos, controles e gates do freeze permanecem obrigatórios.

```ts
type ManifestHash = string; // SHA-256 lowercase, 64 caracteres
type E6Arm = "baseline" | "candidate";
type E6Tier = "LOW" | "MID" | "HIGH";

type Target = {
  provider: string;
  model: string;
  parametersHash: ManifestHash;
  priceId: string;
};

type RoutingManifest = {
  schemaVersion: "full-e6-routing.v2";
  routes: Array<{
    arm: E6Arm;
    capability: string;
    tier: E6Tier; // tier lógico solicitado, constante entre primary/fallbacks
    primary: Target;
    fallbacks: Target[]; // ordem pré-registrada; [] significa nenhum fallback
  }>;
};

type Rate = {
  numerator: string; // inteiro decimal >= 0
  denominator: string; // inteiro decimal > 0
}; // unidades monetárias menores por 1.000.000 de tokens

type PricingManifest = {
  schemaVersion: "full-e6-pricing.v2";
  currency: string; // código ISO 4217
  minorUnitExponent: number; // escala ISO da moeda, inteira
  prices: Array<{
    priceId: string;
    provider: string;
    model: string;
    sourceRef: string; // referência local opaca; sem URL, segredo ou fetch
    rates: {
      input: Rate | null;
      output: Rate | null;
      cache: Rate | null;
      reasoning: Rate | null;
    };
  }>;
};

type FreezeManifestFields = {
  routingManifest: RoutingManifest;
  routingManifestHash: ManifestHash;
  pricingManifest: PricingManifest;
  pricingHash: ManifestHash;
  arms: Record<E6Arm, { commit: string; engineVersion: string }>;
}; // projeção dos campos afetados; não substitui o restante do freeze
```

**Shape e referências:** rejeitar campos adicionais ou obrigatórios ausentes; exigir `routes` e `prices` não vazios, enums válidos, hashes lowercase de 64 caracteres e identificadores não vazios. Rotas são únicas por `(arm, capability, tier)`; dentro de cada rota, `(provider, model, parametersHash)` é único entre primary/fallbacks, sem ambiguidade de preço. `priceId` é único em `prices`; todo target resolve um preço existente com o mesmo provider/model. O contrato não amplia a fronteira de um provider do MVP nem autoriza diferenças entre braços não pré-registradas.

**Mesma política aprovada nos dois braços:** é obrigatório que as projeções de `routes` de baseline e candidate, removendo somente `arm` e preservando a ordem relativa das rotas, sejam iguais por `canonicalSerialization`. Isso exige o mesmo conjunto e ordem de rotas, com `capability`, tier lógico, primary e fallbacks ordered idênticos, incluindo provider/model/parametersHash/priceId; não ordenar arrays, retirar outros campos ou dispensar igualdade por pré-registro de diferenças do pipeline. `pricingManifest` é um snapshot único compartilhado pelos dois braços, com o mesmo `pricingHash`, moeda, escala e preços/rates aprovados, sem snapshot independente por braço. Divergência de política produz `INVALID`, sem comparação aprovada. O target efetivo permanece registrado por tentativa e pode diferir entre os braços dentro da mesma política autorizada; matching/fallback declarado não comprova execução nem ordem/motivo do fallback. Este requisito documental não alega suporte implementado; o evaluator v2 permanece sob verificação pelo BackDev.

**Tier e matching por tentativa:** `tier` é o tier lógico solicitado pela task conforme `ROUTER_MAP`, não o tier inferido do modelo de fallback; `Target` não contém tier. Para cada call executado, selecionar exatamente a rota por `(observation.arm, call.capability, call.tier)` e exigir correspondência exata de `(call.provider, call.model, call.parametersHash)` com um primary/fallback. Resolver `priceId` e validar provider/model do preço. O matching verifica admissibilidade e vínculo aos artefatos; não prova ordem, motivo ou legitimidade operacional do fallback, parâmetros realmente enviados ou execução live. Preservar também os checks de case/input, seed, controls e provenance; hash/provenance opacos não substituem a validação dos manifests.

**Moeda, rates e custo:** exigir código ISO 4217 e `minorUnitExponent` correspondente à escala ISO dessa moeda; código/escala desconhecidos ou divergentes são inválidos. Uma moeda por comparação, sem FX, soma entre moedas ou `/100` universal; valores usam a escala `10 ** minorUnitExponent`. Numerator aceita somente `0|[1-9][0-9]*`; denominator somente `[1-9][0-9]*`, sem float, expoente ou divisão por zero. Os quatro campos de rates são obrigatórios; `null` significa tarifa indisponível, nunca zero. Rates são snapshot pré-registrado em unidades monetárias menores por `1e6` tokens, não fórmula para recalcular custo do provider nem pressuposto de contadores disjuntos de input/cache/output/reasoning. Custo permanece `source: REPORTED`; ausência/incompletude de usage/custo mantém a métrica afetada `UNAVAILABLE`, sem imputação. Custo presente deve ter `currency` igual à do manifest e `pricingHash` igual ao hash verificado do manifest completo.

**Hash canônico e invalidade:** reutilizar [CANONICAL_SERIALIZATION_V1](../../../src/modules/commerce-intelligence/planner-harness/canonical.ts), sem JSON direto ou fetch de artefatos externos:

```ts
const routingManifestHash = sha256Hex(canonicalSerialization(routingManifest));
const pricingHash = sha256Hex(canonicalSerialization(pricingManifest));
const { freezeHash, approvals, ...plan } = freeze;
const expectedFreezeHash = sha256Hex(canonicalSerialization(plan));
```

Os manifests completos, os quatro campos root e todos os demais artefatos/hashes do plano entram no `freezeHash`; `approvals.frozenPlanHash` deve corresponder a ele. Keys seguem UTF-8/NFC e arrays preservam ordem, inclusive fallbacks; não ordenar, deduplicar ou reclassificar após aprovação. Hash/currency mismatch ou target não autorizado produz `INVALID`, sem delta válido; custo ausente/incompleto não invalida sozinho uma rota íntegra, mas não satisfaz a métrica. Freeze anterior sem os manifests ou alterado exige novo freeze/hashes, Review/Architect e aprovações humanas, sem upgrade silencioso ou aprovação herdada.

Um freeze bloqueado somente por `RECURRENCE_DEPENDS_ON_SLICE_008` pode verificar binding de pares já importados se todo o restante estiver íntegro, sem liberar coleta ou aceite. Observações pareadas de status misto falham primeiro na validação individual (`verifyObservation`); o check de par permanece defesa em profundidade. Nada neste contrato remove os denominadores recorrentes, substitui recorrência por `complete-after-partial` ou altera Slice 008, matriz, `draft.json`, rubrics ou thresholds. Sem URL/secret nos manifests, resolução remota de `sourceRef`, chamada/provider/coleta ou alegação de suporte implementado.


## 14. Relatório e aprovação

```ts
type EvalReportV2 = {
  reportId: string;
  reportVersion: string;
  protocolVersion: string;
  datasetVersion: string;
  manifestHash: string;
  thresholdPolicyVersion: string;
  aggregationPolicyVersion: string;
  baselineCommit: string;
  candidateCommit: string;
  pairFingerprints: readonly string[];
  evidenceClasses: readonly ("OFFLINE" | "LIVE_PROVIDER")[];
  metricsByCriterion: Record<string, unknown>;
  metricsByCategory: Record<string, unknown>;
  missingData: readonly unknown[];
  invalidPairs: readonly unknown[];
  verdict: "PASS" | "REJECT" | "INVALID" | "INCOMPLETE";
  reportHash: string;
  approvalStatus: "DRAFT" | "REVIEWED" | "APPROVED" | "REJECTED";
};
```

O relatório referencia artefatos/hashes suficientes para reprodução e não persiste segredo, cookie, token, PII desnecessária, dado cross-tenant ou payload bruto não redacted.

`APPROVED` exige:

1. freeze pré-coleta revisado por Review e Software Architect, com thresholds, exceções explícitas e teto de gasto aprovados pelo usuário ou autoridade humana responsável antes de qualquer chamada externa;
2. evidence offline e live completas nos critérios correspondentes, incluindo recorrência real após satisfazer a dependência do Slice 008; recorrência `NOT_EXECUTED` bloqueia `APPROVED` e `V2_ACCEPTED`;
3. revisão formal do Software Architect;
4. Review sem findings bloqueantes;
5. aceite explícito do usuário referenciando `reportHash`.

Esta SPEC não fornece nenhum desses resultados.

## 15. Critérios de aceite documental

- **AC6.1:** V2 default e aceitação pendente estão explícitos.
- **AC6.2:** ADR-029/`@1.2` é baseline fixada por commit.
- **AC6.3:** A/B end-to-end final, incluindo recorrência real, é obrigatória para `V2_ACCEPTED`; nesta fase recorrência é `NOT_EXECUTED`, dependente do Slice 008, sem substituição por `complete-after-partial`. Atribuições individuais são diagnósticos opcionais, não gate de aceite.
- **AC6.4:** evidence offline e provider vivo têm capacidades distintas.
- **AC6.5:** fixtures não satisfazem custo, latência ou qualidade semântica real.
- **AC6.6:** cada métrica subjetiva possui rubrica, unidade, labels/âncoras e evidência.
- **AC6.7:** há no mínimo duas avaliações independentes e cegas por unidade e adjudicação auditável.
- **AC6.8:** agregação total/por categoria e thresholds são pré-registrados.
- **AC6.9:** pares registram commit, provider/model/tier, params, prompts/contextos, seed, usage/custo/latência e cobertura.
- **AC6.10:** nenhum resultado, aprovação, runtime ou teste é criado por esta SPEC.

## 16. Gate de avanço

Antes de execução:

1. Review e Software Architect revisam SPEC, PLAN e **novas versões full E6** de manifesto/cases, rubricas, aggregation e threshold policies, com hashes, pré-registro e diferenças explícitas para v1; o pacote Judge reduction v1 `FROZEN` permanece intacto e não supre esse gate;
2. dataset e fixtures full E6 ficam `FROZEN` antes da coleta;
3. protocolo e manifest de diferenças são hashados;
4. provider/model/tier/params e artefatos de prompt/contexto são congelados;
5. assignments/cegamento/adjudicação são validados;
6. executor confirma separação offline/live;
7. nenhuma coleta ocorreu antes do pré-registro.
8. usuário ou autoridade humana responsável aprova thresholds, exceções explícitas e teto de gasto e autoriza a coleta antes de qualquer chamada externa; o executor bloqueia chamadas sem essas aprovações e interrompe a coleta ao atingir o teto, registrando incompletude, sem ampliar orçamento ou reduzir escopo silenciosamente;
9. credenciais ficam exclusivamente em ambiente/secret store seguro, nunca em chat, logs ou artefatos; avaliações e adjudicação permanecem humanas, independentes e cegas.

Até relatório e aceite explícito, o estado permanece `V2_DEFAULT_PENDING_ACCEPTANCE`.
