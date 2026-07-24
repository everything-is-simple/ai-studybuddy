[CmdletBinding()]
param([string]$PythonPath, [Parameter(Mandatory)] [string]$RuntimeRoot)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'lib\AIStudyBuddy.Deployment.psm1') -Force -DisableNameChecking
$root = [IO.Path]::GetFullPath($RuntimeRoot)
$ocrTmp = Join-Path $root 'tmp\ocr-smoke'
$cache = Join-Path $root 'models\rapidocr'
New-Item -ItemType Directory -Force -Path $ocrTmp,$cache | Out-Null
$workerCandidates = @(
  (Join-Path $PSScriptRoot '..\packages\backend\src\scripts\ocr-worker.py'),
  (Join-Path $PSScriptRoot '..\app\backend\scripts\ocr-worker.py'),
  (Join-Path $PSScriptRoot '..\backend\scripts\ocr-worker.py')
)
$worker = @($workerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
if (-not $worker) { throw "OCR worker not found. Checked: $($workerCandidates -join '; ')" }
$worker = [IO.Path]::GetFullPath($worker)
if ([string]::IsNullOrWhiteSpace($PythonPath)) { $PythonPath = $env:PYTHON_PATH }
if ([string]::IsNullOrWhiteSpace($PythonPath)) { $PythonPath = (Get-Command python -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) { throw "Python not found: $PythonPath" }
$ocrImport = Invoke-AIStudyBuddyPythonRuntimeCheck -PythonPath $PythonPath -Check 'ocr-import'
if (-not $ocrImport.Success) { throw "rapidocr_onnxruntime import failed. $($ocrImport.Error)" }
$env:OCR_CACHE_ROOT = $cache
$image = Join-Path $ocrTmp 'chinese.png'
$blank = Join-Path $ocrTmp 'blank.png'
$broken = Join-Path $ocrTmp 'broken.png'
$missing = Join-Path $ocrTmp 'missing.png'
$generator = Join-Path $ocrTmp 'generate-fixtures.py'
try {
  @'
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import sys

image_path, blank_path, broken_path = map(Path, sys.argv[1:4])
font = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 72)
image = Image.new('RGB', (1200, 240), 'white')
text = ''.join(chr(value) for value in (0x4eba, 0x5de5, 0x667a, 0x80fd, 0x5b66, 0x4e60, 0x52a9, 0x624b))
ImageDraw.Draw(image).text((40, 60), text, font=font, fill='black')
image.save(image_path)
Image.new('RGB', (400, 200), 'white').save(blank_path)
broken_path.write_bytes(b'not-an-image')
'@ | Set-Content -LiteralPath $generator -Encoding utf8
  & $PythonPath $generator $image $blank $broken
  if ($LASTEXITCODE) { throw 'Synthetic OCR image creation failed.' }
  function Invoke-Worker($path) {
    $raw = & $PythonPath $worker $path
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) { return ($raw -join [Environment]::NewLine) }
    throw "OCR Worker invocation failed: $path"
  }
  $cn = Invoke-Worker $image | ConvertFrom-Json
  if (-not $cn.ok -or [string]::IsNullOrWhiteSpace($cn.text) -or $cn.text -notmatch '[\u4e00-\u9fff]') { throw "Chinese OCR failed: $($cn | ConvertTo-Json -Compress)" }
  $empty = Invoke-Worker $blank | ConvertFrom-Json
  if (-not $empty.ok -or $empty.charCount -ne 0) { throw 'Blank image OCR contract failed.' }
  $bad = Invoke-Worker $broken | ConvertFrom-Json
  if ($bad.ok) { throw 'Broken image should fail.' }
  $notFound = Invoke-Worker $missing | ConvertFrom-Json
  if ($notFound.ok -or [string]::IsNullOrWhiteSpace($notFound.error)) { throw 'Missing image contract failed.' }
  $testCandidates = @(
    (Join-Path $PSScriptRoot '..\packages\backend\test\ocr-converter-runtime.test.mjs'),
    (Join-Path $PSScriptRoot '..\..\packages\backend\test\ocr-converter-runtime.test.mjs')
  )
  $nodeTest = @($testCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
  if ($nodeTest) {
    node --test $nodeTest
    if ($LASTEXITCODE) { throw 'OCR converter timeout/cleanup contract failed.' }
  } else {
    Write-Output 'Repository OCR converter timeout/cleanup test not present; worker smoke completed.'
  }
  Write-Output "OCR smoke passed with $($cn.text)"
} finally {
  Remove-Item -LiteralPath $ocrTmp -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $ocrTmp) { throw 'OCR smoke temporary directory was not cleaned.' }
}
$global:LASTEXITCODE = 0
