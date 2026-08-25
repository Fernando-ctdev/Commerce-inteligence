# Browser Service POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma POC local que inicia Chromium no mesmo container do Browser Service Python, mantém profiles isolados, permite login manual via noVNC mediado e usa Browser Harness oficial via CDP interno para retornar um `ProductCandidate` factual.

**Architecture:** Um processo Python expõe a API interna e é o único dono dos profiles, locks, Chromium, CDP e handoffs humanos. Chromium, Xvfb, x11vnc/noVNC e Browser Harness vivem no mesmo container; apenas a porta HTTP do serviço é publicada localmente, enquanto CDP e VNC ficam em loopback/container network. O estado da sessão é efêmero; o volume `/browser-profiles` persiste a sessão do Chromium.

**Tech Stack:** Python 3.12 stdlib (`http.server`, `subprocess`, `fcntl`, `unittest`), Chromium, Xvfb, x11vnc, websockify/noVNC, Browser Harness instalado por `uv`, Docker Compose.

---

## Mapa de arquivos

- Create: `browser-service/src/browser_service/__init__.py` — pacote Python.
- Create: `browser-service/src/browser_service/config.py` — configuração validada do serviço.
- Create: `browser-service/src/browser_service/url_guard.py` — allowlist HTTPS e validações anti-SSRF da URL inicial.
- Create: `browser-service/src/browser_service/profile_lock.py` — derivação segura do path e lock exclusivo por profile.
- Create: `browser-service/src/browser_service/chromium.py` — Xvfb/Chromium lifecycle, CDP localhost e cleanup de processos próprios.
- Create: `browser-service/src/browser_service/harness.py` — execução do CLI oficial Browser Harness contra CDP interno.
- Create: `browser-service/src/browser_service/extractor.py` — detecção de bloqueio e extração factual sem scraper universal.
- Create: `browser-service/src/browser_service/interactive.py` — handles TTL/uso único e proxy mediado do noVNC/WebSocket.
- Create: `browser-service/src/browser_service/session_manager.py` — sessão, transições, locks, handoff e orquestração.
- Create: `browser-service/src/browser_service/server.py` — HTTP API interna e respostas sanitizadas.
- Create: `browser-service/src/browser_service/__main__.py` — entrypoint do servidor.
- Create: `browser-service/tests/test_url_guard.py` — contrato da allowlist/SSRF.
- Create: `browser-service/tests/test_profile_lock.py` — isolamento e conflito de profile.
- Create: `browser-service/tests/test_session_manager.py` — transições, handoff e cleanup sem browser real.
- Create: `browser-service/tests/test_extractor.py` — normalização factual e ausência de invenção.
- Create: `browser-service/tests/test_http.py` — autenticação, roteamento e sanitização das respostas.
- Create: `browser-service/Dockerfile` — Python, Chromium, display stack, noVNC e Harness.
- Create: `browser-service/entrypoint.sh` — Xvfb, x11vnc, websockify e servidor.
- Create: `docker-compose.browser.yml` — serviço local, volume persistente e somente HTTP publicado em loopback.
- Create: `scripts/smoke-browser-service.mts` — smoke HTTP reproduzível com pausa explícita para login manual.
- Modify: `.gitignore` — ignorar apenas artefatos locais de build/log do Browser Service, nunca profiles versionados.

## Contrato fixado antes da implementação

```python
class SessionState(str, Enum):
    OPENING = "OPENING"
    READY = "READY"
    LOGIN_REQUIRED = "LOGIN_REQUIRED"
    USER_INTERACTION_REQUIRED = "USER_INTERACTION_REQUIRED"
    EXTRACTING = "EXTRACTING"
    EXTRACTED = "EXTRACTED"
    ERROR = "ERROR"
    CLOSED = "CLOSED"

@dataclass(frozen=True)
class Price:
    amount: float
    currency: str

@dataclass(frozen=True)
class ProductCandidate:
    name: str | None
    description: str | None
    price: Price | None
    features: list[str]
    images: list[str]
    seller: str | None
    source_url: str
```

API interna:

```text
GET  /health
POST /v1/browser-sessions
GET  /v1/browser-sessions/{sessionId}
POST /v1/browser-sessions/{sessionId}/resume
POST /v1/browser-sessions/{sessionId}/extract
POST /v1/browser-sessions/{sessionId}/close
GET  /v1/browser-sessions/{sessionId}/interactive/{handoff}
GET  /v1/browser-sessions/{sessionId}/interactive/{handoff}/websockify
```

