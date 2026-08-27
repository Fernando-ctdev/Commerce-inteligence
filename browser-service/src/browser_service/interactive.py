from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
import secrets
import select
import socket
import time
from typing import Callable
from urllib.parse import quote

from .models import InvalidHandoff


@dataclass(frozen=True)
class Handoff:
    token: str
    url: str


@dataclass
class _HandoffRecord:
    session_id: str
    token_hash: str
    expires_at: float
    active: bool = True


class HandoffStore:
    def __init__(
        self,
        base_url: str,
        ttl_seconds: int = 300,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._records: dict[str, _HandoffRecord] = {}

    def issue(self, session_id: str) -> Handoff:
        token = secrets.token_urlsafe(32)
        self._records[session_id] = _HandoffRecord(
            session_id=session_id,
            token_hash=self._hash(token),
            expires_at=self.clock() + self.ttl_seconds,
        )
        base_path = f"/v1/browser-sessions/{session_id}/interactive/{token}"
        websocket_path = f"{base_path}/websockify"
        encoded_websocket_path = quote(websocket_path, safe="/")
        url = f"{self.base_url}{base_path}/vnc.html?autoconnect=true&path={encoded_websocket_path}"
        return Handoff(token=token, url=url)

    def validate(self, session_id: str, token: str) -> None:
        record = self._records.get(session_id)
        if record is None or not record.active or self.clock() >= record.expires_at:
            raise InvalidHandoff()
        if not secrets.compare_digest(record.token_hash, self._hash(token)):
            raise InvalidHandoff()

    def consume(self, session_id: str, token: str) -> None:
        self.validate(session_id, token)
        self._records[session_id].active = False

    def revoke(self, session_id: str) -> None:
        record = self._records.get(session_id)
        if record is not None:
            record.active = False

    @staticmethod
    def _hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()


class InteractiveProxy:
    def __init__(
        self,
        handoffs: HandoffStore,
        novnc_root: Path,
        websockify_host: str = "127.0.0.1",
        websockify_port: int = 6080,
    ):
        self.handoffs = handoffs
        self.novnc_root = Path(novnc_root).resolve()
        self.websockify_host = websockify_host
        self.websockify_port = websockify_port

    def asset_path(self, session_id: str, token: str, requested_path: str) -> Path:
        self.handoffs.validate(session_id, token)
        relative = requested_path.lstrip("/") or "vnc.html"
        candidate = (self.novnc_root / relative).resolve()
        if candidate != self.novnc_root and self.novnc_root not in candidate.parents:
            raise InvalidHandoff()
        if not candidate.is_file():
            raise InvalidHandoff()
        return candidate

    def proxy_websocket(self, handler, session_id: str, token: str) -> None:
        self.handoffs.validate(session_id, token)
        upstream = socket.create_connection(
            (self.websockify_host, self.websockify_port),
            timeout=3,
        )
        try:
            request_lines = ["GET /websockify HTTP/1.1", "Host: 127.0.0.1:6080"]
            for name in (
                "Upgrade",
                "Connection",
                "Sec-WebSocket-Key",
                "Sec-WebSocket-Version",
                "Sec-WebSocket-Protocol",
                "Origin",
            ):
                value = handler.headers.get(name)
                if value:
                    request_lines.append(f"{name}: {value}")
            upstream.sendall(("\r\n".join(request_lines) + "\r\n\r\n").encode("ascii"))
            response = _read_http_headers(upstream)
            handler.connection.sendall(response)
            sockets = [handler.connection, upstream]
            while True:
                readable, _, _ = select.select(sockets, [], [], 1)
                if not readable:
                    continue
                for source in readable:
                    payload = source.recv(65536)
                    if not payload:
                        return
                    target = upstream if source is handler.connection else handler.connection
                    target.sendall(payload)
        finally:
            upstream.close()


def _read_http_headers(sock: socket.socket) -> bytes:
    data = bytearray()
    while b"\r\n\r\n" not in data and len(data) <= 16 * 1024:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data.extend(chunk)
    if b"\r\n\r\n" not in data:
        raise InvalidHandoff()
    return bytes(data)


__all__ = ["Handoff", "HandoffStore", "InteractiveProxy"]
