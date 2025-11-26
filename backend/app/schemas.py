"""
Pydantic schemas used by the FastAPI routes.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, AnyHttpUrl


class ProductBase(BaseModel):
    url: AnyHttpUrl


class ProductFetchRequest(ProductBase):
    pass


class ProductFetchResponse(BaseModel):
    page_content: str
    structured: Optional["ProductExtractionSchema"] = None
    product: Optional["TrackedProductSchema"] = None


class ProductExtractionSchema(BaseModel):
    title: str
    price: float
    currency: str
    stock_status: Literal["In Stock", "Out of Stock", "Unknown"]
    website: Optional[str] = None


class TrackedProductSchema(BaseModel):
    id: int
    url: AnyHttpUrl
    title: Optional[str] = None
    price: float
    currency: str
    stock_status: Literal["In Stock", "Out of Stock", "Unknown"]
    website: Optional[str] = None
    last_checked: datetime
    previous_price: Optional[float] = None
    previous_currency: Optional[str] = None
    lowest_price: Optional[float] = None
    lowest_currency: Optional[str] = None
    lowest_timestamp: Optional[datetime] = None


ProductFetchResponse.model_rebuild()

