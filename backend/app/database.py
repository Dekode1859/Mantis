"""
Database utilities for the FastAPI backend.
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def _resolve_database_url() -> str:
    """
    Resolve database URL based on deployment mode.
    - Docker/Web: Use DATABASE_URL (PostgreSQL)
    - Electron/Local: Use MANTIS_DB_PATH (SQLite)
    """
    # Docker deployment: Use DATABASE_URL (PostgreSQL)
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        # Handle postgres:// vs postgresql:// (some providers use old format)
        if env_url.startswith("postgres://"):
            env_url = env_url.replace("postgres://", "postgresql://", 1)
        return env_url

    # Electron/Local deployment: Use SQLite
    env_path = os.getenv("MANTIS_DB_PATH")
    if env_path:
        db_path = Path(env_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{db_path}"

    # Default fallback: SQLite in current directory
    db_path = Path("./price_tracker.db").resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path}"


DATABASE_URL = _resolve_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite:")

# SQLite-specific connect args
connect_args = {"check_same_thread": False} if IS_SQLITE else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # Verify connections before using
    pool_size=5 if not IS_SQLITE else None,
    max_overflow=10 if not IS_SQLITE else None,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def reconfigure_database(db_path: str) -> None:
    """Rebind the SQLAlchemy engine/session to a new SQLite file."""
    global DATABASE_PATH, DATABASE_URL, engine
    new_path = Path(db_path).resolve()
    new_path.parent.mkdir(parents=True, exist_ok=True)
    new_url = f"sqlite:///{new_path}"
    engine.dispose()
    engine = create_engine(
        new_url,
        connect_args={"check_same_thread": False},
    )
    SessionLocal.configure(bind=engine)
    DATABASE_PATH = new_path
    DATABASE_URL = new_url


def get_db():
    """FastAPI dependency providing a scoped SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

