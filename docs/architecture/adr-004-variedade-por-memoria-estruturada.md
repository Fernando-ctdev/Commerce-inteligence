# ADR-004: Controle de variedade por memória estruturada

## Status

Aceito — heurística inicial do MVP, com limite conhecido.

## Contexto

Evitar repetição é o principal mecanismo que diferencia a plataforma de uma conversa genérica com IA. O PRD pede que novas gerações consultem o histórico e priorizem lacunas de público, dor, benefício, objeção, ângulo, estrutura, hook e CTA.

A revisão do PRD conduzida pelo Sentinel classifica a definição de variedade como risco P0. O MVP, porém, não tem dados suficientes para justificar embeddings, banco vetorial ou um avaliador semântico separado.

**Relação com o PRD:** §§ 7, 18–25, 33, 35–37, 45–46, 54–55 e 58.

## Decisão

Implementar variedade como uma restrição do domínio baseada em memória estruturada:

1. Cada conteúdo persiste as dimensões estratégicas efetivamente usadas.
2. A engine calcula cobertura e frequência por produto e contexto de estratégia.
3. O planejador favorece dimensões sub-representadas e penaliza combinações repetidas.
4. Hooks e textos passam por normalização para bloquear duplicatas exatas ou diferenças apenas de formatação.
5. Conteúdos descartados continuam na memória histórica; uma repetição deliberada precisa ser uma escolha explícita do usuário e fica registrada como regeneração/override.

A distribuição do plano é consequência do contexto e da cobertura, não uma tabela fixa para todos os produtos. A taxonomia pode crescer como dado versionado, mas o algoritmo não dependerá de uma lista fixa na interface.

Não usar embeddings, similaridade semântica, LLM-as-judge ou aprendizado de performance no MVP.

## Rationale

1. É determinístico, explicável e barato de operar.
2. Usa diretamente a memória que o produto já precisa persistir.
3. Permite demonstrar variedade em exemplos e métricas antes de adicionar infraestrutura especializada.
4. Mantém uma trilha clara para substituir apenas o componente de pontuação no futuro.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| Taxonomia + cobertura + normalização (escolhida) | Simples, auditável e sem nova infraestrutura | Não detecta toda paráfrase semanticamente semelhante |
| Embeddings e busca vetorial | Melhor potencial para similaridade semântica | Custo, tuning, privacidade e banco adicional antes de haver baseline |
| LLM como avaliador de repetição | Flexível em linguagem | Latência, custo, não determinismo e difícil explicação |
| Apenas contagem por ângulo | Muito simples | Ignora público, dor, hook, estrutura e combinação entre dimensões |

## Consequências

- A engine precisa retornar as dimensões usadas, não somente texto livre.
- O sistema pode deixar passar dois hooks semanticamente parecidos quando usam dimensões diferentes.
- A simplificação deliberada é: **metadados e normalização detectam repetição exata/estrutural, não toda paráfrase**. Só adicionar embeddings se exemplos medidos mostrarem que a heurística não protege a experiência.
- A memória não pode ser apagada ao excluir um conteúdo, pois isso permitiria que o gerador recriasse a mesma ideia sem saber.

## Segurança / Operação

- O histórico usado no cálculo deve ser limitado ao tenant, produto e contexto autorizados.
- A normalização deve ser previsível e não substituir a revisão humana de alegações comerciais.
- Registrar a versão da taxonomia/heurística usada em cada geração facilita reproduzir e corrigir resultados.

## Fora do MVP

Embeddings, banco vetorial, deduplicação semântica sofisticada, aprendizado por preferência, performance externa e otimização baseada em vendas.

## Gatilhos de revisão

- conjunto de exemplos reais demonstrar paráfrases repetidas apesar da cobertura;
- catálogo e histórico crescerem a ponto de a consulta relacional não atender à latência;
- usuários pedirem repetidamente correção da variedade;
- dados de performance passarem a existir e justificarem ranking aprendido.
