# SPEC — Etapa 5: Gates de risco e qualidade

**Identificador documental:** `etapa-5-risk-quality`

**Natureza:** precondição documental transversal do Slice 003; não é Slice de produto, não cria, renumera ou reutiliza o Slice 004.

**Status:** `DOCUMENTATION_ONLY` — coordena o contrato alvo de risco/qualidade; não autoriza código, provider, E6 ou aceitação formal.

**Runtime atual:** Engine V2 default em `V2_DEFAULT_PENDING_ACCEPTANCE`; ADR-029/`@1.2` permanece baseline histórico/experimental. Risk pré-Judge e Judge seletivo são alvo pendente até implementação observável.

## 1. Objetivo e fronteira

Esta SPEC define:

- hard gates como autoridade objetiva de elegibilidade;
- `PreJudgeRiskAssessmentV2` como roteamento determinístico antes do Judge;
- falha/indisponibilidade de Risk selecionando Judge como fail-safe;
- `JudgeSelectionDecisionV1` persistível e reproduzível;
- `JudgeExecution=NOT_EXECUTED` sem `PASS` sintético;
- offline fixtures para estrutura/registry/policy sem alegação de qualidade operacional;
- experimento de atribuição Judge-all versus Risk-gated dentro da E6;
- invariantes de quota, tenant, Job, fencing, idempotência, D/N, parcial e retry.

A Etapa 5 não cria capability de produto, estado de Job, endpoint, serviço, aggregate, tabela, worker, migration, provider ou contrato creator-facing. Também não afirma que Risk pré-Judge já esteja implementado no runtime V2.

## 2. Fontes e precedência

A nota imutável **“Plano de recalibração da commerce inteligence”** é a autoridade superior. Seu conteúdo não é copiado, alterado ou reinterpretado por esta SPEC; qualquer conflito contra a nota permanece bloqueado para decisão superior.

Fontes vinculantes e referências:

1. [ADR-013 — Model Router e IntelligenceTier](../../architecture/adr-013-model-router-e-intelligence-tier.md) — tier, custo por tentativa efetiva, moeda e estados `UNAVAILABLE`/`PARTIAL`.
2. [ADR-019 — Gate versionada, variedade funcional e ContentSceneSet](../../architecture/adr-019-gate-versionada-e-cenas.md) — policy versionada, variedade, cenas separadas e backfill.
3. [ADR-021 — Geração parcial declarada e retry dos faltantes](../../architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md) — D/N, `PARTIAL_FAILURE_CAP`, quota, parcial e retry explícito.
4. [ADR-029 — Pipeline híbrida determinística e criativa](../../architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md) — baseline histórico/experimental e invariantes preservados.
5. [ADR-033 — Determinismo × LLM e Creative System](../../architecture/adr-033-determinismo-llm-e-creative-system.md) — V2 default pendente, Risk pré-Judge e E6 integral.
6. [SYSTEM-DESIGN](../../architecture/SYSTEM-DESIGN.md) — fronteiras de Tenant, Job, Engine, Entitlements, Content e Model Router.
7. [SLICES](../../delivery/SLICES.md) — Slice 003 de primeira geração e Slice 004 de revisão/controle.
8. [SPEC da Etapa 4](../etapa-4-skill-brief/SPEC.md) e [PLAN da Etapa 4](../../plans/etapa-4-skill-brief/PLAN.md) — precondição documental anterior e preservação do runtime.
9. Registro local de análise da Etapa 5 (`.gstack/etapa5-decisoes.md`), preservado fora da árvore versionada.

A precedência operacional permanece: nota imutável → PRDs → SYSTEM-DESIGN → ADRs → PRINCIPLES → DESIGN → SLICES → SPEC/PLAN. Esta SPEC não altera fontes superiores.

## 3. Identidade documental e Slice 003

A identidade estável é `etapa-5-risk-quality`.

Caminhos canônicos desta frente:

