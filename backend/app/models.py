"""
SQLAlchemy models for the price tracker backend.
"""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from .database import Base
from .utils.time import now_local


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    domain = Column(String, nullable=True)
    stock_status = Column(String, nullable=True)
    last_checked = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    price_history = relationship(
        "PriceHistory",
        back_populates="product",
        cascade="all, delete-orphan",
    )


class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    price = Column(Float, nullable=False)
    currency = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=now_local)

    product = relationship("Product", back_populates="price_history")

