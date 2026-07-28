$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking

function Assert-P1FixedError {
  param([scriptblock]$Action, [string]$Code)
  try {
    & $Action
    throw "Expected fixed failure $Code"
  } catch {
    if ($_.Exception.Message -ne $Code) { throw }
  }
}

function New-SyntheticAclEvidence {
  param([hashtable]$Overrides = @{})
  $base = [ordered]@{
    VolumeKind = 'local-fixed'
    Reparse = $false
    InstallInstanceId = 'synthetic-install-instance'
    ObjectId = 'synthetic-object'
    ParentId = 'synthetic-parent'
    ContentVersion = 'synthetic-version'
    DescriptorIdentity = 'synthetic-descriptor'
    OwnerKind = 'CURRENT_USER'
    SubjectKinds = @('CURRENT_USER', 'LOCAL_SYSTEM')
    HasDenyAce = $false
    InheritanceException = $false
    EffectiveAccessKnown = $true
  }
  foreach ($key in $Overrides.Keys) { $base[$key] = $Overrides[$key] }
  return [pscustomobject]$base
}

$sentinel = 'invalid-acl-synthetic-sentinel'
$before = New-SyntheticAclEvidence -Overrides @{ InstallInstanceId = $sentinel }
$after = New-SyntheticAclEvidence -Overrides @{ InstallInstanceId = $sentinel }
$evidence = [pscustomobject]@{ Before = $before; After = $after }
foreach ($category in @('config', 'data', 'logs', 'backups', 'tmp', 'models')) {
  $report = Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory $category -SyntheticEvidence $evidence -SyntheticFixture
  if ($report.Status -ne 'SYNTHETIC_PASS' -or $report.LogicalCategory -ne $category) { throw 'R2 synthetic success contract failed' }
  $serialized = $report | ConvertTo-Json -Compress
  if ($serialized.Contains($sentinel) -or $serialized.Contains('ObjectId') -or $serialized.Contains('ParentId')) { throw 'R2 redaction contract failed' }
}

Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence $evidence } 'P1_REAL_OPERATION_DISABLED'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'invalid' -SyntheticEvidence $evidence -SyntheticFixture } 'R2_LOGICAL_SCOPE_INVALID'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence -Overrides @{ VolumeKind = 'unc' }); After = (New-SyntheticAclEvidence -Overrides @{ VolumeKind = 'unc' }) }) -SyntheticFixture } 'R2_UNC_OR_MAPPED_VOLUME'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence -Overrides @{ Reparse = $true }); After = (New-SyntheticAclEvidence -Overrides @{ Reparse = $true }) }) -SyntheticFixture } 'R2_NOFOLLOW_RISK'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence -Overrides @{ OwnerKind = 'UNKNOWN' }); After = (New-SyntheticAclEvidence -Overrides @{ OwnerKind = 'UNKNOWN' }) }) -SyntheticFixture } 'R2_UNKNOWN_PRINCIPAL'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence -Overrides @{ HasDenyAce = $true }); After = (New-SyntheticAclEvidence -Overrides @{ HasDenyAce = $true }) }) -SyntheticFixture } 'R2_DENY_OR_INHERITANCE_RISK'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence -Overrides @{ EffectiveAccessKnown = $false }); After = (New-SyntheticAclEvidence -Overrides @{ EffectiveAccessKnown = $false }) }) -SyntheticFixture } 'R2_EFFECTIVE_ACCESS_UNKNOWN'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence); After = (New-SyntheticAclEvidence -Overrides @{ ContentVersion = 'synthetic-replaced' }) }) -SyntheticFixture } 'R2_NOFOLLOW_RISK'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence); After = (New-SyntheticAclEvidence -Overrides @{ DescriptorIdentity = 'synthetic-replaced' }) }) -SyntheticFixture } 'R2_NOFOLLOW_RISK'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence); After = (New-SyntheticAclEvidence -Overrides @{ OwnerKind = 'UNKNOWN' }) }) -SyntheticFixture } 'R2_UNKNOWN_PRINCIPAL'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence); After = (New-SyntheticAclEvidence -Overrides @{ HasDenyAce = $true }) }) -SyntheticFixture } 'R2_DENY_OR_INHERITANCE_RISK'
Assert-P1FixedError { Get-AIStudyBuddyP1ControlledAclEvidence -LogicalCategory 'data' -SyntheticEvidence ([pscustomobject]@{ Before = (New-SyntheticAclEvidence); After = (New-SyntheticAclEvidence -Overrides @{ EffectiveAccessKnown = $false }) }) -SyntheticFixture } 'R2_EFFECTIVE_ACCESS_UNKNOWN'

$r1 = & (Join-Path $PSScriptRoot 'phase3-r1-controlled-secret-scan.ps1') -SyntheticFixture
$r2 = & (Join-Path $PSScriptRoot 'phase3-r2-controlled-acl-evidence.ps1') -SyntheticFixture
if ($r1.Status -ne 'SYNTHETIC_ONLY' -or $r1.Operation -ne 'R1' -or $r2.Status -ne 'SYNTHETIC_ONLY' -or $r2.Operation -ne 'R2') { throw 'P1 runner contract failed' }

Write-Output 'P1_CONTROLLED_READONLY_SYNTHETIC_TEST_PASS'
