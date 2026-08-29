# SPEC — Slice 002: Cadastro manual de Product

**Status:** Aguardando revisão
**Dependência:** Slice 001 — Workspace pessoal e primeiro acesso
**Rota:** `/products/new`

## 1. User Outcome

O creator autenticado abre a subpágina `/products/new` dentro de Produtos, informa os fatos que conhece, salva um `Product` escopado ao `Tenant` da sessão e vê o card correspondente na lista de Produtos. As preferências para a primeira geração ficam registradas como restrições, mas nenhuma geração é iniciada neste slice.

## 2. Contexto

O Slice 002 entrega somente o cadastro factual manual de um `Product`. A superfície deve preservar os campos e o conteúdo do modal manual existente, mantendo o formulário simples e sem solicitar contexto estratégico.

O fluxo começa em Produtos e termina com o Product persistido e visível na lista. A criação do `CommerceIntelligenceJob`, o processamento assíncrono e a geração de Strategy, Plan e Briefings pertencem ao Slice 003.

Fontes de autoridade:

- `docs/product/PRD-Importation-product.md`, §§ 1–11;
- `docs/delivery/SLICES.md`, Slice 002;
- `docs/product/PRD.md`, §§ 8, 10, 31–32 e 58;
- `docs/architecture/SYSTEM-DESIGN.md`, §§ 3, 4, 5 e 8;
- `docs/engineering/PRINCIPLES.md`, §§ 1, 2, 4, 6 e 7;
- `DESIGN.md`, §§ 3, 6, 8 e 10.

## 3. In Scope

- Subpágina autenticada `/products/new` dentro de Produtos.
- Formulário com os campos exatos do modal manual existente:
  - Nome do produto;
  - Descrição;
  - Categoria;
  - Preço;
  - Moeda;
  - Características — uma por linha.
- Seção `Preparação dos conteúdos` com:
  - quantidade inicial de conteúdos;
  - formato do creator;
  - observações ou restrições.
- Nome e Descrição obrigatórios.
- Categoria, Características e o par Preço/Moeda opcionais.
- Persistência do Product e das restrições de preparação no Tenant resolvido server-side.
- Retorno à lista de Produtos e exibição do card do Product criado.
- Estados de validação, salvamento, sucesso e erro necessários ao fluxo.

## 4. Out of Scope

- URL ou entrada por URL.
- Qualquer descoberta automática ou origem externa de fatos.
- LLM, Model Router, Agent Runner, Browser Harness, Chromium, browser headless ou interativo.
- Docker, container dedicado ou infraestrutura de navegação.
- Estados intermediários de dados antes do Product.
- Criação ou execução de `CommerceIntelligenceJob`.
- Geração de Strategy, ContentPlan, ContentOpportunity, Content ou Briefing.
- Campos estratégicos, incluindo público, dores, desejos, objeções, benefícios, argumentos, posicionamento, ângulos, hooks, scripts e CTA.
- Publicação, agendamento, analytics, sincronização de catálogo, outros marketplaces ou mídia.
- Upload de arquivos ou captura de mídia.
- Edição de Product existente, arquivamento ou exclusão, salvo o retorno/cancelamento necessários ao fluxo de criação.
- Qualquer comportamento dos slices futuros além de registrar as restrições para sua entrada.

## 5. Comportamentos

### B-001 — Acesso e contexto

Usuário autenticado acessa Produtos e aciona `Adicionar produto`. O sistema abre `/products/new` mantendo o contexto de Produtos e apresenta `Salvar produto` como ação primária e `Cancelar` como ação secundária.

### B-002 — Campos factuais

O sistema apresenta somente os campos factuais definidos nesta SPEC. Nome e Descrição são campos persistentes do Product. Categoria, Preço/Moeda e Características podem ser deixados vazios.

Características são informadas uma por linha; cada linha não vazia representa uma característica.

### B-003 — Preparação dos conteúdos

O sistema apresenta a seção `Preparação dos conteúdos` com estes valores iniciais e limites:

