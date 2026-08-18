from dataclasses import dataclass

from bs4 import BeautifulSoup

from .models import SelectorConfiguration, SelectorOperation
from .normalization import (
    NormalizationError,
    default_currency_for_url,
    normalize_price,
    normalize_title,
)


@dataclass(frozen=True)
class SelectorIssue:
    field: str
    message: str


class SelectorValidationError(ValueError):
    def __init__(self, issues: list[SelectorIssue]) -> None:
        self.issues = issues
        details = "; ".join(f"{issue.field}: {issue.message}" for issue in issues)
        super().__init__(details)


@dataclass(frozen=True)
class SelectorValidationReport:
    matched_nodes: dict[str, int]


def validate_selectors(html: str, configuration: SelectorConfiguration) -> SelectorValidationReport:
    soup = BeautifulSoup(html, "html.parser")
    issues: list[SelectorIssue] = []
    matched_nodes: dict[str, int] = {}

    for field_name in ("title", "price", "asin", "seller"):
        rule = getattr(configuration.selectors, field_name)
        if rule is None:
            continue

        nodes = soup.select(rule.selector)
        matched_nodes[field_name] = len(nodes)
        if not nodes:
            if field_name in {"asin", "seller"}:
                continue
            issues.append(SelectorIssue(field_name, "selector matched no nodes"))
            continue

        if rule.operation is SelectorOperation.ATTRIBUTE:
            values = [node.get(rule.attribute or "") for node in nodes]
            if not any(value for value in values):
                issues.append(SelectorIssue(field_name, "attribute was missing or empty"))
        else:
            text = nodes[0].get_text(" ", strip=True)
            if not text:
                issues.append(SelectorIssue(field_name, "matched nodes had no text"))
            elif field_name == "title":
                try:
                    normalize_title(text)
                except NormalizationError as exc:
                    issues.append(SelectorIssue(field_name, str(exc)))
            elif field_name == "price":
                try:
                    normalize_price(text, default_currency_for_url(str(configuration.source_url)))
                except NormalizationError as exc:
                    issues.append(SelectorIssue(field_name, str(exc)))

    if issues:
        raise SelectorValidationError(issues)
    return SelectorValidationReport(matched_nodes=matched_nodes)
