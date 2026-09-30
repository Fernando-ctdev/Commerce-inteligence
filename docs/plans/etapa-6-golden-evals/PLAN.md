# Etapa 6 — Golden Dataset e Evals Documentation Plan

> **Para agentes:** documentation-only. Não execute dataset, fixture, provider, benchmark, anotação, E6 ou cutover a partir deste plano.

**Goal:** preparar avaliação integral auditável de ADR-029/`@1.2` versus Engine V2 final com binding `@1.3` consistente **ainda pendente**, sem declarar resultado ou aceitação.

**Architecture:** E6 usa runner isolado para baseline fixada por commit, validação offline dos invariantes e execução pareada com provider vivo para métricas operacionais e qualidade semântica. Rubricas, cegamento, adjudicação, agregação e thresholds são pré-registrados.

**Tech Stack:** Markdown nesta alteração. Nenhum código, provider, teste ou schema modificado.

**Spec:** [`docs/specs/etapa-6-golden-evals/SPEC.md`](../../specs/etapa-6-golden-evals/SPEC.md)

## Global Constraints

- Engine V2 permanece default em `V2_DEFAULT_PENDING_ACCEPTANCE`.
- ADR-029/`@1.2` permanece baseline histórico/experimental.
- No commit `8d1833b`, loader runtime usa `@1.2` e Planner V2 usa `@1.3` de fixture harness; V2 default não prova binding operacional `@1.3`.
- O [call map estático da Etapa 1](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/baseline-call-map.md) documenta essas superfícies e chamadas lógicas; chamadas físicas, tokens, custo e latência observados seguem `UNAVAILABLE` sem execução real.
- [`manifest.json`](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/manifest.json) `FROZEN` `golden-dataset.v1`, [`rubrics.json`](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/rubrics.json) `golden-rubric.v1` e [`threshold-policy.json`](../../../src/modules/commerce-intelligence/evaluation/golden-dataset/threshold-policy.json) `THRESHOLD_POLICY_GOLDEN_V1` pertencem somente ao experimento offline parcial Judge reduction; não são o pacote nem aprovação full E6. Preservá-los sem alteração.
- Falha/incompletude de E6 não faz rollback implícito.
- A/B end-to-end do conjunto final, conduzida pelo usuário após concluir as Etapas 2–6, é obrigatória para `V2_ACCEPTED`; atribuições por variável são opcionais e somente se o usuário solicitar diagnóstico. Nenhuma A/B será executada por nós agora.
- Fixtures/replay offline não satisfazem custo, latência, usage ou qualidade semântica real.
- Provider vivo pareado é obrigatório para essas métricas.
- Quota, Tenant, Job, D/N, partial, retry, fencing e idempotência permanecem invariantes.
- Não inventar thresholds, resultados, aprovação ou não-regressão.
- Não alterar PRDs, ADRs, DESIGN, nota, código ou testes.

---

## 1. Arquivos e fronteiras

| Arquivo | Responsabilidade |
|---|---|
| `docs/specs/etapa-6-golden-evals/SPEC.md` | protocolo, evidência, rubricas, comparabilidade, métricas e aceite |
| `docs/plans/etapa-6-golden-evals/PLAN.md` | sequência documental e gates de Review |
| `docs/delivery/SLICES.md` | Etapa 6 transversal sob Slice 003 |

Etapa 6 não cria Slice nem move revisão/controle do Slice 004.

## 2. Sequência documental

### Task 1 — Fixar estados e escopo

- [ ] Registrar V2 como default, aceitação pendente.
- [ ] Fixar ADR-029/`@1.2` como baseline por commit.
- [ ] Registrar V2 final com `@1.3` operacional consistente como candidato futuro por commit; não inferir essa consistência ponta a ponta apenas do loader ativo, pois o binding do Planner ainda é `frozen-harness-fixture`.
- [ ] Separar primeira geração e recorrência.
- [ ] Bloquear alegação de resultado/aceite a partir de documentação.

**Gate:** Review pode reprovar qualquer frase que recoloque ADR-029 em produção ou trate pendência V2 como implementada.

### Task 2 — Congelar **novas versões full E6** de manifesto/cases/fixtures, rubricas e thresholds

- [ ] Registrar diferenças para v1: manifesto `golden-dataset.v1` congelado com `golden-case.v1` versus novo conjunto end-to-end/atribuições; rubrica v1 apenas `NATURALNESS`/`CONTENT` versus dimensões, unidades, âncoras e dupla anotação cega; threshold v1 `risk-assessment.v1`/`JUDGE_EXECUTED_CONTENTS`/Judge reduction versus policies full por categoria, agregação, evidência e missing.
- [ ] Versionar novos dataset, rubricas, aggregation/threshold policies e categorias; preservar v1 sem reescrita e sem herdar `FROZEN` como aceite.
- [ ] Redactar Product Facts, evidence, creator context, memória e replay.
- [ ] Usar canonical JSON UTF-8, SHA-256, IDs estáveis e hashes.
- [ ] Exigir **novo manifesto full E6** `FROZEN` e rubricas/aggregation/thresholds hashados e aprovados antes da coleta.

**Gate:** `FROZEN` v1 comprova apenas o escopo parcial Judge reduction, não o pacote full. Fixture sem hash, redaction ou proveniência é inelegível; replay não vira provider vivo.

