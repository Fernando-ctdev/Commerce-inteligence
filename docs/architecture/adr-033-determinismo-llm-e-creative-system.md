# ADR-033: Engine V2 — Determinismo × LLM, Creative System e cutover controlado

## Status

**Aceito — `V2_DEFAULT_PENDING_ACCEPTANCE`.**

A Engine V2 é o runtime padrão de produção por direção explícita do usuário, efetiva no commit `8d1833b`. Esta decisão operacional não equivale à aceitação arquitetural final da recalibração: o estado formal permanece `PENDING` até a Etapa 6 comparar o pipeline inteiro, o relatório versionado ser revisado pelo Software Architect e o usuário aprová-lo explicitamente.

O [ADR-029](./adr-029-pipeline-hibrida-deterministica-e-criativa.md) permanece aceito como baseline histórico e experimental e como autoridade para invariantes que este ADR preserva. Ele não descreve mais o call graph padrão de produção. Sua supersessão formal como runtime só será registrada quando este ADR alcançar `V2_ACCEPTED`.

A fonte canônica imutável desta decisão é a nota sticky **"Plano de recalibração da commerce inteligence"**. Em divergência, a nota prevalece e este ADR deve ser corrigido.

## Contexto

A Commerce Intelligence deve responder como criar conteúdo capaz de fazer alguém querer comprar um Produto. Compra não é exclusivamente racional: desejo, curiosidade, identificação, humor, confiança, impulso, percepção de valor, demonstração e forma criativa podem ser o próprio mecanismo comercial.

O runtime do ADR-029 consolidou contratos canônicos, IDs server-owned, factualidade, cardinalidade, hard gates, variedade, batching, repair localizado, cenas separadas, job durável e parcial declarado. Entretanto, para aproximadamente dez conteúdos, seu caminho feliz podia chegar a cerca de 21 chamadas LLM: Understanding, Mapping, Strategy, Plan, Briefs, uma Scene Ideas por Content e Judge em lotes. O catálogo literal de hooks/CTAs também participava do prompt normal.

A nota determina:

> **LLM descobre possibilidades e realiza criatividade. Código organiza, combina, seleciona, restringe, distribui, memoriza e valida sempre que isso puder ser feito sem perda semântica.**

O cutover V2 removeu a chamada obrigatória de Plan, substituiu cenas por Scene Skeleton e introduziu Planner/Blueprint determinísticos. A revisão arquitetural posterior identificou lacunas de fechamento: Blueprint ainda não canônico no `ContentOpportunity`, memória V2 incompleta, Risk Detector posterior ao Judge, skill/proveniência dividida, prompt V2 ainda referindo `selectedPatterns` e Etapa 6 limitada ao experimento de cobertura do Judge.

## Tensão entre runtime e aprovação formal

Esta emenda resolve explicitamente a tensão:

1. **Runtime:** V2 continua sendo o padrão de produção porque o usuário assim determinou. Este ADR não autoriza rollback implícito para ADR-029.
2. **Conformidade:** V2 ainda não pode ser declarada integralmente conforme à nota nem formalmente aceita enquanto os contratos e gates abaixo não forem satisfeitos.
3. **Baseline:** ADR-029 continua reproduzível e fixado por commit para comparação da Etapa 6; não volta a ser default por ausência de aprovação.
4. **Falha da Etapa 6:** mantém V2 em produção no estado `V2_DEFAULT_PENDING_ACCEPTANCE`, registra os critérios reprovados, corrige o candidato e repete o protocolo. Rollback exige nova decisão explícita do usuário.
5. **Fechamento:** somente relatório E6 integral aprovado pelo Software Architect e aceito explicitamente pelo usuário muda o status para `V2_ACCEPTED` e formaliza a supersessão do ADR-029 como runtime.

`V2_DEFAULT_PENDING_ACCEPTANCE` e `V2_ACCEPTED` são estados documentais deste ADR; não são estados de Job, campos de API ou enums de produto.

**Autorização de implementação candidata:** por instrução expressa do usuário, as [SPEC](../specs/slice-003/SPEC.md) e [PLAN](../plans/slice-003/PLAN.md) canônicas do Slice 003 autorizam implementar as Etapas 2–6 nesta feature branch: Discovery V2/Strategy determinística; `PLANNER_POLICY_V1` e seus contratos históricos preservados, com seleção `PLANNER_POLICY_V2` na API `planPortfolio(input)`; Blueprint/memória; Skill/prompt; Risk pré-Judge seletivo; preparação e execução E2E/E6. A direção atual atribui a operação ao Maestro/time e supersede as restrições anteriores de A/B exclusiva pelo usuário ou de não execução pelo time. A/B individual por migração não é obrigatória. A execução end-to-end segue o freeze e as aprovações da [SPEC E6](../specs/etapa-6-golden-evals/SPEC.md); esta autorização não é coleta, merge, deploy ou aceite formal `V2_ACCEPTED`.

## Decisão

### 1. Autoridade e rastreabilidade

| Área | Fonte principal |
|---|---|
| Princípio Determinismo × LLM, Creative System e ordem das etapas | Nota canônica, Etapas 0–6 |
| Produto, comportamento humano e resultado esperado | `PRD.md` e `PRD-commerce-intelligence-engine.md` |
| Forma do sistema e limites de módulos | `SYSTEM-DESIGN.md` |
| Contratos, memória, Skill, gates, partial e baseline | ADR-003/004/012/013/014/019/021/029 |
| Práticas permanentes | `PRINCIPLES.md` |
| Sequência de entrega | `SLICES.md` |
| Contratos operacionais detalhados | SPEC/PLAN aplicáveis |

A direção explícita do usuário define V2 como runtime padrão. Ela não dispensa versionamento, validação, avaliação ou registro de proveniência.

### 2. Matriz de autoridade

| Campo / decisão | Autoridade | Enforcement |
|---|---|---|
| Fatos do Produto, preço e moeda | Código a partir do Product confirmado | Fato ≠ inferência; Fact Validator |
| Schema, ownership, IDs, posições e cardinalidade | Código | Validação fail-closed; provider não possui autoridade |
| Quota, estado, retry, persistência e idempotência | Código | Transações curtas, lease, fencing e `job.id` |
| Discovery comercial/criativa | LLM | Contrato V2 e evidências allowlisted |
| Strategy aggregation/ranking | Código | Política versionada e determinística |
| Recipe, primitives, format, product role e Blueprint | Planner determinístico | Creative System versionado e fail-closed |
| Ranking, MMR, variedade e memória | Código | Policies versionadas e seed controlado |
| Hook final, situação concreta, fala, script, payoff e tom | LLM | Brief V2, hard gates e Judge seletivo |
| Scene Skeleton | Código | Blueprint + fatos autorizados; gate de cenas |
| Qualidade objetiva e elegibilidade | Hard gates | `PASS\|REPAIR\|REJECT` objetivo |
| Suspeita semântica | Risk Detector determinístico | Registry/policy versionados |
| Qualidade semântica difícil | Judge LLM seletivo | `PASS\|REVIEW`; sem autoridade de entrega |

Código não escreve copy criativa. LLM não escolhe combinações conhecidas, não controla workflow e não escreve Blueprint.

### 3. Product Facts, Discovery V2 e Strategy

O contrato-alvo da Etapa 2 é:

```text
Product Facts confirmados
→ projeção factual determinística
→ Commercial + Creative Discovery V2
→ Strategy V2 majoritariamente determinística
```

`PRODUCT_UNDERSTANDING` não permanece chamada obrigatória no alvo. A capability atual `COMMERCIAL_OPPORTUNITY_MAPPING` evolui, sem criar agente ou serviço paralelo, para uma Discovery forte:

```ts
type CommercialCreativeDiscoveryV2 = {
  discoveryContractVersion: "2";
  hypotheses: Array<{
    sourceOpportunityId: string;
    commercialObjective: string;
    angle: string;
    coreMessage: string;
    desiredViewerResponse?: string;
    audience?: string;
    situation?: string;
    desire?: string;
    identification?: string;
    curiosity?: string;
    aspiration?: string;
    humorPotential?: string;
    visualPotential?: string;
    pain?: string;
    objection?: string;
    desiredOutcome?: string;
    relevantCapabilities: string[];
    benefits: string[];
    proofOptions: string[];
    commercialEffects: string[];
    evidenceRefs: string[];
    confidence: number;
  }>;
};
```

