# =============================================================================
#  Adiel Junior - Build Pipeline (Windows x64 Release)
#  בונה AdielJunior.exe יחיד ועצמאי (C++20, /MT, static llama.cpp + whisper.cpp)
#
#  שימוש:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
#  פלט:    dist\AdielJunior\AdielJunior.exe
#
#  כולל תיקון שגיאות אוטומטי (autofix):
#   * אם הורדת התלויות (FetchContent) נכשלת - משכפל אותן מקומית ל-third_party
#     ומנסה שוב בנייה אוטומטית
#   * אם האייקון לא נוצר - משתמש באייקון הקיים במאגר
#   * יוצר אוטומטית תיקיות וקובצי קונפיג חסרים
# =============================================================================
param(
    [switch]$NoGpu,          # בנייה ללא CUDA/DirectML (CPU בלבד)
    [switch]$Dml,            # הפעלת DirectML backend (GPU של Windows)
    [switch]$Cuda,           # הפעלת CUDA backend (כרטיס NVIDIA)
    [switch]$Fast,           # בנייה מהירה (אופטימיזציות מופחתות)
    [string]$Config = "Release"
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step($msg)  { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Fail($msg)  { Write-Host "[!!] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Adiel Junior - Build Pipeline (Native C++)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ---- 1. בדיקת כלים ----
$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $cmake) { Write-Fail "CMake לא נמצא. התקינו מ: https://cmake.org/download/"; exit 1 }
Write-Ok "CMake: $($cmake.Source)"

$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vsWhere)) { Write-Fail "Visual Studio 2022 לא נמצא. התקינו עם 'Desktop development with C++'"; exit 1 }
$vsPath = & $vsWhere -latest -property installationPath
if (-not $vsPath) { Write-Fail "Visual Studio לא נמצא"; exit 1 }
Write-Step "Visual Studio: $vsPath"

# ---- 2. יצירת אייקון (C++ טהור) ----
Write-Step "מחולל אייקון..."
try {
    & $cmake -S . -B build\icon -A x64 -DCMAKE_BUILD_TYPE=Release | Out-Null
    & $cmake --build build\icon --config Release --target gen_icon | Out-Null
    if (Test-Path .\build\icon\bin\gen_icon.exe) { & .\build\icon\bin\gen_icon.exe }
} catch {
    Write-Fail "מחולל האייקון נכשל - משתמש באייקון הקיים במאגר (assets/adieljunior.ico)"
}

# ---- 3. קונפיגורציה ----
Write-Step "קונפיגורציה (x64 $Config)..."
$cmakeArgs = @(
    "-S", ".", "-B", "build",
    "-G", "Visual Studio 17 2022", "-A", "x64",
    "-DCMAKE_BUILD_TYPE=$Config",
    "-DADIEL_USE_LLAMA=ON",
    "-DADIEL_USE_WHISPER=ON",
    "-DADIEL_USE_PORCUPINE=ON",
    "-DADIEL_USE_OCR=ON",
    "-DADIEL_STATIC_RT=ON"
)
if ($Fast) { $cmakeArgs += "-DCMAKE_CXX_FLAGS_RELEASE=/O1" }
if ($Dml)  { $cmakeArgs += "-DGGML_DML=ON" }
if ($Cuda) { $cmakeArgs += "-DGGML_CUDA=ON" }
if ($NoGpu) { $cmakeArgs += "-DGGML_CUDA=OFF"; $cmakeArgs += "-DGGML_DML=OFF" }

& $cmake @cmakeArgs
if ($LASTEXITCODE -ne 0) {
    # ---- AUTOFIX: הורדת תלויות נכשלה (אין רשת ל-FetchContent) -> שכפול מקומי וניסיון חוזר
    Write-Fail "הקונפיגורציה נכשלה - מנסה תיקון אוטומטי (clone מקומי של תלויות)..."
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { Write-Fail "git לא נמצא - לא ניתן לתקן אוטומטית"; exit 1 }

    New-Item -ItemType Directory -Force -Path third_party | Out-Null

    $pinned = @{
        "llama.cpp"   = @("https://github.com/ggml-org/llama.cpp.git",   "030ebb558a5820b444a8f836ed5cdd46c9b4bd7a")
        "whisper.cpp" = @("https://github.com/ggml-org/whisper.cpp.git", "592feef04a1802b18cbeffd0fd0eb5d02570c2ec")
        "porcupine"   = @("https://github.com/Picovoice/porcupine.git",  "c23ab023ae410766cb835446765537b25013b166")
    }

    foreach ($name in $pinned.Keys) {
        $dir = Join-Path "third_party" $name
        if (-not (Test-Path $dir)) {
            Write-Step "משכפל $name ..."
            git clone --depth 1 $pinned[$name][0] $dir | Out-Null
            if ($LASTEXITCODE -eq 0) {
                git -C $dir fetch --depth 1 origin $pinned[$name][1] 2>$null | Out-Null
                git -C $dir checkout FETCH_HEAD 2>$null | Out-Null
            }
        }
    }

    $cmakeArgs += "-DADIEL_LLAMA_DIR=third_party/llama.cpp"
    $cmakeArgs += "-DADIEL_WHISPER_DIR=third_party/whisper.cpp"
    $cmakeArgs += "-DADIEL_PORCUPINE_DIR=third_party/porcupine"

    Write-Step "ניסיון שני לקונפיגורציה עם תלויות מקומיות..."
    & $cmake @cmakeArgs
    if ($LASTEXITCODE -ne 0) { Write-Fail "הקונפיגורציה נכשלה שוב. בדקו את ההודעות למעלה."; exit 1 }
}

# ---- 4. בנייה ----
Write-Step "בנייה..."
& $cmake --build build --config $Config --target AdielJunior -m
if ($LASTEXITCODE -ne 0) {
    Write-Fail "הבנייה נכשלה. טיפים:"
    Write-Fail "  1. ודאו שהמודל GGUF תקין (Q4_K_M/Q8_0)"
    Write-Fail "  2. GPU: נסו -NoGpu לבניית CPU"
    Write-Fail "  3. מחקו את תיקיית build ונסו שוב"
    exit 1
}

# ---- 5. אריזה ----
Write-Step "אריזה..."
& powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Config $Config
if ($LASTEXITCODE -ne 0) { Write-Fail "האריזה נכשלה"; exit 1 }

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  בנייה הושלמה! dist\AdielJunior\AdielJunior.exe" -ForegroundColor Green
Write-Host "  הרצה מהירה:  dist\AdielJunior\AdielJunior.exe --demo" -ForegroundColor Cyan
Write-Host "  בדיקות:      dist\AdielJunior\AdielJunior.exe --selftest" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
