# T06B 家长报告计划任务注册（使用机器部署版）
[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$InstallRoot,
  [string]$TaskName = 'AIStudyBuddy-ParentReport',
  [string]$PowerShellPath = 'powershell.exe'
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
$wrapperPath = Join-Path $paths.Scripts 'run-parent-report-task.ps1'
if (-not (Test-Path -LiteralPath $wrapperPath -PathType Leaf)) { throw "Compiled parent-report wrapper is missing: $wrapperPath" }
if (-not $PSCmdlet.ShouldProcess($TaskName, 'Register current-user parent report task')) { exit 0 }
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $PowerShellPath -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -InstallRoot "{1}"' -f $wrapperPath, $paths.Root) -WorkingDirectory $paths.Scripts
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At '22:30'
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($dailyTrigger, $logonTrigger) -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Registered $TaskName for current user. Real report delivery remains disabled until configuration and explicit enablement."
