from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

from .models import PageMetadata


class PageFetchError(RuntimeError):
    pass


@dataclass(frozen=True)
class FetchedPage:
    metadata: PageMetadata
    html: str


class PageFetcher:
    def __init__(self, timeout_seconds: float = 30.0) -> None:
        self._client = httpx.Client(
            follow_redirects=True,
            timeout=timeout_seconds,
            headers={"User-Agent": "Mantis/0.1 product selector discovery"},
        )

    def __enter__(self) -> "PageFetcher":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def fetch(self, url: str) -> FetchedPage:
        try:
            response = self._client.get(url)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise PageFetchError(f"could not fetch {url}: {exc}") from exc

        content_type = response.headers.get("content-type")
        if content_type and "html" not in content_type.lower():
            raise PageFetchError(f"expected an HTML page, received {content_type}")

        metadata = PageMetadata(
            requested_url=url,
            final_url=str(response.url),
            status_code=response.status_code,
            content_type=content_type,
            fetched_at=datetime.now(timezone.utc),
            byte_length=len(response.content),
        )
        return FetchedPage(metadata=metadata, html=response.text)

