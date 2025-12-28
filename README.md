# Mantis Price Tracker

A cloud-native, AI-powered multi-tenant product tracker that scrapes e‑commerce pages, runs a LangChain agent over the DOM, and keeps price history — all with secure user authentication and data isolation. Built to show what production-ready AI automation looks like with modern web deployment.

![Mantis screenshot](mantis/public/mantis-app.png)

## Why It Matters

- **Full-stack AI agenting** – Selenium renders any storefront, Gemini 2.5 Flash extracts structured product facts, FastAPI normalizes and persists them.
- **Multi-tenant architecture** – Secure JWT-based authentication with complete user data isolation. Each user can only see their own tracked products and provider configurations.
- **Production-ready deployment** – Docker Compose orchestration with PostgreSQL, Cloudflare Tunnel for HTTPS, and automatic CORS handling via Next.js API proxy.
- **Resilient automation** – Six-hour APScheduler refreshes, per-product manual refresh, lowest-price tracking, trend deltas, timezone-aware timestamps.
- **Modern web experience** – Responsive Next.js UI with authentication flows, protected routes, and seamless login-to-signup redirection.

## Architecture at a Glance

```
╔═══════════════════╗          ╔══════════════════╗          ╔═══════════════╗
║  Next.js Frontend ║   /api   ║  FastAPI Backend ║          ║  PostgreSQL   ║
║  (React + Tailwind║─────────▶║  (Python 3.11)   ║─────────▶║   Database    ║
║   App Router)     ║◀─────────╢  LangChain Agent ║          ║  Multi-tenant ║
╚═══════════════════╝   Proxy  ╚══════════════════╝          ╚═══════════════╝
         │                           │
         │                           ▼
         │                    Selenium + Chrome
         ▼
  Cloudflare Tunnel (HTTPS)
```

- **Frontend**: Next.js 16 App Router, Shadcn UI, Tailwind CSS, with JWT authentication and protected routes.
- **Backend**: FastAPI, SQLAlchemy, APScheduler, LangChain with Google Gemini, JWT auth with bcrypt password hashing.
- **Database**: PostgreSQL 15 with multi-tenant data isolation (user-based foreign keys and query filtering).
- **Scraping**: Selenium + webdriver-manager (headless Chrome).
- **Deployment**: Docker Compose orchestration with health checks, automatic restarts, and Cloudflare Tunnel for HTTPS.

## Key Features

### Authentication & Multi-Tenancy
- **Secure user accounts** – Email/password registration with JWT token authentication (30-day expiration).
- **Protected routes** – All application features require authentication; automatic redirection to login.
- **Smart login flow** – If an email isn't found during login, automatically redirects to signup with email pre-filled.
- **Complete data isolation** – Each user can only access their own tracked products and provider configurations.
- **Password security** – Bcrypt hashing with minimum 8-character requirement.

### Product Tracking
- Track any product by pasting a URL; agent returns title, price, currency, stock state, source domain.
- Automatically stores product metadata and every price point in PostgreSQL with trend analysis.
- Daily auto-refresh (every six hours) keeps prices fresh; manual refresh for individual cards or the entire collection.
- Purple highlight for all-time low prices, up/down/flat indicators for recent deltas.
- Per-user provider API keys (e.g., Google Gemini) stored securely and linked to account.

## Repository Layout

```
.
├── backend/            # FastAPI app, LangChain agent, Selenium scraper, JWT auth
│   ├── app/
│   │   ├── auth/       # Authentication utilities (JWT, password hashing)
│   │   ├── routers/    # API endpoints (auth, products, providers)
│   │   ├── models.py   # SQLAlchemy models (User, Product, ProviderConfig, PriceHistory)
│   │   └── main.py     # FastAPI application with CORS
│   ├── Dockerfile      # Backend container build
│   └── requirements.txt
├── mantis/             # Next.js frontend (App Router) with authentication
│   ├── app/
│   │   ├── login/      # Login page
│   │   ├── register/   # Registration page
│   │   └── page.tsx    # Main dashboard (protected)
│   ├── components/
│   │   └── auth/       # Auth components (LoginForm, RegisterForm, ProtectedRoute)
│   ├── contexts/       # AuthContext for global auth state
│   ├── lib/            # Auth utilities and backend URL resolution
│   ├── Dockerfile      # Frontend container build
│   └── next.config.ts  # API proxy configuration
├── docker-compose.yml  # Multi-service orchestration
├── .env                # Environment variables (not committed)
└── .env.example        # Environment template
```

