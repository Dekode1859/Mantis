"""
SQLAlchemy models for the price tracker backend.
"""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship

from .database import Base
from .utils.time import now_local


class User(Base):
    """User accounts with email/password authentication."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    products = relationship("Product", back_populates="user", cascade="all, delete-orphan")
    provider_configs = relationship("ProviderConfig", back_populates="user", cascade="all, delete-orphan")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("user_id", "url", name="uix_user_url"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String, nullable=False)
    title = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    domain = Column(String, nullable=True)
    stock_status = Column(String, nullable=True)
    last_checked = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="products")
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


class ProviderConfig(Base):
    __tablename__ = "provider_configs"
    __table_args__ = (
        UniqueConstraint("user_id", "provider_name", name="uix_user_provider"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_name = Column(String(50), nullable=False)
    api_key = Column(String(255), nullable=False)
    model_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="provider_configs")

