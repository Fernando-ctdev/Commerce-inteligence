# Engineering Principles — Commerce Intelligence

**Escopo:** regras práticas para implementar o produto. Não substitui decisões registradas nos ADRs.

## Princípios permanentes

### 1. Use a linguagem do produto

Use `Product`, `Strategy`, `Plan`, `Content`, `Production`, `Generation`, `Entitlement` e `Tenant/Workspace` com significado estável. Não crie sinônimos que escondam o mesmo conceito. `Content` é o conceito de domínio; “conteúdo” pode ser a leitura humana da interface.

### 2. Mantenha limites de domínio úteis

Um módulo possui comportamento e invariantes relacionados. Não transforme cada tabela em agregado, entidade ou serviço. Um agregado existe quando precisa proteger uma consistência; consultas de leitura não precisam virar agregados.

O fluxo de negócio deve permanecer reconhecível como Product → Strategy → Plan → Content → Production. Strategy decide; Generation coordena a execução; Entitlements limita capacidade; nenhum módulo assume a responsabilidade de outro.

### 3. Prefira código explícito e pequeno

Aplicar SOLID/Clean Code de forma prática:

- nomes revelam intenção e regra de negócio;
- funções têm uma responsabilidade observável e poucos efeitos colaterais;
- dependências apontam para dentro, e infraestrutura fica nas bordas;
- validação e transições inválidas falham cedo;
- duplicação pequena e legível é preferível a abstração especulativa;
- comentários explicam uma restrição ou decisão, não repetem o código.

### 4. Casos de uso orquestram ações

Application Services/Use Cases são o ponto de entrada para ações como criar Produto, gerar, editar Content e marcar Gravado. Eles resolvem tenant, autorização, quota, snapshots, transações e chamadas entre módulos. Não crie uma camada de serviço universal que apenas repasse métodos.

### 5. Interfaces somente em fronteiras reais

Use interfaces/ports quando houver uma fronteira que possa variar ou ser testada isoladamente: PostgreSQL, sessão, fila, fonte URL, provider textual ou mídia futura. Uma classe concreta interna não precisa de interface por convenção.

Use os padrões apenas quando resolverem um problema presente:

- **Adapter:** traduz provider, fonte externa ou infraestrutura para o contrato do sistema;
- **Application Service / Use Case:** coordena um workflow do usuário;
- **Repository:** persiste um limite de consistência ou oferece uma consulta de domínio necessária;
- **Policy / Specification:** encapsula uma regra variável, como entitlement, autorização ou seleção de variedade.

### 6. Teste comportamento, não desenho interno

Testes devem provar resultados e invariantes nos limites de domínio e aplicação. Priorize tenant isolation, reserva/virada de quota, idempotência, validação do contrato de geração, variedade, transições de Production e recuperação de erro. Não escreva testes que apenas congelam nomes de classes, chamadas internas ou estrutura de tabelas.

### 7. Valide entradas e preserve o contexto

Entrada de usuário, URL e saída de provider são não confiáveis. Valide tamanho, formato, cardinalidade, estado e contrato antes de persistir. Erros devem ser explícitos, recuperáveis quando possível e sem vazar secrets, tokens ou dados de outro tenant.

Toda operação server-side recebe o tenant resolvido pela sessão; nunca confie em `tenant_id` enviado pelo cliente. A chamada externa ao provider fica fora da transação; transações devem ser curtas.

## Padrões proibidos no MVP

- factories para uma única implementação;
- repositories genéricos ou uma camada de repository para toda tabela;
- CQRS, event bus ou event sourcing sem necessidade demonstrada;
- abstrações multi-provider antes do segundo provider real;
- value objects artificiais sem regra/invariante própria;
- service layer universal que concentra toda lógica;
- adapters, registries ou plugins “para o futuro” sem uma fronteira usada agora;
- contornar módulos acessando banco, provider ou regra de quota diretamente.

## Quando um ADR é obrigatório

Princípios permanentes orientam implementação local. Crie ou atualize um ADR antes de implementar uma mudança que altere um trade-off arquitetural, como:

- stack, deploy, fronteira de módulo ou dependência externa;
- persistência, contrato versionado, fila ou semântica de quota;
- autenticação, autorização, isolamento de tenant ou dados sensíveis;
- provider externo, mídia, publicação ou integração de plataforma;
- introdução de uma abstração transversal, serviço separado ou padrão proibido.

Uma refatoração interna que preserva contratos, limites e comportamento não precisa de ADR. Em dúvida, registre a decisão curta em vez de esconder o trade-off no código.

