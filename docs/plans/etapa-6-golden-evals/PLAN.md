# Etapa 6 — Golden Dataset e Evals Documentation Plan

> **Para agentes:** este plano é documentation-only. Não execute código, dataset, fixture, harness, provider, benchmark, anotação, A/B, relatório de resultados ou cutover a partir deste arquivo. Qualquer execução futura exige protocolo separado, aprovado conforme ADR-033.

**Goal:** consolidar a precondição documental `etapa-6-golden-evals` do Slice 003 para avaliações redacted, versionadas e reproduzíveis sem alterar o runtime ADR-029.

**Architecture:** o manifesto, cases, fixtures, rubrics, assignments, thresholds e relatórios são artefatos offline versionados e hashados. O runtime permanece ADR-029/`@1.2`; o único candidato futuro permitido neste plano é uma regra de invocação/cobertura do Judge reduction, com baseline por commit, seed derivado do Job, fingerprint e aprovação formal.

**Tech Stack:** Markdown e referências documentais; nenhuma alteração de Next.js, TypeScript, PostgreSQL, Model Router, provider, schema, worker, quota, Job ou persistência.

**Spec:** [`docs/specs/etapa-6-golden-evals/SPEC.md`](../../specs/etapa-6-golden-evals/SPEC.md)

## Global Constraints

- A nota imutável “Plano de recalibração da commerce inteligence” é a autoridade superior.
- A Etapa 6 é precondição documental transversal do Slice 003; não é Slice de produto e não cria/renumera/reutiliza Slice 004.
- ADR-029 permanece runtime vigente e baseline; `tiktok-commerce@1.2` permanece em produção; `@1.3` permanece inativa.
- `ContentSceneSet` permanece separado; hard gates, Judge, repairs e `BriefValidationReport` não mudam.
- Quota, Tenant, Job, reservation, fencing, idempotência, D/N, parcial e retry permanecem os contratos atuais.
- Manifesto, case, fixture, rubric, assignment, threshold e relatório são artefatos de avaliação, não contratos de produção.
- Cases e fixtures devem ser redacted, canonical-json, versionados e hashados; hash/seed/assignment incompatível falha fechado.
- Seed Job/derivation/fingerprint e `ThresholdPolicyVersion` devem ser pré-registrados antes de execução futura.
- Assignment cego e `JudgeExecution` são autoridades distintas; ausência do Judge nunca produz `PASS`.
- Candidato futuro possui uma única variável: regra de invocação/cobertura do Judge reduction.
- Métricas precisam de denominador, missing data, categoria, custo ADR-013, moeda e latência explícitos.
- Relatório futuro exige revisão do Software Architect e aprovação explícita do usuário.
- Não alterar PRD, ADR, SYSTEM-DESIGN, DESIGN, nota imutável ou código.

---

## 1. Arquivos e responsabilidades

| Arquivo | Operação | Responsabilidade |
|---|---|---|
| `docs/specs/etapa-6-golden-evals/SPEC.md` | Criar | Identidade, fontes, contratos, invariantes, artefatos, protocolo futuro, métricas, aprovação e limites. |
| `docs/plans/etapa-6-golden-evals/PLAN.md` | Criar | Sequência documental, dependências, gates de revisão e validação sem runtime. |
| `docs/delivery/SLICES.md` | Atualizar minimamente | Uma referência sob a pré-condição do Slice 003; não criar, renumerar ou reutilizar Slice 004. |

Nenhum outro arquivo é autorizado nesta mudança.

## 2. Sequência documental

### Task 1: Congelar identidade, fontes e baseline

**Files:**

- Create: `docs/specs/etapa-6-golden-evals/SPEC.md`
- Reference: `docs/delivery/SLICES.md`, Slice 003 e Slice 004
- Read-only: nota imutável, PRDs, SYSTEM-DESIGN, ADR-013/019/021/029/033, Etapa 4, Etapa 5 e `.gstack/etapa6-*`

**Produces:** identidade `etapa-6-golden-evals`, status `DOCUMENTATION_ONLY`, precondição do Slice 003 e baseline operacional imutável.

- [ ] Declarar que a nota imutável tem precedência.
- [ ] Linkar ADR-013, ADR-019, ADR-021, ADR-029, ADR-033, SYSTEM-DESIGN, SLICES, Etapa 4, Etapa 5 e scratchs.
- [ ] Fixar ADR-029, `@1.2`, scenes, gates, Judge, repairs, quota, Tenant, Job, D/N, partial e retry.
- [ ] Declarar `@1.3`, Blueprint/recipe, Creative System e `creativeDirection` fora do runtime.
- [ ] Declarar que nenhuma execução ou cutover é autorizado.

