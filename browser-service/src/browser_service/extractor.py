from __future__ import annotations

from collections.abc import Iterable, Mapping
import html
import math
import re
from urllib.parse import urlsplit

from .harness import PageObservation
from .models import InsufficientProductFacts, Price, ProductCandidate


class ProductExtractor:
    def extract(self, observation: PageObservation) -> ProductCandidate:
        if _is_unavailable_page(observation.title):
            raise InsufficientProductFacts()
        structured = _first_product_data(observation.json_ld)
        name = (
            _usable_name(structured.get("name"))
            or _first_nonempty(observation.accessibility_names)
            or _first_nonempty([observation.title])
            or _first_nonempty(observation.text)
        )
        if not name:
            raise InsufficientProductFacts()

        description = _string(structured.get("description")) or _description_from_text(observation.text)
        price = _price_from(structured.get("offers"), structured.get("priceCurrency"))
        if price is None and "price" in structured:
            price = _price_from(
                {"price": structured.get("price"), "priceCurrency": structured.get("priceCurrency")}
            )
        price = price or _price_from_text(observation.text)
        seller = (
            _seller_from(structured.get("seller"))
            or _seller_from(structured.get("offers"))
            or _seller_from_text(observation.text)
        )
        features = _features(
            [*observation.accessibility_names, *_feature_section(observation.text)],
            name,
            description,
            price,
            seller,
        )
        images = _images(observation.image_urls, structured.get("image"))

        return ProductCandidate(
            name=name,
            description=description,
            price=price,
            features=features,
            images=images,
            seller=seller,
            source_url=observation.page_url,
        )


def _is_unavailable_page(title: str) -> bool:
    normalized = " ".join(title.split()).casefold()
    return any(marker in normalized for marker in ("404 not found", "403 forbidden", "access denied", "page not found"))


def _first_product_data(values: list[dict[str, object]]) -> Mapping[str, object]:
    items: list[dict[str, object]] = []
    for value in values:
        items.append(value)
        graph = value.get("@graph")
        if isinstance(graph, list):
            items.extend(item for item in graph if isinstance(item, dict))

    for item in items:
        if _is_product_type(item.get("@type")) and (_string(item.get("name")) or _string(item.get("description"))):
            return item
    for item in items:
        if not _is_non_product_type(item.get("@type")) and (_string(item.get("name")) or _string(item.get("description"))):
            return item
    return {}


