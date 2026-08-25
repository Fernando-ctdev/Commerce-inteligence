# ADR-006: Limites de plano por entitlement e uso transacional

## Status

Aceito — escopo de limites do MVP.

## Contexto

O PRD define que a inteligência estratégica é igual em todos os planos e que a diferenciação comercial deve ser capacidade de uso. O MVP precisa validar disposição de pagamento e impedir que geração assíncrona contorne limites por concorrência ou retry.

Há vários limitadores possíveis, mas a revisão do PRD conduzida pelo Sentinel recomenda começar com dois para não espalhar regras: produtos ativos e conteúdos gerados no mês.

**Relação com o PRD:** §§ 1, 5, 34–36, 49–51 e 58; revisão em `docs/product/PRD-Review-Sentinel.md`, finding P2 sobre limitadores.

## Decisão

Criar um módulo de entitlements/uso no monólito, separado da engine estratégica:

- cada plano define limites de `active_products` e `generated_contents_month`;
- todo Tenant provisionado recebe um entitlement inicial default server-side;
- o entitlement default referencia um limite `active_products` configurado no servidor, sem preço ou número comercial inventado neste ADR;
- o plano/entitlement é resolvido no servidor, por tenant, e não é editável pelo cliente;
- ativar produto verifica o limite em transação;
- solicitar geração reserva a quantidade pedida antes de enfileirar o job, usando `generation_run.id` como chave idempotente compartilhada entre job e reserva;
- sucesso confirma o uso pelos conteúdos persistidos; falha ou cancelamento libera a reserva;
- regenerações e novos lotes consomem a mesma unidade de conteúdo gerado;
- a engine, modelo e qualidade estratégica não variam por plano.

O entitlement default é criado de forma idempotente junto do provisionamento do Tenant. Se a configuração server-side do limite estiver ausente ou inválida, a aplicação falha fechada e não ativa Product; não há fallback controlado pelo cliente. O ciclo posterior de troca de plano, cobrança, upgrade ou downgrade permanece fora deste slice.

O período de `generated_contents_month` vira no primeiro instante do mês seguinte em UTC. A reserva pertence ao mês da criação da `generation_run`; se a execução criada em M terminar em M+1, o uso continua contando em M. Falha ou cancelamento libera a reserva no mesmo período de origem. Os valores iniciais de limite ficam em configuração de produto; este ADR não inventa preços nem números de negócio.

## Rationale

1. Coloca a regra em um único ponto e protege o fluxo assíncrono.
2. Evita confiar em contadores do cliente ou em verificações espalhadas por telas.
3. Mantém a promessa central do PRD: plano básico não recebe “IA pior”.
4. Permite experimentar pricing sem alterar o core estratégico.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| Entitlement + reserva transacional (escolhida) | Correto sob concorrência, auditável e compatível com jobs | Exige estados de reserva e reconciliação |
| Contador apenas no cliente | Implementação aparente simples | Não é seguro nem consistente |
| Ifs de limite espalhados nos casos de uso | Começo rápido | Divergência, bypass e manutenção difícil |
| Créditos por custo de provedor no MVP | Flexível para mídia futura | Expõe complexidade de billing antes de validar o valor estratégico |

## Consequências

- O MVP tem duas dimensões comerciais implementadas; campanhas, lotes, armazenamento, membros e funções operacionais adicionais ficam para depois.
- Todo Tenant novo possui uma capacidade inicial resolvida pelo servidor, permitindo o onboarding sem operação administrativa manual.
- Uma configuração ausente ou inválida bloqueia ativação de Product de forma explícita, sem ultrapassar limite ou aceitar valor do cliente.
- Uma tentativa falha pode deixar uma reserva a reconciliar; estados e job idempotente são obrigatórios.
- Contadores visíveis são derivados de registros autorizados e podem exigir agregação/indexação.
- O módulo não decide estratégia, qualidade nem conteúdo; apenas capacidade autorizada.

## Segurança / Operação

- Toda decisão de limite é server-side e escopada ao tenant.
- A criação do entitlement default e a ativação de Product devem ser idempotentes e impedir corrida entre duas criações concorrentes.
- A transação deve impedir corrida entre duas criações de produto ou gerações concorrentes.
- Registrar reservas, confirmações, liberações e motivo de falha para reconciliação operacional.
- Nunca aceitar plano, período, limite ou quantidade confiável vindos do cliente sem validação do servidor.

## Fora do MVP

Créditos por provider, cobrança, upgrades automáticos, membros, quotas de campanha/lote/armazenamento, feature gating por qualidade, faturamento e limites baseados em custo de vídeo.

## Gatilhos de revisão

- lançamento de cobrança ou upgrade real;
- custo variável de múltiplos provedores tornar conteúdo mensal insuficiente;
- necessidade de limites por equipe, campanha ou armazenamento;
- divergências de reconciliação ou concorrência acima da capacidade do modelo transacional.