Dor, objeção e necessidade prévia são opcionais. Discovery pode propor hipóteses; não pode inventar atributos do Produto. `commercialObjective`, `angle` e `coreMessage` são **hipóteses textuais obrigatórias da LLM Discovery**, não copy fabricada pela Strategy/Planner; `desiredViewerResponse` é hipótese opcional. O parser rejeita ausência, vazio, referência factual inválida ou IDs de origem repetidos. `sourceOpportunityId` é atribuído pelo servidor por hipótese após validação e permanece estável na Discovery persistida, Strategy, Planner e Opportunity. `ProductStrategyV2` agrega, seleciona, ordena e projeta deterministicamente a Discovery validada. A retirada de Product Understanding e Strategy LLM exige validação comportamental na etapa; o efeito agregado será avaliado na A/B end-to-end conduzida pelo Maestro/time após concluir as Etapas 2–6 sob freeze aprovado, sem A/B individual obrigatória.

**Persistência canônica, sem tabela nova:** o parser primeiro valida e normaliza `CommercialCreativeDiscoveryV2` em forma JSON-safe, omitindo chaves opcionais ausentes ou `undefined` (não as converte em `null` nem em string vazia), e preservando todas as hipóteses, dimensões presentes, `confidence`, `evidenceRefs` e IDs server-owned, inclusive as não selecionadas. Esse envelope normalizado é a fonte imutável por job em `IntelligenceRun.metadata.discoveryV2`. `discoveryHash = sha256Hex(canonicalSerialization(discoveryV2))`: SHA-256 dos bytes UTF-8 de `CANONICAL_SERIALIZATION_V1` sobre **o mesmo envelope normalizado/validado persistido, sem o próprio hash**, usando as funções existentes [`canonicalSerialization`/`sha256Hex`](../../src/modules/commerce-intelligence/planner-harness/canonical.ts). O hash fica separado do envelope; releitura JSON-safe recalcula exatamente o mesmo hash ou falha fechado, sem nova normalização que altere bytes ou introduza opcionais.

`ProductStrategy.payload` é a fonte da projeção selecionada e versionada: contém `strategyContractVersion`, `strategyPolicyVersion`, `sourceDiscoveryRef: { intelligenceRunId, discoveryContractVersion, discoveryHash }` e seleção com `sourceOpportunityIds`/`evidenceRefs` autorizados, além dos campos da Strategy; não copia o pool. O reader resolve o run original no mesmo Tenant, recalcula o hash pelo algoritmo acima e falha fechado se versão, hash, IDs selecionados ou refs divergirem da Discovery. A projeção Strategy → Planner conserva esse vínculo; hipóteses não selecionadas permanecem na Discovery. `ContentOpportunity.payload` guarda somente a decisão daquele Content e seu `creativeDirection` canônico, `sourceOpportunityId` e proveniência necessária para resolver a origem, nunca o pool completo ou segunda fonte do Blueprint. Histórico v1 permanece intacto. Os campos JSON existentes (`IntelligenceRun.metadata`, `ProductStrategy.payload`, `ContentOpportunity.payload`) suportam a evolução sem migration ou tabela nova.

**Projeção normativa sem troca de papéis semânticos:** seleção/ordem por policy versionada sobre IDs de hipóteses validadas; Strategy persiste `sourceOpportunityIds` nessa ordem e `sourceDiscoveryRef`. `primaryPositioning` é o `coreMessage` da primeira hipótese selecionada; `audiences` contém somente `audience` presente, `priorityBenefits` somente `benefits`, `priorityObjections` somente `objection` presente, `priorityArguments` somente `coreMessage`, `priorityAngles` somente `angle`, sempre com deduplicação estável na ordem selecionada. `communicationPrinciples` deriva das regras versionadas da Skill, não de efeitos comerciais nem de copy inventada. Se nenhum valor sustenta um campo opcional, manter array vazio conforme contrato; se campo obrigatório não puder ser satisfeito por hipótese validada, falhar fechado. `commercialEffects` são exclusivamente IDs de efeitos comerciais usados pelo Planner/variedade/memória: nunca viram `audiences` ou `benefits`. `relevantCapabilities`, `benefits`, `proofOptions`, `evidenceRefs` e demais hipóteses preservam seus significados e proveniência na Discovery; Strategy referencia seleção sem copiar o pool completo.

**Handoff Strategy → Planner:** resolver no mesmo Tenant os `sourceOpportunityIds` selecionados contra `IntelligenceRun.metadata.discoveryV2` e verificar versão/hash/refs; construir `CommercialDiscoveryPool.evidenceCatalog` do catálogo factual validado e uma `CommercialDiscoveryOpportunity` por hipótese selecionada, na mesma ordem: `sourceOpportunityId`, `commercialObjective`, `angle`, `coreMessage`, `commercialEffects` e `evidenceRefs` são cópias exatas dos campos de origem (refs convertidas aos objetos `EvidenceRef` do catálogo autorizado, sem sintetizar hash/ref); `desiredViewerResponse` copia o opcional; `audienceContext = audience ?? situation` somente quando presente; `proofPattern = proofOptions[0]` somente quando presente. O pool inteiro permanece em Discovery; a Strategy conserva apenas sua seleção e agregados, sem perder hipóteses não selecionadas. O Planner puro constrói Blueprint/novelty/posições e devolve `PlannedOpportunityV2` com esses três textos inalterados; engine persiste os textos e `creativeDirection` na `ContentOpportunity` V2. Não derivar objetivo de `desire`/`desiredOutcome`/`sellingArgument`, ângulo de `benefits`/`relevantCapabilities` nem efeito comercial de `benefits`: esse fallback do adapter atual não é o contrato-alvo.

**Evolução autorizada da seleção do Planner (Etapa 3):** `PlannerInput.plannerPolicyVersion = "PLANNER_POLICY_V2"` seleciona a policy versionada na API existente `planPortfolio(input)`; `PLANNER_POLICY_V1` e seus contratos, fixtures, policies e testes permanecem intactos para reprodução, sem fallback automático de V2 para V1. O runtime candidato usa V2 e registra literalmente `PLANNER_POLICY_V2` em `IntelligenceRun.metadata.plannerProvenance.plannerPolicyVersion`, junto de `plannerSeed`, `plannerInputHash`, `plannerOutputHash` e `plannerBinding`, sem copiar `plannedV2`/Blueprint. A derivação versionada da seed usa o `plannerPolicyVersion` **efetivo** (V2 para o runtime V2, nunca V1 rotulado como V2), job/quantidade, binding e fingerprint factual autorizado da entrada; input idêntico reproduz seed idêntica. `plannerInputHash = sha256Hex(canonicalSerialization(PlannerInput efetivo))` inclui policy V2, seed, pool completo com opcionais, creator constraints e memória; `plannerOutputHash = sha256Hex(canonicalSerialization(opportunities selecionadas na ordem retornada))`. A versão V1 mantém sua derivação atual; reentrada com o mesmo input/seed/policy produz a mesma ordem e hashes. Hashes são proveniência, não substituem a validação tenant-scoped da Discovery.

No shape versionado de `PlannerInput` V2, `compatibilityPolicyVersion = "CREATIVE_COMPATIBILITY_V2"` e `creativeSystemHash` do Creative System efetivamente carregado são campos obrigatórios do input hashado; `IntelligenceRun.metadata.plannerProvenance` guarda ambos, junto do binding, sem payload do catálogo ou Blueprint. V1 não recebe esses campos. Versão ou hash divergente na execução/reentrada falha fechado (`GEN-CS-VERSION`), sem imputar proveniência da fixture.

