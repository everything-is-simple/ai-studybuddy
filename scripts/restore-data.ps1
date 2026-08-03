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
if (-not $EnableWrite) {
  Write-Output 'RESTORE_WRITE_DISABLED'
  exit 0
}
if (-not $PSCmdlet.ShouldProcess('logical-data-root', 'Restore validated backup')) {
  Write-Output "RESTORE_VALIDATED_NO_WRITE files=$($validated.Entries.Count)"
  exit 0
}

# T04-3: 实际恢复写入
# 1. 检查服务是否已停止
$pidFile = Join-Path $paths.Data '..' 'backend.pid'
if (Test-Path -LiteralPath $pidFile) {
  $pidContent = Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue
  if ($pidContent -and ($pidContent -match '\d+')) {
    $pid = [int]$pidContent
    if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
      New-AIStudyBuddyDataBoundaryError 'RESTORE_SERVICE_RUNNING'
    }
  }
}

# 2. 创建 recovery point
$recoveryRoot = Join-Path $paths.Data '..' 'backups' 'recovery-points'
$recoveryName = 'recovery-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$recoveryPath = Join-Path $recoveryRoot $recoveryName
try {
  New-Item -ItemType Directory -Path $recoveryPath -Force -ErrorAction Stop | Out-Null
  $dataFiles = Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction Stop
  foreach ($file in $dataFiles) {
    $relativePath = $file.FullName.Substring($target.Length).TrimStart('\','/')
    $recoveryFilePath = Join-Path $recoveryPath $relativePath
    New-Item -ItemType Directory -Path (Split-Path $recoveryFilePath -Parent) -Force -ErrorAction Stop | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $recoveryFilePath -Force -ErrorAction Stop
  }
  Write-Output "RECOVERY_POINT_CREATED path=$recoveryPath files=$($dataFiles.Count)"
} catch {
  Write-Error "RECOVERY_POINT_FAILED: 无法创建恢复点 - $_"
  exit 1
}

# 3. 停止自动备份任务（如存在）
$autoBackupTask = Get-ScheduledTask -TaskName 'AIStudyBuddy-AutoBackup' -ErrorAction SilentlyContinue
if ($autoBackupTask -and $autoBackupTask.State -eq 'Running') {
  Stop-ScheduledTask -TaskName 'AIStudyBuddy-AutoBackup' -ErrorAction SilentlyContinue
}

# 4. 执行恢复
$restoredCount = 0
foreach ($entry in $validated.Entries) {
  $sourcePath = Join-Path $validated.PayloadPath $entry.path.Replace('/', '\')
  $destPath = Join-Path $target $entry.path.Replace('/', '\')

  try {
    New-Item -ItemType Directory -Path (Split-Path $destPath -Parent) -Force -ErrorAction Stop | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force -ErrorAction Stop

    # 验证哈希
    $hash = (Get-FileHash -LiteralPath $destPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
    if ($hash -ne $entry.sha256) {
      throw "Hash mismatch: expected $($entry.sha256), got $hash"
    }

    $restoredCount++
  } catch {
    Write-Error "RESTORE_FILE_FAILED path=$($entry.path) error=$_"
    Write-Output "RESTORE_INCOMPLETE restored=$restoredCount total=$($validated.Entries.Count) recoveryPoint=$recoveryPath"
    exit 1
  }
}

# 5. 验证恢复后数据库完整性
try {
  $globalDbPath = Join-Path $target 'studybuddy.db'
  if (Test-Path -LiteralPath $globalDbPath) {
    # 简单检查：确保文件可读
    $null = Get-Content -LiteralPath $globalDbPath -TotalCount 1 -ErrorAction Stop
  }
} catch {
  Write-Warning "RESTORE_INTEGRITY_WARNING: 恢复后数据库完整性检查警告 - $_"
}

Write-Output "RESTORE_COMPLETED files=$restoredCount recoveryPoint=$recoveryPath"
Write-Output "RESTORE_MANUAL_RESTART: 请手动重启服务"
