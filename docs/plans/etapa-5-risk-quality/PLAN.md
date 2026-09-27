# Etapa 5 — Risk Quality Documentation Plan

> **Para agentes:** este plano é documentation-only. Não execute código, fixtures, harness, A/B ou cutover a partir deste arquivo. Qualquer implementação futura exige um plano de cutover separado, aprovado conforme ADR-033.

**Goal:** consolidar os contratos documentais de risco e qualidade sem alterar o runtime ADR-029, `tiktok-commerce@1.2` ou os gates vigentes.

**Architecture:** Etapa 5 é uma precondição documental transversal do Slice 003, identificada como `etapa-5-risk-quality`. Hard gates objetivos continuam autoridade de elegibilidade; Judge continua semântico e limitado; RiskAssessment é advisory, versionado, allowlisted, determinístico e sanitizado. Blueprint/recipe permanece fixture/harness-only e Judge reduction é um experimento A/B isolado, sem execução nesta frente.

**Tech Stack:** Markdown e referências documentais; nenhuma alteração de Next.js, TypeScript, PostgreSQL, Model Router, provider, schema, worker, quota, Job ou persistência.

**Spec:** [`docs/specs/etapa-5-risk-quality/SPEC.md`](../../specs/etapa-5-risk-quality/SPEC.md)

## Global Constraints

- A nota imutável **“Plano de recalibração da commerce inteligence”** é a autoridade superior.
- ADR-029 permanece o runtime vigente e baseline de qualquer avaliação futura.
- `tiktok-commerce@1.2` permanece em produção; `@1.3` permanece inativa.
- `ContentSceneSet` permanece separado de `ContentBriefVersion`.
- `BriefValidationReport` permanece objetivo `PASS|REPAIR|REJECT`.
- `CONTENT_QUALITY_JUDGE` permanece `PASS|REVIEW` somente quando executado, após hard gates.
- `JudgeExecution=NOT_EXECUTED|FAILED` nunca é convertido em `PASS` ou `REVIEW`.
- Quando `sources.judge=NOT_EXECUTED`, o `RiskAssessment.assessmentStatus` é obrigatoriamente `PARTIAL` ou `UNAVAILABLE`; nunca `AVAILABLE`, inclusive por preenchimento sintético.
- `RiskAssessment` não decide entrega, estado, quota, retry, Tenant ou persistência.
- Hard gate, semantic rubric e risk permanecem autoridades separadas.
- Blueprint/recipe e Creative System são fixture/harness-only; nenhum runtime V2 ou `creativeDirection`.
- Judge reduction A/B tem uma única variável independente e não é executado.
- Quota, Tenant, Job, reservation, fencing, idempotência, D/N, partial e retry permanecem imutáveis.
- Golden Dataset, seed, baseline/candidato, hashes, versões e thresholds são apenas pré-registro nesta frente.
- Não alterar PRDs, ADRs, DESIGN, nota imutável ou código.
- A referência no SLICES não cria, renumera ou reutiliza Slice 004.

---

## 1. Arquivos e responsabilidades

| Arquivo | Operação | Responsabilidade |
|---|---|---|
| `docs/specs/etapa-5-risk-quality/SPEC.md` | Criar | Contratos, invariantes, autoridade, limites, A/B pré-registrado e aceite. |
| `docs/plans/etapa-5-risk-quality/PLAN.md` | Criar | Sequência documental, gates de revisão, dependências e validação sem runtime. |
| `docs/delivery/SLICES.md` | Atualizar minimamente | Uma referência sob o Slice 003; não criar/renumerar Slice 004. |

Nenhum arquivo fora desta tabela é autorizado nesta frente.

## 2. Sequência documental

### Task 1: Congelar a SPEC e a identidade

**Files:**

- Create: `docs/specs/etapa-5-risk-quality/SPEC.md`
- Reference: [`docs/delivery/SLICES.md`](../../delivery/SLICES.md), Slice 003 e Slice 004
- Read-only sources: ADR-013, ADR-019, ADR-021, ADR-029, ADR-033, SYSTEM-DESIGN, Etapa 4 e `.gstack/etapa5-decisoes.md`

