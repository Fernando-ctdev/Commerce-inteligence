# ADR-012: Contratos canônicos da Commerce Intelligence

## Status

Aceito — define os schemas canônicos da engine. Supersede a seção `GenerationInput v1` / `GenerationOutput v1` do [ADR-002](./adr-002-engine-estrategica-como-core.md); a decisão de engine-como-core permanece vigente.

## Contexto

Os PRDs vigentes (`PRD-commerce-intelligence-engine.md`, `PRD-product-intelligence-analysis.md`, `PRD-content-briefing.md`, `PRD-model-router-inteligence.md`) refinaram o domínio além do contrato v1 original: o processamento é acionado por um `CommerceIntelligenceJob`, a engine possui capabilities internas com contratos próprios, a estratégia é persistente e versionada, e o resultado materializa `Content` + `ContentBriefVersion` compatíveis com Content Operations.

O contrato antigo tratava a engine como uma caixa com um envelope de entrada e um de saída. Os PRDs exigem granularidade maior: validação factual por claim, gates de qualidade e variedade, repair loop, memória estruturada com snapshot consistente e rastreabilidade até execução.

## Decisão

Adotar os schemas canônicos conceituais como contrato de domínio entre caso de uso, engine e persistência:

- `ProductUnderstanding` — leitura comercial do Produto com `evidenceRefs`;
- `CommercialOpportunity` — oportunidade relacional (público, situação, dor/desejo, capability, benefício, objeção, prova, argumento, `confidence` interno);
- `ProductStrategy` — versionada (`ACTIVE` / `SUPERSEDED` / `STALE`), persistida e reutilizada entre gerações; registra `platformId` e `platformSkillVersion`;
- `ContentPlan` + `ContentOpportunity` — o plano é decisão de conjunto antes de qualquer texto; cada oportunidade carrega objetivo comercial, ângulo, `coreMessage`, prova, `hookMechanism` e `noveltyTargets`;
- `Content` + `ContentBriefVersion` — identidade estável em `DRAFT` e versão inicial imutável, entregues à Content Operations;
- `ProductMemorySnapshot` — snapshot consistente do que já foi explorado, com pesos `gerado < aprovado < concluído` e descarte como sinal;
- `BriefValidationReport` — status estrutural/factual/plataforma/variedade e decisão `PASS | REPAIR | REJECT`;
- `IntelligenceRun` — metadata interna de execução (engine version, skill version, modelo/provider por capability, custo, latência, retries).

Regras de contrato:

- Fato ≠ inferência. A engine pode inferir por que alguém compraria; não pode inventar o que o Produto é ou faz. O Fact Validator classifica claims como `SUPPORTED`, `INFERRED_BUT_SAFE`, `UNSUPPORTED` ou `CONTRADICTED`; `UNSUPPORTED` corrige/remove, `CONTRADICTED` rejeita.
- Nenhum briefing é válido só porque um LLM devolveu JSON: hard gate estrutural/factual é a autoridade. `Hard Gate Repair` é objetivo, usa `CONTENT_BRIEF_REPAIR` antes do Judge e pode consumir até `GENERATION_MAX_REPAIRS` rounds; somente depois de hard gate `PASS`, o `CONTENT_QUALITY_JUDGE` retorna `PASS|REVIEW` e `Semantic Part Repair` atua uma vez por parte `REVIEW`. O Variety Gate continua determinístico; judge de variedade/memória fica fora do MVP.
- Exaustão de `Hard Gate Repair` segue ADR-021. Falha de `Semantic Part Repair` preserva a parte original e não cria faltante; hard gates finais decidem `DRAFT`, parcial declarado ou `FAILED` — nunca sucesso parcial silencioso.
- Retry técnico é idempotente: não cria duas Strategies ativas, planos duplicados, briefings repetidos nem consumo duplicado.
- Novas gerações reutilizam a Strategy ativa e a memória; reconstrução integral acontece só quando a Strategy fica `STALE` ou há regeneração explícita.
- Conteúdo extraído de páginas de Produto é dado não confiável, nunca instrução: toda capability que usa LLM separa explicitamente system instructions, contexto confiável da engine e conteúdo do Produto (defesa contra prompt injection).
- Resultados intermediários podem ser persistidos para recuperação e auditoria, mas nunca aparecem como resultado final antes de `SUCCEEDED` ou `SUCCEEDED_PARTIAL` declarado do job (ADR-021).

