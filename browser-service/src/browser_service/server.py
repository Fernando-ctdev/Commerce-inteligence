from __future__ import annotations

import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
import shutil
from urllib.parse import unquote, urlsplit

from .config import ServiceConfig
from .interactive import InteractiveProxy
from .models import InvalidRequest, ServiceError, Unauthorized


class BrowserHttpServer(ThreadingHTTPServer):
    allow_reuse_address = True

    def __init__(
        self,
        server_address,
        request_handler,
        config: ServiceConfig,
        manager=None,
        interactive: InteractiveProxy | None = None,
    ):
        self.config = config
        self.manager = manager
        self.interactive = interactive
        super().__init__(server_address, request_handler)

    def health_payload(self) -> dict[str, object]:
        return {
            "status": "ok",
            "harness": shutil.which(self.config.harness_command) is not None,
            "chromium": shutil.which("chromium") is not None,
        }


class BrowserRequestHandler(BaseHTTPRequestHandler):
    server: BrowserHttpServer
    protocol_version = "HTTP/1.1"

    def log_message(self, _format, *_args):
        return

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self._respond(200, self.server.health_payload())
            return
        try:
            if self._serve_interactive(path):
                return
            self._require_auth()
            parts = self._parts(path)
            if len(parts) == 3 and parts[:2] == ["v1", "browser-sessions"]:
                view = self._manager().get(parts[2])
                self._respond(200, view.to_public_json())
                return
            raise InvalidRequest()
        except ServiceError as exc:
            self._error(exc)
        except Exception:
            self._error(ServiceError())

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        try:
            self._require_auth()
            body = self._read_json(required=False)
            parts = self._parts(path)
            if path == "/v1/browser-sessions":
                profile_id = body.get("profileId")
                url = body.get("url")
                if not isinstance(profile_id, str) or not isinstance(url, str):
                    raise InvalidRequest()
                view = self._manager().start(profile_id, url)
                self._respond(200, view.to_public_json())
                return
            if len(parts) == 4 and parts[:2] == ["v1", "browser-sessions"]:
                session_id = parts[2]
                action = parts[3]
                if action == "resume":
                    handoff = body.get("handoff")
                    if not isinstance(handoff, str) or not handoff:
                        raise InvalidRequest()
                    view = self._manager().resume(session_id, handoff)
                elif action == "extract":
                    view = self._manager().extract(session_id)
                elif action == "close":
                    view = self._manager().close(session_id)
                else:
                    raise InvalidRequest()
                self._respond(200, view.to_public_json())
                return
            raise InvalidRequest()
        except ServiceError as exc:
            self._error(exc)
        except Exception:
            self._error(ServiceError())

    def _serve_interactive(self, path: str) -> bool:
        if self.server.interactive is None:
            return False
        parts = self._parts(path)
        if len(parts) < 5 or parts[:2] != ["v1", "browser-sessions"] or parts[3] != "interactive":
            return False
        session_id, token = parts[2], parts[4]
        rest = "/".join(parts[5:]) or "vnc.html"
        try:
            if rest == "websockify" and self.headers.get("Upgrade", "").lower() == "websocket":
                self.server.interactive.proxy_websocket(self, session_id, token)
                return True
            asset = self.server.interactive.asset_path(session_id, token, rest)
            content = asset.read_bytes()
        except ServiceError:
            raise
        except OSError as exc:
            raise InvalidRequest() from exc
        content_type = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
        if content_type.startswith("text/"):
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(content)
        return True

    def _manager(self):
        if self.server.manager is None:
            raise ServiceError()
        return self.server.manager

    def _require_auth(self) -> None:
        expected = f"Bearer {self.server.config.service_token}"
        provided = self.headers.get("Authorization", "")
        if not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")):
            raise Unauthorized()

    def _read_json(self, required: bool) -> dict[str, object]:
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise InvalidRequest() from exc
        if length < 0 or length > self.server.config.max_body_bytes:
            raise InvalidRequest()
        if length == 0:
            if required:
                raise InvalidRequest()
            return {}
        try:
            payload = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise InvalidRequest() from exc
        if not isinstance(payload, dict):
            raise InvalidRequest()
        return payload

    @staticmethod
    def _parts(path: str) -> list[str]:
        return [unquote(part) for part in path.strip("/").split("/") if part]

    def _respond(self, status: int, payload: dict[str, object]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        self.wfile.write(encoded)

    def _error(self, error: ServiceError) -> None:
        self._respond(error.status_code, {"error": {"code": error.code, "message": error.public_message}})
