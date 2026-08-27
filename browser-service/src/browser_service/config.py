from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Mapping


class ConfigError(ValueError):
    """Raised when required service configuration is missing or invalid."""


@dataclass(frozen=True)
class ServiceConfig:
    service_token: str
    bind_host: str = "0.0.0.0"
    port: int = 8080
    public_origin: str = "http://127.0.0.1:8080"
    profile_root: Path = Path("/browser-profiles")
    cdp_bind_host: str = "127.0.0.1"
    cdp_ready_timeout_seconds: float = 15.0
    session_timeout_seconds: int = 900
    novnc_ttl_seconds: int = 300
    max_body_bytes: int = 64 * 1024
    allowed_tiktok_hosts: tuple[str, ...] = ("shop.tiktok.com", "*.tiktok.com")
    harness_command: str = "browser-harness"
    novnc_root: Path = Path("/usr/share/novnc")
    websockify_url: str = "http://127.0.0.1:6080"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "ServiceConfig":
        values = os.environ if env is None else env
        token = values.get("BROWSER_SERVICE_TOKEN", "").strip()
        if not token:
            raise ConfigError("BROWSER_SERVICE_TOKEN is required")

        allowed_hosts = tuple(
            host.strip().lower().rstrip(".")
            for host in values.get("ALLOWED_TIKTOK_HOSTS", "shop.tiktok.com,*.tiktok.com").split(",")
            if host.strip()
        )
        if not allowed_hosts:
            raise ConfigError("ALLOWED_TIKTOK_HOSTS must contain one host")
        if any(host != "shop.tiktok.com" and not host.endswith(".tiktok.com") for host in allowed_hosts):
            raise ConfigError("ALLOWED_TIKTOK_HOSTS must contain TikTok hosts")

        cdp_bind_host = values.get("CDP_BIND_HOST", "127.0.0.1")
        if cdp_bind_host != "127.0.0.1":
            raise ConfigError("CDP_BIND_HOST must be 127.0.0.1")

        return cls(
            service_token=token,
            bind_host=values.get("BROWSER_SERVICE_BIND", "0.0.0.0"),
            port=_positive_int(values, "BROWSER_SERVICE_PORT", 8080),
            profile_root=Path(values.get("PROFILE_ROOT", "/browser-profiles")),
            public_origin=values.get("BROWSER_SERVICE_PUBLIC_ORIGIN", "http://127.0.0.1:8080"),
            cdp_ready_timeout_seconds=_positive_float(values, "CDP_READY_TIMEOUT_SECONDS", 15.0),
            session_timeout_seconds=_positive_int(values, "SESSION_TIMEOUT_SECONDS", 900),
            novnc_ttl_seconds=_positive_int(values, "NOVNC_TTL_SECONDS", 300),
            max_body_bytes=_positive_int(values, "MAX_BODY_BYTES", 64 * 1024),
            allowed_tiktok_hosts=allowed_hosts,
            harness_command=values.get("BROWSER_HARNESS_COMMAND", "browser-harness"),
            novnc_root=Path(values.get("NOVNC_ROOT", "/usr/share/novnc")),
            websockify_url=values.get("WEBSOCKIFY_URL", "http://127.0.0.1:6080"),
        )


def _positive_int(values: Mapping[str, str], name: str, default: int) -> int:
    raw = values.get(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer") from exc
    if value <= 0:
        raise ConfigError(f"{name} must be positive")
    return value


def _positive_float(values: Mapping[str, str], name: str, default: float) -> float:
    raw = values.get(name, str(default))
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number") from exc
    if value <= 0:
        raise ConfigError(f"{name} must be positive")
    return value
