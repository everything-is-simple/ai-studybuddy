[CmdletBinding()]
param(
  [string]$InstallRoot,
  [string]$AppSource,
  [string]$PythonPath,
  [switch]$SkipNodeInstall,
  [switch]$SkipOcrInstall
)
$ErrorActionPreference = 'Stop'
$module = Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1'
Import-Module $module -Force -DisableNameChecking
$paths = Get-AIStudyBuddyPaths $InstallRoot
Ensure-AIStudyBuddyDirectories $paths

if ([string]::IsNullOrWhiteSpace($AppSource)) {
  $packageRoot = Split-Path $PSScriptRoot -Parent
  $candidate = Join-Path $packageRoot 'app'
  if (-not (Test-Path -LiteralPath $candidate -PathType Container)) {
    $candidate = Join-Path $packageRoot 'deployment-package\app'
  }
  if (Test-Path -LiteralPath $candidate -PathType Container) { $AppSource = $candidate }
}
if (-not [string]::IsNullOrWhiteSpace($AppSource)) {
  $source = [IO.Path]::GetFullPath($AppSource)
  if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "App source not found: $source" }
  if ($source.TrimEnd('\') -ne $paths.App.TrimEnd('\')) {
    Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $paths.App -Recurse -Force
    }
  }
}
$sourceScripts = [IO.Path]::GetFullPath($PSScriptRoot)
if ($sourceScripts.TrimEnd('\') -ne $paths.Scripts.TrimEnd('\')) {
  Get-ChildItem -LiteralPath $sourceScripts -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $paths.Scripts -Recurse -Force
  }
}
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'server.js') -PathType Leaf)) {
  throw "Backend runtime is missing: $($paths.Backend)\server.js"
}
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'package.json') -PathType Leaf)) {
  throw "Deployment backend package.json is missing: $($paths.Backend)\package.json"
}
if (-not (Test-Path -LiteralPath (Join-Path $paths.Backend 'package-lock.json') -PathType Leaf)) {
  throw "Deployment backend package-lock.json is missing: $($paths.Backend)\package-lock.json"
}

$node = Get-NodeVersionInfo
if ($null -eq $node) { throw 'Node.js is not available on PATH.' }
if (-not (Test-AIStudyBuddySupportedNodeVersion $node)) { throw "Verified Node.js major 24 is required; found $($node.Raw)." }
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -eq $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if ($null -eq $npm) { throw 'npm is required to install production Node dependencies on the use machine.' }
if (-not $SkipNodeInstall) {
  $npmCache = Join-Path $paths.Runtime 'npm-cache'
  New-Item -ItemType Directory -Force -Path $npmCache | Out-Null
  Push-Location $paths.Backend
  try {
    $installSucceeded = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      Write-Output "Installing production Node dependencies (attempt $attempt/3)..."
      & $npm.Source ci --omit=dev --no-audit --no-fund --fetch-retries=3 --fetch-timeout=120000 --cache $npmCache
      if ($LASTEXITCODE -eq 0) { $installSucceeded = $true; break }
      Write-Warning "npm ci failed on attempt $attempt with exit code $LASTEXITCODE."
      if ($attempt -lt 3) { Start-Sleep -Seconds (5 * $attempt) }
    }
    if (-not $installSucceeded) {
      throw 'Production Node dependency installation failed after 3 attempts. Native dependencies such as better-sqlite3 require a matching prebuilt download for the selected Node runtime, or local Visual Studio C++ Build Tools for fallback compilation. Retry with stable network and the verified Node runtime documented in deployment/runtime-compatibility.json.'
    }
  } finally { Pop-Location }
}
Push-Location $paths.Backend
try {
  $nodeImport = Invoke-AIStudyBuddyNodeRuntimeCheck -Check 'dependency-import'
  if (-not $nodeImport.Success) { throw "Production Node dependency import check failed. $($nodeImport.Error)" }
} finally { Pop-Location }

