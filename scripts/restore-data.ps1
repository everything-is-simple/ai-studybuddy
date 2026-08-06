[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)] [string]$BackupPath,
  [string]$InstallRoot,
  [switch]$EnableWrite
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
$validated = Get-AIStudyBuddyValidatedBackup -BackupPath $BackupPath
$target = Get-AIStudyBuddyDataBoundaryFullPath -Path $paths.Data -Code 'RESTORE_TARGET_INVALID'
if (-not (Test-Path -LiteralPath $target -PathType Container)) { New-AIStudyBuddyDataBoundaryError 'RESTORE_TARGET_INVALID' }
Assert-AIStudyBuddyDataPathWithoutReparsePoints -Path $target -Code 'RESTORE_TARGET_REPARSE_POINT'
Assert-AIStudyBuddyDataTreeWithoutReparsePoints -Root $target -Code 'RESTORE_TARGET_REPARSE_POINT'
$backupInsideTarget = Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $validated.BackupPath -Root $target
$targetInsideBackup = Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $target -Root $validated.BackupPath
if ($backupInsideTarget -or $targetInsideBackup) { New-AIStudyBuddyDataBoundaryError 'RESTORE_BACKUP_INVALID' }
if (-not $EnableWrite) {
  Write-Output 'RESTORE_WRITE_DISABLED'
  exit 0
}
if (-not $PSCmdlet.ShouldProcess('logical-data-root', 'Restore validated backup')) {
  Write-Output "RESTORE_VALIDATED_NO_WRITE files=$($validated.Entries.Count)"
  exit 0
}

# T04-3 is deliberately fail-closed: validation is available, but the product
# does not yet expose a data-overwriting restore operation. This protects user
# data until a separately reviewed restore workflow and recovery test exist.
if ($EnableWrite) {
  Write-Error 'RESTORE_WRITE_DISABLED: restore writes are not enabled in this release.'
  exit 1
}
Write-Output "RESTORE_VALIDATED_NO_WRITE files=$($validated.Entries.Count)"
Write-Output 'RESTORE_WRITE_DISABLED: restore writes are not enabled in this release.'
exit 0