**Interfaces:**

- Consumes: baseline ADR-029, `@1.2`, contracts de gates e decisões da Etapa 5.
- Produces: identidade `etapa-5-risk-quality`, invariantes e critérios que o PLAN e a referência do SLICES devem seguir.

- [ ] Registrar a Etapa 5 como documentação transversal do Slice 003.
- [ ] Declarar que Slice 004 continua revisão/controle de Content.
- [ ] Congelar `ContentSceneSet`, `BriefValidationReport`, Judge, repairs e entrega objetiva.
- [ ] Registrar links relativos para ADR-013/019/021/029/033, SYSTEM-DESIGN, SLICES e Etapa 4.
- [ ] Declarar `DOCUMENTATION_ONLY`, sem execução ou cutover.

**Gate:** a SPEC não cria estado, capability, serviço, worker, migration, endpoint, schema ou mudança de runtime.

### Task 2: Congelar o contrato RiskAssessment e a semântica do Judge

**Files:**

- Modify: `docs/specs/etapa-5-risk-quality/SPEC.md`
- Reference: `docs/architecture/adr-013-model-router-e-intelligence-tier.md`
- Reference: `docs/architecture/adr-019-gate-versionada-e-cenas.md`
- Reference: `docs/architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md`
- Reference: `docs/architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md`

**Interfaces:**

- Consumes: resultados objetivos, resultado semântico executado e evidências server-owned.
- Produces: `RiskAssessmentV1` advisory e `JudgeExecution` explícito.

- [ ] Definir `contractVersion`, `policyVersion`, subject server-owned, cobertura, findings e sources.
- [ ] Restringir códigos, domínios, severidades, sources, message codes e refs a allowlists versionadas.
- [ ] Exigir deduplicação, ordenação e derivação determinísticas no servidor.
- [ ] Proibir texto provider, prompt, segredo, claim novo, copy final e dados cross-tenant.
- [ ] Proibir que RiskAssessment altere DRAFT, `SUCCEEDED_PARTIAL`, FAILED, quota, retry ou persistência.
- [ ] Definir `JudgeExecution=EXECUTED|NOT_EXECUTED|FAILED|NOT_APPLICABLE`.
- [ ] Quando `sources.judge=NOT_EXECUTED`, exigir `assessmentStatus=PARTIAL|UNAVAILABLE`; rejeitar `AVAILABLE`, inclusive por preenchimento sintético.
- [ ] Manter `REVIEW` fora de F e fora da autoridade de parcial.

**Gate:** qualquer contrato inválido é rejeitado pelo futuro validator/harness; nenhum fallback preenche resultado sem evidência; `sources.judge=NOT_EXECUTED` nunca pode produzir `assessmentStatus=AVAILABLE`.

### Task 3: Fixar a separação de autoridades

**Files:**

- Modify: `docs/specs/etapa-5-risk-quality/SPEC.md`
- Reference: `docs/architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md`
- Reference: `docs/architecture/adr-033-determinismo-llm-e-creative-system.md`

**Interfaces:**

- Consumes: hard-gate reports, Judge executado e sinais operacionais.
- Produces: classificação documental entre hard gate, semantic rubric e risk.

- [ ] Manter hard gate como única autoridade objetiva de elegibilidade/entrega.
- [ ] Manter semantic rubric como `PASS|REVIEW` por parte, com no máximo um Part Repair e sem re-Judge.
- [ ] Tratar RiskAssessment como observabilidade advisory, sem mapeamento automático de severidade para `REJECT`.
- [ ] Declarar que `source=HARD_GATE` e `source=SEMANTIC_RUBRIC` são proveniência, não segunda autoridade.
- [ ] Separar métricas de hard failure, Judge, cobertura Judge e risk findings.

**Gate:** nenhuma combinação de `riskBand`, `REVIEW` ou cobertura ausente pode criar novo estado público ou relaxar fail-closed.

