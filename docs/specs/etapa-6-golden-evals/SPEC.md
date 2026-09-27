# SPEC — Etapa 6: Golden Dataset e Evals

**Identificador documental:** `etapa-6-golden-evals`

**Natureza:** precondição documental transversal do Slice 003; não é Slice de produto, não cria, renumera ou reutiliza o Slice 004.

**Status:** `DOCUMENTATION_ONLY` — esta SPEC congela contratos de avaliação, fronteiras, pré-registro e critérios de aprovação. Não autoriza dataset real, fixture/harness, provider, benchmark, A/B, relatório de resultados, alteração de runtime ou cutover.

**Autoridade superior:** a nota imutável **“Plano de recalibração da commerce inteligence”**. Seu conteúdo não é copiado nem reinterpretado nesta SPEC; conflito contra a nota permanece bloqueado para decisão superior.

**Runtime vigente:** ADR-029 integralmente; `tiktok-commerce@1.2` em produção; `@1.3` inativa; `ContentSceneSet` separado; gates, Judge, repairs, quota, Tenant, Job, D/N, parcial e retry preservados.

## 1. Objetivo e fronteira

Esta SPEC define o contrato documental para uma futura avaliação reproduzível da Commerce Intelligence:

- manifesto, cases, fixtures e rubricas versionados, redacted e hashados;
- seed derivado do Job, derivação versionada e fingerprint reproduzível;
- assignment cego e adjudicação separados do `CONTENT_QUALITY_JUDGE` runtime;
- missing data, incompatibilidade de hash, seed ou assignment com comportamento fail-closed;
- `ThresholdPolicyVersion` pré-registrada sem valores inventados nesta SPEC;
- baseline ADR-029/`@1.2` fixado por commit e candidato de uma única variável: regra de invocação/cobertura do Judge reduction;
- métricas por categoria, denominadores explícitos, custo conforme ADR-013, latência e cobertura de missing;
- relatório reproduzível, revisão arquitetural e aprovação explícita do usuário antes de qualquer efeito.

Esta SPEC não cria capability de produto, endpoint, estado de Job, worker, serviço, tabela, migration, schema de produção, provider adapter, persistência, flag, capability de Judge reduction, Blueprint/recipe, `creativeDirection` ou alteração de Skill.

### 1.1 Não objetivos

Ficam fora desta SPEC:

- executar dataset, fixture, harness, provider, benchmark, anotação, A/B, smoke ou cutover;
- gerar relatório de resultados, veredito de não-regressão ou recomendação operacional;
- ativar `@1.3`, Creative System, Blueprint/recipe ou Judge reduction;
- alterar ADRs, PRDs, SYSTEM-DESIGN, DESIGN, nota imutável, código, SLICES além da referência documental mínima separada, quota ou persistência;
- escolher valores numéricos de thresholds, quantidade de anotadores, score mínimo, margem ou concordância sem protocolo aprovado;
- tratar harness estrutural do Planner como evidência operacional de factualidade, naturalidade, cenas, Judge, custo ou latência.

## 2. Fontes e precedência

1. Nota imutável “Plano de recalibração da commerce inteligence”.
2. [PRD principal](../../product/PRD.md) e PRDs de frente relevantes.
3. [SYSTEM-DESIGN](../../architecture/SYSTEM-DESIGN.md).
4. ADRs vinculantes:
   - [ADR-013 — Model Router e IntelligenceTier](../../architecture/adr-013-model-router-e-intelligence-tier.md);
   - [ADR-019 — Gate versionada, variedade funcional e ContentSceneSet](../../architecture/adr-019-gate-versionada-e-cenas.md);
   - [ADR-021 — Geração parcial declarada e retry dos faltantes](../../architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md);
   - [ADR-029 — Pipeline híbrida determinística e criativa](../../architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md);
   - [ADR-033 — Determinismo × LLM e Creative System](../../architecture/adr-033-determinismo-llm-e-creative-system.md).