Somente `/health` não exige `Authorization: Bearer $BROWSER_SERVICE_TOKEN`. Os demais endpoints exigem o segredo interno e validam a sessão. O cliente de criação envia apenas:

```json
{
  "profileId": "profile-fernando-01",
  "url": "https://shop.tiktok.com/product/123"
}
```

`profileId` é aceito somente como identificador opaco `[A-Za-z0-9_-]{8,128}`; nunca é path nem autoridade de Tenant. `interactiveUrl` só aparece nos estados de bloqueio humano e contém um handle aleatório, não uma porta VNC/CDP. O modelo interno também guarda `handoff_token`, mas `SessionView.to_public_json()` nunca o serializa.

API interna:

```text
GET  /health
POST /v1/browser-sessions
GET  /v1/browser-sessions/{sessionId}
POST /v1/browser-sessions/{sessionId}/resume
POST /v1/browser-sessions/{sessionId}/extract
POST /v1/browser-sessions/{sessionId}/close
GET  /v1/browser-sessions/{sessionId}/interactive/{handoff}
GET  /v1/browser-sessions/{sessionId}/interactive/{handoff}/websockify
```

Somente `/health` não exige `Authorization: Bearer $BROWSER_SERVICE_TOKEN`. Os demais endpoints exigem o segredo interno e validam a sessão. O cliente de criação envia apenas:

```json
{
  "profileId": "profile-fernando-01",
  "url": "https://shop.tiktok.com/product/123"
}
```

`profileId` é aceito somente como identificador opaco `[A-Za-z0-9_-]{8,128}`; nunca é path nem autoridade de Tenant. `interactiveUrl` só aparece nos estados de bloqueio humano e contém um handle aleatório, não uma porta VNC/CDP.

---

### Task 1: Scaffold do container e runtime do Browser Service

**Files:**
- Create: `browser-service/Dockerfile`
- Create: `browser-service/entrypoint.sh`
- Create: `browser-service/src/browser_service/__init__.py`
- Create: `browser-service/src/browser_service/config.py`
- Create: `browser-service/src/browser_service/models.py`
- Create: `browser-service/src/browser_service/__main__.py`
- Create: `docker-compose.browser.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Criar o teste mínimo de configuração**

Em `browser-service/tests/test_session_manager.py`, começar com um teste de configuração que exige token, volume e limites explícitos:

```python
class ConfigTests(unittest.TestCase):
    def test_defaults_bind_cdp_and_novnc_to_loopback(self):
        config = ServiceConfig.from_env({"BROWSER_SERVICE_TOKEN": "test-token"})
        self.assertEqual(config.bind_host, "0.0.0.0")
        self.assertEqual(config.cdp_bind_host, "127.0.0.1")
        self.assertEqual(config.profile_root, Path("/browser-profiles"))
        self.assertEqual(config.novnc_ttl_seconds, 300)
```

- [ ] **Step 2: Executar o teste no container Python**

Run: `docker run --rm -v "%CD%/browser-service:/workspace" -w /workspace python:3.12-slim python -m unittest discover -s tests -p "test_*.py"`

Expected: FAIL porque `ServiceConfig` ainda não existe.

- [ ] **Step 3: Implementar configuração, estados e entrypoint**

`ServiceConfig.from_env` deve validar `BROWSER_SERVICE_TOKEN`, `BROWSER_SERVICE_PORT`, `PROFILE_ROOT`, `CDP_BIND_HOST`, `NOVNC_TTL_SECONDS`, `SESSION_TIMEOUT_SECONDS` e `ALLOWED_TIKTOK_HOSTS`. O valor padrão de hosts será `shop.tiktok.com`; hosts adicionais só entram por configuração server-side. `models.py` define os estados fixos, `Price`, `ProductCandidate`, `SessionView` e erros sanitizados.

O `Dockerfile` deve usar `python:3.12-slim-bookworm`, instalar `chromium`, `xvfb`, `x11vnc`, `novnc`, `websockify`, fontes e certificados, instalar `uv`, executar:

```bash
uv tool install --python 3.12 --upgrade --force browser-harness
mkdir -p /root/.codex/skills/browser-harness
browser-harness skill > /root/.codex/skills/browser-harness/SKILL.md
browser-harness --version > /opt/browser-harness.version
```

O `entrypoint.sh` inicia `Xvfb :99`, `x11vnc -localhost` e `websockify 127.0.0.1:6080 127.0.0.1:5900`, instala traps para encerrar somente esses PIDs e então executa `python -m browser_service`.

`docker-compose.browser.yml` deve montar:

```yaml
services:
  browser-service:
    build: ./browser-service
    environment:
      BROWSER_SERVICE_TOKEN: ${BROWSER_SERVICE_TOKEN:?set BROWSER_SERVICE_TOKEN}
      DISPLAY: :99
    ports:
      - "127.0.0.1:8081:8080"
    volumes:
      - browser-profiles:/browser-profiles
    networks: [commerce]
