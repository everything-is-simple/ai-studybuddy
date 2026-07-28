[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$ApprovalRecord
)

$ErrorActionPreference = 'Stop'

try {
  $node = Get-Command node -ErrorAction Stop
  $entry = Join-Path $PSScriptRoot 'confirm-secret-scan-signoff.cjs'
  $output = & $node.Source $entry '--approval-record' $ApprovalRecord 2>$null
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
