import argparse
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from openai import OpenAIError

from .artifacts import create_run_dir, model_input_for, save_failure, save_run
from .discovery import SelectorDiscoveryAgent
from .extractor import extract_product
from .fetcher import PageFetchError, PageFetcher
from .models import SelectorConfiguration
from .validation import SelectorValidationError, validate_selectors


def _required_api_key() -> str:
    value = os.getenv("OLLAMA_API_KEY")
    if not value:
        raise ValueError("OLLAMA_API_KEY is not set; copy .env.example to .env and add the key")
    return value


def _discover(args: argparse.Namespace) -> int:
    model = args.model or os.getenv("OLLAMA_MODEL", "gpt-oss:120b")
    base_url = os.getenv("OLLAMA_BASE_URL", "https://ollama.com/v1")
    structured_method = args.structured_method or os.getenv(
        "OLLAMA_STRUCTURED_METHOD", "json_mode"
    )
    max_chars = args.max_model_chars

    with PageFetcher(timeout_seconds=args.timeout) as fetcher:
        page = fetcher.fetch(args.url)

    run_dir = create_run_dir(args.output_dir, str(page.metadata.final_url))
    model_input = model_input_for(page.html, max_chars)
    agent = SelectorDiscoveryAgent(
        model_name=model,
        api_key=_required_api_key(),
        base_url=base_url,
        structured_method=structured_method,
    )
    attempts: list[dict[str, object]] = []
    feedback = "None. This is the first proposal."
    configuration: SelectorConfiguration | None = None
    validation = None
    extraction = None

    try:
        for attempt_number in range(1, args.max_attempts + 1):
            try:
                proposal = agent.discover(
                    source_url=str(page.metadata.final_url),
                    html=page.html,
                    max_chars=max_chars,
                    validation_feedback=feedback,
                )
                configuration = SelectorConfiguration(
                    source_url=page.metadata.final_url,
                    site=agent.site_for_url(str(page.metadata.final_url)),
                    model=model,
                    selectors=proposal,
                )
                validation = validate_selectors(page.html, configuration)
                extraction = extract_product(page.html, configuration)
                attempts.append({"attempt": attempt_number, "status": "accepted"})
                break
            except (SelectorValidationError, ValueError) as exc:
                feedback = str(exc)
                attempts.append(
                    {"attempt": attempt_number, "status": "rejected", "error": feedback}
                )
                if attempt_number == args.max_attempts:
                    save_failure(
                        run_dir,
                        page=page,
                        model_input=model_input,
                        error=feedback,
                        configuration=configuration,
                        issues=getattr(exc, "issues", None),
                        attempts=attempts,
                    )
                    raise
    except Exception as exc:
        if not (run_dir / "failure.json").exists():
            save_failure(
                run_dir,
                page=page,
                model_input=model_input,
                error=str(exc),
                configuration=configuration,
                attempts=attempts,
            )
        raise

    if configuration is None or validation is None or extraction is None:
        raise RuntimeError("selector discovery ended without an extraction result")

    save_run(
        run_dir,
        page=page,
        model_input=model_input,
        proposal=configuration,
        validation=validation,
        extraction=extraction,
        attempts=attempts,
    )

    print(
        json.dumps(
            {
                "run_dir": str(run_dir),
                "source_url": str(configuration.source_url),
                "model": configuration.model,
                "matched_nodes": validation.matched_nodes,
                "selectors": configuration.selectors.model_dump(mode="json"),
                "extracted": extraction.model_dump(mode="json"),
            },
            indent=2,
        )
    )
    return 0


def _list_models(_: argparse.Namespace) -> int:
    key = _required_api_key()
    response = httpx.get(
        "https://ollama.com/api/tags",
        headers={"Authorization": f"Bearer {key}"},
        timeout=30,
    )
    response.raise_for_status()
    models = response.json().get("models", [])
    for model in models:
        print(model.get("name", ""))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mantis-scraper")
    commands = parser.add_subparsers(dest="command", required=True)

    discover = commands.add_parser("discover")
    discover.add_argument("--url", required=True)
    discover.add_argument("--model")
    discover.add_argument("--output-dir", default="data/runs")
    discover.add_argument("--max-model-chars", type=int, default=260_000)
    discover.add_argument("--timeout", type=float, default=30.0)
    discover.add_argument("--structured-method", choices=["function_calling", "json_mode"])
    discover.add_argument("--max-attempts", type=int, default=2)
    discover.set_defaults(handler=_discover)

    models = commands.add_parser("models")
    models.set_defaults(handler=_list_models)
    return parser


def main() -> int:
    load_dotenv()
    args = build_parser().parse_args()
    try:
        return args.handler(args)
    except (PageFetchError, SelectorValidationError, ValueError, httpx.HTTPError, OpenAIError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
