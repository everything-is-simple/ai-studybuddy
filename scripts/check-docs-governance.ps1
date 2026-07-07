<#
.SYNOPSIS
  Checks AI StudyBuddy documentation governance rules.

.DESCRIPTION
  Run from the repository root. This script enforces the active-doc mechanism:
  - formal docs must use numeric Chinese+English names;
  - active docs must be listed in docs/00-*-Index.md;
  - removed draft document names must not reappear as files;
  - reserved docs 08-12 must be indexed if created.
#>

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DocsRoot = Join-Path $RepoRoot 'docs'
$IndexFile = Get-ChildItem -LiteralPath $DocsRoot -File -Filter '00-*-Index.md' | Select-Object -First 1

if (-not $IndexFile) {
  throw 'Missing document index: docs/00-*-Index.md'
}

$IndexText = Get-Content -Raw -LiteralPath $IndexFile.FullName -Encoding UTF8
$Errors = New-Object System.Collections.Generic.List[string]

function Add-DocError([string]$Message) {
  $script:Errors.Add($Message) | Out-Null
}

# 1. Active Markdown docs must follow NN-...-English-Title.md style.
$Docs = Get-ChildItem -LiteralPath $DocsRoot -Recurse -File -Filter '*.md'
$NamePattern = '^\d{2}-.+-[A-Za-z0-9][A-Za-z0-9-]*\.md$'
foreach ($Doc in $Docs) {
  if ($Doc.Name -notmatch $NamePattern) {
    Add-DocError "Bad doc name: $($Doc.FullName). Use NN-CN-English-Title.md"
  }
}

# 2. Every active doc must be registered in the index by file name.
foreach ($Doc in $Docs) {
  if ($IndexText -notlike "*$($Doc.Name)*") {
    Add-DocError "Doc is not registered in index: $($Doc.FullName)"
  }
}

# 3. Removed draft documents must not exist in active docs.
$RemovedDraftNames = @(
  'ARCHITECTURE.md',
  'backend-guidelines.md',
  'buglist.md',
  'dev-rules.md',
  'frontend-guidelines.md',
  'lessons.md',
  'test-plan.md',
  'tutorial-one-sentence-ai-app.md',
  'PRD.md',
  'todo-list.md',
  '_index.md',
  'open-source-foundation.md',
  'dev-environment.md',
  'design-docs-strategy.md',
  'scenario-systems.md'
)
foreach ($Name in $RemovedDraftNames) {
  $Hits = Get-ChildItem -LiteralPath $DocsRoot -Recurse -File -Filter $Name -ErrorAction SilentlyContinue
  foreach ($File in $Hits) {
    Add-DocError "Removed draft name exists in active docs: $($File.FullName)"
  }
}

# 4. If reserved future docs 08-12 are created, they must be indexed.
foreach ($Prefix in @('08-', '09-', '10-', '11-', '12-')) {
  $Hits = Get-ChildItem -LiteralPath $DocsRoot -File -Filter "$Prefix*.md" -ErrorAction SilentlyContinue
  foreach ($File in $Hits) {
    if ($IndexText -notlike "*$($File.Name)*") {
      Add-DocError "Reserved doc exists but is not indexed: $($File.FullName)"
    }
  }
}

# 5. The index must contain reserved-doc governance markers.
$RequiredMarkers = @('08-', '09-', '10-', '11-', '12-', 'check-docs-governance.ps1')
foreach ($Marker in $RequiredMarkers) {
  if ($IndexText -notlike "*$Marker*") {
    Add-DocError "Index missing governance marker: $Marker"
  }
}

if ($Errors.Count -gt 0) {
  Write-Host 'Documentation governance check failed:' -ForegroundColor Red
  foreach ($Err in $Errors) {
    Write-Host " - $Err" -ForegroundColor Red
  }
  exit 1
}

Write-Host 'Documentation governance check passed.' -ForegroundColor Green
