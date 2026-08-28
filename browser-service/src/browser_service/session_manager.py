from __future__ import annotations

from dataclasses import dataclass, field, replace
from pathlib import Path
import threading
import uuid
from typing import Any, Callable

from .extractor import ProductExtractor
from .models import (
    BrowserBusy,
    ConfiguredServiceError,
    InvalidHandoff,
    InvalidState,
    SessionNotFound,
    SessionState,
    SessionView,
    ServiceError,
)
from .profile_lock import ProfileLock
from .url_guard import validate_url
@dataclass
class _ManagedSession:
    view: SessionView
    process: Any
    profile_lock: ProfileLock
    opening_lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)
    opening_error: ServiceError | None = None


class SessionManager:
    def __init__(
        self,
        profile_root: Path,
        harness: Any,
        chromium_factory: Callable[[Path, str], Any],
        handoff_store: Any | None = None,
        url_validator: Callable[[str], str] = validate_url,
        observation_url_validator: Callable[[str], str] | None = None,
        extractor: ProductExtractor | None = None,
    ) -> None:
        self.profile_root = Path(profile_root)
        self.harness = harness
        self.chromium_factory = chromium_factory
        self.handoff_store = handoff_store
        self.url_validator = url_validator
        self.observation_url_validator = observation_url_validator or url_validator
        self.extractor = extractor or ProductExtractor()
        self._capacity = threading.Lock()
        self._state_lock = threading.RLock()
        self._sessions: dict[str, _ManagedSession] = {}
        self._active_session_id: str | None = None

    def start(self, profile_id: str, url: str) -> SessionView:
        source_url = self.url_validator(url)
        profile_lock: ProfileLock | None = None
        process: Any | None = None
        capacity_acquired = False
        try:
            profile_lock = ProfileLock.acquire(self.profile_root, profile_id)
            if not self._capacity.acquire(blocking=False):
                raise BrowserBusy()
            capacity_acquired = True
            session_id = uuid.uuid4().hex
            process = self.chromium_factory(profile_lock.profile_path, source_url)
            process.start()
            view = SessionView(
                session_id=session_id,
                profile_id=profile_id,
                source_url=source_url,
                state=SessionState.OPENING,
            )
            with self._state_lock:
                self._sessions[session_id] = _ManagedSession(view, process, profile_lock)
                self._active_session_id = session_id
            return self._copy_view(view)
        except ServiceError:
            if process is not None:
                process.terminate()
            if profile_lock is not None:
                profile_lock.release()
            if capacity_acquired:
                self._capacity.release()
            raise
        except Exception as exc:
            if process is not None:
                process.terminate()
            if profile_lock is not None:
                profile_lock.release()
            if capacity_acquired:
                self._capacity.release()
            raise ConfiguredServiceError() from exc

    def get(self, session_id: str) -> SessionView:
        with self._state_lock:
            managed = self._managed(session_id)
            opening = managed.view.state == SessionState.OPENING
        if opening:
            self._resolve_opening(managed)
        with self._state_lock:
            return self._copy_view(managed.view)

    def resume(self, session_id: str, handoff: str) -> SessionView:
        with self._state_lock:
            managed = self._managed(session_id)
            if managed.view.state not in (
                SessionState.LOGIN_REQUIRED,
                SessionState.CAPTCHA_REQUIRED,
                SessionState.TWO_FA_REQUIRED,
                SessionState.USER_INTERACTION_REQUIRED,
            ):
                raise InvalidState()
            if self.handoff_store is None:
                raise InvalidHandoff()
            self.handoff_store.consume(session_id, handoff)
            managed.view.handoff_token = None
            managed.view.interactive_url = None
            managed.view.state = SessionState.EXTRACTING
        try:
            observation = self.harness.inspect(managed.process.cdp_url)
            self._validate_observation_url(observation)
            with self._state_lock:
                if managed.view.state == SessionState.CLOSED:
                    return self._copy_view(managed.view)
                required_state = getattr(observation, "required_state", None)
                if required_state is None:
                    managed.view.state = SessionState.READY
                else:
                    managed.view.state = SessionState(required_state)
                    self._issue_handoff(managed)
        except ServiceError as exc:
            self._set_error(managed, exc.code, exc.public_message)
        except Exception:
            self._set_error(managed, "HARNESS_FAILED", "Browser inspection failed")
        with self._state_lock:
            return self._copy_view(managed.view)

    def extract(self, session_id: str) -> SessionView:
        with self._state_lock:
            managed = self._managed(session_id)
            opening = managed.view.state == SessionState.OPENING
        if opening:
            self._resolve_opening(managed)
        with self._state_lock:
            if managed.view.state != SessionState.READY:
                raise InvalidState()
            managed.view.state = SessionState.EXTRACTING
        try:
            observation = self.harness.inspect(managed.process.cdp_url)
            self._validate_observation_url(observation)
            required_state = getattr(observation, "required_state", None)
            with self._state_lock:
                if managed.view.state == SessionState.CLOSED:
                    return self._copy_view(managed.view)
                if required_state is not None:
                    managed.view.state = SessionState(required_state)
                    self._issue_handoff(managed)
                else:
                    candidate = self.extractor.extract(observation)
                    managed.view.candidate = replace(candidate, source_url=managed.view.source_url)
                    managed.view.state = SessionState.EXTRACTED
        except ServiceError as exc:
            self._set_error(managed, exc.code, exc.public_message)
        except Exception:
            self._set_error(managed, "HARNESS_FAILED", "Browser inspection failed")
        with self._state_lock:
            return self._copy_view(managed.view)

    def close(self, session_id: str) -> SessionView:
        with self._state_lock:
            managed = self._managed(session_id)
            if managed.view.state in (SessionState.CLOSED, SessionState.ERROR):
                return self._copy_view(managed.view)
            if self.handoff_store is not None:
                self.handoff_store.revoke(session_id)
            try:
                managed.process.terminate()
            finally:
                managed.profile_lock.release()
                managed.view.state = SessionState.CLOSED
                managed.view.interactive_url = None
                managed.view.handoff_token = None
                self._release_capacity(session_id)
            return self._copy_view(managed.view)

    def close_all(self) -> None:
        with self._state_lock:
            for session_id, managed in list(self._sessions.items()):
                if managed.view.state != SessionState.CLOSED:
                    self.close(session_id)

    def open_interactive(self, session_id: str, handoff: str) -> None:
        with self._state_lock:
            managed = self._managed(session_id)
            if managed.view.state not in (
                SessionState.LOGIN_REQUIRED,
                SessionState.CAPTCHA_REQUIRED,
                SessionState.TWO_FA_REQUIRED,
                SessionState.USER_INTERACTION_REQUIRED,
            ):
                raise InvalidHandoff()
            if self.handoff_store is None:
                raise InvalidHandoff()
            self.handoff_store.validate(session_id, handoff)

    def is_profile_locked(self, profile_id: str) -> bool:
        with self._state_lock:
            return any(
                managed.view.profile_id == profile_id and managed.view.state != SessionState.CLOSED
                for managed in self._sessions.values()
            )

    def profile_path(self, profile_id: str) -> Path:
        return self.profile_root / profile_id

    def _managed(self, session_id: str) -> _ManagedSession:
        managed = self._sessions.get(session_id)
        if managed is None:
            raise SessionNotFound()
        return managed

    def _resolve_opening(self, managed: _ManagedSession) -> ServiceError | None:
        """Serializa a abertura por sessão: apenas um caller executa _advance_opening
        (uma única inspect/transição). Concorrentes esperam em opening_lock — nunca
        no state lock, que o harness não pode bloquear — e recebem o mesmo erro
        original; erro terminal nunca é sobrescrito nem reinspeciona processo morto."""
        with managed.opening_lock:
            with self._state_lock:
                state = managed.view.state
            if state is not SessionState.OPENING:
                if state is SessionState.ERROR and managed.opening_error is not None:
                    return managed.opening_error
                return None
            return self._advance_opening(managed)

    def _validate_observation_url(self, observation: Any) -> None:
        observed_url = getattr(observation, "page_url", "")
        if observed_url:
            self.observation_url_validator(observed_url)

    def _issue_handoff(self, managed: _ManagedSession) -> None:
        if self.handoff_store is None:
            return
        handoff = self.handoff_store.issue(managed.view.session_id)
        managed.view.handoff_token = handoff.token
        managed.view.interactive_url = handoff.url

    def _advance_opening(self, managed: _ManagedSession) -> ServiceError | None:
        """Avança OPENING; em falha faz cleanup via _set_error e devolve o erro original."""
        try:
            open_url = getattr(self.harness, "open_url", None)
            if open_url is not None:
                open_url(managed.process.cdp_url, managed.view.source_url)
            observation = self.harness.inspect(managed.process.cdp_url)
            self._validate_observation_url(observation)
            with self._state_lock:
                if managed.view.state == SessionState.CLOSED:
                    return None
                required_state = getattr(observation, "required_state", None)
                if required_state is None:
                    managed.view.state = SessionState.READY
                    return None
                managed.view.state = SessionState(required_state)
                self._issue_handoff(managed)
            return None
        except ServiceError as exc:
            # publica o erro ANTES do estado ERROR: quem vir ERROR sob state lock
            # já encontra opening_error (atomicidade da transição).
            managed.opening_error = exc
            self._set_error(managed, exc.code, exc.public_message)
            return exc
        except Exception:
            error = ConfiguredServiceError()
            managed.opening_error = error
            self._set_error(managed, "HARNESS_FAILED", "Browser inspection failed")
            return error

    def _set_error(self, managed: _ManagedSession, code: str, message: str) -> None:
        with self._state_lock:
            if managed.view.state in (SessionState.CLOSED, SessionState.ERROR):
                return
            managed.view.state = SessionState.ERROR
            managed.view.error_code = code
            managed.view.error_message = message
            if self.handoff_store is not None:
                self.handoff_store.revoke(managed.view.session_id)
        try:
            managed.process.terminate()
        finally:
            with self._state_lock:
                if managed.view.state == SessionState.ERROR:
                    managed.profile_lock.release()
                    managed.view.interactive_url = None
                    managed.view.handoff_token = None
                    self._release_capacity(managed.view.session_id)

    def _release_capacity(self, session_id: str) -> None:
        if self._active_session_id == session_id:
            self._active_session_id = None
            self._capacity.release()

    @staticmethod
    def _copy_view(view: SessionView) -> SessionView:
        return SessionView(
            session_id=view.session_id,
            profile_id=view.profile_id,
            source_url=view.source_url,
            state=view.state,
            candidate=view.candidate,
            interactive_url=view.interactive_url,
            handoff_token=view.handoff_token,
            error_code=view.error_code,
            error_message=view.error_message,
        )
