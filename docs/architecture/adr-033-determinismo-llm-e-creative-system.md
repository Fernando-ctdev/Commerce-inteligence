# ADR-033: Determinismo × LLM e Creative System na Commerce Intelligence

## Status

Aceito — decisão arquitetural da Etapa 0 da recalibração da Commerce Intelligence. Registra o princípio transversal Determinismo × LLM e introduz o Creative System como conhecimento versionado da `PlatformSkill`. O runtime vigente permanece integralmente o do [ADR-029](./adr-029-pipeline-hibrida-deterministica-e-criativa.md) até evals aprovados conforme a decisão 14. Fonte canônica imutável, registrada pelo nome exato: **"Plano de recalibração da commerce inteligence"** (nota sticky conectada ao Review). Nenhuma implementação de runtime e nenhuma escrita de `creativeDirection` são autorizadas apenas por este ADR (decisão 8).

## Contexto

A implementação atual já consolidou contratos canônicos, IDs server-owned, cardinalidade, factualidade, hard gates, memória, seleção de padrões, variedade, planner skeleton, batching e repair localizado (ADR-012/019/020/021/025/029). Isso deve ser preservado.

Porém a distribuição entre determinismo e LLM está ruim. Para aproximadamente 10 conteúdos, no caminho feliz e sem retries/repairs, a engine chega a ~21 chamadas LLM — 1 Understanding, 1 Mapping, 1 Strategy, 1 Plan, ~3 Brief (batch default 4), 10 Scene Ideas (uma por conteúdo) e ~4 Judge (batch máximo 3) — praticamente todas em `HIGH` (nota, "Estado atual observado no código", ≈L107–175). Isso produz latência alta, custo alto, muitos pontos de falha e mais oportunidades de gate/repair.

Agravantes estruturais observados: `hookMechanism` é eixo de planejamento estreito demais; o catálogo literal de hooks/CTAs (`catalog.json` + `selectBriefPatterns()`) ancora a geração em frases prontas; o repertório atual mistura copy examples, mecanismos, policies e regras de validação.

A nota "Plano de recalibração da commerce inteligence" estabelece o princípio raiz: LLM descobre possibilidades e realiza criatividade; código organiza, combina, seleciona, restringe, distribui, memoriza e valida. Determinismo opera sobre mecanismos e espaços de possibilidades, nunca sobre o texto criativo final.

## Decisão

### 1. Fonte imutável e rastreabilidade

A nota **"Plano de recalibração da commerce inteligence"** é a fonte imutável desta decisão. Seu conteúdo não é copiado nem alterado aqui; o mapeamento abaixo é referencial, por título de seção e linha aproximada (≈L), para rastreabilidade de revisão. Em caso de divergência entre este ADR e a nota, a nota prevalece e o ADR deve ser corrigido.

| Decisão deste ADR | Seção da nota (imutável) |
|---|---|
| 2 — Princípio e matriz de autoridade | ETAPA 0 · "Princípio central" ≈L93–104; "O que deve ser determinístico" ≈L237–280; "O que deve continuar com LLM" ≈L284–308; "Determinismo não deve escrever criatividade" ≈L311–340 |
| 3 — Creative System na Skill | "Creative System — conhecimento criativo canônico" ≈L343–360; "Creative System no código" ≈L834–887; "Organização sugerida do conhecimento" ≈L799–831 |
| 4 — CreativePrimitive | "CreativePrimitive" ≈L363–455 |
| 5 — CreativeRecipe | "CreativeRecipe" ≈L458–510; "Recipes iniciais do MVP" ≈L512–590 (quantidade não vira contrato) |
| 6 — Recipes + composição livre | "Recipes + composição livre" ≈L592–620; ETAPA 3 · "Composição livre" ≈L1703–1710 |
| 7 — Blueprint campo a campo | "CreativeBlueprint" ≈L624–668; "ContentOpportunity + CreativeBlueprint" ≈L672–731; ETAPA 3 · "CreativeBlueprint como decisão canônica do Planner" ≈L1578–1607 |
| 8 — Contrato versionado e proibição de escrita | ETAPA 3 · "Migração de hookMechanism" ≈L1817–1834; "Migração de narrativePattern" ≈L1838–1854; "Ordem de execução" ≈L3018–3061 |
| 9 — Schema de compatibilidade versionado | "Creative System no código" ≈L834–887; ETAPA 3 · "Recipes como constraint sets" ≈L1677–1699 |
| 10 — Catálogo literal fora do prompt | "Evolução do Creative Catalog atual" ≈L733–765; "Papel futuro do catálogo literal" ≈L768–796 |
| 11 — Preservação de gates | "Regra para todas as próximas etapas" ≈L890–911; ETAPA 5 · "Hard Gates" ≈L2431–2466 |
| 12 — Memória versionada | ETAPA 3 · "Product Memory" ≈L1858–1885 |
| 13 — ADR-029 vigente; escopo mínimo | "Objetivo arquitetural" ≈L179–233; "Regra para todas as próximas etapas" ≈L890–911; "Ordem de execução" ≈L3018–3061; "Meta final de runtime" ≈L2940–2980 (hipótese, não contrato) |
| 14 — A/B operacional | ETAPA 6 · "Avaliar arquitetura" ≈L2811–2847; "A/B arquitetural" ≈L2851–2877; "A/B Creative System" ≈L2881–2910 |

### 2. Princípio Determinismo × LLM e matriz de autoridade

Para toda decisão futura da engine: se a decisão não exige interpretação ou criação semântica real, resolver deterministicamente; se exige, usar LLM. Nunca manter uma chamada de LLM apenas porque ela já existe. Vedações simétricas: **a LLM não escolhe entre combinações que o sistema já conhece; o código não escreve situação concreta, hook final, fala, script, payoff ou tom.**

| Campo / decisão | Autoridade | Validação / enforcement |
|---|---|---|
| Fatos do Produto, preço/moeda | Código (Product confirmado) | Fato ≠ inferência; Fact Validator (`SUPPORTED`/`INFERRED_BUT_SAFE`/`UNSUPPORTED`/`CONTRADICTED`) |
| Schema, ownership, IDs persistentes, posições, cardinalidade | Código | `GEN-SCHEMA` fail-closed; campos de ownership proibidos na saída de provider |
| Quota, estados, estágios, retry policy, persistência, idempotência | Código | Transações curtas, lease, `job.id` como chave idempotente |
| Seleção de combinações conhecidas (recipe, primitives, format, product role, mecanismo de hook, função de CTA) | Código (Planner determinístico, pós-eval) | Resolvedor server-side fail-closed (decisão 9) |
| Ranking, alocação de portfólio, diversidade, variedade, memória | Código | Tetos e normalização determinísticos; bump de policy version ao mudar |
| Descoberta comercial e criativa (hipóteses, contextos, situações, desejos) | LLM | Contrato de saída + validação server-side antes de qualquer uso |
| Realização criativa: situação concreta, hook final, falas, script, payoff, tom | LLM | Hard gates + Judge `PASS\|REVIEW`; código jamais produz copy |
| Cenas | LLM (runtime vigente ADR-029) | Gate de cenas; permanecem em `ContentSceneSet` separado |
| Campos do Blueprint (`creativeDirection`) | Código — ver matriz campo a campo na decisão 7 | Resolvedor valida antes de qualquer uso ou persistência |

### 3. Creative System versionado dentro da PlatformSkill

`CreativePrimitive`, `CreativeRecipe` e o resolvedor de compatibilidade são dados declarativos e versionados da `PlatformSkill` (ADR-014), carregados por versão como `load → validate → freeze → expose`. Não são domínio separado, serviço, agente, workflow ou repositório próprio. A Skill continua sem controle sobre jobs, persistência, billing, retry ou estados, e sem dados de tenant.

