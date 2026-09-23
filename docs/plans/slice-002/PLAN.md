# PLAN — Slice 002: Cadastro manual de Product

**Status:** Aguardando revisão do arquiteto
**SPEC:** `docs/specs/slice-002/SPEC.md`
**Dependência:** Slice 001 — Workspace pessoal e primeiro acesso

## 1. Objetivo de implementação

Entregar o fluxo mínimo definido na SPEC: usuário autenticado abre `/products/new` dentro de Produtos, preenche os fatos e a preparação da primeira geração, salva um `Product` no Tenant da sessão e abre seu resumo factual e de preparação. O creator escolhe explicitamente iniciar análise, editar ou salvar alterações.

O salvamento não cria job. A ação explícita `Analisar produto` usa o contrato já pertencente ao Slice 003; não há geração automática, Strategy, Plan, Content ou Briefing no POST de Product.

## 2. Estado real e áreas afetadas

| Área                       | Estado atual                                                                                                                                         | Plano mínimo                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Shell de Produtos          | `ProductShell` já usa a navegação e tokens do projeto; Produtos usa `ProductList`.                                                                   | Reutilizar `ProductShell` e adicionar Breadcrumb shadcn na subpágina.                                                                 |
| Rota de criação            | Não existe `src/app/products/new/page.tsx`.                                                                                                          | Criar página server-side protegida por `requireSession`.                                                                              |
| Lista                      | `ProductList` já busca `/api/products` e renderiza cards, mas o botão atual abre modal.                                                              | Trocar a ação de criação por link para `/products/new`; preservar renderização do card e estados de lista.                            |
| Formulários                | `product-candidate-modal.tsx` contém os campos e a seção de preparação; `product-form-model.ts` normaliza fatos, mas inclui campos fora deste slice. | Extrair/reutilizar somente o comportamento manual necessário em um formulário da nova página; não usar preview ou fluxo automatizado. |
| Cliente HTTP               | `product-api.ts` já define `listProducts`, `createProduct`, erros de campo e header `Idempotency-Key`.                                               | Ajustar o payload para preço/moeda e restrições da preparação; manter erros sanitizados e resposta de mutação determinística.         |
| API server-side            | Não existem rotas `/api/products`.                                                                                                                   | Criar `GET` e `POST` em `src/app/api/products/route.ts`, delegando a validação/persistência ao limite Product.                        |
| Product application/domain | Não há módulo Product server-side identificado.                                                                                                      | Criar o menor caso de uso local para validar, escopar Tenant, persistir e listar; não criar camada genérica de repository/service.    |
| Prisma                     | `Product` já existe com fatos, `targetContentCount`, `provenance` e `tenantId`; não há restrições completas nem chave de criação.                    | Alteração aditiva do schema e uma migration para restrições e idempotência.                                                           |
| Breadcrumb                 | Não há componente Breadcrumb em `src/components/ui`.                                                                                                 | Adicionar o primitivo Breadcrumb shadcn necessário, sem nova dependência.                                                             |

## 3. Contrato de dados e migration

### 3.1 Product existente

Reutilizar os campos atuais do modelo `Product`:

- `tenantId` resolvido pela sessão;
- `name` e `description` preenchidos após validação;
- `category` obrigatório após validação;
- `priceAmount` e `priceCurrency` obrigatórios;
- desconto opcional canônico como `discountType` (`PERCENTAGE|FIXED`) + `discountValue`; `FIXED` usa `priceCurrency`;
- `images` como lista vazia nesta etapa;
- `brand`, `seller`, `variants`, `submittedUrl` e `sourceUrl` sem entrada na tela;
- `provenance` com a origem manual factual já prevista pelo contrato vigente;
- `targetContentCount` com a quantidade inicial entre `1` e `30`;
- `generationConstraints` com observações/restrições obrigatórias, além de `creatorPresence`.

### 3.2 Alteração necessária

Adicionar ao `Product`:

- `generationConstraints Json?` para armazenar as restrições da primeira geração por Product, contendo obrigatoriamente `creatorPresence` e `constraints`; ambos devem ser persistidos com os valores validados da preparação;
- `createIdempotencyKey String?` para associar a submissão de criação ao Tenant;
- `discountType String?` e `discountValue Decimal?` para substituir `discountPercentage`; migration faz backfill de registros com percentual para `discountType = PERCENTAGE` e preserva o valor em `discountValue`, usando a moeda já obrigatória do Product.
- `version Int @default(1)` para tornar a resposta de criação/replay determinística e manter compatibilidade com o contrato cliente existente;
- índice único composto `tenantId + createIdempotencyKey`, permitindo valores nulos para registros sem chave legada.

