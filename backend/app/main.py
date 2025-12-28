"""
FastAPI entrypoint for the price tracker backend.
"""

from __future__ import annotations

import os
import platform
import socket
from datetime import timedelta
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .utils.time import get_local_timezone, now_local


def _get_app_data_dir() -> Path:
    """Determine OS-specific app data directory for storing the database."""
    if platform.system() == "Windows":
        base = Path(os.getenv("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif platform.system() == "Darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.getenv("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    app_dir = base / "Mantis"
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir


APP_DATA_DIR = _get_app_data_dir()
DEFAULT_DB_PATH = APP_DATA_DIR / "mantis.db"
os.environ.setdefault("MANTIS_DB_PATH", str(DEFAULT_DB_PATH))

from .database import Base, engine, reconfigure_database  # noqa: E402
from .models import Product, PriceHistory, ProviderConfig, User  # noqa: E402, F401
from .routers import auth, products, providers  # noqa: E402
from .services.refresh import refresh_all_products  # noqa: E402


app = FastAPI(title="Local-First Price Tracker")

default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://192.168.1.51:3000",
]
env_origins = os.getenv("CORS_ALLOW_ORIGINS")
allow_origins = (
    [origin.strip() for origin in env_origins.split(",") if origin.strip()]
    if env_origins
    else default_origins
)

# Allow all origins in production when using Cloudflare tunnel
# This is safe because Cloudflare provides the security layer
allow_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins if not allow_origin_regex else ["*"],
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(providers.router)

scheduler = AsyncIOScheduler(timezone=get_local_timezone())


@app.on_event("startup")
async def start_scheduler() -> None:
    """Start the background scheduler for periodic refreshes."""
    # Create database tables if they don't exist
    Base.metadata.create_all(bind=engine)

    if not scheduler.get_job("refresh-all-products"):
        scheduler.add_job(
            refresh_all_products,
            "interval",
            hours=6,
            id="refresh-all-products",
            coalesce=True,
            max_instances=1,
            next_run_time=now_local() + timedelta(seconds=5),
        )
    if not scheduler.running:
        scheduler.start()


@app.on_event("shutdown")
async def shutdown_scheduler() -> None:
    """Gracefully stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/health")
async def healthcheck():
    """Health endpoint with database connectivity test."""
    from sqlalchemy import text
    from .database import SessionLocal

    db_status = "unknown"
    db_type = "unknown"

    try:
        db = SessionLocal()
        # Test database connection
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "connected"

        # Detect database type from DATABASE_URL
        db_url = os.getenv("DATABASE_URL") or os.getenv("MANTIS_DB_PATH", "")
        if "postgresql" in db_url:
            db_type = "PostgreSQL"
        elif "sqlite" in db_url or db_url.endswith(".db"):
            db_type = "SQLite"
        else:
            db_type = "Unknown"

    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "ok",
        "database": {
            "status": db_status,
            "type": db_type
        },
        "environment": "docker" if os.getenv("DATABASE_URL") else "local"
    }


def _find_free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def main() -> None:
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="Start the Mantis backend service.")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PORT", "0")),
        help="Port for the API server. Use 0 to auto-select a free port (default).",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=os.getenv("HOST", "127.0.0.1"),
        help="Host interface to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help="Override the SQLite database path.",
    )
    args = parser.parse_args()

    if args.db_path:
        reconfigure_database(args.db_path)

    Base.metadata.create_all(bind=engine)

    port = args.port or _find_free_port(args.host)
    os.environ["MANTIS_SELECTED_PORT"] = str(port)
    print(f"[mantis-engine] listening on {args.host}:{port}", flush=True)

    uvicorn.run("backend.app.main:app", host=args.host, port=port, reload=False)


if __name__ == "__main__":
    main()
