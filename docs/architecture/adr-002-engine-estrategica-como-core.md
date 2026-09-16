# ADR-002: Commerce Intelligence Engine como core estratégico

## Status

Aceito — baseline do domínio do MVP.

> **Revisão:** a decisão de engine-como-core permanece vigente. A seção "Contrato mínimo versionado da engine" (`GenerationInput v1` / `GenerationOutput v1`) foi **superseded** pelo [ADR-012](./adr-012-contratos-canonicos-da-commerce-intelligence.md), que registra os schemas canônicos derivados dos PRDs vigentes.

## Contexto

O diferencial do produto não é produzir texto isolado, mas decidir como transformar um produto em uma estratégia comercial, distribuir um plano variado e organizar a execução. A engine precisa manter contexto e memória para não parecer um wrapper de chat genérico.

O modelo de linguagem pode ajudar na análise e na redação, mas não deve definir sozinho a arquitetura do produto. A decisão estratégica precisa permanecer reutilizável para o creator no MVP e para uma futura produção automática por IA.

**Relação com o PRD:** §§ 7, 12–23, 33–37, 40, 45–47, 54–56 e 58.

## Decisão

Tratar a Commerce Intelligence Engine como o core de domínio e aplicação. Ela será responsável por:

- interpretar produto e contexto;
- construir a análise comercial;
- selecionar públicos, dores, desejos, objeções e benefícios;
- escolher ângulos, estruturas, hooks e CTAs;
- montar um plano cuja distribuição seja resultado da estratégia, não uma contagem fixa;
- consultar a memória histórica e aplicar o controle de variedade do ADR-004;
- validar que cada conteúdo tem estrutura mínima e registrar a razão estratégica quando disponível.

O caso de uso de geração monta um snapshot de entrada com produto, contexto, preferências explícitas e histórico relevante. A engine devolve estruturas versionadas de estratégia, plano e conteúdo. Um adaptador de modelo de linguagem pode preencher ou redigir partes textuais, mas o domínio continua responsável por contrato, composição, validação e rastreabilidade.

O core não importa Next.js, Prisma, SDK de modelo ou fornecedor de mídia. Não será criado um framework genérico de plugins: haverá apenas os limites necessários para o primeiro provedor de texto e, futuramente, para mídia.

### Contrato mínimo versionado da engine

Antes de implementar a engine, deve existir um contrato conceitual v1 aprovado. Ele não é um schema de código; fixa apenas o acordo de domínio entre caso de uso, engine e persistência.

**Envelope de entrada `GenerationInput v1`**

- `contract_version`: obrigatório, inicialmente `1`;
- `operation`: inicialmente geração de estratégia e plano;
- `product_snapshot`: produto identificado, nome, descrição manual, categoria e demais fatos disponíveis;
- `strategy_context`: objetivo, público, estilo, presença do creator, experiência, restrições, mercado e `locale`;
- `history_snapshot`: histórico autorizado do produto, incluindo dimensões, estados e contagens relevantes para variedade;
- `request`: quantidade desejada e objetivo opcional da geração.

O envelope usa dados congelados no início da execução, não referências mutáveis que possam mudar no meio do job. No MVP, `locale` é `pt-BR`; não há infraestrutura de i18n.

**Envelope de saída `GenerationOutput v1`**

- `contract_version` e `engine_version`;
- uma análise comercial com problema, diferenciais, benefícios, riscos e argumentos;
- coleções de públicos, dores, desejos, objeções e ângulos para alimentar o plano;
- um plano único com distribuição estratégica;
- `contents` com exatamente a quantidade solicitada, cada um contendo público, dor, desejo/benefício, ângulo, hook, estrutura, script, pelo menos uma cena e CTA;
- dimensões de variedade e explicação estratégica curta por conteúdo, quando disponível;
- `provenance` com `generation_run_id`, produto/estratégia de origem, `input_snapshot_hash`, versão da taxonomia, `engine_version`, provedor/modelo e instante de geração.

**Cardinalidade e validação mínima**

- a quantidade solicitada é inteira, de 1 a 50, sujeita ao limite de plano menor;
- a análise e o plano são únicos; públicos, dores, desejos, benefícios e ângulos têm pelo menos um item e no máximo oito; objeções podem ser vazias e têm no máximo oito;
- `contents` tem exatamente `N` itens; identificadores são únicos na execução e cada conteúdo referencia dimensões existentes na própria saída;
- campos obrigatórios não podem ser vazios, hooks normalizados não podem ser duplicados na mesma execução e cada item deve passar validação estrutural antes de persistir;
- saída inválida falha a execução inteira ou solicita nova tentativa; não há sucesso parcial silencioso.

**Proveniência e pré-condição de implementação**

A aplicação deve associar a saída à execução, ao snapshot de entrada e à versão da engine sem sobrescrever gerações anteriores. A implementação da engine só começa depois de existir um produto-exemplo gold-standard aprovado: entrada manual completa, contexto, estratégia, plano com quantidade definida, conteúdos anotados com dimensões e critérios de variedade/qualidade. Esse exemplo será o primeiro artefato de aceitação ponta a ponta, não uma lista de casos hipotéticos.

## Rationale

1. Concentra a propriedade intelectual no lugar que define o valor do produto.
2. Permite melhorar a estratégia sem reescrever interface, persistência ou executor de mídia.
3. Torna observável se a qualidade veio da estratégia, do contexto ou do provedor textual.
4. Mantém a mesma inteligência para os planos, conforme a regra do PRD §34.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| Engine como core com adaptador de texto (escolhida) | Reutilização, contrato claro, troca de provedor possível | Exige validar saídas e manter versão da engine |
| Wrapper de prompts por tela | Começo rápido | Duplica contexto, não garante variedade nem memória e acopla o produto ao provedor |
| Engine somente determinística, sem modelo textual | Previsibilidade | Qualidade textual e velocidade de evolução insuficientes para o PRD |
| Multi-provider completo no MVP | Flexibilidade teórica | Registro, fallback e configuração extras antes de haver necessidade |

## Consequências

- A implementação deve partir do contrato v1 e do produto-exemplo gold-standard aprovados, antes de expandir todas as variações.
- Saídas do provedor precisam ser validadas e normalizadas antes de persistir ou exibir.
- Alterações no comportamento estratégico exigem nova versão da engine, permitindo comparar gerações antigas.
- O modelo pode alucinar benefícios ou alegações; o conteúdo continua editável e sujeito à revisão do creator, sem publicação automática.

## Segurança / Operação

- O adaptador deve receber apenas o contexto autorizado e necessário para a geração.
- Respostas do provedor são dados não confiáveis: validar schema, tamanho, conteúdo obrigatório e falhas antes de gravar.
- Registrar provedor/modelo e versão da engine para diagnóstico, evitando guardar payload bruto por padrão.
- A engine não pode ignorar autorização, limite de plano ou escopo de tenant; essas verificações ocorrem no caso de uso antes da execução.

## Fora do MVP

Aprendizado automático de preferências, otimização baseada em vendas, judge LLM de variedade ou memória, personalização por performance, treinamento de modelo próprio e produção de vídeo, imagem ou voice-over. `CONTENT_QUALITY_JUDGE` interno por partes do Slice 003 é uma exceção limitada após o hard gate; não é aprovação humana nem judge de variedade/memória.

## Gatilhos de revisão

- contrato de saída não suportar um caso real recorrente;
- necessidade de dois provedores de texto simultâneos por custo, disponibilidade ou região;
- métricas de qualidade mostrarem que regras de composição não bastam;
- evolução para otimização baseada em performance externa.
