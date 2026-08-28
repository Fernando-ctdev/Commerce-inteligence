from __future__ import annotations

from dataclasses import dataclass, field
import json
import os
import subprocess
from typing import Any

from .models import HarnessFailed, SessionState

_RESULT_MARKER = "__BROWSER_SERVICE_RESULT__"


@dataclass(frozen=True)
class PageObservation:
    page_url: str
    title: str
    accessibility_names: list[str]
    text: list[str]
    json_ld: list[dict[str, Any]]
    image_urls: list[str]
    required_state: SessionState | None = None
    meta_image_urls: list[str] = field(default_factory=list)


class HarnessClient:
    def __init__(self, command: str = "browser-harness", timeout_seconds: int = 90):
        self.command = command
        self.timeout_seconds = timeout_seconds

    def open_url(self, cdp_url: str, url: str) -> None:
        script = f"new_tab({url!r})\nprint({_RESULT_MARKER!r} + json.dumps({{'ok': True}}))"
        self._run(cdp_url, script)

    def inspect(self, cdp_url: str) -> PageObservation:
        expression = r"""JSON.stringify({
  jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((node) => {
    try { return JSON.parse(node.textContent || ''); } catch (_) { return null; }
  }).filter(Boolean),
  metaImages: Array.from(document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]'))
    .map((node) => node.getAttribute('content') || '').filter(Boolean),
  images: Array.from(document.images).flatMap((image) => [
    image.currentSrc,
    image.getAttribute('data-src'),
    image.src,
  ]).filter(Boolean),
  text: (document.body && document.body.innerText || '').slice(0, 20000)
})"""
        script = f"""
import json

info = page_info()
ax = cdp("Accessibility.getFullAXTree").get("nodes", [])
accessibility_names = []
for node in ax:
    name = node.get("name", {{}}).get("value")
    if isinstance(name, str) and name.strip():
        accessibility_names.append(name.strip())

page_data = cdp("Runtime.evaluate", expression={expression!r}, returnByValue=True)
value = page_data.get("result", {{}}).get("result", {{}}).get("value", "{{}}")
try:
    structured = json.loads(value)
except (TypeError, ValueError):
    structured = {{}}

result = {{
    "page_url": str(info.get("url", "")),
    "title": str(info.get("title", "")),
    "accessibility_names": accessibility_names,
    "text": [line.strip() for line in str(structured.get("text", "")).splitlines() if line.strip()],
    "json_ld": structured.get("jsonLd", []),
    "image_urls": structured.get("images", []),
    "meta_image_urls": structured.get("metaImages", []),
}}
print({_RESULT_MARKER!r} + json.dumps(result, ensure_ascii=False))
"""
        result = self._run(cdp_url, script)
        if not isinstance(result, dict):
            raise HarnessFailed()
        names = result.get("accessibility_names", [])
        text = result.get("text", [])
        title = str(result.get("title", ""))
        required_state = classify_interaction([title, *names, *text])
        return PageObservation(
            page_url=str(result.get("page_url", "")),
            title=title,
            accessibility_names=[str(value) for value in names if isinstance(value, str)],
            text=[str(value) for value in text if isinstance(value, str)],
            json_ld=[value for value in result.get("json_ld", []) if isinstance(value, dict)],
            image_urls=[str(value) for value in result.get("image_urls", []) if isinstance(value, str)],
            required_state=required_state,
            meta_image_urls=[str(value) for value in result.get("meta_image_urls", []) if isinstance(value, str)],
        )

    def _run(self, cdp_url: str, script: str) -> Any:
        env = {**os.environ, "BU_CDP_URL": cdp_url}
        try:
            completed = subprocess.run(
                [self.command],
                input=f"import json\n{script}",
                text=True,
                capture_output=True,
                check=False,
                timeout=self.timeout_seconds,
                env=env,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise HarnessFailed() from exc
        if completed.returncode != 0:
            raise HarnessFailed()
        for line in reversed(completed.stdout.splitlines()):
            if line.startswith(_RESULT_MARKER):
                try:
                    return json.loads(line[len(_RESULT_MARKER) :])
                except json.JSONDecodeError as exc:
                    raise HarnessFailed() from exc
        raise HarnessFailed()

    # Ações semânticas allowlisted (ADR-013): scripts fixos, definidos server-side.
    # Nenhum seletor, JS, coordenada ou URL vem do chamador; `label` é um trecho de
    # evidência sanitizada usado apenas para casamento por conteúdo.
    def scroll_product_surface(self, cdp_url: str) -> None:
        self._run_action(
            cdp_url,
            r"""window.scrollBy({top: 900, left: 0, behavior: 'instant'}); true""",
        )

    def expand_description(self, cdp_url: str, label: str) -> None:
        fragment = label.strip()[:60].replace("\\", "").replace("'", "").replace('"', "")
        if not fragment:
            raise HarnessFailed()
        expression = f"""
(function () {{
  const fragment = {fragment!r}.toLowerCase();
  const clickables = document.querySelectorAll('summary, button, a[role="button"], [role="button"], a');
  for (const el of clickables) {{
    const text = (el.innerText || el.textContent || '').trim().toLowerCase().slice(0, 120);
    if (text && (text.includes(fragment) || /(ver mais|see more|description|descri|detalhes|details|leia mais)/.test(text))) {{
      el.click();
      return true;
    }}
  }}
  return false;
}})()
"""
        self._run_action(cdp_url, expression)

    def open_variants(self, cdp_url: str) -> None:
        self._run_action(
            cdp_url,
            r"""(function () {
  const pattern = /(variant|varia|tamanho|size|cor|color|op|option|modelo|model|selecionar|select)/i;
  const clickables = document.querySelectorAll('button, [role="button"], summary, a');
  for (const el of clickables) {
    const label = (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0, 120);
    if (label && pattern.test(label)) {
      el.click();
      return true;
    }
  }
  return false;
})()""",
        )

    def _run_action(self, cdp_url: str, expression: str) -> None:
        script = (
            f"result = cdp(\"Runtime.evaluate\", expression={expression!r}, returnByValue=True)\n"
            f"value = result.get('result', {{}}).get('result', {{}}).get('value')\n"
            f"print({_RESULT_MARKER!r} + json.dumps({{'ok': bool(value)}}))\n"
        )
        payload = self._run(cdp_url, script)
        if not isinstance(payload, dict) or payload.get("ok") is not True:
            raise HarnessFailed()


def classify_interaction(values: list[str]) -> SessionState | None:
    haystack = " ".join(values).casefold()
    if any(marker in haystack for marker in ("captcha", "captcha required", "verification required", "security check", "verify you are human", "human verification", "checking your browser")):
        return SessionState.CAPTCHA_REQUIRED
    if any(marker in haystack for marker in ("two-factor", "two factor", "2fa")):
        return SessionState.TWO_FA_REQUIRED
    if any(marker in haystack for marker in ("log in", "sign in", "login", "qr code")):
        return SessionState.LOGIN_REQUIRED
    return None


__all__ = ["HarnessClient", "PageObservation", "classify_interaction"]