V2 recebe o pool Discovery **exato** de IDs selecionados na ordem da Strategy; não omite opcionais presentes. A sequência é: validar primitives e fatos/evidências → compatibilidade derivada dos constraint sets das recipes → formato × papel pelo mapa explícito → Creator Constraints → production feasibility → ranking → diversidade/MMR **soft** subordinada ao ranking comercial e à Product Memory. Composição livre omite `recipeId`, combina primitives pairwise compatíveis mesmo sem corresponder a uma recipe completa; `assertFreeCompositionCooccurrence` rejeita par sem suporte em recipe, sem fallback para recipe-backed. `GEN-CS-COMPAT` se todas as candidatas foram rejeitadas por compatibilidade; `GEN-PLANNER-NO-CANDIDATES` para ausência por outro gate; schema/ref/version e overflow preservam seus erros terminais. Selecionar exatamente N com `sourceOpportunityId` únicos para N=1–10 **se e somente se** o conjunto elegível completo tiver N origens distintas; menos de N retorna `GEN-PLANNER-DIVERSITY`, sem quotas de variedade, parcial, redução de N nem fabricação de origem. Caller não reranqueia nem filtra após seleção.
Na ausência total de elegíveis, `GEN-CS-COMPAT` aplica-se somente quando **todas** as rejeições de candidatas foram por incompatibilidade pairwise; qualquer rejeição por outra causa de elegibilidade usa `GEN-PLANNER-NO-CANDIDATES` (erros terminais de schema/ref/version e overflow conservam precedência). Com ao menos um elegível, a insuficiência de origens usa exclusivamente `GEN-PLANNER-DIVERSITY`.

**Enumeração V2:** por origem incluir recipe-backed e composições livres (`recipeId` ausente) de subconjuntos ordered de 1–2 attentionMechanisms, sets de 1–3 psychologicalEffects, formatos/papéis do mapa explícito e sequências integrais ordered de narrativa declaradas em recipes (1–6 moves). Admitir a candidata livre somente quando cada par de IDs de dimensões diferentes coexistir em ao menos uma recipe, exceto formato × papel, sujeito exclusivamente a `formatsByProductRole`; pares distintos podem ser sustentados por recipes distintas. A candidata não precisa corresponder à recipe completa. Nunca inventar transições narrativas, usar `["setup","payoff"]` fixo, prefixos arbitrários, variantes `2 × 71` V1 ou cases globais. Contar brutos de todas as origens **antes** de dedup/elegibilidade; acima de `maxRawCandidates=65536`, `GEN-PLANNER-ENUMERATION-LIMIT` fail-closed, sem truncar ou aplicar cap posterior. Deduplicar elegíveis por `canonicalCandidateKey`, ordenar por source ID e key UTF-8 crescentes; em cada uma das N escolhas excluir só origens já selecionadas. Comparar estritamente `relevance↓`, `commercialFit↓`, `novelty↓`, `memoryDistance↓`, `IDsNovos↓`, distância MMR V2 à seleção parcial↓, presença de `recipeId`↓, `tieHash(seed,candidateKey)↑ UTF-8`, `candidateKey↑ UTF-8`; distância MMR é `1_000_000−max(similarityV2 arredondada com selecionados)` ou `1_000_000` sem selecionados, sem pesos de MMR V1 e sem rejeição hard. Verificar exact-N no conjunto elegível completo; V1 mantém enumeração, cap, score e comparadores.

**Sinais V2:** `SCALE=1_000_000`, `roundHalfUp(x)=floor(x+0.5)`, `norm(x)=roundHalfUp(SCALE×clamp(x,0,1))`, `ratio(a,b)=norm(a/max(1,b))`; maior é melhor. `relevance=ratio(validatedEvidenceRefs também presentes no catálogo Product Facts autorizado, validatedEvidenceRefs)`; `commercialFit=ratio(commercialEffects distintos NFC da origem validada,3)` (divisor existente). `novelty=norm(1−matches/9)` nas dimensões recipeId, attention primária, psychologicalEffects, format, productRole, narrativa ordered, commercialEffects, audienceContext, proofPattern; match se coincide com algum sinal histórico, arrays de effects como sets, ausência não coincide. `memoryDistance` usa **somente** `similarityV2` normalizada pelos pesos aplicáveis definida abaixo; memória vazia produz `novelty=memoryDistance=SCALE`. `IDsNovos` conta sem pesos IDs ainda não escolhidos de attentionMechanisms, format e recipeId presente, separadamente por dimensão. Ranking lexicográfico integral: relevance↓, commercialFit↓, novelty↓, memoryDistance↓, IDsNovos↓, distância MMR V2 à seleção parcial↓, presença de recipeId↓, tieHash↑ UTF-8, candidateKey↑ UTF-8. O MMR é desempate soft, não usa a penalidade `mmrPenalty` V1 nem supera prioridade comercial/memória.

**Preferência recipe-backed (correção localizada da Etapa 3):** após distância MMR e antes de `tieHash`, comparar presença de `recipeId` (presente primeiro). Esse desempate concretiza o caminho preferencial conhecido sem superar relevância, fit comercial, novidade, memória ou diversidade, sem impor proporção recipe/free e sem impedir uma composição livre mais adequada.

**Similaridade estrutural exclusiva V2:** cada comparação de effects comerciais/psicológicos como sets canônicos não vazios, narrativa como sequência ordered não vazia, e escalares recipeId, atenção primária (`attentionMechanisms[0]`), formato e papel definidos/não vazios vale `1_000_000` se coincide, senão `0`. Para cada sinal histórico, `A` é a soma dos pesos **aplicáveis** entre `Ecom=250`, `Epsi=200`, `Recipe=150`, `AttentionPrimary=150`, `Format=100`, `Role=50`, `Narrative=100`; um peso só entra em `A` se ambos os lados têm valor presente para a dimensão (arrays não vazios, escalares definidos/não vazios). Em particular, `recipeId` ausente na composição livre ou no sinal exclui `Recipe` do numerador e denominador; não vira mismatch. `similarityV2 = A === 0 ? 0 : floor((Σ pesoAplicável × coincidênciaEmEscala)/A + 0.5)`, inteiro `[0,1_000_000]`. Assim dois Blueprints livres idênticos, inclusive suas dimensões comparáveis, têm `similarityV2=1_000_000` mesmo sem recipeId. `maxMemorySimilarity = 0` sem sinais, senão `max` das similaridades V2 **já arredondadas** por sinal; `memoryDistance = 1_000_000 − maxMemorySimilarity`, sem novo arredondamento. O mesmo cálculo V2 de similaridade alimenta o desempate MMR soft da seleção parcial, não as fórmulas/pesos/`structuralSimilarity` V1 existentes.

**Chave e desempate V2 (helpers históricos reutilizados, V1 intocado):** `canonicalCandidateKey = sha256Hex(canonicalSerialization(["PLANNER_CANDIDATE_V1", sourceOpportunityId, canonicalSet(validatedEvidenceRefs), recipeId === undefined ? ["absent"] : recipeId, canonicalOrdered(attentionMechanisms), canonicalSet(psychologicalEffects), format, canonicalOrdered(narrativeMoves), productRole, angle, canonicalSet(noveltyTargets)]))`. `canonicalSerialization` é `JSON.stringify` compacto da árvore tagged `["absent"]|["null"]|["string", NFC]|["number", decimal ASCII finito]|["boolean", valor]|["array", nós]|["set", nós]|["object", pares]`; objeto ordena chaves NFC por bytes UTF-8, arrays `canonicalOrdered` preservam ordem, `canonicalSet` deduplica por JSON canônico e ordena por bytes UTF-8, opcionais ausentes não equivalem a null/vazio. A função histórica serializa também os nós retornados por `canonicalSet`/`canonicalOrdered` no array externo; **não** substituir por JSON simples ou reimplementar encoding. `sha256Hex` aplica SHA-256 aos bytes UTF-8 e devolve 64 hex lowercase. `tieHash(seed, candidateKey) = sha256Hex("PLANNER_TIE_V1\0" + seed + "\0" + candidateKey)`; seed e key são strings já resolvidas, `\0` é byte NUL UTF-8. Ordenação de source/key/tie compara bytes UTF-8 (`compareUtf8`, crescente), não locale nem ordem de inserção.

