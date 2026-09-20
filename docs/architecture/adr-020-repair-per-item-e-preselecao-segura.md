# ADR-020: Repair per-item em CONTENT_BRIEF_REPAIR/HIGH e pré-seleção segura de patterns

## Status

Aceito — consenso backDev + Arquiteto após QA3 (job e26d108f), com correções de re-review.

## Contexto

O smoke QA3 do Duna provou dois defeitos com o desenho então vigente: (1) dois rounds de `CONTENT_BRIEF_GENERATION`/MID não convergem mesmo com checklist por item — C1 (claim absoluto sem evidência) e C3 (`apertar`/`frete grátis` sem evidência + development inválido) persistiram e o job fechou `GEN-REPAIR-EXHAUSTED` com contents=0; (2) causa raiz determinística: `selectBriefPatterns` entrega ao primeiro MID um CTA do catálogo (ex.: "…frete grátis…") que a instrução manda copiar **literalmente**, mas o gate rejeita quando a evidência do produto não sustenta o claim — a instrução e o gate se contradizem e cada round regenera a mesma violação. Prompt e checklist estão esgotados como correção; o defeito é de roteamento e de seleção.

## Decisão

1. **Pré-seleção segura (root cause):** a seleção de patterns (`selectBriefPatterns`/`buildSelectedPatterns`) pré-checa cada hook/CTA do catálogo contra a `EvidenceSnapshot` **antes de qualquer chamada de LLM**, via helper extraído do gate — `ctaTextFactualIssues(text, evidence) → { decision, causes }` — que reusa o MESMO classificador (`classifyFactual`) com os demais campos vazios: seleção e gate não divergem por construção.
2. **Hook não troca mecanismo silenciosamente (blocker do Arquiteto):** o pool deliverable do bucket do `hookMechanism` planejado vazio → **`GEN-PATTERN` antes da LLM** (zero chamadas de briefing) — sem hook de outro bucket.
3. **CTA pode rotacionar entre funções deliverable:** quando o pattern que a rotação ADR-019 escolheria não é deliverable, substitui pelo primeiro deliverable do MESMO bucket (bucket inteiro não-deliverable → bucket deliverable seguinte em ordem estável) e registra `patternReplacements` no `EngineResult`/`IntelligenceRun` — somente `{field: 'cta'|'hook', replacedWithId, reason}`, **nunca texto original ou conteúdo bruto**. Cap de variedade funcional do gate permanece sobre o catálogo; a seleção recalcula a rotação sobre o pool deliverable.
4. Sem NENHUM pattern deliverable no catálogo → **`GEN-PATTERN`** (novo code do union `ContractError`) antes de chamar o provider — fail-closed, sem fabricar fallback.
5. **`CONTENT_BRIEF_REPAIR`** — nova logical task, tier **HIGH**, fora da cadeia de fallback de disponibilidade. É o `Hard Gate Repair`: per-item, uma oportunidade por chamada, saída de exatamente 1 BriefDraft (root JSON com angle/hook/development/script/cta), contexto allowlisted (oportunidade, relevantFacts, selectedPattern seguro, issues, `repairChecklist` booleano, `siblingSummary` determinístico), `repairChecklist` vinculante e substituição por índice com exact-N preservado. O máximo é `GENERATION_MAX_REPAIRS` rounds globais (default atual `2`), com revalidação do conjunto inteiro, inclusive variedade, ao fim de cada round. Item cujo repair falha não substitui naquele round; persistindo a reprovação, a falha objetiva segue ADR-021.
6. **Budget:** deadline da tentativa inclui o pior caso de `GENERATION_MAX_REPAIRS × N × provider timeout`; o valor default atual é `2`.
7. Sem feature flag: rollback = revert do commit, sem migration.

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Roteamento de TODO o brief para HIGH | Rejeitada | Custo alto para todas as gerações; não corrige a contradição literal do prompt |
| Repair individual mantendo MID | Rejeitada | O mesmo modelo que falhou 2× com checklist; capacidade/disciplina não muda |
| json_schema estrito do provider | Rejeitada no MVP | Shape não é semântica; adapter único; não substitui gates |
| Chunks no repair (batch de rejeitados) | Rejeitada | Cardinalidade variável e contaminação entre itens; per-item isola |
| Safe-replace apenas no contexto de repair | Rejeitada | Cura tarde: o pattern inseguro já contaminaria a primeira geração |
| Hook de outro bucket como fallback | Rejeitada | Troca silenciosa do mecanismo planejado; GEN-PATTERN fail-closed é o contrato |

