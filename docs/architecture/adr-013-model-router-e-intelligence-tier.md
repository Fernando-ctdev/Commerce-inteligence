# ADR-013: Model Router e IntelligenceTier

## Status

Aceito — camada de roteamento de modelos do MVP.

## Contexto

As tarefas de IA da plataforma têm complexidades muito diferentes: normalizar um CTA não exige a mesma capacidade que sintetizar uma estratégia ou distribuir um portfólio de conteúdos. Usar modelos high-end em tudo eleva custo, latência e dependência de provider; usar modelos fracos em decisões estratégicas destrói o diferencial do produto.

Os PRDs proíbem que funcionalidades escolham modelos diretamente e exigem independência de provider, com qualidade estratégica idêntica entre planos comerciais.

## Decisão

Criar a camada **Model Router / LLM Gateway** com o fluxo canônico:

```text
Engine Capability → Logical Intelligence Task → Model Router
  → IntelligenceTier (LOW / MID / HIGH) → Model Selection
  → LLM Gateway / Provider Adapter → Structured Output
  → Capability Contract Validation
```

- Toda tarefa lógica (ex.: `PRODUCT_UNDERSTANDING`, `AUDIENCE_DISCOVERY`, `STRATEGY_SYNTHESIS`, `CONTENT_PLAN_GENERATION`, `CONTENT_BRIEF_GENERATION`, `HOOK_REGENERATION`, `CTA_REGENERATION`, `VARIETY_AUDIT`) possui um `IntelligenceTier` padrão, evoluível por evals reais de qualidade/custo/latência — não por benchmarks genéricos.
- A curadoria semântica interna usa `CONTENT_QUALITY_JUDGE`/HIGH e `CONTENT_PART_REPAIR`/HIGH. O judge avalia hook, development, script, CTA e cenas por conteúdo com contrato allowlisted; falha de judge não vira PASS nem usa fallback. Ela não é aprovação do creator nem uma capability de Content Operations.
- A heurística “HIGH decide o conjunto, MID executa, HIGH audita” é registro histórico de custo, não mapa normativo. O tier runtime, retries/fallback e autoridade vigentes são a tabela canônica do ADR-029; mudanças exigem evals reais de qualidade/custo/latência.
- Capabilities determinísticas (orquestração, estado, persistência, idempotência, schema validation, contagens, quota) **não passam pelo router**.
- Regenerações locais reutilizam contexto persistido: CTA → LOW; hook → LOW/MID; script → MID; trocar ângulo → MID; replanejar conjunto → HIGH. Nenhuma alteração local recalcula toda a inteligência do Produto.
- Um provider por vez no MVP, atrás de adapter próprio (OpenRouter, OpenAI, Anthropic, Google ou compatível). Nenhum provider entra na regra de negócio; trocar modelo/provider não altera entidades de domínio.
- Para OpenRouter, `usage.cost` da resposta é a fonte primária de custo real da chamada. Valor ausente, nulo ou malformado permanece ausente: nunca é convertido em `USD 0`; `0` só é válido quando foi explicitamente reportado. `GET /api/v1/models` é fonte secundária: seus rates somente entram após snapshot imutável local por provider/modelo/moeda. Catálogo local é fallback exclusivo de provider sem pricing oficial. A moeda do custo reportado ou do snapshot é explícita/configurada; sem moeda confiável, o custo é parcial ou indisponível. Essa variação fica confinada ao adapter, preservando o domínio agnóstico a provider.
- `LOW`, `MID`, `HIGH` são valores de `IntelligenceTier` — nunca planos comerciais. É proibido variar qualidade estratégica por plano.
- Avaliação de modelos usa tarefas reais da plataforma (produtos de categorias variadas, medindo compreensão, estratégia, variedade, naturalidade, latência, custo, confiabilidade), alimentando o Golden Dataset do ADR-012.
- Decisões de modelo permanecem invisíveis ao creator: tier, provider, modelo, prompts, logs e payloads nunca cruzam a fronteira creator-facing. A exceção allowlisted do Histórico do Produto é `jobId`, status, timestamps, usage agregado (`inputTokens`, `outputTokens`, `reasoningTokens`, `cachedTokens`) e custo agregado (`amountMinor`, moeda e completude); ela não permite inferir provider/modelo/tier, rates, pricing source, retries por capability ou metadata interno.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Router por tarefa lógica + tiers (escolhida) | Controle de custo/qualidade por tarefa e troca de provider sem tocar o domínio | Camada extra a operar e avaliar |
| Um único modelo para tudo | Simples | Custo alto em volume ou qualidade baixa em estratégia |
| Escolha de modelo dentro de cada capability | Flexibilidade local | Acopla domínio a provider e espalha decisão de custo |
| Múltiplos providers com fallback desde o início | Resiliência teórica | Registro, fallback e configuração antes de necessidade real |
| Qualidade por plano (LOW básico / HIGH premium) | — | Rejeitada: destrói a proposta do produto |

## Consequências positivas

- Custo proporcional à complexidade real de cada tarefa.
- Independência de provider verificável; evals por tarefa real guiam escolhas.
- Regenerações baratas e consistentes com o contexto já persistido.

## Consequências negativas e riscos

- Mapa tarefa → tier precisa manutenção contínua (evals).
- Latência composta quando uma execução combina várias capabilities.
- Gateway torna-se ponto único de falha para capabilities de LLM; precisa de erros recuperáveis e observáveis.

## Segurança / Operação

- Chaves de provider ficam no gateway, fora do domínio e dos logs.
- Contexto mínimo por capability (slices de Strategy/Skill/Memory), nunca o mundo inteiro.
- Conteúdo de páginas de Produto entra como dado não confiável, separado das instruções (ver ADR-012).
- Métricas por tarefa, provider/modelo/tier, prompts, logs e payload permanecem internas. O Histórico do Produto recebe somente a projeção allowlisted de `jobId`, status, timestamps, usage agregado e custo agregado; não recebe capability rows, source/rates de pricing ou metadata bruto.
- Snapshot de preço, custo reportado e usage por tentativa ficam no metadata interno allowlisted por capability; o Histórico agrega esses registros sem expor fonte, provider, modelo, rates, breakdown ou o metadata.

## Relações

- [ADR-002](./adr-002-engine-estrategica-como-core.md) — engine como core.
- [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) — contratos das capabilities e Golden Dataset.
- [ADR-014](./adr-014-platform-skill-versionada.md) — Skill versionada como insumo da geração.
- `PRD-model-router-inteligence.md` — fonte de produto vigente.
