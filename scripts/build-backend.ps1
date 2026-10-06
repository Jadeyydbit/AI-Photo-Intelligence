$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
$dist = Join-Path $root "frontend\backend-dist"
$work = Join-Path $root "backend\build"

if (-not (Test-Path $python)) {
    throw "Backend virtual environment not found at $python"
}

if (
    (Test-Path (Join-Path $dist "ai-photo-backend.exe")) -and
    $env:AI_PHOTO_FORCE_BACKEND_BUILD -ne "1"
) {
    Write-Host "Using existing packaged backend. Set AI_PHOTO_FORCE_BACKEND_BUILD=1 to rebuild it."
    exit 0
}

if (Test-Path $dist) {
    Remove-Item -LiteralPath $dist -Recurse -Force
}

& $python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name ai-photo-backend `
    --distpath $dist `
    --workpath $work `
    --specpath (Join-Path $root "backend") `
    --paths $root `
    --collect-all torch `
    --collect-all torchvision `
    --collect-all transformers `
    --collect-all qdrant_client `
    --collect-all ultralytics `
    (Join-Path $root "backend\main.py")

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE"
}
