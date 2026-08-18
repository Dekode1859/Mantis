# Mantis

Mantis is a small product-link collection with a Cloudflare Worker shell. The current UI validates links, prevents duplicates, stores queued cards in browser storage, and leaves product fields empty until extraction is connected.

## Run locally

```powershell
cd D:\Mantis
npm install
npm run check
npm run dev
```

Open the Vite URL, add an HTTP or HTTPS product link, and refresh the page to verify local persistence.

## Run through Wrangler

```powershell
npm run build
npx wrangler dev
```

The Worker health endpoint is available at `/api/health`.

## Validate a deployment

```powershell
npm run deploy:dry-run
```

This builds the UI and validates the Worker upload without changing the Cloudflare account.

## Run the scraper slice

The scraper uses Python 3.11 through UV. The LLM proposes CSS selectors only; Pydantic validates the proposal, and BeautifulSoup performs the extraction without another model call.

```powershell
cd D:\Mantis
Copy-Item .env.example .env
notepad .env
uv sync
uv run pytest
```

Set `OLLAMA_API_KEY` in `.env`. `OLLAMA_MODEL` defaults to `gpt-oss:120b`, and JSON mode is used for Ollama's structured response. Available models can be listed with:

```powershell
uv run python -m mantis_scraper models
```

Run discovery and extraction for one page:

```powershell
uv run python -m mantis_scraper discover --url "https://example.com/product"
```

Each run is saved under `data/runs/` with the fetched HTML, the bounded HTML sent to the model, the selector-only configuration, validation counts, and deterministic extracted values. The saved configuration contains selectors, not product values.