**Gate:** a SPEC não cria capability, estado, endpoint, serviço, worker, schema ou mudança de runtime.

### Task 2: Congelar manifesto, case, fixture e rubric

**Files:**

- Modify: `docs/specs/etapa-6-golden-evals/SPEC.md`
- Reference: ADR-019, ADR-029, ADR-033

**Produces:** schemas versionados `GoldenDatasetManifestV1`, `GoldenCaseV1`, `FixtureRefV1` e `GoldenRubricV1`.

- [ ] Exigir manifesto `DRAFT|FROZEN|RETIRED`, `schemaVersion`, `rubricVersion`, `thresholdPolicyVersion`, `SHA-256`, ordem e `manifestHash`.
- [ ] Exigir cases com cenário, refs de Product/evidence/creator/memory/provider replay, policies, expected, `inputHash` e `caseHash`.
- [ ] Exigir canonical JSON UTF-8 e IDs de fixture estáveis, sem relógio, aleatoriedade, rede, banco corrente ou IDs de produção.
- [ ] Redactar segredo, cookie, token, PII desnecessária, URL viva, payload bruto e dado cross-tenant.
- [ ] Manter provider response como fixture offline sem autorizar provider.
- [ ] Separar expectativa objetiva de anotação livre.
- [ ] Versionar dimensão, unidade, labels, evidência, cegamento e adjudicação da rubric.

**Gate:** manifesto não `FROZEN`, hash ausente, redaction inválida ou referência órfã não é elegível para eval.

### Task 3: Fixar seed, derivação e fingerprint

**Files:**

- Modify: `docs/specs/etapa-6-golden-evals/SPEC.md`
- Reference: ADR-033, ADR-021 e SYSTEM-DESIGN

**Produces:** contrato documental de `seedDerivationVersion`, Job seed, replay seed e `pairFingerprint`.

- [ ] Declarar que o runtime atual não é alterado para introduzir seed nesta etapa.
- [ ] Exigir derivação determinística baseada no `jobId` lógico, entrada canônica, versão e hash.
- [ ] Usar o mesmo seed Job nos dois braços do par.
- [ ] Incluir dataset/case/input/policy/rubric, commits, SkillBinding, modelo/tier, prompts/context, seed e thresholds no fingerprint.
- [ ] Invalidar par com seed, hash ou fingerprint incompatível.
- [ ] Separar seed de fixture/replay do seed operacional futuro.

**Gate:** sem derivação e fingerprint pré-registrados não existe A/B pareado válido.

### Task 4: Separar assignment cego de JudgeExecution

**Files:**

- Modify: `docs/specs/etapa-6-golden-evals/SPEC.md`
- Reference: Etapa 5 SPEC/PLAN e ADR-029

**Produces:** `BlindAssignmentV1`, contrato de adjudicação e estados explícitos do Judge.

- [ ] Ocultar arm, provider, modelo, tier, reasoning, custo, latência, retries, RiskAssessment e resultado esperado do anotador.
- [ ] Proteger o mapeamento de `opaqueArmId` e validar seed/hash/rubric do assignment.
- [ ] Manter `JudgeExecution=EXECUTED|NOT_EXECUTED|FAILED|NOT_APPLICABLE` separado da rubric.
- [ ] Permitir `PASS|REVIEW` somente quando o Judge executou.
- [ ] Exigir `RiskAssessment PARTIAL|UNAVAILABLE` quando `sources.judge=NOT_EXECUTED`.
- [ ] Proibir que anotação/adjudicação altere Job, Content, Brief, D/F, quota ou publicação.

**Gate:** assignment inválido falha fechado; anotação cega nunca preenche `JudgeResult`.

### Task 5: Fixar missing data e ThresholdPolicyVersion

**Files:**

- Modify: `docs/specs/etapa-6-golden-evals/SPEC.md`
- Reference: ADR-013, ADR-019, ADR-021, ADR-033

**Produces:** estados de missing e schema de `ThresholdPolicyVersionV1` sem valores numéricos inventados.

- [ ] Registrar `MISSING`, `NOT_APPLICABLE`, `UNAVAILABLE`, `PARTIAL`, `NOT_EXECUTED`, `FAILED`, `NOT_ANNOTATED` e `INVALID`.
- [ ] Fazer hash/seed/assignment incompatível produzir `INVALID`, sem veredito.
- [ ] Proibir zero inventado para custo, cobertura ou qualidade.
- [ ] Manter scenes `AVAILABLE|FILTERED|ERROR`, backfill e Judge ausente distintos.
- [ ] Exigir policy pré-registrada para denominadores, exclusões, unidades, missing e regressão.
- [ ] Não fixar número de threshold, anotadores, acordo, score ou margem nesta etapa.