### 4. CreativePrimitive

Unidade semântica combinável de criatividade ou persuasão, tipada por dimensão fechada: attention mechanism, psychological effect, format, narrative move, product role. Primitives não são frases; nunca carregam copy. IDs são estáveis dentro da versão da Skill. A taxonomia inicial (dimensões e valores) pertence à SPEC; este ADR fixa apenas que ela é dado versionado, não código ramificado.

### 5. CreativeRecipe

Constraint set criativo: combinação conhecidamente coerente de primitives que restringe attention, efeitos psicológicos, formatos compatíveis, narrative moves e papéis do produto. Não é script e não contém frases. O conjunto inicial é curado pela SPEC; **nenhuma quantidade de recipes é contrato deste ADR** — recipes são ponto de partida, não limite da engine, e crescem por evolução versionada da Skill.

### 6. Recipes + composição livre

O Planner prefere recipes conhecidas como caminho seguro e permite composição livre de primitives compatíveis como exploração controlada, sem proporção hardcoded. Composição livre sem `recipeId` é válida somente com primitives compatíveis entre si, com as restrições do creator e com a evidência; caso contrário, falha tipada do resolvedor.

### 7. CreativeBlueprint em `ContentOpportunity` — matriz campo a campo

O Blueprint é a decisão criativa concreta por conteúdo, persistida como `creativeDirection` dentro de `ContentOpportunity` — não como aggregate, tabela própria, job, capability ou entidade paralela:

```ts
type CreativeBlueprint = {
  recipeId?: string;
  attentionMechanisms: string[];
  psychologicalEffects: string[];
  format: string;
  narrativeMoves: string[];
  productRole: string;
};
```

Matriz campo a campo — entrada, autoridade, validação, rejeição/normalização e falha. **Não há fallback criativo em nenhum campo**: rejeição é rejeição; normalização é apenas a operações estáticas sem perda semântica (dedup, ordenação já definida).

| Campo | Entrada | Autoridade | Validação | Rejeição / normalização | Falha estável |
|---|---|---|---|---|---|
| `recipeId` | opcional; ID de recipe catalogada na `platformSkillVersion` usada | Código (Planner determinístico) | ID existe em `recipes` da versão da Skill; ausência = composição livre | ID desconhecido/retirado da versão → rejeita o Blueprint inteiro; nunca substitui por recipe "parecida" | `GEN-CS-REF` |
| `attentionMechanisms[]` | IDs da dimensão attention | Código | Enum fechado; ≥1; unicidade; compatíveis entre si e com a recipe quando presente | Dedup estável preservando primeira ocorrência; ID fora do enum → rejeição sem substituição | `GEN-CS-SCHEMA` / `GEN-CS-COMPAT` |
| `psychologicalEffects[]` | IDs da dimensão psychological effect | Código | Enum fechado; cardinalidade conforme política versionada; compatibilidade com recipe/evidência | Dedup estável; fora do enum ou incompatível → rejeição | `GEN-CS-SCHEMA` / `GEN-CS-COMPAT` |
| `format` | ID único da dimensão format | Código | Enum fechado; exatamente 1; compatível com recipe/attention; produção viável para o creator | Ausente, duplicado ou inválido → rejeição; nunca coerção a formato padrão | `GEN-CS-SCHEMA` / `GEN-CS-ELIGIBILITY` |
| `narrativeMoves[]` | IDs da dimensão narrative move, sequenciados | Código | Enum fechado; sequência permitida pela recipe/compatibilidade; ≥1 | Código jamais reordena para "consertar"; movimento inválido → rejeição | `GEN-CS-COMPAT` |
| `productRole` | ID único da dimensão product role | Código | Enum fechado; compatível com recipe/format | Inválido ou incompatível → rejeição sem valor padrão | `GEN-CS-SCHEMA` / `GEN-CS-COMPAT` |

