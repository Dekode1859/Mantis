from bs4 import BeautifulSoup

from .models import ExtractedProduct, SelectorConfiguration, SelectorOperation, SelectorRule
from .normalization import (
    default_currency_for_url,
    normalize_identifier,
    normalize_price,
    normalize_seller,
    normalize_title,
)


class DeterministicExtractionError(ValueError):
    pass


def _extract_value(soup: BeautifulSoup, field_name: str, rule: SelectorRule | None) -> str | None:
    if rule is None:
        return None

    nodes = soup.select(rule.selector)
    if not nodes:
        if field_name in {"asin", "seller"}:
            return None
        raise DeterministicExtractionError(f"{field_name}: selector matched no nodes")

    if rule.operation is SelectorOperation.ATTRIBUTE:
        value = nodes[0].get(rule.attribute or "")
        if isinstance(value, list):
            return " ".join(value).strip() or None
        return value.strip() if isinstance(value, str) else None

    return nodes[0].get_text(" ", strip=True) or None


def extract_product(html: str, configuration: SelectorConfiguration) -> ExtractedProduct:
    soup = BeautifulSoup(html, "html.parser")
    raw_values = {
        field_name: _extract_value(soup, field_name, getattr(configuration.selectors, field_name))
        for field_name in ("title", "price", "asin", "seller")
    }

    if not raw_values["title"]:
        raise DeterministicExtractionError("title: extracted value was empty")
    if not raw_values["price"]:
        raise DeterministicExtractionError("price: extracted value was empty")

    try:
        title = normalize_title(raw_values["title"])
        normalized_price = normalize_price(
            raw_values["price"],
            default_currency_for_url(str(configuration.source_url)),
        )
        try:
            asin = normalize_identifier(raw_values["asin"])
        except ValueError:
            asin = None
        seller = normalize_seller(raw_values["seller"])
    except ValueError as exc:
        raise DeterministicExtractionError(str(exc)) from exc

    return ExtractedProduct(
        source_url=configuration.source_url,
        title=title,
        price=normalized_price.amount,
        currency=normalized_price.currency,
        asin=asin,
        seller=seller,
    )
