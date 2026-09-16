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
Resumo factual e de preparação
↓
Creator escolhe iniciar análise ou editar
```

O cadastro deve manter a complexidade da plataforma fora do formulário. Salvar não cria job nem inicia análise; a ação explícita `Analisar produto` aciona o fluxo de primeira geração.

## 2. Problema

O creator precisa registrar um produto para começar a trabalhar, mas não deve ser obrigado a fornecer público, objetivo, dores, desejos, objeções, benefícios, posicionamento, ângulos ou qualquer outro contexto estratégico.

O cadastro inicial solicita somente fatos do produto e as preferências de preparação. Todos os campos do formulário são obrigatórios para garantir dados bons para a inteligência posterior; quantidade e formato permanecem preenchidos por defaults válidos.

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
Abrir resumo factual e de preparação
↓
Creator escolhe `Analisar produto` ou `Editar produto`
```

O creator pode cancelar sem criar um Product. Ao salvar, a aplicação valida os campos, persiste o Product no Tenant resolvido pela sessão e abre seu resumo; não inicia geração por efeito colateral.

## 4. Rota e contexto

- A tela de criação é uma subpágina de `Produtos` em `/products/new`.
- A tela mantém a navegação e o contexto de Produtos.
- A ação primária é `Salvar produto`.
- A ação secundária é `Cancelar`, retornando para a lista sem persistir o formulário.
- Não existe etapa de URL, análise automática, preview de origem ou confirmação intermediária nesta frente.

## 5. Formulário de Product

O formulário deve preservar os campos e o conteúdo do modal manual existente:

### Fatos do produto

| Campo                           | Regra                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Nome do produto                 | Obrigatório; não pode ser vazio após remover espaços.                               |
| Descrição                       | Obrigatória; não pode ser vazia após remover espaços. Campo multilinha.             |
| Categoria                       | Obrigatória; não pode ser vazia após remover espaços.                               |
| Preço                           | Obrigatório; deve ser válido, não negativo e ter no máximo duas casas decimais.     |
| Moeda                           | Obrigatória; opções preservadas: `R$` (R$ Reais), `USD` ($ Dólar) e `EUR` (€ Euro). |
| Características — uma por linha | Obrigatórias; deve haver ao menos uma linha não vazia.                              |
| Desconto                        | Opcional; quando informado, exige `discountType` `PERCENTAGE` ou `FIXED`, `discountValue` e a moeda do Product. |

Preço e moeda são fatos obrigatórios e devem ser informados conjuntamente; não há par opcional. Desconto `PERCENTAGE` fica entre `0` e `100`; `FIXED` usa a moeda do Product e não pode exceder seu preço.

### Preparação dos conteúdos

O formulário mantém a seção `Preparação dos conteúdos` do modal manual, sem iniciar geração ao salvar:

- `Quantidade inicial de conteúdos *`: default `5`, inteiro entre `1` e `10`.
- `Formato do creator *`: default `Tanto faz`; opções `Em câmera`, `mão e produto` e `Tanto faz`.
- `Observações ou restrições *`: obrigatórias; não podem ser vazias após remover espaços e têm até `300` caracteres.

O asterisco é apenas indicação visual de obrigatoriedade; a validação deve ocorrer no HTML/cliente e novamente no servidor.

Essas preferências são persistidas como restrições da primeira geração do Product. Elas não criam `CommerceIntelligenceJob`, não geram Strategy, Plan, Content ou Briefing e não alteram o escopo desta etapa.

Informações estratégicas não pertencem ao cadastro factual do Product. O formulário não deve solicitar público, dores, desejos, objeções, benefícios, argumentos, posicionamento, ângulos, hooks, scripts ou CTA.

## 6. Validação e estados