A LLM não propõe nenhum destes campos: descobre o espaço comercial/criativo (inputs do Planner) e realiza o conteúdo; a construção do Blueprint a partir do pool + Creative System + memória é determinística.

### 8. Contrato versionado de `ContentOpportunity`, writer/reader e proibição de escrita

- **Proibição expressa:** nenhuma escrita de `creativeDirection` em qualquer registro antes de SPEC e PLAN do cutover aprovados explicitamente. Até lá, jobs novos seguem integralmente o contrato vigente do ADR-029 (`hookMechanism` no allowlist do slot, `narrativePattern` opcional).
- **Versão do contrato:** `ContentOpportunity` passa a carregar `opportunityContractVersion` no payload — `1` (hoje: sem `creativeDirection`) e `2` (futuro: com `creativeDirection` validado). A versão é escrita pela engine no momento da persistência; histórico v1 nunca é reescrito nem promovido.
- **Writer:** somente a engine, no caminho do Planner determinístico definido pela SPEC/PLAN aprovadas do cutover. Provider, repair, edit de Content Operations e qualquer outro caminho não escrevem `creativeDirection`.
- **Reader:** leitor versionado lê v1 como está (campos ausentes permanecem ausentes; nada é fabricado) e v2 nativamente.
- **Projeção pública:** `creativeDirection` é interno nesta etapa. Superfícies creator-facing e APIs públicas mantêm a projeção atual; exposição de qualquer campo do Blueprint exige decisão própria em SPEC futura.
- **Derivação legada:** pós-cutover, `hookMechanism` e `narrativePattern` tornam-se projeções derivadas computadas na leitura a partir do `creativeDirection` (função determinística versionada), somente para consumidores legados/gates; nunca persistidas duplicadas no mesmo registro.

### 9. Schema de compatibilidade versionado e falhas estáveis

O Creative System é artefato executável validado no load, no padrão do catálogo atual: `load → validate → freeze → expose`. O schema de compatibilidade é **versionado** (herda a versão da Skill; mudança de compatibilidade exige bump da versão da Skill e registro na geração) e declara como dado: IDs/domínios fechados por dimensão, referências entre recipes e primitives, pares/combinações permitidas e restrições de produção. Validação **semântica mínima** — apenas sintaxe, enum, referência e compatibilidade declarada; o resolvedor não julga mérito criativo.

Falhas usam conjunto fechado e estável de códigos, independentes de texto de mensagem:

- `GEN-CS-VERSION` — versão de Skill/contrato ausente, desconhecida ou incompatível;
- `GEN-CS-SCHEMA` — forma/enum/cardinalidade inválida;
- `GEN-CS-REF` — referência irresolvível (ID de recipe/primitive não existe na versão);
- `GEN-CS-COMPAT` — combinação incompatível entre primitives/recipe/format/role/moves;
- `GEN-CS-ELIGIBILITY` — elegibilidade negada por evidência, restrição do creator ou produção inviável.

Sem fallback criativo, sem reescrita silenciosa, sem fabricação de conteúdo (precedente: alternativa "fallback determinístico de conteúdo" rejeitada no ADR-021). Mensagens sanitizadas; códigos estáveis para diagnóstico e evals.

### 10. Catálogo literal fora do prompt normal — enforcement testável

O corpus literal de hooks/CTAs permanece como referência, pesquisa, corpus, benchmark e material de evolução da Skill (`copy-examples`), porém:

- O caminho normal de geração não envia textos literais do catálogo como exemplos ao provider. A projeção de contexto por capability é allowlist; um **contract test** falha a build se qualquer texto literal de hook/CTA do catálogo (`selectBriefPatterns` incluído) atravessar o contexto de provider no caminho Blueprint-driven.
- O runtime vigente do ADR-029 (incluindo `selectBriefPatterns`) permanece intacto até eval; o enforcement aplica-se a qualquer caminho novo introduzido por esta recalibração.
- Reintrodução de recuperação seletiva de exemplos é experimento isolado: harness próprio, flag explícita, dataset fixado, resultados medidos pelo protocolo da decisão 14 — nunca dependência estrutural do prompt de produção.

