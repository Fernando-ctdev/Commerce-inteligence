# Design — Browser Service POC

**Data:** 2026-08-25  
**Escopo:** POC isolada da infraestrutura de browser do Slice 002

## Objetivo

Provar localmente, via Docker Compose, o fluxo:

```text
Commerce API → Browser Service Python → Chromium → Browser Harness/CDP → TikTok Shop
                                               ↓
                                      login manual via noVNC
                                               ↓
                              profile persistente reutilizado
                                               ↓
                                      ProductCandidate factual
```

Esta etapa não implementa a UI/API completa do Product Import. O backend principal não instala Browser Harness e não manipula cookies, localStorage, IndexedDB, tokens ou senhas do TikTok.

## Decisão arquitetural

O Browser Service é um serviço Python isolado. Chromium roda no mesmo container do serviço, junto com Browser Harness, Xvfb e x11vnc/noVNC.

```text
Docker Compose
│
├── aplicação existente
│
└── browser-service
    ├── Python HTTP API
    ├── Session Manager
    ├── Profile Manager
    ├── Chromium Lifecycle
    ├── Human-in-the-loop
    ├── Product Extractor
    ├── Browser Harness oficial
    ├── Chromium
    ├── Xvfb
    └── x11vnc/noVNC
        │
        └── /browser-profiles/{profileId}
             volume persistente
```

Internamente:

```text
HTTP API
   ↓
Session Manager
   ├── Profile Manager
   ├── Chromium Lifecycle
   ├── Human-in-the-loop
   └── Product Extractor
            ↓
      Browser Harness
            ↓ CDP localhost/internal
         Chromium
```

A POC suporta uma instância ativa por container. Além dessa capacidade global, cada profile possui lock exclusivo. Dois browsers nunca podem abrir simultaneamente o mesmo `profileId`; a segunda tentativa recebe conflito e não inicia Chromium.

## Fronteiras de segurança

### Profile

O cliente interno recebe somente um `profileId` opaco produzido pelo backend. O Browser Service deriva o caminho internamente em `/browser-profiles` e rejeita path traversal, separadores, IDs vazios ou IDs fora do formato permitido.

O frontend não escolhe `profileId`, `user-data-dir`, caminho de filesystem ou endpoint CDP. Na aplicação final, o fluxo será:

```text
Frontend → Commerce API → resolve user/Tenant → browserProfileId → Browser Service
```

O volume de profiles é persistente e tratado como credencial sensível. A aplicação principal guarda apenas a associação operacional `user/Tenant → browserProfileId`.

### CDP

Chromium recebe uma porta CDP dinâmica vinculada a `127.0.0.1` dentro do container. O Browser Harness conecta usando essa porta interna. A porta nunca é publicada no Docker Compose, retornada pela API ou inserida em logs.

Não existe rota `internet → :9222`.

### URL e SSRF

O endpoint de criação aceita somente URLs HTTPS com host TikTok permitido. A allowlist inicial da POC aceita `shop.tiktok.com` e hosts cujo nome termine em `.tiktok.com`, sem aceitar o domínio vazio, userinfo ou qualquer outro domínio:

- `https://shop.tiktok.com/...`;
- `https://subdominio.tiktok.com/...`.

Hosts da allowlist são configuração server-side, não entrada do cliente.

São rejeitados antes de iniciar Chromium:

- `http`, `file`, `chrome` e outros schemes;
- userinfo, portas não permitidas, fragmentos ou credenciais;
- `localhost`, loopback, rede privada, link-local, multicast e metadata;
- hosts fora da allowlist.

Redirects e origem final serão revalidados pelo Browser Service; não basta validar apenas a URL inicial.

### noVNC e interação humana

noVNC não possui porta pública própria. O display VNC fica interno ao container e é servido somente por uma rota mediada pelo Browser Service.

Quando o estado for `LOGIN_REQUIRED` ou `USER_INTERACTION_REQUIRED`, o serviço gera um handle opaco de uso único, vinculado a `sessionId`, Tenant/operação e TTL curto. O status devolve uma URL temporária de interação, sem expor porta VNC ou CDP.

Ao executar `resume`, concluir, cancelar ou fechar a sessão:

1. o handle é revogado;
2. a rota interativa deixa de funcionar;
3. Browser Harness reassume o controle;
4. a sessão continua em `EXTRACTING`, `EXTRACTED` ou `ERROR`.

Senha, QR Code, CAPTCHA, 2FA e confirmação humana nunca são automatizados.

### Lock de profile

Cada profile possui lock exclusivo mantido durante toda a vida da sessão. A implementação usa uma operação de lock do sistema de arquivos, além do registro em memória do serviço. Crash libera o lock do sistema operacional; o profile não é apagado automaticamente.

A segunda sessão para o mesmo profile recebe `409 PROFILE_IN_USE` ou `409 BROWSER_BUSY`, conforme o conflito seja do profile ou da capacidade global do container.

## API da POC

A API interna exige autenticação entre serviços por segredo configurado no ambiente. Ela não é uma API pública de browser.

```text
GET  /health
POST /v1/browser-sessions
GET  /v1/browser-sessions/{sessionId}
POST /v1/browser-sessions/{sessionId}/resume
POST /v1/browser-sessions/{sessionId}/extract
POST /v1/browser-sessions/{sessionId}/close
```

A implementação também terá uma rota mediada para o conteúdo temporário do noVNC, acessível somente com o handle emitido para a sessão bloqueada. Essa rota não entrega CDP nem VNC bruto.

