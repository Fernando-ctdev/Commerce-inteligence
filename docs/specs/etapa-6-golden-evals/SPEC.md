# SPEC — Etapa 6: Golden Dataset e Evals

**Identificador documental:** `etapa-6-golden-evals`

**Natureza:** precondição documental transversal do Slice 003; não é Slice de produto e não altera o Slice 004.

**Status:** `DOCUMENTATION_ONLY` — define o protocolo de aceitação; não executa dataset, fixture, provider, anotação, benchmark, E6, relatório ou cutover.

**Runtime atual:** Engine V2 default por decisão do usuário, efetiva no commit `8d1833b`, no estado `V2_DEFAULT_PENDING_ACCEPTANCE`. ADR-029/`@1.2` permanece baseline histórico/experimental reproduzível. Esta SPEC não declara resultado, não-regressão, aprovação ou rollback.

O loader de Skill da V2 no commit `8d1833b` usa `@1.2`; `@1.3` no Planner provém de fixture congelada do harness, **não** é binding operacional comprovado. A consistência `@1.3` permanece contrato-alvo de aceite, conforme [ADR-033 §7](../../architecture/adr-033-determinismo-llm-e-creative-system.md).

## 1. Objetivo e fronteira

E6 deve produzir evidência auditável para:

1. comparar end-to-end ADR-029/`@1.2` e V2/`@1.3`;
2. atribuir efeito às migrações individuais do ADR-033;
3. avaliar primeira geração e recorrência;
4. medir invariantes, qualidade, custo, latência e cobertura;
5. permitir ao Review reprovar protocolo, execução, relatório ou candidato antes de qualquer correção de runtime.

Esta SPEC não cria capability, endpoint, estado de Job, worker, serviço, tabela, migration, adapter, flag ou persistência. Não corrige writer, memória, Skill, prompt, Risk ou Judge.

## 2. Fontes e precedência

1. Nota imutável “Plano de recalibração da commerce inteligence”.
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
| Candidato E6 integral | V2 final com `@1.3` operacional consistente, alvo pendente fixado por commit; não confundir com o binding atual da fixture Planner |
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

**Diferença de contrato para E6 integral:** versionar e hashar novos manifesto/cases/fixtures, rubricas por dimensão/unidade com âncoras e dupla anotação cega, aggregation policy por categoria, threshold policy para end-to-end e atribuições, protocolo/comparabilidade de provider e classes de evidência. Aprovar e congelar esse **novo conjunto** antes da coleta; registrar relação e diferenças explícitas com v1. `FROZEN` de v1 não é herança de cobertura, thresholds ou aprovação full.

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

Experimentos de atribuição alteram uma única variável declarada. Diferença não pré-registrada, mudança de provider/model/version/params, prompt/contexto ausente, seed divergente ou cobertura incompatível invalida o par ou a métrica afetada conforme policy.

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

## 7. Experimentos obrigatórios

### 7.1 End-to-end

- ADR-029/`@1.2` por commit versus V2 final/`@1.3` por commit;
- primeira geração e recorrência;
- execução offline dos invariantes e execução com provider vivo das métricas operacionais/semânticas.

### 7.2 Atribuição

- Product Understanding/Strategy LLM versus Facts + Discovery + Strategy determinística;
- Plan LLM versus Planner V2;
- Scene Ideas versus Scene Skeleton;
- Judge-all versus Risk-gated;
- catálogo versus Blueprint;
- recipe-backed versus composição livre;
- Skill 1.2 versus 1.3;
- tier por capability.

Cada atribuição possui protocolo/fingerprint próprios. Resultado end-to-end não substitui atribuição e vice-versa.

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

Cada unidade recebe no mínimo duas avaliações humanas independentes e cegas. O anotador não recebe braço, commit, provider, modelo, tier, reasoning, custo, latência, retries, Risk, Judge runtime ou resultado esperado.

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

1. protocolo e thresholds aprovados antes da coleta;
2. evidence offline e live completas nos critérios correspondentes;
3. revisão formal do Software Architect;
4. Review sem findings bloqueantes;
5. aceite explícito do usuário referenciando `reportHash`.

Esta SPEC não fornece nenhum desses resultados.

## 15. Critérios de aceite documental

- **AC6.1:** V2 default e aceitação pendente estão explícitos.
- **AC6.2:** ADR-029/`@1.2` é baseline fixada por commit.
- **AC6.3:** end-to-end e atribuições estão separados.
- **AC6.4:** evidence offline e provider vivo têm capacidades distintas.
- **AC6.5:** fixtures não satisfazem custo, latência ou qualidade semântica real.
- **AC6.6:** cada métrica subjetiva possui rubrica, unidade, labels/âncoras e evidência.
- **AC6.7:** há no mínimo duas avaliações independentes e cegas por unidade e adjudicação auditável.
- **AC6.8:** agregação total/por categoria e thresholds são pré-registrados.
- **AC6.9:** pares registram commit, provider/model/tier, params, prompts/contextos, seed, usage/custo/latência e cobertura.
- **AC6.10:** nenhum resultado, aprovação, runtime ou teste é criado por esta SPEC.

## 16. Gate de avanço

Antes de execução:

1. Review aprova SPEC, PLAN e **novas versões full E6** de manifesto/cases, rubricas, aggregation e threshold policies, com hashes, pré-registro e diferenças explícitas para v1; o pacote Judge reduction v1 `FROZEN` permanece intacto e não supre esse gate;
2. dataset e fixtures full E6 ficam `FROZEN` antes da coleta;
3. protocolo e manifest de diferenças são hashados;
4. provider/model/tier/params e artefatos de prompt/contexto são congelados;
5. assignments/cegamento/adjudicação são validados;
6. executor confirma separação offline/live;
7. nenhuma coleta ocorreu antes do pré-registro.

Até relatório e aceite explícito, o estado permanece `V2_DEFAULT_PENDING_ACCEPTANCE`.
