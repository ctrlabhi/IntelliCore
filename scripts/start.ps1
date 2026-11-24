<#
.SYNOPSIS
    IntelliCore Container Startup Script
.DESCRIPTION
    Builds and starts the IntelliCore application, MySQL 8.4 database, and phpMyAdmin containers.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "🚀 Starting IntelliCore 2.0.0 containers..." -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path (Join-Path $ProjectRoot ".env"))) {
    Write-Host "⚠️  .env file missing. Running setup script first..." -ForegroundColor Yellow
    & "$ScriptDir\setup.ps1"
}

# Ensure docker CLI is in path
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe") {
        $env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
    }
}

try {
    Write-Host "📦 Building and starting services via Docker Compose..." -ForegroundColor Yellow
    docker compose up -d --build

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to start containers. Ensure Docker Desktop is running." -ForegroundColor Red
        exit 1
    }

    Write-Host "`n⏳ Waiting for services to initialize..." -ForegroundColor Yellow
    Start-Sleep -Seconds 4

    Write-Host "`n📊 Container Status:" -ForegroundColor Cyan
    docker compose ps

    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host "✅ IntelliCore is up and running!" -ForegroundColor Green
    Write-Host "   🌐 Web Application: http://localhost:3000" -ForegroundColor White
    Write-Host "   📡 API Base URL:    http://localhost:3000/api/v1" -ForegroundColor White
    Write-Host "   📖 Swagger Docs:    http://localhost:3000/api-docs" -ForegroundColor White
    Write-Host "   💓 Health Check:    http://localhost:3000/health" -ForegroundColor White
    Write-Host "   ⏳ Readiness Check: http://localhost:3000/ready" -ForegroundColor White
    Write-Host "   🗄️  phpMyAdmin GUI:  http://localhost:8080" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Green
} catch {
    Write-Host "❌ Error executing docker compose: $_" -ForegroundColor Red
    exit 1
}

