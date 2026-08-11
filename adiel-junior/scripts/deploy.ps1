# =============================================================================
#  Adiel Junior - Deploy
#  מעתיק את AdielJunior.exe + קבצי תמיכה לתיקיית dist\AdielJunior
# =============================================================================
param([string]$Config = "Release")

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$dist = Join-Path $Root "dist\AdielJunior"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# ה-exe (מחפש בכמה מיקומים אפשריים)
$exeCandidates = @(
    (Join-Path $Root "build\bin\$Config\AdielJunior.exe"),
    (Join-Path $Root "build\$Config\AdielJunior.exe"),
    (Join-Path $Root "build\AdielJunior.exe")
)
$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Write-Error "AdielJunior.exe לא נמצא - הריצו קודם build"; exit 1 }
Copy-Item $exe $dist -Force

# קונפיג - העתקה מהמאגר, או יצירה מקומית אם חסר (ללא הרצת ה-exe)
$cfgDir = Join-Path $Root "config"
New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
$cfg = Join-Path $cfgDir "adieljunior.json"
if (-not (Test-Path $cfg)) {
    $obj = [ordered]@{
        language = "he"
        ai = [ordered]@{ engine = "llama"; model_path = "models/AdielJunior-3B-Q4_K_M.gguf"; gpu_layers = -1 }
        wake_word = [ordered]@{ keyword = "אדיאל ג'וניור" }
        hud = [ordered]@{ enabled = $true }
    }
    $json = $obj | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($cfg, $json, (New-Object System.Text.UTF8Encoding($false)))
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
if exist "models\AdielJunior-3B-Q4_K_M.gguf" (
    AdielJunior.exe
) else (
    echo מודל ה-AI שלנו לא נמצא - מריצים במצב הדגמה...
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
