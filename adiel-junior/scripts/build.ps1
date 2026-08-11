# =============================================================================
#  Adiel Junior — Build Pipeline (Windows x64 Release)
#  בונה AdielJunior.exe יחיד ועצמאי (C++20, /MT, static llama.cpp + whisper.cpp)
#
#  שימוש:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
#  פלט:    dist\AdielJunior\AdielJunior.exe
# =============================================================================
param(
    [switch]$NoGpu,          # בנייה ללא CUDA/DirectML (CPU בלבד)
    [switch]$Dml,            # הפעלת DirectML backend (GPU של Windows)
    [switch]$Cuda,           # הפעלת CUDA backend (כרטיס NVIDIA)
    [switch]$Fast,           # בנייה מהירה (Debug בלי אופטימיזציות)
    [string]$Config = "Release"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Adiel Junior — Build Pipeline (Native C++)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ---- 1. בדיקת כלים ----
$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $cmake) { Write-Error "CMake לא נמצא. התקינו מ: https://cmake.org/download/"; exit 1 }

$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vsWhere)) { Write-Error "Visual Studio 2022 לא נמצא. התקינו עם 'Desktop development with C++'"; exit 1 }
$vsPath = & $vsWhere -latest -property installationPath
if (-not $vsPath) { Write-Error "Visual Studio לא נמצא"; exit 1 }
Write-Host "[1/4] Visual Studio: $vsPath" -ForegroundColor Green

# ---- 2. יצירת אייקון (C++ טהור) ----
Write-Host "[2/4] מחולל אייקון..." -ForegroundColor Green
& $cmake -S . -B build\icon -A x64 -DCMAKE_BUILD_TYPE=Release | Out-Null
& $cmake --build build\icon --config Release --target gen_icon | Out-Null
& .\build\icon\bin\gen_icon.exe

# ---- 3. קונפיגורציה ----
Write-Host "[3/4] קונפיגורציה (x64 $Config)..." -ForegroundColor Green
$args = @(
    "-S", ".", "-B", "build",
    "-G", "Visual Studio 17 2022", "-A", "x64",
    "-DCMAKE_BUILD_TYPE=$Config",
    "-DADIEL_USE_LLAMA=ON",
    "-DADIEL_USE_WHISPER=ON",
    "-DADIEL_USE_PORCUPINE=ON",
    "-DADIEL_USE_OCR=ON",
    "-DADIEL_STATIC_RT=ON"
)
if ($Fast) { $args += "-DCMAKE_CXX_FLAGS_RELEASE=/O1" }
if ($Dml)  { $args += "-DGGML_DML=ON" }
if ($Cuda) { $args += "-DGGML_CUDA=ON" }
if ($NoGpu) { $args += "-DGGML_CUDA=OFF"; $args += "-DGGML_DML=OFF" }

& $cmake @args
if ($LASTEXITCODE -ne 0) { Write-Error "קונפיגורציה נכשלה"; exit 1 }

# ---- 4. בנייה ----
Write-Host "[4/4] בנייה..." -ForegroundColor Green
& $cmake --build build --config $Config --target AdielJunior -m
if ($LASTEXITCODE -ne 0) { Write-Error "בנייה נכשלה"; exit 1 }

# ---- 5. אריזה ----
& powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Config $Config
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  בנייה הושלמה! dist\AdielJunior\AdielJunior.exe" -ForegroundColor Green
    Write-Host "  הרצה מהירה:  dist\AdielJunior\AdielJunior.exe --demo" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Cyan
}
