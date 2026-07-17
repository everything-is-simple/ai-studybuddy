# T06B 家长报告计划任务卸载（不接触运行数据或凭据）。
[CmdletBinding()]
param([string]$TaskName = 'AIStudyBuddy-ParentReport')

$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
Write-Output "Unregistered $TaskName."
