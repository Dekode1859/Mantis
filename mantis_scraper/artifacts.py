import json
import re
from datetime import datetime, timezone
from pathlib import Path

from .discovery import html_for_model
from .fetcher import FetchedPage
from .models import ExtractedProduct, SelectorConfiguration
from .validation import SelectorIssue, SelectorValidationReport


def create_run_dir(base_dir: str | Path, source_url: str) -> Path:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", source_url).strip("-").lower()[-80:]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = Path(base_dir) / f"{stamp}-{slug or 'page'}"
    run_dir.mkdir(parents=True, exist_ok=False)
    return run_dir


def _write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


def save_run(
    run_dir: Path,
    *,
    page: FetchedPage,
    model_input: str,
    proposal: SelectorConfiguration,
    validation: SelectorValidationReport,
    extraction: ExtractedProduct,
    attempts: list[dict[str, object]] | None = None,
) -> None:
    save_page_artifacts(run_dir, page=page, model_input=model_input)
    _write_json(run_dir / "selector-config.json", proposal.model_dump(mode="json"))
    _write_json(run_dir / "validation.json", {"matched_nodes": validation.matched_nodes})
    _write_json(run_dir / "extraction.json", extraction.model_dump(mode="json"))
    if attempts is not None:
        _write_json(run_dir / "attempts.json", attempts)


def save_page_artifacts(run_dir: Path, *, page: FetchedPage, model_input: str) -> None:
    (run_dir / "page.html").write_text(page.html, encoding="utf-8")
    (run_dir / "model-input.html").write_text(model_input, encoding="utf-8")
    _write_json(run_dir / "page.json", page.metadata.model_dump(mode="json"))


def save_failure(
    run_dir: Path,
    *,
    page: FetchedPage,
    model_input: str,
    error: str,
    configuration: SelectorConfiguration | None = None,
    issues: list[SelectorIssue] | None = None,
    attempts: list[dict[str, object]] | None = None,
) -> None:
    save_page_artifacts(run_dir, page=page, model_input=model_input)
    if configuration is not None:
        _write_json(run_dir / "selector-config.json", configuration.model_dump(mode="json"))
    _write_json(
        run_dir / "failure.json",
        {
            "error": error,
            "selector_issues": [issue.__dict__ for issue in issues or []],
        },
    )
    if attempts is not None:
        _write_json(run_dir / "attempts.json", attempts)


def model_input_for(html: str, max_chars: int) -> str:
    return html_for_model(html, max_chars)
