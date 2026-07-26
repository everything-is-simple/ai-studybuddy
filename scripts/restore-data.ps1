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
if (-not $PSCmdlet.ShouldProcess('logical-data-root', 'Restore validated backup')) {
  Write-Output "RESTORE_VALIDATED_NO_WRITE files=$($validated.Entries.Count)"
  exit 0
}
# Real restore remains deliberately unavailable until a separately approved service-stop,
# recovery-point, and interruption-handling implementation is reviewed.
New-AIStudyBuddyDataBoundaryError 'RESTORE_WRITE_DISABLED'
