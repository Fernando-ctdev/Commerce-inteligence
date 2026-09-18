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

Definir um único contrato interno de `development` estruturado, compartilhado por geração inicial, repair, hard gate e judge semântico:

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

type QualityPartDiagnostic = {
  part: "hook" | "development" | "script" | "cta" | "scenes";
  criterion: string;
  status: "PASS" | "REVIEW";
  reason: string;
};

A fonte única do contrato fica junto aos predicados determinísticos do gate. Ela deriva `DevelopmentBullet` requirements da `EvidenceSnapshot`, valida `factRef`, action stem, conector e grounding, produz `text` somente após validação e volta a validar o briefing projetado por `validateBriefSet`. O `ContentBriefVersion` persistido continua com `development: string[]`; nenhum schema de banco, UI, API ou versão pública muda.

`CONTENT_BRIEF_GENERATION` e `CONTENT_BRIEF_REPAIR` passam a solicitar o mesmo formato estruturado. O primeiro devolve `items[]` com `development: DevelopmentBullet[]`; o segundo devolve um BriefDraft único com o mesmo campo. `CONTENT_QUALITY_JUDGE` recebe esse mesmo `DevelopmentBullet[]` efêmero e o `creatorContext` já allowlisted; devolve `QualityPartDiagnostic[]`, um por parte/critério avaliado. O adapter/engine rejeita formato inválido antes de alimentar o gate.

O judge avalia somente coerência, naturalidade do script, adequação de plataforma e execução no creator context. Ele não aprova factualidade, `factRef`, grounding, action, conector ou cardinalidade, nem repete esses predicados. `validateBriefSet` continua autoridade factual, estrutural e de variedade; `REVIEW` do judge somente informa o repair seletivo da parte e nunca publica conteúdo, cria parcial ou substitui decisão do hard gate.

## Diagnóstico e observabilidade

Cada item que falhar em `development` registra diagnóstico redigido por bullet: índice e flags/contagens acima. A avaliação do judge registra somente `part`, `criterion`, `status` e `reason`; seu diagnóstico da parte vai ao `CONTENT_PART_REPAIR` do mesmo item junto do `creatorContext` allowlisted. Nenhum diagnóstico registra texto do draft, prompt, resposta do provider, fato integral, segredo, token ou payload bruto. O repair de briefing recebe apenas o diagnóstico do próprio item, requirements derivados do gate, fatos já allowlisted e contraste seguro já existente. `IntelligenceRun.metadata` mantém o resumo sanitizado para `FAILED`/`SUCCEEDED_PARTIAL`; não há nova tabela, endpoint ou UI.

## Invariantes

1. A LLM nunca define validade: geração e repair são revalidados pelo mesmo predicado determinístico antes de persistência; o judge só pode devolver `PASS` ou `REVIEW`.
2. `factRef` é server-validated contra a EvidenceSnapshot e nunca é `product:name`; locators continuam proibidos do texto creator-facing.
3. O judge recebe o mesmo `DevelopmentBullet[]` e `creatorContext` do item, mas não reimplementa gate factual/grounding nem altera sua decisão.
4. O conjunto mantém exact-N, IDs server-derived, isolamento por item, limites de repair, gate factual/estrutural/variedade e ADR-021 para parcial declarado.
5. Conteúdo falho não publica nem sinaliza memória; dados observáveis são sanitizados e internos.
6. A mudança não recalcula Understanding, Strategy, Opportunity ou Plan, não troca tier/provider e não altera quota.

## Escopo

- Contrato estruturado compartilhado de `development` para generator, repair, gate e judge.
- Instruções de provider alinhadas ao contrato, incluindo `creatorContext` do judge.
- Diagnóstico redigido por bullet e por parte/critéio no fluxo de repair/falha.
- Regressões para feature-list, connector-missing, script-naturalness e passagem de diagnóstico do judge ao repair.

## Não escopo

- Reduzir ou remover gates; tratar qualidade por prompt somente; dar autoridade factual/grounding ao judge; backfill de jobs; persistência de drafts brutos; UI/endpoint; novo provider/modelo/tier; mudanças em Product Understanding, Strategy, Opportunity, Plan, quota ou estados de job.

## Riscos

- O formato estruturado aumenta a disciplina exigida do provider e pode converter falhas tardias em `GEN-SCHEMA`; isso é preferível a texto inválido chegar ao hard gate e é coberto pelo retry contratual existente.
- O diagnóstico por bullet ou por parte pode vazar conteúdo se incluir texto, refs ou prompt; os contratos limitam-se a índices, flags, contagens, parte, critério, status e reason allowlisted.
- O judge pode divergir editorialmente sem qualquer defeito objetivo; `REVIEW` permanece seletivo e nunca flexibiliza ou duplica o gate.
