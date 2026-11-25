<# Creates a consistent SQL backup of the existing, explicitly identified local development database. #>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$context = docker context show
if ($LASTEXITCODE -or $context -ne 'desktop-linux') { throw 'Expected the local Docker Desktop engine.' }

$target = docker inspect --format '{{.State.Running}} {{range .Mounts}}{{.Name}} {{end}}' intellicore_mysql
if ($LASTEXITCODE -or $target -notmatch '^true\s+intellicore_mysql_data\s*$') { throw 'Unexpected database container or volume.' }

$folder = Join-Path $project 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-ffff'
$partial = Join-Path $folder "db-backup-$stamp.sql.partial"
$complete = Join-Path $folder "db-backup-$stamp.sql"
$docker = (Get-Command docker.exe -ErrorAction Stop).Source
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $docker
$start.Arguments = 'exec intellicore_mysql sh -c "test \"$MYSQL_DATABASE\" = intellicore_db || exit 67; export MYSQL_PWD=$MYSQL_ROOT_PASSWORD; exec mysqldump -u root --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF --skip-lock-tables --skip-add-drop-table --routines --events --triggers intellicore_db"'
$start.UseShellExecute = $false
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [Diagnostics.Process]::new()
$process.StartInfo = $start
try {
    if (-not $process.Start()) { throw 'Could not start the database backup.' }
    $stderr = $process.StandardError.ReadToEndAsync()
    $file = [IO.File]::Open($partial, [IO.FileMode]::CreateNew)
    try { $process.StandardOutput.BaseStream.CopyTo($file) } finally { $file.Dispose() }
    $process.WaitForExit()
    $null = $stderr.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0 -or (Get-Item -LiteralPath $partial).Length -eq 0) {
        throw 'The database dump did not complete successfully.'
    }
    if (@((Get-Content -LiteralPath $partial -Tail 4) -match '^-- Dump completed on ').Count -eq 0) {
        throw 'The database dump completion marker is absent.'
    }
    Move-Item -LiteralPath $partial -Destination $complete
    [pscustomobject]@{ Path = $complete; Bytes = (Get-Item -LiteralPath $complete).Length; SHA256 = (Get-FileHash -LiteralPath $complete).Hash }
} finally {
    $process.Dispose()
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial }
}
