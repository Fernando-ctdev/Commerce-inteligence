# SPEC — Slice 002: Importação de Product via Browser com confirmação

## User Outcome

O creator consegue colar uma URL do TikTok Shop, reutilizar ou criar um browser profile isolado, autenticar manualmente quando necessário, revisar os fatos extraídos e confirmar um Product ativo. Se a importação falhar ou não for desejada, consegue criar o Product pelo fallback manual mínimo.

## Contexto

Este slice sucede o Workspace pessoal do Slice 001 e entrega o Product factual que inicia o core loop. O novo PRD de Importação define Browser Service + Chromium + Browser Profile + Browser Harness como o caminho principal.

A aplicação descobre fatos. O creator confirma. A Commerce Intelligence Engine descobre estratégia posteriormente. O cadastro não solicita público, dores, desejos, objetivo, estilo, mercado, posicionamento ou qualquer outro campo estratégico.

A sessão autenticada fica no profile persistente do Chromium. A aplicação principal guarda somente a associação server-side ao profile e o estado operacional necessário; não coleta nem manipula senha, cookie ou token do TikTok.

A importação externa sempre produz primeiro um `ProductCandidate`. Candidate é um rascunho não confiável e não ativa Product. Somente confirmação humana, com os fatos revisados, cria o Product ativo.

## Gate obrigatório de infraestrutura

Antes de declarar o slice pronto, uma POC isolada e reproduzível deve comprovar:

1. Browser Harness instalado, versionado e executável no ambiente responsável pela automação.
2. Browser Service criando um profile persistente isolado por usuário/Tenant.
3. Chromium abrindo uma URL real do TikTok Shop no profile.
4. Login manual do creator dentro do browser, sem senha/cookie/token passados à aplicação.
5. Encerramento e reabertura do Chromium reutilizando a sessão do profile.
6. Browser Harness inspecionando e controlando a página.
7. Product Extraction Agent extraindo um produto real e produzindo Candidate revisável.
8. Backup/restauração protegidos e testados em cópia isolada, com binding ao Tenant, retenção/deleção definida e revogação do acesso ao profile no desprovisionamento; sem esse gate, não aceitar produção.

Se o gate falhar, o fluxo deve comunicar a falha e oferecer fallback manual. Não inventar uma integração de API, OAuth ou scraper alternativo para contornar o gate.

## In Scope

- Abrir `Adicionar produto` a partir de Hoje/Produtos.
- Aceitar URL `http`/`https` do TikTok Shop como entrada principal, sem credenciais embutidas e dentro do limite de tamanho vigente do produto.
- Delegar inspeção e interação ao Browser Service através do contrato que ele expõe sobre o Browser Harness, priorizando Accessibility Tree, DOM/CDP, Structured Data e Network.
- Pausar automação quando o TikTok exigir `LOGIN_REQUIRED`, `CAPTCHA_REQUIRED`, `2FA_REQUIRED` ou `USER_INTERACTION_REQUIRED`; QR Code é uma forma de `LOGIN_REQUIRED`.
- Entregar browser interativo para o creator resolver login, QR Code, CAPTCHA, 2FA ou confirmação humana.
- Detectar conclusão da intervenção e retomar a extração sem exigir nova URL.
- Executar Product Extraction Agent somente nas áreas necessárias para entender o produto aberto; o Agent não acessa Harness/CDP diretamente.
- Produzir Candidate com o contrato factual:

```ts
interface ProductCandidate {
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  price?: { amount: number; currency: string };
  features: string[];
  images: string[];
  seller?: string;
  variants?: string[];
  sourceUrl: string;
}
```

`variants` é uma extensão factual opcional do contrato mínimo do PRD para cobrir variantes relevantes quando a página as expuser; ausência permanece válida e não é inventada.

