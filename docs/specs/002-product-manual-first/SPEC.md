# SPEC — Slice 002: Product manual-first pronto para Strategy

## User Outcome

O creator consegue cadastrar um Product com fatos suficientes, completar seu contexto estratégico e deixá-lo pronto para a primeira Strategy do próximo slice.

## Contexto

Este é o próximo slice após o Workspace pessoal e o primeiro acesso. O fluxo começa em um Tenant/Workspace resolvido pela sessão server-side e prepara o primeiro objeto real do core loop: Product.

A entrada manual é o caminho canônico. Nome e descrição são suficientes para criar um Product inicial. Categoria, preço, características, referências de imagens, observações e URL podem enriquecer o registro sem transformar a entrada em dependência de scraping ou de uma integração de marketplace.

O contexto estratégico pertence ao Product e usa o locale operacional `pt-BR`. Ele pode ser completado antes da primeira geração, mas a decisão comercial, Strategy, Plan e Content pertencem a slices posteriores.

O entitlement inicial de Products ativos é provisionado server-side para todo Tenant conforme o ADR-006. Seu limite vem de configuração do servidor; o cliente não escolhe plano, limite ou contador.

## In Scope

- Abrir a entrada de criação de Product a partir da ação `Adicionar produto`.
- Criar e abrir um Product ativo com nome e descrição manual válidos.
- Aceitar categoria, preço em BRL, características, referências de imagens, observações e URL como dados opcionais.
- Permitir abrir um Product do próprio Tenant e complementar seus fatos antes da geração.
- Registrar contexto estratégico em `pt-BR`, incluindo objetivo, público, estilo, presença do creator, experiência, restrições, mercado e observações quando informados.
- Permitir salvar um Product com poucos dados e retornar posteriormente para completá-lo.
- Aplicar o limite server-side de Products ativos do Tenant antes de ativar um novo Product.
- Permitir Products adicionais no mesmo Workspace enquanto houver capacidade autorizada.
- Usar uma chave de idempotência por intenção de criação para que retry da mesma submissão resolva o mesmo Product sem impor unicidade de nome ou URL.
- Tentar enriquecimento por URL somente de forma best-effort, sem bloquear o Product manual quando a URL falhar, for bloqueada ou retornar conteúdo incompleto.
- Exibir `Produto pronto para Strategy` como estado informativo quando os fatos obrigatórios e o contexto necessário estiverem completos, sem iniciar Strategy.
- Manter Product e contexto escopados ao Tenant resolvido pela sessão.

## Out of Scope

- Decisão comercial, análise de Product, Strategy, Plan ou Content.
- Geração síncrona ou assíncrona, provider textual, fila, retry de geração ou quota de Contents.
- Scraping complexo, crawler, login ou conexão com TikTok/TikTok Shop.
- Importação em lote, sincronização ou atualização automática de catálogo.
- Upload ou processamento de mídia; imagens neste slice são referências opcionais, não arquivos gerados ou publicados.
- Publicação, analytics, métricas externas ou dashboard.
- Colaboração, membros, convites, RBAC ou troca de Tenant.
- Product compartilhado entre Workspaces.
- Troca de plano, cobrança, upgrade, downgrade ou edição do limite comercial.

## Comportamentos

### Criar Product manualmente

1. Uma pessoa autenticada escolhe `Adicionar produto` em `Hoje`.
2. A aplicação resolve o Tenant/Workspace pela sessão, nunca por `tenant_id` enviado pelo cliente.
3. A pessoa informa nome e descrição e pode preencher os campos opcionais disponíveis.
4. A interface cria uma `idempotency_key` opaca para a intenção e reutiliza a mesma chave em retry da submissão.
5. Com dados válidos e capacidade de Products ativos disponível, a aplicação cria um Product ativo pertencente ao Tenant resolvido.
6. A aplicação preserva o locale `pt-BR` no contexto estratégico associado ao Product.
7. Repetir dentro da retenção de 24 horas a mesma intenção com a mesma chave e o mesmo payload normalizado retorna o mesmo Product; reutilizar a chave com payload diferente falha sem nova mutação; após a retenção, a mesma chave inicia obrigatoriamente uma nova intenção, retorna um novo Product e não altera o Product anterior.
8. Após salvar, a pessoa consegue abrir o Product, completar o contexto e identificar a próxima ação `Completar contexto` ou o estado informativo `Produto pronto para Strategy`.
9. Nenhuma Strategy, Plan, Content, fila ou dado de outro Tenant é criado implicitamente.

### Completar Product e contexto

