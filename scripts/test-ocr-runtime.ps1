[CmdletBinding()]
param([string]$PythonPath, [Parameter(Mandatory)] [string]$RuntimeRoot)
$ErrorActionPreference = 'Stop'
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
& $PythonPath -c 'import rapidocr_onnxruntime; print("OCR_IMPORT_OK")'
if ($LASTEXITCODE) { throw 'rapidocr_onnxruntime import failed.' }
$env:OCR_CACHE_ROOT = $cache
$image = Join-Path $ocrTmp 'chinese.png'
$blank = Join-Path $ocrTmp 'blank.png'
$broken = Join-Path $ocrTmp 'broken.png'
$missing = Join-Path $ocrTmp 'missing.png'
try {
  $pyCode = @"
from PIL import Image, ImageDraw, ImageFont
font = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 72)
img = Image.new('RGB', (1200, 240), 'white')
ImageDraw.Draw(img).text((40, 60), '人工智能学习助手', font=font, fill='black')
img.save(r'$image')
Image.new('RGB', (400, 200), 'white').save(r'$blank')
open(r'$broken', 'wb').write(b'not-an-image')
"@
  & $PythonPath -c $pyCode
  if ($LASTEXITCODE) { throw 'Synthetic OCR image creation failed.' }
  function Invoke-Worker($path) {
    $raw = & $PythonPath $worker $path
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) { return ($raw -join "`n") }
    throw "OCR Worker invocation failed: $path"
  }
  $cn = Invoke-Worker $image | ConvertFrom-Json
  if (-not $cn.ok -or [string]::IsNullOrWhiteSpace($cn.text) -or $cn.text -notmatch '[\u4e00-\u9fff]') { throw "Chinese OCR failed: $($cn | ConvertTo-Json -Compress)" }
  $empty = Invoke-Worker $blank | ConvertFrom-Json
  if (-not $empty.ok -or $empty.charCount -ne 0) { throw 'Blank image OCR contract failed.' }
  $bad = Invoke-Worker $broken | ConvertFrom-Json
  if ($bad.ok) { throw 'Broken image should fail.' }
  $notFound = Invoke-Worker $missing | ConvertFrom-Json
  if ($notFound.ok -or $notFound.error -notmatch '文件不存在') { throw 'Missing image contract failed.' }
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