### Task 3 — Congelar protocolo comparável

Por braço, registrar antes da coleta:

- commit/engine version;
- provider/model ID/version/tier;
- parâmetros efetivos, reasoning, temperature, top-p, max tokens, response/schema mode, timeout, retry, fallback;
- Skill/binding, Creative System, contratos e policies;
- prompt/instruction e contexto por bytes/hash;
- Facts/evidence, creator context, memória e dataset por bytes/hash;
- seed/derivation e pair fingerprint;
- capabilities, cobertura e tentativas;
- usage/tokens, pricing source, moeda/custo, latência e completude.

No end-to-end, congelar controles externos e registrar diferenças inerentes entre braços. Atribuições mudam uma variável. Diferença não pré-registrada invalida o par ou a métrica afetada.

### Task 4 — Pré-registrar rubricas e thresholds

Para cada dimensão subjetiva:

- [ ] Definir pergunta, unidade, escala/labels e âncoras.
- [ ] Exigir evidência mínima e regra `NOT_ANNOTATED`.
- [ ] Definir ao menos duas avaliações humanas independentes e cegas por unidade.
- [ ] Definir adjudicação sem sobrescrever avaliações brutas.
- [ ] Fixar agregação por unidade, case, categoria e total.
- [ ] Fixar micro/macro, pesos, amostra mínima, incerteza e missing.
- [ ] Aprovar threshold policy antes da coleta, sem valores inventados neste PLAN.

**Gate:** Review pode reprovar dimensão sem unidade, cegamento, adjudicação, agregação/categoria ou threshold prévio.

### Task 5 — Separar evidência offline e live

| Evidence | Permite | Não permite |
|---|---|---|
| Offline/fixture/replay | contrato, hash, gate determinístico, Planner, policy, pareamento | custo, latência, usage ou qualidade semântica real |
| Provider vivo | qualidade semântica, usage, custo, latência, timeout e cobertura operacional | dispensar invariantes determinísticos |

Métrica live sem provider vivo é `UNAVAILABLE`; não imputar zero.

### Task 6 — Pré-registrar a avaliação A/B end-to-end final

- [ ] Após concluir as Etapas 2–6, fixar o protocolo da A/B end-to-end ADR-029 versus V2 final para execução pelo usuário.
- [ ] Cobrir primeira geração e recorrência, qualidade comercial/criativa e diversidade, invariantes, chamadas, tiers, custo, latência, retries, repairs e falhas contra todas as premissas da nota conectada.
- [ ] Separar validações offline de métricas semânticas e operacionais com provider vivo pareado; pré-registrar controles, rubricas, unidades, cegamento, adjudicação, agregação/categorias e thresholds antes da coleta.
- [ ] Apenas se o usuário solicitar diagnóstico posterior, pré-registrar atribuições individuais (PU/Strategy, Plan, cenas, Judge, catálogo/Blueprint, recipes, Skill ou tiers), cada qual com variável única e controles próprios.

Validações comportamentais por etapa continuam exigidas; nenhuma A/B é executada por este plano ou por nós agora.

### Task 7 — Definir relatório da A/B end-to-end e gate de revisão

O relatório futuro deve conter:

- protocol/dataset/manifest/threshold/rubric/aggregation hashes;
- commits e pair fingerprints;
- evidence class por métrica;
- provider/model/tier/params/prompts/contextos/seed;
- avaliações cegas, conflitos e adjudicações;
- resultados pareados e incerteza no total e por categoria;
- usage/custo/latência e cobertura;
- missing/invalid pairs;
- verdict e report hash.

Review pode rejeitar protocolo, par, categoria, resultado ou relatório incompleto. `V2_ACCEPTED` exige A/B end-to-end conduzida pelo usuário após concluir as Etapas 2–6, revisão formal do Software Architect e aceite explícito do usuário com `reportHash`; atribuições individuais não são requisito. Este PLAN não presume execução nem aprovação.

## 3. Critérios de conclusão documental

- [ ] Runtime V2 default e aceitação pendente registrados.
- [ ] ADR-029/`@1.2` preservado somente como baseline.
- [ ] Artefatos v1 `FROZEN` preservados como evidência parcial Judge reduction, com diferenças de contrato e novas versões full E6 pré-registradas; não há aprovação herdada.
- [ ] A/B end-to-end final sob responsabilidade do usuário após as Etapas 2–6 registrada como gate; atribuições individuais apenas para diagnóstico solicitado, sem execução agora.
- [ ] Evidence offline e provider vivo separados.
- [ ] Fixtures não satisfazem métricas live.
- [ ] Provider/model/tier/params/prompts/contextos/seed e coverage comparáveis.
- [ ] Rubrica, unidade, avaliações cegas, adjudicação, agregação/categoria e thresholds auditáveis.
- [ ] Missing/invalid não viram zero, PASS ou exclusão silenciosa.
- [ ] Nenhum resultado/approval foi inventado.
- [ ] Nenhum runtime ou teste foi alterado.

## 4. Validação documental

Validar links Markdown relativos, headings, estados, limites de evidência e diff. Não executar testes de runtime, typecheck, lint, build, fixture, provider, benchmark, E6 ou smoke.
