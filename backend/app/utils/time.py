"""
Time utilities for working with the local system timezone.
"""

from __future__ import annotations

from datetime import datetime, tzinfo
from functools import lru_cache


@lru_cache(maxsize=1)
def get_local_timezone() -> tzinfo | None:
    """Detect the system timezone once and cache it."""
    return datetime.now().astimezone().tzinfo


def now_local() -> datetime:
    """Return the current time in the local system timezone."""
    tz = get_local_timezone()
    return datetime.now(tz) if tz else datetime.now().astimezone()

