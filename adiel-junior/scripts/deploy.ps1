# =============================================================================
#  Adiel Junior - Deploy
#  מעתיק את AdielJunior.exe + קבצי תמיכה לתיקיית dist\AdielJunior
# =============================================================================
param([string]$Config = "Release")

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$dist = Join-Path $Root "dist\AdielJunior"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# ה-exe (מחפש בשני מיקומים אפשריים)
$exeCandidates = @(
    (Join-Path $Root "build\bin\$Config\AdielJunior.exe"),
    (Join-Path $Root "build\$Config\AdielJunior.exe")
)
$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Write-Error "AdielJunior.exe לא נמצא - הריצו קודם build"; exit 1 }
Copy-Item $exe $dist -Force

# קונפיג (יוצר ברירת מחדל אם חסר)
$cfgDir = Join-Path $Root "config"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$cfg = Join-Path $cfgDir "adieljunior.json"
if (-not (Test-Path $cfg)) {
    & (Join-Path $dist "AdielJunior.exe") --config $cfg 2>$null | Out-Null
}
if (Test-Path $cfg) { Copy-Item $cfg $dist -Force }

# Porcupine DLL (אם קיים clone מקומי)
$pp = Join-Path $Root "third_party\porcupine\lib\windows\amd64\libpv_porcupine.dll"
if (Test-Path $pp) { Copy-Item $pp $dist -Force }

# יצירת תיקיות מודלים ולוגים
"models", "models\porcupine", "models\whisper", "models\sherpa", "models\piper", "logs" |
    ForEach-Object { New-Item -ItemType Directory -Force -Path (Join-Path $dist $_) | Out-Null }

# קובץ הפעלה נוח (UTF-8 ללא BOM - נתמך ע"י cmd עם chcp 65001)
$bat = @"
@echo off
chcp 65001 >nul
title Adiel Junior
cd /d "%~dp0"
echo ============================================
echo   Adiel Junior - עוזר אישי חכם (Native C++)
echo ============================================
echo.
if exist "models\Qwen2.5-3B-Instruct-Q4_K_M.gguf" (
    AdielJunior.exe
) else (
    echo מודל ה-AI לא נמצא - מריצים במצב הדגמה...
    AdielJunior.exe --demo
)
pause
"@
[System.IO.File]::WriteAllText(
    (Join-Path $dist "start.bat"),
    $bat,
    (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "[OK] Deploy הושלם: $dist" -ForegroundColor Green
