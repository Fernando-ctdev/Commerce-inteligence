from __future__ import annotations

from ipaddress import ip_address
from socket import AF_UNSPEC, SOCK_STREAM, getaddrinfo, gaierror
from typing import Callable, Iterable
from urllib.parse import parse_qsl, urlsplit, urlunsplit

from .models import UrlRejected


Resolver = Callable[[str], Iterable[str]]
_SECRET_QUERY_KEYS = {
    "access_token",
    "auth",
    "code",
    "cookie",
    "password",
    "passwd",
    "secret",
    "session",
    "sid",
    "token",
}
MAX_URL_LENGTH = 2_048
MAX_OBSERVED_URL_LENGTH = 8_192


def _default_resolver(host: str) -> list[str]:
    try:
        return list(
            {
                info[4][0]
                for info in getaddrinfo(host, None, family=AF_UNSPEC, type=SOCK_STREAM)
            }
        )
    except gaierror as exc:
        raise UrlRejected() from exc


def _is_reserved_address(value: str) -> bool:
    try:
        address = ip_address(value)
    except ValueError as exc:
        raise UrlRejected() from exc
    return any(
        (
            address.is_loopback,
            address.is_private,
            address.is_link_local,
            address.is_multicast,
            address.is_unspecified,
            address.is_reserved,
        )
    )


def _allowed_host(host: str, allowed_hosts: tuple[str, ...]) -> bool:
    for allowed in allowed_hosts:
        normalized = allowed.lower().rstrip(".")
        if normalized.startswith("*."):
            suffix = normalized[1:]
            if host.endswith(suffix) and host != suffix[1:]:
                return True
        elif host == normalized:
            return True
    return False


def validate_url(
    raw_url: str,
    *,
    resolver: Resolver | None = None,
    allowed_hosts: tuple[str, ...] = ("shop.tiktok.com",),
    max_length: int = MAX_URL_LENGTH,
) -> str:
    if not isinstance(raw_url, str) or not raw_url or not isinstance(max_length, int) or max_length <= 0 or len(raw_url) > max_length:
        raise UrlRejected()

    try:
        parsed = urlsplit(raw_url.strip())
        host = parsed.hostname
        port = parsed.port
    except (AttributeError, ValueError) as exc:
        raise UrlRejected() from exc

    if parsed.scheme.lower() != "https" or host is None:
        raise UrlRejected()
    if parsed.username is not None or parsed.password is not None or "#" in raw_url:
        raise UrlRejected()
    if port not in (None, 443) or not parsed.netloc:
        raise UrlRejected()

    try:
        normalized_host = host.encode("idna").decode("ascii").lower().rstrip(".")
    except UnicodeError as exc:
        raise UrlRejected() from exc
    if not _allowed_host(normalized_host, allowed_hosts):
        raise UrlRejected()

    query_keys = {key.lower() for key, _ in parse_qsl(parsed.query, keep_blank_values=True)}
    if query_keys & _SECRET_QUERY_KEYS:
        raise UrlRejected()

    resolved = (resolver or _default_resolver)(normalized_host)
    addresses = list(resolved)
    if not addresses or any(_is_reserved_address(address) for address in addresses):
        raise UrlRejected()

    return urlunsplit(
        (
            "https",
            normalized_host,
            parsed.path or "/",
            parsed.query,
            "",
        )
    )


__all__ = ["MAX_OBSERVED_URL_LENGTH", "MAX_URL_LENGTH", "UrlRejected", "validate_url"]
