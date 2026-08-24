# ADR-001: Monólito modular e stack do MVP

## Status

Aceito — baseline arquitetural do MVP.

## Contexto

O produto ainda não possui implementação nem decisões registradas em `docs/architecture` ou `docs/design`. O PRD pede simplicidade agora, modularidade para evoluir depois e explicitamente não pede integrações externas, mídia ou microserviços no MVP.

O fluxo principal é coeso: produto → estratégia → plano → conteúdo → produção. Separar esses passos em serviços distintos criaria rede, deploys, observabilidade e consistência distribuída antes de existir pressão real para isso.

**Relação com o PRD:** §§ 5–8, 34, 40, 54–58 e 60; a revisão do PRD conduzida pelo Sentinel, registrada em `docs/product/PRD-Review-Sentinel.md`, classifica o projeto como um MVP focado e recomenda evitar complexidade prematura.

## Decisão

Adotar um monólito modular em um único repositório e unidade principal de deploy, com:

- TypeScript como linguagem comum;
- Next.js como aplicação web e camada de aplicação/API;
- PostgreSQL como sistema de registro;
- Prisma como camada tipada de acesso e migrações do banco;
- um processo de worker assíncrono, usando o mesmo código e os mesmos módulos do monólito, para gerações demoradas;
- adaptadores estreitos para serviços externos, sem SDK de fornecedor vazando para o domínio.

Os módulos iniciais são limites de código, não serviços independentes: identidade/tenant (conforme ADR-009), produto, estratégia, plano/conteúdo, produção, geração e uso/plano. Dependências atravessam esses limites por casos de uso e contratos do módulo; detalhes de infraestrutura ficam nas bordas.

O fornecedor específico de modelo de linguagem não é fixado neste ADR. O MVP terá uma implementação de provedor por vez, atrás do limite definido no ADR-002.

## Rationale

1. Mantém o ciclo de aprendizagem do MVP curto e o custo operacional baixo.
2. Preserva separação suficiente para extrair um módulo somente quando métricas, escala ou ownership justificarem.
3. PostgreSQL oferece transações para memória, variedade, fila e limites de uso sem adicionar um broker ao MVP.
4. TypeScript reduz a troca de contexto entre interface, casos de uso e worker.

## Opções / Trade-offs

| Opção | Benefícios | Custos / quando revisar |
|---|---|---|
| Monólito modular (escolhida) | Um deploy, transações simples, baixo custo operacional e fronteiras de código | Escala e isolamento são compartilhados; exige disciplina de módulos |
| Microserviços desde o início | Isolamento e escala independentes | Complexidade distribuída, deploys e observabilidade sem necessidade demonstrada |
| Frontend e API separados | Times e deploys independentes | Mais contratos, autenticação e operação para o mesmo fluxo de MVP |
| Funções stateless sem worker durável | Infra inicial simples | Não atende bem gerações longas, retry e rastreabilidade |

## Consequências

- A aplicação pode ser publicada e operada como uma unidade, com o worker iniciado como segundo processo quando necessário.
- O core não deve importar Next.js, Prisma ou SDKs de IA diretamente.
- A extração futura de geração ou mídia será possível, mas não é garantida sem medir carga, acoplamento e ownership.
- Não haverá barramento de eventos, service mesh, Kubernetes ou camada de descoberta no MVP.

## Segurança / Operação

- Toda leitura e escrita deve ser escopada ao tenant/usuário autorizado no caso de uso, nunca apenas no cliente.
- Segredos de banco e provedores ficam fora do código e dos registros operacionais.
- Logs devem registrar identificadores de execução e erro operacional, não prompts completos, tokens ou dados sensíveis sem necessidade.
- O processo web e o worker precisam de health checks, logs estruturados e métricas básicas de erro e latência.

## Fora do MVP

Microserviços, event bus, service mesh, data warehouse, integrações TikTok/TikTok Shop, publicação automática, analytics externo e serviço dedicado de vídeo/IA.

## Gatilhos de revisão

- backlog ou latência do worker exigindo escala independente;
- limites de conexão/CPU do monólito afetando o fluxo interativo;
- ownership por times diferentes ou requisito de isolamento de segurança;
- necessidade comprovada de deployar geração ou mídia em ciclo independente.
