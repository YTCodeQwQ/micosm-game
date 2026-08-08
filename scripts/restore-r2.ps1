param(
  [Parameter(Mandatory = $true)][string]$Remote,
  [Parameter(Mandatory = $true)][string]$Bucket,
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore is blocked. Re-run with -ConfirmRestore after checking the target bucket and backup directory." }
if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) { throw "rclone is required for R2 restore." }
$source = (Resolve-Path -LiteralPath $BackupDirectory).Path

& rclone copy $source "${Remote}:${Bucket}" --checksum --metadata --create-empty-src-dirs
if ($LASTEXITCODE -ne 0) { throw "R2 restore failed with exit code $LASTEXITCODE." }
Write-Host "R2 restore completed for ${Remote}:${Bucket} from $source"