## Deployment Setup

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DB_USER` and `DB_PASSWORD` – PostgreSQL credentials
- `GOOGLE_API_KEY` – Google Gemini API key for AI agent
- `JWT_SECRET_KEY` – Generate with: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `CLOUDFLARE_TUNNEL_TOKEN` – (Optional) For HTTPS access via Cloudflare

### 2. Deploy with Docker Compose

```bash
# Build and start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

This starts:
- **PostgreSQL** (port 5432) – Database with health checks
- **FastAPI Backend** (port 8001) – API server with JWT auth
- **Next.js Frontend** (port 3000) – Web UI with authentication
- **Cloudflare Tunnel** (optional) – HTTPS access

### 3. Access the Application

- **Local**: http://localhost:3000
- **Production** (with Cloudflare Tunnel): https://your-tunnel.domain.com

First-time users will be redirected to `/register` to create an account.

## Authentication Flow

### Registration
1. User enters email, password (min 8 chars), and optional name at `/register`
2. Backend hashes password with bcrypt and stores user in PostgreSQL
3. JWT token generated with 30-day expiration
4. Token stored in localStorage and cookies
5. User redirected to dashboard

### Login
1. User enters email and password at `/login`
2. If email not found, **automatically redirects to `/register?email=user@example.com`** with email pre-filled
3. If credentials valid, JWT token generated and stored
4. User redirected to dashboard

### Protected Routes
- All dashboard routes wrapped in `<ProtectedRoute>` component
- Checks for valid JWT token on mount
- Redirects to `/login` if unauthenticated
- Token validated on every API request via `Authorization: Bearer` header

## Agent Flow

1. **Authenticate** – JWT token validated; user ID extracted for data isolation.
2. **Scrape** – Selenium fetches page HTML (async safe via `asyncio.to_thread`), logs trimmed for signal over noise.
3. **Clean** – BeautifulSoup strips script/style noise; DOM truncated to keep Gemini sharp.
4. **Extract** – LangChain `ChatGoogleGenerativeAI` invokes Gemini 2.5 Flash with structured output schema (`ProductExtraction` Pydantic model).
5. **Persist** – FastAPI stores/updates `Product` and `PriceHistory` with `user_id` foreign key; computes trends, previous price, all-time low.
6. **Serve** – API responds with user-specific data (filtered by `current_user.id`).

## Production Hardening Highlights

- **JWT Authentication** – Stateless tokens with configurable expiration, secure password hashing with bcrypt.
- **Multi-tenant isolation** – Database foreign keys and query filters ensure complete user data separation.
- **CORS handling** – Next.js API proxy (`/api/*` rewrites to backend) eliminates mixed content issues.
- **Health checks** – PostgreSQL container health monitoring ensures backend only starts when DB is ready.
- **Timezone-aware scheduling** – `tzlocal`, `now_local()` helper keeps refresh cadence aligned with the host system.
- **Error handling** – Comprehensive validation, user-friendly error messages, automatic login-to-signup redirection.
- **Docker optimization** – Multi-stage builds, layer caching, graceful Chrome installation fallback.

## Development Mode

For local development without Docker:

```bash
# 1. Start PostgreSQL (or use Docker for just the DB)
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=mantis_user \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=mantis_dev \
  postgres:15-alpine

# 2. Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
export DATABASE_URL="postgresql://mantis_user:your_password@localhost:5432/mantis_dev"
export GOOGLE_API_KEY="your_google_api_key"
export JWT_SECRET_KEY="your_generated_secret_key"
uvicorn app.main:app --reload --port 8000

# 3. Frontend (in new terminal)
cd mantis
npm install
npm run dev
```

## API Documentation

Once deployed, interactive API docs available at:
- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

Key endpoints:
- `POST /auth/register` – Create new user account
- `POST /auth/login` – Authenticate and get JWT token
- `GET /auth/me` – Get current user info (requires auth)
- `GET /products` – List user's tracked products (requires auth)
- `POST /products` – Add new product to track (requires auth)
- `GET /providers/config` – Get user's provider configurations (requires auth)

## Roadmap Ideas

- Email verification with Resend integration
- Password reset functionality
- User profile management (change password, update email)
- Historical charts and CSV export
- Watchlists and price alert notifications
- Admin dashboard for user management
- Rate limiting and API throttling
- CI/CD pipeline with automated testing and deployment

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a versioned history of notable updates.

---

**Built to demonstrate end-to-end AI agent craftsmanship** — from scraping resilience and prompt design to multi-tenant SaaS deployment with authentication, database design, and production hardening. A complete full-stack showcase from prototype to polished cloud-native product. 🚀