- Validar Nome, Descrição, Categoria, Preço, Moeda, Características e Observações/restrições no HTML/cliente para orientar a correção e no servidor antes da persistência.
- Manter o valor digitado quando houver erro.
- Associar labels e mensagens de erro aos respectivos controles.
- Informar visualmente foco, erro, salvamento e sucesso sem depender somente de cor.
- Desabilitar a submissão durante o salvamento para evitar duplicidade.
- Em falha de persistência, manter o formulário e permitir nova tentativa.
- Respeitar os estados e os alvos de toque definidos em `DESIGN.md`, incluindo experiência completa no mobile.

## 7. Persistência e isolamento

- Criar um `Product` somente após submissão válida.
- Resolver o `Tenant` pela sessão server-side; nenhum identificador de Tenant enviado pelo cliente é autoridade.
- Persistir o Product com o Tenant resolvido, incluindo os fatos obrigatórios validados.
- Persistir as preferências de preparação como restrições da primeira geração vinculadas ao Product.
- Impedir leitura ou alteração de Products pertencentes a outro Tenant.
- A criação deve ser idempotente quando a mesma submissão for repetida por retry técnico, sem criar Products duplicados.

## 8. Resumo pós-cadastro

Depois do salvamento, abrir o resumo do Product no seu contexto:

- mostrar fatos, quantidade inicial, formato do creator e observações/restrições;
- mostrar `Analisar produto` como ação explícita enquanto não houver job;
- permitir `Editar produto` e, durante edição, `Salvar alterações`;
- `GET` de geração sem job ou com envelope inválido preserva o resumo idle; não inventa análise;
- erro de job existente permanece visível e acionável.

O resumo não é painel de métricas e não deve inventar estado de geração, Strategy, Content ou progresso que ainda não exista.

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
- criação ou execução automática de `CommerceIntelligenceJob` como efeito de salvar; a ação explícita de análise usa o slice responsável.
- publicação, agendamento, analytics ou sincronização de catálogo;
- outros marketplaces;
- campos estratégicos no cadastro;
- upload de arquivos ou captura de mídia;
- criação de SPEC ou PLAN nesta etapa.

## 10. Critérios de aceite

1. Usuário autenticado consegue acessar `/products/new` a partir de Produtos.
2. A tela apresenta os campos Nome, Descrição, Categoria, Preço, Moeda, Características, Desconto opcional e a seção Preparação dos conteúdos.
3. Nome, Descrição, Categoria, Preço, Moeda, Características (com ao menos uma linha não vazia) e Observações ou restrições impedem o salvamento quando ausentes, vazios ou inválidos.
4. Preço e Moeda são obrigatórios; ambos devem ser informados e o preço deve ser válido, não negativo e ter no máximo duas casas decimais.
5. Desconto informado exige tipo `PERCENTAGE` ou `FIXED`, valor válido e moeda do Product; percentual respeita `0–100` e valor fixo não excede o preço.
6. A preparação inicia com quantidade `5`, aceita somente valores inteiros de `1` a `10`, inicia com formato `Tanto faz` e limita notas a `300` caracteres; esses campos aparecem com `*`.
7. O asterisco é apenas indicação visual; HTML/cliente e servidor validam todos os campos obrigatórios.
8. O salvamento persiste os fatos preenchidos e as preferências de preparação como restrições da primeira geração.
9. Salvar não inicia geração, não cria job e não produz Strategy, Plan, Content ou Briefing.
10. O Product salvo pertence ao Tenant resolvido pela sessão e não fica acessível a outro Tenant.
11. Após salvar, o resumo mostra dados factuais e de preparação; o creator escolhe iniciar análise, editar ou salvar alterações.
12. GET de geração inexistente ou envelope inválido não derruba o resumo idle; falha de job existente continua acionável.
13. Cancelar não persiste o Product e retorna para Produtos.
14. Erro de validação ou persistência mantém os dados preenchidos e oferece correção ou nova tentativa.

## 11. Fronteira com a primeira geração

O Product criado e suas restrições de preparação ficam disponíveis para o Slice 003. A criação do `CommerceIntelligenceJob`, o processamento assíncrono e a geração de Strategy, Plan e Briefings permanecem exclusivamente no slice futuro responsável por essa capacidade.
