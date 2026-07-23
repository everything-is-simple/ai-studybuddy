[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)] [string]$BackupPath,
  [string]$InstallRoot,
  [switch]$SkipRecoveryPoint
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
$backup = [IO.Path]::GetFullPath($BackupPath)
$manifestPath = Join-Path $backup 'manifest.json'; $payload = Join-Path $backup 'payload'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Backup manifest.json is missing.' }
if (-not (Test-Path -LiteralPath $payload -PathType Container)) { throw 'Backup payload directory is missing.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.format -ne 'ai-studybuddy-data-backup-v1') { throw 'Unsupported backup format.' }
$entries = @($manifest.files)
foreach ($entry in $entries) {
  $relative = [string]$entry.path
  if ([IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[/\\])\.\.([/\\]|$)' -or $relative -match '(^|[/\\])(?:config|tmp|backup|backups)([/\\]|$)') { throw "Unsafe backup path: $relative" }
  $source = [IO.Path]::GetFullPath((Join-Path $payload ($relative -replace '/', '\')))
  if (-not $source.StartsWith($payload.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Backup path escapes payload: $relative" }
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Backup file missing: $relative" }
  $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne [string]$entry.sha256) { throw "Backup hash mismatch: $relative" }
}
if (-not $PSCmdlet.ShouldProcess($paths.Data, "Restore validated backup $backup")) {
  Write-Output 'WhatIf: restore validated; no data changed.'
  exit 0
}
$recovery = $null
if (-not $SkipRecoveryPoint) {
  $recovery = Join-Path $paths.Backups ('recovery-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
  if (Test-Path -LiteralPath $recovery) { throw "Recovery point exists: $recovery" }
  New-Item -ItemType Directory -Force -Path $recovery | Out-Null
  foreach ($relativeRoot in @('studybuddy.db','semesters')) {
    $source = Join-Path $paths.Data $relativeRoot
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $recovery -Recurse -Force }
  }
}
New-Item -ItemType Directory -Force -Path $paths.Data | Out-Null
foreach ($entry in $entries) {
  $relative = [string]$entry.path
  $source = Join-Path $payload ($relative -replace '/', '\')
  $destination = Join-Path $paths.Data ($relative -replace '/', '\')
  New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
}
Write-Output "Restore completed from: $backup"
if ($recovery) { Write-Output "Recovery point retained at: $recovery" }