### 11. Preservação integral de gates, contratos e entrega

O Blueprint não altera nenhum contrato de validação ou entrega existente:

- Blueprint inválido falha no resolvedor **antes** da persistência; nada persiste sem validação server-side.
- `BriefValidationReport` mantém schema, chave `briefId` e semântica atuais; não ganha campos de Blueprint nesta etapa.
- `factRefs` continuam propostas do modelo, validadas contra o snapshot autorizado; o código jamais infere refs silenciosamente.
- Judge permanece `PASS|REVIEW` por parte, sem re-Judge; `Semantic Part Repair` permanece único por parte `REVIEW`.
- Cenas permanecem contrato separado (`ContentSceneSet`, ADR-019), sem voltar ao brief.
- `SUCCEEDED_PARTIAL` permanece decisão exclusivamente objetiva (hard gates/variedade, ADR-021); anotação semântica nunca cria faltante.
- Idempotência por `job.id`, tenant scoping, quota transacional e sanitização de telemetria permanecem inalterados.

### 12. Memória versionada e idempotência

`ProductMemorySnapshot` ganha `signalsSchemaVersion`. Os novos sinais (`recipeId`, attention mechanisms, psychological effects, format, product role, narrative shape, commercial effect, audience/context e proof pattern) são **aditivos**: snapshots legados são lidos como estão, sem fabricação retroativa; snapshots novos registram a versão usada. `audience/context` e `proof pattern` derivam dos campos opcionais correspondentes da oportunidade realizada e permanecem ausentes quando a oportunidade não os declara — ausência legada continua ausência. Sinais de conteúdo continuam sendo gerados **somente por Contents entregues** (falha objetiva não sinaliza, ADR-021). O retry dos faltantes cria novo job, reutiliza o snapshot corrente e não duplica sinais — idempotência preservada por `job.id`/constraints existentes. Sem embeddings, banco vetorial ou judge LLM de variedade/memória (ADR-004).

### 13. ADR-029 vigente; escopo mínimo comprovado

Nenhuma capability, tier, retry, fallback, gate ou repair muda por este ADR. Este ADR autoriza somente: o registro do princípio, o Creative System como dado versionado da Skill, o contrato versionado futuro do Blueprint (leitura/projeção/derivação) e os protocolos de eval. Candidatos a mudança de runtime — `CONTENT_PLAN_GENERATION` opcional/removido como chamada obrigatória, `CONTENT_SCENE_IDEAS` integrado ao Brief ou reduzido por scene skeleton derivado, Judge por risco, rebaixamento de tier — exigem A/B prévio aprovado (decisão 14) e seguem o **menor caminho comprovado**: uma mudança por vez, sempre a menor que a evidência suportar, sem empacotar cortes de chamada. As metas de runtime da nota (~3–5 chamadas na primeira geração; ~1–2 nas posteriores com reuso) são hipótese de arquitetura a validar, não contrato.

### 14. Protocolo A/B operacional — gate formal de supersede

Toda migração LLM → código e toda mudança de runtime decorrente desta recalibração exigem A/B **pareado e operacional**, com artefatos obrigatórios:

