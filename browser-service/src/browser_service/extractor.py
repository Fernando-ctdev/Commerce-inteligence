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

        page_values = [*observation.accessibility_names, *observation.text]
        description = _usable_fact(structured.get("description")) or _description_from_text(page_values)
        price = _price_from(structured.get("offers"), structured.get("priceCurrency"))
        if price is None and "price" in structured:
            price = _price_from(
                {"price": structured.get("price"), "priceCurrency": structured.get("priceCurrency")}
            )
        price = price or _price_from_text(page_values)
        seller = (
            _seller_from(structured.get("seller"))
            or _seller_from(structured.get("offers"))
            or _seller_from_text(page_values)
        )
        category = (
            _category_from(structured.get("category"))
            or _labeled_fact(page_values, _CATEGORY_LABEL)
            or _category_from_text(page_values)
        )
        brand = _seller_from(structured.get("brand")) or _labeled_fact(page_values, _BRAND_LABEL)
        variants = _variants_from(structured.get("hasVariant")) or _variants_from_text(page_values)
        features = _features(
            [
                *_structured_features(structured.get("additionalProperty")),
                *_feature_section(page_values),
            ],
            name,
            description,
            price,
            seller,
            category,
            brand,
            variants,
        )
        images = _images([*observation.meta_image_urls, *observation.image_urls], structured.get("image"))

        return ProductCandidate(
            name=name,
            description=description,
            price=price,
            features=features,
            images=images,
            seller=seller,
            source_url=observation.page_url,
            category=category,
            brand=brand,
            variants=variants,
            snapshot=_snapshot(observation),
        )


def _is_unavailable_page(title: str) -> bool:
    normalized = " ".join(title.split()).casefold()
    return any(marker in normalized for marker in ("404 not found", "403 forbidden", "access denied", "page not found"))


def _snapshot(observation: PageObservation) -> dict[str, object]:
    return {
        "pageUrl": observation.page_url,
        "title": observation.title[:500],
        "accessibilityNames": [_clip(value, 2_000) for value in observation.accessibility_names[:500]],
        "text": [_clip(value, 2_000) for value in observation.text[:500]],
        "jsonLd": observation.json_ld[:50],
        "imageUrls": observation.image_urls[:200],
        "metaImageUrls": observation.meta_image_urls[:50],
    }


def _clip(value: str, limit: int) -> str:
    return " ".join(str(value).split())[:limit]


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
    "descrição do produto",
    "product description",
    "detalhes",
    "detalhes do produto",
    "product details",
    "about this item",
    "about this product",
    "sobre o produto",
    "features",
    "características",
    "specifications",
    "especificações",
    "specification",
    "especificação",
    "price",
    "preço",
    "valor",
    "seller",
    "seller information",
    "sold by",
    "vendido por",
    "vendedor",
    "loja",
    "store",
    "frete",
    "frete grátis",
    "frete gratis",
    "shipping",
    "shipping fee",
    "delivery",
    "entrega",
    "desconto",
    "discount",
    "category",
    "categoria",
    "brand",
    "marca",
    "variants",
    "variantes",
    "currency",
    "moeda",
    "review",
    "reviews",
    "rating",
    "ratings",
    "avaliação",
    "avaliações",
}

