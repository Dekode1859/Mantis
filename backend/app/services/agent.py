"""
LangChain-powered product extraction pipeline using Gemini 2.5 Flash.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Iterable, Literal

from bs4 import BeautifulSoup
from langchain_core.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field, ValidationError

from ..schemas import ProductExtractionSchema

logger = logging.getLogger(__name__)

MAX_CHARS = int(os.getenv("SCRAPER_MAX_CHARS", 15_000))
MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")


class ProductExtraction(BaseModel):
    title: str = Field(..., description="Canonical product title")
    price: float = Field(..., description="Numeric price without currency symbols")
    currency: str = Field(..., description="Currency code or symbol if code unknown")
    stock_status: Literal["In Stock", "Out of Stock", "Unknown"] = Field(
        ..., description="Current availability state"
    )
    website: str | None = Field(
        default=None, description="Website of the product (domain name, optional)"
    )


def _clean_html(page_content: str) -> str:
    soup = BeautifulSoup(page_content, "html.parser")
    for tag in soup(["script", "style", "noscript", "footer", "nav"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines: Iterable[str] = (line.strip() for line in text.splitlines())
    cleaned = "\n".join(line for line in lines if line)
    if len(cleaned) > MAX_CHARS:
        logger.debug("Truncating cleaned content from %s to %s chars", len(cleaned), MAX_CHARS)
        return cleaned[:MAX_CHARS]
    return cleaned


@lru_cache(maxsize=1)
def _build_chain():
    prompt = PromptTemplate.from_template(
        (
            "You are an e-commerce product extraction assistant.\n"
            "Extract the product details from the provided text.\n"
            "Guidelines:\n"
            "- Provide a concise product title.\n"
            "- Return price as a numeric value (remove currency symbols, commas, and text). If you see a range, pick the"
            " most representative single price.\n"
            "- Prefer ISO currency codes (e.g. USD, INR); otherwise use the primary currency symbol.\n"
            "- Map availability to exactly one of: 'In Stock', 'Out of Stock', 'Unknown'.\n"
            "- If you can identify the domain of the product page, return it without protocol (e.g. amazon.in). Leave it"
            " empty if uncertain.\n"
            "Respond only with the structured data that fits the schema.\n\n"
            "Page text:\n{page_content}\n"
        )
    )
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY environment variable is not set.")
    model = ChatGoogleGenerativeAI(
        model=MODEL_NAME,
        temperature=0,
        max_output_tokens=1024,
    ).with_structured_output(ProductExtraction)
    return prompt | model


async def extract_product_data(page_content: str) -> ProductExtractionSchema:
    """Run the Gemini chain and return structured product data."""
    cleaned = _clean_html(page_content)
    logger.info("Cleaned: %s", cleaned)
    chain = _build_chain()
    logger.info("Invoking Gemini model %s with %s characters", MODEL_NAME, len(cleaned))
    try:
        result: ProductExtraction | None = await chain.ainvoke({"page_content": cleaned})
    except (ValidationError, ValueError) as exc:
        logger.exception("Structured extraction failed: %s", exc)
        raise RuntimeError("Agent returned data in an unexpected format.") from exc
    if result is None:
        logger.error("Structured extraction returned no data.")
        raise RuntimeError("Agent did not return structured data for this page.")
    structured = ProductExtractionSchema.model_validate(result.model_dump())
    logger.debug("Structured extraction succeeded: %s", structured)
    return structured
