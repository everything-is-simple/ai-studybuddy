# T06B 家长报告计划任务注册
# 仅调用已编译的一次性 runner；不写入或输出 SMTP/飞书凭据。
[CmdletBinding()]
param(
  [string]$TaskName = 'AIStudyBuddy-ParentReport',
  [string]$NodePath = 'node.exe'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runnerPath = Join-Path $repoRoot 'packages\backend\dist\scripts\parent-report-runner.js'
if (-not (Test-Path -LiteralPath $runnerPath -PathType Leaf)) {
  throw "Compiled parent-report runner is missing. Run pnpm -r --filter backend run build first."
}

$action = New-ScheduledTaskAction -Execute $NodePath -Argument ('"{0}"' -f $runnerPath) -WorkingDirectory $repoRoot
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At '22:30'
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($dailyTrigger, $logonTrigger) -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Registered $TaskName for the compiled parent-report runner."
