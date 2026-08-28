# Engineering Principles — Commerce Intelligence

**Escopo:** regras práticas e permanentes para implementar o produto. Não substitui decisões registradas nos ADRs nem a arquitetura detalhada em `SYSTEM-DESIGN.md`.

## Princípios permanentes

### 1. Use a linguagem do produto

Use `Product`, `ProductCandidate`, `ProductStrategy`, `ContentPlan`, `ContentOpportunity`, `Content`, `ContentBriefVersion`, `RecordingBatch`, `CommerceIntelligenceJob`, `ProductMemorySnapshot`, `PlatformSkill`, `Entitlement` e `Tenant/Workspace` com significado estável. Não crie sinônimos que escondam o mesmo conceito.

- `Content` é conceito de domínio; "conteúdo" e "Briefing do Conteúdo" são a leitura humana na interface. O versionamento (`ContentBriefVersion`) não é exposto permanentemente ao creator.
- `lote` é `RecordingBatch` — unidade de **gravação**. Nunca use `lote` como sinônimo de nova geração de conteúdos.
- `LOW`, `MID`, `HIGH` são valores internos de `IntelligenceTier`, nunca planos comerciais e nunca termos de UI.
- Fato ≠ inferência: o sistema diferencia o que o Produto **é** (fato confirmado, com proveniência) do que a engine **acredita** (inferência estratégica). Nenhuma estrutura mistura os dois sem marcação.

### 2. Mantenha limites de domínio úteis

Um módulo possui comportamento e invariantes relacionados. Não transforme cada tabela em agregado nem crie serviço para cada verbo.

O fluxo permanece reconhecível como `Product → CommerceIntelligenceJob → ProductStrategy → ContentPlan → Content → RecordingBatch → Execução`. A engine decide; Content Operations revisa e executa; Entitlements limita capacidade; o Model Router roteia modelos; o Browser Service é o único dono do browser e do profile. Nenhum módulo assume a responsabilidade de outro ou contorna o contrato de um irmão acessando banco, provider ou CDP diretamente.

### 3. Prefira código explícito e pequeno

- nomes revelam intenção e regra de negócio;
- funções têm uma responsabilidade observável e poucos efeitos colaterais;
- dependências apontam para dentro; infraestrutura fica nas bordas;
- validação e transições inválidas falham cedo;
- duplicação pequena e legível é preferível a abstração especulativa;
- comentários explicam uma restrição ou decisão, não repetem o código.

### 4. Casos de uso orquestram ações

Application Services/Use Cases são o ponto de entrada para ações como iniciar importação, confirmar `ProductCandidate`, criar `Product` + `CommerceIntelligenceJob`, consultar status do job, aprovar briefing, criar lote, concluir conteúdo e reservar uso. Eles resolvem tenant, autorização, quota, snapshots, transações e chamadas entre módulos. Não existe camada de serviço universal que apenas repasse métodos.

### 5. Interfaces somente em fronteiras reais

Ports existem onde há fronteira que varia ou se testa isolada: persistência, sessão, browser (Browser Service/Harness), fila, provider de modelo (LLM Gateway) e mídia futura. Classe concreta interna não ganha interface por convenção.

Padrões apenas quando resolvem problema presente:

- **Adapter:** provider de modelo, Browser Harness, fonte externa ou infraestrutura → contrato do sistema;
- **Application Service / Use Case:** coordena um workflow do creator;
- **Repository:** persiste um limite de consistência ou consulta de domínio necessária;
- **Policy / Specification:** regra variável — entitlement, autorização, gates de qualidade/variedade.

### 6. Teste comportamento, não desenho interno

Prove resultados e invariantes nas bordas de domínio e aplicação: isolamento de tenant, reserva/virada de quota, idempotência de job e retry, validação factual (`SUPPORTED`/`INFERRED_BUT_SAFE`/`UNSUPPORTED`/`CONTRADICTED`), schema/contract de cada capability, snapshot de memória e variedade, transições derivadas do lote, pausa/retomada do human-in-the-loop e recuperação de falha sem sucesso parcial.

Capabilities de LLM recebem **contract tests** (input → output schema). Qualidade estratégica é avaliada com o Golden Dataset por engine/Skill/prompt/modelo — eval é teste de regressão de qualidade, não decorativo. Nunca congele nomes de classes, chamadas internas ou estrutura de tabelas.

### 7. Entrada não confiável é regra, não exceção

Entrada de usuário, URL, conteúdo de página do TikTok e saída de provider/LLM são dados não confiáveis. Valide tamanho, formato, cardinalidade, estado e contrato antes de persistir. Defesa contra prompt injection é estrutura (separação entre instruções, contexto confiável e conteúdo externo), não frase educativa em prompt. **Prompt orienta; validação obriga** — nenhuma regra crítica do sistema mora apenas em texto de prompt.

Toda operação server-side recebe o tenant resolvido pela sessão; nunca confie em `tenant_id` do cliente. Chamadas externas (provider, browser) acontecem fora de transação; transações são curtas. Erros são explícitos, recuperáveis quando possível e sanitizados — sem secrets, tokens, payload bruto de provider ou dados de outro tenant.

### 8. Determinístico primeiro

Quando a decisão não exigir interpretação criativa, use código: orquestração, estado de job, persistência, idempotência, versionamento, seleção de Strategy ativa, contagens, limites, schema validation, detecção de duplicata exata, agregação de memória, quota e retry. A LLM não decide regra de sistema. Use `LOW` quando `LOW` for suficiente; reserve `HIGH` para onde a qualidade estratégica depende dele.

## Padrões proibidos no MVP

- factories para uma única implementação;
- repositories genéricos ou camada de repository para toda tabela;
- CQRS, event bus ou event sourcing sem necessidade demonstrada;
- abstrações multi-provider antes do segundo provider real (modelo ou mídia);
- swarm de agentes por dimensão (dor, desejo, hook, CTA…) sem necessidade arquitetural comprovada;
- value objects artificiais sem regra/invariante própria;
- service layer universal que concentra toda lógica;
- adapters, registries ou plugins "para o futuro" sem fronteira usada agora;
- Skill com poder sobre workflow, jobs, persistência ou billing;
- contornar módulos acessando banco, provider, quota, CDP ou profile diretamente.

## Quando um ADR é obrigatório

Princípios orientam implementação local. Crie ou atualize um ADR antes de implementar mudança que altere trade-off arquitetural:

- stack, deploy, fronteira de módulo ou dependência externa;
- persistência, contrato canônico versionado, fila ou semântica de quota;
- autenticação, autorização, isolamento de tenant ou dados sensíveis (incl. browser profile);
- provider externo, nova Platform Skill, mídia, publicação ou integração de plataforma;
- introdução de abstração transversal, serviço separado ou padrão proibido.

Refatoração interna que preserva contratos, limites e comportamento não precisa de ADR. Em dúvida, registre a decisão curta em vez de esconder o trade-off no código.
