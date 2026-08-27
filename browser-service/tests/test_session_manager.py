from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
import threading

from browser_service.config import ConfigError, ServiceConfig
from browser_service.harness import PageObservation
from browser_service.interactive import HandoffStore
from browser_service.models import InvalidHandoff, ProfileInUse, SessionState
from browser_service.session_manager import SessionManager


class FakeChromium:
    def __init__(self):
        self.start_count = 0
        self.terminate_count = 0
        self.cdp_url = "http://127.0.0.1:39123"

    def start(self):
        self.start_count += 1

    def terminate(self):
        self.terminate_count += 1


class FakeHarness:
    def __init__(self, required_state=None, observation=None):
        self.required_state = required_state
        self.observation = observation

    def inspect(self, _cdp_url):
        if self.observation is not None:
            return self.observation
        return SimpleNamespace(required_state=self.required_state)


class BlockingHarness(FakeHarness):
    def __init__(self):
        super().__init__()
        self.started = threading.Event()
        self.release = threading.Event()

    def inspect(self, _cdp_url):
        self.started.set()
        self.release.wait(timeout=2)
        return SimpleNamespace(required_state=None)


class ConfigTests(unittest.TestCase):
    def test_defaults_bind_cdp_and_novnc_to_loopback(self):
        config = ServiceConfig.from_env({"BROWSER_SERVICE_TOKEN": "test-token"})
        self.assertEqual(config.bind_host, "0.0.0.0")
        self.assertEqual(config.cdp_bind_host, "127.0.0.1")
        self.assertEqual(config.profile_root, Path("/browser-profiles"))
        self.assertEqual(config.novnc_ttl_seconds, 300)

    def test_rejects_non_loopback_cdp_binding(self):
        with self.assertRaises(ConfigError):
            ServiceConfig.from_env(
                {
                    "BROWSER_SERVICE_TOKEN": "test-token",
                    "CDP_BIND_HOST": "0.0.0.0",
                }
            )


class SessionStateTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = TemporaryDirectory()
        self.fake_chromium = FakeChromium()
        self.harness = FakeHarness()
        self.manager = SessionManager(
            profile_root=Path(self.tempdir.name),
            harness=self.harness,
            chromium_factory=lambda _profile_path, _url: self.fake_chromium,
            url_validator=lambda url: url,
        )
    def tearDown(self):
        self.manager.close_all()
        self.tempdir.cleanup()

    def test_start_locks_profile_and_enters_opening(self):
        session = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.assertEqual(session.state, SessionState.OPENING)
        self.assertTrue(self.manager.is_profile_locked("profile-fernando-01"))

    def test_get_advances_opening_to_ready_after_harness_inspection(self):
        session = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.assertEqual(self.manager.get(session.session_id).state, SessionState.READY)

    def test_second_session_same_profile_is_rejected_before_chromium(self):
        self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        with self.assertRaises(ProfileInUse):
            self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/456")
        self.assertEqual(self.fake_chromium.start_count, 1)
    def test_extract_returns_factual_candidate_and_extracted_state(self):
        session = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.manager.get(session.session_id)
        self.harness.observation = PageObservation(
            page_url="https://shop.tiktok.com/product/123",
            title="A product",
            accessibility_names=["A product"],
            text=[],
            json_ld=[],
            image_urls=[],
        )
        extracted = self.manager.extract(session.session_id)
        self.assertEqual(extracted.state, SessionState.EXTRACTED)
        self.assertEqual(extracted.candidate.name, "A product")


    def test_close_kills_owned_chromium_and_preserves_profile(self):
        session = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        self.manager.close(session.session_id)
        self.assertEqual(self.manager.get(session.session_id).state, SessionState.CLOSED)
        self.assertTrue(self.manager.profile_path("profile-fernando-01").exists())
        self.assertEqual(self.fake_chromium.terminate_count, 1)

    def test_close_releases_slot_while_harness_inspection_is_blocked(self):
        harness = BlockingHarness()
        processes = []
        manager = SessionManager(
            profile_root=Path(self.tempdir.name),
            harness=harness,
            chromium_factory=lambda _profile_path, _url: processes.append(FakeChromium()) or processes[-1],
            url_validator=lambda url: url,
        )
        first = manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        polling = threading.Thread(target=manager.get, args=(first.session_id,))
        polling.start()
        self.assertTrue(harness.started.wait(timeout=1))

        closed = threading.Event()

        def close_first():
            manager.close(first.session_id)
            closed.set()

        closing = threading.Thread(target=close_first)
        closing.start()
        try:
            self.assertTrue(closed.wait(timeout=0.5))
            second = manager.start("profile-fernando-02", "https://shop.tiktok.com/product/456")
            self.assertEqual(second.state, SessionState.OPENING)
            manager.close(second.session_id)
        finally:
            harness.release.set()
            closing.join(timeout=2)
            polling.join(timeout=2)
            manager.close_all()


class FakeClock:
    def __init__(self):
        self.value = 1000.0

    def now(self):
        return self.value

    def advance(self, seconds):
        self.value += seconds


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = TemporaryDirectory()
        self.fake_clock = FakeClock()
        self.fake_chromium = FakeChromium()
        self.harness = FakeHarness(required_state=SessionState.LOGIN_REQUIRED)
        self.manager = SessionManager(
            profile_root=Path(self.tempdir.name),
            harness=self.harness,
            chromium_factory=lambda _profile_path, _url: self.fake_chromium,
            handoff_store=HandoffStore(
                base_url="http://127.0.0.1:8080",
                clock=self.fake_clock.now,
            ),
            url_validator=lambda url: url,
        )

    def tearDown(self):
        self.manager.close_all()
        self.tempdir.cleanup()
    def test_handoff_exists_only_while_blocked(self):
        started = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        view = self.manager.get(started.session_id)
        self.assertEqual(view.state, SessionState.LOGIN_REQUIRED)
        self.assertTrue(view.interactive_url)
        self.harness.required_state = None
        resumed = self.manager.resume(view.session_id, view.handoff_token)
        self.assertEqual(resumed.state, SessionState.READY)
        self.assertIsNone(self.manager.get(view.session_id).interactive_url)
        with self.assertRaises(InvalidHandoff):
            self.manager.open_interactive(view.session_id, view.handoff_token)

    def test_expired_handoff_is_rejected(self):
        started = self.manager.start("profile-fernando-01", "https://shop.tiktok.com/product/123")
        view = self.manager.get(started.session_id)
        self.fake_clock.advance(seconds=301)
        with self.assertRaises(InvalidHandoff):
            self.manager.open_interactive(view.session_id, view.handoff_token)


if __name__ == "__main__":
    unittest.main()
