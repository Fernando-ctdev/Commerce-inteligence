# ADR-026: Pureza creator-facing — locators internos e metainstrução de inserção

## Status

Aceito — refinamento contratual separado, recomendado pela revisão arquitetural (Northstar/Review) na aprovação do ADR-025, sem reabrir batching. Não altera conteúdo persistido do job `0e94549e-1391-47b5-82a1-51bbb2890aff`; vale somente para gerações futuras.

## Contexto

Na rodada real do ADR-025, dois artefatos internos apareceram em campos creator-facing (hook/development/script/cta e cenas):

1. locator de evidência literal — `[fact:features]` — no script;
2. metainstrução de inserção editorial — "Eu colocaria aqui um objeto pequeno..." — no script.

Causa raiz contratual: a instrução de geração mandava "todo claim objetivo precisa citar o evidenceRef do fato que o sustenta", e o repair de parte pedia "ancore cada claim objetivo a um evidenceRef existente". O modelo passou a escrever o ref no texto. Refs (`fact:*`, `product:*`) são metadados de contexto/relatório; a sustentação factual no texto é pelos TERMOS do fato (checagem já determinística do hard gate). A fronteira editorial script×cenas já existe (ADR-025 §5); faltava o padrão de inserção condicional em 1ª pessoa e o bloqueio de locators.

## Decisão

1. **Locators nunca chegam a campo creator-facing.** `hook`, `development`, `script`, `cta` e `scene.description` não contêm token de locator interno: colchete `namespace:token` sem espaço (ex.: `[fact:features]`, `[product:name]`, `[fact:features:2]`). Refs continuam legítimos somente em contexto de capability (`relevantFacts`, `factRef` estruturado do repair) e em `BriefValidationReport`.
2. **Validação determinística estreita, antes da persistência/projeção, sem strip silencioso.** Detector regex de formato (`internalLocator`) no hard gate (`validateBriefSet`) e no gate de cenas (`gateSceneSet`); nada é removido em silêncio — a aparição vira issue/drop explícito e segue o fluxo existente.
3. **Efeito seletivo, sem REJECT automático.** Locator em `hook`/`script`/`cta`/`development` gera issue por parte (`<parte> contém locator interno de evidência`) → decisão `REPAIR` do briefing (causa `removeLocator` no checklist do `CONTENT_BRIEF_REPAIR`, que corrige somente os problemas listados). Locator em uma cena derruba **somente aquela cena** (`locator_interno` no `gateSceneSet`); o set segue o fluxo já previsto quando fica abaixo do mínimo.
4. **Metainstrução de inserção.** Detector estreito: condicional de 1ª pessoa de inserção (`colocaria/poria/...`) + dêitico editorial `aqui` + objeto/elemento visual em até 2 tokens (ex.: "Eu colocaria aqui um objeto pequeno"). Vira a issue já existente `script contém metainstrução de cena` (`REPAIR`, checklist `removeSceneMetacomment`). Fala legítima não casa: "Eu pegaria esse modelo porque...", "aqui cabe no bolso", "dá um close".
5. **Prompts/contratos corrigidos na raiz.** A instrução de geração passa a exigir sustentação pelos termos do fato e proíbe escrever refs/locators em texto; o repair de parte idem; o repair de briefing recebe a cláusula `removeLocator`.
6. **Detecção sem chamada LLM.** Ambos os detectores são regex in-process no gate; nenhum capability novo, Judge, embedding, schema novo ou chamada extra. As regressões comprovam a contagem de chamadas do fluxo (apenas o repair já previsto).

## Consequências

- Positivas: artefatos internos não publicam; reparo seletivo por parte/cena; causa raiz (instrução contraditória) eliminada; custo zero em chamadas.
- Negativas: regex estreita pode deixar passar variantes não cobertas — aceito; o caso evoluível é ampliar o padrão com evidência, não criar plataforma de detecção.
- Sem migration, quota, endpoint, UI ou feature flag nova.

## Relações

- ADR-019/020/021/025; SYSTEM-DESIGN §Commerce Intelligence (segurança de LLM, gates); SPEC slice-003 B-003-07/08/09.
