# ADR-030: Retirada de comissão e características do contrato ativo do Product

## Status

Aceito — decisão de coordenação (Blueprint #2) para o corte de comissão (`commissionType`/`commissionValue`) e características (`features`/`characteristics`) da superfície e dos contratos ativos: service, API de leitura, projeção da Commerce Intelligence e formulário (frontend sob ownership próprio). SPEC/PLAN do slice-002 atualizados por este ADR. O PRD não foi alterado automaticamente; o conflito documental está registrado em "Relações".

## Contexto

O Product carregava comissão e características como campos factuais do cadastro manual: o service validava (`VAL-COMMISSION-*`, `VAL-FEATURES-REQUIRED`), persistia nas colunas `commissionType`/`commissionValue`/`features`, a API projetava os três campos e o worker os envia como fatos à engine (`features` entrava no evidence catalog como `fact:features`), que mantinha um strip defensivo de comissão no contexto de IA. A decisão de produto removeu esses campos da superfície: a engine não deve mais recebê-los e o formulário/API não devem mais expô-los ou consumi-los.

## Decisão

1. **Contrato ativo sem comissão/features:** `validateManualProductInput`/`validateProductFacts` não validam, não tipam e não emitem erro para `commissionType`, `commissionValue` ou `features`; os campos enviados são ignorados silenciosamente (sem erro, sem escrita). `ProductView` não projeta os três campos — inclusive para registros históricos que ainda os carregam.
2. **Projeção canônica da engine sem features:** `projectEngineFacts` (worker) não inclui `features` nem qualquer campo de comissão, mesmo em linhas históricas populadas. O evidence catalog e os gates permanecem genéricos: `fact:<chave>` continua derivado de qualquer fato autorizado presente.
3. **`stripCommission` preservado como sanitização de fronteira:** `EngineInput.facts` é `Record<string, unknown>`; o strip em `runFirstGeneration` continua sendo a última barreira contra chaves de comissão vindas de contexto genérico antes do provider. Não é contrato de domínio nem consumo do campo. O teste de não vazamento permanece.
4. **Histórico preservado, escrita eliminada:** criar/atualizar nunca escrevem `commissionType`, `commissionValue` ou `features`; o PATCH omite as chaves do `data`, portanto legado não enviado nunca sobrescreve o histórico. Migration aditiva `20260920130000_product_features_default`: `features` recebe `DEFAULT '[]'` (a coluna é `NOT NULL` sem default) e as colunas de comissão permanecem inalteradas (nullable). Nenhum dado é removido ou alterado.
5. **Candidate de importação permanece transitório:** `ProductCandidate`/`ProductImportCandidate` podem continuar carregando `features` como fato transitório da importação (CaptAPI), mas não mapeiam para Product, formulário ou engine (o merge para o draft deixa de consumir). Contrato do slice-012/ADR-028 não é alterado por este ADR.

## O que não muda

- ADR-012 (contratos canônicos da Commerce Intelligence) permanece intacto.
- Desconto tipado (ADR-024), tenant scoping, idempotência, lifecycle e versão do Product.
- Geração existente: os gates que usam `fact:features` como fixture abstrata, o detector editorial `feature_list` e as instruções genéricas do provider permanecem (são conceitos editoriais, não o campo factual do Product).

## Alternativas consideradas

| Opção | Decisão | Motivo |
|---|---|---|
| Drop das colunas com migration destrutiva | Rejeitada | Perde histórico; retenção (ADR-023) exige remoção apenas por DELETE deliberado |
| Manter features obrigatória com valor vazio default | Rejeitada | Recriaria campo sem superfície; contrato ativo deve parar de consumir, não mascarar |
| Remover `stripCommission` (contrato sem comissão) | Rejeitada | `EngineInput.facts` é genérico; a barreira de fronteira continua sendo defesa em profundidade |

## Consequências

- Positivas: superfície menor (form/API/service), engine sem dados não autorizados, histórico preservado sem migração destrutiva, custo de geração levemente menor (menos fatos).
- Negativas/riscos: gerações novas ficam sem características como evidência (menos `fact:features` disponíveis ao provider — aceito pela decisão de produto); clientes que ainda enviam os campos têm valores silenciosamente ignorados durante o cutover do frontend; linhas históricas conservam comissão/features invisíveis na API.

## Relações

- SPEC slice-002 (B-002, RI-001, §7 sem `VAL-FEATURES-REQUIRED`, §10, §12) e PLAN slice-002 (§3.1, §4.2, §4.6) atualizados.
- Conflito documental NÃO resolvido nos PRDs (fora do escopo deste ADR, reportado à coordenação): PRD.md (principais características como entrada), PRD-commerce-intelligence-engine.md (características entre os dados do produto; features relacionadas a capabilities) e PRD-product-intelligence-analysis.md (características na análise). ADR-008 menciona características como conteúdo possível do Candidate (entrada URL-first — segue válida para o Candidate transitório).
- ADR-023 (retenção: colunas legadas sujeitas à mesma política), ADR-028 (Candidate transitório inalterado).
