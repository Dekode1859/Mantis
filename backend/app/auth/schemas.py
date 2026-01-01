"""
Pydantic schemas for authentication endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    name: Optional[str] = None


class SignupInitiate(BaseModel):
    """Schema for initiating signup with OTP."""
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    name: Optional[str] = None


class VerifyOTP(BaseModel):
    """Schema for OTP verification."""
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")

    @field_validator('otp')
    @classmethod
    def validate_otp_numeric(cls, v: str) -> str:
        """Validate that OTP contains only digits."""
        if not v.isdigit():
            raise ValueError('OTP must contain only digits')
        return v


class OTPResponse(BaseModel):
    """Schema for OTP initiation response."""
    message: str
    email: str


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Schema for user information in responses."""
    id: int
    email: str
    name: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class Token(BaseModel):
    """Schema for token response."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Schema for token payload data."""
    user_id: Optional[int] = None
    email: Optional[str] = None


class DeleteAccountConfirm(BaseModel):
    """Schema for confirming account deletion with OTP."""
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")

    @field_validator('otp')
    @classmethod
    def validate_otp_numeric(cls, v: str) -> str:
        """Validate that OTP contains only digits."""
        if not v.isdigit():
            raise ValueError('OTP must contain only digits')
        return v


class DeleteAccountResponse(BaseModel):
    """Schema for account deletion response."""
    message: str
