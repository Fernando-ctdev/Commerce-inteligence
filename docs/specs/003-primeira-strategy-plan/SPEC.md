# SPEC — Slice 003: Primeira Strategy e primeiro Plan de Content

## User Outcome

O creator consegue escolher a quantidade de Contents e informar um objetivo opcional para um Product ativo confirmado; depois acompanha uma geração e recebe uma Strategy comercial, um Plan e exatamente a quantidade solicitada de Contents graváveis.

## Contexto

Este slice sucede o Slice 002. O Product pode ter sido confirmado a partir de um `ProductCandidate` extraído pelo Browser Service ou criado pelo fallback manual. A origem não altera a qualidade nem o contrato da geração: Generation recebe somente fatos confirmados, proveniência autorizada e o pedido atual.

O Product entregue pelo Slice 002 tem um registro server-side autoritativo de confirmação: `sourceKind` (`browser` ou `manual`), `sourceUrl` quando houver, `factsVersion`, `confirmedAt` e proveniência por fato/origem. Generation valida esses campos no módulo Product, congela-os no snapshot e não aceita provenance, Tenant ou Product facts enviados pelo cliente. `browserProfileId`, cookies e demais dados da sessão nunca entram no snapshot.

Product pronto para Strategy não significa que um formulário de contexto estratégico foi preenchido. O servidor deve verificar Product ativo, Tenant correto, fatos confirmados suficientes para compreender o que o produto é, faz e para que serve, e origem/proveniência válida. `ProductContext` estratégico não é pré-condição e não deve ser criado para liberar a geração.

A primeira operação entrega Strategy, Plan e Contents juntos. A interface pode revelar o resultado progressivamente, mas não inventa uma aprovação intermediária de Strategy. A primeira geração não consulta histórico de Contents; memória, lacunas entre gerações e novo lote pertencem ao Slice 008.

Generation é assíncrona e durável. Generation coordena execução; Strategy toma decisões; Plan organiza distribuição; Content representa item gravável; Entitlements limita capacidade. Nenhum deles substitui Product Import ou Browser Service.

A engine somente pode ser aceita após existir um produto-exemplo gold-standard aprovado conforme ADR-002, contendo entrada factual, pedido, Strategy, Plan, Contents anotados e critérios de variedade/gravabilidade. A aprovação precisa estar registrada fora do código com `artifactId`, hash imutável, versão, owner e aprovador; um booleano enviado pelo caller/worker não pode liberar o gate. Sem esse artefato, contratos e fluxos duráveis podem ser preparados, mas a aceitação da engine permanece bloqueada.

## In Scope

- Iniciar a primeira geração para Product ativo, confirmado, autorizado e pronto para Strategy.
- Informar quantidade inteira de Contents e objetivo/preferência opcional, sem persistir o objetivo silenciosamente no Product.
- Gerar chave de idempotência por intenção antes do primeiro POST e reutilizá-la em replay de rede ou concorrência.
- Congelar no servidor fatos confirmados, proveniência, pedido, locale operacional e histórico vazio em `GenerationInput v1`.
- Criar `generation_run` durável e reserva de `generated_contents_month` antes de enfileirar.
- Expor `queued`, `running`, `succeeded`, `failed` e `cancelled` com próxima ação compreensível.
- Permitir cancelar execução cancelável e liberar a reserva correspondente.
- Permitir `Tentar novamente` após falha/cancelamento criando nova run vinculada, sem alterar a run terminal original.
- Entregar uma análise comercial/Strategy com problema, benefícios, diferenciais, características relevantes, casos de uso, contexto de uso, gatilhos, barreiras, riscos e argumentos.
- Entregar coleções estratégicas de públicos, dores, desejos, benefícios, objeções quando aplicáveis e ângulos relevantes.
- Entregar um Plan único cuja distribuição seja consequência da Strategy e do pedido, não tabela fixa.
- Criar exatamente N Contents estruturalmente graváveis, com público, dor, desejo/benefício, ângulo, hook, estrutura, script, cena e CTA; objeção quando aplicável.
- Persistir Strategy, Plan, Content, Generation e proveniência ligados ao Product e Tenant de origem.
- Exibir explicação estratégica curta e proveniência por progressive disclosure sem expor prompts, segredos ou payload bruto.
- Confirmar exatamente N unidades em sucesso e liberar a reserva em falha/cancelamento.
- Usar a mesma inteligência em qualquer capacidade autorizada; Entitlements limita quantidade, não qualidade.

