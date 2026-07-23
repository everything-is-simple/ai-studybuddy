[CmdletBinding()]
param([string]$InstallRoot, [int]$Port = 0)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name, [string]$Status, [string]$Detail) {
  $checks.Add([pscustomobject]@{ name = $Name; status = $Status; detail = $Detail })
}
function Resolve-ComparePath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return '' }
  return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}
function Add-DatabaseCheck([string]$Path, [int]$ExpectedVersion, [string]$Scope, [string]$Name) {
  $node = Get-NodeVersionInfo
  if ($null -eq $node) { Add-Check $Name 'fail' 'Node.js unavailable for SQLite precheck.'; return }
  $script = @"
const DB=require('better-sqlite3');
const db=new DB(process.argv[1],{readonly:true,fileMustExist:true});
const quick=db.pragma('quick_check',{simple:true});
const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
let version=0;
if(exists){ const row=db.prepare('SELECT MAX(version) AS v FROM schema_migrations WHERE scope = ?').get(process.argv[2]); version=Number(row?.v ?? 0); }
console.log(JSON.stringify({quick,version}));
db.close();
"@
  Push-Location $paths.Backend
  try { $raw = (& node -e $script $Path $Scope 2>$null | Out-String).Trim() } catch { $raw = '' } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) { Add-Check $Name 'fail' 'SQLite read-only migration precheck failed.'; return }
  try { $state = $raw | ConvertFrom-Json } catch { Add-Check $Name 'fail' 'SQLite precheck returned invalid JSON.'; return }
  if ($state.quick -ne 'ok') { Add-Check $Name 'fail' "SQLite quick_check=$($state.quick)"; return }
  if ([int]$state.version -gt $ExpectedVersion) { Add-Check $Name 'fail' "Database version $($state.version) is newer than application $ExpectedVersion."; return }
  if ([int]$state.version -lt $ExpectedVersion) { Add-Check $Name 'warn' "Migration pending: $($state.version)/$ExpectedVersion"; return }
  Add-Check $Name 'pass' "Migration $($state.version)/$ExpectedVersion; quick_check=ok"
}

