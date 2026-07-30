[CmdletBinding()]
param([string]$OutputRoot, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$repoRoot = $null
$boundary = $null
function Get-PackageBoundaryErrorCode {
  param([System.Management.Automation.ErrorRecord]$ErrorRecord)
  $message = if ($ErrorRecord -and $ErrorRecord.Exception) { [string]$ErrorRecord.Exception.Message } else { '' }
  if ($message -match '^PACKAGE_[A-Z_]+$') { return $message }
  return 'PACKAGE_OPERATION_FAILED'
}
try {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  Import-Module (Join-Path $repoRoot 'scripts\lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
  $boundary = New-AIStudyBuddyPackageBoundary -RepoRoot $repoRoot -OutputRoot $OutputRoot
  $OutputRoot = $boundary.OutputRoot
  $stage = $boundary.StagePath
  if (-not $SkipBuild) {
    Push-Location $repoRoot
    try { & powershell -ExecutionPolicy Bypass -File (Join-Path $repoRoot 'scripts\assemble-production.ps1'); if ($LASTEXITCODE) { throw 'PACKAGE_BUILD_FAILED' } }
    finally { Pop-Location }
  }
  $backendDist = Join-Path $repoRoot 'packages\backend\dist'
  if (-not (Test-Path -LiteralPath (Join-Path $backendDist 'server.js') -PathType Leaf)) { throw 'PACKAGE_BUILD_OUTPUT_MISSING' }
  if (-not (Test-Path -LiteralPath (Join-Path $backendDist 'public\index.html') -PathType Leaf)) { throw 'PACKAGE_BUILD_OUTPUT_MISSING' }
  $app = Join-Path $stage 'app'; $backend = Join-Path $app 'backend'; $scripts = Join-Path $stage 'scripts'; $deployment = Join-Path $stage 'deployment'
  New-Item -ItemType Directory -Force -Path $backend,$scripts,$deployment | Out-Null
  Get-ChildItem -LiteralPath $backendDist -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $backend -Recurse -Force }
  $backendPackage = Get-Content (Join-Path $repoRoot 'packages\backend\package.json') -Raw | ConvertFrom-Json
  $backendPackage.main = './server.js'
  $backendPackage.scripts = @{ start = 'node server.js' }
  $backendPackage.devDependencies = @{}
  $backendPackage.dependencies.'@ai-studybuddy/shared' = 'file:../shared'
  $backendPackage | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $backend 'package.json') -Encoding utf8
  Copy-Item -LiteralPath (Join-Path $repoRoot 'deployment\backend-package-lock.json') -Destination (Join-Path $backend 'package-lock.json') -Force
  $shared = Join-Path $app 'shared'; New-Item -ItemType Directory -Force -Path $shared | Out-Null
  $sharedDist = Join-Path $repoRoot 'packages\shared\dist'
  if (-not (Test-Path -LiteralPath (Join-Path $sharedDist 'index.js') -PathType Leaf)) { throw 'PACKAGE_BUILD_OUTPUT_MISSING' }
  Get-ChildItem -LiteralPath $sharedDist -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $shared -Recurse -Force }
  $sharedPackage = Get-Content (Join-Path $repoRoot 'packages\shared\package.json') -Raw | ConvertFrom-Json
  $sharedPackage.main = './index.js'; $sharedPackage.types = $null; $sharedPackage.devDependencies = @{}
  $sharedPackage | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $shared 'package.json') -Encoding utf8
  Copy-Item -LiteralPath (Join-Path $repoRoot 'packages\backend\requirements-ocr.txt') -Destination (Join-Path $app 'requirements-ocr.txt') -Force
  $scriptNames = @('bootstrap-runtime.ps1','start-production.ps1','stop-production.ps1','check-installation.ps1','backup-data.ps1','restore-data.ps1','test-data-integrity.ps1','register-parent-report-task.ps1','unregister-parent-report-task.ps1','run-parent-report-task.ps1','test-ocr-runtime.ps1')
  foreach ($name in $scriptNames) { Copy-Item -LiteralPath (Join-Path $repoRoot "scripts\$name") -Destination $scripts -Force }
  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\lib') -Destination $scripts -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot 'deployment\runtime-compatibility.json') -Destination $deployment -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot 'deployment\runtime-compatibility.psd1') -Destination $deployment -Force
  if (Test-Path -LiteralPath (Join-Path $repoRoot 'deployment\README-Windows.md') -PathType Leaf) {
    Copy-Item -LiteralPath (Join-Path $repoRoot 'deployment\README-Windows.md') -Destination $deployment -Force
  }
  $packageJson = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
  $manifest = [ordered]@{ format='ai-studybuddy-windows-package-v1'; version=$packageJson.version; builtAt=(Get-Date).ToUniversalTime().ToString('o'); includes=@('app/backend','app/shared','app/requirements-ocr.txt','scripts','deployment'); excludes=@('.git','node_modules','.env.local','real data','credentials','logs','tmp','models','WSL venv','Playwright evidence') }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $stage 'deployment-manifest.json') -Encoding utf8
  $readme = @(
    'AI StudyBuddy Windows deployment package',
    '',
    '1. Install a supported Node.js LTS and x64 Python.',
    '2. Run scripts\bootstrap-runtime.ps1 with an explicit install root.',
    '3. Run scripts\check-installation.ps1, then scripts\start-production.ps1.',
    '4. Keep data, logs, backups and models outside this package.',
    '5. Do not add .env.local, credentials, student data or cache directories to this package.',
    '6. Configure AI/SMTP/Feishu only through the Settings center; do not put secrets in files, Git or backups.',
    '7. Stop with scripts\stop-production.ps1 before backup/upgrade.',
    '',
    'Docker/WSL are optional verification runtimes and are not required for this product package.',
    'The package does not open Windows Firewall rules and does not bind to a LAN address.'
  )
  $readme | Set-Content -LiteralPath (Join-Path $stage 'README-Windows.md') -Encoding utf8
  Assert-AIStudyBuddyPackageStagingContents -Boundary $boundary
  Get-ChildItem -LiteralPath $stage -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $OutputRoot -Recurse -Force }
  $zip = "$OutputRoot.zip"
  if (Test-Path -LiteralPath $zip) { throw 'PACKAGE_ARCHIVE_ALREADY_EXISTS' }
  $archiveItems = @(Get-ChildItem -LiteralPath $OutputRoot -Force | Where-Object { $_.Name -ne '.aistudybuddy-package-staging' })
  if ($archiveItems.Count -eq 0) { throw 'PACKAGE_CONTENTS_INVALID' }
  Compress-Archive -Path $archiveItems.FullName -DestinationPath $zip -CompressionLevel Optimal -ErrorAction Stop
  Write-Output 'PACKAGE_CREATED'
  Write-Output 'PACKAGE_ARCHIVE_CREATED'
} catch {
  [Console]::Error.WriteLine((Get-PackageBoundaryErrorCode $_))
  exit 1
} finally {
  if ($null -ne $boundary) {
    try { Remove-AIStudyBuddyPackageBoundaryStage -Boundary $boundary } catch { }
  }
}