1. A pessoa abre um Product pertencente ao próprio Workspace.
2. A pessoa pode completar ou corrigir fatos do Product e contexto estratégico sem perder os dados já salvos.
3. O contexto informado permanece ligado ao Product de origem e disponível para o próximo slice.
4. Salvar alterações mantém o mesmo Product e não cria uma cópia silenciosa.
5. A atualização envia a versão observada do Product; se outra edição tiver sido salva antes, a aplicação rejeita a versão obsoleta com conflito recuperável, preserva a versão mais recente e permite recarregar antes de tentar novamente.
6. Um Product de outro Tenant não pode ser aberto, alterado ou inferido por identificador enviado pelo cliente.

### URL como enriquecimento opcional

1. A pessoa pode informar uma URL `http` ou `https` com até 2.048 caracteres e sem credenciais embutidas.
2. A aplicação pode tentar enriquecê-la de forma isolada e best-effort, fora da transação de Product.
3. A tentativa aceita no máximo 3 redirecionamentos, 5 segundos de tempo total e 1 MiB de conteúdo; o destino final deve continuar em `http`/`https` e não pode resolver para loopback, rede privada, link-local, multicast ou faixa reservada.
4. Conteúdo externo limitado a tipos textuais suportados é tratado como não confiável; conteúdo incompleto, tipo não suportado, bloqueio, timeout, DNS ou falha de rede não impede salvar os dados manuais.
5. O resultado externo, quando houver, é apresentado como enriquecimento pendente, concluído ou indisponível e nunca substitui silenciosamente os fatos manuais.
6. A experiência não promete importação integral, scraping garantido ou conexão com marketplace.

### Limite de Products ativos

1. Todo Tenant possui um entitlement default server-side conforme o ADR-006; sua capacidade `active_products` vem de configuração server-side.
2. Antes de ativar um Product, a aplicação resolve o entitlement vigente no servidor para o Tenant.
3. Se a configuração estiver ausente ou inválida, a ativação falha fechada com estado recuperável de capacidade indisponível e nenhuma mutação parcial.
4. Se houver capacidade, a ativação e a atualização do uso ocorrem de forma consistente com a criação do Product.
5. Se o limite estiver atingido, a aplicação rejeita a ativação sem criar Product ativo parcial ou ultrapassar a capacidade.
6. Duas criações concorrentes no limite resultam em no máximo o número configurado de Products ativos; a requisição vencedora salva, e a perdedora recebe erro recuperável de capacidade sem Product ou uso parcial.
7. O cliente não pode escolher plano, limite, período ou contador para contornar a regra.

## Regras e invariantes

- Todo Product pertence a exatamente um Tenant/Workspace.
- Identificadores de Product são UUID v4 ou equivalente com pelo menos 122 bits de entropia e não são previsíveis.
- Toda leitura e escrita do slice usa o Tenant resolvido server-side pela sessão.
- `tenant_id` recebido do cliente nunca seleciona o escopo de autorização.
- Nome e descrição manual são suficientes para criar um Product inicial; os demais campos são opcionais salvo validação específica do campo informado.
- Product adicional não é rejeitado por uma unicidade artificial de nome ou URL.
- A chave de idempotência é opaca, obrigatória para criação, escopada ao Tenant, gerada com pelo menos 128 bits de entropia e distingue retry da criação intencional de outro Product igual.
- O payload normalizado para idempotência aparará espaços externos e quebras de linha, aplicará Unicode NFC, representará preço em centavos, campos opcionais ausentes como `null` e preservará maiúsculas/minúsculas e a ordem das listas; a mesma chave com payload normalizado diferente nunca cria ou altera Product silenciosamente.
- O registro de idempotência é retido por 24 horas após conclusão ou falha terminal; dentro da retenção a mesma chave resolve o resultado original, e após a expiração inicia obrigatoriamente nova intenção sem alterar o Product anterior.
- O locale operacional persistido para contexto é `pt-BR`.
- Preço é BRL, não negativo, finito, com no máximo duas casas decimais e sem arredondamento silencioso; a persistência representa centavos inteiros.
- Salvar novamente atualiza o Product existente sob controle de versão; conflito não sobrescreve a edição mais recente.
- Nenhuma entrada de Product cria Strategy, Plan, Content, Production ou Generation.
- URL e qualquer conteúdo externo são entrada não confiável e não podem acessar credenciais, rede interna ou dados de outro Tenant.
- O limite de Products ativos é decidido no servidor e respeitado sob concorrência.
- Product que não pode ser ativado por limite não deve aparecer como ativo nem consumir capacidade parcialmente.

## Validações e erros