- Preservar origem, lacunas, estado e instante da tentativa junto do Candidate, sem transformar metadados em fatos inventados.
- Exibir preview factual e permitir confirmar sem editar ou editar nome, descrição, categoria, marca, preço/moeda, características, variantes e imagens antes da confirmação; seller fica visível como fato de origem e pode ser corrigido quando a UI oferecer esse campo factual.
- Criar Product ativo no Tenant da sessão após confirmação humana.
- Preservar correções confirmadas, fonte e proveniência; nova extração não sobrescreve correção silenciosamente.
- Detectar Product já confirmado para o mesmo Tenant e origem/identidade comprovada, orientando `Abrir produto` sem duplicar.
- Oferecer `Adicionar manualmente` a qualquer momento em que a importação falhe, exija interação não concluída ou não seja desejada.
- No fallback manual, exigir nome e descrição; aceitar categoria, preço, características, imagens, URL e observações opcionais.
- Aplicar limite server-side de Products ativos e isolamento por Tenant.
- Encaminhar Product confirmado para a próxima ação do Slice 003 sem iniciar Strategy, Plan, Content ou Generation.

## Out of Scope

- TikTok OAuth, TikTok Shop API, OAuth callback, scopes, Connection ou armazenamento de tokens.
- Receber, copiar ou manipular senha, cookie, session ID, QR Code ou token do TikTok.
- Automatizar CAPTCHA, senha, QR Code, 2FA ou confirmação humana.
- Scraping universal, crawler, navegação fora do produto ou nova engine genérica de browser automation.
- Product Extraction Agent gerar Strategy, público, dores, desejos, objeções, benefícios, argumentos, posicionamento, ângulos, hooks ou scripts.
- Strategy, análise comercial, Plan, Content, Generation, Production ou integração com Commerce Intelligence.
- Publicação, agendamento, analytics, vendas, pedidos, sincronização contínua, catálogo de seller, campanhas ou outros marketplaces.
- Download, upload, processamento ou armazenamento próprio obrigatório das imagens.
- Importação em lote ou atualização automática posterior de preço/descrição.

## Comportamentos

### Entrada e abertura do browser

1. Pessoa autenticada escolhe `Adicionar produto`.
2. A interface mostra URL como ação principal e `Adicionar manualmente` como fallback visível.
3. URL inválida é rejeitada antes de iniciar Chromium; a mensagem fica associada ao campo e preserva os valores válidos.
4. Para URL válida, o Browser Service resolve o Tenant da sessão, cria ou reutiliza o profile correto e abre a página.
5. Enquanto o browser está abrindo ou extraindo, a intenção permanece preservada e o duplo acionamento é impedido.
6. O Browser Service não expõe o filesystem, cookies, tokens, CDP secret ou conteúdo bruto do profile à UI.

### Human-in-the-loop

1. Se a página estiver acessível e a sessão válida, a extração continua sem exibir browser interativo.
2. Se houver bloqueio humano, o estado informa a ação necessária e o browser interativo é exibido com nome acessível, foco inicial no contexto da ação e foco de retorno ao gatilho após fechar/retomar.
3. O creator resolve o bloqueio no próprio browser. A aplicação não automatiza senha, CAPTCHA, QR Code, 2FA ou confirmação solicitada pelo TikTok.
4. Cada estado de bloqueio oferece `Cancelar análise`; cancelar preserva URL, intenção e profile, transita para `CANCELLED` e mantém `Tentar novamente`/`Adicionar manualmente`.
5. `Retomar análise` só aparece depois de o Browser Service verificar a conclusão; o sistema retorna à extração e não reinicia a intenção.
6. Se a superfície interativa não puder ser fechada pelo runtime, `Cancelar análise` permanece disponível na superfície da aplicação e encerra a tentativa server-side sem exigir fechar Chromium manualmente.

### Extração e Candidate

1. O Product Extraction Agent solicita ao Browser Service observações e ações semanticamente necessárias; o Browser Service é o único dono do acesso ao Browser Harness/CDP. A prioridade é Accessibility Tree, depois DOM/CDP, Structured Data e Network.
2. O agente expande descrição, abre `Ver mais` ou navega em seções somente quando isso for necessário para os fatos do produto atual.
3. O agente não segue recomendações, busca outros produtos ou executa ações comerciais.
4. Fatos ausentes permanecem ausentes. Normalização pode limpar representação, mas não pode inventar preço, moeda, característica, seller, variante ou categoria.
5. Candidate `READY` mostra fatos encontrados, origem, lacunas e aviso de que ainda não são fatos confirmados. Quando faltarem fatos, `Editar candidate` é a ação para completar os campos permitidos.
6. Candidate estruturalmente inválido, expirado ou cuja origem não possa ser validada vai para `ERROR`, não pode ser confirmado e oferece retry/fallback. Candidate válido porém incompleto permanece `READY` somente para edição/confirmar após os campos mínimos serem satisfeitos.

