"""
Redis client configuration for OTP temporary storage.
"""

import os
from typing import Optional

import redis
from redis import Redis

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Global Redis client instance
_redis_client: Optional[Redis] = None


def get_redis() -> Redis:
    """
    Get or create Redis client instance.

    Returns:
        Redis client instance
    """
    global _redis_client

    if _redis_client is None:
        _redis_client = redis.from_url(
            REDIS_URL,
            decode_responses=True,  # Automatically decode bytes to strings
            socket_connect_timeout=5,
            socket_timeout=5,
        )

    return _redis_client


def close_redis() -> None:
    """Close Redis connection."""
    global _redis_client

    if _redis_client is not None:
        _redis_client.close()
        _redis_client = None