A implementação da engine só é aceita com o Golden Dataset (produtos reais de categorias variadas) permitindo avaliar factualidade, variedade e naturalidade entre versões.

### Política de cardinalidade versionada

A cardinalidade dos arrays de cada contrato canônico é centralizada em uma política versionada por campo (`CARDINALITY_POLICY` / `CARDINALITY_POLICY_VERSION`, em `src/modules/commerce-intelligence/contract.ts`), não espalhada pelos validadores:

- **Máximos rígidos**: cada campo tem máximo incondicional; excedente é falha tipada `GEN-SCHEMA` fail-closed — nunca truncamento silencioso do provider.
- **Mínimos condicionais à evidência**: o mínimo estrutural só se aplica quando existe evidência autorizada (snapshot com refs); sem evidência, arrays estratégicos podem chegar vazios, porque o provider não inventa fatos.
- **Validação/reparo sem invenção**: violações de cardinalidade alimentam os retries de contrato existentes (envelope sem oportunidades, lote com cardinalidade divergente, raiz de plano inválida) e, persistindo, falham fechado — nenhum item é fabricado, preenchido ou aparado para fechar quantidade.
- **Versionamento e compatibilidade histórica**: a versão da política é registrada por geração (eventos de capability e sinais persistidos); gerações anteriores permanecem válidas sob a política vigente na sua execução, e mudanças de limites exigem bump explícito de versão.
- **Catálogo de evidências 1:1**: cada fato do catálogo tem exatamente uma `evidenceRef` na mesma posição (`fact:<chave>`; a partir do segundo valor de uma chave, `fact:<chave>:<n>`), garantindo que a citação por índice na proveniência aponte para o fato correto.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Schemas canônicos por capability + gates (escolhida) | Contratos verificáveis, factualidade obrigatória, rastreabilidade | Mais schemas e validação para manter |
| Envelope único entrada/saída (ADR-002 original) | Simples | Esconde validação factual, variedade e repair; incompatível com os PRDs |
| Prompt gigante Product → Briefings | Rápido | Sem variedade real, sem validação, acoplado a um modelo |
| Swarm de agentes por dimensão | Modularidade aparente | Complexidade e custo sem necessidade arquitetural demonstrada |

## Consequências positivas

- Cada etapa tem contrato verificável; falhas são identificáveis por capability.
- Estratégia persistente evita custo e contradição entre gerações.
- Rastreabilidade completa: Product → Strategy version → Plan → Opportunity → Skill version → Content → BriefVersion → versão aprovada → RecordingBatchItem → Execução.
- Troca de modelo/provider não altera o domínio.

## Consequências negativas e riscos

- Volume de schemas e validação é o maior custo de engenharia do MVP.
- Gates determinísticos não capturam toda paráfrase; avaliação semântica de variedade ou memória exigiria judge e custo, portanto permanece fora do MVP.
- Schemas podem evoluir; toda mudança exige versionamento explícito para não invalidar histórico.

## Segurança / Operação

- Validação de schema, tamanho, cardinalidade e duplicatas antes de persistir.
- `IntelligenceRun` registra provider/modelo e custo sem guardar payload bruto por padrão.
- Falhas por capability usam códigos internos (`BRIEF_GENERATION_FAILED`, `REPAIR_EXHAUSTED`, …) traduzidos em mensagem humana pelo fluxo do job.

## Relações

- [ADR-002](./adr-002-engine-estrategica-como-core.md) — engine como core (vigente), contrato v1 (superseded).
- [ADR-003](./adr-003-postgresql-memoria-e-rastreabilidade.md) — persistência e proveniência.
- [ADR-004](./adr-004-variedade-por-memoria-estruturada.md) — variedade e memória.
- [ADR-013](./adr-013-model-router-e-intelligence-tier.md) — roteamento de modelos para capabilities.
- [ADR-014](./adr-014-platform-skill-versionada.md) — Skill como dependência da geração.
- [ADR-015](./adr-015-content-operations-e-recording-batch.md) — destino dos contents em `DRAFT`.
