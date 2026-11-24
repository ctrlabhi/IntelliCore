<#
.SYNOPSIS
    IntelliCore Database Restore Utility
.DESCRIPTION
    Restores the MySQL database from a specified SQL backup file with mandatory confirmation.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, HelpMessage="Path to the SQL backup file")]
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

# Resolve backup file path
if (-not (Test-Path $BackupFile)) {
    $PotentialPath = Join-Path (Join-Path $ProjectRoot "backups") $BackupFile
    if (Test-Path $PotentialPath) {
        $BackupFile = $PotentialPath
    } else {
        Write-Host "❌ Backup file not found: $BackupFile" -ForegroundColor Red
        exit 1
    }
}

Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "  ⚠️  DATABASE RESTORE CONFIRMATION REQUIRED" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "Target Database: intellicore_db" -ForegroundColor White
Write-Host "Source Backup:   $BackupFile" -ForegroundColor White
Write-Host "`nWARNING: This operation will overwrite existing database records!" -ForegroundColor Red

$Confirmation = Read-Host "Type 'RESTORE' to proceed or anything else to abort"

if ($Confirmation -ne "RESTORE") {
    Write-Host "❌ Restore operation aborted by user. No changes made." -ForegroundColor Green
    exit 0
}

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
    Write-Host "`n⏳ Restoring database dump into MySQL container..." -ForegroundColor Yellow
    Get-Content "$BackupFile" | docker compose exec -T mysql mysql -u "$DbUser" "-p$DbPass" "$DbName"

    Write-Host "✅ Database restored successfully from: $BackupFile" -ForegroundColor Green
} catch {
    Write-Host "❌ Database restore failed: $_" -ForegroundColor Red
}

