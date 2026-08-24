# ADR-003: PostgreSQL como memória e fonte de rastreabilidade

## Status

Aceito — baseline de persistência do MVP.

## Contexto

O valor do Content Vault é intelectual e operacional: o sistema precisa saber o que foi gerado, aprovado, descartado, gravado e quais dimensões estratégicas já foram exploradas. Também precisa explicar de qual produto, contexto e geração cada conteúdo veio.

O domínio possui relações claras e estados transacionais. Ao mesmo tempo, o payload estratégico pode evoluir enquanto o MVP aprende quais campos realmente precisam ser rígidos.

**Relação com o PRD:** §§ 9–11, 23–29, 34–37, 39, 45–48 e 54–56; a revisão do PRD conduzida pelo Sentinel destaca memória/variedade e o contrato da engine como riscos P0.

## Decisão

Usar PostgreSQL como fonte canônica, com modelo relacional para os objetos e estados que participam do fluxo:

- tenant/usuário e autorização;
- produto e contexto;
- campanha opcional;
- snapshot/versionamento de estratégia;
- plano e conteúdo;
- execução de geração;
- estado da fila de produção;
- registros de uso do ADR-006.

Campos e relações usados para busca, filtros, variedade e autorização permanecem estruturados. Payloads de engine que ainda estão evoluindo podem ser armazenados em JSONB, sempre versionados e vinculados ao registro relacional correspondente. JSONB não substitui as chaves de tenant, produto, estratégia, status, timestamps e dimensões de variedade.

Cada geração cria um registro imutável com, no mínimo, versão da engine, provedor/modelo, contexto de entrada identificado, quantidade solicitada, timestamps, estado e erro sanitizado. Cada conteúdo aponta para a geração e o snapshot de estratégia que o originaram. Edições manuais preservam o payload originalmente gerado e atualizam a versão editável atual; histórico completo de cada tecla não é requisito do MVP.

Content Vault, conteúdo e fila são visões/consultas sobre o mesmo corpus, não cópias de dados.

## Rationale

1. Transações e constraints protegem limites, estados e links de proveniência.
2. O histórico persistido alimenta o controle de variedade em novas gerações.
3. O modelo permite começar flexível sem transformar todo o domínio em documentos opacos.
4. Evita introduzir banco vetorial, data warehouse ou armazenamento de mídia antes de existir necessidade.

## Opções / Trade-offs

| Opção | Benefícios | Custos / riscos |
|---|---|---|
| PostgreSQL relacional + JSONB controlado (escolhida) | Consistência, consultas simples e evolução incremental | Exige disciplina de schema e migrações |
| Banco documental como fonte única | Flexibilidade inicial | Integridade, filtros e quotas ficam mais frágeis |
| Event sourcing completo | Histórico detalhado | Complexidade e custo desnecessários para edição/status do MVP |
| Banco vetorial e blob storage como núcleo | Útil para mídia/busca semântica futura | Não resolve estados transacionais nem é necessário para o MVP |

## Consequências

- Migrações devem ser versionadas e compatíveis com registros já gerados.
- A busca textual inicial pode usar índices e capacidades nativas do PostgreSQL; não há obrigação de criar uma plataforma de busca.
- Reprocessar uma geração deve criar nova execução, nunca sobrescrever silenciosamente a proveniência anterior.
- O custo de JSONB pode crescer se a engine não estabilizar contratos; os campos mais consultados devem ser promovidos a estrutura própria quando medidos.

## Segurança / Operação

- Toda tabela de domínio deve carregar ou alcançar o tenant autorizado; queries sem escopo de tenant são proibidas.
- Foreign keys, constraints de status e transações devem impedir conteúdo órfão ou uso acima do limite reservado.
- O banco deve ter backup automatizado e teste periódico de restauração antes de produção.
- Não persistir segredo, token ou payload bruto de provedor sem necessidade; dados de entrada devem respeitar retenção definida pelo produto.

## Fora do MVP

Event sourcing completo, banco vetorial, data warehouse, analytics de vendas/ROAS/CTR, biblioteca de mídia e histórico de edição por caractere.

## Gatilhos de revisão

- volume ou latência de consulta exigir índice/busca especializada;
- necessidade de auditoria regulatória com histórico completo de alterações;
- payloads JSONB impedirem migrações ou consultas críticas;
- mídia, importação externa ou analytics passarem a exigir armazenamento dedicado.