```text
docs/specs/etapa-5-risk-quality/SPEC.md
docs/plans/etapa-5-risk-quality/PLAN.md
```

A Etapa 5 é uma precondição documental transversal do Slice 003. Ela não é um Slice adicional e não recebe User Outcome, domínio de produto, estado de creator ou ownership de revisão. O Slice 003 continua responsável pela primeira geração até Briefings, incluindo delivery objetivo, parcial e retry dos faltantes conforme ADR-021. O Slice 004 continua responsável por revisão, edição, aprovação, descarte e versionamento de Content.

A referência no SLICES deve registrar V2 default pendente, ADR-029 como baseline e Risk pré-Judge como alvo não comprovado. Ela não autoriza runtime.

## 4. Estado atual e baseline

- Engine V2 é o runtime default por ADR-033.
- ADR-029/`@1.2` permanece reproduzível para histórico/E6, não como call graph default.
- Hard gates, `BriefValidationReport`, partial, quota, tenant, fencing e idempotência permanecem invariantes.
- A ordem-alvo é hard gates → Risk Detector → Judge seletivo.
- Risk possui autoridade de roteamento, nunca de entrega.
- Falha ou indisponibilidade de Risk seleciona Judge.
- Item não selecionado registra `JudgeExecution=NOT_EXECUTED`, nunca `PASS`.
- Esta SPEC não afirma que o alvo esteja implementado; ausência de observabilidade mantém o gate de `V2_ACCEPTED` pendente.
## 5. Ordem e autoridade dos gates

```text
Brief + Scene Skeleton
→ hard gates
→ Hard Gate Repair limitado
→ Risk Detector determinístico
→ Judge somente nos itens selecionados
→ Semantic Part Repair único
→ hard gates/variedade finais
→ persistência
```

Esta é a ordem alvo do ADR-033. Documentação, fixture ou tipo isolado não provam sua execução no runtime.

### 5.1 Hard gate objetivo

Hard gates são server-side, fail-closed e têm autoridade sobre elegibilidade. Cobrem, conforme contratos atuais:

- schema e ownership;
- IDs e cardinalidade;
- refs de evidência autorizadas e factualidade;
- CTA/connectors e restrições de plataforma;
- duplicatas e variedade;
- cenas válidas para geração nova;
- resultado final e consistência do conjunto.

O relatório objetivo é `BriefValidationReport`:

```text
PASS   → contrato objetivo válido para avançar
REPAIR → falha objetiva reparável dentro do limite
REJECT → item/conjunto não entregável após limite ou falha não reparável
```

`REPAIR` aciona `CONTENT_BRIEF_REPAIR` por item com causas server-derived. A saída completa é revalidada, inclusive variedade. Exaustão segue ADR-021; não há relaxamento de gate.

### 5.2 Judge e rubric semântico

O Judge executa somente para seleções `selected=true` ou quando falha/indisponibilidade do Risk aciona o fail-safe. Retorna `PASS|REVIEW` por parte e não decide factualidade, variedade, estado, quota, Tenant, retry, parcial ou publicação. Uma parte `REVIEW` recebe no máximo um repair semântico, sem re-Judge.

### 5.3 Judge não executado

```text
JudgeExecution = EXECUTED | NOT_EXECUTED | FAILED | NOT_APPLICABLE
JudgeResult = PASS | REVIEW somente quando EXECUTED
```

- `NOT_EXECUTED` exige decisão de seleção persistida e nunca vira `PASS`.
- `FAILED` nunca vira `PASS` ou `REVIEW`.
- Cobertura é reportada separadamente de qualidade semântica.
- A entrega continua sob hard gates objetivos.
- Eval subjetiva usa anotação cega separada do `JudgeResult`.

## 6. Separação entre Risk, hard gate e rubric

