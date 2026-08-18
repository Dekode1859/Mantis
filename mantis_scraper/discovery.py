from urllib.parse import urlparse
from typing import Literal

from bs4 import BeautifulSoup
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from .models import SelectorProposal


DISCOVERY_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You identify stable CSS selectors for product fields in HTML.
Return selectors only through the provided structured schema. Never return extracted product values.
Prefer selectors based on stable ids, data attributes, semantic attributes, or a short stable ancestor path.
The selectors must work with BeautifulSoup CSS selection and must select the field's actual value.
Use text for visible text. Use attribute only when the value is stored in an HTML attribute.
Use the exact key `selector` for CSS selectors. Do not use `css`, `value`, or `text` as selector keys.
For attributes, return `operation` as `attribute` and provide the exact attribute name in `attribute`.
When validation feedback is present, preserve every field that was not reported as failing and change only the rejected fields.
If an optional field cannot be found, return null for that field.""",
        ),
        (
        "human",
            """Source URL: {source_url}

Find selectors for:
- title: the product name
- price: the current product price
- asin: the product identifier when present
- seller: the seller name when present

HTML body:
{html_body}

Validation feedback from a previous proposal:
{validation_feedback}""",
        ),
    ]
)


def html_for_model(html: str, max_chars: int = 260_000) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for element in soup(["script", "style", "noscript", "template"]):
        element.decompose()
    body = soup.body or soup
    rendered = str(body)
    return rendered[:max_chars]


class SelectorDiscoveryAgent:
    def __init__(
        self,
        *,
        model_name: str,
        api_key: str | None = None,
        base_url: str = "https://ollama.com/v1",
        structured_method: Literal["function_calling", "json_mode"] = "json_mode",
        structured_model: object | None = None,
    ) -> None:
        if structured_model is not None:
            self._structured_model = structured_model
            return
        if not api_key:
            raise ValueError("OLLAMA_API_KEY is required for selector discovery")

        llm = ChatOpenAI(
            model=model_name,
            api_key=api_key,
            base_url=base_url,
            temperature=0,
            timeout=120,
            max_retries=2,
        )
        self._structured_model = llm.with_structured_output(
            SelectorProposal,
            method=structured_method,
        )

    def discover(
        self,
        *,
        source_url: str,
        html: str,
        max_chars: int = 260_000,
        validation_feedback: str = "None. This is the first proposal.",
    ) -> SelectorProposal:
        prompt = DISCOVERY_PROMPT.invoke(
            {
                "source_url": source_url,
                "html_body": html_for_model(html, max_chars),
                "validation_feedback": validation_feedback,
            }
        )
        result = self._structured_model.invoke(prompt)
        return SelectorProposal.model_validate(result)

    @staticmethod
    def site_for_url(url: str) -> str:
        return urlparse(url).netloc.lower()
