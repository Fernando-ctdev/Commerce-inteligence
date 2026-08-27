from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from browser_service.chromium import ChromiumProcess


class FakeProcess:
    def poll(self):
        return None


class ChromiumProcessTests(unittest.TestCase):
    def test_launches_desktop_web_viewport_without_mobile_emulation(self):
        with TemporaryDirectory() as directory:
            process = ChromiumProcess(Path(directory), "https://shop.tiktok.com/product/123")
            with patch("browser_service.chromium.subprocess.Popen", return_value=FakeProcess()) as popen, patch(
                "browser_service.chromium._wait_for_cdp"
            ):
                process.start()

            args = popen.call_args.args[0]
            self.assertIn("--window-size=1440,900", args)
            self.assertIn("--force-device-scale-factor=1", args)
            self.assertNotIn("--mobile", args)

    def test_removes_stale_singleton_files_before_launch(self):
        with TemporaryDirectory() as directory:
            profile = Path(directory)
            service_lock = profile / ".browser-service.lock"
            service_lock.touch()
            for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
                (profile / name).touch()

            process = ChromiumProcess(profile, "https://shop.tiktok.com/product/123")
            with patch("browser_service.chromium.subprocess.Popen", return_value=FakeProcess()), patch(
                "browser_service.chromium._wait_for_cdp"
            ):
                process.start()

            for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
                self.assertFalse((profile / name).exists())
            self.assertTrue(service_lock.exists())


if __name__ == "__main__":
    unittest.main()
