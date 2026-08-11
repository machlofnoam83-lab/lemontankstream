# =============================================================================
#  Adiel Junior — Deploy
#  מעתיק את AdielJunior.exe + קבצי תמיכה לתיקיית dist\AdielJunior
# =============================================================================
param([string]$Config = "Release")

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$dist = Join-Path $Root "dist\AdielJunior"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# ה-exe
Copy-Item "build\bin\$Config\AdielJunior.exe" $dist -Force

# קונפיג + קבצי עזר
Copy-Item "config\adieljunior.json" $dist -Force

# Porcupine DLL (אם קיים clone מקומי)
$pp = "third_party\porcupine\lib\windows\amd64\libpv_porcupine.dll"
if (Test-Path $pp) { Copy-Item $pp $dist -Force }

# יצירת תיקיות מודלים
"models", "models\porcupine", "models\whisper", "models\sherpa", "models\piper", "logs" |
    ForEach-Object { New-Item -ItemType Directory -Force -Path (Join-Path $dist $_) | Out-Null }

# קובץ הפעלה נוח
@"
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
"@ | Out-File -FilePath (Join-Path $dist "start.bat") -Encoding ascii

Write-Host "Deploy הושלם: $dist" -ForegroundColor Green
