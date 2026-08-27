from __future__ import annotations

from pathlib import Path
import re

from .models import ProfileIdRejected, ProfileInUse

try:
    import fcntl
except ImportError:  # pragma: no cover - exercised on Windows development hosts
    fcntl = None
    import msvcrt


_PROFILE_ID = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


class ProfileLock:
    def __init__(self, profile_path: Path, lock_file):
        self.profile_path = profile_path
        self._lock_file = lock_file
        self._released = False

    @classmethod
    def acquire(cls, profile_root: Path, profile_id: str) -> "ProfileLock":
        if not isinstance(profile_id, str) or not _PROFILE_ID.fullmatch(profile_id):
            raise ProfileIdRejected()
        root = Path(profile_root).resolve()
        profile_path = (root / profile_id).resolve()
        if profile_path.parent != root:
            raise ProfileIdRejected()
        lock_file = None
        try:
            profile_path.mkdir(parents=True, exist_ok=True)
            lock_file = profile_path.joinpath(".browser-service.lock").open("a+")
            _lock(lock_file)
        except BlockingIOError as exc:
            if lock_file is not None:
                lock_file.close()
            raise ProfileInUse() from exc
        except OSError as exc:
            if lock_file is not None:
                lock_file.close()
            raise ProfileIdRejected() from exc
        return cls(profile_path, lock_file)

    def release(self) -> None:
        if self._released:
            return
        _unlock(self._lock_file)
        self._lock_file.close()
        self._released = True

    def __enter__(self) -> "ProfileLock":
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback) -> None:
        self.release()


def _lock(lock_file) -> None:
    if fcntl is not None:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return
    lock_file.seek(0)
    lock_file.write("0")
    lock_file.flush()
    lock_file.seek(0)
    try:
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError as exc:
        raise BlockingIOError() from exc


def _unlock(lock_file) -> None:
    if fcntl is not None:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        return
    lock_file.seek(0)
    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)


__all__ = ["ProfileIdRejected", "ProfileInUse", "ProfileLock"]
