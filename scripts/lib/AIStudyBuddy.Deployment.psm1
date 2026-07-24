function Get-AIStudyBuddyRoot {
  param([string]$InstallRoot)
  if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
    if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw 'LOCALAPPDATA is not available.' }
    return [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'AIStudyBuddy'))
  }
  return [IO.Path]::GetFullPath($InstallRoot)
}

function Get-AIStudyBuddyPaths {
  param([string]$InstallRoot)
  $root = Get-AIStudyBuddyRoot $InstallRoot
  return [ordered]@{
    Root = $root
    App = Join-Path $root 'app'
    Backend = Join-Path $root 'app\backend'
    Scripts = Join-Path $root 'app\scripts'
    Data = Join-Path $root 'data'
    Logs = Join-Path $root 'logs'
    Tmp = Join-Path $root 'tmp'
    Models = Join-Path $root 'models'
    Backups = Join-Path $root 'backups'
    Runtime = Join-Path $root 'runtime'
    Venv = Join-Path $root 'runtime\venv'
    Config = Join-Path $root 'config'
    EnvFile = Join-Path $root 'config\production.env'
    PidFile = Join-Path $root 'run\backend.pid'
    LogFile = Join-Path $root 'logs\backend.log'
    ErrorLogFile = Join-Path $root 'logs\backend.error.log'
  }
}

function Ensure-AIStudyBuddyDirectories {
  param([hashtable]$Paths)
  foreach ($path in @($Paths.Root, $Paths.App, $Paths.Scripts, $Paths.Data, $Paths.Logs, $Paths.Tmp, $Paths.Models, $Paths.Backups, $Paths.Runtime, $Paths.Config, (Split-Path $Paths.PidFile -Parent))) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

function Test-AIStudyBuddyWritableDirectory {
  param([string]$Path, [switch]$ReadOnly)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return $false }
  try {
    if ($ReadOnly) {
      return $null -ne (Get-Acl -LiteralPath $Path)
    }
    $probe = Join-Path $Path ('.write-test-' + [guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($probe, 'ok')
    Remove-Item -LiteralPath $probe -Force
    return $true
  } catch {
    if ($probe) { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue }
    return $false
  }
}

function Get-NodeVersionInfo {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $command) { return $null }
  try { $raw = (& $command.Source --version 2>$null | Out-String).Trim() } catch { return $null }
  if ($LASTEXITCODE -ne 0 -or $raw -notmatch '^v(\d+)\.(\d+)\.(\d+)$') { return $null }
  return [pscustomobject]@{ Raw = $raw; Major = [int]$Matches[1]; Minor = [int]$Matches[2]; Patch = [int]$Matches[3] }
}

function Test-AIStudyBuddySupportedNodeVersion {
  param([object]$NodeVersion)
  if ($null -eq $NodeVersion) { return $false }
  return [int]$NodeVersion.Major -eq 24
}
function Get-PythonVersionInfo {
  param([string]$PythonPath)
  if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) { return $null }
  $raw = (& $PythonPath --version 2>&1 | Out-String).Trim()
  if ($raw -notmatch 'Python\s+(\d+)\.(\d+)\.(\d+)') { return $null }
  return [pscustomobject]@{ Raw = $raw; Major = [int]$Matches[1]; Minor = [int]$Matches[2]; Patch = [int]$Matches[3] }
}

