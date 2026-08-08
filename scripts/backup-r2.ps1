param(
  [Parameter(Mandatory = $true)][string]$Remote,
  [Parameter(Mandatory = $true)][string]$Bucket,
  [string]$OutputDirectory = "outputs/backups/r2"
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
  throw "rclone is required. Configure an S3 remote for the Cloudflare R2 account before running this script."
}

$root = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path (Join-Path $root $OutputDirectory) $stamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

& rclone copy "${Remote}:${Bucket}" $target --checksum --metadata --create-empty-src-dirs
if ($LASTEXITCODE -ne 0) { throw "R2 backup failed with exit code $LASTEXITCODE." }
$count = (Get-ChildItem -LiteralPath $target -Recurse -File | Measure-Object).Count
Write-Host "R2 backup created: $target ($count objects)"
