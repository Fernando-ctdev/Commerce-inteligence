from unittest.mock import patch
import unittest

from browser_service.harness import HarnessClient, classify_interaction
from browser_service.models import SessionState


class InteractionClassificationTests(unittest.TestCase):
    def test_classifies_human_challenges_without_automation(self):
        self.assertEqual(classify_interaction(["Complete the CAPTCHA"]), SessionState.CAPTCHA_REQUIRED)
        self.assertEqual(classify_interaction(["Security Check"]), SessionState.CAPTCHA_REQUIRED)
        self.assertEqual(classify_interaction(["Enter your 2FA code"]), SessionState.TWO_FA_REQUIRED)
        self.assertEqual(classify_interaction(["Scan the QR code to log in"]), SessionState.LOGIN_REQUIRED)


class InspectionImageTests(unittest.TestCase):
    def test_inspection_collects_meta_and_lazy_image_sources(self):
        result = {
            "page_url": "https://shop.tiktok.com/product/123",
            "title": "Produto",
            "accessibility_names": ["Produto"],
            "text": [],
            "json_ld": [],
            "image_urls": ["https://p16.tiktokcdn.com/current.jpg", "https://p16.tiktokcdn.com/data-src.jpg"],
            "meta_image_urls": ["https://p16.tiktokcdn.com/meta.jpg"],
        }
        captured = []
        client = HarnessClient()

        def run(_cdp_url, script):
            captured.append(script)
            return result

        with patch.object(client, "_run", side_effect=run):
            observation = client.inspect("http://127.0.0.1:39000")

        self.assertEqual(
            observation.image_urls,
            ["https://p16.tiktokcdn.com/current.jpg", "https://p16.tiktokcdn.com/data-src.jpg"],
        )
        self.assertEqual(getattr(observation, "meta_image_urls", []), ["https://p16.tiktokcdn.com/meta.jpg"])
        self.assertIn("og:image", captured[0])
        self.assertIn("currentSrc", captured[0])
        self.assertIn("data-src", captured[0])


if __name__ == "__main__":
    unittest.main()
