# ADR-008: Entrada de produto manual-first

## Status

Aceito — escopo de entrada do MVP.

## Contexto

O PRD permite iniciar com link ou descrição, mas a URL pode exigir fetch, autenticação ou scraping que não são parte do foco. A engine precisa de fatos suficientes e não pode depender de uma integração frágil para o primeiro valor.

**Relação com o PRD:** §§ 6, 10 e 32; a revisão do PRD conduzida pelo Sentinel apontou a dependência oculta de scraping como risco P1.

## Decisão

Descrição manual é o caminho primário e canônico para criar um produto e gerar estratégia. Nome e descrição são suficientes para o fluxo inicial; categoria, preço, características, observações, imagem e URL enriquecem quando disponíveis.

URL é opcional e funciona como metadado e fonte best-effort, atrás de um adaptador isolado de enriquecimento. Falha, bloqueio ou conteúdo incompleto da URL não bloqueia o produto manual nem transforma o MVP em integração com TikTok Shop. Não haverá scraping complexo, crawler, autenticação de marketplace ou garantia de extração.

O locale persistido no contexto é `pt-BR` no MVP. Não criar catálogo de traduções, negociação de locale ou infraestrutura de i18n agora; a evolução futura poderá versionar taxonomias e textos por idioma.

## Rationale

1. Entrega valor mesmo quando uma página não pode ser acessada.
2. Mantém o limite entre produto e fonte externa simples e substituível.
3. Evita que a entrada por URL contradiga o não objetivo de scraping complexo.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| Manual-first + URL best-effort (escolhida) | Fluxo confiável, baixo acoplamento e falha controlada | Menos automação e exige dados do creator |
| URL-first com scraping | Menos digitação quando funciona | Frágil, sujeito a bloqueio e escopo externo ao MVP |
| Somente descrição manual | Menor implementação | Perde uma conveniência futura de baixo acoplamento |

## Consequências

- O onboarding não promete importar uma página; a descrição manual é o fallback e o caminho de sucesso.
- O adaptador de URL pode ser removido ou trocado sem alterar a engine.
- O primeiro lançamento é `pt-BR`; internacionalização fica preparada apenas pela presença do locale no contexto.

## Segurança / Operação

- URL e conteúdo obtido são entrada não confiável: limitar tamanho, tempo, redirecionamentos e tipos aceitos.
- O fetch ocorre fora do caminho transacional e não deve permitir acesso a rede interna ou segredos.
- Não armazenar credenciais de marketplace nem reproduzir conteúdo externo sem política de retenção.

## Fora do MVP

Scraping complexo, crawler, login TikTok/TikTok Shop, importação garantida de catálogo, múltiplos idiomas e infraestrutura de i18n.

## Gatilhos de revisão

- taxa medida de abandono por preenchimento manual;
- provider oficial de catálogo disponível e autorizado;
- necessidade de lançar outro idioma/mercado;
- requisitos de importação em lote ou atualização automática de produto.