### Task 4: Confinar Blueprint/recipe a fixture/harness

**Files:**

- Modify: `docs/specs/etapa-5-risk-quality/SPEC.md`
- Modify: `docs/plans/etapa-5-risk-quality/PLAN.md`
- Reference: `docs/architecture/adr-033-determinismo-llm-e-creative-system.md`

**Interfaces:**

- Consumes: fixtures estáticas de CreativePrimitive/Recipe/Blueprint e compatibilidade versionada.
- Produces: apenas evidência de shape, refs, compatibilidade, sanitização e códigos estáveis em harness isolado.

- [ ] Permitir fixtures válidas/inválidas e `load → validate → freeze → expose` somente fora do runtime.
- [ ] Cobrir `GEN-CS-VERSION`, `GEN-CS-SCHEMA`, `GEN-CS-REF`, `GEN-CS-COMPAT` e `GEN-CS-ELIGIBILITY`.
- [ ] Proibir importação pelo worker/runtime de produção.
- [ ] Proibir `@1.3`, writer/reader V2, migration, `creativeDirection`, persistência e envio ao provider.
- [ ] Manter catálogo/`selectBriefPatterns` e caminho ADR-029 intactos.
- [ ] Declarar que fixture/harness não prova qualidade operacional, custo, latência ou cutover.

**Gate:** nenhum fixture pode alterar Job, quota, gates, D/F, Content, Brief ou memória.

### Task 5: Pré-registrar o Judge reduction A/B isolado

**Files:**

- Modify: `docs/specs/etapa-5-risk-quality/SPEC.md`
- Modify: `docs/plans/etapa-5-risk-quality/PLAN.md`
- Reference: `docs/architecture/adr-033-determinismo-llm-e-creative-system.md`

**Interfaces:**

- Consumes: baseline ADR-029, `@1.2`, mesmo SkillBinding, mesmo input e Golden Dataset.
- Produces: protocolo futuro com uma única variável: regra de invocação/cobertura do Judge.

- [ ] Fixar baseline/candidato, commit, SkillBinding, Skill version, modelo, `HIGH`, fatos, evidence, context, memory, seed e dataset antes de execução.
- [ ] Fixar schema, gate policies, cenas, hard gates, repairs, quota, tenant, idempotência, retries e persistência como constantes.
- [ ] Manter RiskAssessment fora da variável causal ou calculá-lo com a mesma policy sem autoridade.
- [ ] Manter Blueprint/recipe fixture-only; não alterar cenas, tier ou repair.
- [ ] Registrar `NOT_EXECUTED` para partes sem chamada; nunca `PASS` inferido.
- [ ] Pré-registrar métricas de chamadas, cobertura, semântica no denominador executado, hard failures, factualidade, variedade, cenas, partial/failure, retries, tokens, custo e p50/p95.
- [ ] Pré-registrar thresholds, categorias, missing data e regra de reprovação.
- [ ] Declarar que nenhum experimento ou cutover ocorre nesta Etapa 5.

**Gate:** sem thresholds, Golden Dataset, seed, relatório reproduzível, revisão e aprovação, ADR-029 permanece integralmente vigente.

### Task 6: Preservar invariantes operacionais

**Files:**

- Modify: `docs/specs/etapa-5-risk-quality/SPEC.md`
- Reference: `docs/architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md`
- Reference: `docs/delivery/SLICES.md`, Slice 003

**Interfaces:**

- Consumes: contrato operacional existente do Slice 003 e ADR-021.
- Produces: checklist de não-regressão para qualquer plano futuro.

- [ ] Manter Tenant resolvido server-side e fail-closed em cross-tenant.
- [ ] Manter Job durável, um ativo por usuário, lease/fencing/CAS e finalização curta.
- [ ] Manter reservation N, confirmação D/N, liberação única e retry técnico idempotente.
- [ ] Manter `SUCCEEDED` para D=N, `SUCCEEDED_PARTIAL` para D/N dentro do CAP e `FAILED` para D=0/excesso de CAP/falha pré-entrega.
- [ ] Manter retry explícito de faltantes como novo Job/reservation F, sem regenerar entregues.
- [ ] Manter `expectedCount=D+F`, residual objetivo e Variety revalidada no subconjunto entregue.

