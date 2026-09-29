# Etapa 5 — Risk Quality Documentation Plan

> **Para agentes:** documentation-only. Não execute código, fixture, provider, E6 ou alteração de runtime a partir deste arquivo.

**Goal:** coordenar hard gates, Risk pré-Judge e Judge seletivo com a Engine V2 default, sem presumir implementação ou aceitação.

**Architecture:** Hard gates continuam autoridade objetiva. `PreJudgeRiskAssessmentV2` e `JudgeSelectionDecisionV1` formam o roteamento alvo; Risk nunca decide entrega. ADR-029/`@1.2` permanece baseline E6.

**Tech Stack:** Markdown. Nenhuma alteração de Next.js, TypeScript, PostgreSQL, Model Router, provider, schema, worker, quota, Job, runtime ou testes.

**Spec:** [`docs/specs/etapa-5-risk-quality/SPEC.md`](../../specs/etapa-5-risk-quality/SPEC.md)

## Global Constraints

- Engine V2 é default em `V2_DEFAULT_PENDING_ACCEPTANCE`.
- ADR-029/`@1.2` é histórico e baseline, não runtime default.
- A ordem alvo é hard gates → Risk → Judge seletivo.
- Risk possui autoridade de roteamento, nunca de entrega.
- Falha/indisponibilidade de Risk seleciona Judge.
- `NOT_EXECUTED` nunca significa `PASS`.
- Fixtures offline não comprovam qualidade semântica, custo ou latência reais.
- E6 com provider vivo é necessária para essas métricas.
- Quota, Tenant, Job, reservation, fencing, idempotência, D/N, partial e retry permanecem invariantes.
- Não alterar PRDs, ADRs, DESIGN, nota, código ou testes.

---

## 1. Arquivos e fronteiras

| Arquivo | Responsabilidade |
|---|---|
| `docs/specs/etapa-5-risk-quality/SPEC.md` | contratos, autoridade, registry, fail-safe, evidence e aceite |
| `docs/plans/etapa-5-risk-quality/PLAN.md` | sequência documental e gates |
| `docs/delivery/SLICES.md` | referência transversal sob Slice 003 |

A Etapa 5 não cria Slice, capability creator-facing, domínio, estado, serviço, tabela, worker ou endpoint. Slice 003 continua dono da geração; Slice 004 continua revisão/controle.

## 2. Estado atual versus alvo

| Tema | Estado coordenado |
|---|---|
| Runtime | Engine V2 default por ADR-033 |
| Aceitação | pendente |
| Baseline | ADR-029/`@1.2`, fixada por commit |
| Hard gates | invariantes preservados |
| Risk pré-Judge | contrato alvo; implementação não presumida |
| Judge seletivo | contrato alvo; implementação não presumida |
| Blueprint/memória/contexto | dependências alvo; completude não presumida |

Falha de E6 não faz rollback implícito. Sem evidência do alvo, o estado continua `V2_DEFAULT_PENDING_ACCEPTANCE`.

## 3. Sequência documental

### Task 1 — Congelar autoridade e contratos

- [ ] Manter hard gates como autoridade de elegibilidade/D/F.
- [ ] Registrar `PreJudgeRiskAssessmentV2`.
- [ ] Registrar `JudgeSelectionDecisionV1`.
- [ ] Proibir Risk de alterar quota, Job, estado, retry, factualidade ou persistência.
- [ ] Registrar `JudgeExecution` separado de `JudgeResult`.

**Gate:** documentação não afirma runtime corrigido.

### Task 2 — Congelar registry e fail-safe

- [ ] Versionar policy, registry e trigger codes.
- [ ] Cobrir os sinais mínimos do ADR-033.
- [ ] Derivar findings/seleção deterministicamente.
- [ ] Selecionar Judge em falha, `PARTIAL` crítico ou `UNAVAILABLE`.
- [ ] Registrar `NOT_EXECUTED` apenas com decisão `selected=false`.

**Gate:** ausência de Risk nunca reduz cobertura silenciosamente.

### Task 3 — Separar classes de evidência

Evidence offline pode validar schema, refs, registry, ordenação, policy, seleção, fail-safe, compatibilidade e códigos.

Evidence offline não pode validar:

- qualidade semântica real;
- naturalidade, criatividade ou persuasão;
- tokens/usage reais;
- custo real;
- latência, timeout ou retry reais.

Essas métricas exigem provider vivo pareado e permanecem `UNAVAILABLE` sem ele.

### Task 4 — Pré-registrar atribuição Judge-all versus Risk-gated

Antes da coleta:

- [ ] Fixar commits/engine versions.
- [ ] Congelar provider/model/tier e parâmetros.
- [ ] Congelar Skill/binding, prompts/contextos, inputs, memória e seed.
- [ ] Registrar policy/registry/seleção e cobertura.
- [ ] Registrar usage/custo/latência e completude.
- [ ] Pré-registrar rubricas, unidades, cegamento, avaliações independentes e adjudicação.
- [ ] Fixar agregação por unidade, case, categoria e total.
- [ ] Fixar missing policy e thresholds.

**Gate:** a atribuição altera somente a estratégia de cobertura do Judge; diferença não registrada invalida o par.

### Task 5 — Preservar invariantes operacionais

- [ ] Tenant server-side e cross-tenant fail-closed.
- [ ] Job durável, lease/fencing/CAS e finalização curta.
- [ ] Reservation N, confirmação D e liberação N−D.
- [ ] Partial/retry conforme ADR-021.
- [ ] `REVIEW`, Risk ou falta de Judge sem autoridade sobre D/F.

### Task 6 — Revisão antes de runtime

Review deve poder reprovar:

- contrato ou registry incompleto;
- fail-safe ausente;
- `NOT_EXECUTED` sintetizado como `PASS`;
- mistura de evidence offline/provider vivo;
- par sem provider/model/tier/params/prompts/contextos/seed comparáveis;
- rubrica sem unidade, cegamento, adjudicação, agregação/categoria ou threshold prévio;
- qualquer alegação de resultado/aceitação sem relatório.

Nenhuma correção de runtime/teste começa por este PLAN.

## 4. Artefatos futuros

- protocolo E6 e manifest de diferenças;
- policy/registry versionados;
- fixtures offline redacted/hashadas;
- captures de provider vivo;
- assignments cegos e adjudicações;
- relatório versionado/hashado;
- review do Software Architect;
- aceite explícito do usuário.

Nenhum desses artefatos é criado ou aprovado por esta coordenação documental.

## 5. Critérios de conclusão documental

- [ ] V2 default e aceitação pendente estão explícitos.
- [ ] ADR-029/`@1.2` aparece somente como baseline/histórico.
- [ ] Ordem alvo Risk → Judge está explícita sem afirmação de implementação.
- [ ] Risk não recebe autoridade de entrega.
- [ ] Fail-safe seleciona Judge.
- [ ] `NOT_EXECUTED` não é `PASS`.
- [ ] Evidence offline e provider vivo estão separados.
- [ ] Auditabilidade subjetiva está pré-registrada.
- [ ] Nenhum resultado, não-regressão ou aprovação foi inventado.
- [ ] Nenhum runtime ou teste foi alterado.

## 6. Validação documental

Validar links, headings, estados e consistência textual. Não executar fixture, harness, provider, teste, typecheck, lint, build, benchmark ou smoke.
