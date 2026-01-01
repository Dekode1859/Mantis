"""
OTP (One-Time Password) utilities for email verification.
"""

import json
import os
import secrets
from typing import Optional

from ..redis_client import get_redis

# OTP Configuration
OTP_EXPIRATION_MINUTES = int(os.getenv("OTP_EXPIRATION_MINUTES", "10"))
OTP_LENGTH = 6


def generate_otp() -> str:
    """
    Generate a cryptographically secure 6-digit OTP.

    Returns:
        6-digit numeric string
    """
    # Generate a random 6-digit number using secrets for cryptographic security
    return f"{secrets.randbelow(1000000):06d}"


def store_pending_registration(
    email: str,
    hashed_password: str,
    name: Optional[str],
    otp: str
) -> None:
    """
    Store pending registration data in Redis with expiration.

    Args:
        email: User's email address
        hashed_password: Already hashed password
        name: User's name (optional)
        otp: Generated OTP
    """
    redis_client = get_redis()

    # Create a key for this registration
    key = f"pending_registration:{email}"

    # Store data as JSON
    data = {
        "email": email,
        "hashed_password": hashed_password,
        "name": name,
        "otp": otp
    }

    # Set with expiration (TTL)
    expiration_seconds = OTP_EXPIRATION_MINUTES * 60
    redis_client.setex(key, expiration_seconds, json.dumps(data))


def get_pending_registration(email: str) -> Optional[dict]:
    """
    Retrieve pending registration data from Redis.

    Args:
        email: User's email address

    Returns:
        Dictionary with registration data or None if not found/expired
    """
    redis_client = get_redis()

    key = f"pending_registration:{email}"
    data = redis_client.get(key)

    if data is None:
        return None

    return json.loads(data)


def delete_pending_registration(email: str) -> None:
    """
    Delete pending registration data from Redis.

    Args:
        email: User's email address
    """
    redis_client = get_redis()

    key = f"pending_registration:{email}"
    redis_client.delete(key)


def verify_otp(email: str, provided_otp: str) -> bool:
    """
    Verify if the provided OTP matches the stored OTP.

    Args:
        email: User's email address
        provided_otp: OTP provided by the user

    Returns:
        True if OTP is valid, False otherwise
    """
    pending_data = get_pending_registration(email)

    if pending_data is None:
        return False

    stored_otp = pending_data.get("otp")
    return stored_otp == provided_otp


# Account Deletion OTP Functions

def store_deletion_otp(user_id: int, otp: str) -> None:
    """
    Store OTP for account deletion in Redis with expiration.

    Args:
        user_id: User's ID
        otp: Generated OTP
    """
    redis_client = get_redis()

    # Create a key for this deletion request
    key = f"pending_deletion:{user_id}"

    # Store OTP
    data = {"otp": otp, "user_id": user_id}

    # Set with expiration (TTL)
    expiration_seconds = OTP_EXPIRATION_MINUTES * 60
    redis_client.setex(key, expiration_seconds, json.dumps(data))


def get_deletion_otp(user_id: int) -> Optional[dict]:
    """
    Retrieve deletion OTP data from Redis.

    Args:
        user_id: User's ID

    Returns:
        Dictionary with OTP data or None if not found/expired
    """
    redis_client = get_redis()

    key = f"pending_deletion:{user_id}"
    data = redis_client.get(key)

    if data is None:
        return None

    return json.loads(data)


def delete_deletion_otp(user_id: int) -> None:
    """
    Delete pending deletion OTP from Redis.

    Args:
        user_id: User's ID
    """
    redis_client = get_redis()

    key = f"pending_deletion:{user_id}"
    redis_client.delete(key)


def verify_deletion_otp(user_id: int, provided_otp: str) -> bool:
    """
    Verify if the provided OTP matches the stored deletion OTP.

    Args:
        user_id: User's ID
        provided_otp: OTP provided by the user

    Returns:
        True if OTP is valid, False otherwise
    """
    deletion_data = get_deletion_otp(user_id)

    if deletion_data is None:
        return False

    stored_otp = deletion_data.get("otp")
    return stored_otp == provided_otp