volumes:
  browser-profiles:
networks:
  commerce:
```

Não publicar `9222`, `5900` ou `6080`. O serviço HTTP fica acessível somente no host local para a POC; em integração, a aplicação usa a rede `commerce`.

- [ ] **Step 4: Executar novamente o teste de configuração**

Run: `docker run --rm -v "%CD%/browser-service:/workspace" -w /workspace -e PYTHONPATH=src python:3.12-slim python -m unittest discover -s tests -p "test_*.py"`

Expected: PASS no teste de defaults.

- [ ] **Step 5: Buildar o container e verificar instalação do Harness**

Run: `docker compose -f docker-compose.browser.yml build browser-service && docker compose -f docker-compose.browser.yml run --rm browser-service browser-harness --version`

Expected: a versão instalada é exibida; o build também cria `/root/.codex/skills/browser-harness/SKILL.md` e `/opt/browser-harness.version`.

- [ ] **Step 6: Commit**

```bash
git add browser-service docker-compose.browser.yml .gitignore
git commit -m "feat(browser): scaffold isolated service"
```

### Task 2: Guard de URL e lock exclusivo de profile

**Files:**
- Create: `browser-service/src/browser_service/url_guard.py`
- Create: `browser-service/src/browser_service/profile_lock.py`
- Create: `browser-service/tests/test_url_guard.py`
- Create: `browser-service/tests/test_profile_lock.py`

- [ ] **Step 1: Escrever testes falhando para URL e profile**

`test_url_guard.py` deve cobrir pelo menos:

```python
class UrlGuardTests(unittest.TestCase):
    def test_accepts_shop_tiktok_https(self):
        self.assertEqual(validate_url("https://shop.tiktok.com/product/123"), "https://shop.tiktok.com/product/123")

    def test_rejects_non_https_and_local_schemes(self):
        for value in ("http://shop.tiktok.com/product/123", "file:///tmp/page", "chrome://settings"):
            with self.assertRaises(UrlRejected):
                validate_url(value)

    def test_rejects_local_private_metadata_and_non_tiktok_hosts(self):
        for value in (
            "https://localhost/",
            "https://127.0.0.1/",
            "https://169.254.169.254/latest/meta-data/",
            "https://internal.example/product/123",
        ):
            with self.assertRaises(UrlRejected):
                validate_url(value)

    def test_rejects_userinfo_credentials_and_fragment(self):
        for value in (
            "https://user:pass@shop.tiktok.com/product/123",
            "https://shop.tiktok.com/product/123#token=secret",
        ):
            with self.assertRaises(UrlRejected):
                validate_url(value)
```

`test_profile_lock.py` deve criar dois processos que tentam o mesmo profile; o primeiro mantém o lock e o segundo recebe `ProfileInUse`. Também deve confirmar que `../../outside` e `profile/with-slash` são rejeitados.

- [ ] **Step 2: Rodar os testes para confirmar falha**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_url_guard.py"` e o mesmo comando para `test_profile_lock.py`.

Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Implementar `validate_url`**

Usar `urllib.parse.urlsplit`, exigir scheme `https`, porta ausente ou `443`, ausência de username/password/fragment, host ASCII normalizado e host igual a `shop.tiktok.com` ou terminado em `.tiktok.com`. Rejeitar query keys `token`, `auth`, `password`, `passwd`, `cookie`, `session`, `sid`, `secret`, `code` e `access_token`.

Resolver o host imediatamente com `socket.getaddrinfo`; rejeitar qualquer endereço loopback, private, link-local, multicast, unspecified ou reservado. Retornar a URL normalizada sem fragmento apenas depois de todas as validações. Nunca registrar a URL rejeitada.

- [ ] **Step 4: Implementar `ProfileLock`**

`ProfileLock.acquire(profile_root, profile_id)` deve validar o ID, criar o diretório derivado com `Path(profile_root) / profile_id`, abrir `.browser-service.lock` e usar `fcntl.flock(lock_file, LOCK_EX | LOCK_NB)`. O objeto mantém o descritor até `release`; nunca remove o diretório ou o profile. Conflitos retornam erro sanitizado `PROFILE_IN_USE`.

