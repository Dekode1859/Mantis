"""
Product extraction pipeline using configured AI provider.
"""

from __future__ import annotations

import logging
import os
from typing import Iterable, Literal

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from ..database import SessionLocal
from ..models import ProviderConfig
from ..providers.groq import GroqAdapter
from ..schemas import ProductExtractionSchema

logger = logging.getLogger(__name__)

MAX_CHARS = int(os.getenv("SCRAPER_MAX_CHARS", 15_000))


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


async def extract_product_data(page_content: str) -> ProductExtractionSchema:
    """Extract product data using the configured provider."""
    cleaned = _clean_html(page_content)
    logger.info("Cleaned HTML to %s characters", len(cleaned))

    # Load active provider configuration from database
    db = SessionLocal()
    try:
        config = db.query(ProviderConfig).filter(ProviderConfig.is_active == True).first()

        if not config:
            # Fallback to Google Gemini if no provider configured
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise RuntimeError("No provider configured and GOOGLE_API_KEY not set. Please configure a provider in Settings.")

            # Use legacy Google Gemini flow as fallback
            from functools import lru_cache
            from langchain_core.prompts import PromptTemplate
            from langchain_google_genai import ChatGoogleGenerativeAI

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
                model = ChatGoogleGenerativeAI(
                    model=os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash"),
                    temperature=0,
                    max_output_tokens=1024,
                ).with_structured_output(ProductExtraction)
                return prompt | model

            chain = _build_chain()
            logger.info("Using fallback Google Gemini provider")
            result = await chain.ainvoke({"page_content": cleaned})

            if result is None:
                raise RuntimeError("Agent did not return structured data for this page.")

            structured = ProductExtractionSchema.model_validate(result.model_dump())
            logger.debug("Structured extraction succeeded: %s", structured)
            return structured

        # Use configured provider
        provider_name = config.provider_name
        api_key = config.api_key
        model_name = config.model_name

        logger.info("Using provider: %s, model: %s", provider_name, model_name)

        # Get the appropriate adapter
        if provider_name == "groq":
            adapter = GroqAdapter()
        else:
            raise RuntimeError(f"Unsupported provider: {provider_name}")

        # Extract product info using the adapter
        result = await adapter.extract_product_info(cleaned, api_key, model_name)

        # Convert to ProductExtractionSchema
        structured = ProductExtractionSchema(
            title=result.get("title", "Unknown Product"),
            price=result.get("price", 0.0),
            currency=result.get("currency", "USD"),
            stock_status=result.get("stock_status", "Unknown"),
            website=result.get("website"),
        )

        logger.debug("Structured extraction succeeded: %s", structured)
        return structured

    finally:
        db.close()
