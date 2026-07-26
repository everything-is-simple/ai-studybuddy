[CmdletBinding()]
param(
  [string]$InstallRoot,
  [Parameter(Mandatory)] [string]$OutputRoot,
  [string]$Name
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
$repoOrAppRoot = Split-Path -Path $PSScriptRoot -Parent
$output = Assert-AIStudyBuddyExternalDataOutputRoot -OutputRoot $OutputRoot -Paths $paths -AdditionalProtectedRoots @($repoOrAppRoot) -InvalidCode 'BACKUP_OUTPUT_INVALID' -ProtectedCode 'BACKUP_OUTPUT_PROTECTED_ROOT' -ReparseCode 'BACKUP_OUTPUT_REPARSE_POINT' -CrossVolumeCode 'BACKUP_OUTPUT_CROSS_VOLUME'
if ([string]::IsNullOrWhiteSpace($Name)) { $Name = 'backup-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') }
$name = Get-AIStudyBuddyDataBackupName -Name $Name -Code 'BACKUP_NAME_INVALID'
$backup = [IO.Path]::GetFullPath((Join-Path $output $name))
if (-not (Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $backup -Root $output) -or [string]::Equals($backup, $output, [StringComparison]::OrdinalIgnoreCase)) { New-AIStudyBuddyDataBoundaryError 'BACKUP_NAME_INVALID' }
if (Test-Path -LiteralPath $backup) { New-AIStudyBuddyDataBoundaryError 'BACKUP_TARGET_EXISTS' }
$files = @(Get-AIStudyBuddyDataFiles -DataRoot $paths.Data -Code 'BACKUP_SOURCE_INVALID')
if ($files.Count -eq 0) { New-AIStudyBuddyDataBoundaryError 'BACKUP_SOURCE_EMPTY' }
try {
  New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
  Assert-AIStudyBuddyDataExistingDirectory -Path $backup -Code 'BACKUP_CREATE_FAILED' | Out-Null
  $payload = Join-Path $backup 'payload'
  New-Item -ItemType Directory -Path $payload -ErrorAction Stop | Out-Null
  Assert-AIStudyBuddyDataExistingDirectory -Path $payload -Code 'BACKUP_CREATE_FAILED' | Out-Null
} catch {
  New-AIStudyBuddyDataBoundaryError 'BACKUP_CREATE_FAILED'
}
$manifestEntries = [System.Collections.Generic.List[object]]::new()
foreach ($file in $files) {
  $relative = $file.RelativePath.Replace('/','\')
  $destination = [IO.Path]::GetFullPath((Join-Path $payload $relative))
  if (-not (Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $destination -Root $payload)) { New-AIStudyBuddyDataBoundaryError 'BACKUP_COPY_FAILED' }
  try {
    $parent = Split-Path -Path $destination -Parent
    New-Item -ItemType Directory -Path $parent -Force -ErrorAction Stop | Out-Null
    Assert-AIStudyBuddyDataPathWithoutReparsePoints -Path $parent -Code 'BACKUP_COPY_FAILED'
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force -ErrorAction Stop
    $copied = Assert-AIStudyBuddyDataRegularFile -Path $destination -Code 'BACKUP_COPY_FAILED'
    $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
  } catch {
    New-AIStudyBuddyDataBoundaryError 'BACKUP_COPY_FAILED'
  }
  $manifestEntries.Add([ordered]@{ path = $relative.Replace('\','/'); sha256 = $hash; bytes = [int64]$copied.Length })
}
$manifest = [ordered]@{
  format = 'ai-studybuddy-data-backup-v2'
  createdAt = (Get-Date).ToUniversalTime().ToString('o')
  files = @($manifestEntries)
}
try {
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'manifest.json') -Encoding utf8 -ErrorAction Stop
  @('AI StudyBuddy data backup', 'This backup contains only the approved logical data subset.', 'Keep this directory read-only and outside the active installation root.') | Set-Content -LiteralPath (Join-Path $backup 'README.txt') -Encoding utf8 -ErrorAction Stop
  Get-ChildItem -LiteralPath $backup -Recurse -Force -File -ErrorAction Stop | ForEach-Object { $_.IsReadOnly = $true }
} catch {
  New-AIStudyBuddyDataBoundaryError 'BACKUP_FINALIZE_FAILED'
}
Write-Output "BACKUP_CREATED files=$($manifestEntries.Count)"
