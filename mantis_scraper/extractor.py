from bs4 import BeautifulSoup

from .models import ExtractedProduct, SelectorConfiguration, SelectorOperation, SelectorRule


class DeterministicExtractionError(ValueError):
    pass


def _extract_value(soup: BeautifulSoup, field_name: str, rule: SelectorRule | None) -> str | None:
    if rule is None:
        return None

    nodes = soup.select(rule.selector)
    if not nodes:
        raise DeterministicExtractionError(f"{field_name}: selector matched no nodes")

    if rule.operation is SelectorOperation.ATTRIBUTE:
        value = nodes[0].get(rule.attribute or "")
        if isinstance(value, list):
            return " ".join(value).strip() or None
        return value.strip() if isinstance(value, str) else None

    return nodes[0].get_text(" ", strip=True) or None


def extract_product(html: str, configuration: SelectorConfiguration) -> ExtractedProduct:
    soup = BeautifulSoup(html, "html.parser")
    values = {
        field_name: _extract_value(soup, field_name, getattr(configuration.selectors, field_name))
        for field_name in ("title", "price", "asin", "seller")
    }

    for field_name in ("title", "price"):
        if not values[field_name]:
            raise DeterministicExtractionError(f"{field_name}: extracted value was empty")

    return ExtractedProduct(source_url=configuration.source_url, **values)

