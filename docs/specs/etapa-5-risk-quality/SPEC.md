# SPEC — Etapa 5: Gates de risco e qualidade

**Identificador documental:** `etapa-5-risk-quality`

**Natureza:** precondição documental transversal do Slice 003; não é Slice de produto, não cria, renumera ou reutiliza o Slice 004.

**Status:** `DOCUMENTATION_ONLY` — esta SPEC congela contratos, fronteiras e critérios de aprovação. Não autoriza implementação, execução de fixture/harness, A/B, alteração de runtime ou cutover.

**Runtime vigente:** ADR-029 integralmente vigente; `tiktok-commerce@1.2` em produção; `@1.3` permanece inativa.

## 1. Objetivo e fronteira

Esta SPEC resolve os gates documentais de risco e qualidade sem alterar a pipeline vigente. Ela define:

- a identidade documental e a relação com o Slice 003;
- a separação entre hard gate objetivo, rubric semântico/Judge e RiskAssessment advisory;
- o contrato futuro versionado de `RiskAssessment` sem autoridade de entrega;
- a semântica explícita para Judge não executado;
- a validação de Blueprint/recipe somente em fixture/harness;
- o pré-registro de um experimento isolado de Judge reduction;
- os invariantes de quota, tenant, Job, reservation, fencing, idempotência, D/N, parcial e retry;
- os gates de thresholds, Golden Dataset e seed antes de qualquer experimento.

A Etapa 5 não cria capability de produto, estado de Job, endpoint, serviço, aggregate, tabela, worker, migration, provider, contrato creator-facing ou alteração na autoridade do Slice 003.

## 2. Fontes e precedência

A nota imutável **“Plano de recalibração da commerce inteligence”** é a autoridade superior. Seu conteúdo não é copiado, alterado ou reinterpretado por esta SPEC; qualquer conflito contra a nota permanece bloqueado para decisão superior.

Fontes vinculantes e referências:

1. [ADR-013 — Model Router e IntelligenceTier](../../architecture/adr-013-model-router-e-intelligence-tier.md) — tier, custo por tentativa efetiva, moeda e estados `UNAVAILABLE`/`PARTIAL`.
2. [ADR-019 — Gate versionada, variedade funcional e ContentSceneSet](../../architecture/adr-019-gate-versionada-e-cenas.md) — policy versionada, variedade, cenas separadas e backfill.
3. [ADR-021 — Geração parcial declarada e retry dos faltantes](../../architecture/adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md) — D/N, `PARTIAL_FAILURE_CAP`, quota, parcial e retry explícito.
4. [ADR-029 — Pipeline híbrida determinística e criativa](../../architecture/adr-029-pipeline-hibrida-deterministica-e-criativa.md) — runtime vigente, hard gates, Judge, repairs e `ROUTER_MAP`.
5. [ADR-033 — Determinismo × LLM e Creative System](../../architecture/adr-033-determinismo-llm-e-creative-system.md) — autoridade, Blueprint futuro, Skill, catálogo e A/B.
6. [SYSTEM-DESIGN](../../architecture/SYSTEM-DESIGN.md) — fronteiras de Tenant, Job, Engine, Entitlements, Content e Model Router.
7. [SLICES](../../delivery/SLICES.md) — Slice 003 de primeira geração e Slice 004 de revisão/controle.
8. [SPEC da Etapa 4](../etapa-4-skill-brief/SPEC.md) e [PLAN da Etapa 4](../../plans/etapa-4-skill-brief/PLAN.md) — precondição documental anterior e preservação do runtime.
9. [Decisões da Etapa 5](../../../.gstack/etapa5-decisoes.md) — registro de análise desta mudança.

A precedência operacional permanece: nota imutável → PRDs → SYSTEM-DESIGN → ADRs → PRINCIPLES → DESIGN → SLICES → SPEC/PLAN. Esta SPEC não altera fontes superiores.

## 3. Identidade documental e Slice 003

A identidade estável é `etapa-5-risk-quality`.

Caminhos canônicos desta frente:

```text
docs/specs/etapa-5-risk-quality/SPEC.md
docs/plans/etapa-5-risk-quality/PLAN.md
```

A Etapa 5 é uma precondição documental transversal do Slice 003. Ela não é um Slice adicional e não recebe User Outcome, domínio de produto, estado de creator ou ownership de revisão. O Slice 003 continua responsável pela primeira geração até Briefings, incluindo delivery objetivo, parcial e retry dos faltantes conforme ADR-021. O Slice 004 continua responsável por revisão, edição, aprovação, descarte e versionamento de Content.

A referência mínima no SLICES deve apontar para esta SPEC e PLAN, declarar que não cria/renumera/reutiliza Slice 004 e manter ADR-029, `@1.2` e os gates atuais até aprovação formal. A referência não é incluída por esta SPEC automaticamente; sua alteração é uma operação documental separada e mínima.

## 4. Baseline imutável de runtime

Enquanto não houver SPEC/PLAN de cutover aprovados, A/B executado, relatório reproduzível e aprovação formal conforme ADR-033:

- ADR-029 é o único runtime autorizado.
- `tiktok-commerce@1.2` é o binding de produção; `@1.3` é foundation/harness inativa.
- `ContentSceneSet` permanece separado de `ContentBriefVersion`; Brief novo não recebe `scenes`.
- `BriefValidationReport` permanece objetivo e retorna somente `PASS|REPAIR|REJECT`.
- `CONTENT_QUALITY_JUDGE` permanece após hard gates e retorna somente `PASS|REVIEW` por Content e parte.
- Hard Gate Repair ocorre antes do Judge, por item, em `HIGH`, limitado por `GENERATION_MAX_REPAIRS` — default atual `2`.
- Semantic Part Repair ocorre somente por parte `REVIEW`, no máximo uma vez, sem re-Judge; partes `PASS` e reparos inválidos preservam o original.
- Falha de Judge ou repair não fabrica conteúdo, `PASS` ou faltante.
- Somente hard gates objetivos, factualidade, cenas e variedade decidem elegibilidade e entrega.
- `SUCCEEDED_PARTIAL` permanece decisão objetiva de D/N dentro do `PARTIAL_FAILURE_CAP`; `REVIEW` semântico não cria F.
- Não há `QUALITY_PENDING`, `REJECT` semântico, fallback semântico ou alteração de tier.

## 5. Ordem e autoridade dos gates

A ordem vigente e preservada é:

```text
Brief Generator
→ hard gates objetivos
→ Hard Gate Repair limitado
→ ContentSceneSet válido
→ CONTENT_QUALITY_JUDGE
→ Semantic Part Repair único
→ hard gates/variedade finais
→ persistência e decisão terminal
```

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

O Judge ocorre somente depois dos hard gates prévios, em batches homogêneos de até três Contents, e avalia as partes vigentes (`hook`, `development`, `script`, `cta`, `scenes`). Seu único resultado de qualidade é:

```text
PASS   → parte semântica preservada
REVIEW → parte pode receber um Semantic Part Repair
```

Judge não decide factualidade, variedade, estado, quota, Tenant, retry, parcial ou publicação. Uma parte `REVIEW` recebe no máximo um `CONTENT_PART_REPAIR`, sem re-Judge; se o reparo for inválido, o original é preservado e os hard gates finais continuam determinando entrega.

### 5.3 Judge não executado

A ausência de execução é um estado de cobertura, não um resultado semântico:

```text
JudgeExecution = EXECUTED | NOT_EXECUTED | FAILED | NOT_APPLICABLE

JudgeResult só existe quando JudgeExecution = EXECUTED:
  PASS | REVIEW por Content e parte
```

Regras:

