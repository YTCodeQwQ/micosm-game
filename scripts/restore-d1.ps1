param(
  [Parameter(Mandatory = $true)][string]$Database,
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore is blocked. Re-run with -ConfirmRestore after checking the target database and backup file." }
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
$root = Split-Path -Parent $PSScriptRoot

Push-Location $root
try {
  & npx.cmd wrangler d1 execute $Database --remote --file $resolvedBackup
  if ($LASTEXITCODE -ne 0) { throw "D1 restore failed with exit code $LASTEXITCODE." }
  Write-Host "D1 restore completed for $Database from $resolvedBackup"
} finally {
  Pop-Location
}
