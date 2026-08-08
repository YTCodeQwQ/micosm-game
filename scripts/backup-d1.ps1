param(
  [string]$Database = $env:MICO_D1_DATABASE,
  [string]$OutputDirectory = "outputs/backups"
)

$ErrorActionPreference = "Stop"
if (-not $Database) { throw "Set MICO_D1_DATABASE or pass -Database before creating a backup." }

$root = Split-Path -Parent $PSScriptRoot
$targetDirectory = Join-Path $root $OutputDirectory
New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $targetDirectory "micosm-$stamp.sql"

Push-Location $root
try {
  & npx.cmd wrangler d1 export $Database --remote --output $target
  if ($LASTEXITCODE -ne 0) { throw "D1 export failed with exit code $LASTEXITCODE." }
  $file = Get-Item -LiteralPath $target
  if ($file.Length -lt 64) { throw "Backup file is unexpectedly small: $($file.Length) bytes." }
  Write-Host "Backup created: $($file.FullName) ($($file.Length) bytes)"
} finally {
  Pop-Location
}
