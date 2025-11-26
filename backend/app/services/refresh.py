"""
Scheduled refresh utilities for periodically updating tracked products.
"""

from __future__ import annotations

import logging
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import Product, PriceHistory
from ..services.agent import extract_product_data
from ..services.scraper import fetch_page_content
from ..utils.time import now_local

logger = logging.getLogger(__name__)


async def _refresh_product(db: Session, product: Product) -> None:
    url = product.url
    logger.info("Refreshing product %s (id=%s)", url, product.id)
    page_content = await fetch_page_content(url)
    structured = await extract_product_data(page_content)
    now = now_local()

    product.title = structured.title
    product.domain = structured.website or product.domain
    product.stock_status = structured.stock_status
    product.last_checked = now

    db.add(
        PriceHistory(
            product_id=product.id,
            price=structured.price,
            currency=structured.currency,
            timestamp=now,
        )
    )


async def refresh_all_products() -> None:
    """Refresh every tracked product sequentially."""
    logger.info("Starting scheduled refresh")
    with SessionLocal() as db:
        products = db.query(Product).all()
        for product in products:
            try:
                await _refresh_product(db, product)
                db.commit()
                logger.info("Refreshed product %s", product.url)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Failed to refresh product %s: %s", product.url, exc)
                db.rollback()
    logger.info("Scheduled refresh complete")

