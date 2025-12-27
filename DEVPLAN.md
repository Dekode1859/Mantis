# Authentication System Implementation Plan for Mantis Price Tracker

## Overview

This plan implements JWT-based authentication for dual deployment (Electron desktop app + web application) with email verification, password reset, PostgreSQL/MySQL database migration, and self-hosted infrastructure on your Proxmox home server.

## User Requirements Summary

- **Deployment**: Both Electron (desktop) and Web (via Cloudflare tunnels)
- **Auth Method**: JWT tokens (access + refresh)
- **User Model**: Single user per installation (isolated product data)
- **External Services**: Email verification, password reset, PostgreSQL database, self-hosted SMTP
- **Infrastructure**: Home server (Proxmox VE), Cloudflare tunnels to domain

## Architecture Strategy

### Electron (Desktop)
- **Keep SQLite** - No migration needed, remains local-first
- **No authentication required** for initial release (single-user device)
- **Optional**: Add auth later for cloud sync feature
- **Benefit**: Zero disruption to existing users

### Web (Browser)
- **Use PostgreSQL** - Multi-user support, hosted on home server
- **Full authentication** - Required from day one
- **Email verification** - SMTP server (self-hosted or external)
- **Accessible globally** - Via Cloudflare tunnel

---

## Files to Create (New Files)

### Backend - Authentication Core

1. **`/root/Mantis/backend/app/utils/auth.py`** (NEW)
   - JWT token generation (access + refresh)
   - Password hashing with bcrypt
   - Token validation and expiry
   - User authentication dependency (`get_current_user`, `get_verified_user`)
   - Environment variables: `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`

2. **`/root/Mantis/backend/app/services/email.py`** (NEW)
   - SMTP email sending (aiosmtplib)
   - Email verification template and sending
   - Password reset template and sending
   - Environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `FRONTEND_URL`

3. **`/root/Mantis/backend/app/schemas/auth.py`** (NEW)
   - Pydantic models: `UserRegister`, `UserLogin`, `TokenResponse`, `VerifyEmail`, `RequestPasswordReset`, `ResetPassword`, `UserProfile`
   - Password validation (min 8 characters)

4. **`/root/Mantis/backend/app/routers/auth.py`** (NEW)
   - **POST /auth/register** - Create account + send verification email
   - **POST /auth/login** - Authenticate and return tokens
   - **POST /auth/refresh** - Refresh access token
   - **POST /auth/verify-email** - Verify email with token
   - **POST /auth/request-password-reset** - Send reset email
   - **POST /auth/reset-password** - Reset password with token
   - **GET /auth/me** - Get current user profile

### Backend - Database Migration

5. **`/root/Mantis/backend/alembic.ini`** (NEW)
   - Alembic configuration file
   - Points to `alembic/` directory

6. **`/root/Mantis/backend/alembic/env.py`** (NEW)
   - Alembic environment setup
   - Imports models from `backend.app.models`
   - Reads `DATABASE_URL` from environment

7. **`/root/Mantis/backend/alembic/versions/001_add_authentication.py`** (NEW)
   - Creates `users` table with columns:
     - `id`, `email` (unique), `hashed_password`, `is_verified`
     - `verification_token`, `verification_token_expires`
     - `reset_token`, `reset_token_expires`
     - `created_at`, `updated_at`
   - Adds `user_id` foreign key to `products` table
   - Removes unique constraint on `products.url`
   - Adds composite unique constraint `(user_id, url)` to `products`

8. **`/root/Mantis/backend/.env.example`** (NEW)
   - Template for production environment variables
   - Documents all required variables (DATABASE_URL, JWT_SECRET_KEY, SMTP_*, etc.)

### Frontend - Authentication

9. **`/root/Mantis/mantis/contexts/AuthContext.tsx`** (NEW)
   - React Context for global auth state
   - User state, loading state, isAuthenticated
   - Functions: `login`, `register`, `logout`, `refreshToken`, `verifyEmail`, `requestPasswordReset`, `resetPassword`
   - **Environment-aware token storage**:
     - Electron: Uses IPC (`window.electronAPI.getAuthToken/saveAuthToken`)
     - Browser: Uses `localStorage`
   - Automatic token refresh every 25 minutes
   - Fetches user profile on mount

10. **`/root/Mantis/mantis/components/auth/LoginForm.tsx`** (NEW)
    - Login form with email + password
    - Uses `react-hook-form` + `zod` for validation
    - Calls `useAuth().login()`
    - Error display

11. **`/root/Mantis/mantis/components/auth/RegisterForm.tsx`** (NEW)
    - Registration form with email + password + confirm password
    - Uses `react-hook-form` + `zod` for validation
    - Calls `useAuth().register()`
    - Success message about verification email

12. **`/root/Mantis/mantis/components/auth/ProtectedRoute.tsx`** (NEW)
    - Wrapper component for protected content
    - Shows loading spinner while checking auth
    - Redirects to login if not authenticated
    - Shows email verification prompt if not verified
    - Renders children if authenticated and verified

13. **`/root/Mantis/mantis/components/auth/EmailVerificationPrompt.tsx`** (NEW)
    - UI component prompting user to verify email
    - Link to resend verification email

14. **`/root/Mantis/mantis/components/auth/LoginRegisterView.tsx`** (NEW)
    - Combined login/register view with tab switcher
    - Renders `LoginForm` or `RegisterForm`
    - Forgot password link

---

## Files to Modify (Existing Files)

### Backend Modifications

15. **`/root/Mantis/backend/app/models.py`** (MODIFY)
    - **Add User model** (new class):
      ```python
      class User(Base):
          __tablename__ = "users"
          id, email, hashed_password, is_verified
          verification_token, verification_token_expires
          reset_token, reset_token_expires
          created_at, updated_at
          products = relationship("Product", ...)
      ```
    - **Modify Product model**:
      - Add: `user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)`
      - Add: `user = relationship("User", back_populates="products")`
      - Remove: `url = Column(String, unique=True, ...)` (remove unique=True)
      - Add: `__table_args__ = (UniqueConstraint('user_id', 'url', name='uq_user_url'),)`

16. **`/root/Mantis/backend/app/database.py`** (MODIFY)
    - **Add database URL resolution**:
      ```python
      def _resolve_database_url() -> str:
          # Check DATABASE_URL env var (PostgreSQL/MySQL for web)
          # Fall back to MANTIS_DB_PATH (SQLite for Electron)
          # Default to sqlite:///./price_tracker.db
      ```
    - **Update engine creation**:
      - Add connection pooling for PostgreSQL
      - Keep `check_same_thread=False` for SQLite only
      - Add `pool_pre_ping=True` for connection health checks

17. **`/root/Mantis/backend/app/main.py`** (MODIFY)
    - **Import and include auth router**:
      ```python
      from .routers import products, auth
      app.include_router(auth.router)
      ```
    - **Add HTTPException handler** (optional, for better error responses)

