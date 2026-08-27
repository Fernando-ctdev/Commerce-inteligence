from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.error import URLError
from urllib.request import urlopen

from .models import ConfiguredServiceError

_CHROMIUM_SINGLETON_FILES = ("SingletonLock", "SingletonSocket", "SingletonCookie")


@dataclass
class ChromiumProcess:
    profile_path: Path
    initial_url: str
    cdp_bind_host: str = "127.0.0.1"
    display: str = ":99"
    ready_timeout_seconds: float = 15.0
    chromium_binary: str = "chromium"

    def __post_init__(self) -> None:
        self._process: subprocess.Popen[bytes] | None = None
        self._cdp_port: int | None = None

    @property
    def cdp_url(self) -> str:
        if self._cdp_port is None:
            raise ConfiguredServiceError()
        return f"http://{self.cdp_bind_host}:{self._cdp_port}"

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def start(self) -> None:
        if self.is_running:
            return
        for name in _CHROMIUM_SINGLETON_FILES:
            try:
                self.profile_path.joinpath(name).unlink()
            except FileNotFoundError:
                pass
        self._cdp_port = _free_local_port(self.cdp_bind_host)
        args = [
            self.chromium_binary,
            f"--user-data-dir={self.profile_path}",
            f"--remote-debugging-address={self.cdp_bind_host}",
            f"--remote-debugging-port={self._cdp_port}",
            f"--display={self.display}",
            "--window-size=1440,900",
            "--force-device-scale-factor=1",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-dev-shm-usage",
            "about:blank",
        ]
        try:
            self._process = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                env={**os.environ, "DISPLAY": self.display},
            )
            _wait_for_cdp(self.cdp_url, self.ready_timeout_seconds, self._process)
        except (OSError, TimeoutError, URLError) as exc:
            self.terminate()
            raise ConfiguredServiceError() from exc

    def terminate(self) -> None:
        process = self._process
        self._process = None
        if process is None:
            return
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def _free_local_port(host: str) -> int:
    with socket.socket(socket.AF_INET6 if ":" in host else socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _wait_for_cdp(cdp_url: str, timeout_seconds: float, process: subprocess.Popen[bytes]) -> None:
    deadline = time.monotonic() + timeout_seconds
    endpoint = f"{cdp_url}/json/version"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise ConfiguredServiceError()
        try:
            with urlopen(endpoint, timeout=0.5) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            time.sleep(0.1)
    raise TimeoutError("CDP endpoint did not become ready")
