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

# ── 默认 fail-closed：不传 -EnableWrite 只做只读验证 ──
if (-not $EnableWrite) {
  Write-Output "RESTORE_VALIDATED_NO_WRITE files=$($validated.Entries.Count)"
  exit 0
}

# ── 受控恢复写入（Wave 1 T04-3，仅隔离/批准数据根）──
# 状态序列：PREWRITE_APPROVED → WRITERS_QUIESCED → PRECHECK_PASSED →
#           RECOVERY_POINT_VERIFIED → STAGING_WRITTEN_AND_VERIFIED →
#           POST_RESTORE_VERIFICATION → RESTORE_COMPLETED

# 1. PREWRITE_APPROVED
if (-not $PSCmdlet.ShouldProcess('logical-data-root', 'Restore validated backup with writes')) {
  Write-Output "RESTORE_VALIDATED_NO_WRITE files=$($validated.Entries.Count)"
  exit 0
}
Write-Output 'STATE=PREWRITE_APPROVED'

# 2. WRITERS_QUIESCED：检查服务 PID 文件与端口监听
# 安全优先：PID 文件存在即视为服务痕迹（残留需运维确认清理），拒绝恢复。
$pidFile = $paths.PidFile
if (Test-Path -LiteralPath $pidFile) {
  try { $runningPid = [int](Get-Content -LiteralPath $pidFile -Raw -ErrorAction Stop).Trim() } catch { $runningPid = 0 }
  if ($runningPid -gt 0) {
    $proc = Get-Process -Id $runningPid -ErrorAction SilentlyContinue
    if ($null -ne $proc) { New-AIStudyBuddyDataBoundaryError 'RESTORE_WRITERS_ACTIVE' }
  }
  # PID 文件存在但进程不存在：仍视为服务痕迹，需要运维确认清理后重试
  New-AIStudyBuddyDataBoundaryError 'RESTORE_PID_FILE_PRESENT'
}
# 若启动脚本未写 PID 文件，检查端口监听（BACKEND_PORT 默认 3000 回环）
$listenPort = $env:BACKEND_PORT
if (-not $listenPort) { $listenPort = '3000' }
$listening = Get-NetTCPConnection -State Listen -LocalPort ([int]$listenPort) -ErrorAction SilentlyContinue
if ($listening) { New-AIStudyBuddyDataBoundaryError 'RESTORE_WRITERS_ACTIVE' }
Write-Output 'STATE=WRITERS_QUIESCED'

# 3. 停止自动备份计划任务（若存在，记录后恢复）
$taskName = 'AIStudyBuddy-AutoBackup'
$taskWasEnabled = $false
$scheduledTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($scheduledTask) {
  $taskWasEnabled = ($scheduledTask.State -ne 'Disabled')
  if ($taskWasEnabled) { Disable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null }
  Write-Output 'STATE=BACKUP_TASK_PAUSED'
}

# 4. PRECHECK_PASSED（validated 已逐文件 hash 校验）
Write-Output "STATE=PRECHECK_PASSED files=$($validated.Entries.Count)"

# 5. RECOVERY_POINT_VERIFIED：复制当前 data 到 recovery-points
try {
  $recoveryRoot = Join-Path $paths.Backups 'recovery-points'
  New-Item -ItemType Directory -Path $recoveryRoot -Force -ErrorAction Stop | Out-Null
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
  $recoveryPoint = Join-Path $recoveryRoot "recovery-$stamp"
  Copy-Item -LiteralPath $target -Destination $recoveryPoint -Recurse -Force -ErrorAction Stop
  Assert-AIStudyBuddyDataExistingDirectory -Path $recoveryPoint -Code 'RESTORE_RECOVERY_POINT_FAILED' | Out-Null
} catch {
  New-AIStudyBuddyDataBoundaryError 'RESTORE_RECOVERY_POINT_FAILED'
}
Write-Output "STATE=RECOVERY_POINT_VERIFIED recovery=$recoveryPoint"

# 6. STAGING_WRITTEN_AND_VERIFIED：复制 payload 到目标 data
try {
  foreach ($entry in $validated.Entries) {
    $dest = [IO.Path]::GetFullPath((Join-Path $target $entry.RelativePath))
    if (-not (Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $dest -Root $target)) { New-AIStudyBuddyDataBoundaryError 'RESTORE_COPY_FAILED' }
    $parent = Split-Path -Path $dest -Parent
    New-Item -ItemType Directory -Path $parent -Force -ErrorAction Stop | Out-Null
    Assert-AIStudyBuddyDataPathWithoutReparsePoints -Path $parent -Code 'RESTORE_COPY_FAILED' | Out-Null
    Copy-Item -LiteralPath $entry.SourcePath -Destination $dest -Force -ErrorAction Stop
    # 恢复后的目标文件必须可写（备份源带只读标记，恢复后清除）
    $restoredItem = Get-Item -LiteralPath $dest -Force -ErrorAction Stop
    $restoredItem.IsReadOnly = $false
    $copied = Assert-AIStudyBuddyDataRegularFile -Path $dest -Code 'RESTORE_COPY_FAILED'
    if ([int64]$copied.Length -ne $entry.Bytes) { New-AIStudyBuddyDataBoundaryError 'RESTORE_COPY_FAILED' }
    $hash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    if ($hash -ne $entry.Sha256) { New-AIStudyBuddyDataBoundaryError 'RESTORE_COPY_FAILED' }
  }
} catch {
  if ($_.Exception.Message -like '*RESTORE_COPY_FAILED*') { throw }
  New-AIStudyBuddyDataBoundaryError 'RESTORE_COPY_FAILED'
}
Write-Output "STATE=STAGING_WRITTEN_AND_VERIFIED files=$($validated.Entries.Count)"

# 7. POST_RESTORE_VERIFICATION：完整性检查
$dbPaths = @(Join-Path $target 'studybuddy.db')
$semestersDir = Join-Path $target 'semesters'
if (Test-Path -LiteralPath $semestersDir) {
  $dbPaths += @(Get-ChildItem -LiteralPath $semestersDir -Recurse -Filter '*.db' -File -ErrorAction Stop | ForEach-Object { $_.FullName })
}
foreach ($dbPath in $dbPaths) {
  if (-not (Test-Path -LiteralPath $dbPath)) { continue }
  $sqliteOk = $false
  try {
    if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
      $result = & sqlite3 $dbPath 'PRAGMA integrity_check;' 2>$null
      $sqliteOk = ($result -contains 'ok')
    }
  } catch { $sqliteOk = $false }
  if (-not $sqliteOk) { Write-Error ("RESTORE_INTEGRITY_FAILED db=" + (Get-AIStudyBuddyDataShortFingerprint $dbPath)); exit 1 }
}
Write-Output 'STATE=POST_RESTORE_VERIFICATION'

# 8. 恢复自动备份任务（如原先存在）
if ($taskWasEnabled) { Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null }
Write-Output "RESTORE_COMPLETED files=$($validated.Entries.Count)"
