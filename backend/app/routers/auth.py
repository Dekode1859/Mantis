"""
Authentication API endpoints for user registration and login.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth.schemas import Token, UserCreate, UserLogin, UserResponse
from ..auth.utils import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_current_active_user,
    hash_password,
    verify_password,
)
from ..database import get_db
from ..models import User
from ..utils.time import now_local

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)) -> Token:
    """
    Register a new user account.

    Args:
        user_data: User registration data (email, password, name)
        db: Database session

    Returns:
        JWT access token for the new user

    Raises:
        HTTPException: If email is already registered
    """
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_pwd = hash_password(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_pwd,
        name=user_data.name,
        is_active=True,
        created_at=now_local(),
        last_login=now_local()
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(new_user.id), "email": new_user.email},
        expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer")


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)) -> Token:
    """
    Login with email and password.

    Args:
        credentials: User login credentials (email, password)
        db: Database session

    Returns:
        JWT access token

    Raises:
        HTTPException: If credentials are invalid
    """
    # Find user by email
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account"
        )

    # Update last login
    user.last_login = now_local()
    db.commit()

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
) -> UserResponse:
    """
    Get current authenticated user information.

    Args:
        current_user: Current authenticated user from token

    Returns:
        User information
    """
    return UserResponse.from_orm(current_user)


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(current_user: User = Depends(get_current_active_user)) -> dict:
    """
    Logout endpoint (client-side token removal).

    Note: Since we're using stateless JWT tokens, logout is handled
    client-side by removing the token. This endpoint is provided for
    consistency but doesn't invalidate the token server-side.

    Args:
        current_user: Current authenticated user

    Returns:
        Success message
    """
    return {"message": "Successfully logged out"}
