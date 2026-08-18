import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse


class NormalizationError(ValueError):
    """Raised when an extracted value cannot be made unambiguous."""


@dataclass(frozen=True)
class NormalizedPrice:
    amount: Decimal
    currency: str


_CURRENCY_SYMBOLS = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "₹": "INR",
    "â‚¹": "INR",
}
_CURRENCY_CODES = re.compile(r"\b[A-Z]{3}\b", re.IGNORECASE)
_NUMBER = re.compile(r"\d[\d.,]*")
_ASIN = re.compile(r"^[A-Z0-9]{10}$")


def default_currency_for_url(url: str) -> str | None:
    hostname = urlparse(url).hostname or ""
    if hostname.endswith(".in"):
        return "INR"
    if hostname.endswith(".co.uk"):
        return "GBP"
    if hostname.endswith((".de", ".fr", ".it", ".es", ".nl", ".be")):
        return "EUR"
    if hostname.endswith(".com"):
        return "USD"
    return None


def normalize_title(value: str) -> str:
    title = re.sub(r"\s+", " ", value).strip()
    title = re.sub(r"^Product Summary:\s*", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s*:\s*Amazon\.[^:]+:.*$", "", title, flags=re.IGNORECASE)
    if len(title) < 3 or title.casefold() in {"amazon", "amazon.in"}:
        raise NormalizationError("title must contain a product name")
    return title


def normalize_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    identifier = re.sub(r"\s+", "", value).upper()
    if not identifier:
        return None
    if not _ASIN.fullmatch(identifier):
        raise NormalizationError("product identifier must be a 10-character alphanumeric ID")
    return identifier


def normalize_seller(value: str | None) -> str | None:
    if value is None:
        return None
    seller = re.sub(r"\s+", " ", value).strip()
    return seller or None


def _currency_codes(value: str) -> set[str]:
    return {match.upper() for match in _CURRENCY_CODES.findall(value)}


def _parse_number(token: str) -> Decimal:
    token = token.replace(" ", "")
    if "," in token and "." in token:
        decimal_separator = "," if token.rfind(",") > token.rfind(".") else "."
        thousands_separator = "." if decimal_separator == "," else ","
        normalized = token.replace(thousands_separator, "").replace(decimal_separator, ".")
    elif "," in token:
        head, tail = token.rsplit(",", 1)
        normalized = f"{head.replace(',', '')}.{tail}" if len(tail) <= 2 else token.replace(",", "")
    elif token.count(".") > 1:
        head, tail = token.rsplit(".", 1)
        normalized = f"{head.replace('.', '')}.{tail}" if len(tail) <= 2 else token.replace(".", "")
    else:
        normalized = token

    try:
        amount = Decimal(normalized)
    except InvalidOperation as exc:
        raise NormalizationError("price contains an invalid number") from exc
    if amount < 0:
        raise NormalizationError("price cannot be negative")
    return amount


def normalize_price(raw: str, default_currency: str | None = None) -> NormalizedPrice:
    value = raw.replace("\u00a0", " ").strip()
    symbols = {code for symbol, code in _CURRENCY_SYMBOLS.items() if symbol in value}
    codes = _currency_codes(value)
    currencies = symbols | codes
    if len(currencies) > 1:
        raise NormalizationError("price contains conflicting currencies")
    currency = next(iter(currencies), default_currency)
    if currency is None:
        raise NormalizationError("price currency could not be determined")

    numeric_value = re.sub(r"\b[A-Z]{3}\b", " ", value, flags=re.IGNORECASE)
    for symbol in _CURRENCY_SYMBOLS:
        numeric_value = numeric_value.replace(symbol, " ")
    numeric_value = re.sub(r"(?<=\d)\s+(?=[.,])", "", numeric_value)
    numeric_value = re.sub(r"(?<=[.,])\s+", "", numeric_value)
    candidates = [_parse_number(token) for token in _NUMBER.findall(numeric_value)]
    if not candidates:
        raise NormalizationError("price did not contain a number")
    if len(set(candidates)) != 1:
        raise NormalizationError("price contains multiple different amounts")
    return NormalizedPrice(amount=candidates[0], currency=currency)