def _string(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = " ".join(re.sub(r"<[^>]*>", " ", html.unescape(value)).split())
    return normalized or None


def _types(value: object) -> set[str]:
    values = value if isinstance(value, list) else [value]
    return {
        item.rsplit("/", 1)[-1].rsplit("#", 1)[-1].casefold()
        for item in values
        if isinstance(item, str) and item.strip()
    }


def _is_product_type(value: object) -> bool:
    return "product" in _types(value)


def _is_non_product_type(value: object) -> bool:
    return bool(_types(value) & {"website", "webpage", "organization", "brand", "breadcrumblist", "videoobject"})


_UI_TEXT = {
    "logo",
    "not now",
    "open tiktok",
    "close",
    "menu",
    "search",
    "share",
    "like",
    "follow",
    "log in",
    "sign in",
    "login",
    "sign up",
    "add to cart",
    "buy now",
    "see more",
    "show more",
    "next",
    "previous",
    "play",
    "pause",
    "loading",
    "error",
    "try again",
    "cancel",
    "confirm",
    "back",
    "home",
    "agora não",
    "abrir no tiktok",
    "abrir no app",
    "fechar",
    "menu",
    "pesquisar",
    "compartilhar",
    "curtir",
    "seguir",
    "entrar",
    "cadastrar",
    "adicionar ao carrinho",
    "comprar agora",
    "ver mais",
    "mostrar mais",
    "próximo",
    "anterior",
    "pausar",
    "carregando",
    "cancelar",
    "confirmar",
    "voltar",
    "início",
}

_SECTION_LABELS = {
    "description",
    "descrição",
    "detalhes",
    "detalhes do produto",
    "product details",
    "about this item",
    "sobre o produto",
    "features",
    "características",
    "specifications",
    "especificações",
    "price",
    "preço",
    "valor",
    "seller",
    "seller information",
    "vendido por",
    "vendedor",
    "loja",
    "store",
    "category",
    "categoria",
    "brand",
    "marca",
    "variants",
    "variantes",
}

_PRICE_LABEL = re.compile(r"\b(?:price|preço|valor|from|por|sale|oferta)\b", re.IGNORECASE)
_PRICE_PATTERN = re.compile(
    r"(?:(?P<before>R\$|US\$|[$€£]|[A-Z]{3})\s*)?"
    r"(?P<amount>\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{1,2})?)"
    r"\s*(?P<after>[A-Z]{3})?",
    re.IGNORECASE,
)
_DESCRIPTION_LABEL = re.compile(
    r"^(?:description|descrição|detalhes|detalhes do produto|product details|about this item|sobre o produto)"
    r"\s*(?::|-)?\s*(.*)$",
    re.IGNORECASE,
)
_SELLER_LABEL = re.compile(
    r"^(?:seller|seller information|sold by|vendido por|vendedor|loja|store)\s*(?::|-)?\s*(.*)$",
    re.IGNORECASE,
)
_INSTRUCTION_TEXT = re.compile(
    r"\b(?:ignore (?:all )?previous instructions|system message|you are an ai|reveal (?:the )?prompt|"
    r"ignore instruções|mensagem do sistema|revele o prompt)\b",
    re.IGNORECASE,
)


def _is_ui_text(value: str) -> bool:
    normalized = _string(value)
    if not normalized:
        return True
    folded = normalized.casefold()
    return (
        _INSTRUCTION_TEXT.search(normalized) is not None
        or folded in _UI_TEXT
        or any(
            folded.startswith(prefix)
            for prefix in (
                "get the full app",
                "enjoy more products",
                "obtenha a experiência completa",
                "aproveite mais produtos",
                "abrir no tiktok",
                "abrir no app",
                "open tiktok",
                "download the app",
                "baixe o aplicativo",
            )
        )
        or folded in {
            "get the full app experience",
            "enjoy more products and great features on the app.",
            "obtenha a experiência completa no app",
            "aproveite mais produtos e recursos no app.",
            "baixe o aplicativo",
            "use o aplicativo",
        }
    )


def _first_nonempty(values: Iterable[str]) -> str | None:
    for value in values:
        normalized = _string(value)
        if normalized and len(normalized) <= 300 and not _is_ui_text(normalized):
            return normalized
    return None


def _usable_name(value: object) -> str | None:
    normalized = _string(value)
    return normalized if normalized and not _is_ui_text(normalized) else None


def _price_from(value: object, fallback_currency: object = None) -> Price | None:
    offers = value if isinstance(value, list) else [value]
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        currency = _currency(offer.get("priceCurrency")) or _currency(fallback_currency)
        amount = _amount(offer.get("price"))
        if amount is None:
            specifications = offer.get("priceSpecification")
            specifications = specifications if isinstance(specifications, list) else [specifications]
            for specification in specifications:
                if isinstance(specification, dict):
                    amount = _amount(specification.get("price"))
                    currency = currency or _currency(specification.get("priceCurrency"))
                    if amount is not None:
                        break
        if amount is not None and currency:
            return Price(amount=amount, currency=currency)
    return None


def _currency(value: object) -> str | None:
    normalized = _string(value)
    return normalized.upper() if normalized and re.fullmatch(r"[A-Za-z]{3}", normalized) else None


def _amount(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        amount = float(value)
    else:
        normalized = _string(value)
        if not normalized:
            return None
        normalized = re.sub(r"[A-Za-z]{3}|R\$|US\$|[$€£]", "", normalized, flags=re.IGNORECASE).strip()
        if not re.fullmatch(r"(?:\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)", normalized):
            return None
        if "," in normalized and "." in normalized:
            normalized = normalized.replace(",", "") if normalized.rfind(".") > normalized.rfind(",") else normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", ".")
        try:
            amount = float(normalized)
        except ValueError:
            return None
    return amount if math.isfinite(amount) and amount >= 0 else None


def _price_from_text(values: list[str]) -> Price | None:
    for index, value in enumerate(values):
        current = _string(value)
        if not current or _is_ui_text(current):
            continue
        window = " ".join(filter(None, (current, *(_string(item) for item in values[index + 1 : index + 3]))))
        match = _PRICE_PATTERN.search(window)
        if not match or (not match.group("before") and not match.group("after") and not _PRICE_LABEL.search(current)):
            continue
        currency = _text_currency(match.group("before") or match.group("after"))
        amount = _amount(match.group("amount"))
        if currency and amount is not None:
            return Price(amount=amount, currency=currency)
    return None


def _text_currency(value: str | None) -> str | None:
    return {"R$": "BRL", "US$": "USD", "$": "USD", "€": "EUR", "£": "GBP"}.get(
        value.upper() if value and value.isalpha() else value or "",
        _currency(value),
    )


def _description_from_text(values: list[str]) -> str | None:
    for index, value in enumerate(values):
        normalized = _string(value)
        if not normalized or _is_ui_text(normalized):
            continue
        match = _DESCRIPTION_LABEL.match(normalized)
        if not match:
            continue
        parts = [_string(match.group(1))] if match.group(1) else []
        for candidate in values[index + 1 :]:
            candidate = _string(candidate)
            if not candidate or _is_ui_text(candidate) or _is_section_label(candidate):
                break
            parts.append(candidate)
        description = _string(" ".join(part for part in parts if part))
        if description:
            return description
    return None


def _seller_from_text(values: list[str]) -> str | None:
    for index, value in enumerate(values):
        normalized = _string(value)
        if not normalized or _is_ui_text(normalized):
            continue
        match = _SELLER_LABEL.match(normalized)
        seller = _string(match.group(1)) if match else None
        if not seller and match and index + 1 < len(values):
            seller = _string(values[index + 1])
        if seller and not _is_ui_text(seller):
            return seller
    return None


def _is_section_label(value: str) -> bool:
    folded = value.casefold()
    return folded.rstrip(":-") in _SECTION_LABELS or any(
        folded.startswith(f"{label}:") or folded.startswith(f"{label} -") for label in _SECTION_LABELS
    )


def _feature_section(values: list[str]) -> list[str]:
    result: list[str] = []
    for index, value in enumerate(values):
        normalized = _string(value)
        if not normalized:
            continue
        match = re.match(
            r"^(features|características|specifications|especificações)\s*(?::|-)?\s*(.*)$",
            normalized,
            re.IGNORECASE,
        )
        if not match:
            continue
        inline = _string(match.group(2))
        if inline:
            result.extend(re.split(r"[,;•|]", inline))
        for candidate in values[index + 1 :]:
            candidate = _string(candidate)
            if not candidate or _is_section_label(candidate) or _is_ui_text(candidate):
                break
            result.append(candidate)
    return result


def _seller_from(value: object) -> str | None:
    if isinstance(value, dict):
        return _string(value.get("name"))
    return _string(value)


def _features(
    values: list[str], name: str, description: str | None, price: Price | None, seller: str | None
) -> list[str]:
    excluded = {name.casefold()}
    if description:
        excluded.add(description.casefold())
    if price:
        excluded.add(str(price.amount).casefold())
    if seller:
        excluded.add(seller.casefold())
    result: list[str] = []
    for value in values:
        normalized = _string(value)
        if (
            not normalized
            or normalized.casefold() in excluded
            or len(normalized) > 300
            or _is_ui_text(normalized)
            or _is_section_label(normalized)
            or _price_from_text([normalized]) is not None
        ):
            continue
        if normalized not in result:
            result.append(normalized)
        if len(result) == 20:
            break
    return result


def _images(values: list[str], structured: object) -> list[str]:
    candidates = _structured_images(structured) + list(values)

    result: list[str] = []
    for raw_value in candidates:
        value = raw_value.strip()
        if not _valid_image_url(value) or _is_ui_image_url(value) or value in result:
            continue
        result.append(value)
        if len(result) == 10:
            break
    return result


def _valid_image_url(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
    except ValueError:
        return False
    return parsed.scheme == "https" and not parsed.username and not parsed.password and (
        host == "tiktok.com"
        or host.endswith(".tiktok.com")
        or host.endswith(".tiktokcdn.com")
        or host.endswith(".tiktokcdn-us.com")
        or host.endswith(".ibyteimg.com")
        or host.endswith(".ibytedtos.com")
    )


def _structured_images(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(_structured_images(item))
        return result
    if isinstance(value, dict):
        return [
            candidate
            for key in ("url", "contentUrl")
            for candidate in _structured_images(value.get(key))
        ]
    return []


def _is_ui_image_url(value: str) -> bool:
    path = (urlsplit(value).path or "").casefold()
    return any(marker in path for marker in ("/avatar", "/profile", "/icon", "/logo", "/favicon", "/sprite", "/captcha", "/loading", "/placeholder", "/qrcode", "/pixel"))


__all__ = ["ProductExtractor"]