if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) { Add-Check 'windows' 'pass' ([Environment]::OSVersion.Version.ToString()) } else { Add-Check 'windows' 'fail' 'Windows is required for this deployment package.' }
$node = Get-NodeVersionInfo
if ($null -eq $node) { Add-Check 'node' 'fail' 'Node.js is not available on PATH.' }
elseif ($node.Major -lt 20 -or $node.Major -gt 25) { Add-Check 'node' 'fail' $node.Raw }
else { Add-Check 'node' 'pass' $node.Raw }
$envFile = $paths.EnvFile
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  Add-Check 'runtime-config' 'fail' $envFile
} else {
  try { Import-AIStudyBuddyEnvFile $envFile; Add-Check 'runtime-config' 'pass' $envFile } catch { Add-Check 'runtime-config' 'fail' $_.Exception.Message }
}
try { Assert-AIStudyBuddyLoopbackHost; Add-Check 'loopback-host' 'pass' $env:BACKEND_HOST } catch { Add-Check 'loopback-host' 'fail' $_.Exception.Message }
if ($Port -gt 0) { $env:BACKEND_PORT = [string]$Port }
if ([string]::IsNullOrWhiteSpace($env:BACKEND_PORT)) { $env:BACKEND_PORT = '3000' }
if ([string]::IsNullOrWhiteSpace($env:APP_DATA_ROOT)) {
  Add-Check 'data-root-config' 'fail' 'APP_DATA_ROOT is missing.'
} elseif ((Resolve-ComparePath $env:APP_DATA_ROOT) -ne (Resolve-ComparePath $paths.Data)) {
  Add-Check 'data-root-config' 'fail' "APP_DATA_ROOT must be $($paths.Data)"
} else { Add-Check 'data-root-config' 'pass' $paths.Data }
if (-not [string]::IsNullOrWhiteSpace($env:FRONTEND_STATIC_ROOT) -and (Resolve-ComparePath $env:FRONTEND_STATIC_ROOT) -ne (Resolve-ComparePath (Join-Path $paths.Backend 'public'))) {
  Add-Check 'frontend-static-root' 'warn' $env:FRONTEND_STATIC_ROOT
} else { Add-Check 'frontend-static-root' 'pass' 'backend/public' }
$py = $null
if (-not [string]::IsNullOrWhiteSpace($env:PYTHON_PATH)) { $py = Get-PythonVersionInfo $env:PYTHON_PATH }
if ($null -eq $py -or $py.Major -ne 3 -or $py.Minor -lt 10 -or $py.Minor -gt 12) {
  Add-Check 'python' 'fail' ([string]$env:PYTHON_PATH)
} else {
  $bits = (& $env:PYTHON_PATH -c "import struct; print(struct.calcsize('P') * 8)" | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $bits -ne '64') { Add-Check 'python' 'fail' "$($py.Raw); architecture=$bits" } else { Add-Check 'python' 'pass' "$($py.Raw); x64" }
}
if ($py) {
  $env:PYTHONDONTWRITEBYTECODE = '1'
  & $env:PYTHON_PATH -c 'import rapidocr_onnxruntime; print("OCR_IMPORT_OK")' | Out-Null
  if ($LASTEXITCODE -eq 0) { Add-Check 'ocr-worker' 'pass' 'rapidocr_onnxruntime import ok' } else { Add-Check 'ocr-worker' 'fail' 'rapidocr_onnxruntime import failed' }
} else { Add-Check 'ocr-worker' 'fail' 'Python unavailable.' }
foreach ($name in @('Root','App','Backend','Scripts','Data','Logs','Tmp','Models','Backups','Runtime','Config')) {
  $dir = $paths[$name]
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { Add-Check "dir-$name" 'fail' $dir }
  elseif (-not (Test-AIStudyBuddyWritableDirectory $dir -ReadOnly)) { Add-Check "dir-$name" 'warn' "Cannot read ACL: $dir" }
  else { Add-Check "dir-$name" 'pass' "$dir (ACL readable; no write probe performed)" }
}
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'server.js') -PathType Leaf)) { Add-Check 'backend' 'fail' 'server.js missing' } else { Add-Check 'backend' 'pass' 'server.js present' }
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'public\index.html') -PathType Leaf)) { Add-Check 'frontend' 'fail' 'public/index.html missing' } else { Add-Check 'frontend' 'pass' 'static frontend present' }
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'scripts\ocr-worker.py') -PathType Leaf)) { Add-Check 'ocr-script' 'fail' 'OCR worker missing' } else { Add-Check 'ocr-script' 'pass' 'OCR worker present' }
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'package-lock.json') -PathType Leaf)) { Add-Check 'node-lock' 'fail' 'package-lock.json missing' } else { Add-Check 'node-lock' 'pass' 'production dependency lock present' }
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'node_modules') -PathType Container)) {
  Add-Check 'node-dependencies' 'fail' 'node_modules missing; run bootstrap-runtime.ps1.'
} elseif ($node) {
  Push-Location $paths.Backend
  try { & node -e "require('express'); require('better-sqlite3'); require('@primno/dpapi'); require('@ai-studybuddy/shared');" | Out-Null } finally { Pop-Location }
  if ($LASTEXITCODE -eq 0) { Add-Check 'node-dependencies' 'pass' 'production imports ok' } else { Add-Check 'node-dependencies' 'fail' 'production imports failed' }
}
$portNumber = [int]$env:BACKEND_PORT
$listening = @(Get-NetTCPConnection -LocalPort $portNumber -State Listen -ErrorAction SilentlyContinue)
if ($listening.Count -eq 0) {
  Add-Check 'port' 'warn' "No listener on port $portNumber"
} else {
  $nonLoopback = @($listening | Where-Object { $_.LocalAddress -notin @('127.0.0.1','::1') })
  if ($nonLoopback.Count -gt 0) { Add-Check 'port' 'fail' (($listening | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort); PID $($_.OwningProcess)" }) -join '; ') }
  else { Add-Check 'port' 'pass' (($listening | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort); PID $($_.OwningProcess)" }) -join '; ') }
}
try {
  $health = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/api/health" -f $portNumber) -TimeoutSec 3
  if ($health.success) { Add-Check 'health' 'pass' 'API health success' } else { Add-Check 'health' 'fail' 'API health returned success=false' }
} catch { Add-Check 'health' 'warn' 'Backend is not running' }
$db = Join-Path $paths.Data 'studybuddy.db'
if (Test-Path -LiteralPath $db -PathType Leaf) { Add-DatabaseCheck $db 2 'global' 'database-global' } else { Add-Check 'database-global' 'warn' 'No database yet; first startup will initialize it.' }
$semesterFiles = @(Get-ChildItem -LiteralPath (Join-Path $paths.Data 'semesters') -Recurse -Force -File -Filter '*.db' -ErrorAction SilentlyContinue)
if ($semesterFiles.Count -eq 0) { Add-Check 'database-semesters' 'warn' 'No semester database yet.' }
else { foreach ($file in $semesterFiles) { Add-DatabaseCheck $file.FullName 9 'semester' ('database-semester-' + $file.BaseName) } }
$taskCommand = Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue
$task = if ($taskCommand) { Get-ScheduledTask -TaskName 'AIStudyBuddy-ParentReport' -ErrorAction SilentlyContinue } else { $null }
if ($task) {
  $action = @($task.Actions | Select-Object -First 1)
  $args = [string]$action.Arguments
  if ($args -and $args.Contains($paths.Root)) { Add-Check 'parent-report-task' 'pass' $task.State } else { Add-Check 'parent-report-task' 'fail' 'Task exists but does not target current install root.' }
} else { Add-Check 'parent-report-task' 'warn' 'Not registered; real reports remain disabled by default.' }
$configDir = Join-Path $paths.Data 'config'
$configState = @('ai','smtp','feishu' | ForEach-Object { "$_=" + (Test-Path -LiteralPath (Join-Path $configDir "$_\.active.enc") -PathType Leaf) }) -join '; '
Add-Check 'secure-config-state' 'pass' $configState
$secretMatches = @(Get-AIStudyBuddySecretFileMatches (Join-Path $paths.App '.'))
if ($secretMatches.Count -gt 0) { Add-Check 'secret-files' 'fail' ($secretMatches.FullName -join '; ') } else { Add-Check 'secret-files' 'pass' 'No likely secret files in app package' }
$secretEnvNames = @('AI_API_KEY','SMTP_AUTH_CODE','FEISHU_WEBHOOK_URL')
$secretEnvHits = @($secretEnvNames | Where-Object { -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process')) })
if ($secretEnvHits.Count -gt 0 -or -not [string]::IsNullOrWhiteSpace($env:AI_PROVIDERS)) { Add-Check 'plain-secret-config' 'fail' 'Plain secret environment values detected; use the secure configuration center.' } else { Add-Check 'plain-secret-config' 'pass' 'No plain secret values in production.env' }
if ($env:APP_DATA_ROOT -match 'ai-studybuddy-tmp[\\/]runs') { Add-Check 'e2e-isolation' 'fail' 'Formal data root points to Playwright/E2E isolation' } else { Add-Check 'e2e-isolation' 'pass' 'Formal data root is not an E2E root' }
$checks | Format-Table -AutoSize
if (@($checks | Where-Object status -eq 'fail').Count -gt 0) { exit 1 }