_PRICE_LABEL = re.compile(r"\b(?:price|preço|valor|from|por|sale|oferta)\b", re.IGNORECASE)
_PRICE_PATTERN = re.compile(
    r"(?:(?P<before>R\$|US\$|[$€£]|[A-Z]{3})\s*)?"
    r"(?P<amount>\d{1,3}(?:\s*[.,]\s*\d{3})*(?:\s*[.,]\s*\d{2})?|\d+(?:\s*[.,]\s*\d{1,2})?)"
    r"\s*(?P<after>[A-Z]{3})?",
    re.IGNORECASE,
)
_DESCRIPTION_LABEL = re.compile(
    r"^(?:description|descrição|descrição do produto|detalhes|detalhes do produto|product description|product details|about this item|about this product|sobre o produto)"
    r"\s*(?::|-)?\s*(.*)$",
    re.IGNORECASE,
)
_CATEGORY_LABEL = re.compile(r"^(?:category|categoria)\s*(?::|-)?\s*(.*)$", re.IGNORECASE)
_BRAND_LABEL = re.compile(r"^(?:brand|marca)\s*(?::|-)?\s*(.*)$", re.IGNORECASE)
_VARIANT_LABEL = re.compile(
    r"^(?:variants|variantes|specification|especificação)\s*(?::|-)?\s*(.*)$", re.IGNORECASE
)
_REVIEW_LABEL = re.compile(
    r"^(?:(?:\d+(?:[.,]\d+)?)(?:\s*\([^)]*\))?\s*)?(?:reviews?|ratings?|avaliações?)\b",
    re.IGNORECASE,
)
_SELLER_LABEL = re.compile(
    r"^(?:seller|seller information|sold by|vendido por|vendedor|loja|store)\s*(?::|-)?\s*(.*)$",
    re.IGNORECASE,
)
_FACT_LABEL = re.compile(
    r"^(?:description|descrição|descrição do produto|detalhes|detalhes do produto|product description|product details|about this item|sobre o produto|category|categoria|brand|marca|seller|seller information|sold by|vendido por|vendedor|loja|store|features|características|specifications|especificações|variants|variantes|price|preço|valor|currency|moeda|frete|shipping|delivery|entrega|desconto|discount)\b",
    re.IGNORECASE,
)
_COMMERCIAL_NOISE = re.compile(
    r"^(?:-?\d+(?:[.,]\d+)?\s*%(?:\s+off)?|R\$|US\$|[$€£]|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|(?:frete|shipping|delivery|entrega)\b.*|(?:desconto|discount)\b.*)$",
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
    return _INSTRUCTION_TEXT.search(normalized) is not None or _is_ui_chrome_text(normalized)


def _is_ui_chrome_text(value: str) -> bool:
    normalized = _string(value)
    if not normalized:
        return True
    folded = normalized.casefold()
    return folded in _UI_TEXT or any(
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
    ) or folded in {
        "get the full app experience",
        "enjoy more products and great features on the app.",
        "obtenha a experiência completa no app",
        "aproveite mais produtos e recursos no app.",
        "baixe o aplicativo",
        "use o aplicativo",
    }


def _first_nonempty(values: Iterable[str]) -> str | None:
    for value in values:
        normalized = _string(value)
        if normalized and len(normalized) <= 300 and not _is_ui_text(normalized):
            return normalized
    return None


def _usable_name(value: object) -> str | None:
    normalized = _string(value)
    return normalized if normalized and not _is_ui_text(normalized) else None


def _usable_fact(value: object) -> str | None:
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
        normalized = re.sub(r"[A-Za-z]{3}|R\$|US\$|[$€£]", "", normalized, flags=re.IGNORECASE)
        normalized = re.sub(r"\s+", "", normalized)
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
        window = " ".join(
            filter(None, (_string(item) for item in values[max(0, index - 1) : index + 5]))
        )
        for match in _PRICE_PATTERN.finditer(window):
            if not match.group("before") and not match.group("after") and not _PRICE_LABEL.search(window):
                continue
            currency = _text_currency(match.group("before") or match.group("after"))
            amount = _amount(match.group("amount"))
            if currency and amount is not None:
                return Price(amount=amount, currency=currency)
    return None


def _text_currency(value: str | None) -> str | None:
    if value and value.isalpha():
        code = value.upper()
        return code if code in {"AUD", "BRL", "CAD", "CNY", "EUR", "GBP", "JPY", "MXN", "USD"} else None
    return {"R$": "BRL", "US$": "USD", "$": "USD", "€": "EUR", "£": "GBP"}.get(value or "")


def _description_from_text(values: list[str]) -> str | None:
    for index, value in enumerate(values):
        normalized = _string(value)
        if not normalized or _is_ui_text(normalized):
            continue
        match = _DESCRIPTION_LABEL.match(normalized)
        if not match:
            continue
        inline = _string(match.group(1))
        if inline:
            return inline if not _is_ui_text(inline) and not _is_section_label(inline) else None
        for candidate in values[index + 1 :]:
            candidate = _string(candidate)
            if (
                not candidate
                or _is_ui_text(candidate)
                or _is_section_label(candidate)
                or _is_breadcrumb(candidate)
                or _is_noise_value(candidate)
            ):
                break
            return candidate
    return None


def _labeled_fact(values: list[str], label_pattern: re.Pattern[str]) -> str | None:
    for index, value in enumerate(values):
        normalized = _string(value)
        if not normalized or _is_ui_text(normalized):
            continue
        match = label_pattern.match(normalized)
        if not match:
            continue
        inline = _string(match.group(1))
        if inline and not _is_noise_value(inline):
            return inline
        for candidate in values[index + 1 :]:
            candidate = _string(candidate)
            if not candidate or _is_ui_text(candidate) or _is_section_label(candidate) or _FACT_LABEL.match(candidate):
                break
            if not _is_noise_value(candidate):
                return candidate
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
    normalized = _string(value)
    if not normalized:
        return True
    folded = normalized.casefold()
    return _REVIEW_LABEL.match(normalized) is not None or folded.rstrip(":-") in _SECTION_LABELS or any(
        folded.startswith(f"{label}:") or folded.startswith(f"{label} -") for label in _SECTION_LABELS
    )


def _breadcrumb_category(value: str) -> str | None:
    normalized = _string(value)
    if not normalized:
        return None
    parts = [part.strip() for part in re.split(r"\s*(?:/|›|»|>)\s*", normalized)]
    if len(parts) < 3 or parts[0].casefold() != "tiktok shop":
        return None
    category = _string(parts[-1])
    return category if category and not _is_ui_text(category) and not _is_section_label(category) else None


def _is_breadcrumb(value: str) -> bool:
    return _breadcrumb_category(value) is not None


def _category_from_text(values: list[str]) -> str | None:
    for value in values:
        category = _breadcrumb_category(value)
        if category:
            return category
    return None


def _is_noise_value(value: str) -> bool:
    normalized = _string(value)
    return not normalized or _COMMERCIAL_NOISE.fullmatch(normalized) is not None or _SELLER_LABEL.match(normalized) is not None


def _feature_section(values: list[str]) -> list[str]:
    result: list[str] = []
    for index, value in enumerate(values):
        normalized = _string(value)
        if not normalized:
            continue
        match = re.match(
            r"^(features|características)\s*(?::|-)?\s*(.*)$",
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
            if (
                not candidate
                or _is_section_label(candidate)
                or _is_ui_text(candidate)
                or _is_noise_value(candidate)
                or _is_breadcrumb(candidate)
            ):
                break
            result.append(candidate)
    return result


def _structured_features(value: object) -> list[str]:
    properties = value if isinstance(value, list) else [value]
    result: list[str] = []
    for item in properties:
        if isinstance(item, dict):
            label = _usable_fact(item.get("name"))
            feature = _usable_fact(item.get("value"))
            if label and feature:
                result.append(f"{label}: {feature}")
            elif feature:
                result.append(feature)
        elif isinstance(item, str):
            feature = _usable_fact(item)
            if feature:
                result.append(feature)
    return result


def _seller_from(value: object) -> str | None:
    if isinstance(value, dict):
        return _usable_fact(value.get("name"))
    return _usable_fact(value)

def _category_from(value: object) -> str | None:
    if isinstance(value, dict):
        return _usable_fact(value.get("name"))
    return _usable_fact(value)


def _variants_from(value: object) -> list[str] | None:
    """Variantes estruturadas (JSON-LD `hasVariant`)."""
    items = value if isinstance(value, list) else [value]
    names = []
    for item in items:
        name = _usable_name(item.get("name") if isinstance(item, dict) else item)
        if name:
            names.append(name)
    return names or None


def _variants_from_text(values: list[str]) -> list[str] | None:
    result: list[str] = []
    for index, value in enumerate(values):
        normalized = _string(value)
        if not normalized:
            continue
        match = _VARIANT_LABEL.match(normalized)
        if not match:
            continue
        candidates = ([match.group(1)] if match.group(1) else []) + values[index + 1 :]
        for candidate in candidates:
            candidate = _string(candidate)
            if (
                not candidate
                or _is_section_label(candidate)
                or _is_ui_text(candidate)
                or _is_noise_value(candidate)
                or _is_breadcrumb(candidate)
            ):
                break
            if candidate not in result:
                result.append(candidate)
            if len(result) == 20:
                return result
    return result or None


def _features(
    values: list[str],
    name: str,
    description: str | None,
    price: Price | None,
    seller: str | None,
    category: str | None,
    brand: str | None,
    variants: list[str] | None,
) -> list[str]:
    excluded = {name.casefold()}
    for field in (description, seller, category, brand, *(variants or [])):
        if field:
            excluded.add(field.casefold())
    if price:
        excluded.update({str(price.amount).casefold(), f"{price.amount:.2f}".casefold(), price.currency.casefold()})
    result: list[str] = []
    for value in values:
        normalized = _string(value)
        if (
            not normalized
            or normalized.casefold() in excluded
            or len(normalized) > 300
            or _is_ui_text(normalized)
            or _is_section_label(normalized)
            or _is_noise_value(normalized)
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
        if len(result) == 10:  # SPEC 002/validation: até 10 imagens válidas/deduplicadas
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
