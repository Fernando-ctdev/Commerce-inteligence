import unittest

from browser_service.url_guard import UrlRejected, validate_url


class UrlGuardTests(unittest.TestCase):
    def setUp(self):
        self.public_resolver = lambda host: ["93.184.216.34"]
    def test_accepts_shop_tiktok_https(self):
        self.assertEqual(
            validate_url(
                "https://shop.tiktok.com/product/123",
                resolver=self.public_resolver,
            ),
            "https://shop.tiktok.com/product/123",
        )

    def test_rejects_non_https_and_local_schemes(self):
        for value in (
            "http://shop.tiktok.com/product/123",
            "file:///tmp/page",
            "chrome://settings",
        ):
            with self.subTest(value=value), self.assertRaises(UrlRejected):
                validate_url(value, resolver=self.public_resolver)

    def test_rejects_local_private_metadata_and_non_tiktok_hosts(self):
        for value in (
            "https://localhost/",
            "https://127.0.0.1/",
            "https://169.254.169.254/latest/meta-data/",
            "https://internal.example/product/123",
        ):
            with self.subTest(value=value), self.assertRaises(UrlRejected):
                validate_url(value, resolver=self.public_resolver)

    def test_rejects_userinfo_credentials_and_fragment(self):
        for value in (
            "https://user:pass@shop.tiktok.com/product/123",
            "https://shop.tiktok.com/product/123#token=secret",
        ):
            with self.subTest(value=value), self.assertRaises(UrlRejected):
                validate_url(value, resolver=self.public_resolver)

    def test_rejects_secret_query_keys(self):
        with self.assertRaises(UrlRejected):
            validate_url(
                "https://shop.tiktok.com/product/123?access_token=secret",
                resolver=self.public_resolver,
            )

    def test_observation_redirect_may_be_longer_without_relaxing_default_input_limit(self):
        value = "https://www.tiktok.com/login?redirect_url=" + ("a" * 2_100)
        with self.assertRaises(UrlRejected):
            validate_url(value, resolver=self.public_resolver)
        self.assertEqual(
            validate_url(
                value,
                resolver=self.public_resolver,
                allowed_hosts=("shop.tiktok.com", "*.tiktok.com"),
                max_length=8_192,
            ),
            value,
        )

    def test_rejects_reserved_dns_result(self):
        with self.assertRaises(UrlRejected):
            validate_url(
                "https://shop.tiktok.com/product/123",
                resolver=lambda host: ["10.0.0.8"],
            )


if __name__ == "__main__":
    unittest.main()