- `NOT_EXECUTED` nunca é sintetizado como `PASS` ou `REVIEW`.
- Quando `sources.judge=NOT_EXECUTED`, `assessmentStatus` é obrigatoriamente `PARTIAL` ou `UNAVAILABLE`; nunca `AVAILABLE`, inclusive por preenchimento sintético.
- `FAILED` nunca é sintetizado como `PASS` ou `REVIEW`.
- Não há novo estado público, `QUALITY_PENDING`, `REJECT` semântico, repair extra ou re-Judge por esta regra.
- Thresholds que medirem qualidade semântica devem declarar o denominador de partes efetivamente executadas e a cobertura `NOT_EXECUTED`/`FAILED` separadamente.
- O contrato de entrega vigente não é reescrito para preencher uma lacuna de evidência.

## 6. Separação entre risk, hard gate e semantic rubric

Os três planos podem compartilhar referências, mas nunca autoridade:

| Plano | Fonte | Resultado | Autoridade |
|---|---|---|---|
| Hard gate | Validator/código server-side | `PASS|REPAIR|REJECT` | Decide elegibilidade, D/F e entrega conforme ADR-029/021. |
| Semantic rubric | `CONTENT_QUALITY_JUDGE` executado após hard gates | `PASS|REVIEW` por parte | Orienta um Part Repair; não decide publicação, factualidade, quota ou parcial. |
| Risk | Assessment determinístico de evidências existentes | `RiskAssessment` advisory | Observa exposição/cobertura; não cria gate, retry, quota, estado ou publicação. |

`riskBand=HIGH` não é `REJECT`. `REVIEW` não é hard failure. `source=HARD_GATE` ou `source=SEMANTIC_RUBRIC` em um finding informa proveniência de uma decisão já existente; não cria segunda decisão. Risk não pode reclassificar um fato, gate ou resultado do Judge.

## 7. Contrato `RiskAssessment`

### 7.1 Papel

`RiskAssessment` é um artefato interno de observabilidade/avaliação. É advisory, versionado, allowlisted, determinístico e sanitizado. Não é estado de Job, não é parte de `BriefValidationReport`, não é resultado do Judge e não decide DRAFT, `SUCCEEDED`, `SUCCEEDED_PARTIAL`, `FAILED`, quota, retry, Tenant ou persistência.

### 7.2 Envelope mínimo futuro

O contrato futuro deve manter forma equivalente à seguinte:

```ts
type RiskAssessmentV1 = {
  contractVersion: "risk-assessment.v1";
  policyVersion: string;
  assessmentStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  subject: {
    jobId: string;
    contentId?: string;
    part?: "hook" | "development" | "script" | "cta" | "scenes";
  };
  riskBand: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  findings: readonly RiskFindingV1[];
  sources: {
    hardGate: "AVAILABLE" | "NOT_EXECUTED" | "UNAVAILABLE";
    judge: "EXECUTED" | "NOT_EXECUTED" | "FAILED" | "NOT_APPLICABLE";
    blueprintFixture: "EXECUTED" | "NOT_EXECUTED" | "NOT_APPLICABLE";
  };
};

type RiskFindingV1 = {
  code: string; // registry fechado
  domain: "FACTUALITY" | "STRUCTURE" | "VARIETY" | "SCENE" | "SEMANTIC" | "OPERATIONAL";
  severity: "LOW" | "MEDIUM" | "HIGH";
  source: "HARD_GATE" | "SEMANTIC_RUBRIC" | "OPERATIONAL_SIGNAL";
  evidenceRefs: readonly string[]; // refs/hash server-owned
  messageCode: string; // catálogo sanitizado local
};
```

### 7.3 Invariantes

