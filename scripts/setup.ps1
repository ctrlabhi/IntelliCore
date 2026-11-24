<#
.SYNOPSIS
    IntelliCore Project Setup & Environment Initialization
.DESCRIPTION
    Validates Docker installation, generates secure local credentials in .env,
    prepares required local directories, and validates the Docker Compose configuration.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  IntelliCore 2.0.0 — Project Foundation Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# 1. Verify Docker CLI Availability
Write-Host "`n[1/5] Checking Docker CLI availability..." -ForegroundColor Yellow
$DockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue

if (-not $DockerCmd) {
    # Check default Docker Desktop install path
    $DefaultDockerPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    if (Test-Path $DefaultDockerPath) {
        $env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
        $DockerCmd = Get-Command "docker" -ErrorAction SilentlyContinue
    }
}

if (-not $DockerCmd) {
    Write-Host "❌ Docker CLI is not found in your PATH." -ForegroundColor Red
    Write-Host "   Please ensure Docker Desktop is installed from https://www.docker.com/products/docker-desktop" -ForegroundColor White
    Write-Host "   If already installed, add 'C:\Program Files\Docker\Docker\resources\bin' to your system PATH." -ForegroundColor White
} else {
    $DockerVersion = docker --version
    Write-Host "✅ Docker CLI detected: $DockerVersion" -ForegroundColor Green
}

# 2. Verify Docker Engine & Compose
Write-Host "`n[2/5] Checking Docker Engine and Compose..." -ForegroundColor Yellow
$DockerRunning = $false
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $DockerRunning = $true
        Write-Host "✅ Docker Engine is running." -ForegroundColor Green
    } else {
        Write-Host "⚠️  Docker Engine is not running. Please start Docker Desktop from your Windows Start Menu." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Could not communicate with Docker daemon. Please launch Docker Desktop." -ForegroundColor Yellow
}

$ComposeCmd = Get-Command "docker-compose" -ErrorAction SilentlyContinue
if (-not $ComposeCmd) {
    try {
        $null = docker compose version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Docker Compose plugin detected." -ForegroundColor Green
        }
    } catch {}
} else {
    Write-Host "✅ Docker Compose standalone detected." -ForegroundColor Green
}

# 3. Create Required Local Directories
Write-Host "`n[3/5] Verifying local directory infrastructure..." -ForegroundColor Yellow
$RequiredDirs = @(
    "backups",
    "secrets",
    "backend\uploads"
)

foreach ($dir in $RequiredDirs) {
    $fullPath = Join-Path $ProjectRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "  + Created directory: $dir" -ForegroundColor Gray
    } else {
        Write-Host "  ✓ Verified directory: $dir" -ForegroundColor Gray
    }
}
Write-Host "✅ Local directory infrastructure ready." -ForegroundColor Green

# 4. Environment Configuration (.env generation)
Write-Host "`n[4/5] Checking environment configuration (.env)..." -ForegroundColor Yellow
$EnvFile = Join-Path $ProjectRoot ".env"
$EnvExample = Join-Path $ProjectRoot ".env.example"

function Generate-SecureSecret {
    param([int]$Length = 32)
    $Bytes = New-Object byte[] $Length
    $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $Rng.GetBytes($Bytes)
    return [System.Convert]::ToBase64String($Bytes).Replace('+', '').Replace('/', '').Replace('=', '').Substring(0, $Length)
}

if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Write-Host "  Generating new .env with cryptographically strong credentials..." -ForegroundColor White
        $EnvContent = Get-Content $EnvExample -Raw
        
        $AppPass = Generate-SecureSecret -Length 24
        $RootPass = Generate-SecureSecret -Length 32

        $EnvContent = $EnvContent.Replace("replace_with_strong_password_in_env", $AppPass)
        $EnvContent = $EnvContent.Replace("replace_with_strong_root_password_in_env", $RootPass)

        Set-Content -Path $EnvFile -Value $EnvContent -Encoding UTF8
        Write-Host "✅ Generated .env with unique local development credentials." -ForegroundColor Green
    } else {
        Write-Host "❌ .env.example not found. Cannot generate .env template." -ForegroundColor Red
    }
} else {
    Write-Host "✅ Existing .env file found. Preserving existing configuration." -ForegroundColor Green
}

# 5. Validate Docker Compose Configuration
Write-Host "`n[5/5] Validating Docker Compose configuration..." -ForegroundColor Yellow
if ($DockerCmd) {
    try {
        $ConfigCheck = docker compose config --quiet 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ docker-compose.yml configuration is valid and ready." -ForegroundColor Green
        } else {
            Write-Host "⚠️  Docker Compose config check returned warnings: $ConfigCheck" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Unable to run docker compose config validation: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  Skipping compose validation until Docker Desktop is started." -ForegroundColor Gray
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Setup Complete! Next Steps:" -ForegroundColor Cyan
Write-Host "  1. If Docker Desktop is not running, start it now." -ForegroundColor White
Write-Host "  2. Start containers:   .\scripts\start.ps1" -ForegroundColor Yellow
Write-Host "  3. Stop containers:    .\scripts\stop.ps1" -ForegroundColor Yellow
Write-Host "  4. App URL:            http://localhost:3000" -ForegroundColor White
Write-Host "  5. phpMyAdmin URL:     http://localhost:8080" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan

