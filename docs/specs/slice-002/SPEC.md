# SPEC — Slice 002: Cadastro manual de Product

**Status:** Aguardando revisão
**Dependência:** Slice 001 — Workspace pessoal e primeiro acesso
**Rota:** `/products/new`

## 1. User Outcome

O creator autenticado abre a subpágina `/products/new` dentro de Produtos, informa os fatos que conhece, salva um `Product` escopado ao `Tenant` da sessão e abre seu resumo factual e de preparação. Salvar não inicia geração; o creator escolhe iniciar a análise, editar os dados ou salvar alterações antes de qualquer job.

O Slice 002 entrega o cadastro factual manual e o resumo pré-análise de um `Product`. A superfície preserva os campos e o conteúdo do modal manual existente, mantendo o formulário simples e sem solicitar contexto estratégico. A criação do `CommerceIntelligenceJob`, o processamento assíncrono e a geração de Strategy, Plan e Briefings pertencem ao Slice 003 e são acionados apenas pela ação explícita `Analisar produto`.

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
  - desconto opcional, com `discountType` `PERCENTAGE` ou `FIXED` e `discountValue`.
- Seção `Preparação dos conteúdos` com:
  - quantidade inicial de conteúdos;
  - formato do creator;
  - observações ou restrições.
- Todos os campos do formulário são obrigatórios: Nome, Descrição, Categoria, Preço, Moeda e Observações ou restrições.
- Preço deve ser não negativo, válido e ter no máximo duas casas decimais; Moeda deve ser uma das opções permitidas. Desconto, quando preenchido, exige tipo e valor; `PERCENTAGE` respeita `0–100` e `FIXED` usa a moeda do Product e não excede o preço.
- Quantidade e formato têm defaults válidos e aparecem com `*`; Observações ou restrições aparecem com `*` e são obrigatórias, até `300` caracteres.
- O asterisco é apenas indicação visual; HTML/cliente e servidor validam a obrigatoriedade.
- Persistência do Product e das restrições de preparação no Tenant resolvido server-side.
- Após salvar, abrir o resumo do Product com fatos e preparação, oferecendo `Analisar produto`, `Editar produto` e, durante edição, `Salvar alterações`.
- Estados de validação, salvamento, sucesso e erro necessários ao fluxo.

## 4. Out of Scope

- URL ou entrada por URL.
- Qualquer descoberta automática ou origem externa de fatos.
- LLM, Model Router, Agent Runner, Browser Harness, Chromium, browser headless ou interativo.
- Docker, container dedicado ou infraestrutura de navegação.
- Estados intermediários de dados antes do Product.
- Criação ou execução automática de `CommerceIntelligenceJob`.
- Geração de Strategy, ContentPlan, ContentOpportunity, Content ou Briefing.
- Campos estratégicos, incluindo público, dores, desejos, objeções, benefícios, argumentos, posicionamento, ângulos, hooks, scripts e CTA.
- Publicação, agendamento, analytics, sincronização de catálogo, outros marketplaces ou mídia.
- Upload de arquivos ou captura de mídia.
- Edição após a criação de job ou de resultado de geração; a edição desta frente é somente do Product `PENDING`, antes da análise.
- Arquivamento ou exclusão.
- Qualquer comportamento dos slices futuros além de registrar as restrições para sua entrada e disparar a ação explícita já contratada pelo Slice 003.

## 5. Comportamentos

### B-001 — Acesso e contexto

Usuário autenticado acessa Produtos e aciona `Adicionar produto`. O sistema abre `/products/new` mantendo o contexto de Produtos e apresenta `Salvar produto` como ação primária e `Cancelar` como ação secundária.

### B-002 — Campos factuais

O sistema apresenta somente os campos factuais definidos nesta SPEC. Nome, Descrição, Categoria, Preço e Moeda são campos persistentes do Product e obrigatórios.

Características e comissão não fazem parte do contrato ativo (ADR-030): não são coletadas, validadas, projetadas nem expostas; colunas históricas permanecem isoladas no banco.

### B-003 — Preparação dos conteúdos

O sistema apresenta a seção `Preparação dos conteúdos` com estes valores iniciais e limites:

- quantidade inicial: `20`, inteiro entre `1` e `30`, exibida com `*`;
- formato do creator: `Tanto faz`, com opções `Em câmera`, `mão e produto` e `Tanto faz`, exibido com `*`;
- observações ou restrições: exibidas com `*`, obrigatórias, não vazias após remoção de espaços, máximo de `300` caracteres.

O asterisco é apenas indicação visual; a obrigatoriedade é validada no HTML/cliente e no servidor.

### B-004 — Salvamento e resumo pré-análise

Quando o formulário é válido, o sistema persiste o Product com os fatos fornecidos e associa ao Product as preferências de preparação como restrições da primeira geração. Após sucesso, abre o resumo factual e de preparação; não retorna automaticamente à lista.

No resumo `PENDING`, `Analisar produto` é uma ação explícita, `Editar produto` abre a edição dos fatos e da preparação, e `Salvar alterações` aparece somente durante edição. Salvar ou editar não criam job.

### B-005 — Estado da geração sem job

GET de geração sem job, erro de envelope ou falha de carregamento não pode substituir o resumo `PENDING` por estado de análise. Um job existente em `QUEUED`, `RUNNING`, `FAILED`, `CANCELLED`, `SUCCEEDED` ou `SUCCEEDED_PARTIAL` conserva seu estado e seus erros sanitizados visíveis.

### B-006 — Limite da primeira geração

Salvar o Product não cria `CommerceIntelligenceJob`, não inicia geração e não produz Strategy, Plan, Content ou Briefing. As restrições ficam disponíveis para o slice responsável pela primeira geração.

### B-007 — Cancelamento

Ao acionar `Cancelar`, o sistema abandona o formulário, não persiste Product e retorna para a lista de Produtos.

### B-008 — Retry de salvamento

Se a mesma submissão for repetida por retry técnico, o sistema não cria Products duplicados. Em caso de erro recuperável, mantém os valores preenchidos e permite nova tentativa.

## 6. Regras e invariantes

### RI-001 — Obrigatoriedade

Nome, Descrição e Categoria devem conter valor não vazio após remoção de espaços. Preço e Moeda devem ser informados e válidos. Observações ou restrições devem conter valor não vazio após remoção de espaços e não exceder `300` caracteres. Nenhum Product é persistido sem esses campos obrigatórios.

### RI-002 — Preço, moeda e desconto

Preço e Moeda são obrigatórios e devem ser informados conjuntamente. Preço não pode ser negativo, deve respeitar formato monetário válido e ter no máximo duas casas decimais. As moedas disponíveis são `R$` (R$ Reais), `USD` ($ Dólar) e `EUR` (€ Euro). Desconto é opcional, mas `discountType` e `discountValue` são inseparáveis: `PERCENTAGE` fica entre `0–100`; `FIXED` usa a moeda do Product e não excede o preço.

**Contrato oficial do desconto (Gate 5):** o desconto é exclusivamente o tipado — `discountType` (`PERCENTAGE`|`FIXED`) + `discountValue` (não negativo, até duas casas decimais); não existe contrato de compatibilidade legada. `FIXED` é validado contra o preço: não excede `priceAmount` e exige `priceCurrency`. A migration do contrato tipado (`20260914120000_discount_type_value`) é aditiva: colunas `discountType`/`discountValue` nullable, sem defaults e **sem backfill** — os dados anteriores permanecem intactos (ausência de backfill não significa ausência de migration). O `discountPercentage` do schema é resquício de dados de desenvolvimento, sem status de contrato: não é aceito na escrita (service ignora o campo e não persiste a coluna), não entra como fato de desconto na geração (worker projeta somente o tipado) e não é derivado no cliente — permanece apenas exposto na leitura como campo do schema. A leitura autenticada do Product expõe os campos do schema; ausência de desconto é `null` e nunca é inventada pela geração. A projeção compacta do `mappingContext` na engine lê o fato `discount` (chave enviada pelo worker — alinhamento do Gate 5, item 3).

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

### RI-008 — Resumo e estado de geração

O resumo `PENDING` é preservado quando a consulta de geração não encontra job ou recebe envelope inválido. Somente um job existente pode apresentar status, stage ou erro de geração; erro sanitizado de job existente não é suprimido.

### RI-009 — Limite de responsabilidade

Este slice não inicia geração por efeito de salvar ou editar. A ação explícita `Analisar produto` usa o contrato do Slice 003; a edição da preparação é permitida somente antes de qualquer job.

## 7. Validações e erros

