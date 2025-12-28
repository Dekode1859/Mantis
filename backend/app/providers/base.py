"""Base provider adapter interface."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class ProviderAdapter(ABC):
    """Abstract base class for LLM provider adapters."""

    @abstractmethod
    async def get_available_models(self, api_key: str) -> List[str]:
        """
        Fetch available models from the provider API.

        Args:
            api_key: The API key for authentication

        Returns:
            List of model names available from this provider
        """
        pass

    @abstractmethod
    async def extract_product_info(
        self,
        html_content: str,
        api_key: str,
        model: str
    ) -> Dict[str, Any]:
        """
        Extract product information from HTML using the LLM.

        Args:
            html_content: The HTML content to analyze
            api_key: The API key for authentication
            model: The model name to use

        Returns:
            Dict containing extracted product info (title, price, currency, stock_status)
        """
        pass

    @abstractmethod
    async def test_connection(self, api_key: str, model: str) -> Dict[str, Any]:
        """
        Test the connection with the provider using the given API key and model.

        Args:
            api_key: The API key for authentication
            model: The model name to test

        Returns:
            Dict with status and any error messages
        """
        pass
