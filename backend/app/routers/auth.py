"""
Authentication API endpoints for user registration and login.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth.otp import (
    delete_deletion_otp,
    delete_pending_registration,
    generate_otp,
    get_pending_registration,
    store_deletion_otp,
    store_pending_registration,
    verify_deletion_otp,
    verify_otp,
)
from ..auth.schemas import (
    DeleteAccountConfirm,
    DeleteAccountResponse,
    OTPResponse,
    SignupInitiate,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
    VerifyOTP,
)
from ..auth.utils import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_current_active_user,
    hash_password,
    verify_password,
)
from ..database import get_db
from ..models import User
from ..services.email import send_account_deletion_email, send_verification_email
from ..utils.time import now_local

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/signup-initiate", response_model=OTPResponse, status_code=status.HTTP_200_OK)
def signup_initiate(user_data: SignupInitiate, db: Session = Depends(get_db)) -> OTPResponse:
    """
    Initiate user signup by sending OTP to email.

    This is the first step of the two-step registration process.
    A 6-digit OTP is sent to the user's email for verification.

    Args:
        user_data: User signup data (email, password, name)
        db: Database session

    Returns:
        Success message with email confirmation

    Raises:
        HTTPException: If email is already registered or email sending fails
    """
    # Check if user already exists in the main Users table
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Check if there's already a pending registration
    pending = get_pending_registration(user_data.email)
    if pending:
        # Allow re-sending OTP by generating a new one
        pass

    # Generate cryptographically secure OTP
    otp = generate_otp()

    # Hash the password
    hashed_pwd = hash_password(user_data.password)

    # Store pending registration in Redis with TTL
    store_pending_registration(
        email=user_data.email,
        hashed_password=hashed_pwd,
        name=user_data.name,
        otp=otp
    )

    # Send verification email
    try:
        email_sent = send_verification_email(
            to_email=user_data.email,
            otp=otp,
            name=user_data.name
        )

        if not email_sent:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email. Please try again."
            )

    except Exception as e:
        # Clean up pending registration if email fails
        delete_pending_registration(user_data.email)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send verification email: {str(e)}"
        )

    return OTPResponse(
        message="OTP sent successfully. Please check your email.",
        email=user_data.email
    )


@router.post("/verify-otp", response_model=Token, status_code=status.HTTP_201_CREATED)
def verify_otp_endpoint(otp_data: VerifyOTP, db: Session = Depends(get_db)) -> Token:
    """
    Verify OTP and complete user registration.

    This is the second step of the two-step registration process.
    Upon successful verification, the user account is created.

    Args:
        otp_data: OTP verification data (email, otp)
        db: Database session

    Returns:
        JWT access token for the new user

    Raises:
        HTTPException: If OTP is invalid, expired, or user creation fails
    """
    # Retrieve pending registration data
    pending_data = get_pending_registration(otp_data.email)

    if pending_data is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP. Please request a new one."
        )

    # Verify OTP
    if not verify_otp(otp_data.email, otp_data.otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP code"
        )

    # Double-check that email doesn't exist (race condition protection)
    existing_user = db.query(User).filter(User.email == otp_data.email).first()
    if existing_user:
        delete_pending_registration(otp_data.email)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create the actual user in the database
    new_user = User(
        email=pending_data["email"],
        hashed_password=pending_data["hashed_password"],
        name=pending_data.get("name"),
        is_active=True,
        is_verified=True,  # Verified through OTP
        created_at=now_local(),
        last_login=now_local()
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # Delete pending registration from Redis
        delete_pending_registration(otp_data.email)

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user account: {str(e)}"
        )

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(new_user.id), "email": new_user.email},
        expires_delta=access_token_expires
    )

    return Token(access_token=access_token, token_type="bearer")


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED, deprecated=True)
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

    # Check if user email is verified
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not verified. Please complete registration."
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


@router.post("/delete-initiate", response_model=OTPResponse, status_code=status.HTTP_200_OK)
def delete_account_initiate(
    current_user: User = Depends(get_current_active_user)
) -> OTPResponse:
    """
    Initiate account deletion by sending OTP to user's email.

    This is the first step of the two-step account deletion process.
    A 6-digit OTP is sent to the user's email for verification.
    Upon successful verification, the account and ALL associated data will be permanently deleted.

    Args:
        current_user: Current authenticated user

    Returns:
        Success message with email confirmation

    Raises:
        HTTPException: If email sending fails
    """
    # Generate cryptographically secure OTP
    otp = generate_otp()

    # Store deletion OTP in Redis with TTL
    store_deletion_otp(user_id=current_user.id, otp=otp)

    # Send account deletion warning email
    try:
        email_sent = send_account_deletion_email(
            to_email=current_user.email,
            otp=otp,
            name=current_user.name
        )

        if not email_sent:
            # Clean up OTP if email fails
            delete_deletion_otp(current_user.id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send deletion email. Please try again."
            )

    except Exception as e:
        # Clean up OTP if email fails
        delete_deletion_otp(current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send deletion email: {str(e)}"
        )

    return OTPResponse(
        message="Deletion OTP sent successfully. Please check your email.",
        email=current_user.email
    )


@router.delete("/delete-confirm", response_model=DeleteAccountResponse, status_code=status.HTTP_200_OK)
def delete_account_confirm(
    otp_data: DeleteAccountConfirm,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
) -> DeleteAccountResponse:
    """
    Verify OTP and permanently delete user account.

    This is the second step of the two-step account deletion process.
    Upon successful OTP verification, the user account and ALL associated data
    (products, price history, API keys, preferences) will be permanently deleted.

    ⚠️ WARNING: This action cannot be undone!

    Args:
        otp_data: OTP verification data
        current_user: Current authenticated user
        db: Database session

    Returns:
        Success message confirming account deletion

    Raises:
        HTTPException: If OTP is invalid, expired, or deletion fails
    """
    # Verify OTP
    if not verify_deletion_otp(current_user.id, otp_data.otp):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code"
        )

    # Delete the OTP from Redis
    delete_deletion_otp(current_user.id)

    # Delete the user account (cascade deletes will handle related data)
    try:
        db.delete(current_user)
        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete account: {str(e)}"
        )

    # Note: The JWT token will be invalidated client-side
    # The server cannot invalidate stateless JWT tokens
    return DeleteAccountResponse(
        message="Account successfully deleted. All data has been permanently removed."
    )