1. **Protocolo pareado:** braço baseline (runtime ADR-029, fixado por commit/engine version) e braço candidato recebem exatamente os mesmos inputs — fatos e evidência do Produto, creator context, memory snapshot — com mesmo Golden Dataset versionado, mesma `platformSkillVersion`, mesmo modelo e tier por par, e mesmo seed derivado do job.
2. **Fixação prévia:** baseline, dataset, modelo/tier, versão da Skill e seed são registrados no protocolo **antes** da execução; qualquer alteração invalida o experimento e exige novo protocolo.
3. **Thresholds versionados antes do experimento:** critérios quantitativos de não-regressão (factualidade, diversidade multi-dimensão, naturalidade/criatividade/templating por rubrica cega, repair rate, custo, latência p50/p95, taxa de falha/parcial) são definidos e versionados no documento de thresholds **antes** da coleta; este ADR não fixa valores. Economia sozinha é insuficiente; o candidato deve ser igual ou melhor em todos os critérios.
4. **Análise por categoria:** resultados são reportados no agregado **e** por categoria de produto do Golden Dataset. **Qualquer regressão em qualquer critério, no agregado ou em qualquer categoria, reprova o experimento.** Não existe regressão justificável sob o rótulo de não-regressão; o protocolo não prevê escape por justificativa no relatório. Exceção, se alguma vez for considerada, exige aprovação explícita e prévia do usuário registrada no protocolo versionado antes da coleta — e, mesmo assim, não produz supersede automático: a mudança segue dependendo de relatório aprovado conforme o item 6, com a exceção citada nele.
5. **Relatório obrigatório:** artefato persistido e versionado com braços, hashes/versões de tudo que foi fixado, métricas por critério e por categoria, veredito e dados suficientes para reprodução. Sem relatório, o experimento não existe.
6. **Autoridade formal:** o relatório é revisado pelo Software Architect e aprovado explicitamente pelo usuário antes de qualquer efeito. **Sem relatório aprovado, ADR-029 permanece vigente integralmente e nenhuma supersede parcial é registrada neste ADR.** A supersede, quando aprovada, é registrada aqui com referência ao relatório.

## Não-objetivos

- Não remove capabilities, tiers, gates, Judge ou repairs; não altera o `ROUTER_MAP` vigente.
- Não autoriza escrita de `creativeDirection` antes de SPEC/PLAN do cutover aprovados.
- Não cria `RecipeService`, `RecipeAgent`, `RecipeEngine`, `RecipeRepository`, domínio separado, serviço ou agente.
- Não introduz embeddings, banco vetorial, deduplicação semântica ou judge LLM de variedade/memória.
- Não transforma a engine em template engine: código não escreve situação, hook, fala, script ou payoff.
- Não fixa quantidade de recipes, proporção recipe/free, número de chamadas, distribuição de portfólio nem thresholds de eval como contrato.
- Não altera `BriefValidationReport`, `factRefs`, `PASS|REVIEW`, cenas separadas, repair único ou o parcial objetivo do ADR-021.
- Não altera PRD, DESIGN, SLICES, SPEC, PLAN, código ou a nota canônica nesta rodada.

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Manter o runtime do ADR-029 sem mudança | Rejeitada | Preserva custo/latência altos e ancoragem literal do catálogo. |
| Editar o ADR-029 in-place | Rejeitada | Mudança de contrato canônico do plano sem trilha própria; perderia o runtime vigente como baseline. |
| ADR novo com supersede parcial condicionada a relatório A/B aprovado (escolhida) | Princípio registrado agora; runtime só muda com evidência formal | Convivência temporária de duas decisões até o cutover. |
| Creative System como domínio/serviço próprio | Rejeitada | Paralelismo vedado por ADR-014 e padrões proibidos dos PRINCIPLES. |
| Blueprint como entidade/aggregate paralelo | Rejeitada | Duplicaria a decisão de conteúdo já representada em `ContentOpportunity`. |
| Blueprint proposto pela LLM | Rejeitada | Combinação entre possibilidades conhecidas é seleção, não criação; autoridade do código (nota, "Regra para todas as próximas etapas"). |
| Fallback criativo ao falhar resolvedor | Rejeitada | Fabricação de conteúdo vedada (ADR-012/021); erro tipado fail-closed com código estável. |
| Remover o catálogo literal imediatamente | Rejeitada | Perde corpus de benchmark/eval; saída do caminho normal com enforcement testável é suficiente agora. |

## Consequências

Positivas:

