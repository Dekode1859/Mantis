"""
Product-related API routes.
"""

from urllib.parse import urlparse

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..auth.utils import get_current_active_user
from ..database import get_db
from ..models import PriceHistory, Product, User
from ..schemas import (
    ProductFetchRequest,
    ProductFetchResponse,
    TrackedProductSchema,
)
from ..services.agent import extract_product_data
from ..services.refresh import refresh_all_products
from ..services.scraper import fetch_page_content
from ..utils.time import now_local

router = APIRouter(prefix="/products", tags=["products"])


def _serialize_tracked_product(db: Session, product: Product) -> TrackedProductSchema:
    history_entries = (
        db.query(PriceHistory)
        .filter(PriceHistory.product_id == product.id)
        .order_by(PriceHistory.timestamp.asc())
        .all()
    )

    if not history_entries:
        raise RuntimeError(f"Product {product.id} has no price history.")

    latest = history_entries[-1]
    history_count = len(history_entries)
    previous = history_entries[-2] if history_count >= 2 else None
    lowest = min(history_entries, key=lambda entry: entry.price) if history_count >= 2 else None

    last_checked = product.last_checked or latest.timestamp

    return TrackedProductSchema(
        id=product.id,
        url=product.url,
        title=product.title,
        price=latest.price,
        currency=latest.currency,
        stock_status=product.stock_status or "Unknown",
        website=product.domain,
        last_checked=last_checked,
        previous_price=previous.price if previous else None,
        previous_currency=previous.currency if previous else None,
        lowest_price=lowest.price if lowest else None,
        lowest_currency=lowest.currency if lowest else None,
        lowest_timestamp=lowest.timestamp if lowest else None,
    )


@router.post("/fetch", response_model=ProductFetchResponse)
async def fetch_product_page(
    payload: ProductFetchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> ProductFetchResponse:
    """
    Accepts a product URL and returns the rendered page HTML.

    The HTML will later feed into the LangChain pipeline for structured
    extraction. Returning the raw content now allows us to validate the
    scraping setup independently.
    """
    normalized_url = str(payload.url)
    try:
        page_content = await fetch_page_content(normalized_url)
    except Exception as exc:  # noqa: BLE001 - surfacing external failure details
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        structured = await extract_product_data(page_content)
    except Exception as exc:  # noqa: BLE001 - propagate agent errors
        raise HTTPException(status_code=502, detail=f"Extraction failed: {exc}") from exc
    now = now_local()
    domain = structured.website
    if not domain:
        try:
            domain = urlparse(normalized_url).netloc or None
        except ValueError:
            domain = None

    product = db.query(Product).filter(
        Product.url == normalized_url,
        Product.user_id == current_user.id
    ).first()
    if product is None:
        product = Product(
            url=normalized_url,
            user_id=current_user.id,
            created_at=now
        )
        db.add(product)

    product.title = structured.title
    product.domain = domain
    product.stock_status = structured.stock_status
    product.last_checked = now

    db.flush()  # ensure product.id is populated

    history = PriceHistory(
        product_id=product.id,
        price=structured.price,
        currency=structured.currency,
        timestamp=now,
    )
    db.add(history)
    db.commit()
    db.refresh(product)

    tracked = _serialize_tracked_product(db, product)

    return ProductFetchResponse(page_content=page_content, structured=structured, product=tracked)


@router.get("", response_model=list[TrackedProductSchema])
def list_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[TrackedProductSchema]:
    """
    Return the latest tracked state for all products belonging to the current user.
    """
    products = db.query(Product).filter(Product.user_id == current_user.id).all()
    tracked: list[TrackedProductSchema] = []
    for product in products:
        try:
            tracked.append(_serialize_tracked_product(db, product))
        except RuntimeError:
            continue
    return tracked


@router.post("/refresh", status_code=status.HTTP_202_ACCEPTED)
async def trigger_refresh_all_products() -> Response:
    """
    Trigger a background refresh of every tracked product.

    This endpoint returns immediately while the refresh runs asynchronously.
    """
    asyncio.create_task(refresh_all_products())
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Response:
    """
    Permanently delete a tracked product and its price history.
    Only the owner can delete their products.
    """
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.user_id == current_user.id
    ).first()
    if product is None:
        raise HTTPException(
            status_code=404,
            detail="Product not found or you don't have permission to delete it."
        )

    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

