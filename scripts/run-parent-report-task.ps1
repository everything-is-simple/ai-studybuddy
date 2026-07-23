# T06B 家长报告计划任务运行包装器（使用机器部署版）
[CmdletBinding()]
param([string]$InstallRoot)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
if (-not (Test-Path -LiteralPath $paths.EnvFile -PathType Leaf)) { throw "Runtime config missing: $($paths.EnvFile). Run bootstrap-runtime.ps1 first." }
Import-AIStudyBuddyEnvFile $paths.EnvFile
Assert-AIStudyBuddyLoopbackHost
if ([string]::IsNullOrWhiteSpace($env:APP_DATA_ROOT)) { throw 'APP_DATA_ROOT is required for parent report runner.' }
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'scripts\parent-report-runner.js') -PathType Leaf)) { throw "Compiled parent-report runner is missing: $($paths.Backend)\scripts\parent-report-runner.js" }
$node = Get-NodeVersionInfo
if ($null -eq $node -or $node.Major -lt 20 -or $node.Major -gt 25) { throw 'Supported Node.js 20-25 is required.' }
Push-Location $paths.Backend
try {
  & node (Join-Path $paths.Backend 'scripts\parent-report-runner.js')
  if ($LASTEXITCODE) { throw "Parent report runner failed: $LASTEXITCODE" }
} finally {
  Pop-Location
}
