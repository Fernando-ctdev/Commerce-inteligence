import unittest

from browser_service.harness import classify_interaction
from browser_service.models import SessionState


class InteractionClassificationTests(unittest.TestCase):
    def test_classifies_human_challenges_without_automation(self):
        self.assertEqual(classify_interaction(["Complete the CAPTCHA"]), SessionState.CAPTCHA_REQUIRED)
        self.assertEqual(classify_interaction(["Security Check"]), SessionState.CAPTCHA_REQUIRED)
        self.assertEqual(classify_interaction(["Enter your 2FA code"]), SessionState.TWO_FA_REQUIRED)
        self.assertEqual(classify_interaction(["Scan the QR code to log in"]), SessionState.LOGIN_REQUIRED)


if __name__ == "__main__":
    unittest.main()