### Revisão, edição e confirmação

1. Creator pode confirmar Candidate sem editar quando os fatos forem suficientes.
2. `Editar` permite corrigir nome, descrição, categoria, marca, seller, preço/moeda, características, variantes e imagens dentro das validações do Product; todo valor corrigido mantém a proveniência `creator-confirmed`.
3. A confirmação recarrega Candidate no servidor, verifica Tenant, estado e versão, valida os valores e somente então cria Product ativo.
4. Product guarda fatos confirmados, URL original, origem/proveniência e referências de imagens; não guarda dados internos do profile.
5. Product já existente para a mesma URL de origem canônica, normalizada pelo Browser Service e escopada ao Tenant, retorna orientação para abrir o existente; quando não houver identidade canônica comprovada, não declarar duplicação apenas por nome ou URL não normalizada. Retry não cria segundo Product.
6. Confirmar Product não executa Strategy nem cria contexto estratégico; a interface apenas oferece a próxima ação quando Slice 003 estiver disponível.

### Fallback manual

1. Creator pode escolher `Adicionar manualmente` antes ou depois de qualquer falha de importação.
2. Nome e descrição válidos criam Product ativo; categoria, preço, características, imagens, URL e observações são opcionais.
3. Fallback não solicita público, dores, desejos, objetivo, estilo, mercado, posicionamento ou qualquer decisão da Strategy.
4. Falha da importação não remove Product manual previamente confirmado nem destrói o profile persistente.

### Profile e encerramento

1. O profile é reutilizado para o mesmo Tenant/usuário e nunca compartilhado entre Tenants.
2. Encerrar Chromium libera o processo e preserva cookies, localStorage, IndexedDB e demais dados do profile no volume protegido.
3. Falha de encerramento é registrada de forma sanitizada e não transforma o profile em resposta da API.
4. Profile corrompido ou indisponível gera erro recuperável; não apagar automaticamente o único profile sem uma ação operacional explícita.

## Regras e invariantes

- Todo Candidate e Product pertence ao Tenant resolvido pela sessão.
- Candidate nunca é Product ativo sem confirmação humana.
- Browser profile é isolado por Tenant/usuário e tratado como credencial sensível.
- A aplicação guarda `browserProfileId`, não login, senha, cookie, token, session ID ou conteúdo integral do profile.
- Login, CAPTCHA, QR Code, 2FA e confirmação humana nunca são automatizados.
- ProductCandidate contém fatos descobertos e sua origem; lacunas não são preenchidas por inferência.
- Correção confirmada pelo creator prevalece sobre nova extração automática.
- Product Import não contém decisões estratégicas e não inicia Strategy.
- Browser Service é o único dono do lifecycle do Chromium e do acesso ao Browser Harness/CDP.
- O Product Extraction Agent não implementa capacidades genéricas já fornecidas pelo Harness.
- Product ativo usa limite server-side, sem confiar em Tenant, limite ou contador enviados pelo cliente.
- Product, Candidate, profile e browser interativo não atravessam Tenant.
- Falhas externas não removem Product manual confirmado nem invalidam o profile por padrão.

## Validações e erros

- URL ausente, inválida, não `http/https`, com credenciais ou acima do limite: erro associado e fallback manual.
- URL fora do TikTok Shop ou não reconhecida: erro recuperável, retry e `Adicionar manualmente`.
- Profile ausente/corrompido ou Chromium indisponível: estado de capacidade/infraestrutura, sem perda de Candidate ou Product manual.
- `LOGIN_REQUIRED`, `CAPTCHA_REQUIRED`, `2FA_REQUIRED` e `USER_INTERACTION_REQUIRED`: pausar, exibir browser interativo, oferecer `Cancelar análise` e orientar a próxima ação humana.
- Interação abandonada ou não concluída: `CANCELLED`, mantendo URL, intenção, chave de idempotência e profile para retry; oferecer fallback manual.
- Browser Harness indisponível ou POC não aprovada: não declarar importação bem-sucedida; fallback manual continua disponível.
- Página alterada, dados insuficientes, preço/moeda inválidos ou resposta externa inconsistente: Candidate válido e incompleto permanece em `READY` para edição; Candidate inválido/expirado vai para `ERROR` sem confirmar e oferece retry/fallback.
- Candidate inexistente, expirado, de outro Tenant ou com versão obsoleta: falha uniforme sem aceitar snapshot do cliente.
- Nome manual: Unicode aparado entre 1 e 200 caracteres.
- Descrição manual: Unicode aparado entre 1 e 5.000 caracteres.
- Categoria: opcional até 120 caracteres; características e variantes até 20 itens de 300 caracteres; imagens até 10 URLs `http/https` de 2.048 caracteres; observações até 5.000 caracteres.
- Preço: finito, não negativo, em moeda informada quando existente e com no máximo duas casas; sem arredondamento silencioso.
- Retry da mesma intenção devolve o estado original; chave com payload diferente falha sem nova mutação.
- Product fora do Tenant retorna `404` uniforme, sem enumeração.
- Origin ausente/nula/divergente em mutações é rejeitada pela proteção existente do Slice 001.
- Nenhuma resposta ou log expõe senha, cookie, token, session ID, CDP secret, profile bruto, erro cru do TikTok ou dado de outro Tenant.

