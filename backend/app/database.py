"""
Database utilities for the FastAPI backend.
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def _resolve_database_path() -> Path:
    env_path = os.getenv("MANTIS_DB_PATH")
    if env_path:
        return Path(env_path)
    return Path("./price_tracker.db").resolve()


DATABASE_PATH = _resolve_database_path()
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
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

