from http.client import HTTPConnection
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import unittest

from browser_service.config import ServiceConfig
from browser_service.interactive import HandoffStore, InteractiveProxy
from browser_service.models import SessionNotFound, SessionState, SessionView
from browser_service.server import BrowserHttpServer, BrowserRequestHandler


class FakeManager:
    session_id = "session-12345678"

    def _require(self, session_id):
        if session_id != self.session_id:
            raise SessionNotFound()

    def start(self, _profile_id, url):
        return SessionView(self.session_id, "profile-fernando-01", url, SessionState.OPENING)

    def get(self, session_id):
        self._require(session_id)
        return SessionView(self.session_id, "profile-fernando-01", "https://shop.tiktok.com/product/123", SessionState.READY)

    def resume(self, session_id, _handoff):
        return self.get(session_id)

    def extract(self, session_id):
        return self.get(session_id)

    def close(self, session_id):
        self._require(session_id)
        return SessionView(self.session_id, "profile-fernando-01", "https://shop.tiktok.com/product/123", SessionState.CLOSED)


class HttpTestClient:
    def __init__(self, server):
        self.server = server
        self.thread = threading.Thread(target=server.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, token=None, body=None, with_headers=False):
        connection = HTTPConnection(*self.server.server_address)
        headers = {"Content-Type": "application/json"}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        encoded = json.dumps(body).encode() if body is not None else None
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        text = response.read().decode()
        response_headers = response.headers
        connection.close()
        if with_headers:
            return response.status, response_headers, text
        return response.status, text


class HttpContractTests(unittest.TestCase):
    def setUp(self):
        config = ServiceConfig.from_env({"BROWSER_SERVICE_TOKEN": "test-token"})
        self.server = BrowserHttpServer(("127.0.0.1", 0), BrowserRequestHandler, config)
        self.server.manager = FakeManager()
        self.client = HttpTestClient(self.server)

    def tearDown(self):
        self.client.close()

    def test_health_is_public(self):
        status, text = self.client.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(text)["status"], "ok")

    def test_session_requires_internal_bearer_token(self):
        status, _ = self.client.request(
            "POST",
            "/v1/browser-sessions",
            body={"profileId": "profile-fernando-01", "url": "https://shop.tiktok.com/product/123"},
        )
        self.assertEqual(status, 401)

    def test_authorized_session_response_never_contains_sensitive_runtime_data(self):
        status, text = self.client.request(
            "POST",
            "/v1/browser-sessions",
            token="test-token",
            body={"profileId": "profile-fernando-01", "url": "https://shop.tiktok.com/product/123"},
        )
        self.assertEqual(status, 200)
        self.assertNotIn("remote-debugging-port", text)
        self.assertNotIn("/browser-profiles", text)
        self.assertNotIn("cookie", text.lower())

    def test_unknown_session_is_sanitized(self):
        status, _ = self.client.request(
            "POST",
            "/v1/browser-sessions/unknown/extract",
            token="test-token",
            body={},
        )
        self.assertEqual(status, 404)

    def test_interactive_assets_use_browser_mime_types(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "app/images").mkdir(parents=True)
            (root / "vnc.html").write_text("<html></html>", encoding="utf-8")
            (root / "app/ui.js").write_text("console.log('ok');", encoding="utf-8")
            (root / "app/images/drag.svg").write_text("<svg></svg>", encoding="utf-8")
            handoffs = HandoffStore("http://127.0.0.1:8080")
            handoff = handoffs.issue(FakeManager.session_id)
            self.server.interactive = InteractiveProxy(handoffs, root)

            for asset, expected in (
                ("vnc.html", "text/html; charset=utf-8"),
                ("app/ui.js", "text/javascript; charset=utf-8"),
                ("app/images/drag.svg", "image/svg+xml"),
            ):
                status, headers, _ = self.client.request(
                    "GET",
                    f"/v1/browser-sessions/{FakeManager.session_id}/interactive/{handoff.token}/{asset}",
                    with_headers=True,
                )
                self.assertEqual(status, 200)
                self.assertEqual(headers["Content-Type"], expected)


if __name__ == "__main__":
    unittest.main()