## Estados de UX relevantes

- **IDLE:** URL e `Analisar produto`; `Adicionar manualmente` visível.
- **OPENING:** URL preservada, `Abrindo TikTok...`, `aria-busy` e `role=status`; `Cancelar análise` sempre disponível na aplicação e ação duplicada bloqueada. Se Chromium não puder ser encerrado imediatamente, a aplicação confirma `CANCELLED` e informa que o encerramento será concluído pelo Browser Service.
- **LOGIN_REQUIRED:** inclui QR Code; `Faça login no TikTok nesta janela para continuar`; browser interativo visível, com nome acessível, foco de entrada no contexto e foco de retorno ao gatilho.
- **CAPTCHA_REQUIRED:** `Conclua a verificação no TikTok para continuar`; `Cancelar análise` disponível; nenhum bypass oferecido.
- **2FA_REQUIRED:** `Conclua a confirmação em duas etapas no TikTok`; `Cancelar análise` disponível.
- **USER_INTERACTION_REQUIRED:** `Conclua a confirmação solicitada no TikTok`; `Cancelar análise` disponível.
- **PAUSED:** automação suspensa aguardando interação ou retomada; URL, intenção e profile preservados; `Retomar análise` só após verificação do Browser Service.
- **CANCELLED:** creator encerrou a tentativa; URL, intenção, chave e profile permanecem para retry; ações `Tentar novamente` e `Adicionar manualmente`.
- **EXTRACTING:** `Analisando produto...`, `aria-busy` e `role=status`; detalhes internos do Harness ficam ocultos e timeout/error mantém retry/fallback.
- **READY:** Candidate com fatos, origem, lacunas, edição e `Confirmar produto`; Candidate incompleto não confirma até os campos mínimos serem válidos.
- **ERROR:** mensagem junto do campo/região que falhou, `role=alert`, foco no primeiro erro, retry quando aplicável e `Adicionar manualmente`; Candidate inválido/expirado não mostra `Confirmar`.
- **CONFIRMING:** valores preservados, ação bloqueada, `aria-busy` e retorno do foco ao gatilho após confirmação/erro.
- **CONFIRMED:** Product ativo, origem preservada e nenhuma Strategy executada. Oferecer ação para o Slice 003 somente quando ele estiver disponível; caso contrário, `Abrir produto`/retornar a Products, sem CTA desabilitado ou enganoso.
- **DUPLICATE:** `Você já adicionou este produto` e `Abrir produto`.
- **PROFILE_UNAVAILABLE:** browser/profile indisponível, `Tentar novamente` e fallback manual sem expor detalhes sensíveis.
- **LIMIT:** capacidade de Products indisponível; preservar URL/Candidate, permitir revisar Products existentes ou `Tentar novamente` e não sugerir preço/upgrade não definido. Fallback manual só confirma quando a capacidade estiver disponível.

Quando Candidate, confirmação, fallback ou browser interativo abrirem modal/sheet, a superfície deve ter nome acessível, foco de entrada, trapping de Tab, fechamento com `Escape` sem mutar, retorno de foco ao gatilho e ação primária alcançável. O browser interativo pode ser modal ou não-modal, mas deve comunicar claramente seu contexto, como retornar à aplicação e como cancelar. A capacidade é a mesma em mobile, tablet e desktop: mobile pode usar tela cheia em uma coluna com safe area; tablet mantém rail acessível com nomes completos; desktop não adiciona ação exclusiva.