- Nome obrigatório: texto Unicode aparado entre 1 e 200 caracteres.
- Descrição obrigatória: texto Unicode aparado entre 1 e 5.000 caracteres.
- Categoria opcional: texto aparado de até 120 caracteres.
- Preço opcional: valor BRL finito, entre `0,00` e `99.999.999,99`, com até duas casas decimais; entradas inválidas, `NaN` e infinito são rejeitados.
- Características opcionais: até 20 itens, cada um com até 300 caracteres.
- Observações e campos de contexto opcionais: texto aparado de até 5.000 caracteres por campo.
- Referências de imagens opcionais: até 10 referências `http`/`https`, cada uma com até 2.048 caracteres; nenhuma referência dispara upload ou processamento de mídia neste slice.
- URL de Product opcional: `http`/`https`, até 2.048 caracteres, sem credenciais; limites de rede e conteúdo seguem o comportamento de enriquecimento desta SPEC.
- A chave de idempotência deve ser opaca, não vazia, ter entre 22 e 128 caracteres e representar pelo menos 128 bits de entropia; chave reutilizada com payload diferente retorna conflito sem mutação.
- Dados inválidos retornam mensagens associadas aos campos e não criam nem alteram Product parcialmente.
- Limite atingido ou configuração de capacidade ausente retorna erro recuperável, sem Product ativo ou uso parcial e sem revelar dados de outro Tenant.
- Product inexistente ou pertencente a outro Tenant falha com `404` e corpo uniforme não enumerável, sem revelar se o identificador existe.
- Versão obsoleta em atualização retorna conflito recuperável, preserva o Product mais recente e não descarta dados silenciosamente.
- Sessão ausente, inválida, expirada ou revogada impede a operação e conduz ao acesso.
- Falha no enriquecimento de URL preserva o Product manual e comunica o estado opcional de enriquecimento quando relevante; enriquecimento parcial, concluído ou rejeitado nunca sobrescreve silenciosamente fatos manuais.
- Retry dentro da retenção de 24 horas com a mesma chave e payload retorna o resultado original; após expiração a mesma chave inicia obrigatoriamente nova intenção e retorna novo Product; retry sem a chave obrigatória falha antes da persistência.
- Nenhum erro ou log deve expor cookie, token, segredo, identificador de sessão ou dados de outro Tenant.

## Estados de UX relevantes

- **Não autenticado:** retorno ao fluxo de acesso; nenhum Product é exibido.
- **Criando:** submissão em andamento, chave de idempotência preservada, duplo acionamento impedido e progresso comunicado.
- **Criado:** Product persistido, confirmação textual e próximo passo explícito.
- **Editando:** Product e contexto carregados, labels persistentes, campos operáveis e ação `Salvar alterações` clara.
- **Salvando:** botão de salvar desabilitado, `aria-busy` comunicado e valores preservados.
- **Salvo:** confirmação textual; a ação seguinte é `Completar contexto` quando faltarem dados, ou o estado informativo `Produto pronto para Strategy` quando o contexto estiver completo.
- **Conflito de edição:** aviso associado, versão mais recente preservada e ações `Recarregar` e `Continuar` sem sobrescrita automática.
- **Erro de validação:** campos inválidos destacados, mensagens associadas, foco no primeiro campo inválido e correção possível.
- **Erro de capacidade:** limite de Products ativos atingido ou configuração indisponível, sem mutação parcial e com orientação recuperável.
- **Enriquecimento pendente:** tentativa de URL em andamento; salvar manualmente permanece disponível.
- **Enriquecimento indisponível:** aviso não bloqueante com retry opcional; fatos manuais continuam salváveis.
- **Product salvo incompleto:** Product persistido com ação prioritária `Completar contexto`.
- **Produto pronto para Strategy:** estado informativo sem botão, rota ou ação executável de Strategy neste slice.
- **Falha de carregamento:** sessão preservada quando possível, mensagem recuperável e retry sem duplicação.

`Produto pronto para Strategy` aparece quando nome e descrição válidos e um registro de contexto `pt-BR` foram salvos sem erro; todos os campos de contexto são opcionais neste slice, e a validação de dados necessários para gerar Strategy pertence ao Slice 003.

Composição responsiva obrigatória:

- **Mobile até 767px:** uma coluna, header contextual, formulário completo e ação de salvar acessível acima da navegação inferior; região rolável respeita `--safe-bottom` e `scroll-padding-block-end`.
- **Tablet de 768px a 1199px:** rail lateral persistente de `72px`, região principal com grid de oito colunas, gutter de `24px` e formulário sem remover capacidades.
- **Desktop a partir de 1200px:** sidebar fixa de `240px`, toolbar contextual de referência `56px` e coluna de conteúdo limitada conforme `DESIGN.md`.
- A ação primária, estados de erro e conclusão permanecem acessíveis em mobile, tablet e desktop; nenhuma capacidade de Product fica exclusiva do desktop.