| Plano | Fonte | Resultado | Autoridade |
|---|---|---|---|
| Hard gate | código server-side | `PASS|REPAIR|REJECT` | elegibilidade, D/F e entrega |
| Risk pré-Judge | policy/registry determinísticos | assessment + seleção | roteia Judge; nunca entrega |
| Judge | LLM nos itens selecionados | `PASS|REVIEW` por parte | orienta um repair; nunca publica |
| Rubrica E6 | avaliações humanas cegas | labels/scores adjudicados | evidência de aceitação; nunca altera runtime |

`riskBand=HIGH` não é `REJECT`. `REVIEW` não é hard failure. Rubrica E6 não preenche resultado do Judge.

## 7. Contratos pré-Judge

```ts
type PreJudgeRiskAssessmentV2 = {
  contractVersion: "risk-assessment.v2";
  policyVersion: string;
  subject: { jobId: string; contentId: string };
  assessmentStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  riskBand: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  findings: readonly RiskFindingV2[];
  sources: {
    hardGate: "AVAILABLE";
    blueprint: "AVAILABLE" | "UNAVAILABLE";
    scenes: "AVAILABLE" | "FILTERED" | "ERROR";
    memory: "AVAILABLE" | "EMPTY" | "UNAVAILABLE";
  };
};

type JudgeSelectionDecisionV1 = {
  policyVersion: string;
  contentId: string;
  selected: boolean;
  triggerCodes: readonly string[];
};
```

Invariantes:

1. contrato, policy, registry e trigger codes são versionados e allowlisted;
2. subject, refs e ownership são server-owned;
3. findings derivam deterministicamente de Brief, Blueprint, cenas, memória e hard gates disponíveis;
4. provider não escolhe risk band, seleção, quota, status ou persistência;
5. falha, `PARTIAL` crítico ou `UNAVAILABLE` seleciona Judge;
6. decisão de seleção é persistível e reproduzível;
7. item não selecionado registra `NOT_EXECUTED`;
8. Risk não cria copy, claim, repair ou faltante.

O registry mínimo é o definido no ADR-033: genericidade; integração fraca do Produto; CTA incompatível; payoff ausente; repetição/saturação de attention mechanism, commercial effect, psychological effect, recipe e narrative shape; script longo; produção incerta; mecanismo criativo ou realização do Blueprint incompletos.
## 8. Evidence offline de Risk/Blueprint

Fixtures isoladas podem demonstrar:

- schema, enum, cardinalidade e referências;
- `load → validate → freeze → expose`;
- registry, trigger codes, ordenação e deduplicação;
- policy de seleção e fail-safe;
- códigos `GEN-CS-*`;
- não vazamento de catálogo no contexto projetado.

Fixtures, mocks e replay offline não demonstram naturalidade, criatividade, persuasão, qualidade semântica real, custo, tokens, latência, timeout ou retries de provider. Esses critérios ficam `UNAVAILABLE` para aceite operacional até provider vivo pareado.

Esta seção não autoriza writer, migration, ativação, provider ou alteração do runtime.

## 9. Experimento de atribuição Risk-gated

O experimento compara Judge-all e Risk-gated como uma atribuição dentro da E6. Antes da coleta, fixa:

- baseline/candidato por commit/engine version;
- mesma entrada, Skill/binding, provider/model/tier e parâmetros;
- prompts/contextos, seed, policies e memória por bytes/hash;
- regra de seleção, registry e fail-safe;
- coverage `EXECUTED|NOT_EXECUTED|FAILED|NOT_APPLICABLE`;
- usage/custo/latência e completude;
- rubricas subjetivas, unidade, cegamento, avaliações independentes, adjudicação, agregação/categorias, missing e thresholds.

Parte não chamada recebe `NOT_EXECUTED`, nunca `PASS` ou repair inferido. Evidence offline valida a policy; somente provider vivo mede qualidade semântica, custo e latência reais.

