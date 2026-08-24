# ADR-005: Gerações assíncronas e duráveis

## Status

Aceito — mecanismo do MVP preparado para operações longas.

## Contexto

Gerar uma estratégia ou um lote pode envolver várias etapas, chamadas a um provedor e validações. O PRD exige regeneração, novos lotes e continuidade do histórico; futuras gerações de mídia serão ainda mais demoradas. Uma requisição HTTP síncrona não oferece retry, progresso, idempotência ou recuperação após timeout.

**Relação com o PRD:** §§ 8, 23–25, 33–35, 49–51, 56–57 e 58.

## Decisão

Toda operação de geração será assíncrona, mesmo quando normalmente terminar rápido:

- uma transação curta cria uma `generation_run` durável, reserva o uso e devolve seu identificador;
- a execução entra em uma fila baseada no PostgreSQL;
- um worker do mesmo monólito reivindica o trabalho com lease/timeout;
- estados mínimos são `queued`, `running`, `succeeded`, `failed` e `cancelled`, com tentativa e erro sanitizado;
- chamadas ao provider acontecem fora de qualquer transação do banco; transações são curtas e usadas apenas para criar/reservar ou finalizar/reconciliar;
- o worker valida e confirma conteúdo, memória e uso em uma transação curta ao finalizar;
- `generation_run.id` é a chave idempotente única do job e a mesma chave compartilhada com a reserva do ADR-006;
- retries são limitados, com backoff, e a chave idempotente impede duplicar conteúdo ou uso ao repetir uma tentativa;
- a interface consulta o status da execução e mostra resultado ou falha recuperável.

O worker pode rodar como segundo processo do mesmo repositório/deploy. Não será criado um serviço de geração separado no MVP.

## Rationale

1. Preserva o fluxo mesmo quando o provedor demora ou falha.
2. Torna o resultado observável e retomável.
3. Usa o PostgreSQL já necessário para estado, histórico e quotas, evitando Redis/Kafka prematuros.
4. Deixa o mesmo mecanismo apto a receber jobs de mídia no futuro.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| Fila durável no PostgreSQL + worker (escolhida) | Uma dependência, transação próxima dos dados e operação simples | Compartilha recursos com o banco; precisa de leases e índices corretos |
| Resposta síncrona | Menos estados no começo | Timeout, duplicação e baixa tolerância a gerações longas |
| Redis/serviço de filas desde o início | Escala e recursos de fila dedicados | Mais infraestrutura e consistência entre fila e banco |
| Orquestrador distribuído | Workflows complexos e duráveis | Excesso de plataforma para o MVP |

## Consequências

- O produto precisa de tela/estado de “gerando”, polling ou atualização equivalente; streaming não é requisito.
- Falhas parciais não devem publicar conteúdo incompleto como se tivesse sucesso.
- A fila compartilha capacidade com o banco e pode ser o primeiro gargalo observado.
- O contrato do job deve separar o pedido do usuário da implementação do provedor, permitindo trocar o executor sem alterar a interface.
- Nenhuma transação fica aberta durante espera de rede, polling ou processamento do provider.

## Segurança / Operação

- Criar, consultar e cancelar uma execução exige autorização no tenant correto.
- Reserva de uso ocorre antes de enfileirar e é reconciliada em sucesso, falha ou cancelamento pelo ADR-006.
- Medir idade da fila, duração, tentativas, taxa de erro e jobs presos; alertar para backlog persistente.
- Segredos e payloads sensíveis não ficam na fila em texto desnecessário.

## Fora do MVP

Streaming de tokens, colaboração em tempo real, orquestrador distribuído, filas gerenciadas, geração de mídia e workflow de publicação.

## Gatilhos de revisão

- backlog sustentado ou latência que o banco não consiga atender;
- necessidade de escalar workers independentemente do web app;
- jobs excederem o timeout/lease com frequência;
- múltiplos tipos de jobs de mídia exigirem prioridades, dependências ou workflows complexos.
