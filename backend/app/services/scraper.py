"""
Webpage retrieval service using Selenium.

Selenium's synchronous API is executed in a worker thread so the FastAPI handler
remains non-blocking.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Iterable, Optional

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

logger = logging.getLogger(__name__)
logging.getLogger("WDM").setLevel(logging.WARNING)

_DEFAULT_CHROME_ARGS: Iterable[str] = (
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--window-size=1920,1080",
)


def _build_driver(timeout_ms: int) -> webdriver.Chrome:
    options = Options()
    for arg in _DEFAULT_CHROME_ARGS:
        options.add_argument(arg)

    logger.debug("Launching ChromeDriver with args: %s", list(_DEFAULT_CHROME_ARGS))
    service = Service(ChromeDriverManager().install())
    logger.debug("Using ChromeDriver binary at %s", service.path)

    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(timeout_ms / 1000)
    return driver


def _fetch_page_content_sync(url: str, timeout_ms: int) -> str:
    """Blocking helper that launches headless Chrome and returns rendered HTML."""
    target_url = str(url)
    logger.debug("Fetching %s via Selenium", target_url)
    driver: Optional[webdriver.Chrome] = None
    try:
        driver = _build_driver(timeout_ms)
        driver.get(target_url)
        time.sleep(1)  # Allow dynamic sections a moment to settle.
        page_source = driver.page_source
        logger.debug("Fetched %s characters from %s", len(page_source), target_url)
        return page_source
    except Exception:
        logger.exception("Selenium fetch failed for %s", target_url)
        raise
    finally:
        if driver is not None:
            driver.quit()
            logger.debug("Closed ChromeDriver for %s", target_url)


async def fetch_page_content(url: str, timeout_ms: int = 30000) -> str:
    """
    Fetch the rendered HTML content of the given URL.

    Selenium is blocking, so we execute it in a worker thread to keep the event
    loop responsive.
    """
    return await asyncio.to_thread(_fetch_page_content_sync, url, timeout_ms)