Composição obrigatória conforme `DESIGN.md`: mobile usa `--safe-bottom: env(safe-area-inset-bottom, 0px)`, navegação inferior de `64px + --safe-bottom`, `padding-block-end` e `scroll-padding-block-end: calc(64px + var(--safe-bottom) + 16px)`; tablet usa rail de `72px`, nomes acessíveis, tooltip ao foco e grid de oito colunas; desktop usa sidebar de `240px`, toolbar de `56px`, padding lateral de `32px` e coluna limitada a `1440px` a partir de `1440px`. Nenhuma capacidade de importação, interação, confirmação, edição ou fallback é exclusiva do desktop; labels persistentes, foco, teclado, `aria-invalid`, `aria-describedby`, `role=alert/status`, foco no primeiro erro, reduced motion, contraste, `aria-busy` e alvos mínimos de `44×44px` são obrigatórios.

## Segurança e autorização

- Sessão server-side resolve usuário e Tenant em toda operação; `tenant_id`, profile ID, Product ID, URL canônica, limite e estado enviados pelo cliente não concedem autorização.
- A chave de idempotência é escopada ao Tenant resolvido e comparada ao hash do payload canônico; replay cross-tenant nunca retorna estado nem revela conflito de outro Tenant.
- URLs aceitas usam allowlist server-side dos hosts/origens TikTok Shop suportados, rejeitam userinfo e portas não permitidas, revalidam cada redirect e a origem final, e bloqueiam loopback, rede privada, link-local, multicast, metadata e resolução DNS para faixas reservadas.
- O Browser Service limita popups, navegação e egress às origens necessárias; conteúdo de página, DOM, Accessibility Tree e Network são dados não confiáveis e o Agent usa uma allowlist de ações de extração sem executar instruções da página.
- Browser profile, Chromium, CDP e operações de interação são escopados ao Tenant; não permitir path traversal, profile compartilhado ou acesso cross-tenant.
- A superfície interativa não expõe porta/CDP bruto: o Browser Service entrega uma sessão vinculada a Tenant + operação, com referência não reutilizável, expiração e revogação ao cancelar, concluir, sair ou perder autorização.
- O profile persistente recebe proteção operacional de filesystem, volume, processos, backup, restauração e retenção equivalente a uma credencial sensível.
- Antes de criar um novo profile, a aplicação executa preflight de capacidade server-side; profile já existente pode ser reutilizado. A confirmação repete a verificação atomicamente: corrida que perde não cria Product ou uso parcial, e um profile já aberto pode permanecer para reutilização.
- Sucesso, erro, cancelamento, timeout e crash executam cleanup do Browser Service, detectam processos órfãos e verificam que a sessão/CDP não continua acessível; nunca encerram processo/profile de outro Tenant.
- Nunca enviar cookies, tokens ou conteúdo do profile ao frontend, Product Import Agent, logs ou provider textual.
- ProductCandidate, URL, redirects, página, Accessibility Tree, DOM, Network e saída do Agent são não confiáveis; validar schema, tamanho, origem, URLs de imagem, preço e cardinalidade.
- Chamadas ao browser ocorrem fora da transação de confirmação; confirmação recarrega Candidate no servidor e grava somente fatos validados.
- Erros e métricas são sanitizados e não registram conteúdo de sessão, segredo, resposta bruta ou dados cross-tenant.
- Não implementar autenticação própria do TikTok nem aceitar credenciais fornecidas pelo usuário.

## Estratégia de testes

Testar contratos observáveis e invariantes, não seletores específicos, nomes de classes ou detalhes de Prisma:

