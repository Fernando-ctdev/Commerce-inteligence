# PRD — Cadastro Manual de Products

## 1. Objetivo

Permitir que o creator cadastre manualmente um `Product` com os fatos que conhece, dentro do contexto de `Produtos`, sem precisar preencher informações estratégicas.

O primeiro valor desta frente é:

```text
Produtos
↓
/products/new
↓
Preencher fatos do Product
↓
Salvar produto
↓
Product aparece na lista de Produtos
```

O cadastro deve manter a complexidade da plataforma fora do formulário. A primeira geração de conteúdos é responsabilidade do slice seguinte e não começa ao salvar o Product nesta etapa.

## 2. Problema

O creator precisa registrar um produto para começar a trabalhar, mas não deve ser obrigado a fornecer público, objetivo, dores, desejos, objeções, benefícios, posicionamento, ângulos ou qualquer outro contexto estratégico.

O cadastro inicial deve solicitar somente fatos do produto. Nome e descrição são suficientes para criar o registro; os demais fatos podem ser preenchidos quando conhecidos.

## 3. Fluxo principal

```text
Abrir Produtos
↓
Adicionar produto
↓
/products/new
↓
Preencher o formulário
↓
Salvar produto
↓
Voltar para Produtos
↓
Exibir o card do Product criado
```

O creator pode cancelar sem criar um Product. Ao salvar, a aplicação valida os campos, persiste o Product no Tenant resolvido pela sessão e atualiza a lista de Produtos.

## 4. Rota e contexto

- A tela de criação é uma subpágina de `Produtos` em `/products/new`.
- A tela mantém a navegação e o contexto de Produtos.
- A ação primária é `Salvar produto`.
- A ação secundária é `Cancelar`, retornando para a lista sem persistir o formulário.
- Não existe etapa de URL, análise automática, preview de origem ou confirmação intermediária nesta frente.

## 5. Formulário de Product

O formulário deve preservar os campos e o conteúdo do modal manual existente:

### Fatos do produto

| Campo | Regra |
|---|---|
| Nome do produto | Obrigatório; não pode ser vazio após remover espaços. |
| Descrição | Obrigatória; não pode ser vazia após remover espaços. Campo multilinha. |
| Categoria | Opcional. |
| Preço | Opcional, mas somente válido quando informado junto com a moeda. Não aceitar valor negativo ou formato inválido. |
| Moeda | Opcional, mas forma par com Preço: ambos preenchidos ou ambos vazios. Opções preservadas: `BRL` (R$ Reais), `USD` ($ Dólar) e `EUR` (€ Euro). |
| Características — uma por linha | Opcional; cada linha representa uma característica. |

Preço e moeda são um único fato opcional do ponto de vista da validação: não persistir apenas um dos dois.

### Preparação dos conteúdos

O formulário mantém a seção `Preparação dos conteúdos` do modal manual, sem iniciar geração ao salvar:

- `Quantidade inicial de conteúdos`: default `20`, inteiro entre `1` e `30`.
- `Formato do creator`: default `Tanto faz`; opções `Em câmera`, `mão e produto` e `Tanto faz`.
- `Observações ou restrições`: opcional, até `300` caracteres.

Essas preferências são persistidas como restrições da primeira geração do Product. Elas não criam `CommerceIntelligenceJob`, não geram Strategy, Plan, Content ou Briefing e não alteram o escopo desta etapa.

Informações estratégicas não pertencem ao cadastro factual do Product. O formulário não deve solicitar público, dores, desejos, objeções, benefícios, argumentos, posicionamento, ângulos, hooks, scripts ou CTA.

## 6. Validação e estados

- Validar Nome e Descrição no cliente para orientar a correção e no servidor antes da persistência.
- Manter o valor digitado quando houver erro.
- Associar labels e mensagens de erro aos respectivos controles.
- Informar visualmente foco, erro, salvamento e sucesso sem depender somente de cor.
- Desabilitar a submissão durante o salvamento para evitar duplicidade.
- Em falha de persistência, manter o formulário e permitir nova tentativa.
- Respeitar os estados e os alvos de toque definidos em `DESIGN.md`, incluindo experiência completa no mobile.

## 7. Persistência e isolamento

- Criar um `Product` somente após submissão válida.
- Resolver o `Tenant` pela sessão server-side; nenhum identificador de Tenant enviado pelo cliente é autoridade.
- Persistir o Product com o Tenant resolvido, incluindo os fatos opcionais fornecidos.
- Persistir as preferências de preparação como restrições da primeira geração vinculadas ao Product.
- Impedir leitura ou alteração de Products pertencentes a outro Tenant.
- A criação deve ser idempotente quando a mesma submissão for repetida por retry técnico, sem criar Products duplicados.

## 8. Lista de Produtos

Depois do salvamento:

- retornar para a lista de Produtos;
- exibir um card correspondente ao Product recém-criado;
- mostrar ao menos o nome do Product e a próxima ação contextual, conforme o Product card definido em `DESIGN.md`;
- manter o Product dentro do escopo do Tenant atual.

O card não é um painel de métricas e não deve inventar estado de geração, Strategy, Content ou progresso que ainda não exista.

## 9. Fora do escopo

Esta frente não inclui:

- URL ou qualquer entrada por URL;
- Product Importer;
- LLM, Model Router ou seleção de provider;
- Agent Runner;
- Browser Harness;
- Chromium, browser headless ou browser interativo;
- Docker ou container dedicado;
- descoberta automática de dados, normalização de origem externa ou estado intermediário de dados;
- caminhos alternativos de cadastro;
- geração de Strategy, ContentPlan, ContentOpportunity, Content ou Briefing;
- criação ou execução de `CommerceIntelligenceJob`;
- publicação, agendamento, analytics ou sincronização de catálogo;
- outros marketplaces;
- campos estratégicos no cadastro;
- upload de arquivos ou captura de mídia;
- criação de SPEC ou PLAN nesta etapa.

## 10. Critérios de aceite

1. Usuário autenticado consegue acessar `/products/new` a partir de Produtos.
2. A tela apresenta os campos Nome, Descrição, Categoria, Preço, Moeda e Características, além da seção Preparação dos conteúdos do modal manual existente.
3. Nome e Descrição impedem o salvamento quando ausentes ou vazios.
4. Preço e Moeda são opcionais como par; informar somente um deles impede o salvamento.
5. A preparação inicia com quantidade `20`, aceita somente valores inteiros de `1` a `30`, inicia com formato `Tanto faz` e limita notas a `300` caracteres.
6. Categoria, preço/moeda e características podem permanecer vazios sem impedir o salvamento.
7. O salvamento persiste os fatos preenchidos e as preferências de preparação como restrições da primeira geração.
8. Salvar não inicia geração, não cria job e não produz Strategy, Plan, Content ou Briefing.
9. O Product salvo pertence ao Tenant resolvido pela sessão e não fica acessível a outro Tenant.
10. Após salvar, o Product aparece como card na lista de Produtos.
11. Cancelar não persiste o Product e retorna para Produtos.
12. Erro de validação ou persistência mantém os dados preenchidos e oferece correção ou nova tentativa.

## 11. Fronteira com a primeira geração

O Product criado e suas restrições de preparação ficam disponíveis para o Slice 003. A criação do `CommerceIntelligenceJob`, o processamento assíncrono e a geração de Strategy, Plan e Briefings permanecem exclusivamente no slice futuro responsável por essa capacidade.