Trade-off aceito pelo usuário: V2 avalia todas as candidatas dentro do limite bruto, sem cap de seleção posterior nem quotas rígidas de variedade. A decisão não antecipa Skill operacional/realização de Brief (Etapa 4), Risk/Hard Gates (Etapa 5) nem E6 (Etapa 6).

**Decisão de domínio e teto V2 (2026-09-30):** o usuário confirmou que todos os cruzamentos alternativos intrarecipe de `failure-humor-resolution` e `tryon-transformation-desire` são válidos; nenhum par é vetado e o catálogo/hash da Skill permanece inalterado. O usuário escolheu elevar o teto bruto, em vez de restringir as recipes ou falhar sistematicamente com `N=10`. Contagem estática do catálogo `@1.3`: 802 variantes recipe-backed e 2.929 composições livres com suporte pairwise por origem; dez origens somam até 37.310 candidatas suportadas antes de deduplicação e de filtros de creator/produção. `PLANNER_POLICY_V2` limita a **65.536** candidatas suportadas brutas somadas entre origens; V1 mantém 4.096. A enumeração usa os constraint sets das recipes e o mapa formato × papel para não materializar o produto cartesiano incompatível. O contador inclui variantes recipe-backed e livres antes de deduplicação e demais gates de elegibilidade; incompatibilidade pairwise é eliminada na construção, sem substituir ou truncar candidatas. Acima do teto, falhar fechado com `GEN-PLANNER-ENUMERATION-LIMIT`. O teto é guarda de recurso, não quota de seleção: dentro dele todas as candidatas suportadas são avaliadas. Medir tempo/memória e qualidade na Etapa 6 antes de aceite formal.


### 4. Creative System dentro da `PlatformSkill`

`CreativePrimitive`, `CreativeRecipe` e o resolvedor de compatibilidade são dados declarativos da `PlatformSkill`, carregados como `load → validate → freeze → expose`. Não são domínio, serviço, agente, workflow, aggregate ou repositório próprio.

Primitives são unidades semânticas, nunca frases. Recipes são constraint sets coerentes, nunca scripts. O Planner prefere recipes e admite composição livre de primitives compatíveis, sem proporção hardcoded.

**Compatibilidade derivada das recipes:** `CreativeRecipe` é constraint set declarativo; a coocorrência de IDs **de dimensões diferentes** nos arrays da mesma recipe autoriza o par na policy V2, mas não obriga a usar a recipe inteira. A união desses pares forma a allowlist para `assertFreeCompositionCooccurrence` em Blueprints sem `recipeId`; exigir todos os pares entre dimensões presentes no Blueprint (inclusive cada move), sem inferir sequência narrativa nova. `formatsByProductRole` é autoridade separada para formato × papel. Uma composição pode reunir pares suportados por recipes distintas e produzir Blueprint válido não listado como recipe completa. Recipes-backed mantêm validação integral de sua sequência; `resolveBlueprint` sozinho valida mapa/estrutura, não substitui o gate pairwise para composição livre. Não criar `freeCompositionCases`, `cooccurrenceCases`, policy de cases global nem alterar catálogo/hash; V1 ignora este novo fluxo.

**Semântica formal dos constraint sets:** cada cruzamento entre elementos de dimensões distintas declarado dentro da mesma recipe é autorizado; attention/effects/formats/roles são alternativas compatíveis e narrativeMoves é a sequência integral ordenada, não alternativas nem autorização para inventar transições. Conforme a decisão de domínio acima, todos os cruzamentos das duas recipes citadas são válidos e o teto V2 é 65.536; essa pendência não está aberta. Se evolução futura introduzir alternativas incompatíveis, dividir/restringir a recipe explicitamente antes de liberar a Skill; nunca inferir proibições nem criar uma segunda coleção de Blueprints completos.

Falhas permanecem fechadas e estáveis:

- `GEN-CS-VERSION`;
- `GEN-CS-SCHEMA`;
- `GEN-CS-REF`;
- `GEN-CS-COMPAT`;
- `GEN-CS-ELIGIBILITY`.

Não existe fallback criativo, substituição silenciosa de recipe ou fabricação de Blueprint.

### 5. `CreativeBlueprint`

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

| Campo | Autoridade e validação |
|---|---|
| `recipeId` | Opcional; precisa existir na Skill registrada. Ausência significa composição livre. |
| `attentionMechanisms[]` | IDs fechados, únicos e compatíveis; mínimo 1. |
| `psychologicalEffects[]` | IDs fechados, únicos e compatíveis com recipe/evidência. |
| `format` | Um ID permitido pela recipe, Blueprint e restrições do creator. |
| `narrativeMoves[]` | Sequência válida; o código não reordena para consertar. |
| `productRole` | Um ID compatível com recipe e format. |

A LLM não propõe esses campos. O Planner os constrói a partir de Discovery, Creative System, restrições do creator e memória.

### 6. `ContentOpportunity` V2 canônica

O Blueprint é persistido dentro do próprio `ContentOpportunity`, não em entidade paralela:

```ts
type ContentOpportunityPayloadV2 = {
  opportunityContractVersion: "2";
  id: string;
  sourceOpportunityId: string;
  commercialObjective: string;
  desiredViewerResponse?: string;
  angle: string;
  coreMessage: string;
  noveltyTargets: string[];
  evidenceRefs: string[];
  creativeDirection: CreativeBlueprint;
};
```

Regras:

1. Somente a engine, após Planner e resolvedor, escreve `creativeDirection`.
2. Provider, repair e Content Operations não escrevem nem alteram Blueprint.
3. Novas oportunidades V2 não persistem `hookMechanism` ou `narrativePattern` como segunda fonte; projeções legadas são derivadas na leitura por função versionada.
4. Histórico v1 permanece legível como está e não recebe Blueprint fabricado.
5. O payload JSONB existente continua sendo o armazenamento do contrato evolutivo. Não se cria tabela de Blueprint.
6. `IntelligenceRun` registra policy, seed, binding e hash do plano; não mantém segunda cópia canônica integral do Blueprint.
7. `creativeDirection` permanece interna. Exposição creator-facing exige decisão própria.

Até a correção do writer, a existência de Blueprint apenas em `plannedV2`/metadata não satisfaz este contrato nem o gate de `V2_ACCEPTED`.

### 7. Skill 1.3, prompt e proveniência — estado e alvo

**Estado observado no commit `8d1833b`:** a Engine V2 é default por decisão do usuário, mas o loader de Skill do runtime usa `tiktok-commerce@1.2`; o binding `@1.3` do Planner V2 provém de fixture congelada do harness. Isso é divergência de proveniência, não evidência de `@1.3` como binding operacional atual. O [call map estático da Etapa 1](../../src/modules/commerce-intelligence/evaluation/golden-dataset/baseline-call-map.md) registra as duas superfícies; não substitui metadata de execução live.

**Cutover da Skill ativa, sem usuários ativos:** o loader/runtime PlatformSkill usa exclusivamente `tiktok-commerce@1.3` como default e expõe seu Creative System, sem fallback ou alias para `@1.2`. `@1.2` existe somente no baseline ADR-029 fixado por commit ou em fixtures do runner isolado E6; isso **não** é compatibilidade do runtime. O estado observado em `8d1833b` acima permanece histórico. Na candidata V2, o Planner recebe `source = "runtime-skill"`; o input e `IntelligenceRun.metadata.plannerProvenance` registram `CREATIVE_COMPATIBILITY_V2` e hash canônico do Creative System carregado. Divergência ou ausência falha fechado antes de enumerar. Esses contratos locais não substituem evidência live ou os gates de `V2_ACCEPTED`.

O `skillBinding.source = "frozen-harness-fixture"` exigido pelo Planner V1 congelado identifica somente a entrada daquele harness; não comprova proveniência operacional `@1.3`, mesmo se a versão textual coincidir. A seleção V2 não promove esse marcador a binding operacional. O caller registra o binding efetivo da PlatformSkill ativa; a consistência entre Strategy, Plan, Run, Planner e Creative System é invariante da candidata, não aceite antecipado da E6.

O prompt de `CONTENT_BRIEF_GENERATION` V2 deve citar somente chaves presentes no contexto allowlisted V2. São proibidas referências a:

- `selectedPatterns[index].hook.text`;
- `selectedPatterns[index].cta.text`;
- hook ou CTA literal do catálogo;
- campo ausente do contexto V2;
- regra lexical usada apenas para moldar texto ao validator.

Na candidata V2, `action` e `rationale` permanecem chaves string do wire/persistência, mas podem ser vazias. São projeções advisory derivadas de `text`, nunca requisitos de estilo: leitores, geração e repair não rejeitam ausência de stem/conector nem fabricam razão. A remoção da imposição lexical também vale para as instruções efetivas do provider; campos obrigatórios, factRefs autorizados, claims objetivos, CTA e cardinalidade continuam fail-closed.

O catálogo literal permanece corpus, benchmark, pesquisa e eval. Contract test compara o contexto enviado ao provider com o corpus conhecido e falha se texto literal atravessar o caminho Blueprint-driven. Reintrodução de exemplos exige experimento isolado e aprovado.

No caminho default, o catálogo literal também não governa decisões de qualidade ou variedade: duplicatas de hook/CTA são avaliadas sem isenção para texto presente no corpus; o limite de diversidade funcional de CTA deriva de domínio/policy determinístico versionado, nunca da contagem de itens ou buckets presentes no corpus. A mudança de autoridade do gate exige versão de gate correspondente. `PlatformSkill.creativeCatalog` pode ser removido quando não houver consumer; o corpus permanece apenas como referência/benchmark/eval, não como dependência de geração ou de seus gates.

### 8. Brief, cenas, hard gates e repairs

O Brief Generator continua LLM-owned e recebe apenas fatos relevantes, objetivo comercial, Blueprint, creator context, regras da plataforma e restrições de memória. Ele realiza hook, situação, fala, script, payoff, CTA e tom.

`memoryConstraints` na realização contém apenas histórico estrutural deduplicado autorizado pelo Creative System: attentionMechanisms, psychologicalEffects, formato, papel do Produto e sequência narrativa ordered. São sinais advisory para variar execução mantendo o Blueprint escolhido, não ordens para substituí-lo. Memória vazia/indeterminada não fabrica restrições; IDs internos, texto livre e snapshot bruto não cruzam o contexto. Recipe saturation permanece no Planner/Risk; `STRUCTURE_REPEAT` compara sequências com ordem preservada.

`ContentSceneSet` permanece separado de `ContentBriefVersion`. No V2, Scene Skeleton é derivado deterministicamente do Blueprint e de fatos autorizados, passa pelo gate de cenas e não escreve fala ou claim novo.

Permanecem vigentes, por ADR-019/021/029:

- hard gates antes e depois da composição;
- `BriefValidationReport` objetivo;
- Hard Gate Repair causal e limitado;
- `CONTENT_QUALITY_JUDGE` retornando somente `PASS|REVIEW`;
- um Semantic Part Repair por parte `REVIEW`, sem re-Judge;
- `REVIEW` semântico sem autoridade sobre D/F;
- `SUCCEEDED_PARTIAL` apenas por falha objetiva dentro do CAP;
- cenas persistidas em `ContentSceneSet`;
- quota, tenant, idempotência, fencing e finalização transacional.

### 9. Memória multidimensional

Novos snapshots usam exclusivamente:

```ts
type ProductMemorySignalsV1 = {
  signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1";
  signals: Array<{
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1";
    recipeId?: string;
    attentionMechanisms: string[];
    psychologicalEffects: string[];
    format?: string;
    productRole?: string;
    narrativeShape: string[];
    commercialEffects?: string[];
    audienceContext?: string;
    proofPattern?: string;
  }>;
};
```

Cada snapshot **novo** grava em `ProductMemorySnapshot.signals` exatamente `ProductMemorySignalsV1` acima: somente `signalsSchemaVersion` e `signals` no envelope; cada sinal tem exclusivamente as chaves declaradas no tipo. Não inclui `plannerSignals`, `generatedCount`, `deliveredHookMechanisms`, `deliveredCtaFunctions`, `deliveredAngles` nem metadata de execução, tampouco os grava ao lado como dual-write. Sinais derivam somente da oportunidade V2 e do Blueprint efetivamente realizados por Content entregue; `commercialEffects` não é fabricado a partir de `coreMessage`. Campos opcionais ausentes permanecem ausentes. O merge com snapshot V2 válido usa chave canônica, deduplicação e ordem estável, idempotente sob retry técnico e retry dos faltantes.

Snapshots v1 legados com arrays de hook/CTA/ângulo continuam read-only sob seu próprio contrato. O leitor V2 os trata como memória V2 vazia, sem conversão nem fabricação de sinais; o primeiro snapshot V2 pode conter somente sinais das novas entregas. Envelope que declara `PLANNER_MEMORY_SIGNALS_V1` mas viola o shape falha fechado, não é tratado como legado vazio. O campo JSON `ProductMemorySnapshot.signals` existente é suficiente, sem tabela nova.

### 10. Hard gates → Risk Detector → Judge seletivo

A ordem V2 obrigatória é:

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

Risk possui autoridade de **roteamento**, nunca de entrega. Não altera D/F, quota, status, retry, factualidade, hard gate ou publicação.

O contrato pré-Judge não depende do resultado do Judge:

```ts
type PreJudgeRiskAssessmentV2 = {
  contractVersion: "risk-assessment.v2";
  policyVersion: string;
  subject: { jobId: string; contentId: string };
  assessmentStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  riskBand: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  findings: RiskFindingV2[];
  sources: {
    hardGate: "AVAILABLE";
    blueprint: "AVAILABLE" | "UNAVAILABLE";
    scenes: "AVAILABLE" | "FILTERED" | "ERROR";
    memory: "AVAILABLE" | "EMPTY" | "UNAVAILABLE";
  };
};
```

A seleção é persistível e reproduzível:

```ts
type JudgeSelectionDecisionV1 = {
  policyVersion: string;
  contentId: string;
  selected: boolean;
  triggerCodes: string[];
};
```

O registry fechado deve cobrir, no mínimo:

- genericidade lexical;
- integração fraca do Produto;
- CTA incompatível com o objetivo;
- payoff esperado ausente;
- repetição de attention mechanism;
- repetição de commercial effect;
- repetição de psychological effect;
- saturação de recipe;
- repetição de estrutura/narrative shape;
- script excessivamente longo;
- produção incerta;
- mecanismo criativo incompleto;
- realização incerta do Blueprint.

Produção objetivamente impossível continua hard gate. Sinais incertos apenas selecionam Judge. Falha ou indisponibilidade do Risk Detector seleciona o item para Judge como fail-safe; nunca pula avaliação silenciosamente. Item não selecionado registra `JudgeExecution=NOT_EXECUTED`, nunca `PASS`.

**Policy candidata `risk-policy.prejudge.v2`:** cenas automáticas informam apenas `blueprintStructureCovered`; não comprovam realização semântica do Blueprint. O Risk observa hook e script reais com classifiers e grounding existentes para indícios de atenção composta e movimentos falados (`setup`, `failure`, `reaction`, `product_entry`, `resolution`, `payoff`), sem impor conector nem ordem narrativa fixa. Move/atenção sem suporte observável permanece `PARTIAL` e aciona fail-safe; cenas não preenchem esse missing. Esses indícios lexicais são proxy de roteamento, não prova de naturalidade, humor, payoff ou qualidade, nem hard gate ou instrução ao LLM. Falsos positivos/negativos e taxa de seleção serão medidos na E6 manual; não se presume redução de chamadas.

O Judge recebe objetivo, resposta desejada, Blueprint, fatos/evidências, Brief, SceneSet, creator constraints e trigger codes. Avalia atenção, efeito comercial, integração do Produto, payoff, CTA, realização do Blueprint e perceived templating, sem prever venda.

### 11. Etapa 6 — avaliação integral