### Criar sessão

```json
{
  "profileId": "opaque-id-gerado-pelo-backend",
  "url": "https://shop.tiktok.com/..."
}
```

A resposta contém `sessionId` e estado. Ela só contém `interactiveUrl` quando a sessão estiver bloqueada e houver handoff válido. Nunca contém path de profile, cookies, tokens, CDP ou payload bruto da página.

### Candidate

A extração retorna somente fatos encontrados:

```ts
interface ProductCandidate {
  name?: string;
  description?: string;
  price?: {
    amount: number;
    currency: string;
  };
  features: string[];
  images: string[];
  seller?: string;
  sourceUrl: string;
}
```

Campos ausentes permanecem ausentes. O serviço não inventa preço, moeda, seller, características ou descrição.

## Estados

```text
OPENING
READY
LOGIN_REQUIRED
USER_INTERACTION_REQUIRED
EXTRACTING
EXTRACTED
ERROR
CLOSED
```

- `OPENING`: profile locked, Chromium iniciando e URL sendo aberta.
- `READY`: browser carregado e disponível para Harness.
- `LOGIN_REQUIRED`: TikTok exige login, incluindo QR Code.
- `USER_INTERACTION_REQUIRED`: CAPTCHA, 2FA ou confirmação humana.
- `EXTRACTING`: Product Extractor executando observação semântica.
- `EXTRACTED`: `ProductCandidate` produzido.
- `ERROR`: falha sanitizada, recuperável quando possível.
- `CLOSED`: Chromium encerrado; profile preservado.

Transições principais:

```text
OPENING → READY
OPENING → LOGIN_REQUIRED | USER_INTERACTION_REQUIRED | ERROR
READY → EXTRACTING | CLOSED
LOGIN_REQUIRED → EXTRACTING | ERROR | CLOSED
USER_INTERACTION_REQUIRED → EXTRACTING | ERROR | CLOSED
EXTRACTING → EXTRACTED | LOGIN_REQUIRED | USER_INTERACTION_REQUIRED | ERROR
EXTRACTED → CLOSED
ERROR → CLOSED
```

## Browser Harness e extração

O container instala e atualiza Browser Harness com Python 3.12 e `uv`:

```bash
uv tool install --python 3.12 --upgrade --force browser-harness
browser-harness skill > /root/.codex/skills/browser-harness/SKILL.md
```

A skill oficial gerada fica registrada no ambiente do serviço. A extração usa Browser Harness conectado ao CDP interno, priorizando:

1. Accessibility Tree;
2. DOM/CDP;
3. Structured Data;
4. Network somente quando necessário.

O Product Extractor não toca filesystem, cookies ou CDP diretamente. Ele executa comandos do Harness em uma sessão controlada pelo Browser Service e transforma somente fatos factuais no `ProductCandidate`. Não há scraper universal baseado principalmente em seletores CSS.

## Lifecycle

1. Validar autenticação interna, `profileId` e URL.
2. Adquirir lock de capacidade e lock exclusivo do profile.
3. Iniciar Xvfb/Chromium com o profile persistente.
4. Escolher CDP em localhost e conectar Browser Harness.
5. Abrir a URL autorizada.
6. Detectar página acessível ou bloqueio humano.
7. Se bloqueado, gerar handoff noVNC temporário.
8. Após `resume`, revogar handoff e executar extração.
9. Retornar `EXTRACTED` com `ProductCandidate` ou `ERROR` sanitizado.
10. Encerrar Chromium e liberar locks sem apagar o profile.

Cleanup ocorre em sucesso, erro, cancelamento, timeout e crash. O serviço só encerra processos que possui.

## Persistência e operação

O profile é persistente em volume Docker. Estado de sessão é efêmero na POC; o backend poderá persistir `browserProfileId` e o resultado Candidate em etapa posterior. Nenhum dado interno do profile é copiado para PostgreSQL, resposta HTTP ou log.

Logs usam allowlist de `sessionId`, estado, duração e classe de erro. URLs completas, query strings, conteúdo da página, profile path, CDP endpoint e secrets são omitidos ou redigidos.

## Verificação

A POC terá checks locais e um smoke manual real:

1. iniciar Browser Service via Docker Compose;
2. validar `/health`;
3. rejeitar `file://`, `chrome://`, HTTP, localhost, IP privado e host não TikTok;
4. criar sessão com profile válido e URL TikTok Shop;
5. confirmar que CDP não está publicado externamente;
6. confirmar lock rejeitando segunda sessão no mesmo profile;
7. abrir a janela via handle temporário quando login/interação for exigido;
8. fazer login manual via noVNC;
9. chamar `resume` e confirmar revogação do handoff;
10. executar `extract` e observar `EXTRACTED` com Candidate factual;
11. chamar `close`;
12. iniciar nova sessão com o mesmo profile;
13. verificar que o profile é reutilizado e a sessão não pede login quando ainda válida;
14. verificar que `ProductCandidate` não contém dados inventados.

A validação real do TikTok depende de URL disponível e interação manual; não será fingida em CI.

## Fora do escopo

- TikTok OAuth ou TikTok Shop API;
- Browser Use Cloud;
- Chromium em container separado;
- Kubernetes ou múltiplos browsers simultâneos;
- automação de login, CAPTCHA, QR Code ou 2FA;
- scraper universal;
- Product/Strategy/Plan/Content completos;
- persistência de credenciais ou dados brutos do profile;
- backup/restore de produção nesta POC.
