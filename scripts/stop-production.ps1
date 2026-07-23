[CmdletBinding(SupportsShouldProcess)]
param([string]$InstallRoot)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
if (-not (Test-Path -LiteralPath $paths.PidFile -PathType Leaf)) { Write-Output 'Backend PID file not found; nothing to stop.'; exit 0 }
$processId = [int](Get-Content -LiteralPath $paths.PidFile -Raw).Trim()
$proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($proc) {
  if ($PSCmdlet.ShouldProcess("PID $processId", 'Stop AI StudyBuddy backend')) { Stop-Process -Id $processId -Force }
}
Remove-Item -LiteralPath $paths.PidFile -Force -ErrorAction SilentlyContinue
Write-Output "Stopped AI StudyBuddy backend PID $processId. User data was not deleted."
