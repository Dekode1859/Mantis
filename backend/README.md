Backend Quickstart
==================

The FastAPI backend exposes a `/products/fetch` endpoint that accepts a product
URL and returns the rendered page HTML. Follow these steps to run it locally.

1. Create and activate a virtual environment (example shown for PowerShell):

       python -m venv .venv
       .\.venv\Scripts\Activate.ps1

2. Install dependencies (Chrome/Chromium must be available on your machine; the
   script uses `webdriver-manager` to download the matching driver automatically):

       pip install -r requirements.txt

3. Provide your Gemini API key so LangChain can reach the Gemini 2.5 Flash model.
   You can export it in the shell or create a `.env` file (FastAPI loads it via
   `python-dotenv`):

       setx GOOGLE_API_KEY "<your-key-here>"

   Optional environment variable overrides:

   - `GEMINI_MODEL_NAME` (default: `gemini-2.5-flash`)
   - `SCRAPER_MAX_CHARS` (default: `15000`)

4. Start the FastAPI server from the `backend` directory:

       uvicorn app.main:app --reload

5. From another terminal, send a request to retrieve a page and structured data:

       curl --request POST http://127.0.0.1:8000/products/fetch ^
         --header "Content-Type: application/json" ^
         --data "{\"url\": \"https://example.com\"}"

   The response now includes the raw rendered HTML (`page_content`), the
   LangChain/Gemini structured extraction (`structured`), and the persisted
   database record (`product`).

6. Fetch the stored catalogue at any time:

       curl http://127.0.0.1:8000/products

   Each product contains the latest recorded price, currency, stock status, and
   timestamp. Additional runs of `/products/fetch` append new price history
   entries while updating the product snapshot.

7. Trigger an on-demand refresh of every tracked product:

       curl --request POST http://127.0.0.1:8000/products/refresh

   The endpoint returns immediately (HTTP 202) while the refresh runs in the
   background using the same logic as the scheduled job.

7. Automatic refresh: the server schedules a background refresh every six hours
   (four times per day) using the machine's local timezone. To disable or change
   this cadence, edit the scheduler configuration in `app/main.py`.

> **Schema changes**  
> The `products` table now stores `stock_status` and `last_checked`. If you
> created `price_tracker.db` with an earlier schema, delete the file (or run a
> migration) before restarting the app so SQLAlchemy can recreate the tables.

## Building a Standalone Backend Binary

Use PyInstaller to create a single-file executable (`mantis-engine`) that the
Electron shell can launch.

### 1. Install build dependencies

```bash
pip install -r requirements.txt
pip install pyinstaller
```

### 2. Generate the executable

```bash
pyinstaller run.py --name mantis-engine --onefile --paths .. --collect-all backend.app
```

This creates `dist/mantis-engine` (or `.exe` on Windows). The CLI accepts an
optional `--port` argument to bind the API server to a custom port.

### 3. Runtime behavior

- The SQLite database is stored in the user's application data directory (e.g.
  `%APPDATA%/Mantis` on Windows, `~/Library/Application Support/Mantis` on
  macOS).
- On startup the scheduler is initialised, refreshing products every six hours.
- Use `./mantis-engine --port 45789` to control the port when embedding in
  Electron or other shells.

