<#
.SYNOPSIS
    IntelliCore Database & Storage Backup Utility
.DESCRIPTION
    Creates a timestamped MySQL dump in the backups/ directory.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = Join-Path $ProjectRoot "backups"
$SqlBackupFile = Join-Path $BackupDir "db-backup-$Timestamp.sql"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "💾 Initiating IntelliCore database backup..." -ForegroundColor Cyan

# Source credentials from .env
$EnvFile = Join-Path $ProjectRoot ".env"
$DbUser = "intellicore_app"
$DbName = "intellicore_db"
$DbPass = ""

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*MYSQL_USER\s*=\s*(.*)$') { $DbUser = $matches[1].Trim() }
        if ($_ -match '^\s*MYSQL_DATABASE\s*=\s*(.*)$') { $DbName = $matches[1].Trim() }
        if ($_ -match '^\s*MYSQL_PASSWORD\s*=\s*(.*)$') { $DbPass = $matches[1].Trim() }
    }
}

try {
    Write-Host "  Dumping database '$DbName' via MySQL container..." -ForegroundColor Yellow
    docker compose exec -T mysql mysqldump -u "$DbUser" "-p$DbPass" "$DbName" > "$SqlBackupFile"

    if (Test-Path $SqlBackupFile) {
        $Size = (Get-Item $SqlBackupFile).Length
        Write-Host "✅ Database backup created successfully!" -ForegroundColor Green
        Write-Host "   File: $SqlBackupFile" -ForegroundColor White
        Write-Host "   Size: $Size bytes" -ForegroundColor White
    } else {
        Write-Host "❌ Backup file was not generated." -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Backup execution failed: $_" -ForegroundColor Red
    Write-Host "   Ensure the MySQL container is running: .\scripts\start.ps1" -ForegroundColor Yellow
}