if ([string]::IsNullOrWhiteSpace($PythonPath)) {
  if (-not [string]::IsNullOrWhiteSpace($env:PYTHON_PATH)) { $PythonPath = $env:PYTHON_PATH }
  else {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) { $PythonPath = $pythonCommand.Source }
  }
}
if ([string]::IsNullOrWhiteSpace($PythonPath)) { throw 'Python 3.10-3.12 x64 is required. Pass -PythonPath.' }
$PythonPath = [IO.Path]::GetFullPath($PythonPath)
$py = Get-PythonVersionInfo $PythonPath
if ($null -eq $py -or $py.Major -ne 3 -or $py.Minor -lt 10 -or $py.Minor -gt 12) { throw "Unsupported Python runtime: $PythonPath" }
$pythonInfo = Invoke-AIStudyBuddyPythonRuntimeCheck -PythonPath $PythonPath -Check 'python-info'
if (-not $pythonInfo.Success -or [int]$pythonInfo.Data.bits -ne 64) { throw "Python x64 is required: $PythonPath. $($pythonInfo.Error)" }

if (-not (Test-Path -LiteralPath $paths.Venv -PathType Container)) {
  & $PythonPath -m venv $paths.Venv
  if ($LASTEXITCODE) { throw "venv creation failed: $LASTEXITCODE" }
}
$venvPython = Join-Path $paths.Venv 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) { throw "venv Python missing: $venvPython" }
$requirements = Join-Path $paths.App 'requirements-ocr.txt'
if (-not (Test-Path -LiteralPath $requirements -PathType Leaf)) {
  $requirements = Join-Path (Split-Path $PSScriptRoot -Parent) 'packages\backend\requirements-ocr.txt'
}
if (-not (Test-Path -LiteralPath $requirements -PathType Leaf)) { throw "OCR requirements file is missing: $requirements" }
if (-not $SkipOcrInstall) {
  & $venvPython -m pip install --disable-pip-version-check --no-input --no-cache-dir --timeout 60 --retries 2 --progress-bar off -r $requirements
  if ($LASTEXITCODE) { throw "OCR dependency installation failed: $LASTEXITCODE" }
}
$env:PYTHONDONTWRITEBYTECODE = '1'
$ocrImport = Invoke-AIStudyBuddyPythonRuntimeCheck -PythonPath $venvPython -Check 'ocr-import'
if (-not $ocrImport.Success) { throw "OCR dependency import check failed. $($ocrImport.Error)" }

if (-not (Test-Path -LiteralPath $paths.EnvFile -PathType Leaf)) {
  @(
    '# Generated by bootstrap-runtime.ps1. Non-secret runtime settings only.',
    "APP_DATA_ROOT=$($paths.Data)",
    'BACKEND_HOST=127.0.0.1',
    'BACKEND_PORT=3000',
    "FRONTEND_STATIC_ROOT=$($paths.Backend)\public",
    "PYTHON_PATH=$venvPython",
    'OCR_TIMEOUT_MS=60000',
    "OCR_TEMP_ROOT=$($paths.Tmp)\ocr",
    "OCR_CACHE_ROOT=$($paths.Models)\rapidocr",
    'AI_TIMEOUT_MS=60000',
    'CONFIG_ALLOWED_ORIGINS=http://127.0.0.1:3000',
    'AI_PROVIDERS=',
    'AI_BASE_URL=',
    'AI_MODEL=',
    'SMTP_HOST=',
    'SMTP_PORT=465',
    'SMTP_SECURE=true',
    'SMTP_USER=',
    'SMTP_TO=',
    'FEISHU_WEBHOOK_URL='
  ) | Set-Content -LiteralPath $paths.EnvFile -Encoding utf8
}
Ensure-AIStudyBuddyDirectories $paths
$envTemplate = Join-Path $paths.Config 'production.env.example'
$templateSource = Join-Path (Split-Path $PSScriptRoot -Parent) 'deployment\.env.production.example'
if (-not (Test-Path -LiteralPath $envTemplate) -and (Test-Path -LiteralPath $templateSource -PathType Leaf)) {
  Copy-Item -LiteralPath $templateSource -Destination $envTemplate -Force
}
Write-Output "Bootstrap ready: $($paths.Root)"
Write-Output "Node: $($node.Raw); Python: $($py.Raw) x64; venv: $venvPython"
Write-Output 'No AI/SMTP/Feishu secret was created or copied.'
