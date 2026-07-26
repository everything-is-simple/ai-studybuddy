[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Import-Module (Join-Path $repoRoot 'scripts\lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$fixtureRoot = Join-Path (Split-Path $repoRoot -Parent) ('.aistudybuddy-t02e-boundary-fixture-' + [guid]::NewGuid().ToString('N'))
function Assert-TrueValue {
  param([Parameter(Mandatory)] [bool]$Value)
  if (-not $Value) { throw 'ASSERTION_FAILED' }
}
function Assert-BoundaryError {
  param([Parameter(Mandatory)] [scriptblock]$Action, [Parameter(Mandatory)] [string]$Code)
  $caught = $null
  try { & $Action } catch { $caught = $_.Exception }
  if ($null -eq $caught -or $caught.Message -ne $Code) { throw 'ASSERTION_FAILED' }
}
try {
  New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
  $protected = Join-Path $fixtureRoot 'protected'
  New-Item -ItemType Directory -Path $protected -Force | Out-Null
  $protectedSentinel = Join-Path $protected 'sentinel.txt'
  Set-Content -LiteralPath $protectedSentinel -Value 'synthetic-protected-sentinel' -Encoding utf8
  $previousDataRoot = $env:APP_DATA_ROOT
  $env:APP_DATA_ROOT = $protected
  Assert-BoundaryError { New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot 'relative-output' } 'PACKAGE_OUTPUT_INVALID'
  Assert-BoundaryError { New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot $repoRoot } 'PACKAGE_OUTPUT_PROTECTED_ROOT'
  Assert-BoundaryError { New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot ([IO.Path]::GetPathRoot($repoRoot)) } 'PACKAGE_OUTPUT_PROTECTED_ROOT'
  Assert-BoundaryError { New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot $protected } 'PACKAGE_OUTPUT_PROTECTED_ROOT'
  $nonEmpty = Join-Path $fixtureRoot 'non-empty-output'
  New-Item -ItemType Directory -Path $nonEmpty -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $nonEmpty 'sentinel.txt') -Value 'synthetic-output-sentinel' -Encoding utf8
  Assert-BoundaryError { New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot $nonEmpty } 'PACKAGE_OUTPUT_NOT_EMPTY'
  Assert-TrueValue (Test-Path -LiteralPath (Join-Path $nonEmpty 'sentinel.txt') -PathType Leaf)
  $output = Join-Path $fixtureRoot 'safe-output'
  New-Item -ItemType Directory -Path $output -Force | Out-Null
  $boundary = New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot $output
  Set-Content -LiteralPath (Join-Path $boundary.StagePath 'synthetic.txt') -Value 'synthetic-stage-content' -Encoding utf8
  $forged = [pscustomobject]@{ OutputRoot = $output; StageParent = $boundary.StageParent; StagePath = $fixtureRoot; OperationId = $boundary.OperationId }
  Assert-BoundaryError { Remove-AIStudyBuddyPackageBoundaryStage -Boundary $forged } 'PACKAGE_DELETE_TARGET_INVALID'
  Assert-TrueValue (Test-Path -LiteralPath $protectedSentinel -PathType Leaf)
  Remove-AIStudyBuddyPackageBoundaryStage -Boundary $boundary
  Assert-TrueValue (-not (Test-Path -LiteralPath $boundary.StagePath))
  Assert-TrueValue (-not (Test-Path -LiteralPath $boundary.StageParent))
  Assert-TrueValue (Test-Path -LiteralPath $protectedSentinel -PathType Leaf)
  $contentsOutput = Join-Path $fixtureRoot 'contents-output'
  New-Item -ItemType Directory -Path $contentsOutput -Force | Out-Null
  $contentsBoundary = New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot $contentsOutput
  New-Item -ItemType Directory -Path (Join-Path $contentsBoundary.StagePath 'logs') -Force | Out-Null
  Assert-BoundaryError { Assert-AIStudyBuddyPackageStagingContents -Boundary $contentsBoundary } 'PACKAGE_CONTENTS_FORBIDDEN'
  Remove-AIStudyBuddyPackageBoundaryStage -Boundary $contentsBoundary
  $reparseSupported = $false
  $linkOutput = Join-Path $fixtureRoot 'link-output'
  try {
    New-Item -ItemType SymbolicLink -Path $linkOutput -Target $protected -ErrorAction Stop | Out-Null
    $reparseSupported = $true
    Assert-BoundaryError { New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot $linkOutput } 'PACKAGE_OUTPUT_REPARSE_POINT'
  } catch {
    if ($reparseSupported) { throw }
  }
  if (Test-Path -LiteralPath $linkOutput) { Remove-Item -LiteralPath $linkOutput -Force }
  Assert-TrueValue (Test-Path -LiteralPath $protectedSentinel -PathType Leaf)
  if ($null -eq $previousDataRoot) { Remove-Item Env:APP_DATA_ROOT -ErrorAction SilentlyContinue } else { $env:APP_DATA_ROOT = $previousDataRoot }
  Write-Output 'BOUNDARY_TEST_OK'
} finally {
  if (Test-Path -LiteralPath $fixtureRoot) { Remove-Item -LiteralPath $fixtureRoot -Recurse -Force }
}