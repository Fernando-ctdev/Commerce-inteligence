# Design — Contrato único de qualidade de Brief

**Data:** 2026-09-18  
**Status:** aprovado para planejamento  
**Classificação:** mudança arquitetural de contrato interno da pipeline de conteúdo.

## Problema e evidência

O limite verificável da falha é `CONTENT_BRIEF_GENERATION`/`CONTENT_BRIEF_REPAIR` antes do hard gate, não Product Understanding, oportunidades, Strategy ou plano.

- Job `c529711d-081f-4cf7-b21b-5d57b1944808`, Product `afb06870-ef99-4337-bcc0-436920630d72`: `FAILED`, `GEN-REPAIR-EXHAUSTED`, em `GENERATING_BRIEFS`; 4 de 5 itens (`1,2,3,5`) ficaram com `development_issue`. Os mesmos reports tiveram factual, estrutural, plataforma e variedade `PASS`; o produto traz descrição e seis fatos específicos, portanto não há evidência de escassez factual.
- Job `7a84e026-a4fc-43f2-9e69-7f2854090e69`, outro Product: `SUCCEEDED_PARTIAL`; conteúdo 4 falhou por `feature_list`/`connector_missing` e conteúdo 2 por `script_naturalness`/`composition_rejected`. A repetição entre categorias aponta para contrato de geração/repair, não para fato ou Strategy específicos.
- Em falhas, a finalização não persiste Understanding, Strategy, Plan ou Opportunities. `IntelligenceRun.metadata` preserva somente diagnóstico sanitizado; não é possível alegar perda/contaminação upstream sem nova observabilidade redigida.

Hoje o gerador inicial devolve `development: string[]`; o repair já devolve objetos estruturados, mas ambos dependem de instruções diferentes e o hard gate reavalia apenas o texto projetado. Isso permite uma saída sintaticamente válida que não carrega ação, conector, referência factual e razão suficientes para o mesmo predicado que a reprova.

## Decisão

Definir um único contrato interno de `development` estruturado, compartilhado por geração inicial, repair e hard gate:

```ts
type DevelopmentBullet = {
  text: string;
  action: string;
  factRef: string;
  rationale: string;
};

type DevelopmentBulletDiagnostic = {
  index: number;
  actionPresent: boolean;
  factRefAllowed: boolean;
  connectorPresent: boolean;
  textGroundingMatched: number;
  rationaleGroundingMatched: number;
  shotList: boolean;
  unverifiedClaim: boolean;
};
```

A fonte única do contrato fica junto aos predicados determinísticos do gate. Ela deriva `DevelopmentBullet` requirements da `EvidenceSnapshot`, valida `factRef`, action stem, conector e grounding, produz `text` somente após validação e volta a validar o briefing projetado por `validateBriefSet`. O `ContentBriefVersion` persistido continua com `development: string[]`; nenhum schema de banco, UI, API ou versão pública muda.

`CONTENT_BRIEF_GENERATION` e `CONTENT_BRIEF_REPAIR` passam a solicitar o mesmo formato estruturado. O primeiro devolve `items[]` com `development: DevelopmentBullet[]`; o segundo devolve um BriefDraft único com o mesmo campo. O adapter/engine rejeita formato inválido antes de alimentar o gate. O gate continua autoridade factual, estrutural e de variedade; não há relaxamento, fallback oculto, terceiro round ou geração determinística de conteúdo.

## Diagnóstico e observabilidade

Cada item que falhar em `development` registra diagnóstico redigido por bullet: índice e flags/contagens acima. Não registra texto do draft, prompt, resposta do provider, fato integral, segredo, token ou payload bruto. O repair recebe apenas o diagnóstico do próprio item, requirements derivados do gate, fatos já allowlisted e contraste seguro já existente. `IntelligenceRun.metadata` mantém o resumo sanitizado para `FAILED`/`SUCCEEDED_PARTIAL`; não há nova tabela, endpoint ou UI.

## Invariantes

1. A LLM nunca define validade: geração e repair são revalidados pelo mesmo predicado determinístico antes de persistência.
2. `factRef` é server-validated contra a EvidenceSnapshot e nunca é `product:name`; locators continuam proibidos do texto creator-facing.
3. O conjunto mantém exact-N, IDs server-derived, isolamento por item, limites de repair, gate factual/estrutural/variedade e ADR-021 para parcial declarado.
4. Conteúdo falho não publica nem sinaliza memória; dados observáveis são sanitizados e internos.
5. A mudança não recalcula Understanding, Strategy, Opportunity ou Plan, não troca tier/provider e não altera quota.

## Escopo

- Contrato estruturado compartilhado de `development` para generator, repair e gate.
- Instruções de provider alinhadas ao contrato.
- Diagnóstico redigido por bullet no fluxo de falha e regressões reais.
- Regressões para feature-list, connector-missing e metainstrução de cena/script-naturalness.

## Não escopo

- Reduzir ou remover gates; tratar qualidade por prompt somente; backfill de jobs; persistência de drafts brutos; UI/endpoint; novo provider/modelo/tier; mudanças em Product Understanding, Strategy, Opportunity, Plan, quota ou estados de job.

## Riscos

- O formato estruturado aumenta a disciplina exigida do provider e pode converter falhas tardias em `GEN-SCHEMA`; isso é preferível a texto inválido chegar ao hard gate e é coberto pelo retry contratual existente.
- O diagnóstico por bullet pode vazar conteúdo se incluir texto ou refs; o contrato limita-se a índices, flags e contagens.
- Se duas execuções reais após o contrato compartilhado tiverem a mesma assinatura residual, a próxima decisão é avaliação de modelo/provider conforme ADR-020, nunca relaxar o gate.
