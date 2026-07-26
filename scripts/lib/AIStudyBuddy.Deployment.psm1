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
  try { $lines = @(Get-Content -LiteralPath $Path) } catch { throw '[CONFIG] ENV_FILE_UNREADABLE env file' }
  $lineNumber = 0
  $seen = @{}
  foreach ($line in $lines) {
    $lineNumber += 1
    if ($line -match '^\s*#' -or $line -match '^\s*$') { continue }
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { throw "[CONFIG] INVALID_ENV_LINE line $lineNumber" }
    $name = $Matches[1]; $value = $Matches[2].Trim()
    $normalizedName = $name.ToUpperInvariant()
    if ($seen.ContainsKey($normalizedName)) { throw "[CONFIG] DUPLICATE_ENV_KEY $name line $lineNumber" }
    $seen[$normalizedName] = $true
    if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Substring(1, $value.Length - 2) }
    $value = $value.Replace('%LOCALAPPDATA%', $env:LOCALAPPDATA)
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

function Assert-AIStudyBuddyLoopbackHost {
  if ([string]::IsNullOrWhiteSpace($env:BACKEND_HOST)) { $env:BACKEND_HOST = '127.0.0.1' }
  if ($env:BACKEND_HOST -ne '127.0.0.1') { throw '[CONFIG] INVALID_BACKEND_HOST BACKEND_HOST must be 127.0.0.1' }
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
function New-AIStudyBuddyPackageBoundaryError {
  param([Parameter(Mandatory)] [string]$Code)
  throw [System.InvalidOperationException]::new($Code)
}

function Get-AIStudyBuddyPackageBoundaryFullPath {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Code
  )
  if ([string]::IsNullOrWhiteSpace($Path)) { New-AIStudyBuddyPackageBoundaryError $Code }
  try { return [IO.Path]::GetFullPath($Path) } catch { New-AIStudyBuddyPackageBoundaryError $Code }
}