A experiência deve manter locale `pt-BR`, labels persistentes, foco visível, ordem de teclado, mensagens `role="alert"` ou `role="status"` associadas, foco no primeiro erro, alvos de toque mínimos de `44×44px` e estados independentes de cor.

## Segurança e autorização

- Toda operação mutável baseada em cookie exige a mesma proteção de origem/CSRF aprovada no Slice 001; Origin ausente, nula ou divergente é rejeitada antes de alterar Product, contexto ou entitlement.
- Usuário e Tenant/Workspace são derivados da sessão server-side em cada request protegido.
- `tenant_id`, plano, limite, período, contadores e versões de autorização enviados pelo cliente não são autoridade.
- Product e contexto são sempre consultados e persistidos dentro do Tenant resolvido.
- Identificadores de Product e chaves de idempotência não carregam segredo ou escopo confiável do cliente.
- URL e conteúdo externo devem respeitar os limites de tamanho, tempo, redirecionamento, tipo e rede desta SPEC e do ADR-008.
- Nenhuma credencial de marketplace ou segredo interno é enviado ao enriquecimento de URL.
- Logs e respostas de erro não registram cookies, tokens, segredos, IDs de sessão ou payloads de outro Tenant.
- Não há colaboração, RBAC ou troca de Tenant neste slice.

## Critérios de aceite verificáveis

1. Uma pessoa autenticada consegue abrir `Adicionar produto` e chegar à criação de Product.
2. Nome e descrição válidos, com chave de idempotência válida, criam um Product ativo no Workspace da sessão.
3. Um Product pode ser criado com os campos opcionais ausentes e posteriormente completado.
4. Categoria, preço BRL, características, referências de imagens, observações e URL opcionais são preservados quando válidos.
5. O contexto estratégico informado é persistido em `pt-BR` e permanece ligado ao Product correto.
6. Reabrir e salvar o mesmo Product atualiza o registro sem criar cópia silenciosa; versão obsoleta retorna conflito e preserva a edição mais recente.
7. Dois Products distintos podem existir no mesmo Workspace enquanto o entitlement default e a configuração server-side permitirem.
8. Products de outro Tenant não podem ser lidos ou alterados por `tenant_id` ou identificador manipulável; a resposta é `404` uniforme, não revela existência e os identificadores de Product são UUID v4 ou equivalente com pelo menos 122 bits de entropia.
9. O limite de Products ativos é aplicado server-side; duas criações concorrentes no limite deixam no máximo a capacidade configurada e a perdedora não cria nem consome uso parcial.
10. Entitlement default é criado de modo idempotente para Tenant; configuração ausente ou inválida impede ativação sem fallback do cliente.
11. Tenant A não consegue usar `tenant_id`, Product ID, plano, limite ou contador de Tenant B para ler, alterar ou consumir capacidade; a tentativa falha sem efeito em B, e a capacidade de B permanece inalterada.
12. Dentro da retenção de 24 horas, chave de idempotência repetida com o mesmo payload normalizado retorna o mesmo Product; a mesma chave com payload normalizado diferente falha sem nova mutação; após expiração a mesma chave inicia obrigatoriamente nova intenção e retorna novo Product sem alterar o anterior; nomes e URLs iguais com chaves diferentes continuam podendo representar Products distintos.
13. URL inválida, bloqueada, indisponível, com redirecionamento proibido, destino privado, MIME não suportado ou conteúdo incompleto não impede salvar os dados manuais; fatos manuais permanecem inalterados e o estado não bloqueante é comunicado.
14. O fluxo não implementa scraping complexo, login ou conexão com TikTok/TikTok Shop, importação em lote, Strategy, Plan, Content, Generation ou Production.
15. Sessão ausente, expirada ou revogada impede criação, leitura e atualização e retorna ao acesso sem revelar dados.
16. Mutação com Origin ausente, nula ou divergente é rejeitada antes de alterar Product, contexto ou entitlement.
17. Dados inválidos exibem mensagens associadas, focam o primeiro campo inválido e não persistem estado parcial.
18. O fluxo de salvar comunica loading, sucesso, erro, conflito e retry sem submissão duplicada e preserva os valores digitados.
19. O fluxo é utilizável em mobile, tablet e desktop conforme a matriz responsiva desta SPEC, com foco-visible, teclado, mensagens associadas, alvos de toque de pelo menos `44×44px` e estados independentes de cor.
20. Depois de salvar nome, descrição e o registro de contexto `pt-BR` — mesmo com campos opcionais de contexto vazios — o Product exibe somente o estado informativo `Produto pronto para Strategy`; nenhuma Strategy é criada ou iniciada neste slice.