- [ ] **Step 5: Rodar os testes para confirmar passagem**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_url_guard.py" -v` e `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_profile_lock.py" -v`.

Expected: todos os casos de schemes locais, SSRF, credenciais, fragmentos, path traversal e lock concorrente PASS.

- [ ] **Step 6: Commit**

```bash
git add browser-service/src/browser_service/url_guard.py browser-service/src/browser_service/profile_lock.py browser-service/tests/test_url_guard.py browser-service/tests/test_profile_lock.py
git commit -m "feat(browser): guard URLs and profile locks"
```

### Task 3: Chromium lifecycle e estados da sessão

**Files:**
- Create: `browser-service/src/browser_service/chromium.py`
- Create: `browser-service/src/browser_service/session_manager.py`
- Modify: `browser-service/src/browser_service/models.py`
- Modify: `browser-service/tests/test_session_manager.py`

- [ ] **Step 1: Escrever testes de transição e isolamento**

Os testes devem usar um fake de `ChromiumProcess` e `HarnessClient`, sem iniciar navegador real. O construtor testado terá a forma:

```python
SessionManager(
    profile_root=tempdir,
    harness=FakeHarness(),
    chromium_factory=lambda profile_path, url: fake_chromium,
    handoff_store=HandoffStore(clock=fake_clock),
)
```

```python
class SessionStateTests(unittest.TestCase):
    def setUp(self):
        self.fake_clock = FakeClock()
        self.fake_chromium = FakeChromium()
        self.manager = SessionManager(
            profile_root=self.tempdir,
            harness=FakeHarness(),
            chromium_factory=lambda profile_path, url: self.fake_chromium,
            handoff_store=HandoffStore(clock=self.fake_clock),
        )

    def test_start_locks_profile_and_enters_opening(self):
        session = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.assertEqual(session.state, SessionState.OPENING)
        self.assertTrue(self.manager.is_profile_locked("profile-fernando-01"))

    def test_second_session_same_profile_is_rejected_before_chromium(self):
        self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        with self.assertRaises(ProfileInUse):
            self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/456")
        self.assertEqual(self.fake_chromium.start_count, 1)

    def test_close_kills_owned_chromium_and_preserves_profile(self):
        session = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.manager.close(session.session_id)
        self.assertEqual(self.manager.get(session.session_id).state, SessionState.CLOSED)
        self.assertTrue(self.manager.profile_path("profile-fernando-01").exists())
        self.assertEqual(self.fake_chromium.terminated_sessions, [session.session_id])
```

Adicionar testes para `READY → EXTRACTING`, bloqueio humano, `resume`, `EXTRACTED → CLOSED`, erro sanitizado e `close` idempotente.

- [ ] **Step 2: Executar e confirmar falha**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_session_manager.py" -v`

Expected: FAIL por lifecycle/session manager incompletos.

- [ ] **Step 3: Implementar `ChromiumProcess`**

A classe deve:

1. adquirir uma porta TCP livre somente em `127.0.0.1`;
2. derivar o profile path exclusivamente do `ProfileLock`;
3. executar Chromium com argumentos construídos como `["--user-data-dir", str(profile_path), "--remote-debugging-address=127.0.0.1", f"--remote-debugging-port={cdp_port}", "--display=:99", "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage"]`;
4. não adicionar `--remote-allow-origins=*`;
5. aguardar o endpoint local `/json/version` com timeout finito;
6. abrir a URL somente depois do endpoint CDP estar pronto;
7. em `terminate`, matar apenas o `Popen` filho e esperar seu encerramento;
8. marcar `PROFILE_UNAVAILABLE` em erro de diretório/processo, preservando o profile.

O número da porta nunca entra em `SessionView`, logs ou resposta HTTP.

`SessionManager.start(profile_id, url)` valida URL, adquire a capacidade global de uma instância, adquire `ProfileLock`, cria `ChromiumProcess`, registra `SessionState.OPENING` e mantém ambos até estado terminal. O manager aceita somente uma sessão ativa no container; conflitos globais retornam `BROWSER_BUSY`.

O construtor usado pelos testes e pelo entrypoint é:

```python
SessionManager(
    profile_root: Path,
    harness: HarnessClient,
    chromium_factory: Callable[[Path, str], ChromiumProcess],
    handoff_store: HandoffStore,
)
```

Métodos públicos fixos:

```python
start(profile_id: str, url: str) -> SessionView
get(session_id: str) -> SessionView
resume(session_id: str, handoff: str) -> SessionView
extract(session_id: str) -> SessionView
close(session_id: str) -> SessionView
```

