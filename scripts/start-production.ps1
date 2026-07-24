[CmdletBinding()]
param([string]$InstallRoot, [int]$Port = 0, [switch]$Wait)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
if (-not (Test-Path -LiteralPath $paths.EnvFile -PathType Leaf)) { throw "Runtime config missing: $($paths.EnvFile). Run bootstrap-runtime.ps1 first." }
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'server.js') -PathType Leaf)) { throw 'Compiled backend server.js is missing.' }
Import-AIStudyBuddyEnvFile $paths.EnvFile
Assert-AIStudyBuddyLoopbackHost
if ($Port -gt 0) { $env:BACKEND_PORT = [string]$Port }
if ([string]::IsNullOrWhiteSpace($env:BACKEND_PORT)) { $env:BACKEND_PORT = '3000' }
$node = Get-NodeVersionInfo
if (-not (Test-AIStudyBuddySupportedNodeVersion $node)) { throw 'Verified Node.js major 24 is required.' }
$py = Get-PythonVersionInfo $env:PYTHON_PATH
if ($null -eq $py) { throw "Configured OCR Python is missing: $($env:PYTHON_PATH)" }
$ocrImport = Invoke-AIStudyBuddyPythonRuntimeCheck -PythonPath $env:PYTHON_PATH -Check 'ocr-import'
if (-not $ocrImport.Success) { throw "OCR Worker dependency import failed. $($ocrImport.Error)" }
foreach ($dir in @($paths.Data, $paths.Logs, $paths.Tmp, $paths.Models, $paths.Backups)) {
  if (-not (Test-AIStudyBuddyWritableDirectory $dir)) { throw "Required directory is missing or inaccessible: $dir" }
}
$portNumber = [int]$env:BACKEND_PORT
$portUse = Get-NetTCPConnection -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue
if ($portUse) { throw "Port $portNumber is already listening (PID $($portUse[0].OwningProcess))." }
Ensure-AIStudyBuddyDirectories $paths
$stdout = $paths.LogFile; $stderr = $paths.ErrorLogFile
$proc = Start-Process -FilePath 'node' -ArgumentList @((Join-Path $paths.Backend 'server.js')) -WorkingDirectory $paths.Backend -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
Set-Content -LiteralPath $paths.PidFile -Value ([string]$proc.Id) -Encoding ascii
$deadline = (Get-Date).AddSeconds(30)
do {
  Start-Sleep -Milliseconds 500
  try { $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $env:BACKEND_PORT) -TimeoutSec 2; if ($health.success) { break } } catch { }
} while ((Get-Date) -lt $deadline)
if (-not $health.success) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $paths.PidFile -Force -ErrorAction SilentlyContinue
  throw "Backend did not become healthy. See $stderr"
}
Write-Output "AI StudyBuddy running at http://127.0.0.1:$($env:BACKEND_PORT)"
Write-Output "PID: $($proc.Id)"
if ($Wait) { Wait-Process -Id $proc.Id }