**Gate:** nenhuma decisão advisory ou lacuna de Judge altera quota, D/F, estado terminal, retry ou persistência.

### Task 7: Atualizar somente a referência mínima do SLICES

**Files:**

- Modify: `docs/delivery/SLICES.md` na pré-condição documental do Slice 003
- Reference: `docs/specs/etapa-5-risk-quality/SPEC.md`
- Reference: `docs/plans/etapa-5-risk-quality/PLAN.md`

**Interfaces:**

- Consumes: identidade e status da SPEC/PLAN.
- Produces: uma linha/trecho curto de rastreabilidade no mapa oficial.

- [ ] Acrescentar Etapa 5 como pré-condição documental adicional do Slice 003.
- [ ] Apontar para SPEC/PLAN da Etapa 5.
- [ ] Declarar `documentation-only`, sem criar, renumerar ou reutilizar Slice 004.
- [ ] Declarar ADR-029, `@1.2` e gates atuais vigentes até aprovação formal.
- [ ] Não alterar User Outcome, Scope, Depends On, Slice 004 ou matriz de cobertura.

**Gate:** diff do SLICES contém somente a referência mínima, sem novo heading `Slice 004` e sem alteração de escopo.

## 3. Pré-registro de thresholds e evidência

Nenhum número é escolhido neste PLAN. O protocolo futuro deve fixar antes da execução:

- versão do Golden Dataset e hash;
- categorias e população;
- baseline/candidato e commits;
- `platformSkillVersion`, `SkillBinding`, modelo, tier, seed derivado do Job;
- Product Facts/evidências, creator context e memory snapshot por bytes;
- prompt/context/schema/gate-policy hashes;
- thresholds de factualidade, variedade, naturalidade/criatividade/templating, hard failure, repair, partial/failure, chamadas, custo e latência p50/p95;
- denominadores, unidade monetária, completude e regra de missing data;
- regra de reprovação: qualquer regressão agregada ou por categoria reprova.

`usage.cost` do provider permanece primário; custo ausente/incompleto é `UNAVAILABLE`/`PARTIAL`, nunca zero inventado. `cost_per_valid_content` usa D entregue. Nenhum resultado, economia ou não-regressão é alegado antes do relatório aprovado.

## 4. Validação documental

A validação desta frente é limitada aos três arquivos autorizados:

```text
test -f docs/specs/etapa-5-risk-quality/SPEC.md
test -f docs/plans/etapa-5-risk-quality/PLAN.md
grep -n "etapa-5-risk-quality\|ADR-013\|ADR-019\|ADR-021\|ADR-029\|ADR-033\|RiskAssessment\|NOT_EXECUTED\|fixture\|Judge reduction" \
  docs/specs/etapa-5-risk-quality/SPEC.md \
  docs/plans/etapa-5-risk-quality/PLAN.md \
  docs/delivery/SLICES.md
```

Para cada link Markdown relativo nos três arquivos, o alvo deve existir. Não executar testes de runtime, typecheck, lint, build, fixture, harness, A/B, benchmark ou smoke.

## 5. Gate de conclusão

A documentação da Etapa 5 só está pronta quando:

- SPEC e PLAN têm o mesmo identificador e status documentation-only;
- SLICES contém referência mínima sob Slice 003;
- Slice 004 não foi criado, renumerado ou reutilizado;
- todos os contratos preservados e links canônicos estão presentes;
- RiskAssessment não tem autoridade de entrega;
- Judge ausente/falho não sintetiza `PASS`;
- Blueprint/recipe não atravessa runtime V2;
- Judge reduction está separado e não executado;
- thresholds/Golden/seed estão apenas pré-registrados;
- nenhum arquivo fora dos três autorizados foi alterado.

Sem aprovação arquitetural posterior, ADR-029, `@1.2` e gates atuais permanecem integralmente vigentes.