Toda falha de processo retorna `ERROR` com `error_code` e `message` allowlisted. `SessionView` contém `sessionId`, `state`, `profileId` opaco, `sourceUrl` normalizada, `candidate` quando extraído e `interactiveUrl` somente durante handoff válido. `handoff_token` existe apenas no modelo interno e é omitido pela serialização pública.

- [ ] **Step 5: Executar os testes de estados**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_session_manager.py" -v`

Expected: PASS sem Chromium real.

- [ ] **Step 6: Commit**

```bash
git add browser-service/src/browser_service/chromium.py browser-service/src/browser_service/session_manager.py browser-service/src/browser_service/models.py browser-service/tests/test_session_manager.py
git commit -m "feat(browser): manage chromium sessions"
```

### Task 4: Adapter do Browser Harness e Product Extractor factual

**Files:**
- Create: `browser-service/src/browser_service/harness.py`
- Create: `browser-service/src/browser_service/extractor.py`
- Create: `browser-service/tests/test_extractor.py`
- Modify: `browser-service/src/browser_service/session_manager.py`

- [ ] **Step 1: Escrever testes de payload e ausência de invenção**

Usar fixtures mínimas retornadas pelo fake Harness:

```python
class ExtractorTests(unittest.TestCase):
    def test_structured_data_and_accessibility_names_form_candidate(self):
        observation = PageObservation(
            page_url="https://shop.tiktok.com/product/123",
            title="Hydrating Face Serum",
            accessibility_names=["Hydrating Face Serum", "30 ml", "$19.99", "Vitamin C"],
            text=["Hydrating Face Serum", "Night serum"],
            json_ld=[{
                "name": "Hydrating Face Serum",
                "description": "Night serum",
                "offers": {"price": "19.99", "priceCurrency": "USD"},
            }],
            image_urls=[],
        )
        candidate = ProductExtractor().extract(observation)
        self.assertEqual(candidate.name, "Hydrating Face Serum")
        self.assertEqual(candidate.price.amount, 19.99)
        self.assertEqual(candidate.price.currency, "USD")
        self.assertEqual(candidate.source_url, "https://shop.tiktok.com/product/123")

    def test_missing_price_is_none_not_invented(self):
        observation = PageObservation(
            page_url="https://shop.tiktok.com/product/123",
            title="Product without price",
            accessibility_names=["Product without price"],
            text=[],
            json_ld=[],
            image_urls=[],
        )
        candidate = ProductExtractor().extract(observation)
        self.assertIsNone(candidate.price)
```

Adicionar casos de URL de imagem somente HTTPS, moeda ausente, descrição ausente, JSON-LD inválido e texto de página com instrução maliciosa. Nenhum texto de instrução da página deve alterar o contrato do Candidate.

- [ ] **Step 2: Rodar para confirmar falha**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_extractor.py" -v`

Expected: FAIL por Harness adapter/extractor ausentes.

- [ ] **Step 3: Implementar `HarnessClient`**

`HarnessClient.inspect(cdp_url)` executa o binário `browser-harness` por `subprocess.run` sem shell, com `BU_CDP_URL=f"http://127.0.0.1:{cdp_port}"` somente no ambiente do processo filho. O script enviado ao Harness deve chamar `page_info()`, `cdp("Accessibility.getFullAXTree")`, `cdp("DOM.getDocument")`/DOM necessário e uma avaliação estruturada para JSON-LD/meta. O script imprime exatamente um objeto JSON marcado; stdout/stderr cru não é repassado ao cliente.

O adapter expõe:

```python
@dataclass(frozen=True)
class PageObservation:
    page_url: str
    title: str
    accessibility_names: list[str]
    text: list[str]
    json_ld: list[dict[str, object]]
    image_urls: list[str]

inspect(cdp_url: str) -> PageObservation
```

A detecção de login/interação compara somente títulos/names/textos observados com padrões allowlisted (`log in`, `sign in`, `login`, `captcha`, `two-factor`, `verification`, equivalentes case-insensitive). Não executa senha, QR Code, CAPTCHA ou 2FA.

- [ ] **Step 4: Implementar normalização factual**

`ProductExtractor.extract` usa nesta ordem: Accessibility Tree, DOM/CDP, JSON-LD e Network somente se o adapter disponibilizar fato necessário. Nome, descrição, preço/moeda, seller, features e imagens só são preenchidos quando encontrados. Preço exige número finito não negativo e moeda não vazia; imagem exige `https` e host TikTok/CDN permitido; listas são deduplicadas e limitadas a 20 features/10 images. URL final deve continuar na allowlist.