function Get-AIStudyBuddyRelativePath {
  param(
    [Parameter(Mandatory)] [string]$BasePath,
    [Parameter(Mandatory)] [string]$TargetPath
  )
  $base = [IO.Path]::GetFullPath($BasePath)
  $target = [IO.Path]::GetFullPath($TargetPath)
  if (-not $base.EndsWith('\')) { $base += '\' }
  $baseUri = [Uri]$base
  $targetUri = [Uri]$target
  $relativeUri = $baseUri.MakeRelativeUri($targetUri)
  if ($relativeUri.IsAbsoluteUri) { throw "Target path must share the base volume: $TargetPath" }
  $relative = [Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/','\')
  if ([string]::IsNullOrWhiteSpace($relative)) { return '.' }
  return $relative
}

function Import-AIStudyBuddyEnvFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { throw "Invalid env line: $line" }
    $name = $Matches[1]; $value = $Matches[2].Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
    $value = $value.Replace('%LOCALAPPDATA%', $env:LOCALAPPDATA)
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Assert-AIStudyBuddyLoopbackHost {
  if ([string]::IsNullOrWhiteSpace($env:BACKEND_HOST)) { $env:BACKEND_HOST = '127.0.0.1' }
  if ($env:BACKEND_HOST -ne '127.0.0.1') { throw "Production backend must bind to 127.0.0.1, got $($env:BACKEND_HOST)" }
}

function Get-AIStudyBuddySecretFileMatches {
  param([string]$Root)
  $patterns = @('*.pem','*.key','*.p12','*.pfx','.env.local','.env')
  $result = @()
  foreach ($pattern in $patterns) {
    $result += Get-ChildItem -LiteralPath $Root -Recurse -Force -File -Filter $pattern -ErrorAction SilentlyContinue
  }
  return $result | Sort-Object FullName -Unique
}

function Invoke-AIStudyBuddyPythonRuntimeCheck {
  param(
    [Parameter(Mandatory)] [string]$PythonPath,
    [Parameter(Mandatory)] [ValidateSet('python-info','ocr-import')] [string]$Check
  )
  $helper = Join-Path $PSScriptRoot 'AIStudyBuddy.RuntimeChecks.py'
  if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
    return [pscustomobject]@{ Success = $false; ExitCode = -1; Data = $null; Error = "Python runtime helper is missing: $helper" }
  }
  $raw = (& $PythonPath $helper $Check 2>$null | Out-String).Trim()
  $exitCode = $LASTEXITCODE
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return [pscustomobject]@{ Success = $false; ExitCode = $exitCode; Data = $null; Error = 'Python runtime helper returned no JSON.' }
  }
  try { $data = $raw | ConvertFrom-Json } catch {
    return [pscustomobject]@{ Success = $false; ExitCode = $exitCode; Data = $null; Error = 'Python runtime helper returned invalid JSON.' }
  }
  $error = if ($data.error) { [string]$data.error } else { '' }
  return [pscustomobject]@{ Success = ($exitCode -eq 0 -and $data.ok -eq $true); ExitCode = $exitCode; Data = $data; Error = $error }
}

function Invoke-AIStudyBuddyNodeRuntimeCheck {
  param(
    [Parameter(Mandatory)] [ValidateSet('dependency-import','sqlite-precheck')] [string]$Check,
    [string[]]$CheckArguments = @()
  )
  $helper = Join-Path $PSScriptRoot 'AIStudyBuddy.RuntimeChecks.cjs'
  if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) {
    return [pscustomobject]@{ Success = $false; ExitCode = -1; Data = $null; Error = "Node runtime helper is missing: $helper" }
  }
  $raw = (& node $helper $Check @CheckArguments 2>$null | Out-String).Trim()
  $exitCode = $LASTEXITCODE
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return [pscustomobject]@{ Success = $false; ExitCode = $exitCode; Data = $null; Error = 'Node runtime helper returned no JSON.' }
  }
  try { $data = $raw | ConvertFrom-Json } catch {
    return [pscustomobject]@{ Success = $false; ExitCode = $exitCode; Data = $null; Error = 'Node runtime helper returned invalid JSON.' }
  }
  $error = if ($data.error) { [string]$data.error } else { '' }
  return [pscustomobject]@{ Success = ($exitCode -eq 0 -and $data.ok -eq $true); ExitCode = $exitCode; Data = $data; Error = $error }
}
Export-ModuleMember -Function *-AIStudyBuddy*, Get-NodeVersionInfo, Get-PythonVersionInfo, Import-AIStudyBuddyEnvFile
