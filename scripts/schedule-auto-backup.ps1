[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$InstallRoot,
  [Parameter(Mandatory)] [string]$OutputRoot,
  [string]$ScheduleTime = '22:00'
)
$ErrorActionPreference = 'Stop'

# 验证时间格式
if ($ScheduleTime -notmatch '^\d{2}:\d{2}$') {
  Write-Error "SCHEDULE_TIME_INVALID: 时间格式必须为 HH:MM (例如 22:00)"
  exit 1
}

$taskName = 'AIStudyBuddy-AutoBackup'

# 检查任务是否已存在
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Write-Error "TASK_ALREADY_EXISTS: 自动备份任务已存在，请先使用 remove-auto-backup.ps1 注销"
  exit 1
}

# 验证安装根和输出根
$installRootResolved = [IO.Path]::GetFullPath($InstallRoot)
$outputRootResolved = [IO.Path]::GetFullPath($OutputRoot)

if (-not (Test-Path -LiteralPath $installRootResolved -PathType Container)) {
  Write-Error "INSTALL_ROOT_INVALID: 安装根目录不存在 $installRootResolved"
  exit 1
}

if (-not (Test-Path -LiteralPath $outputRootResolved -PathType Container)) {
  Write-Error "OUTPUT_ROOT_INVALID: 输出根目录不存在 $outputRootResolved"
  exit 1
}

# 构建备份脚本路径
$backupScriptPath = Join-Path (Split-Path -Path $PSScriptRoot -Parent) 'scripts\backup-data.ps1'
if (-not (Test-Path -LiteralPath $backupScriptPath)) {
  Write-Error "BACKUP_SCRIPT_NOT_FOUND: 找不到备份脚本 $backupScriptPath"
  exit 1
}

# 创建任务动作
$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$backupScriptPath`" -InstallRoot `"$installRootResolved`" -OutputRoot `"$outputRootResolved`""

# 创建每日触发器
$timeParts = $ScheduleTime.Split(':')
$trigger = New-ScheduledTaskTrigger `
  -Daily `
  -At ([DateTime]::Today.AddHours([int]$timeParts[0]).AddMinutes([int]$timeParts[1]))

# 创建任务设置
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -MultipleInstances IgnoreNew

# 创建任务主体（以当前用户身份运行）
$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType S4U `
  -RunLevel Limited

# 注册任务
Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "AI StudyBuddy 自动备份任务 - 每日 $ScheduleTime 执行数据备份" `
  | Out-Null

Write-Output "AUTO_BACKUP_SCHEDULED task=$taskName schedule=$ScheduleTime outputRoot=$outputRootResolved"

# 获取下次运行时间
$task = Get-ScheduledTask -TaskName $taskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
Write-Output "NEXT_RUN_TIME $($taskInfo.NextRunTime)"
