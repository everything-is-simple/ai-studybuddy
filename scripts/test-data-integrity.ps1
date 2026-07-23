[CmdletBinding()]
param([string]$InstallRoot, [string]$BackupPath)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
$root = if ($BackupPath) { [IO.Path]::GetFullPath($BackupPath) } else { $paths.Data }
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw "Integrity root not found: $root" }
$files = Get-ChildItem -LiteralPath $root -Recurse -Force -File | Where-Object { $_.FullName -notmatch '[\\/]config[\\/]' -and $_.FullName -notmatch '[\\/]tmp[\\/]' -and $_.FullName -notmatch '[\\/]models[\\/]' }
$matches = Get-AIStudyBuddySecretFileMatches $root
if ($matches.Count -gt 0) { throw "Potential secret files found under integrity root: $($matches.FullName -join ', ')" }
$zero = @($files | Where-Object Length -eq 0)
Write-Output "Integrity files: $($files.Count)"
Write-Output "Zero-byte files: $($zero.Count)"
if ($BackupPath) {
  $manifestPath = Join-Path $root 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Backup manifest missing.' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  foreach ($entry in @($manifest.files)) {
    $file = Join-Path $root ('payload\' + ($entry.path -replace '/', '\'))
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$entry.sha256) { throw "Hash mismatch: $($entry.path)" }
  }
  Write-Output "Manifest hashes verified: $(@($manifest.files).Count)"
}
