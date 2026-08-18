from datetime import datetime, timezone
from decimal import Decimal
from enum import StrEnum
from typing import Literal

import soupsieve
from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from .normalization import normalize_identifier, normalize_seller, normalize_title


class SelectorOperation(StrEnum):
    TEXT = "text"
    ATTRIBUTE = "attribute"


class SelectorRule(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    selector: str = Field(min_length=1, max_length=500)
    operation: SelectorOperation = SelectorOperation.TEXT
    attribute: str | None = Field(default=None, min_length=1, max_length=100)

    @field_validator("selector")
    @classmethod
    def validate_css_selector(cls, value: str) -> str:
        try:
            soupsieve.compile(value)
        except Exception as exc:
            raise ValueError("selector must be valid CSS") from exc
        return value

    @model_validator(mode="after")
    def validate_attribute_usage(self) -> "SelectorRule":
        if self.operation is SelectorOperation.ATTRIBUTE and not self.attribute:
            raise ValueError("attribute is required for attribute selectors")
        if self.operation is SelectorOperation.TEXT and self.attribute:
            raise ValueError("attribute is only allowed for attribute selectors")
        return self


class SelectorProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: SelectorRule
    price: SelectorRule
    asin: SelectorRule | None = None
    seller: SelectorRule | None = None


class SelectorConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    source_url: AnyHttpUrl
    site: str = Field(min_length=1, max_length=255)
    model: str = Field(min_length=1, max_length=255)
    selectors: SelectorProposal
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PageMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested_url: AnyHttpUrl
    final_url: AnyHttpUrl
    status_code: int = Field(ge=200, lt=600)
    content_type: str | None = None
    fetched_at: datetime
    byte_length: int = Field(ge=0)


class ExtractedProduct(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_url: AnyHttpUrl
    title: str = Field(min_length=3)
    price: Decimal = Field(ge=0)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    asin: str | None = None
    seller: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return normalize_title(value)

    @field_validator("asin")
    @classmethod
    def validate_asin(cls, value: str | None) -> str | None:
        return normalize_identifier(value)

    @field_validator("seller")
    @classmethod
    def validate_seller(cls, value: str | None) -> str | None:
        return normalize_seller(value)

    @field_serializer("price")
    def serialize_price(self, value: Decimal) -> float:
        return float(value)
