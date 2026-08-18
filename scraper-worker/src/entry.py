import json
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

from workers import Response, WorkerEntrypoint, fetch


@dataclass
class Node:
    tag: str
    attributes: dict[str, str]
    parent: "Node | None" = None
    children: list["Node"] = field(default_factory=list)
    text_parts: list[str] = field(default_factory=list)

    @property
    def text_content(self) -> str:
        return " ".join(
            part.strip()
            for part in [*self.text_parts, *(child.text_content for child in self.children)]
            if part.strip()
        )


class ProductHtmlParser(HTMLParser):
    void_tags = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node("document", {})
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(
            tag.lower(),
            {name.lower(): value or "" for name, value in attrs},
            self.stack[-1],
        )
        self.stack[-1].children.append(node)
        if tag.lower() not in self.void_tags:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if self.stack[-1].tag == tag.lower():
            self.stack.pop()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        self.stack[-1].text_parts.append(data)


def json_response(data: object, status: int = 200) -> Response:
    return Response.json(data, status=status)


def model_html(html: str, max_chars: int = 260_000) -> str:
    cleaned = re.sub(
        r"<(script|style|noscript|template)\b[^>]*>.*?</\1>",
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if len(cleaned) <= max_chars:
        return cleaned
    half = max_chars // 2
    return cleaned[:half] + "\n<!-- content omitted -->\n" + cleaned[-half:]


def clean_model_json(content: str) -> dict[str, Any]:
    value = content.strip()
    value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.IGNORECASE)
    decoded = json.loads(value)
    if not isinstance(decoded, dict):
        raise ValueError("The model response must be a JSON object")
    return decoded


SelectorToken = tuple[str | None, str | None, frozenset[str], str | None, str | None]
SELECTOR_PATTERN = re.compile(
    r"^(?:(?P<tag>[a-zA-Z][\w:-]*)|\*)?"
    r"(?P<id>#[\w:-]+)?"
    r"(?P<classes>(?:\.[\w:-]+)*)"
    r"(?:\[(?P<attribute>[\w:-]+)(?:=(?P<value>[^\]]+))?\])?$"
)
CLASS_PATTERN = re.compile(r"\.[\w:-]+")


def selector_token(token: str) -> SelectorToken:
    match = SELECTOR_PATTERN.fullmatch(token)
    if not match:
        raise ValueError(f"Unsupported CSS selector token: {token}")
    value = match.group("value")
    if value is not None:
        value = value.strip().strip("\"'")
    return (
        match.group("tag"),
        match.group("id"),
        frozenset(item[1:] for item in CLASS_PATTERN.findall(match.group("classes"))),
        match.group("attribute"),
        value,
    )


def selector_tokens(selector: str) -> tuple[SelectorToken, ...]:
    return tuple(selector_token(token) for token in selector.replace(">", " ").split())


def validate_selector(selector: str) -> str:
    if not selector or len(selector) > 500 or "," in selector:
        raise ValueError("Selectors must be non-empty CSS selectors without comma groups")
    selector_tokens(selector)
    return selector


def validate_rule(field: str, value: object) -> dict[str, str | None] | None:
    if value is None:
        if field in {"asin", "seller"}:
            return None
        raise ValueError(f"{field} must have a selector")
    if not isinstance(value, dict):
        raise ValueError(f"{field} selector must be an object")
    if set(value) - {"selector", "operation", "attribute"}:
        raise ValueError(f"{field} selector has unsupported fields")
    selector = value.get("selector")
    operation = value.get("operation", "text")
    attribute = value.get("attribute")
    if not isinstance(selector, str):
        raise ValueError(f"{field} selector must be a string")
    validate_selector(selector)
    if operation not in {"text", "attribute"}:
        raise ValueError(f"{field} selector has an unsupported operation")
    if operation == "attribute" and not isinstance(attribute, str):
        raise ValueError(f"{field} attribute selectors need an attribute name")
    if operation == "text" and attribute is not None:
        raise ValueError(f"{field} text selectors cannot include an attribute")
    return {"selector": selector, "operation": operation, "attribute": attribute}


def validate_selectors(value: object) -> dict[str, dict[str, str | None] | None]:
    if not isinstance(value, dict) or set(value) != {"selectors"}:
        raise ValueError("The model response must contain only a selectors object")
    raw_selectors = value["selectors"]
    if not isinstance(raw_selectors, dict):
        raise ValueError("selectors must be an object")
    allowed = {"title", "price", "asin", "seller"}
    if set(raw_selectors) - allowed:
        raise ValueError("selectors contains an unsupported product field")
    return {field: validate_rule(field, raw_selectors.get(field)) for field in allowed}


def descendants(node: Node):
    stack = list(reversed(node.children))
    while stack:
        current = stack.pop()
        yield current
        stack.extend(reversed(current.children))


