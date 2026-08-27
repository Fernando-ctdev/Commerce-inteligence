from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class SessionState(str, Enum):
    OPENING = "OPENING"
    READY = "READY"
    LOGIN_REQUIRED = "LOGIN_REQUIRED"
    CAPTCHA_REQUIRED = "CAPTCHA_REQUIRED"
    TWO_FA_REQUIRED = "2FA_REQUIRED"
    USER_INTERACTION_REQUIRED = "USER_INTERACTION_REQUIRED"
    EXTRACTING = "EXTRACTING"
    EXTRACTED = "EXTRACTED"
    ERROR = "ERROR"
    CLOSED = "CLOSED"


@dataclass(frozen=True)
class Price:
    amount: float
    currency: str

    def to_json(self) -> dict[str, Any]:
        return {"amount": self.amount, "currency": self.currency}


@dataclass(frozen=True)
class ProductCandidate:
    name: str | None
    description: str | None
    price: Price | None
    features: list[str]
    images: list[str]
    seller: str | None
    source_url: str

    def to_json(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "features": list(self.features),
            "images": list(self.images),
            "sourceUrl": self.source_url,
        }
        if self.name is not None:
            payload["name"] = self.name
        if self.description is not None:
            payload["description"] = self.description
        if self.price is not None:
            payload["price"] = self.price.to_json()
        if self.seller is not None:
            payload["seller"] = self.seller
        return payload


@dataclass
class SessionView:
    session_id: str
    profile_id: str
    source_url: str
    state: SessionState
    candidate: ProductCandidate | None = None
    interactive_url: str | None = None
    handoff_token: str | None = None
    error_code: str | None = None
    error_message: str | None = None

    def to_public_json(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "sessionId": self.session_id,
            "profileId": self.profile_id,
            "sourceUrl": self.source_url,
            "state": self.state.value,
        }
        if self.candidate is not None:
            payload["candidate"] = self.candidate.to_json()
        if self.interactive_url is not None:
            payload["interactiveUrl"] = self.interactive_url
        if self.error_code is not None:
            payload["error"] = {"code": self.error_code, "message": self.error_message or "Browser operation failed"}
        return payload


class ServiceError(Exception):
    status_code = 500
    code = "BROWSER_SERVICE_ERROR"
    public_message = "Browser operation failed"

    def __init__(self, message: str | None = None):
        super().__init__(message or self.public_message)
        self.detail = message or self.public_message


class ConfiguredServiceError(ServiceError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    public_message = "Browser service unavailable"


class Unauthorized(ServiceError):
    status_code = 401
    code = "UNAUTHORIZED"
    public_message = "Unauthorized"


class SessionNotFound(ServiceError):
    status_code = 404
    code = "SESSION_NOT_FOUND"
    public_message = "Session not found"


class InvalidRequest(ServiceError):
    status_code = 400
    code = "INVALID_REQUEST"
    public_message = "Invalid request"


class InvalidState(ServiceError):
    status_code = 409
    code = "INVALID_STATE"
    public_message = "Session is not in the required state"


class BrowserBusy(ServiceError):
    status_code = 409
    code = "BROWSER_BUSY"
    public_message = "Browser service is busy"


class ProfileInUse(ServiceError):
    status_code = 409
    code = "PROFILE_IN_USE"
    public_message = "Browser profile is already in use"


class ProfileIdRejected(ServiceError):
    status_code = 400
    code = "INVALID_PROFILE_ID"
    public_message = "Invalid browser profile"


class UrlRejected(ServiceError):
    status_code = 422
    code = "URL_REJECTED"
    public_message = "URL is not allowed"


class InvalidHandoff(ServiceError):
    status_code = 404
    code = "HANDOFF_NOT_FOUND"
    public_message = "Interactive handoff not found"


class HarnessFailed(ServiceError):
    status_code = 502
    code = "HARNESS_FAILED"
    public_message = "Browser inspection failed"


class InsufficientProductFacts(ServiceError):
    status_code = 422
    code = "INSUFFICIENT_PRODUCT_FACTS"
    public_message = "Product facts are insufficient"
