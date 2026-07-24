# T06B 家长报告计划任务卸载；不删除学习数据、配置或备份。
[CmdletBinding(SupportsShouldProcess)]
param([string]$TaskName = 'AIStudyBuddy-ParentReport')
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) { Write-Output "Task not found: $TaskName"; exit 0 }
if ($PSCmdlet.ShouldProcess($TaskName, 'Unregister current-user parent report task')) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Unregistered $TaskName. User data was not deleted."
}
