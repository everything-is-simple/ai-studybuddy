# T02-R2: 真实 Windows 目录与 ACL 只读采证（Wave 0）
# 只读：Get-Acl 与目录遍历，绝不执行 Set-Acl/icacls 修改。
# 输出固定脱敏主体分类，不记录完整用户名、完整 SID、ACL 原文、绝对宿主路径。
param(
  [string]$DataRoot = 'H:\AIStudyBuddy',
  [string]$OutputFile
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $DataRoot -PathType Container)) {
  throw "DATA_ROOT_INVALID: $DataRoot"
}
if (-not $OutputFile) {
  $OutputFile = Join-Path $PSScriptRoot '..\..\..\ai-studybuddy-tmp\runs\phase3-wave0-r2-acl.json'
}

# 固定脱敏主体分类
function Classify-Account([string]$sid, [string]$name) {
  $cur = [Security.Principal.WindowsIdentity]::GetCurrent()
  $systemSid = 'S-1-5-18'
  $adminsSid = 'S-1-5-32-544'
  $usersSid  = 'S-1-5-32-545'
  if ($sid -eq $systemSid) { return 'SYSTEM' }
  if ($sid -eq $adminsSid) { return 'Administrators' }
  if ($sid -eq $usersSid)  { return 'Users' }
  if ($cur.User.Value -eq $sid) { return 'CurrentUser' }
  if ($sid -like 'S-1-5-21-*') { return 'LocalAccount' }
  return 'UnknownPrincipal'
}

function Classify-Ace([System.Security.AccessControl.FileSystemAccessRule]$ace) {
  $principal = Classify-Account $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value $ace.IdentityReference.Value
  $rights = @()
  if ($ace.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Read) { $rights += 'Read' }
  if ($ace.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Write) { $rights += 'Write' }
  if ($ace.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Delete) { $rights += 'Delete' }
  if ($ace.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::Modify) { $rights += 'Modify' }
  if ($ace.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) { $rights += 'FullControl' }
  return [ordered]@{
    principal = $principal
    access = ($ace.AccessControlType.ToString().ToLower())
    rights = ($rights -join '+')
    inherited = $ace.IsInherited
  }
}

$dirs = @('config', 'data', 'logs', 'backups', 'tmp', 'models')
$results = @()

foreach ($d in $dirs) {
  $full = Join-Path $DataRoot $d
  if (-not (Test-Path -LiteralPath $full -PathType Container)) {
    $results += [ordered]@{ dir = $d; exists = $false; note = 'not-present' }
    continue
  }
  try {
    $acl = Get-Acl -LiteralPath $full
    $aces = @()
    foreach ($ace in $acl.Access) {
      if ($ace -is [System.Security.AccessControl.FileSystemAccessRule]) {
        $aces += Classify-Ace $ace
      }
    }
    # reparse 风险检查
    $item = Get-Item -LiteralPath $full -Force
    $isReparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
    $results += [ordered]@{
      dir = $d
      exists = $true
      ownerClass = Classify-Account $acl.Owner.Value $acl.Owner.Value
      isReparsePoint = $isReparse
      aces = $aces
    }
  } catch {
    $results += [ordered]@{ dir = $d; exists = $true; note = 'acl-read-failed'; errorCode = ($_.Exception.GetType().Name) }
  }
}

$report = [ordered]@{
  contract = 'phase3-wave0-r2-acl-readonly-v1'
  dataRoot = 'AIStudyBuddy-runtime-root'  # 脱敏：不输出绝对宿主路径
  collectedAt = (Get-Date).ToUniversalTime().ToString('o')
  entries = $results
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputFile -Encoding utf8
Write-Output "T02-R2 只读采证完成: $OutputFile"