## Out of Scope

- Browser Service, Browser Harness, Chromium, browser profile, login TikTok, CAPTCHA, QR Code, 2FA ou importação de Product.
- TikTok OAuth, TikTok Shop API, publicação, agendamento, analytics externo, vendas, pedidos ou outros marketplaces.
- Edição manual, feedback, exclusão, duplicação ou regeneração de Content/partes; pertencem aos Slices 004/005.
- Novo lote com memória, cobertura histórica, lacunas entre gerações ou controle de variedade entre execuções; pertence ao Slice 008.
- Production queue, lotes de gravação, estados operacionais de Production e modo de gravação; pertencem aos Slices 006/007.
- Geração de vídeo, imagem, áudio, voice-over, upload ou armazenamento de mídia.
- Embeddings, banco vetorial, deduplicação semântica sofisticada, LLM-as-judge ou aprendizado por performance.
- Billing, troca de plano, upgrade/downgrade, colaboração, membros, RBAC, SSO ou provider de identidade.
- Escolha de provider textual, modelo, prompt, registry, plugin ou serviço separado.
- Criar ProductContext estratégico apenas para satisfazer prontidão.

## Comportamentos

### Product pronto e pedido

1. A aplicação resolve sessão e Tenant server-side.
2. A solicitação é aceita somente para Product ativo do Tenant, com `sourceKind`, versão de fatos, instante de confirmação e proveniência válidos, além de fatos suficientes, sem dependência de ProductContext.
3. Product pronto exige nome confirmado e pelo menos um conjunto factual que explique o produto: descrição não vazia, ou categoria/características confirmadas suficientes. Product manual com nome e descrição sempre satisfaz o gate; Product importado com lacunas recebe um resumo das lacunas e `Voltar para revisar o produto`.
4. Enquanto o gate não for satisfeito, o servidor não cria formulário executável, run ou reserva; a UI mostra os fatos confirmados, o que falta e uma ação para revisar o Product.
5. Quantidade é inteira entre 1 e 50. Objetivo ausente é válido; quando informado, é texto não vazio após normalização e respeita o limite textual canônico da solicitação.
6. O cliente envia somente Product ID, quantidade, objetivo/preferência e headers de intenção. Snapshot, Tenant, quota, plano, limite, provenance e autorização não vêm do cliente como autoridade.
7. O módulo Product recarrega os fatos e metadados de confirmação no servidor; Generation calcula `intentFingerprint` e `inputSnapshotHash` e congela Product/fatos/proveniência, pedido, locale `pt-BR` e `history_snapshot` vazio no `GenerationInput v1`.
No `GenerationInput v1`, `strategy_context` é explícito e nullable: `audience`, `style`, `creator_presence`, `experience`, `constraints`, `market` e `notes` ficam `null` quando não forem informados pelo pedido autorizado. `objective` permanece em `request.objective` e não é copiado para ProductContext; o primeiro slice não cria contexto estratégico para preencher esses campos.
8. Product alterado depois do início não muda a run já criada.
9. Com capacidade disponível, uma transação curta cria intenção, reserva e `generation_run` em `queued` de forma atômica.
10. Replay com mesma chave e payload normalizado devolve a mesma run e estado; mesma chave com payload diferente falha sem mutação.
11. Depois que uma primeira geração terminou em `succeeded`, não existe nova primeira geração para o Product neste slice. Novo lote pertence ao Slice 008.

### Estados e execução durável

- **queued:** pedido aceito e aguardando worker; não há Content parcial.
- **running:** worker executando; não há percentual inventado nem Content parcial.
- **succeeded:** Strategy, Plan e exatamente N Contents foram validados e persistidos com proveniência e uso confirmado.
- **failed:** não há resultado publicável; erro sanitizado, pedido preservado e retry disponível.
- **cancelled:** execução cancelada ou encerrada pela política operacional; não há resultado parcial e retry disponível.

`queued` e `running` são canceláveis. Cancelamento exige autorização, confirmação humana e transição condicional. Em corrida entre cancelamento e finalização, apenas a primeira transição terminal vence; não desfazer sucesso, ressuscitar cancelamento ou reconciliar reserva duas vezes.

O worker executa provider fora de transação. Toda finalização usa comparação-e-troca condicional por `generation_run.id`, tentativa e `leaseToken` vigente; tentativa obsoleta não grava resultado, não confirma/libera uso e não altera estado. O mesmo `generation_run.id` é a chave idempotente única da fila, reserva e finalização; a reserva é única por run e mantém quantidade, período, estado, motivo e timestamps auditáveis.

Retry operacional do worker reutiliza a mesma `generation_run.id`, com tentativa/lease novos e política limitada. `Tentar novamente` do creator após `failed`/`cancelled` recarrega a run terminal original no Tenant correto, copia seu `inputSnapshot` e `inputSnapshotHash` imutáveis, cria nova chave/run/reserva e nunca aceita snapshot enviado pelo cliente. A run terminal original permanece imutável.

### Strategy e análise

Uma execução bem-sucedida entrega uma Strategy/estrutura de análise única para o Product. Ela interpreta os fatos confirmados, o objetivo/preferência e o locale; não consulta browser, credenciais ou dados de outro Tenant.

A análise identifica, quando aplicável, problema, benefícios funcionais/emocionais, diferenciais, características relevantes, casos de uso, contexto de utilização, gatilhos de compra, barreiras, riscos de comunicação e argumentos. A Strategy seleciona públicos, dores, desejos, benefícios, objeções e ângulos pela oportunidade comercial, não para preencher quantidade artificialmente.

### Plan

A saída contém um Plan único associado à Strategy, run e Product. Sua distribuição é explicável pela Strategy e pelo pedido, sem tabela fixa ou categorias aleatórias; cada item tem quantidade inteira positiva e a soma das quantidades é exatamente N. O primeiro Plan não usa histórico de Contents e não cria regra de variedade entre gerações.

### Contents graváveis

Para quantidade N, a saída contém exatamente N Contents. Cada Content contém:

- público-alvo;
- dor;
- desejo ou benefício;
- ângulo;
- hook com função estratégica;
- estrutura narrativa adequada;
- script gravável, com fala e ações/cenas quando aplicável;
- pelo menos uma cena;
- CTA;
- explicação curta e proveniência.

Objeção aparece quando aplicável. Cada referência de dimensão aponta para item existente na própria Strategy. Hook normalizado não pode duplicar outro hook na mesma execução, inclusive por diferença somente de formatação. Script deve orientar gravação e demonstração, nunca ser artigo.

Cada Strategy, Plan, Content e run preserva `generation_run_id`, Product/Strategy de origem, hash do snapshot, versão do contrato/taxonomia, engine, provider/modelo quando houver e instante da geração. A proveniência de ownership não é aceita da resposta externa: o adapter devolve somente conteúdo/decisões; servidor deriva e grava Tenant, Product, Strategy, Plan e `generation_run_id` do snapshot e da run com lease. Mismatch falha a execução.

Nenhuma resposta parcial é sucesso. Strategy, Plan e todos os N Contents são persistidos na mesma finalização transacional; uma saída inválida falha a execução inteira.

### Entitlements e uso

1. Entitlement é resolvido exclusivamente no servidor por Tenant.
2. A capacidade mensal é compartilhada entre Products do Tenant.
3. Quantidade acima da capacidade rejeita a solicitação inteira, sem run ativa, reserva parcial ou Content.
4. Reserva pertence ao mês UTC da criação da run; conclusão em mês seguinte não muda o período.
5. Sucesso confirma exatamente N unidades na mesma transação dos resultados.
6. Falha/cancelamento libera a reserva de forma idempotente.
7. Retry operacional, replay e concorrência usam `generation_run.id` e constraints únicas para não duplicar run, Content, confirmação ou uso.
8. Cada mudança de reserva registra estado, motivo e instante; reconciliação compara run terminal, resultados e reserva sem alterar run terminal.
9. Entitlement não decide Strategy, taxonomia, provider ou qualidade.
## Regras e invariantes

- Product, Generation, Strategy, Plan, Content e reserva pertencem ao mesmo Tenant e Product de origem.
- Product pronto é validado server-side por fatos confirmados e proveniência; ProductContext não é requisito.
- Uma execução bem-sucedida tem uma Strategy/análise, um Plan e exatamente N Contents.
- Coleções de públicos, dores, desejos, benefícios e ângulos têm entre 1 e 8 itens; objeções podem ser vazias e têm no máximo 8.
- Campos obrigatórios não são vazios; IDs são únicos na execução; referências são internas à Strategy da mesma saída.
- Hooks normalizados são únicos na execução; normalização não promete detectar toda paráfrase semântica.
- Snapshot, proveniência e run terminal são imutáveis; retry do creator cria nova run vinculada.
- Nenhum Content parcial aparece como sucesso.
- Browser, Product Import e dados externos não fazem parte da execução após Product confirmado.
- Provider textual, se houver, traduz saída por adapter e não define regras de domínio, quota ou autorização.
- Plan único e distribuição com quantidades positivas cuja soma é exatamente N.
- Gold-standard aprovado é pré-condição de aceitação da engine; a implementação lê a referência server-side com `artifactId`, hash, versão, owner e aprovador, e rejeita gate ausente, inválido ou divergente. Não usar fixture hipotética, score ou fallback como oráculo.
- Locale operacional é `pt-BR`; não criar infraestrutura de i18n neste slice.

## Validações e erros

- Sessão ausente, Product inexistente/inativo/não pronto/cross-tenant: rejeitar uniformemente, sem enumeração, run ou reserva; Product não pronto informa lacunas e `Voltar para revisar o produto`.
- Quantidade ausente, não inteira, menor que 1 ou maior que 50: erro associado sem mutação.
- Objetivo vazio ou inválido: erro associado sem mutação; ausência é válida.
- Idempotency-Key ausente, inválida ou conflitante: rejeitar; replay idêntico retorna run original.
- Entitlement/configuração server-side ausente ou inválida: estado `capacity_unavailable`, mensagem segura, campos preservados e `Tentar novamente`; não aceitar valores do cliente.
- Capacidade mensal insuficiente: estado `quota_insufficient`, explicar a capacidade compartilhada e oferecer `Ajustar quantidade`, preservando objetivo; não criar run/reserva parcial.
- Fila/worker temporariamente indisponível antes ou depois da criação da run: não simular sucesso; preservar a run se já criada, mostrar `Acompanhar geração`/`Tentar novamente` conforme o estado e não criar segunda run.
- Cancelamento em estado não cancelável: rejeitar sem alterar run/uso.
- Provider, timeout, worker, lease ou persistência: não publicar parcial; sanitizar erro; retry operacional somente dentro da política limitada.
- Lease expirado/job preso: invalidar tentativa antiga; reenfileirar com backoff ou marcar failed conforme política; tentativa antiga nunca finaliza.
- Saída inválida, cardinalidade, referência, campo, hook ou script não gravável: falhar execução inteira e liberar reserva.
- Falha de finalização/reconciliação: não declarar succeeded sem Strategy, Plan, N Contents, proveniência e uso consistentes.
- Sessão expirada, rede perdida ou resposta terminal ambígua: manter o pedido localmente, consultar o estado server-side ao retornar e nunca exibir cache antigo como sucesso atual.
- Mensagens/logs/respostas não expõem cookies, tokens, profile, prompts, payload bruto ou dados cross-tenant.

## Operação

- Worker usa fila PostgreSQL no mesmo repositório/deploy, com lease, retry limitado, backoff e recuperação de jobs presos.
- TTL de lease, máximo de tentativas, backoff e definição de job preso são configuração server-side fornecida pela operação; ausência bloqueia aceitação operacional.
- Health check do worker/fila expõe liveness e readiness sem executar trabalho.
- Operação mede idade da fila, duração, tentativas, taxa de erro, backlog e idade máxima; métricas não viram dashboard de produto.
- Backup PostgreSQL e teste periódico de restauração em cópia isolada devem preservar Tenant, Product, Generation, Strategy, Plan, Content, Entitlement e reservas; falhas são sinalizadas ao owner.
- O gate operacional e o gold-standard são verificações server-side auditáveis; nenhum caller pode marcar o gold-standard como aprovado por booleano ou escolher um artifactId não permitido.

## Estados de UX relevantes

- **Product não pronto:** mostrar fatos confirmados, resumo das lacunas e `Voltar para revisar o produto`; não renderizar formulário de geração executável.
- **Pronto para gerar:** Product, fatos/proveniência relevantes, quantidade, objetivo opcional e `Gerar estratégia e plano`.
- **Validando/solicitando:** preservar valores, focar primeiro erro, bloquear duplo acionamento, `aria-busy` no formulário e `role=status` com anúncio único.
- **Limite insuficiente / `quota_insufficient`:** explicar capacidade compartilhada, manter quantidade/objetivo e oferecer `Ajustar quantidade`; não sugerir upgrade, preço ou plano.
- **Capacidade indisponível / `capacity_unavailable`:** explicar indisponibilidade segura, manter valores e oferecer `Tentar novamente`; não confundir com quota insuficiente.
- **queued:** `Acompanhar geração` e `Cancelar geração`, sem Content parcial.
- **running:** atividade sem percentual inventado, `Acompanhar geração` e `Cancelar geração`.
- **succeeded:** mostrar no mobile, nesta ordem, próxima ação/estado → resumo da Strategy → Plan/distribuição → lista de Contents. Tablet e desktop podem aumentar densidade e colunas, mas não retirar nenhuma ação; scripts/cenas quebram linha e têm leitura completa sem truncamento destrutivo. `Ver conteúdos gerados` é leitura do resultado deste slice; edição/regeneração/novo lote ficam ausentes até seus slices.
- **failed/cancelled:** erro sanitizado junto do estado, Product/quantidade/objetivo preservados e `Tentar novamente`; cancelamento usa confirmação com foco no diálogo, trapping de Tab, `Escape` sem executar, `aria-busy` durante a ação, anúncio da transição e retorno do foco ao gatilho.
- **Polling/reconexão:** enquanto `queued`/`running`, consultar em intervalo operacional configurado; pausar ou sinalizar stale quando a aba estiver oculta/offline; retomar ao voltar/recuperar rede, anunciar somente mudanças de estado e nunca descartar uma run server-side.
- **Retry:** nova run vinculada em `queued`, sem alterar a run terminal de origem e com nova chave criada uma vez antes do primeiro POST.
- **Resultado incompleto:** nunca tratar como sucesso; `Acompanhar geração` consulta o servidor ou `Tentar novamente` quando terminal.

Progressive disclosure segue ação imediata → contexto operacional → resumo de Strategy → Plan/Contents → explicabilidade/proveniência. A proveniência abre em camada/section dedicada, com identificadores técnicos em fonte de código. A camada aberta persiste no mesmo Product/fluxo e reseta ao trocar Product, concluir, iniciar sessão ou sair. Disclosure nunca esconde erro, bloqueio, status ou ação necessária.

Formulário de quantidade/objetivo usa labels persistentes, `name`, `type=number`, `min=1`, `max=50`, `aria-describedby`, `aria-invalid`, erro associado e foco no primeiro erro. A página usa headings/landmarks e skip link; status e erro usam regiões anunciadas sem repetição. Controles primários e cancelamento têm alvo mínimo de `44×44px`.

Composição segue `DESIGN.md`: mobile completo em uma coluna com navegação inferior de `64px + --safe-bottom`, `--safe-bottom: env(safe-area-inset-bottom, 0px)`, `padding-block-end` e `scroll-padding-block-end: calc(64px + var(--safe-bottom) + 16px)`; tablet com rail de `72px` acessível e grid de oito colunas; desktop com sidebar de `240px`, toolbar de `56px`, padding lateral de `32px` e coluna `min(100%, 1440px)` a partir de `1440px`. Nenhuma capacidade exclusiva do desktop; foco, teclado, `aria-live`, `aria-busy`, reduced motion, contraste e alvos mínimos de `44×44px` são verificáveis em todos os breakpoints.

## Segurança e autorização

- Toda ação resolve sessão e Tenant server-side; IDs, quota, plano, snapshot e autorização enviados pelo cliente não são autoridade.
- Start, consulta, cancelamento, retry e resultado exigem escopo do Tenant correto; IDs não concedem acesso.
- Mutação baseada em cookie reutiliza Origin/CSRF dos Slices 001/002.
- Snapshot ao provider contém somente fatos confirmados e preferências autorizadas; nunca browser profile, cookie, token ou secret.
- Saída externa é não confiável: validar schema, tamanhos, cardinalidade, referências, unicidade e texto; ownership/proveniência de Tenant, Product, Strategy, Plan e `generation_run_id` é sempre derivado do snapshot/run com lease e mismatch falha.
- Finalização e qualquer transição terminal usam CAS condicional por `generation_run.id`, tentativa e `leaseToken`; a resposta obsoleta não persiste, confirma ou libera uso.
- Provider é chamado fora de transação; somente claim, cancelamento, retry, reconciliação e finalização permanecem em transações curtas.
- URL/página/Network do Product já foram validados no Slice 002; Generation não persiste nem registra parâmetros de URL que contenham credenciais.
- Logs estruturados usam allowlist de correlação segura, estado, tentativa, duração, classe de erro e métricas agregadas; redigem Product/objective text, URLs, prompts, output, cookies, tokens, profile e payload bruto sem exceção.
- Não acessar TikTok/TikTok Shop durante Generation; a origem já foi confirmada no Slice 002.

## Estratégia de testes

- Product readiness: Product importado pelo Browser ou manual, com fatos suficientes, inicia; ProductContext ausente não bloqueia; Product inativo/cross-tenant não inicia.
- Primeira geração válida: `queued → running → succeeded`, uma run, uma reserva, uma Strategy, um Plan e exatamente N Contents.
- Idempotência: replay/concor­rência da mesma chave devolve mesma run; chave com intenção diferente conflita.
- Retry creator: nova chave cria nova run vinculada; original terminal permanece imutável.
- Retry operacional: mesmo run ID, lease atual vence; tentativa antiga não persiste nem confirma uso.
- Quota: Products distintos do mesmo Tenant compartilham capacidade; Tenant separado não compartilha; corrida não ultrapassa limite.
- Cancelamento/fencing: cancel e finalização elegem uma única transição terminal e reconciliam uma vez.
- Lease/job preso: recuperação respeita política limitada e reserva não duplica.
- Saída completa: análise/Strategy, distribuição/Plan, N Contents, referências, hooks, cenas, CTA e proveniência válidos.
- Saída inválida: falha inteira, sem Strategy/Plan/Content apresentado como sucesso, erro sanitizado e reserva liberada.
- HTTP/segurança: sessão, Origin, 404 uniforme, ausência de secrets e isolamento cross-tenant.
- UX/E2E: quantidade, objetivo, limite, capacidade, todos os estados, retry/cancelamento, disclosure, foco, teclado, aria, mobile/tablet/desktop.
- Operação: health check, lease, backlog, métricas, backup/restore e reconciliação com relógio/configuração controlados.
- Gold-standard: referência server-side com artifactId/hash/version/owner/approver; comparar distribuição e gravabilidade somente com o artefato aprovado; sem ele, engine permanece bloqueada.

## Critérios de aceite verificáveis

1. Product ativo confirmado pelo Slice 002, importado ou manual, inicia Generation sem ProductContext estratégico.
2. Quantidade válida e objetivo opcional criam uma run durável `queued` e reservam capacidade antes da fila.
3. Product não pronto, Tenant incorreto, capacidade ausente/inválida ou quota insuficiente não cria run/reserva parcial.
4. Replay da mesma intenção devolve a mesma run; conflito não muta; duplo acionamento não duplica.
5. Estados queued/running/succeeded/failed/cancelled são coerentes, não mostram percentual inventado nem Content parcial.
6. Cancelamento, lease expirado, retry operacional e retry do creator respeitam fencing, imutabilidade e reconciliação única.
7. Sucesso persiste uma Strategy, um Plan e exatamente N Contents vinculados ao Product/Tenant.
8. Strategy cobre a análise comercial e dimensões relevantes; Plan tem distribuição explicável, sem tabela fixa, com quantidades positivas que somam exatamente N.
9. Cada Content tem dimensões, hook único normalizado, estrutura, script gravável, cena, CTA e explicação/proveniência.
10. Uso confirma exatamente N em sucesso e libera em falha/cancelamento no período UTC de criação.
11. A interface revela resultado progressivamente, preserva contexto/objetivo em erro e oferece próxima ação correta.
12. Nenhum browser, credencial, Product Import, edição, feedback, regeneração, novo lote, Production, mídia, publicação ou analytics externo é implementado neste slice.
13. Tenant isolation, ausência de secrets, Origin/CSRF, quota compartilhada e validação de saída são verificáveis.
14. Health/lease/backoff/recovery/backup têm configuração e owner operacional; sem os gates, aceitação fica bloqueada.
15. A engine só é declarada aceita após gold-standard aprovado; sem ele, manter o bloqueio explícito.