Nenhum threshold ou resultado é inventado nesta SPEC. Regressão agregada ou por categoria reprova conforme policy pré-registrada. Sem relatório revisado e aceite explícito do usuário, V2 permanece default pendente.

## 10. Invariantes operacionais imutáveis

### 10.1 Tenant e autorização

- Tenant é resolvido server-side pela sessão; não vem do provider, request arbitrário ou RiskAssessment.
- Cross-tenant, ownership inválido, ID externo não autorizado ou vazamento de dados falham fechados.
- Mensagens e telemetria são sanitizadas, sem revelar dados de outro Tenant.

### 10.2 Job, reservation, fencing e idempotência

- `CommerceIntelligenceJob` é durável e mantém um Job ativo por usuário conforme Slice 003.
- Retry técnico reutiliza `job.id`, reservation e chave lógica; replay equivalente não duplica execução terminal, publicação ou quota.
- Lease/fencing/CAS impedem owner antigo de publicar, confirmar quota ou alterar estado terminal.
- Chamadas externas permanecem fora da transação de persistência; finalização é curta e fenced.

### 10.3 Quota

- Reserva N na criação do Job.
- `SUCCEEDED` confirma N.
- `SUCCEEDED_PARTIAL` confirma D e libera N−D uma vez.
- `FAILED`/cancelamento libera o saldo uma vez.
- Retry técnico não reserva de novo.
- Retry explícito de faltantes cria novo Job com nova reservation para F, sem regenerar Contents entregues.

### 10.4 D/N, parcial e retry

- `N` permanece na faixa ativa `1..10`; batches de Brief permanecem `4..8`, default `4`.
- `SUCCEEDED` exige D=N.
- `SUCCEEDED_PARTIAL` exige `0<D<N` e `F=N−D` dentro do `PARTIAL_FAILURE_CAP`, com diagnóstico objetivo, Variety revalidada no subconjunto D e `expectedCount=D+F`.
- D=0, F acima do CAP ou falha pré-entrega consistente resulta em `FAILED`.
- `REVIEW` semântico não entra em F e não cria parcial.
- Retry explícito de faltantes reutiliza Strategy ACTIVE/sinais permitidos, mas não é continuação de Semantic Part Repair.

## 11. Critérios de aceite

- **AC5.1 — Identidade:** Etapa 5 permanece transversal ao Slice 003.
- **AC5.2 — Estado:** V2 é default pendente; ADR-029/`@1.2` é baseline.
- **AC5.3 — Ordem:** hard gates → Risk → Judge seletivo é alvo, não implementação presumida.
- **AC5.4 — Risk:** contratos v2 e decisão de seleção são determinísticos, versionados e sem autoridade de entrega.
- **AC5.5 — Fail-safe:** falha/indisponibilidade seleciona Judge; `NOT_EXECUTED` nunca é `PASS`.
- **AC5.6 — Evidence:** fixtures offline não comprovam qualidade semântica, custo ou latência reais.
- **AC5.7 — Atribuição:** Judge-all versus Risk-gated usa provider vivo pareado e controles pré-registrados.
- **AC5.8 — Subjetivo:** rubrica, unidade, cegamento, adjudicação, agregação/categorias e thresholds são auditáveis.
- **AC5.9 — Operação:** quota, Tenant, Job, fencing, idempotência, D/N, partial e retry permanecem invariantes.
- **AC5.10 — Escopo:** nenhum código, teste ou runtime é alterado.

## 12. Fora do escopo

- Implementação/correção de Risk pré-Judge, Judge seletivo, Blueprint, memória ou writer.
- Execução de fixtures, harness, Golden Dataset, provider, A/B, benchmark, smoke, typecheck, lint ou build.
- Mudança de tier, modelo, batch, cenas, gates, repairs, quota, Job, persistência ou provider.
- Reescrita de histórico v1 ou fabricação de Blueprint/sinais.
- Criação/renumeração de Slice, alteração de PRD, DESIGN, nota imutável, código ou testes.