## Consequências

- Positivas: elimina a reprodução determinística da violação (prompt sem contradição); repair com modelo adequado à disciplina de contrato; isolamento de erro por item; exact-N e gates inalterados; custo por tier observável no `IntelligenceRun`; proveniência de pattern audível sem vazar texto.
- Negativas/riscos: pior caso `GENERATION_MAX_REPAIRS × N` chamadas HIGH por job (default atual `2`, N≤10) — custo/latência observáveis e orçados no deadline; repair per-item é cego ao conjunto (mitigado por sibling summary + revalidação do conjunto por round; colisão vira causa no round seguinte); `GEN-PATTERN` para buckets de mecanismo sem hooks deliverable no catálogo é fail-closed honesto — o planejador não deve planejar mecanismos sem repertório; Qwen pode continuar ignorando constraints mesmo em HIGH — decisão subsequente seria de modelo/provider, nunca de relaxamento de gate.

## Adendo — mecanismo deliverable no plano (consenso pós-re-review)

O pool de hooks considerado é o **catálogo elegível por categoria** (`eligibleHookPatterns(skill, productCategory)` — filtro category/categoryScope), computado **uma vez** no engine e passado à `deliverableHookBuckets` e à `selectBriefPatterns`/`buildSelectedPatterns`: seleção e disponibilidade jamais divergem de predicado de categoria. Sem pool elegível deliverable → `GEN-PATTERN` (field `hookMechanism`) **antes de qualquer chamada de plano/briefing**.

Disponibilidade de mecanismo é **factual e por catálogo**. `deliverableHookBuckets(evidence)` (gates.ts, mesmos classificadores) deriva os buckets com ≥1 hook deliverable; o planner recebe `deliverableHookMechanisms` no contexto e a instrução exige um bucket da lista; o `validatePlan` **recomputa** a lista dos fatos (não confia no contexto/modelo) e rejeita mecanismo fora dela com `GEN-VARIETY("hookMechanism sem repertório deliverable", "hookMechanism")` — entra no **retry causal existente via `isHookVarietyError`** (retry recebe a causa; persistindo, fail-closed). Lista vazia → `GEN-PATTERN` antes do plano. **Não há fallback entre mecanismos.** Curadoria de hooks novos no catálogo (trilha B, versionada) aumenta cobertura e nunca substitui o filtro por evidência. PRD/SPEC intocados.

## Adendo 2 — contrato estruturado do repair (consenso pós-QA4 f20ada69)

QA4 provou que HIGH/OpenAI falhou 5/6 repairs pelo mesmo gate de development mesmo com checklist e pré-seleção segura: a obrigação não era verificável para o modelo. Correção estrutural, **sem relaxar gate e sem chamadas novas**:

- **Registro histórico de runtime (superseded pelo ADR-029):** `CONTENT_BRIEF_GENERATION` era `MID`; o tier runtime atual está na tabela canônica do ADR-029.
- **`CONTENT_BRIEF_REPAIR`/HIGH** é `Hard Gate Repair`: retorna um BriefDraft completo por item para corrigir causas objetivas; o hard gate revalida o conjunto e a variedade.
- **Validação em cascata:** `factRef ∈ EvidenceSnapshot` (nunca `product:name`) → `action ∈ DEVELOPMENT_ACTION_STEMS` → `rationale` com conector (`DEVELOPMENT_CONNECTORS`) → `validateContentBriefDraft` no texto → **`validateBriefSet`** no conjunto. **Partes não autorizam texto falho.**
- Contexto do repair ganha `developmentRequirements` server-derived (stems, connectors, `factRefs [{ref, value, terms}]`, `noShotList`, `minGrounding {point 2, rationale 2, context 1}`) + **`repairContrast` per-item** reconstruído dos mesmos facts e **provado por `validDevelopmentPoint`** (contexto efêmero; sem geração/persistência determinística de texto). **`previousBrief` NÃO vai ao contexto** (ancora a paráfrase inválida).
- Aumento de contexto telemetrado (`trustedContextBytes`); budget/exact-N/cenas/metadata intactos. O limite objetivo é `GENERATION_MAX_REPAIRS`; `Semantic Part Repair` é contrato distinto do ADR-029.
- **Escalada de provider/model para esta capability: somente após DUAS QA consecutivas com a MESMA assinatura residual** (benchmark pequeno, decisão registrada) — nunca fallback oculto, nunca relaxamento de gate.

