# Starts the Chore Quest backend and frontend for local development.
# Usage:  .\scripts\dev.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path 'backend\.env')) {
  Write-Host 'backend\.env is missing. Copying from the example...' -ForegroundColor Yellow
  Copy-Item 'backend\.env.example' 'backend\.env'
  Write-Host 'Edit backend\.env before running against a real database.' -ForegroundColor Yellow
}

if (-not (Test-Path 'frontend\.env.local')) {
  Copy-Item 'frontend\.env.example' 'frontend\.env.local'
}

if (-not (Test-Path 'node_modules')) { npm install }

npm run preflight
npm run dev
