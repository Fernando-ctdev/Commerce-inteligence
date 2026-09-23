# ADR-014: Platform Skill versionada como conhecimento da engine

## Status

Aceito — dependência de conhecimento da Commerce Intelligence.

## Contexto

A estratégia comercial não existe isolada da plataforma de distribuição: o mesmo Produto exige execução diferente em TikTok, Instagram Reels, YouTube Shorts ou Shopee Video. O conhecimento de "como fazer conteúdo que funciona no TikTok Shop" é repertório especializado — ritmo, hooks, demonstração, linguagem oral — e não pode ficar disperso em prompts soltos nem virar um segundo workflow.

## Decisão

Modelar o conhecimento de plataforma como **Platform Skill** versionada, consumida pela engine como dado:

```text
interface PlatformSkill {
  id; platform; version;
  principles; executionRules;
  hookPatterns; narrativePatterns; proofPatterns; ctaPatterns;
  validationRules;
}
```

- No MVP existe uma Skill: **TikTok Commerce Creative Skill** (`tiktok-commerce@1.x`), favorecendo conteúdos rápidos, naturais, diretos, visuais, demonstráveis, graváveis com celular e com linguagem falada — sem fórmula rígida.
- A Skill **influencia como explorar** uma oportunidade (`CommercialOpportunity + ProductStrategy + Skill → TikTok-compatible ContentOpportunity`); não inventa oportunidade, não decide fatos, não substitui o Strategy Builder.
- A Skill **não controla workflow**: sem acesso a jobs, persistência, billing, retry ou estados. Ela é insumo de capabilities, carregada por versão.
- Toda geração registra qual versão foi usada (`platformSkillVersion` em Strategy, Plan e `IntelligenceRun`), permitindo reproduzir comportamento, comparar qualidade entre versões e evoluir conhecimento sem reescrever a engine.
- Skills são dados versionados no repositório/registro da engine — não código ramificado por plataforma e não marketplace de plugins.

## Alternativas consideradas

| Opção | Decisão | Trade-off |
|---|---|---|
| Skill versionada como dado (escolhida) | Conhecimento evoluível, rastreável e substituível | Versionamento e registro por geração |
| Regras embutidas em prompts da engine | Rápido | Invisível, não versionável, muda comportamento silenciosamente |
| Código especializado por plataforma | Controle total | Fork do domínio a cada nova plataforma |
| Skill como agente/workflow próprio | Autonomia | Duplica orquestração que já é responsabilidade da engine |

## Consequências positivas

- Conhecimento de plataforma evoluí com histórico comparável (Golden Dataset avalia versões).
- Estratégia e briefing carregam a assinatura da versão usada — rastreabilidade ponta a ponta.
- Novas plataformas entram como Skill nova, sem alterar capabilities ou domínio.

## Consequências negativas e riscos

- Skill mal calibrada degrada qualidade em silêncio; mitigado por evals e versionamento.
- Duas fontes de conhecimento (Skill + prompts de capability) exigem disciplina: regras de negócio nunca moram só na Skill.

## Segurança / Operação

- Skill não recebe dados de Tenant nem conteúdo de Produto persistido; é conhecimento estático carregado por versão.
- Mudança de versão exige avaliação no Golden Dataset antes de virar default.

## Relações

- [ADR-002](./adr-002-engine-estrategica-como-core.md) — engine como core.
- [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md) — contratos e Golden Dataset.
- [ADR-013](./adr-013-model-router-e-intelligence-tier.md) — roteamento e evals de modelos.
- `PRD-commerce-intelligence-engine.md` §§ 18–22 — fonte de produto vigente.