- quantidade inicial: `20`, inteiro entre `1` e `30`;
- formato do creator: `Tanto faz`, com opções `Em câmera`, `mão e produto` e `Tanto faz`;
- observações ou restrições: vazias por padrão, opcionais, máximo de `300` caracteres.

### B-004 — Salvamento válido

Quando o formulário é válido, o sistema persiste o Product com os fatos fornecidos e associa ao Product as preferências de preparação como restrições da primeira geração. Após sucesso, retorna para Produtos e exibe o card do Product criado.

### B-005 — Limite da primeira geração

Salvar o Product não cria `CommerceIntelligenceJob`, não inicia geração e não produz Strategy, Plan, Content ou Briefing. As restrições ficam disponíveis para o slice responsável pela primeira geração.

### B-006 — Cancelamento

Ao acionar `Cancelar`, o sistema abandona o formulário, não persiste Product e retorna para a lista de Produtos.

### B-007 — Retry de salvamento

Se a mesma submissão for repetida por retry técnico, o sistema não cria Products duplicados. Em caso de erro recuperável, mantém os valores preenchidos e permite nova tentativa.

## 6. Regras e invariantes

### RI-001 — Obrigatoriedade

Nome e Descrição devem conter valor não vazio após remoção de espaços. Nenhum Product é persistido sem os dois campos.

### RI-002 — Preço e Moeda como par

Preço e Moeda são um par opcional: ambos vazios ou ambos preenchidos. Preço preenchido sem Moeda, ou Moeda preenchida sem Preço, é inválido.

As moedas disponíveis são `BRL` (R$ Reais), `USD` ($ Dólar) e `EUR` (€ Euro). Preço não pode ser negativo e deve respeitar formato monetário válido.

### RI-003 — Preparação válida

Quantidade é um inteiro de `1` a `30`, com default `20`. Formato do creator pertence às três opções definidas. Observações ou restrições não excedem `300` caracteres.

### RI-004 — Fatos sem estratégia

O formulário não coleta nem persiste como Product facts qualquer dimensão estratégica. As observações da preparação são restrições da primeira geração, não fatos estratégicos do Product.

### RI-005 — Tenant como escopo

Todo Product criado pertence exatamente ao `Tenant` resolvido pela sessão server-side. O Tenant enviado pelo cliente, se houver, não é autoridade.

### RI-006 — Integridade de criação

Somente uma submissão válida cria Product. Cancelamento, erro de validação e erro de persistência não criam Product.

### RI-007 — Idempotência

Repetição da mesma submissão por retry técnico não produz mais de um Product correspondente.

### RI-008 — Limite de responsabilidade

Este slice não altera estado de geração e não antecipa o comportamento de qualquer slice futuro. Registrar restrições não equivale a iniciar processamento.

## 7. Validações e erros

| Código | Condição | Comportamento esperado |
|---|---|---|
| `VAL-NAME-REQUIRED` | Nome ausente ou vazio | Exibir erro junto ao campo, manter valor e focar o primeiro erro. |
| `VAL-DESCRIPTION-REQUIRED` | Descrição ausente ou vazia | Exibir erro junto ao campo, manter valor e focar o primeiro erro. |
| `VAL-PRICE-CURRENCY-PAIR` | Somente Preço ou somente Moeda preenchido | Bloquear salvamento e explicar que os dois campos devem ser preenchidos juntos ou deixados vazios. |
| `VAL-PRICE-FORMAT` | Preço negativo ou formato inválido | Bloquear salvamento e explicar o formato esperado. |
| `VAL-QUANTITY-RANGE` | Quantidade não inteira ou fora de `1–30` | Bloquear salvamento e manter o valor editável. |
| `VAL-CREATOR-FORMAT` | Formato fora das opções permitidas | Bloquear salvamento e manter a seleção válida anterior. |
| `VAL-NOTES-LENGTH` | Notas/restrições acima de `300` caracteres | Impedir excedente ou bloquear salvamento com mensagem associada ao campo. |
| `AUTH-SESSION` | Usuário não autenticado | Não permitir a operação e aplicar o fluxo de autenticação vigente. |
| `AUTH-TENANT` | Tenant da sessão não resolvido | Não persistir; exibir erro sanitizado e permitir recuperação conforme autenticação vigente. |
| `SAVE-FAILED` | Falha de persistência | Exibir erro sanitizado, preservar os dados e oferecer nova tentativa. |
| `SAVE-DUPLICATE` | Repetição da mesma submissão | Retornar o Product já criado ou tratar a operação de forma idempotente, sem duplicar registro. |