| Código                     | Condição                                                   | Comportamento esperado                                                                         |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `VAL-NAME-REQUIRED`        | Nome ausente ou vazio                                      | Exibir erro junto ao campo, manter valor e focar o primeiro erro.                              |
| `VAL-DESCRIPTION-REQUIRED` | Descrição ausente ou vazia                                 | Exibir erro junto ao campo, manter valor e focar o primeiro erro.                              |
| `VAL-CATEGORY-REQUIRED`    | Categoria ausente ou vazia                                 | Exibir erro junto ao campo, manter valor e focar o primeiro erro.                              |
| `VAL-PRICE-REQUIRED`       | Preço ausente                                              | Bloquear salvamento e explicar que o preço é obrigatório.                                      |
| `VAL-CURRENCY-REQUIRED`    | Moeda ausente                                              | Bloquear salvamento e explicar que a moeda é obrigatória.                                      |
| `VAL-DISCOUNT-INVALID`     | Tipo/valor de desconto ausente, incompatível ou fora da faixa | Bloquear salvamento e explicar a regra do percentual ou valor fixo.                         |
| `VAL-NOTES-REQUIRED`       | Observações/restrições ausentes ou vazias                  | Bloquear salvamento e exibir erro associado ao campo.                                          |
| `VAL-PRICE-FORMAT`         | Preço negativo, formato inválido ou com mais de duas casas | Bloquear salvamento e explicar o formato esperado.                                             |
| `VAL-QUANTITY-RANGE`       | Quantidade não inteira ou fora de `1–10`                   | Bloquear salvamento e manter o valor editável.                                                 |
| `VAL-CREATOR-FORMAT`       | Formato fora das opções permitidas                         | Bloquear salvamento e manter a seleção válida anterior.                                        |
| `VAL-NOTES-LENGTH`         | Notas/restrições acima de `300` caracteres                 | Impedir excedente ou bloquear salvamento com mensagem associada ao campo.                      |
| `AUTH-SESSION`             | Usuário não autenticado                                    | Não permitir a operação e aplicar o fluxo de autenticação vigente.                             |
| `AUTH-TENANT`              | Tenant da sessão não resolvido                             | Não persistir; exibir erro sanitizado e permitir recuperação conforme autenticação vigente.    |
| `SAVE-FAILED`              | Falha de persistência                                      | Exibir erro sanitizado, preservar os dados e oferecer nova tentativa.                          |
| `SAVE-DUPLICATE`           | Repetição da mesma submissão                               | Retornar o Product já criado ou tratar a operação de forma idempotente, sem duplicar registro. |

Erros não devem depender somente de cor, não devem limpar a entrada e não devem expor detalhes internos, segredos ou dados de outro Tenant.

## 8. Estados de UX

| Estado      | Representação e comportamento                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `idle`      | Formulário disponível com defaults de preparação; ação `Salvar produto` habilitada somente quando não houver bloqueio conhecido. |
| `editing`   | Valores digitados preservados; erros de campo podem ser corrigidos sem perder os demais dados.                                   |
| `invalid`   | Mensagens inline junto aos campos inválidos; foco orientado ao primeiro erro; nenhuma persistência.                              |
| `saving`    | Ação primária desabilitada e identificada como salvando; não permitir submissão duplicada.                                       |
| `summary`   | Product `PENDING` salvo com fatos e preparação visíveis; `Analisar produto` e `Editar produto` são ações disponíveis.             |
| `error`     | Falha sanitizada visível; formulário preservado; nova tentativa disponível.                                                      |
| `cancelled` | Formulário descartado sem persistência; retorno para Produtos.                                                                   |

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