5. [SLICES](../../delivery/SLICES.md), especialmente Slice 003 e Slice 004.
6. [SPEC da Etapa 4](../etapa-4-skill-brief/SPEC.md) e [PLAN da Etapa 4](../../plans/etapa-4-skill-brief/PLAN.md).
7. [SPEC da Etapa 5](../etapa-5-risk-quality/SPEC.md) e [PLAN da Etapa 5](../../plans/etapa-5-risk-quality/PLAN.md).
8. [requisitos da Etapa 6](../../../.gstack/etapa6-requisitos.md) e [decisões da Etapa 6](../../../.gstack/etapa6-decisoes.md).

A precedência operacional continua sendo: nota imutável → PRDs → SYSTEM-DESIGN → ADRs → PRINCIPLES → DESIGN → SLICES → SPEC/PLAN. Esta SPEC não altera fontes superiores.

## 3. Identidade e dependência do Slice 003

A identidade estável é `etapa-6-golden-evals`.

A Etapa 6 é precondição documental transversal do Slice 003. O Slice 003 continua responsável pela primeira geração até Briefings, incluindo delivery objetivo, D/N, parcial e retry conforme ADR-021. O Slice 004 continua responsável por revisão, edição, aprovação, descarte e versionamento de Content.

A Etapa 6 não recebe User Outcome, não cria domínio de produto, não recebe ownership de creator, não cria um novo Slice e não altera o escopo do Slice 004. Qualquer execução ou mudança de contrato relacionada ao Golden Dataset, fixtures, rubricas, anotação cega, Judge reduction ou A/B exige SPEC/PLAN aprovados, protocolo versionado e gates deste documento.

## 4. Baseline imutável de runtime

Enquanto não houver protocolo de cutover aprovado, A/B operacional válido, relatório reproduzível e aprovação formal:

- ADR-029 é o único runtime autorizado;
- `tiktok-commerce@1.2` é o binding de produção; `@1.3` permanece inativa;
- `ContentSceneSet` permanece separado de `ContentBriefVersion`; Brief novo não recebe `scenes`;
- `BriefValidationReport` permanece objetivo e retorna `PASS|REPAIR|REJECT`;
- hard gates continuam server-side e autoridade de elegibilidade;
- `CONTENT_QUALITY_JUDGE` continua após hard gates e retorna `PASS|REVIEW` por Content/parte somente quando executado;
- `JudgeExecution=NOT_EXECUTED|FAILED` nunca produz `PASS` ou `REVIEW` sintético;
- Hard Gate Repair continua antes do Judge, limitado por `GENERATION_MAX_REPAIRS` vigente;
- Semantic Part Repair continua no máximo uma vez por parte `REVIEW`, sem re-Judge;
- `REVIEW`, ausência de Judge e `RiskAssessment` advisory não criam F nem determinam parcial;
- quota, Tenant, Job, reservation, fencing, idempotência, D/N, `SUCCEEDED_PARTIAL`, `FAILED` e retry continuam os contratos de ADR-021 e Slice 003;
- Blueprint/recipe, Creative System e `creativeDirection` continuam fixture/harness-only e não são input do runtime `@1.2`.

## 5. Artefatos de avaliação

Os contratos desta seção são artefatos offline/futuros de avaliação, não contratos de produção. Mudança de shape, semântica, registry, policy, rubric, case, fixture, ordem ou expectativa exige bump de versão, novos hashes e novo protocolo.

### 5.1 Manifesto versionado

```ts
type GoldenDatasetManifestV1 = {
  datasetId: "commerce-intelligence-golden";
  datasetVersion: string;
  schemaVersion: "golden-case.v1";
  rubricVersion: string;
  thresholdPolicyVersion?: string;
  hashAlgorithm: "SHA-256";
  manifestHash: string;
  caseIds: readonly string[];
  categories: readonly string[];
  status: "DRAFT" | "FROZEN" | "RETIRED";
};
```

Invariantes:

- somente `FROZEN` é elegível para protocolo de eval operacional futuro;
- `DRAFT` serve apenas para revisão; `RETIRED` permanece rastreável e não é baseline;
- `manifestHash` cobre versão, schema, rubrica, policy, categorias, ordem dos casos e hashes de fixtures/cases;
- caso removido não é reescrito; nova seleção recebe nova versão;
- manifesto sem hash ou com hash divergente falha fechado.

### 5.2 Case e fixture redacted