Erros não devem depender somente de cor, não devem limpar a entrada e não devem expor detalhes internos, segredos ou dados de outro Tenant.

## 8. Estados de UX

| Estado | Representação e comportamento |
|---|---|
| `idle` | Formulário disponível com defaults de preparação; ação `Salvar produto` habilitada somente quando não houver bloqueio conhecido. |
| `editing` | Valores digitados preservados; erros de campo podem ser corrigidos sem perder os demais dados. |
| `invalid` | Mensagens inline junto aos campos inválidos; foco orientado ao primeiro erro; nenhuma persistência. |
| `saving` | Ação primária desabilitada e identificada como salvando; não permitir submissão duplicada. |
| `success` | Product salvo; retorno para Produtos e card visível na lista. |
| `error` | Falha sanitizada visível; formulário preservado; nova tentativa disponível. |
| `cancelled` | Formulário descartado sem persistência; retorno para Produtos. |

Requisitos visuais e de acessibilidade:

- labels persistentes acima dos campos; placeholder não substitui label;
- mensagens de erro associadas ao controle e anunciadas de forma acessível;
- foco-visible, teclado e alvos mínimos de `44×44px`;
- estado de salvamento comunicado sem spinner isolado;
- mobile em uma coluna, com a capacidade completa de cadastro;
- conteúdo principal sólido, sem decoração ou métrica sem vínculo com o Product.

## 9. Segurança e autorização

- A operação exige sessão autenticada.
- O Tenant é resolvido no servidor a partir da sessão.
- O cliente não escolhe nem substitui o Tenant de persistência.
- A criação, leitura da lista e retorno do Product aplicam escopo de Tenant.
- Um Product de outro Tenant não pode ser exibido, alterado ou usado para confirmar sucesso da operação atual.
- Erros são sanitizados e não revelam identificadores, dados ou detalhes de infraestrutura de outro Tenant.
- Não são coletados credenciais, tokens, cookies ou dados de navegação externa.

## 10. Critérios de aceite em EARS

| ID | Critério verificável |
|---|---|
| `AC-002-01` | **WHEN** um usuário autenticado acionar `Adicionar produto` em Produtos, **o sistema SHALL** abrir `/products/new` dentro do contexto de Produtos. |
| `AC-002-02` | **WHEN** `/products/new` for exibida, **o sistema SHALL** apresentar exatamente Nome do produto, Descrição, Categoria, Preço, Moeda, Características — uma por linha — e a seção Preparação dos conteúdos. |
| `AC-002-03` | **WHILE** Nome ou Descrição estiver ausente ou vazio após remoção de espaços, **o sistema SHALL** impedir o salvamento, exibir o erro associado e preservar os valores digitados. |
| `AC-002-04` | **WHEN** somente Preço ou somente Moeda estiver preenchido, **o sistema SHALL** impedir o salvamento e informar a regra do par opcional. |
| `AC-002-05` | **WHEN** Preço e Moeda estiverem ambos vazios ou ambos válidos, **o sistema SHALL** aceitar o par, desde que o restante do formulário seja válido. |
| `AC-002-06` | **WHEN** o formulário for carregado, **o sistema SHALL** definir quantidade `20`, permitir somente inteiros de `1` a `30`, definir formato `Tanto faz` e limitar observações/restrições a `300` caracteres. |
| `AC-002-07` | **WHEN** uma submissão válida for salva, **o sistema SHALL** persistir o Product com os fatos preenchidos e as preferências de preparação como restrições da primeira geração. |
| `AC-002-08` | **WHEN** o Product for salvo, **o sistema SHALL NOT** criar `CommerceIntelligenceJob`, iniciar geração ou produzir Strategy, Plan, Content ou Briefing. |
| `AC-002-09` | **WHEN** o Product for persistido, **o sistema SHALL** associá-lo ao Tenant resolvido server-side. |
| `AC-002-10` | **WHEN** um Product pertencer a um Tenant, **o sistema SHALL** impedir que outro Tenant o veja. |
| `AC-002-11` | **WHEN** o salvamento terminar com sucesso, **o sistema SHALL** retornar para Produtos e exibir um card com o Product criado. |
| `AC-002-12` | **WHEN** o creator acionar `Cancelar`, **o sistema SHALL** retornar para Produtos sem persistir um Product. |
| `AC-002-13` | **WHEN** ocorrer falha de validação ou persistência, **o sistema SHALL** manter os dados preenchidos, exibir erro acionável e permitir correção ou nova tentativa. |
| `AC-002-14` | **WHEN** a tela for usada em mobile, **o sistema SHALL** manter todas as capacidades do cadastro disponíveis em uma coluna. |
| `AC-002-15` | **WHEN** a tela for usada por teclado ou tecnologia assistiva, **o sistema SHALL** manter foco-visible, labels associadas e feedback de estado acessível. |
| `AC-002-16` | **WHEN** um controle interativo for exibido, **o sistema SHALL** oferecer alvo de toque de pelo menos `44×44px`. |
| `AC-002-17` | **WHEN** a mesma submissão for repetida com a mesma chave de idempotência, **o sistema SHALL** retornar o mesmo Product, com o mesmo `id` e a mesma versão, sem criar novo registro. |

