# Mantis Price Tracker

A local-first, AI-powered product tracker that scrapes e‑commerce pages, runs a LangChain agent over the DOM, and keeps price history — all wrapped in a portable Electron bundle. Built to show what production-ready AI automation looks like when you own the entire stack.

![Mantis screenshot](mantis/public/mantis-app.png)

## Why It Matters

- **Full-stack AI agenting** – Selenium renders any storefront, Gemini 2.5 Flash extracts structured product facts, FastAPI normalizes and persists them.
- **Local-first privacy** – Everything runs on-device; SQLite sits in the Electron user-data directory, and the agent only calls your key.
- **Production deployment** – PyInstaller ships the Python backend as `mantis-engine.exe`, Electron bundles the Next.js UI, and a PowerShell script stitches everything into a single `mantis.exe`.
- **Resilient automation** – Six-hour APScheduler refreshes, per-product manual refresh, lowest-price tracking, trend deltas, timezone-aware timestamps.
- **Operator experience** – Tray icon controls, live backend port discovery, API key management with secure storage and hot reload.

## Architecture at a Glance

```
╔══════════════════╗          ╔══════════════════╗
║  Electron Shell  ║  IPC     ║  FastAPI Backend ║
║  (React + Tailwind╠────────▶║  (Python 3.12)   ║
║   static export)  ║◀────────╢  LangChain Agent ║
╚══════════════════╝   HTTP   ╚══════════════════╝
         │                           │
         ▼                           ▼
  Local settings JSON         Selenium + SQLite
```

- **Frontend**: Next.js 14 App Router, Shadcn UI, Tailwind CSS, static-exported for desktop delivery.
- **Backend**: FastAPI, SQLAlchemy, APScheduler, LangChain with Google Gemini (configurable to Ollama).
- **Scraping**: Selenium + webdriver-manager (headless Chrome).
- **Packaging**: PyInstaller for backend, electron-builder (portable target) for desktop bundle.

## Key Features

- Track any product by pasting a URL; agent returns title, price, currency, stock state, source domain.
- Automatically stores product metadata and every price point in SQLite with trend analysis.
- Daily auto-refresh (every six hours) keeps prices fresh; manual refresh for individual cards or the entire collection.
- Purple highlight for all-time low prices, up/down/flat indicators for recent deltas.
- Settings tab lets users drop in a Google API key; Electron restarts the backend with the new environment.
- Tray menu enables “Open Dashboard”, “Refresh Now”, “Restart Backend”, “Quit” while keeping the Python engine aligned with Electron lifecycle.

## Repository Layout

```
.
├── backend/            # FastAPI app, LangChain agent, Selenium scraper, PyInstaller entrypoint
├── mantis/             # Next.js frontend (App Router), static export + Tailwind theme
├── electron/           # Electron main process, preload bridge, builder config
└── scripts/            # Packaging automation (PowerShell)
```

## Run It Locally (Dev Mode)

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app.main:app --reload

# Frontend
cd ../mantis
npm install
npm run dev

# Electron (optional dev shell)
cd ../electron
npm install
cross-env ELECTRON_START_URL=http://localhost:3000 npm run start
```

## Ship It (Single Executable)

```powershell
# From repository root on Windows
.\scripts\package-mantis.ps1

# Output artifacts
# - backend/dist/mantis-engine.exe  (standalone FastAPI agent)
# - electron/dist/mantis.exe        (portable desktop app, bundles backend + frontend)
```

- PyInstaller compiles the backend with bundled dependencies.
- Next.js builds a static export on demand (Electron auto-builds if missing).
- electron-builder packages everything as a `portable` target — no installer loop, no symlink woes.

## Agent Flow

1. **Scrape** – Selenium fetches page HTML (async safe via `asyncio.to_thread`), logs trimmed for signal over noise.
2. **Clean** – BeautifulSoup strips script/style noise; DOM truncated to keep Gemini sharp.
3. **Extract** – LangChain `ChatGoogleGenerativeAI` invokes Gemini 2.5 Flash with structured output schema (`ProductExtraction` Pydantic model).
4. **Persist** – FastAPI stores/updates `Product` and `PriceHistory`; computes trends, previous price, all-time low.
5. **Serve** – API responds with structured payload + hydrated tracked product for the UI.

## Production Hardening Highlights

- Dynamic port detection with stdout handshake (`[mantis-engine] listening on host:port`).
- Electron ensures backend shutdown on quit/restart (`stopBackend()` wired into all lifecycle and signal hooks).
- Timezone-aware scheduling (`tzlocal`, `now_local()` helper) keeps refresh cadence aligned with the host system.
- Type-safe IPC bridge (`global.d.ts`, `preload.js`) and runtime guards for Electron vs browser usage.
- Quiet Selenium logging and progress UI states to keep operators informed without noise.

## Roadmap Ideas

- Ollama + local LLM fallback (Gemini optional).
- Historical charts and export under the “History” tab.
- Watchlists, alert thresholds, and multi-user profile settings.

---

**Built to demonstrate end-to-end AI agent craftsmanship** — from scraping resilience and prompt design to shipping a one-click desktop experience. If your team needs someone who can go from prototype to polished product, let’s chat. 🚀