Os artefatos existentes `golden-dataset.v1` (`manifest.json` `FROZEN`), `golden-rubric.v1` (`rubrics.json`) e `THRESHOLD_POLICY_GOLDEN_V1` (`threshold-policy.json`) formam **somente evidência offline parcial do experimento Judge reduction**: a rubrica v1 cobre `NATURALNESS` por `CONTENT` e a policy v1 usa `risk-assessment.v1`, `JUDGE_EXECUTED_CONTENTS` e thresholds de redução/cobertura do Judge. Permanecem preservados sob suas versões; `FROZEN` significa imutabilidade daquele escopo, não pacote ou aprovação de E6 integral. Eles não incluem rubricas subjetivas multidimensionais, agregação por categoria, comparação end-to-end nem observações live requeridas abaixo.

A Etapa 6 final, após concluir as Etapas 2–6, exige comparação A/B end-to-end da baseline ADR-029/`@1.2`, fixada por commit, com o pipeline V2 final/`@1.3`, abrangendo primeira geração e recorrência com reutilização de Strategy e memória. O Maestro/time assume scripts, DB/app/worker em ambiente de avaliação isolado, validações offline, coleta live autorizada, assignments e relatório. Antes de qualquer chamada externa, exigir freeze pré-coleta revisado por Review e Software Architect, aprovação de thresholds, exceções explícitas e teto de gasto pelo usuário ou autoridade humana responsável e autorização de coleta. Credenciais somente em ambiente/secret store seguro, nunca em chat, logs ou artefatos. Ao atingir o teto, interromper e reportar incompletude, sem ampliar orçamento ou reduzir escopo silenciosamente. Dois anotadores humanos independentes e cegos e adjudicação humana dos conflitos permanecem obrigatórios; agentes/LLMs não os substituem. Atos que exijam autoridade humana ou não devam ser executados pelo time são sinalizados explicitamente. Experimentos de atribuição por variável continuam opcionais para diagnóstico solicitado, com protocolo próprio e sem substituir a comparação end-to-end.

A baseline deverá ser executada a partir do commit fixado em runner de avaliação isolado; código legado não volta ao runtime default de produção. O [call map da Etapa 1](../../src/modules/commerce-intelligence/evaluation/golden-dataset/baseline-call-map.md) é auditoria estática, não observação de custo, latência ou tokens.

#### 11.1 Classes de evidência

E6 separa evidência por origem e não permite promoção entre classes:

| Classe | Pode demonstrar | Não pode demonstrar |
|---|---|---|
| **Offline determinística/replay** | schema, cardinalidade, hashes, compatibilidade, gates determinísticos, Planner/Blueprint, memória, idempotência, pareamento, redaction e reprodução de uma resposta já congelada | custo real, tokens reais, latência real, timeout/retry do provider ou qualidade semântica produzida pelo provider vivo |
| **Provider vivo pareado** | comportamento real do modelo, qualidade semântica, naturalidade, criatividade, persuasão, usage/tokens, custo, latência, timeout, retry e cobertura operacional | regras server-side não observadas ou invariantes presumidas apenas pelo output textual |

Fixture, mock, resposta gravada ou replay offline nunca satisfaz threshold de custo, latência, usage/tokens ou qualidade semântica real. Essas métricas ficam `UNAVAILABLE` para aceite operacional até execução pareada com provider vivo. Evidência offline continua obrigatória para invariantes determinísticos, mas não substitui o experimento vivo.

#### 11.2 Comparabilidade baseline/candidato com provider vivo

Antes da coleta, cada braço registra e congela:

- commit e engine version;
- provider, model ID/version e tier efetivos;
- parâmetros efetivos do modelo e da chamada, inclusive reasoning, temperature, top-p, max tokens, response/schema mode, timeout, retry e fallback;
- `platformSkillVersion`, Skill binding, Creative System, contratos e policy versions;
- prompt/instruction e contexto allowlisted por bytes ou artefato versionado, com hashes;
- Product Facts, evidence, creator context e memory snapshot por bytes/hash;
- dataset/case/category, ordem, seed e versão da derivação;
- capabilities executadas, cobertura e motivo de `NOT_EXECUTED|FAILED|NOT_APPLICABLE`;
- usage/tokens, moeda, pricing source/snapshot, custo e completude;
- latência por tentativa/capability e end-to-end, retries, repairs, timeout e erro.

No end-to-end, controles externos ao pipeline comparado permanecem iguais entre os braços. Diferenças inerentes ao baseline/candidato são listadas antes da coleta em um manifest de diferenças; alteração não pré-registrada invalida o par. Se o usuário solicitar atribuições posteriores, cada uma altera uma única variável declarada e segue protocolo próprio. Ausência de provider/model/version/params, prompt/context artifact, seed, usage/custo/latência ou cobertura torna a métrica afetada `PARTIAL`, `UNAVAILABLE` ou o par `INVALID` conforme a threshold policy; nunca autoriza imputação pós-hoc.

#### 11.3 Auditoria de critérios subjetivos

Cada dimensão subjetiva possui rubrica versionada antes da coleta com:

- definição operacional e pergunta avaliada;
- unidade de avaliação explícita (`CONTENT`, `PART`, `SCENE`, `CASE` ou `JOB`);
- escala/labels, âncoras positivas, negativas e limítrofes;
- evidência mínima exigida e regra de `NOT_ANNOTATED`;
- política de conflito e adjudicação;
- população, categorias, denominador e missing-data policy;
- função de agregação dentro da unidade, por case, por categoria e total;
- estatística pareada, incerteza e threshold de não-regressão/aprovação.

Naturalidade, criatividade/originalidade, especificidade ao Produto, potencial persuasivo, atenção, integração do Produto, realização do Blueprint, diversidade psicológica/criativa, perceived templating, aderência à plataforma e coerência de recipe/composição livre usam no mínimo duas avaliações humanas independentes e cegas por unidade. O assignment oculta braço, commit, provider, modelo, tier, custo, latência e resultados automáticos. Divergências seguem a policy de adjudicação pré-registrada; avaliações brutas, conflitos, exclusões e decisão adjudicada permanecem no artefato auditável.

Agregação nunca mistura unidades ou categorias silenciosamente. O protocolo fixa se a métrica é micro, macro ou ambas, pesos, tratamento de múltiplas partes/cenas por Content, tamanho mínimo/cobertura por categoria e regra para categorias insuficientes. O relatório apresenta resultado pareado por braço, delta, incerteza, cobertura e missing no agregado e em cada categoria pré-registrada. Corte, peso, exclusão ou categoria não muda após observar resultados.

#### 11.4 Artefatos, métricas e decisão

Artefatos obrigatórios e versionados:

- protocolo e manifest de diferenças;
- Golden Dataset/manifesto/cases/fixtures redacted e hashados;
- rubricas e threshold policy aprovadas antes da coleta;
- novo congelamento full E6 com versões próprias para manifesto/cases, rubricas, aggregation e thresholds, hashes e aprovação pré-registrados antes da coleta; documentar diferenças de contrato em relação ao v1 sem reescrever nem promover seus artefatos `FROZEN`;
- assignments cegos, avaliações independentes e adjudicações;
- captures de execução offline e com provider vivo, identificadas pela classe de evidência;
- relatório e approval com hash do relatório.

O relatório mede agregado e por categoria: critérios subjetivos acima; factualidade; calls por capability; tiers; tokens/usage; custo e completude; latência total e p50/p95; retries/repairs/timeouts; cobertura/falha do Judge; hard-gate failure; parcial/failure; Contents por chamada, custo e segundo; e missing data.

Custo ausente/incompatível permanece `PARTIAL`/`UNAVAILABLE`, nunca zero. Métrica subjetiva sem cegamento, avaliações independentes, adjudicação, unidade, agregação ou threshold prévio é `INVALID`. Qualquer regressão em critério, no agregado ou por categoria, reprova o candidato, salvo exceção aprovada explicitamente pelo usuário no protocolo antes da coleta.

Este ADR não registra execução, resultado, não-regressão ou aprovação de E6. Enquanto os artefatos offline e com provider vivo não satisfizerem seus gates, o estado permanece `V2_DEFAULT_PENDING_ACCEPTANCE`.

### 12. Proveniência e estados de cutover

Toda geração V2 registra:

- commit/engine version;
- `platformSkillVersion` e binding;
- Creative System version;
- contract e policy versions;
- planner seed e output hash;
- prompt/context hashes;
- gate, risk e Judge-selection policy versions;
- capability, tier, modelo/provider lógico, tokens, custo, latência, retry e repair;
- cobertura `EXECUTED|NOT_EXECUTED|FAILED|NOT_APPLICABLE`.

Sem payload bruto, prompt completo, segredo, token ou dados de outro tenant.

`metadata.discoveryV2` é dado de domínio validado e imutável do job, **não telemetria mutável**. Reentrada/upsert preserva o mesmo envelope JSON-safe e `discoveryHash`; divergência falha fechado. Retry dos faltantes que reutiliza `ProductStrategy` preserva seu payload e `sourceDiscoveryRef` original (`intelligenceRunId`, versão e hash), sem reescrever Discovery; o run novo pode registrar somente referência à origem. Metadata operacional pode evoluir separadamente, mas `plannedV2`/trace não vira segunda fonte integral do Blueprint persistido em `ContentOpportunity.payload`. Leitura tenant-scoped recalcula `sha256Hex(canonicalSerialization(discoveryV2))` sobre o envelope re-lido, sem `undefined`/opcionais fabricados, e valida versão, seleção por `sourceOpportunityIds` e `evidenceRefs` contra a Discovery antes de projetar para o Planner.

Estados documentais:

```text
V2_DEFAULT_PENDING_ACCEPTANCE
  V2 é produção por decisão do usuário;
  contratos/evals ainda não fecharam.

V2_ACCEPTED
  contratos P0/P1 satisfeitos;
  E6 integral aprovada pelo Architect;
  aceite explícito do usuário;
  ADR-029 formalmente superseded como runtime.
```

### 13. Compatibilidade e migração

1. Migração é aditiva e versionada; não reescreve histórico.
2. `ContentOpportunity` v1 continua legível sem Blueprint fabricado.
3. Writer novo grava somente v2; não existe dual-write v1/v2.
4. `hookMechanism`/`narrativePattern` históricos permanecem nos registros antigos; em v2 são apenas projeções derivadas.
5. A PlatformSkill do runtime após cutover carrega exclusivamente `tiktok-commerce@1.3` com Creative System, sem fallback/alias para `@1.2`; a Skill `@1.2` permanece apenas na baseline por commit/fixture do runner E6 isolado, não como caminho de leitura ou geração do runtime. O writer V2 usa 1.3 após a correção do binding operacional, ainda pendente.
6. Snapshot de memória legado não é convertido em sinal V2.
7. `RiskAssessmentV1` permanece read-only; seleção pré-Judge usa contrato v2.
8. Reports, briefs e SceneSets históricos permanecem válidos sob suas versões.
9. Mudança de gate/policy/Skill/contrato exige bump explícito.
10. Falha de leitor, versão ou referência é fail-closed e sanitizada.

### 14. Coordenação documental posterior

Depois deste ADR, e antes de declarar `V2_ACCEPTED`, devem ser atualizados deliberadamente:

- `docs/architecture/SYSTEM-DESIGN.md`;
- `docs/delivery/SLICES.md`;
- `docs/specs/slice-003/SPEC.md`;
- `docs/plans/slice-003/PLAN.md`;
- `docs/specs/etapa-4-skill-brief/SPEC.md`;
- `docs/plans/etapa-4-skill-brief/PLAN.md`;
- `docs/specs/etapa-5-risk-quality/SPEC.md`;
- `docs/plans/etapa-5-risk-quality/PLAN.md`;
- `docs/specs/etapa-6-golden-evals/SPEC.md`;
- `docs/plans/etapa-6-golden-evals/PLAN.md`.

Estas fontes exigiam coordenação por descreverem, total ou parcialmente, ADR-029/1.2 como runtime, 1.3 fixture-only, Risk apenas pós-Judge/advisory ou E6 limitada a Judge reduction. A coordenação documental alinha baseline, runtime default e alvo pendente sem alterar PRD ou a nota; não constitui evidência de implementação, avaliação nem aceite.

## Critérios para `V2_ACCEPTED`

Todos são obrigatórios:

1. Auditoria da Etapa 1 e call map versionados: o [call map estático de `8d1833b`](../../src/modules/commerce-intelligence/evaluation/golden-dataset/baseline-call-map.md) registra o baseline e as divergências, mas não conclui a auditoria live; chamadas físicas, tokens, custo e latência observados permanecem `UNAVAILABLE` até coleta real.
2. Discovery/Strategy alvo especificado e migrações LLM → código cobertas pela avaliação A/B end-to-end final do conjunto, sem A/B individual obrigatória por migração.
3. `ContentOpportunity` v2 persistida com `creativeDirection` canônica.
4. Nenhuma segunda fonte persistida de Blueprint/hook/narrative em novos registros.
5. Memória `PLANNER_MEMORY_SIGNALS_V1` multidimensional, idempotente e consumida pelo Planner.
6. Binding 1.3 consistente em Strategy, Plan, Run, Planner e Creative System.
7. Prompt/contexto V2 sem `selectedPatterns` ou copy literal do catálogo.
8. Scene Skeleton validado e `ContentSceneSet` separado.
9. Pipeline hard gates → risk → Judge seletivo observável.
10. Registry de risco cobrindo todos os sinais mínimos desta decisão.
11. Falha de Risk selecionando Judge; `NOT_EXECUTED` nunca sintetizado como `PASS`.
12. Hard gates, partial, quota, tenant, fencing, idempotência e repair semântico sem regressão.
13. E6 end-to-end executada pelo Maestro/time após concluir as Etapas 2–6, sob freeze pré-coleta revisado por Review e Architect e autorização humana; thresholds, exceções explícitas e teto de gasto aprovados pelo usuário ou autoridade humana responsável antes de chamadas externas, evidências offline e de provider vivo separadas; atribuições por variável não são requisito de aceite.
14. Critérios subjetivos auditáveis por rubrica, unidade, dois anotadores humanos independentes/cegos, adjudicação humana dos conflitos, agregação, categoria e threshold pré-registrados; custo/latência/qualidade semântica real comprovados somente com provider vivo pareado.
15. Relatório e approval versionados, reproduzíveis e pertencentes aos commits, com provider/model/tier, parâmetros, prompts/contextos, seed, usage/custo/latência e cobertura comparáveis.
16. Review sem findings bloqueantes e revisão formal do Software Architect.
17. Aceite explícito do usuário referenciando `reportHash`.
18. Atualização coordenada das fontes listadas na decisão 14.
19. Discovery completa imutável por job em `IntelligenceRun.metadata.discoveryV2`, com `discoveryHash` reproduzível por `CANONICAL_SERIALIZATION_V1`; `ProductStrategy.payload` contém `strategyContractVersion`, `strategyPolicyVersion`, `sourceDiscoveryRef` (`intelligenceRunId`, versão e hash) e seleção por `sourceOpportunityIds`/`evidenceRefs`; `ContentOpportunity.payload` guarda somente decisão/Blueprint do seu Content. Reader tenant-scoped recalcula hash e rejeita divergência de versão/IDs/refs; hipóteses não selecionadas continuam rastreáveis. Retry/reentrada preservam o mesmo envelope, payload de Strategy e referência, sem reescrever Discovery nem duplicar o pool; snapshots novos contêm somente `ProductMemorySignalsV1`, com `audienceContext?: string`, sem dual-write legado, merge canônico idempotente e leitura v1 read-only.

Somente então este ADR registra `V2_ACCEPTED` e a supersessão formal do ADR-029 como runtime.

## Não-objetivos

