"""API endpoints for provider configuration management."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth.utils import get_current_active_user
from ..database import get_db
from ..models import ProviderConfig, User
from ..providers.groq import GroqAdapter

router = APIRouter(prefix="/providers", tags=["providers"])

# Available provider adapters
PROVIDER_ADAPTERS = {
    "groq": GroqAdapter(),
    # Add more providers here later
    # "openai": OpenAIAdapter(),
    # "google": GoogleAdapter(),
    # "anthropic": AnthropicAdapter(),
}


# Pydantic models for request/response
class ProviderConfigCreate(BaseModel):
    provider_name: str
    api_key: str
    model_name: str


class ProviderConfigResponse(BaseModel):
    id: int
    provider_name: str
    api_key: str  # In production, mask this
    model_name: str
    is_active: bool

    class Config:
        from_attributes = True


class TestConnectionRequest(BaseModel):
    provider_name: str
    api_key: str
    model_name: str


@router.get("/available", response_model=List[str])
async def get_available_providers():
    """Get list of supported providers."""
    return list(PROVIDER_ADAPTERS.keys())


@router.get("/config", response_model=Optional[ProviderConfigResponse])
async def get_provider_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get the current active provider configuration for the current user."""
    config = db.query(ProviderConfig).filter(
        ProviderConfig.is_active == True,
        ProviderConfig.user_id == current_user.id
    ).first()
    return config


@router.post("/config", response_model=ProviderConfigResponse)
async def save_provider_config(
    config: ProviderConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Save provider configuration for the current user (replaces existing config for this provider)."""

    # Validate provider exists
    if config.provider_name not in PROVIDER_ADAPTERS:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{config.provider_name}' not supported"
        )

    # Delete existing config for this provider and user (unique constraint: user_id + provider_name)
    db.query(ProviderConfig).filter(
        ProviderConfig.user_id == current_user.id,
        ProviderConfig.provider_name == config.provider_name
    ).delete()

    # Create new config
    new_config = ProviderConfig(
        user_id=current_user.id,
        provider_name=config.provider_name,
        api_key=config.api_key,
        model_name=config.model_name,
        is_active=True
    )

    db.add(new_config)
    db.commit()
    db.refresh(new_config)

    return new_config


@router.get("/{provider_name}/models", response_model=List[str])
async def get_provider_models(
    provider_name: str,
    api_key: str,
):
    """Fetch available models for a provider."""

    if provider_name not in PROVIDER_ADAPTERS:
        raise HTTPException(
            status_code=404,
            detail=f"Provider '{provider_name}' not supported"
        )

    adapter = PROVIDER_ADAPTERS[provider_name]

    try:
        models = await adapter.get_available_models(api_key)
        return models
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch models: {str(e)}"
        )


@router.post("/test", response_model=Dict[str, Any])
async def test_provider_connection(request: TestConnectionRequest):
    """Test connection with provider using given credentials."""

    if request.provider_name not in PROVIDER_ADAPTERS:
        raise HTTPException(
            status_code=404,
            detail=f"Provider '{request.provider_name}' not supported"
        )

    adapter = PROVIDER_ADAPTERS[request.provider_name]

    result = await adapter.test_connection(request.api_key, request.model_name)

    if result["status"] == "error":
        raise HTTPException(status_code=400, detail=result["message"])

    return result