18. **`/root/Mantis/backend/app/routers/products.py`** (MODIFY)
    - **Add authentication to all endpoints**:
      ```python
      from ..utils.auth import get_verified_user
      from ..models import User

      # Add to every endpoint:
      current_user: User = Depends(get_verified_user)
      ```
    - **Update all product queries**:
      - Add `.filter(Product.user_id == current_user.id)`
      - When creating products, set `product.user_id = current_user.id`
    - **Affected endpoints**:
      - `POST /products/fetch` - Filter by user, assign user_id
      - `GET /products` - Filter by user
      - `POST /products/refresh` - Filter by user
      - `DELETE /products/{product_id}` - Filter by user (prevent deletion of others' products)

19. **`/root/Mantis/backend/requirements.txt`** (MODIFY)
    - **Add authentication dependencies**:
      ```
      passlib[bcrypt]==1.7.4
      python-jose[cryptography]==3.3.0
      python-multipart==0.0.9
      aiosmtplib==3.0.2
      email-validator==2.1.0
      psycopg2-binary==2.9.9  # For PostgreSQL
      ```

### Frontend Modifications

20. **`/root/Mantis/mantis/app/layout.tsx`** (MODIFY)
    - **Wrap with AuthProvider**:
      ```tsx
      import { AuthProvider } from "@/contexts/AuthContext"

      export default function RootLayout({ children }) {
        return (
          <html lang="en">
            <body>
              <AuthProvider>
                {children}
              </AuthProvider>
            </body>
          </html>
        )
      }
      ```

21. **`/root/Mantis/mantis/app/page.tsx`** (MODIFY)
    - **Wrap main content with ProtectedRoute**:
      ```tsx
      import { ProtectedRoute } from "@/components/auth/ProtectedRoute"
      import { useAuth } from "@/contexts/AuthContext"

      export default function Home() {
        const { user } = useAuth()

        return (
          <ProtectedRoute>
            {/* Existing page content */}
          </ProtectedRoute>
        )
      }
      ```
    - **Update all API calls to include Authorization header**:
      ```tsx
      const token = await getToken() // From AuthContext
      fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          ...
        }
      })
      ```
    - **Affected functions**:
      - `handleTrack()` - Add auth header
      - `loadProducts()` - Add auth header
      - `deleteProduct()` - Add auth header

22. **`/root/Mantis/mantis/lib/backend.ts`** (MODIFY - optional helper)
    - **Add authenticated fetch helper**:
      ```tsx
      export async function authenticatedFetch(
        url: string,
        options: RequestInit = {}
      ) {
        const token = await getAuthToken() // from storage
        return fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            "Authorization": `Bearer ${token}`,
          },
        })
      }
      ```

### Electron Modifications

23. **`/root/Mantis/electron/preload.js`** (MODIFY)
    - **Add auth token IPC methods**:
      ```javascript
      contextBridge.exposeInMainWorld("electronAPI", {
        // ... existing methods
        getAuthToken: () => ipcRenderer.invoke("get-auth-token"),
        saveAuthToken: (token) => ipcRenderer.invoke("save-auth-token", token),
        getRefreshToken: () => ipcRenderer.invoke("get-refresh-token"),
        saveRefreshToken: (token) => ipcRenderer.invoke("save-refresh-token", token),
      })
      ```

24. **`/root/Mantis/electron/main.js`** (MODIFY)
    - **Add IPC handlers for auth tokens**:
      ```javascript
      ipcMain.handle("get-auth-token", async () => {
        return settings.authToken ?? null
      })

      ipcMain.handle("save-auth-token", async (_event, token) => {
        settings.authToken = token
        saveSettings()
        return { ok: true }
      })

      ipcMain.handle("get-refresh-token", async () => {
        return settings.refreshToken ?? null
      })

      ipcMain.handle("save-refresh-token", async (_event, token) => {
        settings.refreshToken = token
        saveSettings()
        return { ok: true }
      })
      ```

25. **`/root/Mantis/mantis/global.d.ts`** (MODIFY)
    - **Add auth methods to Window interface**:
      ```typescript
      interface Window {
        electronAPI?: {
          // ... existing methods
          getAuthToken(): Promise<string | null>
          saveAuthToken(token: string | null): Promise<{ ok: boolean }>
          getRefreshToken(): Promise<string | null>
          saveRefreshToken(token: string | null): Promise<{ ok: boolean }>
        }
      }
      ```

---

## External Infrastructure Requirements (Outside Codebase)

### 1. PostgreSQL Database Setup

**Recommended**: PostgreSQL 15+ on Proxmox LXC container

**Installation steps**:
```bash
# Create Debian LXC container in Proxmox UI
# SSH into container
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE mantis_production;
CREATE USER mantis_user WITH PASSWORD 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE mantis_production TO mantis_user;
\q

# Configure remote access
sudo nano /etc/postgresql/15/main/pg_hba.conf
# Add: host mantis_production mantis_user 192.168.x.0/24 md5

sudo nano /etc/postgresql/15/main/postgresql.conf
# Set: listen_addresses = '*'

sudo systemctl restart postgresql
```

**Connection string format**:
```
DATABASE_URL=postgresql://mantis_user:STRONG_PASSWORD_HERE@192.168.x.x:5432/mantis_production
```

**Why PostgreSQL over MySQL**:
- Better timezone support (critical for price tracking timestamps)
- Stronger ACID compliance and data integrity
- Superior full-text search capabilities
- Better JSON support for future features

### 2. SMTP Server Setup

**Option A: Self-hosted Postfix (Lightweight)**

```bash
sudo apt install postfix mailutils

# Configure as "Internet Site"
# System mail name: mail.yourdomain.com

# Basic configuration
sudo nano /etc/postfix/main.cf
# Set:
#   myhostname = mail.yourdomain.com
#   mydestination = localhost
#   inet_interfaces = all

sudo systemctl restart postfix

# Test
echo "Test" | mail -s "Test Email" your@email.com
```

**Environment variables**:
```bash
SMTP_HOST=192.168.x.x
SMTP_PORT=25
SMTP_USE_TLS=false
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_USER=
SMTP_PASSWORD=
```

**Option B: External SMTP (Recommended for reliability)**

Use Gmail, SendGrid, or other providers for better deliverability:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password  # Generate in Google Account settings
SMTP_FROM_EMAIL=your-email@gmail.com
```

**Recommendation**: Start with external SMTP (Gmail or SendGrid free tier) for guaranteed deliverability. Migrate to self-hosted later if needed.

### 3. Cloudflare Tunnel Configuration

**Installation on home server**:
```bash
# Download cloudflared
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate with Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create mantis-backend

# Configure tunnel
nano ~/.cloudflared/config.yml
```

**config.yml**:
```yaml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: mantis.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

**Run as systemd service**:
```bash
cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

**Cloudflare DNS configuration**:
1. Go to Cloudflare dashboard → DNS
2. Add CNAME record: `mantis` → `<TUNNEL-ID>.cfargotunnel.com`
3. Enable "Proxied" (orange cloud icon)
4. SSL/TLS mode: Full (Strict)

**Result**: `https://mantis.yourdomain.com` → Home server on port 8000

### 4. Environment Variables for Production

**Create**: `/root/Mantis/backend/.env.production`

```bash
# Database (PostgreSQL on home server)
DATABASE_URL=postgresql://mantis_user:PASSWORD@192.168.x.x:5432/mantis_production

# JWT Security (CRITICAL: Generate with: openssl rand -hex 32)
JWT_SECRET_KEY=<GENERATE_64_CHAR_HEX_STRING>

# SMTP Configuration
SMTP_HOST=smtp.gmail.com  # Or 192.168.x.x for self-hosted
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_USE_TLS=true

# Frontend URL (for email verification/reset links)
FRONTEND_URL=https://mantis.yourdomain.com

# CORS (match your domain)
CORS_ALLOW_ORIGINS=https://mantis.yourdomain.com

# Server Configuration
HOST=127.0.0.1
PORT=8000
```

**Create**: `/root/Mantis/mantis/.env.production`

```bash
NEXT_PUBLIC_API_BASE_URL=https://mantis.yourdomain.com
```

### 5. Backend Deployment (Systemd Service)

**Create**: `/etc/systemd/system/mantis-backend.service`

```ini
[Unit]
Description=Mantis Price Tracker Backend
After=network.target postgresql.service

[Service]
Type=simple
User=mantis
WorkingDirectory=/opt/mantis/backend
EnvironmentFile=/opt/mantis/backend/.env.production
ExecStart=/opt/mantis/backend/.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable mantis-backend
sudo systemctl start mantis-backend
sudo systemctl status mantis-backend
```

---

## Security Considerations

### Critical Security Measures

1. **Password Hashing**: Bcrypt via passlib (industry standard, automatic salting)

2. **JWT Token Security**:
   - Access tokens: 30 minutes (short-lived)
   - Refresh tokens: 7 days
   - Secret key: 64+ characters (use `openssl rand -hex 32`)
   - Tokens include type validation (access vs refresh)

3. **HTTPS Requirement**:
   - **MANDATORY for web deployment** (handled by Cloudflare)
   - Never send tokens over HTTP in production
   - Electron on localhost: HTTP is acceptable

4. **Email Token Security**:
   - Verification tokens: 24-hour expiry, one-time use
   - Reset tokens: 1-hour expiry, one-time use
   - Tokens cleared after successful use

5. **CORS Configuration**:
   - Whitelist specific origin only (no wildcards in production)
   - Set to: `https://mantis.yourdomain.com`

6. **SQL Injection Prevention**:
   - SQLAlchemy ORM handles parameterization automatically
   - Never use raw SQL with user input

7. **Rate Limiting** (Future enhancement):
   - Recommended: Add `slowapi` or `fastapi-limiter`
   - Apply to auth endpoints (5 requests/minute)
   - Prevent brute force attacks

### Environment Variable Security

- **NEVER commit `.env` files to git**
- Add to `.gitignore`: `.env`, `.env.production`, `.env.local`
- Store production secrets in secure location (password manager)
- Rotate `JWT_SECRET_KEY` every 6 months
- Use strong database passwords (20+ characters, mixed case, symbols)

---

## Database Migration Strategy

### Step 1: Initialize Alembic

```bash
cd /root/Mantis/backend
alembic init alembic  # Creates alembic/ directory
```

### Step 2: Create Migration

After updating `models.py` with User model and Product.user_id:

```bash
alembic revision -m "Add authentication tables"
# Edit the generated migration file in alembic/versions/
# Or use the provided 001_add_authentication.py template
```

### Step 3: Apply Migration

**For web deployment (PostgreSQL)**:
```bash
# Set DATABASE_URL to PostgreSQL
export DATABASE_URL=postgresql://mantis_user:password@192.168.x.x:5432/mantis_production
alembic upgrade head
```

**For Electron (SQLite)** - Optional, if adding auth later:
```bash
# Uses MANTIS_DB_PATH automatically
alembic upgrade head
```

### Step 4: Verify Migration

```bash
# PostgreSQL
psql -h 192.168.x.x -U mantis_user -d mantis_production
\dt  # List tables (should show users, products, price_history)
\d users  # Show users table schema
\d products  # Verify user_id column exists
```

### Rollback Strategy

```bash
# Rollback one migration
alembic downgrade -1

# Rollback to specific version
alembic downgrade <revision_id>

# View migration history
alembic history
alembic current
```

### Handling Existing Data

**Electron users**: No migration needed (keep SQLite, no auth)

**New web users**: Start fresh with PostgreSQL (no data to migrate)

**If migrating existing SQLite data to web**:
- Create migration script (`migrate_sqlite_to_postgres.py`)
- Create user account first
- Import products with `user_id` set
- Import price history linked to new product IDs

---

## Implementation Order

### Phase 1: Backend Foundation (Critical Path)

1. **Install dependencies** (`requirements.txt`)
2. **Create User model** (`models.py`)
3. **Update database.py** (PostgreSQL support)
4. **Create auth utilities** (`utils/auth.py`)
5. **Create email service** (`services/email.py`)
6. **Create auth schemas** (`schemas/auth.py`)
7. **Create auth router** (`routers/auth.py`)
8. **Update main.py** (include auth router)
9. **Setup Alembic** (init + migration)

### Phase 2: Infrastructure Setup (Parallel)

10. **Setup PostgreSQL** on Proxmox (can run in parallel)
11. **Setup SMTP** (Gmail or self-hosted)
12. **Configure Cloudflare tunnel**
13. **Create .env.production** with all secrets

### Phase 3: Database Migration

14. **Run Alembic migration** (`alembic upgrade head`)
15. **Verify database schema**
16. **Test backend auth endpoints** (register, login, verify)

### Phase 4: Frontend Implementation

17. **Create AuthContext** (`contexts/AuthContext.tsx`)
18. **Update layout.tsx** (wrap with AuthProvider)
19. **Create LoginForm** (`components/auth/LoginForm.tsx`)
20. **Create RegisterForm** (`components/auth/RegisterForm.tsx`)
21. **Create ProtectedRoute** (`components/auth/ProtectedRoute.tsx`)
22. **Update page.tsx** (wrap with ProtectedRoute, add auth headers)

### Phase 5: Electron Integration

23. **Update preload.js** (auth token IPC)
24. **Update main.js** (auth token handlers)
25. **Update global.d.ts** (TypeScript definitions)

### Phase 6: Backend Auth Integration

26. **Update products router** (`routers/products.py`) - Add `get_verified_user` dependency
27. **Test all product endpoints** with authentication

### Phase 7: Testing & Deployment

28. **Test locally**: Register → Verify → Login → Track product
29. **Deploy backend** to home server (systemd service)
30. **Deploy frontend** (build Next.js, serve static files)
31. **Test production**: End-to-end auth flow via Cloudflare tunnel
32. **Monitor logs** for errors

---

## Testing Checklist

### Backend Tests (Manual or pytest)

- [ ] Register new user → Returns access token
- [ ] Register duplicate email → Returns 400 error
- [ ] Login with correct credentials → Returns tokens
- [ ] Login with wrong password → Returns 401 error
- [ ] Refresh token → Returns new access token
- [ ] Access protected endpoint without token → Returns 401
- [ ] Access protected endpoint with valid token → Returns 200
- [ ] Verify email with valid token → Sets `is_verified=true`
- [ ] Verify email with expired token → Returns 400
- [ ] Request password reset → Sends email
- [ ] Reset password with valid token → Updates password
- [ ] Login with new password → Success

### Frontend Tests

- [ ] Navigate to app → Shows login screen
- [ ] Register new account → Shows success message
- [ ] Check email for verification link
- [ ] Click verification link → Redirects to app, shows verified status
- [ ] Logout → Redirects to login
- [ ] Login with credentials → Enters app
- [ ] Track a product → Product appears in list
- [ ] Refresh page → Stays logged in (token persists)
- [ ] Delete product → Only deletes user's own products
- [ ] Forgot password → Sends reset email
- [ ] Reset password → Allows login with new password

### Electron-specific Tests

- [ ] Open Electron app → Uses local SQLite (no auth required)
- [ ] Track product in Electron → Works without login
- [ ] (Future) Enable auth in Electron → Prompts for login, stores tokens via IPC

---

## Deployment Checklist

### Pre-deployment

- [ ] PostgreSQL database created and accessible
- [ ] SMTP server configured and tested
- [ ] Cloudflare tunnel running and DNS configured
- [ ] SSL certificate active (Cloudflare)
- [ ] Generated secure `JWT_SECRET_KEY` (64+ chars)
- [ ] All `.env.production` variables set

### Backend Deployment

- [ ] Clone repo to `/opt/mantis/backend`
- [ ] Create Python virtual environment
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Set environment variables (`.env.production`)
- [ ] Run Alembic migration: `alembic upgrade head`
- [ ] Test database connection
- [ ] Test SMTP email sending
- [ ] Create systemd service
- [ ] Start backend: `sudo systemctl start mantis-backend`
- [ ] Verify health endpoint: `curl http://localhost:8000/health`

### Frontend Deployment

- [ ] Set `NEXT_PUBLIC_API_BASE_URL` to production backend URL
- [ ] Build Next.js: `npm run build` (creates `/mantis/out`)
- [ ] Deploy static files to web server (Nginx, Cloudflare Pages, or Vercel)
- [ ] Test frontend loads: `https://mantis.yourdomain.com`

### Post-deployment

- [ ] Create admin account via registration
- [ ] Test full auth flow (register → verify → login → track product)
- [ ] Monitor backend logs: `journalctl -u mantis-backend -f`
- [ ] Test password reset flow
- [ ] Setup database backups (daily `pg_dump`)
- [ ] Configure log rotation
- [ ] Setup monitoring (uptime check, error tracking)

---

## Critical Files Summary

**Top 5 most critical files to implement**:

1. **`backend/app/utils/auth.py`** - Core authentication logic (JWT, password hashing, token validation)
2. **`backend/app/routers/auth.py`** - All auth endpoints (register, login, verify, reset)
3. **`backend/app/models.py`** - Database schema (User model, Product.user_id relationship)
4. **`mantis/contexts/AuthContext.tsx`** - Frontend auth state management (token storage, refresh)
5. **`backend/app/database.py`** - Database URL resolution (SQLite vs PostgreSQL)

**Additional important files** (priority order):
6. `backend/app/services/email.py` - Email verification and password reset
7. `backend/alembic/versions/001_add_authentication.py` - Database migration
8. `mantis/components/auth/LoginForm.tsx` - User-facing login UI
9. `backend/app/routers/products.py` (modify) - Add auth to existing endpoints
10. `electron/preload.js` (modify) - Auth token IPC methods

---

## Trade-offs and Recommendations

### Dual Deployment Strategy

**Recommended approach**:

1. **Electron (Desktop)**: Keep SQLite, skip auth initially (single-user, local-first)
2. **Web (Browser)**: Use PostgreSQL with full auth (multi-user, cloud-hosted)

**Benefits**:
- Zero disruption to existing Electron users
- Clear separation of concerns
- Web users get full auth from day one
- Can add Electron auth later (for cloud sync feature)

### Database Choice

**PostgreSQL over MySQL**:
- Better timezone support (critical for price tracking)
- Stronger ACID compliance
- Superior full-text search
- Better JSON support for future features
- More active community

### Email Service Choice

**External SMTP (Gmail/SendGrid) over self-hosted**:
- **Pros**: Better deliverability, no spam issues, managed service
- **Cons**: Cost (SendGrid free tier: 100 emails/day), rate limits

**Recommendation**: Start with Gmail SMTP (free, reliable). Migrate to self-hosted Postfix later if needed.

---

## Post-implementation Enhancements

**Not in scope for initial release, but consider later**:

1. **Rate limiting** - Prevent brute force attacks on auth endpoints
2. **2FA/MFA** - Two-factor authentication via TOTP (Google Authenticator)
3. **OAuth integration** - Login with Google/GitHub
4. **Session management** - View active sessions, remote logout
5. **Account deletion** - GDPR compliance, delete account + all data
6. **Email preferences** - Opt-in/out of price alerts
7. **Electron cloud sync** - Optional auth in Electron for syncing products across devices
8. **API key authentication** - Alternative to JWT for programmatic access
9. **Audit logs** - Track login attempts, password changes
10. **Password strength meter** - Real-time feedback during registration

---

## Summary

This plan provides a **complete, production-ready authentication system** for Mantis Price Tracker with:

- ✅ JWT-based authentication (access + refresh tokens)
- ✅ Email verification and password reset
- ✅ Dual database support (SQLite for Electron, PostgreSQL for web)
- ✅ Environment-aware token storage (Electron IPC vs localStorage)
- ✅ Self-hosted infrastructure (PostgreSQL + SMTP on Proxmox)
- ✅ Cloudflare tunnel deployment for global access
- ✅ Comprehensive security (bcrypt, HTTPS, CORS, token expiry)
- ✅ Database migration strategy with Alembic
- ✅ Minimal complexity following existing patterns

**Total files**: 25 files to modify or create
**External dependencies**: PostgreSQL, SMTP server, Cloudflare tunnel
**Estimated implementation time**: Backend (2-3 days), Frontend (1-2 days), Infrastructure (1 day), Testing (1 day)

The design prioritizes security while maintaining the local-first philosophy for Electron and enabling multi-user web deployment.
