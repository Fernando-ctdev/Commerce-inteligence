from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from browser_service.interactive import HandoffStore, InteractiveProxy
from browser_service.models import InvalidHandoff


class InteractiveProxyTests(unittest.TestCase):
    def test_assets_require_active_session_handoff_and_block_traversal(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "vnc.html").write_text("<html></html>", encoding="utf-8")
            store = HandoffStore("http://127.0.0.1:8080", clock=lambda: 1000.0)
            handoff = store.issue("session-12345678")
            proxy = InteractiveProxy(store, root)

            self.assertEqual(proxy.asset_path("session-12345678", handoff.token, "vnc.html"), root / "vnc.html")
            with self.assertRaises(InvalidHandoff):
                proxy.asset_path("session-12345678", handoff.token, "../vnc.html")

            store.consume("session-12345678", handoff.token)
            with self.assertRaises(InvalidHandoff):
                proxy.asset_path("session-12345678", handoff.token, "vnc.html")


if __name__ == "__main__":
    unittest.main()
