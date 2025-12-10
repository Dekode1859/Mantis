# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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