O extractor nunca interpreta instruções textuais da página como comandos. Candidate sem nome fica `ERROR INSUFFICIENT_PRODUCT_FACTS`; Candidate com nome e lacunas retorna `EXTRACTED` com `None`/listas vazias.

- [ ] **Step 5: Integrar extração e bloqueio ao manager**

Após Chromium/CDP pronto, `SessionManager` chama `HarnessClient.inspect`. Se detectar login/captcha/2FA/interação, cria handoff e muda para `LOGIN_REQUIRED` ou `USER_INTERACTION_REQUIRED`. Caso contrário muda para `READY`. `extract` muda para `EXTRACTING`, chama o extractor e retorna `EXTRACTED` com Candidate factual ou `ERROR` sanitizado.

- [ ] **Step 6: Rodar testes**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_extractor.py" -v`

Expected: PASS nos casos completos, incompletos e prompt-injection.

- [ ] **Step 7: Commit**

```bash
git add browser-service/src/browser_service/harness.py browser-service/src/browser_service/extractor.py browser-service/src/browser_service/session_manager.py browser-service/tests/test_extractor.py
git commit -m "feat(browser): extract factual product candidates"
```

### Task 5: Handoff humano e noVNC mediado por sessão

**Files:**
- Create: `browser-service/src/browser_service/interactive.py`
- Modify: `browser-service/src/browser_service/session_manager.py`
- Modify: `browser-service/tests/test_session_manager.py`

Cobrir:

```python
class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.fake_clock = FakeClock()
        self.manager = make_manager(handoff_store=HandoffStore(clock=self.fake_clock))

    def test_handoff_exists_only_while_blocked(self):
        view = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.assertEqual(view.state, SessionState.LOGIN_REQUIRED)
        self.assertTrue(view.interactive_url)
        self.manager.resume(view.session_id, view.handoff_token)
        self.assertIsNone(self.manager.get(view.session_id).interactive_url)
        with self.assertRaises(InvalidHandoff):
            self.manager.open_interactive(view.session_id, view.handoff_token)

    def test_expired_handoff_is_rejected(self):
        view = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.fake_clock.advance(seconds=301)
        with self.assertRaises(InvalidHandoff):
            self.manager.open_interactive(view.session_id, view.handoff_token)
```

`make_manager` é o fixture local do arquivo de teste: cria `SessionManager` com `FakeHarness` configurado para devolver `LOGIN_REQUIRED`, `FakeChromium` e `HandoffStore` com o relógio injetado. O método `open_interactive` é interno ao adapter HTTP e só existe para validar o handoff antes de servir noVNC.

- [ ] **Step 2: Rodar para confirmar falha**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_session_manager.py" -v`

Expected: FAIL por `HandoffStore` ausente.

- [ ] **Step 3: Implementar `HandoffStore`**

Gerar token com `secrets.token_urlsafe(32)`, guardar somente hash, `session_id`, `tenant_operation_id` interno, criação, expiração de 300 segundos e estado ativo. Validar o token a cada request; consumi-lo/invalidá-lo em `resume`, `close`, erro terminal, logout/desprovisionamento futuro e timeout. O token não entra em logs.

- [ ] **Step 4: Implementar proxy noVNC**

`InteractiveProxy` serve os assets instalados de `/usr/share/novnc` somente depois de validar o handle. O HTML recebe `path=/v1/browser-sessions/{sessionId}/interactive/{handoff}/websockify` e `autoconnect=true`. O endpoint WebSocket aceita upgrade apenas com handle válido e encaminha frames para `127.0.0.1:6080`, onde `websockify` encaminha para `127.0.0.1:5900`.

O proxy nunca expõe `5900`, `6080` ou `9222`; o browser humano conhece somente a URL HTTP mediada. Depois de `resume`, qualquer GET/upgrade com o handle antigo recebe `404` uniforme.

- [ ] **Step 5: Integrar transições**

`resume` só aceita `LOGIN_REQUIRED`/`USER_INTERACTION_REQUIRED`, revoga o handoff antes de retornar, marca `EXTRACTING` e deixa o Harness verificar novamente a sessão. `close` revoga antes de matar Chromium. `READY`, `EXTRACTED`, `ERROR` e `CLOSED` não emitem `interactiveUrl`.

- [ ] **Step 6: Rodar testes**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_session_manager.py" -v`

Expected: PASS para TTL, uso único, revogação e retorno ao Harness.

- [ ] **Step 7: Commit**

```bash
git add browser-service/src/browser_service/interactive.py browser-service/src/browser_service/session_manager.py browser-service/tests/test_session_manager.py
git commit -m "feat(browser): mediate temporary human handoff"
```

### Task 6: HTTP API sanitizada

**Files:**
- Create: `browser-service/src/browser_service/server.py`
- Modify: `browser-service/src/browser_service/__main__.py`
- Create: `browser-service/tests/test_http.py`

Usar `ThreadingHTTPServer` em porta efêmera com fake manager e cobrir:

```python
class HttpContractTests(unittest.TestCase):
    def setUp(self):
        self.request = HttpTestClient(start_server_with_fake_manager())

    def test_health_is_public(self):
        response = self.request.get("/health")
        self.assertEqual(response.status, 200)

    def test_session_requires_internal_bearer_token(self):
        response = self.request.post(
            "/v1/browser-sessions",
            body={"profileId": "profile-fernando-01", "url": "https://shop.tiktok.com/product/123"},
        )
        self.assertEqual(response.status, 401)

    def test_response_never_contains_cdp_or_profile_path(self):
        response = self.request.post(
            "/v1/browser-sessions",
            token="test-token",
            body={"profileId": "profile-fernando-01", "url": "https://shop.tiktok.com/product/123"},
        )
        self.assertNotIn("remote-debugging-port", response.text)
        self.assertNotIn("/browser-profiles", response.text)
        self.assertNotIn("cookie", response.text.lower())
```

- [ ] **Step 2: Rodar para confirmar falha**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_http.py" -v`

Expected: FAIL por servidor ausente.

- [ ] **Step 3: Implementar roteamento e autenticação**

`server.py` deve parsear JSON com limite de 64 KiB, exigir `Authorization: Bearer` para rotas internas, extrair apenas UUID/session ID/handle permitidos, mapear erros para `400`, `401`, `404`, `409`, `422` e `500` sanitizado. `GET /health` retorna `{ "status": "ok", "harness": true, "chromium": true }` somente após validar executáveis, sem revelar versão/path.

Respostas de sessão usam `SessionView.to_public_json()` e incluem somente estado, IDs opacos, URL original normalizada, Candidate e mensagens allowlisted. Nunca serializar exceções, comandos, ambiente, headers, profile path, CDP port, cookies, tokens ou stdout do Harness.

- [ ] **Step 4: Implementar os seis endpoints e rota interativa**

- `POST /v1/browser-sessions`: valida `profileId`/URL antes de iniciar; chama `manager.start`.
- `GET /v1/browser-sessions/{sessionId}`: retorna estado atual.
- `POST /v1/browser-sessions/{sessionId}/resume`: exige `handoff` no body; chama `manager.resume`.
- `POST /v1/browser-sessions/{sessionId}/extract`: chama `manager.extract` apenas em `READY`.
- `POST /v1/browser-sessions/{sessionId}/close`: chama `manager.close` de modo idempotente.
- `GET /v1/browser-sessions/{sessionId}/interactive/{handoff}` e `/websockify`: delegam ao proxy após validar ownership/TTL.


- [ ] **Step 5: Rodar testes HTTP**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_http.py" -v`

Expected: PASS com respostas uniformes e sem secrets.

- [ ] **Step 6: Commit**

```bash
git add browser-service/src/browser_service/server.py browser-service/src/browser_service/__main__.py browser-service/tests/test_http.py
git commit -m "feat(browser): expose sanitized session API"
```

### Task 7: Smoke manual real, Compose e persistência do profile

**Files:**
- Create: `scripts/smoke-browser-service.mts`
- Modify: `docker-compose.browser.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Implementar smoke HTTP sem credenciais**

O script deve usar `BROWSER_SERVICE_ORIGIN` (default `http://127.0.0.1:8081`), `BROWSER_SERVICE_TOKEN`, `BROWSER_PROFILE_ID` e `TIKTOK_PRODUCT_URL`. Ele deve:

1. chamar `/health`;
2. testar URLs inválidas `file://`, `chrome://`, `http://localhost`, `https://127.0.0.1` e host externo, esperando `400`/`422`;
3. criar sessão com o profile opaco e URL TikTok;
4. repetir criação no mesmo profile enquanto ativa e esperar `409`;
5. consultar estado até `READY`, `LOGIN_REQUIRED`, `USER_INTERACTION_REQUIRED` ou `ERROR`;
6. se bloqueado, imprimir somente `interactiveUrl` e a instrução para login manual, sem imprimir token separado, CDP ou path;
7. aguardar `ENTER` no terminal;
8. chamar `resume`, verificar que a URL interativa antiga retorna `404`, chamar `extract`;
9. validar `EXTRACTED` e exigir `sourceUrl`, `features` e ao menos um de `name`, `description` ou `price`;
10. chamar `close`;
11. criar segunda sessão com o mesmo `BROWSER_PROFILE_ID`, consultar novamente e registrar se o estado pulou login;
12. fechar a segunda sessão em `finally`.