## 11. Rastreabilidade

| Requisito | Fonte canônica | Cobertura nesta SPEC |
|---|---|---|
| Cadastro em `/products/new` dentro de Produtos | PRD específico § 4; SLICES Slice 002 | B-001, AC-002-01 |
| Campos exatos e conteúdo do modal manual | PRD específico § 5; SLICES Slice 002 Scope | B-002, B-003, AC-002-02, AC-002-06 |
| Nome e Descrição obrigatórios | PRD específico § 5; SLICES Slice 002 | RI-001, VAL-NAME-REQUIRED, VAL-DESCRIPTION-REQUIRED, AC-002-03 |
| Preço/Moeda como par opcional | PRD específico § 5; SLICES Slice 002 | RI-002, VAL-PRICE-CURRENCY-PAIR, AC-002-04, AC-002-05 |
| Defaults e limites de preparação | PRD específico § 5; SLICES Slice 002 | RI-003, AC-002-06 |
| Persistir restrições sem iniciar geração | PRD específico §§ 5 e 11; SLICES Slice 002 | B-004, B-005, RI-008, AC-002-07, AC-002-08 |
| Tenant server-side e isolamento | PRD específico § 7; SYSTEM-DESIGN §§ 3 e 8; PRINCIPLES § 7 | RI-005, segurança, AC-002-09, AC-002-10 |
| Retry sem duplicata | PRD específico § 7; SLICES Slice 002 | B-007, RI-007, SAVE-DUPLICATE, AC-002-17 |
| Card após salvar | PRD específico § 8; SLICES Slice 002 | B-004, AC-002-11 |
| UX responsiva e acessível | DESIGN §§ 3, 6, 8 e 10; SLICES Slice 002 | estados UX, AC-002-13, AC-002-14, AC-002-15, AC-002-16 |

## 12. Decisões registradas

- A entrada desta etapa é a subpágina `/products/new` dentro de Produtos.
- O formulário mantém exatamente os campos e a seção do modal manual existente.
- Nome e Descrição são obrigatórios; os demais fatos são opcionais.
- Preço e Moeda são um par opcional: ambos preenchidos ou ambos vazios.
- A preparação usa quantidade default `20`, intervalo `1–30`, formato default `Tanto faz` e notas/restrições de até `300` caracteres.
- As preferências são persistidas como restrições da primeira geração, sem criar job ou iniciar geração.
- O Tenant é resolvido server-side pela sessão e é o único escopo de autorização da criação.
- Retry da mesma submissão é idempotente e não cria duplicata.
- Após o salvamento, o creator retorna à lista e vê o card do Product.