function Test-AIStudyBuddyPackageBoundaryDescendant {
  param(
    [Parameter(Mandatory)] [string]$Candidate,
    [Parameter(Mandatory)] [string]$Root
  )
  $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  if ([string]::IsNullOrWhiteSpace($rootPath)) { return $false }
  return $candidatePath.StartsWith($rootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Get-AIStudyBuddyPackageBoundaryDirectory {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$MissingCode,
    [Parameter(Mandatory)] [string]$ReparseCode
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { New-AIStudyBuddyPackageBoundaryError $MissingCode }
  try { $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop } catch { New-AIStudyBuddyPackageBoundaryError $MissingCode }
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { New-AIStudyBuddyPackageBoundaryError $ReparseCode }
  return $item
}

function Assert-AIStudyBuddyPackageTreeWithoutReparsePoints {
  param(
    [Parameter(Mandatory)] [string]$Root,
    [Parameter(Mandatory)] [string]$Code
  )
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($Root)
  while ($pending.Count -gt 0) {
    $current = $pending.Pop()
    try { $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop } catch { New-AIStudyBuddyPackageBoundaryError $Code }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { New-AIStudyBuddyPackageBoundaryError $Code }
    if ($item.PSIsContainer) {
      try { $children = @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop) } catch { New-AIStudyBuddyPackageBoundaryError $Code }
      foreach ($child in $children) { $pending.Push($child.FullName) }
    }
  }
}

function New-AIStudyBuddyPackageBoundary {
  param(
    [Parameter(Mandatory)] [string]$RepoRoot,
    [string]$OutputRoot,
    [string[]]$AdditionalProtectedRoots = @()
  )
  $repoPath = Get-AIStudyBuddyPackageBoundaryFullPath -Path $RepoRoot -Code 'PACKAGE_OUTPUT_INVALID'
  if ([string]::IsNullOrWhiteSpace($OutputRoot)) { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_OUTPUT_EMPTY' }
  if ($OutputRoot -notmatch '^(?:[A-Za-z]:[\\/]|\\\\)') { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_OUTPUT_INVALID' }
  $outputPath = Get-AIStudyBuddyPackageBoundaryFullPath -Path $OutputRoot -Code 'PACKAGE_OUTPUT_INVALID'
  $outputItem = Get-AIStudyBuddyPackageBoundaryDirectory -Path $outputPath -MissingCode 'PACKAGE_OUTPUT_INVALID' -ReparseCode 'PACKAGE_OUTPUT_REPARSE_POINT'
  $outputPath = $outputItem.FullName
  $volumeRoot = [IO.Path]::GetPathRoot($outputPath)
  if ([string]::Equals($outputPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), $volumeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) {
    New-AIStudyBuddyPackageBoundaryError 'PACKAGE_OUTPUT_PROTECTED_ROOT'
  }
  $protectedRoots = @($repoPath, [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile), $env:APP_DATA_ROOT) + @($AdditionalProtectedRoots)
  foreach ($protectedRoot in $protectedRoots) {
    if ([string]::IsNullOrWhiteSpace($protectedRoot)) { continue }
    $protectedPath = Get-AIStudyBuddyPackageBoundaryFullPath -Path $protectedRoot -Code 'PACKAGE_OUTPUT_PROTECTED_ROOT'
    if ([string]::Equals($outputPath, $protectedPath, [StringComparison]::OrdinalIgnoreCase) -or
        (Test-AIStudyBuddyPackageBoundaryDescendant -Candidate $outputPath -Root $protectedPath) -or
        (Test-AIStudyBuddyPackageBoundaryDescendant -Candidate $protectedPath -Root $outputPath)) {
      New-AIStudyBuddyPackageBoundaryError 'PACKAGE_OUTPUT_PROTECTED_ROOT'
    }
  }
  try { $existing = @(Get-ChildItem -LiteralPath $outputPath -Force -ErrorAction Stop) } catch { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_OUTPUT_INVALID' }
  if ($existing.Count -ne 0) { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_OUTPUT_NOT_EMPTY' }
  $stageParent = Join-Path $outputPath '.aistudybuddy-package-staging'
  $operationId = [guid]::NewGuid().ToString('N')
  $stagePath = Join-Path $stageParent $operationId
  try {
    New-Item -ItemType Directory -Path $stagePath -Force -ErrorAction Stop | Out-Null
    $stageItem = Get-AIStudyBuddyPackageBoundaryDirectory -Path $stagePath -MissingCode 'PACKAGE_STAGE_CREATE_FAILED' -ReparseCode 'PACKAGE_STAGE_REPARSE_POINT'
  } catch {
    New-AIStudyBuddyPackageBoundaryError 'PACKAGE_STAGE_CREATE_FAILED'
  }
  return [pscustomobject]@{ OutputRoot = $outputPath; StageParent = $stageParent; StagePath = $stageItem.FullName; OperationId = $operationId }
}

function Remove-AIStudyBuddyPackageBoundaryStage {
  param([Parameter(Mandatory)] [pscustomobject]$Boundary)
  $outputPath = Get-AIStudyBuddyPackageBoundaryFullPath -Path ([string]$Boundary.OutputRoot) -Code 'PACKAGE_DELETE_TARGET_INVALID'
  $stageParent = Get-AIStudyBuddyPackageBoundaryFullPath -Path ([string]$Boundary.StageParent) -Code 'PACKAGE_DELETE_TARGET_INVALID'
  $stagePath = Get-AIStudyBuddyPackageBoundaryFullPath -Path ([string]$Boundary.StagePath) -Code 'PACKAGE_DELETE_TARGET_INVALID'
  $operationId = [string]$Boundary.OperationId
  if ([string]::IsNullOrWhiteSpace($operationId) -or
      -not [string]::Equals((Split-Path $stageParent -Leaf), '.aistudybuddy-package-staging', [StringComparison]::Ordinal) -or
      -not [string]::Equals((Split-Path $stagePath -Leaf), $operationId, [StringComparison]::OrdinalIgnoreCase) -or
      -not (Test-AIStudyBuddyPackageBoundaryDescendant -Candidate $stageParent -Root $outputPath) -or
      -not (Test-AIStudyBuddyPackageBoundaryDescendant -Candidate $stagePath -Root $stageParent)) {
    New-AIStudyBuddyPackageBoundaryError 'PACKAGE_DELETE_TARGET_INVALID'
  }
  if (-not (Test-Path -LiteralPath $stagePath)) { return }
  Assert-AIStudyBuddyPackageTreeWithoutReparsePoints -Root $stagePath -Code 'PACKAGE_DELETE_TARGET_REPARSE_POINT'
  try { Remove-Item -LiteralPath $stagePath -Recurse -Force -ErrorAction Stop } catch { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_STAGE_DELETE_FAILED' }
  if (Test-Path -LiteralPath $stageParent) {
    try {
      $remaining = @(Get-ChildItem -LiteralPath $stageParent -Force -ErrorAction Stop)
      if ($remaining.Count -ne 0) { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_DELETE_TARGET_INVALID' }
      Remove-Item -LiteralPath $stageParent -Force -ErrorAction Stop
    } catch {
      New-AIStudyBuddyPackageBoundaryError 'PACKAGE_STAGE_DELETE_FAILED'
    }
  }
}

function Assert-AIStudyBuddyPackageStagingContents {
  param([Parameter(Mandatory)] [pscustomobject]$Boundary)
  $stagePath = Get-AIStudyBuddyPackageBoundaryFullPath -Path ([string]$Boundary.StagePath) -Code 'PACKAGE_CONTENTS_INVALID'
  if (-not (Test-Path -LiteralPath $stagePath -PathType Container)) { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_CONTENTS_INVALID' }
  Assert-AIStudyBuddyPackageTreeWithoutReparsePoints -Root $stagePath -Code 'PACKAGE_CONTENTS_REPARSE_POINT'
  $forbiddenNames = @('.git', 'node_modules', 'logs', 'tmp', 'models', 'backups', 'runtime', '.env', '.env.local', 'production.env')
  try { $items = @(Get-ChildItem -LiteralPath $stagePath -Recurse -Force -ErrorAction Stop) } catch { New-AIStudyBuddyPackageBoundaryError 'PACKAGE_CONTENTS_INVALID' }
  foreach ($item in $items) {
    if ($forbiddenNames -contains $item.Name -or $item.Name -match '\.(?:sqlite|sqlite3|db|log)$') {
      New-AIStudyBuddyPackageBoundaryError 'PACKAGE_CONTENTS_FORBIDDEN'
    }
  }
}
Export-ModuleMember -Function *-AIStudyBuddy*, Get-NodeVersionInfo, Get-PythonVersionInfo, Import-AIStudyBuddyEnvFile
