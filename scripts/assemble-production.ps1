[CmdletBinding()]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendDist = Join-Path $repoRoot 'packages\backend\dist'
$frontendDist = Join-Path $repoRoot 'packages\frontend\dist'
if (-not $SkipBuild) {
  Push-Location $repoRoot
  try {
    pnpm -r --filter backend run build; if ($LASTEXITCODE) { throw "Backend build failed: $LASTEXITCODE" }
    pnpm -r --filter @ai-studybuddy/frontend run build; if ($LASTEXITCODE) { throw "Frontend build failed: $LASTEXITCODE" }
  } finally { Pop-Location }
}
if (-not (Test-Path (Join-Path $frontendDist 'index.html'))) { throw "Frontend dist is missing: $frontendDist" }
$public = Join-Path $backendDist 'public'
New-Item -ItemType Directory -Force -Path $public | Out-Null
Get-ChildItem -LiteralPath $public -Force | Remove-Item -Recurse -Force
Get-ChildItem -LiteralPath $frontendDist -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $public -Recurse -Force }
$package = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
[ordered]@{ version=$package.version; builtAt=(Get-Date).ToUniversalTime().ToString('o'); node=(node --version).Trim(); frontend='packages/frontend/dist'; backend='packages/backend/dist'; staticRoot='packages/backend/dist/public' } | ConvertTo-Json | Set-Content (Join-Path $backendDist 'deployment-manifest.json') -Encoding utf8
Write-Output "Production assets assembled at $public"
