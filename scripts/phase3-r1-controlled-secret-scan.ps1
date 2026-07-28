[CmdletBinding()]
param([switch]$SyntheticFixture)

# This approved slice deliberately has no real-target parameters. A later, separately approved real-operation slice
# must add a gate only after production capability and exact target identity are independently reviewed.
if (-not $SyntheticFixture) {
  throw [System.InvalidOperationException]::new('P1_REAL_OPERATION_DISABLED')
}

[pscustomobject]@{
  Status = 'SYNTHETIC_ONLY'
  ContractVersion = 'phase3-p1-controlled-readonly-v1'
  Operation = 'R1'
}