1. `contractVersion` e `policyVersion` são obrigatórios. Alteração de shape, registry ou semântica exige nova versão.
2. `jobId`, `contentId`, `part`, refs, policy e Tenant são server-owned/validados; provider não define ownership, status, quota, IDs persistentes ou `assessmentStatus`.
3. `code`, `domain`, `severity`, `source` e `messageCode` vêm de registries fechados. Campo extra, enum inválido, código desconhecido ou ref não autorizada invalida a entrada.
4. `messageCode` aponta para catálogo sanitizado local. Não entram prompt, resposta bruta, mensagem livre do provider, segredo, token, cookie, dado de outro Tenant, instrução executável, copy final ou claim novo.
5. O servidor deduplica e ordena findings por chave estável `(domain, code, severity, evidenceRef)`. `riskBand` é derivado deterministicamente da policy; provider não escolhe sua severidade final.
6. `AVAILABLE`, `PARTIAL` e `UNAVAILABLE` descrevem cobertura do assessment; não significam sucesso/falha do Content.
7. Se Judge não executou, `sources.judge=NOT_EXECUTED` e `assessmentStatus` é obrigatoriamente `PARTIAL` ou `UNAVAILABLE`; nunca `AVAILABLE`, inclusive por preenchimento sintético. Não há finding semântico nem `PASS` sintetizado.
8. Um assessment pode referenciar um hard gate ou rubric, mas não os substitui, relaxa ou reexecuta.

## 8. Blueprint/recipe: fixture/harness-only

`CreativePrimitive`, `CreativeRecipe`, `CreativeBlueprint` e compatibilidade continuam contrato-alvo da `PlatformSkill` conforme ADR-033, mas a Etapa 5 não ativa V2.

O SPEC/PLAN futuro pode descrever fixtures estáticas para:

- primitives, recipes e Blueprints válidos;
- versão/Skill desconhecida;
- refs inexistentes;
- enum, cardinalidade e compatibilidade inválidos;
- deduplicação/ordenação determinística permitida;
- códigos estáveis `GEN-CS-VERSION`, `GEN-CS-SCHEMA`, `GEN-CS-REF`, `GEN-CS-COMPAT` e `GEN-CS-ELIGIBILITY`;
- não vazamento de texto literal de hook/CTA no contexto allowlisted de um caminho Blueprint-driven.

O harness pode executar `load → validate → freeze → expose` sobre fixtures isoladas. Isso não autoriza:

- carregar `@1.3` no runtime;
- escrever ou ler `ContentOpportunity.creativeDirection` em produção;
- criar writer, reader V2, migration, endpoint, aggregate, serviço ou schema de produção;
- enviar Blueprint/recipe ao provider do caminho ADR-029;
- derivar ou reescrever histórico v1;
- alterar cenas, gates, Judge, tier, repair, quota, Job ou persistência.

O aceite do fixture/harness não é evidência de naturalidade, factualidade, qualidade operacional, custo, latência ou equivalência de runtime.

## 9. Experimento isolado de Judge reduction

### 9.1 Pré-registro, não execução

A hipótese de redução de invocações do Judge exige A/B operacional próprio. A única variável independente é a regra pré-registrada de quais Contents/partes recebem `CONTENT_QUALITY_JUDGE`. Esta SPEC não escolhe algoritmo de redução, não cria flag e não executa experimento.

### 9.2 Constantes do par

Baseline e candidato devem manter iguais:

- ADR-029 e commit/engine version fixados;
- `tiktok-commerce@1.2`, mesmo `SkillBinding`, `platformSkillVersion`, modelo e tier `HIGH`;
- Product Facts/evidências, `creatorContext`, `ProductMemorySnapshot`, Golden Dataset, categorias e seed derivado do Job;
- prompt/context hashes, schema, `GATE_POLICY_VERSION`, timeouts, quota, Tenant, idempotência, persistência e retries;
- hard gates, factualidade, variedade, `ContentSceneSet`, tentativas de cena, Hard Gate Repair e Semantic Part Repair;
- RiskAssessment desativado como variável ou calculado com a mesma policy, sem autoridade;
- Blueprint/recipe apenas em fixture/harness, não carregado e não enviado ao provider;
- sem rebaixamento de tier, fallback semântico, repair novo, re-Judge ou alteração de cenas.