| ID          | Critério verificável                                                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AC-002-01` | **WHEN** um usuário autenticado acionar `Adicionar produto` em Produtos, **o sistema SHALL** abrir `/products/new` dentro do contexto de Produtos. |
| `AC-002-02` | **WHEN** `/products/new` for exibida, **o sistema SHALL** apresentar Nome do produto, Descrição, Categoria, Preço, Moeda, desconto opcional e a seção Preparação dos conteúdos. |
| `AC-002-03` | **WHILE** Nome, Descrição, Categoria, Preço, Moeda ou Observações/restrições estiver ausente, vazio ou inválido, **o sistema SHALL** impedir o salvamento, exibir o erro associado e preservar os valores digitados. |
| `AC-002-04` | **WHEN** Preço ou Moeda estiver ausente, ou o preço for negativo, inválido ou tiver mais de duas casas decimais, **o sistema SHALL** impedir o salvamento e informar a regra correspondente. |
| `AC-002-05` | **WHEN** desconto for informado, **o sistema SHALL** exigir `discountType` `PERCENTAGE` ou `FIXED`, `discountValue` válido e moeda do Product. |
| `AC-002-06` | **WHEN** o formulário for carregado, **o sistema SHALL** definir quantidade `20`, permitir somente inteiros de `1` a `30`, definir formato `Tanto faz`, exibir `*` em Quantidade, Formato e Observações/restrições e limitar estas últimas a `300` caracteres. |
| `AC-002-07` | **WHEN** uma submissão válida for salva, **o sistema SHALL** persistir o Product com os fatos preenchidos e as preferências de preparação como restrições da primeira geração. |
| `AC-002-08` | **WHEN** o Product for salvo, **o sistema SHALL NOT** criar `CommerceIntelligenceJob`, iniciar geração ou produzir Strategy, Plan, Content ou Briefing. |
| `AC-002-09` | **WHEN** o salvamento terminar com sucesso, **o sistema SHALL** abrir o resumo factual e de preparação e oferecer `Analisar produto` e `Editar produto`; durante edição, SHALL oferecer `Salvar alterações`. |
| `AC-002-10` | **WHEN** GET de geração não encontrar job ou receber envelope inválido, **o sistema SHALL** preservar o resumo idle; **WHEN** houver job existente com erro, SHALL manter esse erro visível e acionável. |
| `AC-002-11` | **WHEN** o Product for persistido, **o sistema SHALL** associá-lo ao Tenant resolvido server-side e impedir leitura por outro Tenant. |
| `AC-002-12` | **WHEN** o creator acionar `Cancelar`, **o sistema SHALL** retornar para Produtos sem persistir um Product. |
| `AC-002-13` | **WHEN** ocorrer falha de validação ou persistência, **o sistema SHALL** manter os dados preenchidos, exibir erro acionável e permitir correção ou nova tentativa. |
| `AC-002-14` | **WHEN** a tela for usada em mobile, teclado ou tecnologia assistiva, **o sistema SHALL** manter todas as capacidades, foco-visible, labels associadas, feedback acessível e alvos de toque de pelo menos `44×44px`. |
| `AC-002-15` | **WHEN** a mesma submissão for repetida com a mesma chave de idempotência, **o sistema SHALL** retornar o mesmo Product, com o mesmo `id` e a mesma versão, sem criar novo registro. |

| Cadastro em `/products/new` dentro de Produtos | PRD específico § 4; SLICES Slice 002 | B-001, AC-002-01 |
| Campos factuais, desconto e preparação | PRD específico §§ 5–6; SLICES Slice 002 Scope | B-002, B-003, AC-002-02, AC-002-05 |
| Todos os campos obrigatórios e validação HTML/cliente/servidor | PRD específico §§ 5 e 6; SLICES Slice 002 | RI-001, VAL-\*-REQUIRED, AC-002-03, AC-002-06 |
| Preço, Moeda e desconto canônico | PRD específico § 5; SLICES Slice 002 | RI-002, VAL-PRICE-REQUIRED, VAL-CURRENCY-REQUIRED, VAL-DISCOUNT-INVALID, AC-002-04, AC-002-05 |
| Defaults, asteriscos e limites de preparação | PRD específico §§ 5 e 6; SLICES Slice 002 | RI-003, AC-002-06 |
| Persistir restrições sem iniciar geração | PRD específico §§ 5 e 11; SLICES Slice 002 | B-004, B-006, RI-009, AC-002-07, AC-002-08 |
| Resumo pré-análise e erro de job | PRD específico § 8; SLICES Slice 002 | B-004, B-005, RI-008, AC-002-09, AC-002-10 |
| Tenant server-side e isolamento | PRD específico § 7; SYSTEM-DESIGN §§ 3 e 8; PRINCIPLES § 7 | RI-005, segurança, AC-002-11 |
| Retry sem duplicata | PRD específico § 7; SLICES Slice 002 | B-008, RI-007, SAVE-DUPLICATE, AC-002-15 |
| UX responsiva e acessível | DESIGN §§ 3, 6, 8 e 10; SLICES Slice 002 | estados UX, AC-002-13, AC-002-14 |

## 12. Decisões registradas

- A entrada desta etapa é a subpágina `/products/new` dentro de Produtos.
- O formulário mantém os fatos e a preparação do modal manual, substituindo o modal pela subpágina e pelo resumo pós-cadastro.
- Nome, Descrição, Categoria, Preço, Moeda e Observações ou restrições são obrigatórios.
- Características e comissão foram retiradas do contrato ativo (ADR-030): não são coletadas, validadas, projetadas nem expostas; colunas históricas permanecem isoladas no banco.
- Desconto opcional usa exclusivamente `discountType` `PERCENTAGE|FIXED` + `discountValue` + moeda do Product.
- Quantidade e Formato mantêm defaults `5`, `1–10` e `Tanto faz`, aparecem com `*`; Observações/restrições também aparece com `*`, é obrigatória e limitada a `300` caracteres.
- O asterisco é apenas indicação visual; HTML/cliente e servidor validam.
- Salvar e editar não criam job; após o salvamento o creator abre o resumo e escolhe explicitamente `Analisar produto`.
- GET sem job ou envelope inválido preserva idle; erros de job existente permanecem visíveis.
- O Tenant é resolvido server-side pela sessão e é o único escopo de autorização da criação.
- Retry da mesma submissão é idempotente e não cria duplicata.
