[CmdletBinding()]
param([string]$InstallRoot, [string]$BackupPath)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
if (-not [string]::IsNullOrWhiteSpace($BackupPath)) {
  $validated = Get-AIStudyBuddyValidatedBackup -BackupPath $BackupPath
  Write-Output "INTEGRITY_BACKUP_OK files=$($validated.Entries.Count) bytes=$($validated.TotalBytes)"
  exit 0
}
$paths = Get-AIStudyBuddyPaths $InstallRoot
$files = @(Get-AIStudyBuddyDataFiles -DataRoot $paths.Data -Code 'INTEGRITY_DATA_INVALID')
Write-Output "INTEGRITY_DATA_OK files=$($files.Count)"
