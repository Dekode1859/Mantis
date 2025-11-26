"""
Command-line utility to fetch rendered HTML using the Selenium-based scraper.

Prompts the user for a URL, renders it in headless Chrome, and prints the
resulting page content to stdout.
"""

from __future__ import annotations

import asyncio

from app.services.agent import extract_product_data
from app.services.scraper import fetch_page_content


async def main() -> None:
    url = input("Enter product URL: ").strip()
    if not url:
        print("No URL provided; exiting.")
        return

    try:
        html = await fetch_page_content(url)
    except Exception as exc:  # noqa: BLE001 - provide readable CLI error
        print(f"Failed to fetch page: {exc}")
        return

    print("\n===== Structured Result =====\n")
    try:
        structured = await extract_product_data(html)
    except Exception as exc:  # noqa: BLE001
        print(f"Extraction failed: {exc}")
        structured = None

    if structured:
        print(structured.model_dump_json(indent=2))
    else:
        print("No structured data.")

    print("\n===== Rendered HTML (truncated) =====\n")
    print(html[:2000])


if __name__ == "__main__":
    asyncio.run(main())