- Gate da POC: Browser Harness disponível; profile persiste após encerrar/reabrir; login manual e extração real funcionam sem secrets versionados.
- Profile: criação, reutilização, isolamento entre Tenants, encerramento sem apagar dados e recuperação de profile indisponível.
- URL: URL válida, inválida, com credencial, não TikTok, tracking e redirect conforme limites reais do Browser Service; redirects para rede reservada são rejeitados.
- Human-in-the-loop: cada estado de login/CAPTCHA/2FA/interação pausa, exibe browser, não automatiza desafio e retoma após conclusão; abandono preserva fallback.
- Extraction Agent: produto completo, descrição expandida, facts ausentes, página alterada, bloqueio, erro do Harness, prompt injection na página e ausência de invenção factual.
- Candidate: persistência server-side, versionamento, lacunas, edição, reload no confirm, confirmação única e proveniência.
- Product: confirmação sem edição, correção prevalente, fallback manual, Product duplicado, limite concorrente e prontidão sem contexto estratégico.
- Segurança: nenhum token/cookie/profile bruto em resposta/log/frontend; Tenant B não abre profile, Candidate ou Product de Tenant A; sessão interativa expira/revoga e cleanup não deixa CDP órfão.
- Backup/restore: profile cifrado/protegido, restauração em cópia isolada mantém Tenant binding, retenção/deleção remove acesso no prazo e desprovisionamento revoga profile; falha bloqueia aceitação de produção.
- HTTP/UX: estados, mensagens, `aria-busy`, foco, teclado, retry, mobile/tablet/desktop; ação estratégica não aparece como campo do cadastro.
- Regressão: Slice 001 continua autenticando; Slice 003 inicia somente para Product ativo com fatos confirmados e não exige `ProductContext`.

## Critérios de aceite verificáveis

1. Browser Harness está instalado/versionado e a POC comprova profile persistente, login manual, reabertura autenticada, controle/inspeção e extração de um produto real.
2. Creator autenticado abre `Adicionar produto`, vê URL como ação principal e `Adicionar manualmente` como fallback.
3. URL válida abre Chromium pelo Browser Service com profile isolado do Tenant; URL inválida não inicia browser.
4. Profile reutilizado mantém sessão após encerramento/reabertura, sem a aplicação guardar login, senha, cookie ou token.
5. Quando TikTok exige login, CAPTCHA, QR Code, 2FA ou confirmação, automação pausa, browser interativo é exibido e o creator resolve a etapa manualmente.
6. Após a intervenção, Product Extraction Agent usa Browser Service/Harness e produz Candidate factual com nome, URL original, features, variantes relevantes quando disponíveis e campos opcionais disponíveis.
7. Candidate exibe fatos, origem, lacunas e aviso de não confirmação; nenhum Candidate vira Product ativo antes de confirmação.
8. Creator confirma ou edita nome, descrição, categoria, marca, seller, preço/moeda, características, variantes e imagens permitidos; Product ativo preserva correções, proveniência, URL, variantes e Tenant.
9. Falha de browser, Harness, página, extração ou interação comunica erro recuperável e oferece retry/fallback sem apagar profile ou Product manual.
10. Product já confirmado para a mesma URL canônica comprovada é detectado e aberto sem duplicação acidental.
11. Fallback manual cria Product ativo com nome e descrição válidos, aceita opcionais e não solicita campos estratégicos.
12. Limite server-side de Products ativos é aplicado sob concorrência sem Product parcial e sem destruir profile.
13. Retry idêntico é idempotente; payload diferente conflita sem nova mutação.
14. Tenant A não acessa profile, browser, Candidate ou Product de Tenant B; respostas fora do escopo são uniformes.
15. Nenhuma resposta, log ou frontend contém senha, cookie, token, CDP secret, profile bruto ou erro externo não sanitizado.
16. Estados IDLE, OPENING, LOGIN_REQUIRED, CAPTCHA_REQUIRED, 2FA_REQUIRED, USER_INTERACTION_REQUIRED, PAUSED, CANCELLED, EXTRACTING, READY e ERROR comunicam a próxima ação, preservam contexto e expõem retry/cancelamento/fallback conforme o caso.
17. Fluxo é utilizável em mobile, tablet e desktop conforme `DESIGN.md`, com foco, teclado, contraste, reduced motion e alvos de `44×44px`.
18. Product confirmado encaminha para Slice 003 somente quando disponível, mas não cria Strategy, Plan, Content, Generation ou contexto estratégico.
19. Não existe TikTok OAuth, TikTok Shop API, login por senha/cookies, automação de desafio humano, scraping universal, sincronização contínua, publicação ou integração fora do Browser Service.
20. O profile persistente possui backup/restauração protegidos e testados em cópia isolada, binding ao Tenant, retenção/deleção definida e revogação no desprovisionamento; sem essa evidência o Slice 002 não é aceito para produção.