- Fonte imutável nomeada e mapeada por seção/linha: toda decisão é rastreável à nota sem copiá-la.
- Matriz campo a campo do Blueprint elimina ambiguidade de entrada/autoridade/validação/rejeição/falha.
- Contrato versionado com writer/reader/projeção/derivação definidos e proibição de escrita prematura.
- Falhas estáveis (`GEN-CS-*`) tornam o resolvedor auditável e testável por contract test.
- A/B operacional com fixação prévia, thresholds versionados, análise por categoria, relatório obrigatório e autoridade formal impede cutover por economia ou por anedota.

Negativas e riscos:

- A Skill ganha peso (schemas, compatibilidade versionada, curadoria de recipes); maior custo de engenharia.
- Qualidade de primitives/recipes é hipótese até o Golden Dataset; recipe mal calibrada degrada em silêncio — mitigado por evals e versionamento, como em ADR-014.
- Cutover exige SPEC/PLAN próprios, leitor versionado e contract tests de projeção/derivação — caminho longo e deliberado.
- Nenhuma melhoria é reivindicável sem baseline e relatório aprovados; a Etapa 1 (auditoria semântica + custo/chamadas) é pré-requisito.
- Variedade precisa passar a observar múltiplas dimensões do Blueprint, senão dois conteúdos com hooks diferentes e mesmo Blueprint essencial permanecem próximos.

## Compatibilidade histórica

- Registros existentes (planos, oportunidades, briefs, reports, snapshots, runs) permanecem válidos sob a política vigente na sua execução; nenhum campo é fabricado retroativamente.
- Leitor versionado trata `hookMechanism`/`narrativePattern` como legado; revalidação sob versão de política diferente continua `GEN-GATE-VERSION` (ADR-019), nunca REPAIR falso.
- `platformSkillVersion` por geração preserva a reprodução de comportamento histórico; o Creative System é função da versão da Skill usada.
- Snapshots de memória legados são lidos como estão; novos sinais existem somente em snapshots novos, sob `signalsSchemaVersion` registrada.
- `BriefValidationReport`, `DevelopmentBullet` v2 e leitores de payload de brief não são alterados por este ADR.

## Segurança / Operação

- Creative System é dado estático versionado; não recebe dados de tenant, não controla workflow, não acessa jobs/persistência/quota (ADR-014).
- Saída de provider continua não confiável; nenhum campo do Blueprint provém do provider no contrato definido por este ADR.
- Contexto mínimo por capability preservado: o Brief Generator recebe Blueprint e projeções compactas allowlisted, nunca o corpus literal completo nem o agregado do Product.
- Erros do resolvedor usam códigos estáveis e mensagens sanitizadas; nada do Creative System vira UI.

## Relações

- [ADR-002](./adr-002-engine-estrategica-como-core.md) — engine como core.
- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — persistência, memória e rastreabilidade.
- [ADR-004](./adr-004-variedade-por-memoria-estruturada.md) — variedade determinística; memória sem embeddings.
- [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) — contratos canônicos, políticas versionadas e Golden Dataset.
- [ADR-013](./adr-013-model-router-e-intelligence-tier.md) — router, tiers e evals.
- [ADR-014](./adr-014-platform-skill-versionada.md) — Skill versionada; recebe o Creative System.
- [ADR-019](./adr-019-gate-versionada-e-cenas.md), [ADR-020](./adr-020-repair-per-item-e-preselecao-segura.md), [ADR-021](./adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md), [ADR-025](./adr-025-batching-semantico-de-curadoria.md) — gates, repair, parcial declarado e batching permanecem.
- [ADR-029](./adr-029-pipeline-hibrida-deterministica-e-criativa.md) — runtime vigente até relatório A/B aprovado; supersede parcial futura registrada aqui.
- Nota canônica imutável **"Plano de recalibração da commerce inteligence"** — fonte do princípio e das etapas 1–6 (mapeamento na decisão 1).