## Adendo 3 — PRODUCT_UNDERSTANDING roteado a HIGH/QUALITY (consenso pós-QA5 538fee44)

Evidência: 3 incidentes de violação de cardinalidade (`purchaseBarriers`) pelo modelo MID em PU (`d0545503`, QA5 — duas respostas 200 Qwen) vs **nenhuma** falha de PU no provider alternativo (QA4 passou PU via fallback de disponibilidade 429; strategy/plan HIGH passaram de primeira). O retry com `contractRepair` foi exercido e falhou fechado — políticas corretas, modelo sem aderência.

Política: `ROUTER_MAP.PRODUCT_UNDERSTANDING = "HIGH"` (→ `LLM_MODEL_QUALITY`); **reasoning mantido em `low`** (extração delimitada; aderência vem do modelo); instruction/validator/retry server-side **inalterados** — 2 tentativas HIGH com `contractRepair`, persistindo fail-closed. **Sem** fallback de schema, cross-provider escalation ou terceiro retry; fallback de disponibilidade segue (HIGH é terminal). Custo: PU por job sobe MID→HIGH (~1 chamada); contagem no `callBudget` inalterada; na prática menos latência que o caminho morto (1 HIGH vs 2 MID + fail). Qwen permanece nos tiers LOW/MID. **Gatilho de benchmark/construção:** PU em HIGH violando cardinalidade 2× → benchmark de provider/model documentado e decisão registrada — nunca relaxamento de gate.

## Registro pós-QA7 — json_schema de PU implementado como mitigação estrutural

Este registro substitui a decisão anterior (registro pós-QA6 e a alternativa "json_schema estrito do provider — rejeitada no MVP") **somente para `PRODUCT_UNDERSTANDING`**: o adapter agora envia `response_format: json_schema` strict com `maxItems` por campo derivado da `CARDINALITY_POLICY` (fonte única — prompt, schema e validador não divergem). Trata-se de **mitigação estrutural, não de garantia**: o schema não substitui o validator server-side nem o retry `contractRepair`, e a validação de contrato permanece a autoridade. Smoke real confirmou aderência parcial — PU válida em um job, mas outra resposta HTTP 200 ainda excedeu o limite: **o provider não garante enforcement de strict/maxItems**. Resposta fora da política continua `GEN-SCHEMA` fail-closed imediato; não há truncamento, preenchimento, fallback silencioso ou terceiro retry (decisões do adendo 3 e ADR-012 preservadas). Benchmark de provider/model (C1/C2/C4, 3× por candidato, critério 3/3) e verificação de compatibilidade real permanecem aprovados e pendentes de autorização de custo; a compatibilidade efetiva do modelo corrente com strict/`maxItems` é ela própria um achado a registrar no benchmark.

## Adendo 5 — redução determinística de hipóteses de PU após retry exaurido (QA7 74d297d7)

Mesmo com schema strict + retry `contractRepair`, providers podem devolver 200 com arrays de **hipóteses** (`coreUseCases…purchaseBarriers`) acima de `CARDINALITY_POLICY`. Hipóteses NÃO são fatos do produto: excesso é inferência não sustentada, não conteúdo. Contrato final: após o retry exaurido, `normalizeUnderstandingCardinality` reduz deterministicamente cada array para os **primeiros max itens** (ordem do próprio model = seu ranking de sustentação), registra `{field, received, kept}` em `EngineResult.understandingReductions` e `IntelligenceRun.metadata`, e o validator revalida TUDO (refs, mínimos, shape). **Nunca fabrica, nunca reordena, nunca aplica a briefs** (ADR-012 permanece para conteúdo); falhas não-cardinalidade (GEN-FACT/shape) seguem fail-closed. Redução é **loud** e observável — nunca silenciosa. PRD/SPEC intocados (hipóteses são internas da engine).

## Relações

ADR-013 (Model Router/tiers), ADR-019 (gate versionada, variedade funcional, cenas), ADR-012 (repair causal e limite de tentativas, fail-closed), ADR-029 (limites atuais de repairs e tiers) e PRD-commerce-intelligence-engine §7.

## Adendo 4 — registro histórico superseded

O contrato semântico `PASS|REPAIR|REJECT`, dois rounds globais e bloqueio por exaustão desta seção foram superseded pelo ADR-029. O contrato vigente separa `Hard Gate Repair` objetivo, limitado por `GENERATION_MAX_REPAIRS`, de `Semantic Part Repair` único por parte `REVIEW`, sem re-Judge; somente hard gates finais decidem `DRAFT`, parcial declarado ou falha.
