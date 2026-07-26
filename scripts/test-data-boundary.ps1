[CmdletBinding()]
param([string]$FixtureBase = 'H:\ai-studybuddy-tmp\runs')
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
if (-not (Test-Path -LiteralPath $FixtureBase -PathType Container)) { throw 'FIXTURE_BASE_UNAVAILABLE' }
$fixtureRoot = Join-Path ([IO.Path]::GetFullPath($FixtureBase)) ('phase3-t02g-data-boundary-' + [guid]::NewGuid().ToString('N'))
$previousDataRoot = $env:APP_DATA_ROOT
function Assert-TrueValue {
  param([Parameter(Mandatory)] [bool]$Value)
  if (-not $Value) { throw 'ASSERTION_FAILED' }
}
function Assert-BoundaryError {
  param([Parameter(Mandatory)] [scriptblock]$Action, [Parameter(Mandatory)] [string]$Code)
  $caught = $null
  try { & $Action 2>$null | Out-Null } catch { $caught = $_.Exception }
  if ($null -eq $caught -or $caught.Message -ne $Code) { throw 'ASSERTION_FAILED' }
}
function Copy-ValidBackupFixture {
  param([Parameter(Mandatory)] [string]$Source, [Parameter(Mandatory)] [string]$Destination)
  New-Item -ItemType Directory -Path (Join-Path $Destination 'payload\semesters') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $Source 'manifest.json') -Destination (Join-Path $Destination 'manifest.json') -Force
  Copy-Item -LiteralPath (Join-Path $Source 'payload\studybuddy.db') -Destination (Join-Path $Destination 'payload\studybuddy.db') -Force
  Get-ChildItem -LiteralPath (Join-Path $Source 'payload\semesters') -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Destination 'payload\semesters') -Recurse -Force
  }
}
try {
  New-Item -ItemType Directory -Path $fixtureRoot -ErrorAction Stop | Out-Null
  $install = Join-Path $fixtureRoot 'install-root'
  $data = Join-Path $install 'data'
  $output = Join-Path $fixtureRoot 'backup-output'
  $protected = Join-Path $fixtureRoot 'protected-sentinels'
  New-Item -ItemType Directory -Path (Join-Path $data 'semesters\term-a') -Force | Out-Null
  New-Item -ItemType Directory -Path $output -Force | Out-Null
  New-Item -ItemType Directory -Path $protected -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $data 'studybuddy.db') -Value 'synthetic database content' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $data 'semesters\term-a\material.txt') -Value 'synthetic material content' -Encoding utf8
  $sentinel = Join-Path $protected 'sentinel.txt'
  Set-Content -LiteralPath $sentinel -Value 'synthetic protected sentinel' -Encoding utf8
  $sentinelHash = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
  $env:APP_DATA_ROOT = $data
  $paths = Get-AIStudyBuddyPaths $install

  Assert-BoundaryError { Get-AIStudyBuddyDataBoundaryFullPath -Path 'relative-output' -Code 'PATH_INVALID' } 'PATH_INVALID'
  Assert-BoundaryError { Get-AIStudyBuddyDataBoundaryFullPath -Path 'H:\safe\..\escape' -Code 'PATH_DOT_DOT' } 'PATH_DOT_DOT'
  Assert-BoundaryError {
    Assert-AIStudyBuddyExternalDataOutputRoot -OutputRoot $data -Paths $paths -AdditionalProtectedRoots @($repoRoot) -InvalidCode 'BACKUP_OUTPUT_INVALID' -ProtectedCode 'BACKUP_OUTPUT_PROTECTED_ROOT' -ReparseCode 'BACKUP_OUTPUT_REPARSE_POINT' -CrossVolumeCode 'BACKUP_OUTPUT_CROSS_VOLUME'
  } 'BACKUP_OUTPUT_PROTECTED_ROOT'

  $aclEvidence = Get-AIStudyBuddyAclEvidence -Path $data -LogicalCategory 'synthetic-data'
  $aclJson = $aclEvidence | ConvertTo-Json -Depth 6 -Compress
  Assert-TrueValue ($aclEvidence.Status -in @('PASS','UNKNOWN'))
  Assert-TrueValue (-not $aclJson.Contains($fixtureRoot))
  Assert-TrueValue (-not $aclJson.Contains('synthetic-data-boundary-'))

  & (Join-Path $PSScriptRoot 'backup-data.ps1') -InstallRoot $install -OutputRoot $output -Name 'fixture-backup' | Out-Null
  $backup = Join-Path $output 'fixture-backup'
  $manifestRaw = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw
  $manifest = $manifestRaw | ConvertFrom-Json
  Assert-TrueValue ($manifest.format -eq 'ai-studybuddy-data-backup-v2')
  Assert-TrueValue (-not $manifestRaw.Contains('sourceDataRoot'))
  Assert-TrueValue (-not $manifestRaw.Contains($fixtureRoot))
  Assert-TrueValue (@($manifest.files).Count -eq 2)
  & (Join-Path $PSScriptRoot 'test-data-integrity.ps1') -BackupPath $backup | Out-Null

  $before = Get-Content -LiteralPath (Join-Path $data 'studybuddy.db') -Raw
  & (Join-Path $PSScriptRoot 'restore-data.ps1') -InstallRoot $install -BackupPath $backup -WhatIf | Out-Null
  Assert-TrueValue ((Get-Content -LiteralPath (Join-Path $data 'studybuddy.db') -Raw) -eq $before)
  Assert-TrueValue (-not (Test-Path -LiteralPath (Join-Path $install 'recovery') -PathType Container))

  $malicious = Join-Path $fixtureRoot 'malicious-backup'
  New-Item -ItemType Directory -Path (Join-Path $malicious 'payload') -Force | Out-Null
  @{ format = 'ai-studybuddy-data-backup-v2'; createdAt = '2026-01-01T00:00:00.0000000Z'; files = @(@{ path = '../escape'; sha256 = ('0' * 64); bytes = 0 }) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $malicious 'manifest.json') -Encoding utf8
  Assert-BoundaryError { & (Join-Path $PSScriptRoot 'restore-data.ps1') -InstallRoot $install -BackupPath $malicious -WhatIf } 'RESTORE_MANIFEST_INVALID'

  $extraRootPayload = Join-Path $fixtureRoot 'extra-root-payload-backup'
  Copy-ValidBackupFixture -Source $backup -Destination $extraRootPayload
  Set-Content -LiteralPath (Join-Path $extraRootPayload 'payload\unexpected.txt') -Value 'synthetic extra payload file' -Encoding utf8
  Assert-BoundaryError { & (Join-Path $PSScriptRoot 'restore-data.ps1') -InstallRoot $install -BackupPath $extraRootPayload -WhatIf } 'RESTORE_PAYLOAD_INVALID'

  $extraNestedPayload = Join-Path $fixtureRoot 'extra-nested-payload-backup'
  Copy-ValidBackupFixture -Source $backup -Destination $extraNestedPayload
  Set-Content -LiteralPath (Join-Path $extraNestedPayload 'payload\semesters\term-a\unmanifested.txt') -Value 'synthetic nested extra payload file' -Encoding utf8
  Assert-BoundaryError { & (Join-Path $PSScriptRoot 'restore-data.ps1') -InstallRoot $install -BackupPath $extraNestedPayload -WhatIf } 'RESTORE_PAYLOAD_INVALID'

  $reparseStatus = 'REPARSE_FIXTURE_UNSUPPORTED'
  $link = Join-Path $fixtureRoot 'reparse-output'
  $linkCreated = $false
  try {
    New-Item -ItemType SymbolicLink -Path $link -Target $output -ErrorAction Stop | Out-Null
    $linkCreated = $true
  } catch {
    $linkCreated = $false
  }
  if ($linkCreated) {
    try {
      Assert-BoundaryError { & (Join-Path $PSScriptRoot 'backup-data.ps1') -InstallRoot $install -OutputRoot $link -Name 'blocked-link' } 'BACKUP_OUTPUT_REPARSE_POINT'
      $reparseStatus = 'REPARSE_FIXTURE_OK'
    } finally {
      if (Test-Path -LiteralPath $link) { [IO.Directory]::Delete($link, $false) }
    }
  }
  Assert-TrueValue ((Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash -eq $sentinelHash)
  Write-Output "DATA_BOUNDARY_TEST_OK $reparseStatus acl=$($aclEvidence.Status)"
} finally {
  if ($null -eq $previousDataRoot) { Remove-Item Env:APP_DATA_ROOT -ErrorAction SilentlyContinue } else { $env:APP_DATA_ROOT = $previousDataRoot }
  if (Test-Path -LiteralPath $fixtureRoot) {
    Assert-AIStudyBuddyDataTreeWithoutReparsePoints -Root $fixtureRoot -Code 'FIXTURE_CLEANUP_REPARSE_POINT'
    Get-ChildItem -LiteralPath $fixtureRoot -Recurse -Force -File -ErrorAction Stop | ForEach-Object { $_.IsReadOnly = $false }
    [IO.Directory]::Delete($fixtureRoot, $true)
  }
}
