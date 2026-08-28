from __future__ import annotations

import os

from .chromium import ChromiumProcess
from .config import ServiceConfig
from .harness import HarnessClient
from .interactive import HandoffStore, InteractiveProxy
from .server import BrowserHttpServer, BrowserRequestHandler
from .session_manager import SessionManager
from .url_guard import MAX_OBSERVED_URL_LENGTH, validate_url


def main() -> None:
    config = ServiceConfig.from_env()
    harness = HarnessClient(config.harness_command, timeout_seconds=config.session_timeout_seconds)
    handoffs = HandoffStore(config.public_origin, ttl_seconds=config.novnc_ttl_seconds)
    interactive = InteractiveProxy(handoffs, config.novnc_root)

    def chromium_factory(profile_path, source_url):
        return ChromiumProcess(
            profile_path=profile_path,
            initial_url=source_url,
            cdp_bind_host=config.cdp_bind_host,
            display=os.environ.get("DISPLAY", ":99"),
            ready_timeout_seconds=config.cdp_ready_timeout_seconds,
        )

    manager = SessionManager(
        profile_root=config.profile_root,
        harness=harness,
        chromium_factory=chromium_factory,
        handoff_store=handoffs,
        url_validator=lambda url: validate_url(url, allowed_hosts=config.allowed_tiktok_hosts),
        observation_url_validator=lambda url: validate_url(
            url, allowed_hosts=config.allowed_tiktok_hosts, max_length=MAX_OBSERVED_URL_LENGTH
        ),
    )
    server = BrowserHttpServer(
        (config.bind_host, config.port),
        BrowserRequestHandler,
        config,
        manager=manager,
        interactive=interactive,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        manager.close_all()
        server.server_close()


if __name__ == "__main__":
    main()
