[CmdletBinding()]
param(
  [string]$InstallRoot,
  [string]$OutputRoot,
  [string]$Name
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
if ([string]::IsNullOrWhiteSpace($OutputRoot)) { $OutputRoot = $paths.Backups }
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
if ([string]::IsNullOrWhiteSpace($Name)) { $Name = 'backup-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') }
$backup = Join-Path $OutputRoot $Name
if (Test-Path -LiteralPath $backup) { throw "Backup already exists: $backup" }
$payload = Join-Path $backup 'payload'
New-Item -ItemType Directory -Force -Path $payload | Out-Null
$files = @()
$global = Join-Path $paths.Data 'studybuddy.db'
if (Test-Path -LiteralPath $global -PathType Leaf) { $files += $global }
$semesters = Join-Path $paths.Data 'semesters'
if (Test-Path -LiteralPath $semesters -PathType Container) {
  $files += Get-ChildItem -LiteralPath $semesters -Recurse -Force -File | Where-Object {
    $_.FullName -notmatch '[\\/]tmp[\\/]' -and $_.FullName -notmatch '[\\/]config[\\/]' -and $_.FullName -notmatch '[\\/]backup[s]?[\\/]'
  } | ForEach-Object { $_.FullName }
}
foreach ($file in $files) {
  $relative = Get-AIStudyBuddyRelativePath -BasePath $paths.Data -TargetPath $file
  $destination = Join-Path $payload $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
  Copy-Item -LiteralPath $file -Destination $destination -Force
}
$manifestEntries = @(
  Get-ChildItem -LiteralPath $payload -Recurse -Force -File | ForEach-Object {
    $relative = Get-AIStudyBuddyRelativePath -BasePath $payload -TargetPath $_.FullName
    [ordered]@{ path = $relative.Replace('\','/'); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = $_.Length }
  }
)
$manifest = [ordered]@{
  format = 'ai-studybuddy-data-backup-v1'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  sourceDataRoot = $paths.Data
  excludes = @('config','tmp','backup','backups','logs','models','playwright evidence','secrets')
  files = $manifestEntries
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding utf8
@('AI StudyBuddy data backup', "Created: $($manifest.createdAt)", 'This backup excludes DPAPI/config secrets, logs, tmp, models and caches.', 'Keep this directory read-only and store it separately from the active data root.') | Set-Content -LiteralPath (Join-Path $backup 'README.txt') -Encoding utf8
Get-ChildItem -LiteralPath $backup -Recurse -Force -File | ForEach-Object { $_.IsReadOnly = $true }
Write-Output "Backup created: $backup"
Write-Output "Files: $($manifestEntries.Count)"