```ts
type GoldenCaseV1 = {
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

1. Product Facts, evidence, creator context, memory e provider responses são projeções mínimas, allowlisted e redacted. Não incluem segredo, cookie, token, PII desnecessária, URL viva, dado cross-tenant ou payload bruto.
2. `tenantId`, ownership, quota, reservation, status, comando, ID de produção ou saída do provider nunca são autoridade de fixture.
3. IDs de case, Product, Content e Job são estáveis de fixture e não IDs de produção.
4. Factos e evidências têm hashes próprios; o caso aponta para snapshot fechado, não banco corrente.
5. `providerResponses` é replay offline de resposta já fixtureada; sua existência não autoriza chamada a provider.
6. Fixtures usam JSON canônico UTF-8, newline e ordem de chaves/arrays definidas, sem relógio, UUID aleatório, rede, variável ambiental ou aleatoriedade implícita.
7. Texto literal de catálogo usado para avaliar templating fica redacted e controlado, fora do contexto normal de produção.
8. Falha de redaction, hash ausente, referência órfã ou snapshot incompatível torna o case inelegível.

### 5.3 Expectativas e cobertura

Cada case declara versões de expectativa e policy, códigos allowlisted e evidências de suporte. Texto livre não é ground truth.

A matriz do manifesto deve cobrir, com cenários felizes, de fronteira, adversariais e de falha:

| Categoria | Evidência mínima | Autoridade |
|---|---|---|
| `FACTUALITY` | claims suportados, `UNSUPPORTED`, `CONTRADICTED`, refs órfãs e inferências seguras | hard gate/evidence server-side; rubrica mede concordância |
| `HARD_GATES` | schema, ownership, cardinalidade, evidence, CTA, duplicata, variedade e códigos de `PASS|REPAIR|REJECT` | gate objetivo |
| `SCENES` | `ContentSceneSet`, `AVAILABLE|FILTERED|ERROR`, mínimo, ação, âncora, backfill e erro | policy de scenes |
| `VARIETY` | mecanismos, CTA, ângulos, duplicatas, `structureHash`, ordem e D revalidado | gate objetivo |
| `NATURALNESS` | fluidez, clareza e adequação em rubric cega | anotação offline |
| `TEMPLATING` | percepção de fórmula, repetição literal/normalizada e evidência | anotação offline; não hard reject |
| `SEMANTIC_COHERENCE` | alinhamento entre hook, development, script, CTA, scenes, Produto e creator | Judge/rubric, sem autoridade de publicação |
| `RISK` | proveniência, cobertura, severidade advisory e distinção entre sinal e gate | RiskAssessment advisory |
| `PARTIAL_RETRY` | D/N, F/CAP vigente, residual, reservation, retry, fencing e idempotência | ADR-021/Job |
| `COST_LATENCY` | chamadas efetivas, tokens, `usage.cost`, moeda, custo por D, timeout e p50/p95 | ADR-013/telemetria |
| `TENANT_IDEMPOTENCY` | isolamento, owner, replay, CAS, fencing, quota e persistência | contratos de plataforma |

O dataset deve incluir as bordas já vigentes de cardinalidade, batches, D/N, falha e retry, sem criar novos limites.

### 5.4 Rubricas versionadas

```ts
type GoldenRubricV1 = {
  rubricId: string;
  rubricVersion: string;
  dimension:
    | "FACTUALITY"
    | "HARD_GATE"
    | "SCENE"
    | "VARIETY"
    | "NATURALNESS"
    | "TEMPLATING"
    | "SEMANTIC_COHERENCE"
    | "RISK";
  unit: "CASE" | "CONTENT" | "PART" | "CLAIM" | "SCENE" | "JOB";
  labels: readonly string[];
  evidenceRequired: boolean;
  blind: boolean;
  adjudicationPolicyVersion: string;
};
```

A rubric declara definição operacional, labels permitidos, `NOT_ANNOTATED` quando aplicável, evidência mínima, conflito, adjudicação, exemplos positivos/negativos/limítrofes e relação com hard gate/Judge. Nenhum número de anotadores, acordo, margem ou score é escolhido nesta SPEC.

## 6. Seed, derivação e fingerprint

O runtime atual não recebe alteração para introduzir seed nesta etapa. Um protocolo operacional futuro deve registrar antes da coleta:

- `seedDerivationVersion`;
- entrada canônica baseada no `jobId` lógico e contexto do par;
- seed resultante por par/case;
- algoritmo e hash da derivação;
- seed de replay offline para fixtures e assignments.

O mesmo `jobSeed` é usado nos dois braços do par. Não se usa timestamp, `Math.random`, UUID ou seed não verificável.

Fingerprint mínimo do par:

```text
pairFingerprint = H(
  protocolVersion,
  datasetVersion + manifestHash,
  caseId + caseHash + inputHash,
  baselineCommit + candidateCommit,
  engine/schema/gate/rubric policy versions,
  platformSkillVersion + SkillBinding,
  model/tier,
  prompt/context hashes,
  seedDerivationVersion + jobSeed,
  thresholdPolicyVersion
)
```

O fingerprint usa serialização canônica. Mismatch de dataset, case, input, policy, rubric, seed, commit, binding, modelo, tier, prompt, contexto ou threshold invalida o par antes do resultado.

## 7. Assignment cego e JudgeExecution

### 7.1 Assignment cego

O assignment é artefato offline independente:

```ts
type BlindAssignmentV1 = {
  assignmentId: string;
  caseId: string;
  opaqueArmId: string;
  opaqueAnnotatorId: string;
  rubricVersion: string;
  assignmentSeed: string;
  assignmentHash: string;
  status: "ASSIGNED" | "ANNOTATED" | "ADJUDICATED" | "INVALID";
};
```

O anotador não recebe braço, provider, modelo, tier, reasoning, custo, latência, retries, RiskAssessment, resultado esperado ou decisão runtime. O mapeamento de `opaqueArmId` fica fora da visão do anotador. Vazamento, duplicidade, rubric divergente, seed incompatível ou hash inválido torna o assignment `INVALID`.

### 7.2 Judge runtime

```text
JudgeExecution = EXECUTED | NOT_EXECUTED | FAILED | NOT_APPLICABLE
JudgeResult = PASS | REVIEW somente quando JudgeExecution=EXECUTED
```

Anotação cega nunca preenche `JudgeResult`. `NOT_EXECUTED` e `FAILED` entram na cobertura; não produzem `PASS`, `REVIEW`, finding semântico ou repair sintético. Quando `sources.judge=NOT_EXECUTED`, RiskAssessment deve ser `PARTIAL|UNAVAILABLE`, nunca `AVAILABLE` por síntese. Adjudicação offline não altera Brief, Content, Job, quota, D/F ou publicação.

## 8. Missing data e fail-closed

Estados permitidos:

```text
MISSING | NOT_APPLICABLE | UNAVAILABLE | PARTIAL |
NOT_EXECUTED | FAILED | NOT_ANNOTATED | INVALID
```

Regras:

- hash ausente/divergente de manifesto, case, input, fixture, policy, rubric, assignment, output ou threshold → `INVALID`;
- seed ausente/divergente/não derivado pela versão registrada → `INVALID`;
- assignment não cego, não adjudicado ou incompatível → `INVALID`;
- custo incompleto, moeda incompatível ou `usage.cost` ausente → `UNAVAILABLE|PARTIAL`, nunca zero inventado;
- `NOT_APPLICABLE` só é válido quando declarado no case e aceito pela policy anterior à coleta;
- scenes ausentes, `FILTERED`, `ERROR` e backfill permanecem distintos;
- missing crítico de Tenant, quota, idempotência, fencing, persistência, factualidade objetiva ou publicação falha fechado;
- nenhuma exclusão de missing pode ser decidida após observar o resultado; denominador e regra devem estar em `ThresholdPolicyVersion`.

Invalididade que comprometa o pareamento impede veredito do relatório. Missing não crítico é reportado por case, categoria, braço, motivo e denominador.

## 9. ThresholdPolicyVersion

A policy é artefato obrigatório e versionado, mas esta SPEC não inventa valores numéricos.

```ts
type ThresholdPolicyVersionV1 = {
  policyVersion: string;
  datasetVersion: string;
  rubricVersion: string;
  metricPolicies: readonly {
    metricId: string;
    denominator: string;
    population: string;
    unit: string;
    missingDataRule: string;
    threshold: string;
    comparison: string;
  }[];
  categoryPolicy: readonly string[];
  regressionRule: "ANY_AGGREGATE_OR_CATEGORY_REGRESSION_REJECTS";
  approvalStatus: "DRAFT" | "APPROVED";
  policyHash: string;
};
```

Antes de qualquer coleta, a policy aprovada deve declarar valores, denominadores, categorias, unidade monetária, incerteza, exclusões, missing data, comparação e regra de reprovação para factualidade, gates, scenes, variety, naturalidade, templating, risco, partial/retry, chamadas, tokens, custo, completude e latência p50/p95.

Regras já fixadas:

- qualquer regressão no agregado ou em qualquer categoria reprova;
- economia isolada não aprova;
- ausência de policy aprovada invalida a execução;
- `D=0` ou custo incompleto não vira zero para satisfazer threshold.

## 10. Protocolo pareado futuro

### 10.1 Baseline

O baseline é ADR-029 por commit/engine version fixado, com `@1.2`, mesmo SkillBinding, `platformSkillVersion`, modelo/tier, prompts/context hashes, schema, gate, cardinalidade, scenes, hard gates, repairs, quota, Job/persistência, retries e seed do par.

### 10.2 Candidato

O candidato declara exatamente uma variável independente: a regra de invocação/cobertura do `CONTENT_QUALITY_JUDGE` (Judge reduction). RiskAssessment, Blueprint/recipe, scenes, tier, SkillBinding, modelo, hard gates, repairs, inputs, memory, quota, retry e persistência permanecem constantes.

Não é permitido comparar `@1.2` com `@1.3` no A/B comum; `@1.3` permanece inativa. Mudança de tier, Skill, scenes, Blueprint, RiskAssessment ou repair exige protocolo separado, não é este candidato.

Parte não chamada registra `JudgeExecution=NOT_EXECUTED`; não recebe resultado semântico, `PASS`, `REVIEW` ou repair por inferência.

### 10.3 Precheck

Antes da coleta, cada par valida:

- manifesto `FROZEN` e `manifestHash`;
- case/input/fixture/policy/rubric hashes;
- baseline/candidate commits;
- mesmo SkillBinding, `@1.2`, modelo/tier e contexto;
- seed derivation, job seed e fingerprint;
- threshold/missing policies aprovadas;
- assignment cego e mapping protegido.

Qualquer falha é `PRECHECK_INVALID`, sem métrica de aprovação e sem relatório de resultados.

## 11. Métricas e denominadores

Toda métrica registra versão, case, categoria, braço, população, denominador, exclusões, missing data, policy hashes e unidade. O relatório futuro contém agregado e categoria; regressão de qualquer critério/categoria reprova conforme policy aprovada.

Métricas mínimas:

- factualidade: claims suportados, `UNSUPPORTED`, `CONTRADICTED`, refs órfãs e agreement adjudicado;
- hard gates: decisões e códigos observados versus esperados;
- scenes: status, mínimo, generated/dropped, backfill e errors;
- variety: violações, duplicatas, buckets, `structureHash` e D revalidado;
- naturalidade/templating/coerência: labels, agreement, adjudicação e `NOT_ANNOTATED`;
- risco: coverage/status, findings e proveniência advisory;
- partial/retry: D/N, F/CAP vigente, terminal state, residual, reservation, fencing e idempotência;
- Judge: `EXECUTED`, `NOT_EXECUTED`, `FAILED`, `NOT_APPLICABLE`, `PASS|REVIEW` somente no executado, repairs efetivos;
- custo/latência: chamadas lógicas/efetivas, tokens, `usage.cost` primário, moeda, custo por D, completude, timeout e p50/p95.

Conforme ADR-013, ausência de `usage.cost` não é `USD 0`, moedas incompatíveis não são somadas e `cost_per_valid_content` usa `D_content` objetivo como denominador; D=0 é `UNAVAILABLE`. Cenas de backfill são reportadas separadamente e não entram em D_content.

## 12. Relatório reproduzível e aprovação

O relatório futuro é versionado, sanitizado e hashado. Deve reconstruir por referências/hashes: manifesto, cases, fixtures, rubricas, thresholds, inputs, Product Facts/evidence, creator/memory, commits, SkillBinding, modelo/tier, prompts/context, seed, assignments, adjudicações, JudgeExecution, outputs observados, métricas, denominadores, missing e custo/latência.

Payload bruto de provider, segredo, token, cookie, PII desnecessária e dado cross-tenant não são persistidos no relatório.

Envelope mínimo:

```ts
type EvalReportV1 = {
  reportId: string;
  reportVersion: string;
  protocolVersion: string;
  datasetVersion: string;
  manifestHash: string;
  thresholdPolicyVersion: string;
  baselineCommit: string;
  candidateCommit: string;
  pairFingerprints: readonly string[];
  seedDerivationVersion: string;
  metricsByCriterion: Record<string, unknown>;
  metricsByCategory: Record<string, unknown>;
  missingData: readonly unknown[];
  invalidPairs: readonly unknown[];
  verdict: "PASS" | "REJECT" | "INVALID" | "INCOMPLETE";
  reportHash: string;
  approvalStatus: "DRAFT" | "REVIEWED" | "APPROVED" | "REJECTED";
  reviewedBy?: string;
  approvedByUser?: string;
};
```

`APPROVED` exige revisão do Software Architect e aprovação explícita do usuário. Sem ambos:

- o experimento não existe para supersede;
- nenhum candidato entra no runtime;
- nenhum tier, chamada, scene, gate, repair, Skill, Blueprint, quota, Job ou persistência muda;
- ADR-029 e `@1.2` permanecem vigentes integralmente.

## 13. Critérios de aceite

- **AC6.1 — Identidade:** `etapa-6-golden-evals` é precondição documental do Slice 003; não há Slice 004 novo, renumerado ou reutilizado.
- **AC6.2 — Artefatos:** manifesto, case, fixture, expectativa e rubric são versionados, redacted, hasháveis e separados de produção.
- **AC6.3 — Determinismo:** seed Job/derivation, serialização canônica e fingerprint são obrigatórios; incompatibilidade falha fechado.
- **AC6.4 — Cegamento:** assignment cego, anotação/adjudicação e `JudgeExecution` têm contratos e denominadores distintos.
- **AC6.5 — Missing:** missing, hash, seed e assignment incompatíveis não produzem PASS, zero, veredito ou exclusão silenciosa.
- **AC6.6 — Threshold:** `ThresholdPolicyVersion` é obrigatória e aprovada antes da coleta; esta SPEC não fixa números.
- **AC6.7 — Par:** baseline ADR-029/`@1.2` é fixado por commit; candidato altera somente a cobertura/invocação do Judge reduction.
- **AC6.8 — Métricas:** categorias, denominadores, custo ADR-013, D_content, moeda, p50/p95 e missing são reportados agregado e por categoria.
- **AC6.9 — Relatório:** relatório reproduzível contém hashes, commits, seeds, métricas, missing, veredito e aprovação Architect+usuário.
- **AC6.10 — Limites:** esta SPEC não executa dataset real, fixture/harness, provider, benchmark, A/B, relatório de resultados ou cutover; não altera ADR-029, `@1.2`, scenes, gates, Judge, repairs, quota, Tenant, Job, D/N, parcial ou retry.

## 14. Gate de avanço

Antes de qualquer execução futura:

1. confirmar a nota imutável e resolver divergência contra ela;
2. aprovar esta SPEC e o PLAN correspondente;
3. redigir e congelar manifesto, cases, fixtures, rubricas, redaction e hashes;
4. aprovar `ThresholdPolicyVersion` e missing policy antes da coleta;
5. aprovar derivação de seed Job, fingerprint e assignment cego;
6. fixar baseline por commit e candidato de variável única;
7. separar eval estrutural, anotação cega e A/B operacional;
8. obter revisão arquitetural, relatório reproduzível e aprovação explícita do usuário antes de qualquer efeito.

Até lá, o único runtime permitido é ADR-029 integral com `@1.2` e os contratos atuais.
