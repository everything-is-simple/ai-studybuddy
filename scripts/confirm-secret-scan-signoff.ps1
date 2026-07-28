[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$PackageRoot,
  [Parameter(Mandatory)] [string]$ArtifactId,
  [Parameter(Mandatory)] [string]$ApprovedCommit,
  [Parameter(Mandatory)] [string]$PackageFingerprint,
  [Parameter(Mandatory)] [string]$ApprovalWindowId
)

$ErrorActionPreference = 'Stop'

try {
  $node = Get-Command node -ErrorAction Stop
  $entry = Join-Path $PSScriptRoot 'confirm-secret-scan-signoff.cjs'
  $repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $output = & $node.Source $entry `
    '--repository-root' $repositoryRoot `
    '--package-root' $PackageRoot `
    '--artifact-id' $ArtifactId `
    '--approved-commit' $ApprovedCommit `
    '--package-fingerprint' $PackageFingerprint `
    '--approval-window-id' $ApprovalWindowId 2>$null
  $exitCode = $LASTEXITCODE
  if ($null -eq $output -or @($output).Count -ne 1) {
    Write-Output '{"resultCode":"SECRET_SCAN_SIGNOFF_FAILED"}'
    exit 2
  }
  Write-Output $output
  exit $exitCode
} catch {
  Write-Output '{"resultCode":"SECRET_SCAN_RUNTIME_UNAVAILABLE"}'
  exit 2
}
