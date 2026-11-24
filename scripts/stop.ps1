<#
.SYNOPSIS
    IntelliCore Container Graceful Stop Script
.DESCRIPTION
    Stops all containers without deleting persistent named volumes.
#>

[CmdletBinding()]
param()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "🛑 Stopping IntelliCore containers gracefully..." -ForegroundColor Yellow

if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe") {
        $env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
    }
}

try {
    docker compose down
    Write-Host "✅ All containers stopped successfully." -ForegroundColor Green
    Write-Host "ℹ️  Database data is safely preserved in the 'intellicore_mysql_data' volume." -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error stopping containers: $_" -ForegroundColor Red
}

