"""Groq provider adapter using OpenAI-compatible API."""

import json
from typing import Any, Dict, List

import httpx

from .base import ProviderAdapter


class GroqAdapter(ProviderAdapter):
    """Adapter for Groq API (OpenAI-compatible)."""

    BASE_URL = "https://api.groq.com/openai/v1"

    async def get_available_models(self, api_key: str) -> List[str]:
        """Fetch available models from Groq API."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.BASE_URL}/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()

                # Extract model IDs from response
                models = [model["id"] for model in data.get("data", [])]
                return models
        except Exception as e:
            raise Exception(f"Failed to fetch Groq models: {str(e)}")

    async def extract_product_info(
        self,
        html_content: str,
        api_key: str,
        model: str
    ) -> Dict[str, Any]:
        """Extract product information using Groq LLM."""

        system_prompt = """You are a product information extraction assistant.
Extract the following information from the HTML content:
- title: Product name/title
- price: Numeric price value (just the number)
- currency: Currency code (e.g., USD, EUR, INR)
- stock_status: One of "In Stock", "Out of Stock", or "Unknown"

Return ONLY valid JSON with these exact keys. No additional text."""

        user_prompt = f"""Extract product information from this HTML:

{html_content[:8000]}

Return JSON with: title, price, currency, stock_status"""

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 500
                    },
                    timeout=30.0
                )
                response.raise_for_status()
                data = response.json()

                # Extract the response content
                content = data["choices"][0]["message"]["content"]

                # Parse JSON response
                try:
                    result = json.loads(content)
                    return result
                except json.JSONDecodeError:
                    # Try to extract JSON from markdown code blocks
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0].strip()
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0].strip()
                    result = json.loads(content)
                    return result

        except Exception as e:
            raise Exception(f"Failed to extract product info with Groq: {str(e)}")

    async def test_connection(self, api_key: str, model: str) -> Dict[str, Any]:
        """Test connection to Groq API."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "user", "content": "Hello, this is a test."}
                        ],
                        "max_tokens": 10
                    },
                    timeout=10.0
                )
                response.raise_for_status()

                return {
                    "status": "success",
                    "message": f"Successfully connected to Groq with model {model}"
                }
        except httpx.HTTPStatusError as e:
            return {
                "status": "error",
                "message": f"HTTP {e.response.status_code}: {e.response.text}"
            }
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }
