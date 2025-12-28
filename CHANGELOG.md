# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-12-29
### Added
- **Animated Mantis Logo**: Terminal-style logo (`> mantis_`) with purple gradient shine animation on login and register pages.

### Changed
- **AI Provider Configuration**: Google API key and Gemini model now optional (commented out in .env.example) as Groq is primary provider.

## [1.0.0] - 2025-12-28
### Added
- **Authentication System**: Complete JWT-based authentication with email/password registration and login.
- **Multi-tenancy**: User-based data isolation with PostgreSQL foreign keys and query filtering.
- **Smart Login Flow**: Automatic redirect from login to signup when email not found, with email pre-filled.
- **Protected Routes**: All application features now require authentication with automatic redirect to login.
- **User Model**: Database schema with users table, hashed passwords (bcrypt), and user relationships.
- **Auth API Endpoints**: `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout` with comprehensive validation.
- **Auth Components**: LoginForm, RegisterForm, ProtectedRoute HOC, and AuthContext for global state.
- **Docker Deployment**: Complete containerized deployment with docker-compose orchestration.
- **PostgreSQL Database**: Migrated from SQLite to PostgreSQL 15 for production multi-tenant support.
- **Environment Configuration**: JWT secret key, algorithm, and expiration settings in docker-compose.yml.
- **API Documentation**: Interactive Swagger UI and ReDoc endpoints for all API routes.

### Changed
- **Architecture**: Transformed from local-first Electron desktop app to cloud-native multi-tenant SaaS.
- **Database Schema**: Added user_id foreign keys to Product and ProviderConfig models.
- **Product Tracking**: All products now linked to user accounts with complete data isolation.
- **Provider Configuration**: Per-user API keys instead of global configuration.
- **Deployment Model**: Docker Compose with PostgreSQL, FastAPI backend, Next.js frontend, and Cloudflare Tunnel.
- **CORS Handling**: Next.js API proxy (`/api/*` rewrites) eliminates mixed content issues.
- **Documentation**: Completely overhauled README.md to reflect cloud-native architecture.
- **Environment Setup**: Updated .env.example with JWT and CORS configuration templates.

### Fixed
- **Bcrypt Compatibility**: Pinned bcrypt to 4.1.2 to resolve incompatibility with passlib 1.7.4.
- **JWT Environment Variables**: Added missing JWT config to backend container environment.
- **JWT Subject Type**: Fixed "Subject must be a string" error by converting user IDs to strings in tokens.
- **Chrome Installation**: Made Google Chrome installation optional in backend Dockerfile with graceful fallback.
- **Email Validation**: Added pydantic[email] dependency for proper email validation.

### Breaking Changes
- **Database Migration**: Requires fresh database setup with new multi-tenant schema (development only).
- **API Authentication**: All product and provider endpoints now require JWT authentication headers.
- **Environment Variables**: New required variables: JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_MINUTES.
- **Deployment Platform**: Shifted from Windows desktop (Electron + MSI) to web-based Docker deployment.

### Security
- **Password Security**: Bcrypt hashing with automatic salt generation and 8-character minimum.
- **Token Security**: JWT signed with HS256, configurable secret key, 30-day expiration.
- **Data Isolation**: Database-level user_id filtering prevents unauthorized access to other users' data.
- **CORS Protection**: Regex-based origin validation for production HTTPS deployments.

## [0.2.0] - 2025-12-10
### Added
- Frameless Electron window with custom titlebar controls; tray close now hides the window instead of quitting.
- New settings link for obtaining a Google API key directly from [Google AI Studio](https://aistudio.google.com/apikey).
- Collapsible sidebar redesign with improved spacing, icons, and helper text.
- PowerShell packaging script accepts an optional `-Version` argument to stamp MSI metadata.
- CHANGELOG tracking and documentation updates describing versioned builds.

### Fixed
- Scroll behaviour inside the main layout while keeping the navbar sticky.
- Tray icon rendering and window/tray icon resolution.
- Backend shutdown fallback now aggressively kills any lingering `mantis-engine.exe` processes on Windows.

## [0.1.0] - 2025-12-09
### Added
- Initial release with FastAPI backend (gemini-powered scraping), Next.js frontend, and Electron shell.
- Packaging pipeline (`package-mantis.ps1`) generating standalone backend executable and MSI desktop bundle.
- Tray controls, API key management, product tracking UI, and auto-refresh scheduler.