**Gate:** thresholds e missing data devem estar aprovados antes de qualquer coleta futura; nenhum relatório pós-hoc é válido.

### Task 6: Fixar par futuro, métricas e relatório

**Files:**

- Modify: `docs/specs/etapa-6-golden-evals/SPEC.md`
- Reference: ADR-013, ADR-029 e ADR-033

**Produces:** protocolo documental de baseline/candidato, matriz de métricas e envelope de relatório.

- [ ] Fixar baseline ADR-029/`@1.2` por commit/engine version.
- [ ] Declarar candidato com única variável de Judge reduction: invocação/cobertura do Judge.
- [ ] Manter constantes SkillBinding, scenes, gates, repairs, RiskAssessment, Blueprint, tier, modelo, inputs, memória, quota, retry e persistência.
- [ ] Proibir `@1.2` versus `@1.3` no A/B comum; `@1.3` continua inativa.
- [ ] Cobrir factualidade, gates, scenes, variety, naturalidade, templating, semântica, risco, partial/retry, Judge, custo e latência.
- [ ] Usar denominadores explícitos; `usage.cost` primário ADR-013, moeda compatível, `D_content`, chamadas efetivas e p50/p95.
- [ ] Exigir relatório com hashes, commits, seeds, fingerprints, assignments, JudgeExecution, métricas, missing e veredito.
- [ ] Exigir revisão do Software Architect e aprovação explícita do usuário antes de qualquer efeito.

**Gate:** sem relatório reproduzível aprovado, ADR-029 e `@1.2` permanecem vigentes e não há cutover.

### Task 7: Adicionar referência mínima no SLICES

**Files:**

- Modify: `docs/delivery/SLICES.md` sob a pré-condição documental do Slice 003
- Reference: `docs/specs/etapa-6-golden-evals/SPEC.md`
- Reference: `docs/plans/etapa-6-golden-evals/PLAN.md`

**Produces:** uma única referência documental mínima, sem criar Slice.

- [ ] Linkar SPEC e PLAN da Etapa 6.
- [ ] Declarar Etapa 6 como precondição transversal do Slice 003.
- [ ] Mencionar Golden Dataset, fixtures, rubricas, anotação cega, Judge reduction e A/B.
- [ ] Declarar que não cria, renumera ou reutiliza Slice 004.
- [ ] Manter ADR-029, `@1.2` e gates atuais até relatório reproduzível e aprovação formal.

**Gate:** nenhuma alteração fora da linha de pré-condição documental do Slice 003.

## 3. Validação documental

Executar somente após as três edições:

1. Validar que os links Markdown relativos da SPEC, PLAN e referência do SLICES resolvem para arquivos existentes.
2. Confirmar que os três arquivos contêm `DOCUMENTATION_ONLY`, `etapa-6-golden-evals`, ADR-029, `@1.2`, `@1.3`, `JudgeExecution`, `ThresholdPolicyVersion`, custo ADR-013, aprovação Architect/usuário e limites de não execução.
3. Confirmar que a referência aparece sob Slice 003 e não cria/renumera/reutiliza Slice 004.
4. Confirmar por inspeção de mudança que nenhum PRD, ADR, DESIGN, nota imutável, código ou outro arquivo foi alterado.

Não executar testes de runtime, build, lint, typecheck, provider, fixture, harness, benchmark, A/B ou cutover: não há comportamento implementado nesta etapa.

## 4. Critérios de aceite do PLAN

- [ ] Os três arquivos autorizados são os únicos alvos da mudança.
- [ ] SPEC e PLAN têm links válidos para ADR-013/019/021/029/033, SYSTEM-DESIGN, SLICES e Etapas 4/5.
- [ ] O manifesto/cases/fixtures/rubrics são versionados, redacted e hashados.
- [ ] Seed Job, derivation e fingerprint estão definidos como pré-condição futura.
- [ ] Assignment cego não é confundido com `JudgeExecution`.
- [ ] Missing/hash/seed/assignment incompatíveis falham fechado.
- [ ] Thresholds permanecem sem números inventados e exigem aprovação prévia.
- [ ] Baseline é ADR-029/`@1.2` por commit e o candidato é uma única variável Judge reduction.
- [ ] Métricas têm denominadores, custo ADR-013, latência e missing data explícitos.
- [ ] Relatório futuro é reproduzível e exige Architect + usuário.
- [ ] Nenhuma execução real ou alteração de runtime ocorre.