Parte não chamada recebe `JudgeExecution=NOT_EXECUTED`; nunca recebe `PASS`, `REVIEW`, finding semântico ou repair por inferência.

### 9.3 Métricas e gate de aprovação

Antes de executar, o protocolo deve fixar versão de thresholds, denominadores, unidade monetária, regra de missing data e Golden Dataset. Deve medir, agregado e por categoria:

- invocações e partes avaliadas;
- cobertura `EXECUTED`, `NOT_EXECUTED`, `FAILED`, `NOT_APPLICABLE`;
- `PASS|REVIEW` somente em partes executadas;
- hard-gate failure, factualidade, variedade e `ContentSceneSet`;
- `CONTENT_PART_REPAIR` sem alteração da policy;
- D/N, `SUCCEEDED_PARTIAL`, `FAILED`, retries, chamadas efetivas, tokens, custo e latência p50/p95;
- `cost_per_valid_content` com custo/completude conforme ADR-013;
- findings de RiskAssessment somente como observabilidade não causal.

Thresholds não são definidos numericamente nesta SPEC. Sem Golden Dataset, seed, baseline/candidato, versões, hashes, thresholds pré-registrados, relatório reproduzível, revisão arquitetural e aprovação formal, não há experimento válido nem cutover. Qualquer regressão em critério ou categoria reprova o candidato; economia isolada não aprova.

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

- **AC5.1 — Identidade:** SPEC/PLAN usam `etapa-5-risk-quality`; Etapa 5 é pré-condição transversal do Slice 003 e não cria/renumera/reutiliza Slice 004.
- **AC5.2 — Baseline:** ADR-029, `@1.2`, `ContentSceneSet` separado, gates, Judge e repairs vigentes estão explicitamente preservados.
- **AC5.3 — Estados:** `BriefValidationReport` usa `PASS|REPAIR|REJECT`; Judge usa `PASS|REVIEW`; `JudgeExecution` distingue `NOT_EXECUTED` e `FAILED` sem sintetizar `PASS`.
- **AC5.4 — RiskAssessment:** contrato versionado, allowlisted, determinístico e sanitizado; advisory-only e sem autoridade de entrega.
- **AC5.5 — Separação:** hard, semantic rubric e risk têm perguntas, fontes, resultados e autoridade distintos.
- **AC5.6 — Blueprint:** Blueprint/recipe são somente fixture/harness; nenhum runtime V2, writer, migration, `creativeDirection` ou ativação `@1.3`.
- **AC5.7 — Judge reduction:** protocolo A/B isolado tem uma variável independente; RiskAssessment, Blueprint, cenas, tier, repair e gates são constantes.
- **AC5.8 — A/B:** Golden Dataset, seed, baseline/candidato, versões, hashes, thresholds e missing data são pré-registrados; nenhuma execução é autorizada por esta SPEC.
- **AC5.9 — Operação:** quota, Tenant, Job, reservation, fencing, idempotência, D/N, partial e retry permanecem imutáveis e rastreáveis.
- **AC5.10 — Não alteração:** PRDs, ADRs, DESIGN, nota imutável e código permanecem fora desta mudança.

## 12. Fora do escopo

- Implementação de `RiskAssessment`, Judge reduction, Blueprint, recipe, validator, worker, endpoint, migration ou telemetria.
- Execução de fixtures, harness, Golden Dataset, A/B, benchmark, smoke, typecheck, lint ou build.
- Mudança de tier, modelo, batch, cenas, gates, repairs, quota, Job, persistência, `ROUTER_MAP` ou provider.
- Ativação de `@1.3`, escrita de `creativeDirection`, promoção de histórico ou catálogo V2.
- Criação/renumeração de Slice, alteração de PRD, ADR, DESIGN, nota imutável ou código.