O script não aceita senha, cookie, QR payload ou token do TikTok.

- [ ] **Step 2: Buildar e iniciar Compose**

Run: `docker compose -f docker-compose.browser.yml up -d --build browser-service`

Expected: container healthy/respondendo em `http://127.0.0.1:8081/health`; `docker compose port browser-service 9222` não retorna porta; `docker compose port browser-service 6080` não retorna porta.

- [ ] **Step 3: Executar smoke com URL real**

Run: `BROWSER_SERVICE_TOKEN=local-poc-token BROWSER_PROFILE_ID=profile-fernando-01 TIKTOK_PRODUCT_URL=https://shop.tiktok.com/product/123 node --import tsx scripts/smoke-browser-service.mts`
Run no PowerShell: `$env:BROWSER_SERVICE_TOKEN="local-poc-token"; $env:BROWSER_PROFILE_ID="profile-fernando-01"; $env:TIKTOK_PRODUCT_URL="https://shop.tiktok.com/product/123"; npx tsx scripts/smoke-browser-service.mts`

Expected: a primeira execução pode parar em `LOGIN_REQUIRED`; o usuário abre a URL mediada, resolve login manualmente, pressiona ENTER e recebe Candidate factual. Após `close`, a segunda execução reutiliza o volume `browser-profiles` e não pede login enquanto a sessão continuar válida.

- [ ] **Step 4: Verificar persistência e isolamento sem expor profile**

Run: `docker compose -f docker-compose.browser.yml down` e depois `docker compose -f docker-compose.browser.yml up -d browser-service`; executar novamente o smoke com o mesmo `BROWSER_PROFILE_ID`.

Expected: o volume continua presente, Chromium reabre com o mesmo profile, nenhum endpoint externo de CDP/VNC aparece e o serviço não imprime conteúdo do diretório.

- [ ] **Step 5: Executar toda a suíte Python e checks do repositório**

Run: `docker compose -f docker-compose.browser.yml run --rm browser-service python -m unittest discover -s /app/tests -p "test_*.py" -v`

Expected: todos os testes do serviço PASS.

Run: `npm run typecheck && npm run lint && npm run build && npm test`

Expected: validações existentes do backend permanecem PASS; se uma validação não puder rodar por dependência/ambiente, registrar o erro exato sem declarar sucesso.

- [ ] **Step 6: Commit final da POC e smoke**

```bash
git add scripts/smoke-browser-service.mts docker-compose.browser.yml .gitignore
git commit -m "feat(browser): add real profile persistence smoke"
```

## Verificação final contra a especificação

- Browser Harness é instalado dentro do container Python 3.12 via `uv` e a skill oficial é gerada no build.
- Chromium roda no mesmo container; CDP fica em `127.0.0.1` e nenhuma porta CDP é publicada.
- `ProfileLock` impede duas sessões simultâneas no mesmo `profileId` e não apaga profile em erro.
- A URL inicial aceita somente HTTPS TikTok allowlisted e rejeita schemes locais, userinfo, credenciais, fragmentos, hosts privados e hosts externos antes de Chromium.
- noVNC é acessível somente por handle opaco vinculado à sessão, com TTL, uso único e revogação em `resume`/close/terminal.
- Estados implementados são exatamente `OPENING`, `READY`, `LOGIN_REQUIRED`, `USER_INTERACTION_REQUIRED`, `EXTRACTING`, `EXTRACTED`, `ERROR` e `CLOSED`.
- Product Extractor usa Browser Harness e prioriza Accessibility Tree, DOM/CDP e Structured Data; não implementa scraper universal nem automação de desafio.
- Candidate não inventa fatos ausentes e nunca inclui secrets ou payload bruto.
- O volume persiste entre encerramento/reabertura; estado operacional pode ser recriado sem entregar profile ao cliente.
- O smoke documenta a dependência inevitável de login manual e de uma URL TikTok real; CI não finge uma sessão autenticada.

**Skipped by design:** integração de rotas Next.js/Product Import, Prisma, Candidate persistido, confirmação de Product, backup/restore de produção, OAuth, TikTok Shop API, múltiplos browsers, Kubernetes e Browser Use Cloud. Adicionar somente quando a POC for aceita e o Slice 002 avançar para integração vertical.