def matches(node: Node, token: SelectorToken) -> bool:
    tag, element_id, classes, attribute, expected = token
    if tag and node.tag != tag.lower():
        return False
    if element_id and node.attributes.get("id") != element_id[1:]:
        return False
    actual_classes = set(node.attributes.get("class", "").split())
    if not classes.issubset(actual_classes):
        return False
    if attribute and attribute not in node.attributes:
        return False
    return expected is None or node.attributes.get(attribute or "") == expected


def select(root: Node, selector: str) -> list[Node]:
    current = [root]
    for token in selector_tokens(selector):
        current = [
            node
            for parent in current
            for node in descendants(parent)
            if matches(node, token)
        ]
    return current


def extract_value(root: Node, field: str, rule: dict[str, str | None] | None) -> str | None:
    if rule is None:
        return None
    nodes = select(root, rule["selector"] or "")
    if not nodes:
        raise ValueError(f"{field}: selector matched no nodes")
    if rule["operation"] == "attribute":
        value = nodes[0].attributes.get(rule["attribute"] or "")
    else:
        node = nodes[0]
        if field == "price":
            offscreen = [
                child
                for child in descendants(node)
                if "a-offscreen" in child.attributes.get("class", "").split()
            ]
            node = offscreen[0] if offscreen else node
        value = node.text_content
    value = re.sub(r"\s+", " ", value or "").strip()
    return value or None


def validate_and_extract(
    html: str,
    source_url: str,
    selectors: dict[str, dict[str, str | None] | None],
    model: str,
) -> dict[str, Any]:
    parser = ProductHtmlParser()
    parser.feed(html)
    values = {
        field: extract_value(parser.root, field, selectors.get(field))
        for field in ("title", "price", "asin", "seller")
    }
    if not values["title"] or not values["price"]:
        raise ValueError("title and price must produce non-empty values")
    return {
        "status": "ready",
        "source_url": source_url,
        "title": values["title"],
        "price": values["price"],
        "asin": values["asin"],
        "seller": values["seller"],
        "selectors": selectors,
        "model": model,
    }


def discovery_prompt(source_url: str, html: str, feedback: str) -> str:
    return f"""Find CSS selectors in this product page HTML.

Return JSON only with this exact shape:
{{"selectors": {{"title": {{"selector": "...", "operation": "text", "attribute": null}}, "price": {{"selector": "...", "operation": "text", "attribute": null}}, "asin": {{"selector": "...", "operation": "attribute", "attribute": "value"}}, "seller": null}}}}

Return selectors, never extracted product values. Use `selector`, never `css`. Use the visible product title, current price, product identifier, and visible seller name. If an optional field is not present, return null. Preserve fields that passed the previous validation.

URL: {source_url}
Previous validation feedback: {feedback}

HTML body:
{html}"""


class Default(WorkerEntrypoint):
    async def call_model(self, source_url: str, html: str, feedback: str) -> dict[str, dict[str, str | None] | None]:
        model = getattr(self.env, "OLLAMA_MODEL", "gpt-oss:120b")
        base_url = getattr(self.env, "OLLAMA_BASE_URL", "https://ollama.com/v1").rstrip("/")
        api_key = getattr(self.env, "OLLAMA_API_KEY", "")
        if not api_key:
            raise ValueError("OLLAMA_API_KEY is not configured")
        response = await fetch(
            f"{base_url}/chat/completions",
            method="POST",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            body=json.dumps({
                "model": model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "You return only valid JSON."},
                    {"role": "user", "content": discovery_prompt(source_url, model_html(html), feedback)},
                ],
            }),
        )
        if response.status < 200 or response.status >= 300:
            raise ValueError(f"Ollama request failed with status {response.status}")
        payload = await response.json()
        content = payload["choices"][0]["message"]["content"]
        return validate_selectors(clean_model_json(content))

    async def extract_product(self, payload: dict) -> dict[str, Any]:
        source_url = payload.get("url") if isinstance(payload, dict) else None
        parsed = urlparse(source_url or "")
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("A complete HTTP or HTTPS product URL is required")
        page = await fetch(source_url, headers={"User-Agent": "Mantis/0.1 product selector discovery"})
        if page.status < 200 or page.status >= 300:
            raise ValueError(f"Product page fetch failed with status {page.status}")
        html = await page.text()
        final_url = page.url
        model = getattr(self.env, "OLLAMA_MODEL", "gpt-oss:120b")
        feedback = "None. This is the first proposal."
        for _ in range(2):
            try:
                selectors = await self.call_model(final_url, html, feedback)
                return validate_and_extract(html, final_url, selectors, model)
            except Exception as exc:
                feedback = str(exc)
        raise ValueError(feedback)

    async def fetch(self, request):
        url = urlparse(request.url)
        if url.path == "/api/health":
            return json_response({"ok": True, "service": "mantis-scraper"})
        if url.path != "/api/extract" or request.method != "POST":
            return json_response({"error": "Not found"}, status=404)
        try:
            return json_response(await self.extract_product(await request.json()))
        except Exception as exc:
            return json_response({"error": str(exc)}, status=502)