- Não criar serviço, domínio, agente, aggregate, repositório ou tabela para Blueprint/Recipe.
- Não introduzir embeddings, banco vetorial ou judge LLM de variedade/memória.
- Não transformar mecanismos em copy determinística.
- Não permitir que Risk ou Judge decidam quota, D/F, estado ou publicação.
- Não reescrever histórico v1 ou fabricar sinais de memória.
- Não expor Blueprint, provider, modelo, tier ou prompts ao creator.
- Não fixar número de recipes, proporção recipe/free ou meta de chamadas como contrato de produto.
- A decisão ADR não executa alterações de runtime por si; a implementação e avaliação candidatas nesta feature branch estão expressamente autorizadas na SPEC/PLAN do Slice 003, sem liberar merge, deploy ou `V2_ACCEPTED` antes dos gates E6.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Reverter para ADR-029 até E6 | Rejeitada | Contraria direção explícita do usuário e o estado real de produção. |
| Declarar V2 aceita apenas porque está em produção | Rejeitada | Confunde decisão operacional com evidência de qualidade e viola a nota/ADR-012/033. |
| V2 default com aceitação pendente | Escolhida | Preserva direção do usuário e torna a dívida de evidência explícita. |
| Editar ADR-029 in-place | Rejeitada | Apaga o baseline necessário para A/B e a trilha histórica. |
| Blueprint em entidade/tabela própria | Rejeitada | Duplica `ContentOpportunity` e cria fronteira sem necessidade. |
| Dual-write v1/v2 | Rejeitada | Cria duas fontes de verdade e migração indefinida. |
| Risk como hard gate | Rejeitada | Heurística semântica não deve controlar entrega objetiva. |
| Falha de Risk pulando Judge | Rejeitada | Reduz cobertura silenciosamente; fail-safe deve selecionar Judge. |
| E6 somente para Judge reduction | Rejeitada | Não avalia as demais migrações do pipeline. |

## Trade-offs e consequências

Positivas:

- Estado de produção e estado de aprovação deixam de ser confundidos.
- ADR-029 continua sendo baseline reproduzível sem governar o runtime default.
- Blueprint passa a possuir uma fonte canônica.
- Memória e variedade passam a operar sobre dimensões criativas reais.
- Judge pode cair sem assumir autoridade de entrega.
- E6 mede qualidade, custo e latência e o efeito agregado das migrações no conjunto final; atribuição individual ocorre somente para diagnóstico, se solicitada pelo usuário.

Custos e riscos:

- V2 permanece em produção antes da aceitação integral; risco é explícito e exige observabilidade e correção, não negação documental.
- Skill/compatibilidade e contracts versionados aumentam manutenção.
- JSONB preserva flexibilidade, mas shape depende do writer/reader da aplicação.
- Memória legada não ganha dimensões retroativas.
- Risk Detector pode gerar falso positivo; efeito é custo de Judge, não rejeição.
- Falso negativo de Risk é o risco principal; mitigado por E6, registry fechado, fail-safe e monitoramento de cobertura.
- E6 operacional custa tempo/provider/anotação; é o preço para afirmar não-regressão.

## Segurança e operação

- Creative System permanece dado estático sem tenant, Job, quota ou persistência.
- Saída de provider é não confiável e nunca escreve Blueprint.
- Contextos de provider são allowlisted e mínimos.
- Ownership, IDs, status, quota e policy versions são server-owned.
- Chamadas externas permanecem fora de transação.
- Finalização permanece curta, fenced e idempotente.
- Telemetria registra hashes e métricas, nunca payload bruto ou segredo.
- Evals usam fixtures redacted e IDs não produtivos.

## Relações

- [ADR-002](./adr-002-engine-estrategica-como-core.md) — engine como core.
- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — JSONB versionado, memória e proveniência.
- [ADR-004](./adr-004-variedade-por-memoria-estruturada.md) — variedade determinística e memória sem embeddings.
- [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) — contratos, gates e Golden Dataset.
- [ADR-013](./adr-013-model-router-e-intelligence-tier.md) — router, tiers, custo e evals.
- [ADR-014](./adr-014-platform-skill-versionada.md) — Skill versionada e proveniência.
- [ADR-019](./adr-019-gate-versionada-e-cenas.md) — gates versionados e `ContentSceneSet`.
- [ADR-021](./adr-021-geracao-parcial-declarada-e-retry-de-faltantes.md) — parcial objetivo, quota e memória somente dos entregues.
- [ADR-029](./adr-029-pipeline-hibrida-deterministica-e-criativa.md) — baseline histórico/experimental; invariantes preservados; supersessão formal pendente de `V2_ACCEPTED`.
- Nota canônica **"Plano de recalibração da commerce inteligence"** — fonte das Etapas 0–6.

## Adendo pós-Etapa 1 — pacote de alinhamento aprovado

O usuário aprovou formalmente as decisões D1–D9. Este registro consolida as decisões arquiteturais sem alterar o status `V2_DEFAULT_PENDING_ACCEPTANCE`, os PRDs, os planos ou a autorização de implementação.

### D1 — Risk → Judge seletivo

A ordem normativa do runtime V2 é `hard gates → Hard Gate Repair → Risk determinístico → Judge seletivo → Semantic Part Repair → hard gates/variedade finais → persistência`. Risk possui somente autoridade de roteamento. Falha, ausência ou indisponibilidade do Risk seleciona Judge por fail-safe. Item não selecionado registra `JudgeExecution=NOT_EXECUTED` e nunca `PASS`.

### D2 — DiscoveryV2 e CreativeBlueprint canônicos

`IntelligenceRun.metadata.discoveryV2` é a fonte imutável do envelope DiscoveryV2 completo, normalizado e hashado. `ContentOpportunity.payload.creativeDirection` é a única fonte canônica do CreativeBlueprint persistido por Content. `plannedV2` ou metadata operacional não podem manter uma segunda cópia integral do Blueprint.

### D3 — Proveniência, versão, policy, seed e hashes

Toda execução V2 deve ser capaz de registrar, no metadata allowlisted, commit/engine, PlatformSkill e Creative System, versões e hashes de contrato/policy, binding, seed do Planner, hash do input/contexto, hashes de instrução e output, provider/model/tier efetivos, retries, fallback e cobertura. `frozen-harness-fixture` identifica somente harness isolado e não é proveniência operacional.

### D4 — Memória V2

Snapshots novos usam exclusivamente `ProductMemorySignalsV1`, com merge canônico, deduplicação, ordem estável e idempotência. Sinais derivam somente de Contents entregues. `commercialEffects` não é derivado de `coreMessage`. Snapshots V1 permanecem read-only e não há fallback ou dual-write V1/V2.

### D5 — Chamadas e budget

Chamadas lógicas, tentativas físicas, retries de contrato, fallback de disponibilidade e etapas determinísticas são dimensões distintas. O budget e o deadline V2 devem cobrir somente capabilities alcançáveis no call graph V2, sem contabilizar capabilities removidas como chamadas provider-backed. Quota de Contents, budget operacional e custo observado permanecem contratos distintos. ADR-029/E6 conserva a fórmula histórica da baseline.

### D6–D9 — Referências normativas

D6, contexto allowlisted de Hard Gate Repair e Semantic Part Repair, é detalhado no ADR-025. D7, grounding factual/racional e sua autoridade hard ou advisory, é detalhado no ADR-019. D8, tiers provisórios e separação entre tier e reasoning, é detalhado no ADR-029. D9, separação entre runtime V2, baseline histórica e E6, é detalhado no mapa estático da Etapa 1.

## Adendo — formato de resposta da Discovery V2 (Etapa 2)

Somente `COMMERCIAL_OPPORTUNITY_MAPPING` solicita ao provider `response_format: { type: "json_object" }`, em vez de JSON Schema estrito com `additionalProperties: false`. A validação local rejeita chaves explicitamente proibidas e campos server-owned (incluindo `sourceOpportunityId` na saída da LLM); descarta outras chaves desconhecidas na raiz e nas hipóteses antes da canonicalização. Valida localmente versão e shape do envelope, campos obrigatórios e opcionais suportados, quantidade não vazia de hipóteses até `maxOpportunities` do contexto e `evidenceRefs` pertencentes ao catálogo autorizado. Falhas de contrato continuam fail-closed; campos descartados não entram no envelope canônico nem no hash.

Esta mudança alinha a fronteira do provider à SPEC slice-003 §3.3B/AC12: o schema estrito rejeita campos desconhecidos antes que a aplicação possa descartá-los. `PRODUCT_UNDERSTANDING` mantém seu JSON Schema estrito; formato e validação das demais tasks não mudam. Não altera o contrato do Planner, a baseline ADR-029 nem autoriza aceite V2.

