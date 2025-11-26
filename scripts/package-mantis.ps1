# Requires: PowerShell 5+, Python 3.12+, Node.js 18+
# Builds the backend executable, exports the Next.js frontend, then runs electron-builder.

param(
  [switch] $SkipBackend,
  [switch] $SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string] $Name,
    [ScriptBlock] $Action
  )

  Write-Host "==> $Name"
  & $Action
  Write-Host "==> $Name completed`n"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $SkipBackend) {
  Invoke-Step "Building backend executable" {
    Push-Location "$repoRoot\backend"
    pyinstaller run.py --name mantis-engine --onefile --paths .. --collect-all backend
    if ($LASTEXITCODE -ne 0) {
      throw "PyInstaller build failed with exit code $LASTEXITCODE."
    }
    Pop-Location
  }
} else {
  Write-Host "[skip] Backend build skipped (SkipBackend supplied).`n"
}

if (-not $SkipFrontend) {
  Invoke-Step "Exporting Next.js frontend" {
    Push-Location "$repoRoot\mantis"
    if (-not (Test-Path "node_modules")) {
      Write-Host "node_modules missing, running npm install …"
      npm install --include=dev
    }
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "Next.js build failed with exit code $LASTEXITCODE."
    }
    Pop-Location
  }
} else {
  Write-Host "[skip] Frontend build skipped (SkipFrontend supplied).`n"
}

Invoke-Step "Packaging Electron shell" {
  Push-Location "$repoRoot\electron"
  if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules missing, running npm install …"
    npm install --include=dev
  }
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Electron build failed with exit code $LASTEXITCODE."
  }
  Pop-Location
}

Write-Host "All artifacts are ready. Look for mantis.exe under electron\\dist."

