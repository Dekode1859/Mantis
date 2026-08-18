from pathlib import Path

import pytest
from pydantic import ValidationError

from mantis_scraper.discovery import SelectorDiscoveryAgent
from mantis_scraper.extractor import extract_product
from mantis_scraper.models import SelectorConfiguration
from mantis_scraper.validation import validate_selectors


HTML = Path(__file__).parent.joinpath("fixtures", "product.html").read_text(encoding="utf-8")


def configuration() -> SelectorConfiguration:
    return SelectorConfiguration(
        source_url="https://example.com/products/orbit-mug",
        site="example.com",
        model="test-model",
        selectors={
            "title": {"selector": "#productTitle"},
            "price": {"selector": "#current-price"},
            "asin": {"selector": "#product-asin", "operation": "attribute", "attribute": "value"},
            "seller": {"selector": "[data-testid='seller-name']"},
        },
    )


def test_selector_config_rejects_extracted_values():
    with pytest.raises(ValidationError):
        SelectorConfiguration(
            source_url="https://example.com/product",
            site="example.com",
            model="test-model",
            selectors={
                "title": {"selector": "#title", "value": "should not be here"},
                "price": {"selector": "#price"},
            },
        )


def test_validation_and_extraction_are_deterministic():
    config = configuration()

    report = validate_selectors(HTML, config)
    first = extract_product(HTML, config)
    second = extract_product(HTML, config)

    assert report.matched_nodes == {"title": 1, "price": 1, "asin": 1, "seller": 1}
    assert first == second
    assert first.title == "Orbit Travel Mug"
    assert first.price == "$29.99"
    assert first.asin == "B0MANTIS001"
    assert first.seller == "Orbit Supply Co."


def test_discovery_calls_the_model_once_and_returns_selectors_only():
    class FakeStructuredModel:
        calls = 0

        def invoke(self, _prompt: object) -> dict[str, object]:
            self.calls += 1
            return {
                "title": {"selector": "#productTitle"},
                "price": {"selector": "#current-price"},
                "asin": {"selector": "#product-asin", "operation": "attribute", "attribute": "value"},
                "seller": {"selector": "[data-testid='seller-name']"},
            }

    fake = FakeStructuredModel()
    agent = SelectorDiscoveryAgent(model_name="test-model", structured_model=fake)

    proposal = agent.discover(source_url="https://example.com/product", html=HTML)
    config = SelectorConfiguration(
        source_url="https://example.com/product",
        site="example.com",
        model="test-model",
        selectors=proposal,
    )

    validate_selectors(HTML, config)
    extract_product(HTML, config)
    extract_product(HTML, config)

    assert fake.calls == 1
    assert proposal.title.selector == "#productTitle"