No PostgreSQL, o índice único composto permite múltiplas linhas com `createIdempotencyKey = NULL`; portanto, registros legados permanecem com chave nula sem colidir. O POST novo exige uma `Idempotency-Key` válida, então nenhuma nova criação depende de chave ausente.

Manter `targetContentCount` como o campo canônico da quantidade inicial existente. Não criar job pelo POST de Product; a ação explícita já contratada no Slice 003 continua responsável por criar o job.

Criar migration aditiva para `discountType`/`discountValue`, restrições e idempotência; migrar percentuais legados antes do cutover e só remover `discountPercentage` depois que todos os leitores/escritores usarem o par canônico.

## 4. Sequência de implementação

1. Atualizar `prisma/schema.prisma` com os campos/índice aditivos e gerar a migration correspondente.
2. Criar um caso de uso Product focado em `createProduct` e `listProducts`:
   - receber `tenantId` resolvido server-side, nunca do body;
   - validar e normalizar fatos, desconto, quantidade, formato, notas e Preço/Moeda;
   - exigir Nome, Descrição, Categoria, Preço, Moeda e Observações/restrições; comissão e características não fazem parte do contrato ativo (ADR-030) e, quando enviadas, são ignoradas sem erro e sem escrita;
   - aceitar preço não negativo, válido e com no máximo duas casas decimais;
   - aceitar desconto apenas como par `discountType` + `discountValue`: percentual `0–100` ou valor fixo não superior ao preço na moeda do Product;
   - montar `generationConstraints` somente com os valores de preparação;
   - preencher defaults `targetContentCount = 20` e `creatorPresence = "either"` quando omitidos;
   - persistir Product e retornar o mesmo registro quando a chave idempotente já existir para o Tenant;
   - consultar a lista sempre filtrando por `tenantId`.
3. Criar `src/app/api/products/route.ts`:
   - `GET` resolve sessão e lista somente Products do Tenant;
   - `POST` resolve sessão, exige uma `Idempotency-Key` válida, valida JSON e chama o caso de uso; request sem chave ou com chave inválida é rejeitada antes da persistência;
   - retornar erros de campo em contrato consumível por `product-api.ts`;
   - retornar `id`, `version` e indicação de replay; replay da mesma chave no Tenant retorna o mesmo Product `id` e `version`, sem nova linha;
   - não iniciar qualquer processamento posterior.
4. Adicionar `src/components/ui/breadcrumb.tsx` a partir do padrão shadcn/ui e compor `Produtos / Adicionar produto` na nova página.
5. Criar `src/app/products/new/page.tsx` com `requireSession`, `ProductShell` e o formulário client-side.
6. Criar ou extrair o formulário manual focado, reutilizando `Button`, `Select`, `Slider` e estilos/tokens existentes:
   - campos exatamente: Nome do produto, Descrição, Categoria, Preço e Moeda;
   - seção `Preparação dos conteúdos` com quantidade, formato e observações/restrições;
   - marcar com `*` Quantidade, Formato e Observações/restrições; o asterisco é apenas indicação visual;
   - validar todos os campos obrigatórios no HTML/cliente e servidor;
   - preço em formato pt-BR, não negativo, com no máximo duas casas decimais, e moeda `R$`, `USD` ou `EUR`, ambos obrigatórios;
   - desconto opcional por seletor `PERCENTAGE|FIXED` e valor; valor fixo usa a moeda do preço;
   - defaults `20`, `Tanto faz` e notas obrigatórias, com limite de `300`;
   - ação `Salvar produto` e cancelamento para `/products`;
   - após sucesso, usar o `id` retornado para abrir `/products/:id`, mostrando resumo factual e de preparação; não redirecionar automaticamente para a lista;
   - no resumo `PENDING`, oferecer `Analisar produto` (POST de geração explícito), `Editar produto` e, durante edição, `Salvar alterações`;
   - GET de geração ausente ou envelope inválido preserva o resumo idle; erro de job existente permanece visível;
   - gerar uma única `Idempotency-Key` quando começar a tentativa lógica daquele formulário, guardar a chave durante a tentativa e reutilizá-la em todo retry após falha; não gerar nova chave a cada novo submit da mesma tentativa; limpar a chave somente após sucesso, cancelamento ou início de um novo formulário;

## 5. Segurança e autorização

- Página usa `requireSession`; ausência/expiração redireciona para o fluxo de acesso existente.
- Rotas API resolvem cookie de sessão e `resolveSession`; não confiam em `tenantId` do cliente.
- Caso de uso recebe Tenant já resolvido e aplica `where: { tenantId }` em toda leitura/listagem.
- Criação, replay idempotente e resposta não podem revelar Products de outro Tenant.
- `Idempotency-Key` é obrigatória no POST, deve ter formato/tamanho seguro e é associada ao Tenant; mesma chave com o mesmo Tenant retorna o mesmo Product, `id` e `version`.
- Requests sem `Idempotency-Key` válida são rejeitados; não há caminho de criação sem chave.
- O cliente gera a chave uma vez por tentativa lógica/formulário e a reutiliza nos retries após falha; um novo submit da mesma tentativa não troca a chave.
- Não aceitar nem persistir URL, credenciais, tokens, cookies ou dados de navegação externa.
- Erros HTTP e mensagens de UI devem ser sanitizados, sem stack trace, SQL, payload interno ou dados de outro Tenant.

## 6. Erros e estados

Implementar os códigos comportamentais da SPEC:

- `VAL-NAME-REQUIRED`, `VAL-DESCRIPTION-REQUIRED`, `VAL-CATEGORY-REQUIRED`, `VAL-PRICE-REQUIRED`, `VAL-CURRENCY-REQUIRED`, `VAL-FEATURES-REQUIRED` e `VAL-NOTES-REQUIRED`: validação HTML/cliente e server, mensagem inline, foco no primeiro erro e preservação da entrada;
- `VAL-PRICE-FORMAT`: rejeição determinística de preço negativo, inválido ou com mais de duas casas decimais;
- `VAL-QUANTITY-RANGE`, `VAL-CREATOR-FORMAT` e `VAL-NOTES-LENGTH`: rejeição server-side e feedback associado ao controle;
- `VAL-IDEMPOTENCY-KEY`: POST sem `Idempotency-Key` válida é rejeitado antes da persistência;
- `AUTH-SESSION` e `AUTH-TENANT`: resposta não autorizada/erro sanitizado sem persistência;
- `SAVE-FAILED`: erro recuperável com formulário intacto;
- replay da mesma chave: resposta do mesmo Product, com o mesmo `id` e `version`, sem nova linha.

O formulário deve representar `idle`, `editing`, `invalid`, `saving`, `success`, `error` e `cancelled`, com ação primária desabilitada durante salvamento. Erros não podem ser comunicados somente por cor; foco, labels, `aria-invalid`, `aria-busy`, teclado e alvos `44×44px` seguem `DESIGN.md`.

## 7. Testes comportamentais mínimos

Adicionar somente os testes necessários às invariantes:

1. **Modelo/validação:** todos os campos obrigatórios; preço não negativo, válido e até duas casas; desconto percentual ou fixo com tipo/valor consistente; defaults de quantidade `20` e formato `Tanto faz`; faixa `1–30`; notas até `300`.
2. **Caso de uso/API:** cria Product com `tenantId` da sessão, grava desconto, `targetContentCount` e `generationConstraints`, não cria job e lista apenas o Tenant atual.
3. **Idempotência:** POST sem chave é rejeitado; duas criações com mesma chave e Tenant retornam mesmo `id`/`version` e uma única linha; chaves iguais em Tenants diferentes não colidem; retry do formulário reutiliza a chave original.
4. **Cliente/resumo:** criação abre `/products/:id`; resumo `PENDING` preserva idle sem job/envelope inválido, mas mostra erro de job existente; edição só libera preparação antes de job.

Preferir testes determinísticos dos modelos e do caso de uso, reutilizando o padrão `tsx --test` já presente. Não criar testes de importação, browser, LLM, geração ou integração futura.

## 8. Validações finais enxutas

Após implementação, executar somente:

1. `npm run typecheck`;
2. `npm run lint`;
3. teste relevante do Slice 002 com `npx tsx --test <arquivos-do-slice-002>`;
4. `npm run build`;
5. smoke UI autenticado: abrir Produtos → `Adicionar produto` → `/products/new`, confirmar campos/defaults, tentar submissão inválida, salvar um Product, verificar resumo factual/preparação e ação explícita de análise; repetir a requisição com a mesma chave sem duplicata.

Registrar no handoff quais validações foram executadas e qualquer limitação de ambiente, sem executar suíte ampla além do comando de teste relevante.

## 9. Limites e não decisões

- Não remover nem refatorar componentes legados do fluxo automatizado fora dos pontos necessários para apontar a criação para `/products/new`.
- Não criar job no salvamento; `Analisar produto` usa o endpoint/contrato já pertencente ao Slice 003.
- Permitir editar preparação somente antes de qualquer job; não implementar edição de resultado, quotas, geração automática ou dashboard.
- Não adicionar dependência externa: Breadcrumb deve vir do padrão shadcn/ui já adotado.
- Se o contrato existente de `provenance` ou a migration revelar incompatibilidade de dados, parar e registrar a divergência para decisão arquitetural antes de ampliar o escopo.
