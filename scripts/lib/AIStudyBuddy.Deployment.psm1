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

function New-AIStudyBuddyDataBoundaryError {
  param([Parameter(Mandatory)] [string]$Code)
  throw [System.InvalidOperationException]::new($Code)
}

function Get-AIStudyBuddyDataBoundaryFullPath {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Code
  )
  if ([string]::IsNullOrWhiteSpace($Path)) { New-AIStudyBuddyDataBoundaryError $Code }
  $candidate = $Path.Trim()
  if ($candidate -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+)') { New-AIStudyBuddyDataBoundaryError $Code }
  if ($candidate -match '(^|[\\/])\.{1,2}([\\/]|$)') { New-AIStudyBuddyDataBoundaryError $Code }
  try { return [IO.Path]::GetFullPath($candidate) } catch { New-AIStudyBuddyDataBoundaryError $Code }
}

function Test-AIStudyBuddyDataPathEqualOrDescendant {
  param(
    [Parameter(Mandatory)] [string]$Candidate,
    [Parameter(Mandatory)] [string]$Root
  )
  $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  if ([string]::IsNullOrWhiteSpace($candidatePath) -or [string]::IsNullOrWhiteSpace($rootPath)) { return $false }
  if ([string]::Equals($candidatePath, $rootPath, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  return $candidatePath.StartsWith($rootPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Assert-AIStudyBuddyDataPathWithoutReparsePoints {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Code
  )
  $current = [IO.Path]::GetFullPath($Path)
  while (-not (Test-Path -LiteralPath $current)) {
    $parent = Split-Path -Path $current -Parent
    if ([string]::IsNullOrWhiteSpace($parent) -or [string]::Equals($parent, $current, [StringComparison]::OrdinalIgnoreCase)) { New-AIStudyBuddyDataBoundaryError $Code }
    $current = $parent
  }
  while ($true) {
    try { $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop } catch { New-AIStudyBuddyDataBoundaryError $Code }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { New-AIStudyBuddyDataBoundaryError $Code }
    $parent = Split-Path -Path $current -Parent
    if ([string]::IsNullOrWhiteSpace($parent) -or [string]::Equals($parent, $current, [StringComparison]::OrdinalIgnoreCase)) { break }
    $current = $parent
  }
}

function Assert-AIStudyBuddyDataExistingDirectory {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Code
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { New-AIStudyBuddyDataBoundaryError $Code }
  Assert-AIStudyBuddyDataPathWithoutReparsePoints -Path $Path -Code $Code
  try { return Get-Item -LiteralPath $Path -Force -ErrorAction Stop } catch { New-AIStudyBuddyDataBoundaryError $Code }
}

function Assert-AIStudyBuddyDataRegularFile {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$Code
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { New-AIStudyBuddyDataBoundaryError $Code }
  Assert-AIStudyBuddyDataPathWithoutReparsePoints -Path $Path -Code $Code
  try { $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop } catch { New-AIStudyBuddyDataBoundaryError $Code }
  if ($item.PSIsContainer -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { New-AIStudyBuddyDataBoundaryError $Code }
  return $item
}

function Assert-AIStudyBuddyDataTreeWithoutReparsePoints {
  param(
    [Parameter(Mandatory)] [string]$Root,
    [Parameter(Mandatory)] [string]$Code
  )
  Assert-AIStudyBuddyDataExistingDirectory -Path $Root -Code $Code | Out-Null
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($Root)
  while ($pending.Count -gt 0) {
    $current = $pending.Pop()
    try { $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop } catch { New-AIStudyBuddyDataBoundaryError $Code }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { New-AIStudyBuddyDataBoundaryError $Code }
    if ($item.PSIsContainer) {
      try { $children = @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop) } catch { New-AIStudyBuddyDataBoundaryError $Code }
      foreach ($child in $children) { $pending.Push($child.FullName) }
    }
  }
}

function Get-AIStudyBuddyDataProtectedRoots {
  param(
    [Parameter(Mandatory)] [hashtable]$Paths,
    [string[]]$AdditionalProtectedRoots = @()
  )
  $roots = @(
    $Paths.Root, $Paths.App, $Paths.Config, $Paths.Data, $Paths.Logs, $Paths.Backups,
    $Paths.Tmp, $Paths.Models, $Paths.Runtime, (Split-Path -Path $Paths.PidFile -Parent),
    [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile), $env:APP_DATA_ROOT
  ) + @($AdditionalProtectedRoots)
  return @($roots | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
}

function Assert-AIStudyBuddyExternalDataOutputRoot {
  param(
    [Parameter(Mandatory)] [string]$OutputRoot,
    [Parameter(Mandatory)] [hashtable]$Paths,
    [string[]]$AdditionalProtectedRoots = @(),
    [Parameter(Mandatory)] [string]$InvalidCode,
    [Parameter(Mandatory)] [string]$ProtectedCode,
    [Parameter(Mandatory)] [string]$ReparseCode,
    [Parameter(Mandatory)] [string]$CrossVolumeCode
  )
  $outputPath = Get-AIStudyBuddyDataBoundaryFullPath -Path $OutputRoot -Code $InvalidCode
  $volumeRoot = [IO.Path]::GetPathRoot($outputPath)
  if ([string]::Equals($outputPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), $volumeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { New-AIStudyBuddyDataBoundaryError $ProtectedCode }
  if (-not (Test-Path -LiteralPath $outputPath -PathType Container)) { New-AIStudyBuddyDataBoundaryError $InvalidCode }
  Assert-AIStudyBuddyDataPathWithoutReparsePoints -Path $outputPath -Code $ReparseCode
  try { $item = Get-Item -LiteralPath $outputPath -Force -ErrorAction Stop } catch { New-AIStudyBuddyDataBoundaryError $InvalidCode }
  foreach ($protectedRoot in @(Get-AIStudyBuddyDataProtectedRoots -Paths $Paths -AdditionalProtectedRoots $AdditionalProtectedRoots)) {
    try { $protectedPath = Get-AIStudyBuddyDataBoundaryFullPath -Path $protectedRoot -Code $ProtectedCode } catch { New-AIStudyBuddyDataBoundaryError $ProtectedCode }
    $outputInsideProtected = Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $outputPath -Root $protectedPath
    $protectedInsideOutput = Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $protectedPath -Root $outputPath
    if ($outputInsideProtected -or $protectedInsideOutput) { New-AIStudyBuddyDataBoundaryError $ProtectedCode }
  }
  $dataVolume = [IO.Path]::GetPathRoot((Get-AIStudyBuddyDataBoundaryFullPath -Path $Paths.Data -Code $ProtectedCode))
  if (-not [string]::Equals($volumeRoot, $dataVolume, [StringComparison]::OrdinalIgnoreCase)) { New-AIStudyBuddyDataBoundaryError $CrossVolumeCode }
  return $item.FullName
}

function Get-AIStudyBuddyDataBackupName {
  param([Parameter(Mandatory)] [string]$Name, [Parameter(Mandatory)] [string]$Code)
  if ([string]::IsNullOrWhiteSpace($Name) -or $Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' -or $Name -in @('.', '..')) { New-AIStudyBuddyDataBoundaryError $Code }
  return $Name
}

function Get-AIStudyBuddyDataFiles {
  param(
    [Parameter(Mandatory)] [string]$DataRoot,
    [Parameter(Mandatory)] [string]$Code
  )
  $root = (Assert-AIStudyBuddyDataExistingDirectory -Path $DataRoot -Code $Code).FullName
  $files = [System.Collections.Generic.List[object]]::new()
  $database = Join-Path $root 'studybuddy.db'
  if (Test-Path -LiteralPath $database) {
    $item = Assert-AIStudyBuddyDataRegularFile -Path $database -Code $Code
    $files.Add([pscustomobject]@{ FullName = $item.FullName; RelativePath = 'studybuddy.db'; Bytes = [int64]$item.Length })
  }
  $semesters = Join-Path $root 'semesters'
  if (Test-Path -LiteralPath $semesters) {
    Assert-AIStudyBuddyDataExistingDirectory -Path $semesters -Code $Code | Out-Null
    $pending = [System.Collections.Generic.Stack[string]]::new()
    $pending.Push($semesters)
    while ($pending.Count -gt 0) {
      $current = $pending.Pop()
      try { $children = @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop) } catch { New-AIStudyBuddyDataBoundaryError $Code }
      foreach ($child in $children) {
        if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { New-AIStudyBuddyDataBoundaryError $Code }
        if ($child.PSIsContainer) { $pending.Push($child.FullName); continue }
        $item = Assert-AIStudyBuddyDataRegularFile -Path $child.FullName -Code $Code
        $relative = Get-AIStudyBuddyRelativePath -BasePath $root -TargetPath $item.FullName
        $files.Add([pscustomobject]@{ FullName = $item.FullName; RelativePath = $relative.Replace('\','/'); Bytes = [int64]$item.Length })
      }
    }
  }
  return @($files | Sort-Object RelativePath)
}

function Get-AIStudyBuddyDataPayloadFiles {
  param(
    [Parameter(Mandatory)] [string]$PayloadRoot,
    [Parameter(Mandatory)] [string]$Code
  )
  $root = (Assert-AIStudyBuddyDataExistingDirectory -Path $PayloadRoot -Code $Code).FullName
  $files = [System.Collections.Generic.List[object]]::new()
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($root)
  while ($pending.Count -gt 0) {
    $current = $pending.Pop()
    try { $children = @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop) } catch { New-AIStudyBuddyDataBoundaryError $Code }
    foreach ($child in $children) {
      if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { New-AIStudyBuddyDataBoundaryError $Code }
      if ($child.PSIsContainer) { $pending.Push($child.FullName); continue }
      $item = Assert-AIStudyBuddyDataRegularFile -Path $child.FullName -Code $Code
      try { $relative = Get-AIStudyBuddyRelativePath -BasePath $root -TargetPath $item.FullName } catch { New-AIStudyBuddyDataBoundaryError $Code }
      $files.Add([pscustomobject]@{ FullName = $item.FullName; RelativePath = $relative.Replace('\','/'); Bytes = [int64]$item.Length })
    }
  }
  return @($files | Sort-Object RelativePath)
}

function Get-AIStudyBuddyDataShortFingerprint {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return 'unknown' }
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return (-join ($hash | ForEach-Object { $_.ToString('x2') })).Substring(0, 12)
}

function Get-AIStudyBuddyAclEvidence {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [Parameter(Mandatory)] [string]$LogicalCategory
  )
  if ([string]::IsNullOrWhiteSpace($LogicalCategory)) { New-AIStudyBuddyDataBoundaryError 'ACL_CATEGORY_INVALID' }
  try { Assert-AIStudyBuddyDataExistingDirectory -Path $Path -Code 'ACL_PATH_INVALID' | Out-Null } catch {
    return [pscustomobject]@{ Status = 'UNKNOWN'; Reason = 'ACL_PATH_INVALID'; LogicalCategory = $LogicalCategory; OwnerKind = 'UNKNOWN'; OwnerFingerprint = 'unknown'; InheritanceProtected = $null; Rules = @() }
  }
  try {
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    $owner = [string]$acl.Owner
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object {
      $identity = [string]$_.IdentityReference.Value
      [pscustomobject]@{
        SubjectKind = if ($identity -match '^S-\d-') { 'SID' } elseif ($identity -match '\\') { 'ACCOUNT' } else { 'UNKNOWN' }
        SubjectFingerprint = Get-AIStudyBuddyDataShortFingerprint $identity
        AccessType = if ([string]$_.AccessControlType -eq 'Deny') { 'DENY' } elseif ([string]$_.AccessControlType -eq 'Allow') { 'ALLOW' } else { 'UNKNOWN' }
        IsInherited = [bool]$_.IsInherited
      }
    })
    return [pscustomobject]@{
      Status = 'PASS'; Reason = 'ACL_READABLE'; LogicalCategory = $LogicalCategory
      OwnerKind = if ($owner -match '^S-\d-') { 'SID' } elseif ($owner -match '\\') { 'ACCOUNT' } else { 'UNKNOWN' }
      OwnerFingerprint = Get-AIStudyBuddyDataShortFingerprint $owner
      InheritanceProtected = [bool]$acl.AreAccessRulesProtected; Rules = $rules
    }
  } catch {
    return [pscustomobject]@{ Status = 'UNKNOWN'; Reason = 'ACL_UNREADABLE'; LogicalCategory = $LogicalCategory; OwnerKind = 'UNKNOWN'; OwnerFingerprint = 'unknown'; InheritanceProtected = $null; Rules = @() }
  }
}

function Test-AIStudyBuddyBackupRelativePath {
  param([Parameter(Mandatory)] [string]$RelativePath)
  if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath) -or $RelativePath -match '(^|[\\/])\.{1,2}([\\/]|$)') { return $null }
  $normalized = $RelativePath.Replace('/','\')
  if ($normalized -notmatch '^(?:studybuddy\.db|semesters\\[^\\]+(?:\\[^\\]+)*)$') { return $null }
  return $normalized
}

function Get-AIStudyBuddyValidatedBackup {
  param([Parameter(Mandatory)] [string]$BackupPath)
  $backup = Get-AIStudyBuddyDataBoundaryFullPath -Path $BackupPath -Code 'RESTORE_BACKUP_INVALID'
  Assert-AIStudyBuddyDataTreeWithoutReparsePoints -Root $backup -Code 'RESTORE_BACKUP_REPARSE_POINT'
  $manifestPath = Join-Path $backup 'manifest.json'
  $payload = Join-Path $backup 'payload'
  Assert-AIStudyBuddyDataRegularFile -Path $manifestPath -Code 'RESTORE_MANIFEST_INVALID' | Out-Null
  Assert-AIStudyBuddyDataExistingDirectory -Path $payload -Code 'RESTORE_PAYLOAD_INVALID' | Out-Null
  try { $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop } catch { New-AIStudyBuddyDataBoundaryError 'RESTORE_MANIFEST_INVALID' }
  $propertyNames = @($manifest.PSObject.Properties.Name)
  if ($manifest.format -ne 'ai-studybuddy-data-backup-v2' -or $null -eq $manifest.files -or @($propertyNames | Where-Object { $_ -notin @('format','createdAt','files') }).Count -ne 0) { New-AIStudyBuddyDataBoundaryError 'RESTORE_MANIFEST_INVALID' }
  $entries = @($manifest.files)
  if ($entries.Count -eq 0 -or $entries.Count -gt 10000) { New-AIStudyBuddyDataBoundaryError 'RESTORE_MANIFEST_INVALID' }
  $seen = @{}; $validated = [System.Collections.Generic.List[object]]::new(); [int64]$totalBytes = 0
  foreach ($entry in $entries) {
    $relative = Test-AIStudyBuddyBackupRelativePath ([string]$entry.path)
    if ($null -eq $relative -or $seen.ContainsKey($relative.ToUpperInvariant()) -or [string]$entry.sha256 -notmatch '^[a-fA-F0-9]{64}$') { New-AIStudyBuddyDataBoundaryError 'RESTORE_MANIFEST_INVALID' }
    try { [int64]$bytes = [int64]$entry.bytes } catch { New-AIStudyBuddyDataBoundaryError 'RESTORE_MANIFEST_INVALID' }
    if ($bytes -lt 0 -or $totalBytes -gt (2147483648 - $bytes)) { New-AIStudyBuddyDataBoundaryError 'RESTORE_MANIFEST_INVALID' }
    $source = [IO.Path]::GetFullPath((Join-Path $payload $relative))
    if (-not (Test-AIStudyBuddyDataPathEqualOrDescendant -Candidate $source -Root $payload)) { New-AIStudyBuddyDataBoundaryError 'RESTORE_MANIFEST_INVALID' }
    $item = Assert-AIStudyBuddyDataRegularFile -Path $source -Code 'RESTORE_PAYLOAD_INVALID'
    if ([int64]$item.Length -ne $bytes) { New-AIStudyBuddyDataBoundaryError 'RESTORE_PAYLOAD_INVALID' }
    try { $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant() } catch { New-AIStudyBuddyDataBoundaryError 'RESTORE_PAYLOAD_INVALID' }
    if ($hash -ne ([string]$entry.sha256).ToLowerInvariant()) { New-AIStudyBuddyDataBoundaryError 'RESTORE_PAYLOAD_INVALID' }
    $seen[$relative.ToUpperInvariant()] = $true; $totalBytes += $bytes
    $validated.Add([pscustomobject]@{ RelativePath = $relative; SourcePath = $source; Bytes = $bytes; Sha256 = $hash })
  }
  $payloadFiles = Get-AIStudyBuddyDataPayloadFiles -PayloadRoot $payload -Code 'RESTORE_PAYLOAD_INVALID'
  if ($payloadFiles.Count -ne $validated.Count) { New-AIStudyBuddyDataBoundaryError 'RESTORE_PAYLOAD_INVALID' }
  foreach ($payloadFile in $payloadFiles) {
    $payloadRelative = Test-AIStudyBuddyBackupRelativePath $payloadFile.RelativePath
    if ($null -eq $payloadRelative -or -not $seen.ContainsKey($payloadRelative.ToUpperInvariant())) { New-AIStudyBuddyDataBoundaryError 'RESTORE_PAYLOAD_INVALID' }
  }
  return [pscustomobject]@{ BackupPath = $backup; PayloadPath = $payload; Entries = @($validated); TotalBytes = $totalBytes }
}

Export-ModuleMember -Function *-AIStudyBuddy*, Get-NodeVersionInfo, Get-PythonVersionInfo, Import-AIStudyBuddyEnvFile
