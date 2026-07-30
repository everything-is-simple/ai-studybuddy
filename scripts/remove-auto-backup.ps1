[CmdletBinding()]
param(
  [string]$InstallRoot
)
$ErrorActionPreference = 'Stop'

$taskName = 'AIStudyBuddy-AutoBackup'

# 检查任务是否存在
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existingTask) {
  Write-Output "TASK_NOT_FOUND: 自动备份任务不存在"
  exit 0
}

# 注销任务
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false

Write-Output "AUTO_BACKUP_REMOVED task=$taskName"
