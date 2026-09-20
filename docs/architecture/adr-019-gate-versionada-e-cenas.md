# ADR-019: Gate versionada, variedade funcional e ContentSceneSet

## Status

Aceito — implementado na branch `feat/gate-version-e-cenas`.

## Contexto

O job `dbaa5552` terminou `SUCCEEDED` com reports `PASS`, mas a revalidação dos mesmos payloads pelo `validateBriefSet` corrente retornou `REPAIR` — a política de gates vivia no código sem identificador de versão, e o check creator-first de development foi adicionado após a execução. Segunda fonte latente: `platformOk` comparava o `skillVersion` registrado contra a constante corrente da Skill (qualquer bump invalidaria briefs antigos). Além disso, o veredito apontou monocultura de hooks/CTAs por cycling adjacente sobre catálogo agrupado por família, claims de vestuário/promoção sem evidência e ausência de instruções visuais operacionais (cenas foram removidas do brief pela migration 20260912010000 por misturarem produção no briefing, embora PRD-content-briefing §3 e DESIGN.md peçam cenas).

## Decisão

1. **Gate versionado por atribuição, não reprodução.** `GATE_POLICY_VERSION` em `gates.ts` com bump manual (precedente de `CARDINALITY_POLICY_VERSION`, ADR-012). Reports persistem `gateVersion` (`brief_validation_reports`, coluna nova; NULL = pré-versionamento). Revalidação sob versão diferente produz `ContractError GEN-GATE-VERSION` — nunca REPAIR falso. Sem endpoint de revalidação no MVP; reports são evidência do que o gate disse no momento. `platformSkillVersion` é snapshot de geração: válida enquanto registrada no registry `PLATFORM_SKILLS`. `engineVersion` deixa de ser literal estático (`ENGINE_VERSION` em `engine.ts`).
2. **Variedade estrutural determinística.** Plano: `hookMechanism` respeita teto `ceil(N/M)` por bucket determinístico (`classifyHookMechanism`, M=6) — violação é `GEN-VARIETY` com retry único causal. Seleção de padrões estratificada por bucket (hooks) e por função (CTAs, round-robin entre buckets do catálogo). Gate: função de CTA (bucket classificado do texto, `classifyCtaFunction`) além de `ceil(N/K)` vira variedade FAIL → repair.

**Adendo (ADR-021):** quando o job fecha `SUCCEEDED_PARTIAL`, o Variety Gate é reexecutado sobre o subconjunto efetivamente entregue com teto recomputado `ceil(D/K)` (D = entregues). Se o subconjunto viola o teto, o drop do excedente da função concentrada é **determinístico e total-order**: entre os itens da função concentrada, remove-se primeiro o de maior contagem de checks objetivos reprovados (hard gate factual/estrutural/variedade); em empate, o de menor número de `evidenceRefs` ancorados; em empate, o de maior posição no plan (posicional decrescente — preserva os primeiros e mantém o resultado estável entre execuções). Cada drop decrementa D, recomputa o teto e revalida; ao final, se F = N−D exceder `PARTIAL_FAILURE_CAP`, o job reprova inteiro (`FAILED`) — o teto é aplicado somente a falhas objetivas. `REVIEW` semântico não entra na assinatura residual nem cria faltante.
3. **Claims observáveis estendidos por evidência** (mecanismo ADR-004, sem regex universal): vestuário (`não amassa`/`não marca`/`não aperta` — predicados de propriedade do produto, com guarda para `aperta play/botão` e `marca`=brand), `deixa o ar circular` no conceito de ventilação e `frete grátis` como promoção gated. Experiência/opinião claramente enquadrada permanece `INFERRED_BUT_SAFE`.
4. **`ContentSceneSet` como contrato canônico próprio** — separado de `ContentBriefVersion` (imutabilidade preservada; `scenes` não volta ao brief). Uma row por `(tenantId, briefVersionId)`, payload ordenado `{scenes[], generated, dropped}`, colunas `status` (`AVAILABLE|FILTERED|ERROR` — ausência de row = não-gerado), `gatePolicyVersion`, `backfilled`. Capability `CONTENT_SCENE_IDEAS` recebe briefing inteiro + evidências + creatorContext projetado, chamada fora de transação e persistência na transação curta de FINALIZING. Seu tier runtime atual, tentativas e autoridade são os da tabela canônica do ADR-029; o antigo tier `LOW` é histórico. O filtro estrutural por cena mantém os mesmos critérios: ação observável, âncora lexical, nenhum claim novo, compatibilidade com `recordsAlone` e mínimo 2 cenas. Cenas inválidas permanecem condição objetiva de entrega.
5. **Backfill progressivo:** cada novo job do produto também gera sets para até 10 conteúdos existentes não-descartados sem set (versão corrente), idempotente pelo unique. Empty state honesto na UI; sem endpoint/botão novo.

Fixtures de regressão dos outputs reais (dbaa5552 + Space S1) em `regression-verdict.test.ts`.

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Registry de gates antigos vivos (reprodução real) | Rejeitada | Código morto acumulando; atribuição + mismatch explícito basta |
| Hash do léxico como versão | Rejeitada | Opaco; refactor cosmético bumpa sem mudança de comportamento |
| Cenas dentro de `ContentBriefVersion` | Rejeitada | Quebra imutabilidade; reintroduz mistura produção/brief corrigida em 20260912010000 |
| Geração de cenas on-demand (clique) | Rejeitada no MVP | Nova superfície API assíncrona + ambiguidade de entitlement |
| Cenas não-bloqueantes para o sucesso da nova geração | Substituída | A curadoria semântica do conteúdo inclui cenas; sucesso sem cena válida esconderia uma parte não curada |

## Consequências

- Positivas: `SUCCEEDED` reproduzível sob a política registrada; divergência vira diagnóstico explícito; monocultura de mecanismo/função bloqueada deterministicamente; cenas voltam alinhadas a PRD/DESIGN sem tocar no brief.
- Negativas/riscos: léxico cresce por incidente (ceiling ADR-004 aceito); `GEN-VARIETY` do plano pode exigir retry; cena inválida pode bloquear a geração após repair; avaliação semântica adiciona chamadas HIGH observadas no `IntelligenceRun`.

## Adendo — curadoria semântica interna

O hard gate determinístico factual/estrutural e o Variety Gate objetivo permanecem obrigatórios antes e depois de qualquer composição. `Hard Gate Repair` é objetivo, anterior ao Judge e limitado por `GENERATION_MAX_REPAIRS`. A curadoria semântica interna avalia, uma vez, as partes `hook`, `development`, `script`, `cta` e `scenes` de cada conteúdo e retorna somente `PASS|REVIEW`, com criterion allowlisted e motivo sanitizado. `PASS` preserva a parte; `REVIEW` aciona no máximo um `Semantic Part Repair` somente para a parte marcada. Não há Judge na segunda passada. Se o repair falhar, retornar schema inválido ou não puder ser aplicado, a parte original permanece. Quando os gates objetivos passam, o Content é entregue em `DRAFT`; Judge semântico não reprova item, não cria faltante, aviso, `QUALITY_PENDING` ou bloqueio por estilo. `REJECT` é decisão exclusiva do hard gate objetivo.

## Relações

ADR-012 (política versionada), ADR-014 (Skill versionada), ADR-004 (variedade determinística), ADR-017 (correlação sanitizada — capabilities de cena seguem o mesmo tracker).
