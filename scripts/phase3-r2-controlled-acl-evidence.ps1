[CmdletBinding()]
param([switch]$SyntheticFixture)

# This approved slice deliberately has no real-target parameters and never invokes Get-Acl or ACL write APIs.
if (-not $SyntheticFixture) {
  throw [System.InvalidOperationException]::new('P1_REAL_OPERATION_DISABLED')
}

[pscustomobject]@{
  Status = 'SYNTHETIC_ONLY'
  ContractVersion = 'phase3-p1-controlled-readonly-v1'
  Operation = 'R2'
}
