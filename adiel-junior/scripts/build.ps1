# =============================================================================
#  Adiel Junior - Build Pipeline (Windows x64 Release)
#  בונה AdielJunior.exe יחיד ועצמאי (C++20, /MT, static llama.cpp + whisper.cpp)
#
#  שימוש:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
#  פלט:    dist\AdielJunior\AdielJunior.exe
#
#  תיקונים אוטומטיים מובנים (autofix):
#   * core.longpaths=true ל-git (קבצים עם נתיבים ארוכים ב-llama.cpp)
#   * זיהוי אוטומטי של Visual Studio 2022 (17) או 2026 (18) ובחירת ה-Generator
#   * ניקוי אוטומטי של קאש build ישן עם Generator שונה
#   * אם הורדת התלויות נכשלת - שכפול מקומי ל-third_party וניסיון חוזר
#   * תיקיית third_party פגומה/חלקית - השלמה או שכפול מחדש
#   * אם מחולל האייקון נכשל - שימוש באייקון הקיים במאגר
# =============================================================================
param(
    [switch]$NoGpu,          # בנייה ללא CUDA/DirectML (CPU בלבד)
    [switch]$Dml,            # הפעלת DirectML backend (GPU של Windows)
    [switch]$Cuda,           # הפעלת CUDA backend (כרטיס NVIDIA)
    [switch]$Fast,           # בנייה מהירה (אופטימיזציות מופחתות)
    [string]$Config = "Release"
)

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "[!!] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Adiel Junior - Build Pipeline (Native C++)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# ---- 1. בדיקת כלים ----
$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $cmake) { Write-Fail "CMake לא נמצא. התקינו מ: https://cmake.org/download/"; exit 1 }
Write-Ok "CMake: $($cmake.Source)"

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) { Write-Fail "git לא נמצא. התקינו מ: https://git-scm.com/download/win"; exit 1 }

# AUTOFIX: קבצים עם נתיבים ארוכים (llama.cpp tools/ui) - חייב לפני כל clone
cmd /c "git config --global core.longpaths true >nul 2>&1"
Write-Ok "git: core.longpaths=true (תיקון 'Filename too long')"

# ---- 2. זיהוי Visual Studio (2022 = 17, 2026 = 18) ----
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vsWhere)) { Write-Fail "Visual Studio לא נמצא. התקינו עם 'Desktop development with C++'"; exit 1 }
$vsPath = & $vsWhere -latest -property installationPath
$vsVer  = & $vsWhere -latest -property installationVersion
if (-not $vsPath) { Write-Fail "Visual Studio לא נמצא"; exit 1 }
$major = (($vsVer -split '\.')[0]).Trim()
$gen = "Visual Studio 17 2022"
if ($major -eq "18") { $gen = "Visual Studio 18 2026" }
Write-Step "Visual Studio: $vsPath (גרסה $vsVer) -> Generator: $gen"

# ---- 3. AUTOFIX: ניקוי קאש build ישן עם Generator שונה ----
$cacheFile = Join-Path $Root "build\CMakeCache.txt"
if (Test-Path $cacheFile) {
    $cachedGen = Select-String -Path $cacheFile -Pattern '^CMAKE_GENERATOR:INTERNAL=(.+)$' |
        ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1
    if ($cachedGen -and $cachedGen -ne $gen) {
        Write-Step "ה-build הקיים נבנה עם '$cachedGen' - מוחק ומתחיל מחדש עם '$gen'"
        Remove-Item (Join-Path $Root "build") -Recurse -Force -ErrorAction SilentlyContinue
    }
}
$iconCache = Join-Path $Root "build\icon\CMakeCache.txt"
if (Test-Path $iconCache) {
    Remove-Item (Join-Path $Root "build\icon") -Recurse -Force -ErrorAction SilentlyContinue
}

# ---- 4. מחולל אייקון (פרויקט עצמאי - בלי למשוך llama.cpp) ----
Write-Step "מחולל אייקון..."
$iconArgs = @("-S", "tools\gen_icon", "-B", "build\icon", "-G", $gen, "-A", "x64", "-DCMAKE_BUILD_TYPE=Release")
& $cmake @iconArgs
if ($LASTEXITCODE -eq 0) {
    & $cmake --build build\icon --config Release
    if ($LASTEXITCODE -eq 0) {
        $iconExe = Get-ChildItem build\icon -Recurse -Filter gen_icon.exe -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($iconExe) { & $iconExe.FullName; Write-Ok "הלוגו נוצר" }
        else { Write-Fail "האייקון לא נוצר - משתמש בקיים" }
    } else { Write-Fail "בניית האייקון נכשלה - משתמש בקיים" }
} else { Write-Fail "קונפיגורציית האייקון נכשלה - משתמש בקיים" }

# ---- 5. קונפיגורציה (עם נפילה ל-Generator השני) ----
$baseArgs = @(
    "-DCMAKE_BUILD_TYPE=$Config",
    "-DADIEL_USE_LLAMA=ON",
    "-DADIEL_USE_WHISPER=ON",
    "-DADIEL_USE_PORCUPINE=ON",
    "-DADIEL_USE_OCR=ON",
    "-DADIEL_STATIC_RT=ON"
)
if ($Fast)  { $baseArgs += "-DCMAKE_CXX_FLAGS_RELEASE=/O1" }
if ($Dml)   { $baseArgs += "-DGGML_DML=ON" }
if ($Cuda)  { $baseArgs += "-DGGML_CUDA=ON" }
if ($NoGpu) { $baseArgs += "-DGGML_CUDA=OFF"; $baseArgs += "-DGGML_DML=OFF" }

function Invoke-Configure([string]$g, [string[]]$extra) {
    $a = @("-S", ".", "-B", "build", "-G", $g, "-A", "x64") + $baseArgs + $extra
    & $cmake @a 2>&1 | Out-Null
    return $LASTEXITCODE
}

Write-Step "קונפיגורציה (x64 $Config)..."
$code = Invoke-Configure $gen @()

if ($code -ne 0) {
    $alt = if ($gen -like "*18 2026*") { "Visual Studio 17 2022" } else { "Visual Studio 18 2026" }
    Write-Fail "Generator $gen נכשל - מנסה $alt"
    Remove-Item build -Recurse -Force -ErrorAction SilentlyContinue
    $code = Invoke-Configure $alt @()
}

if ($code -ne 0) {
    # ---- AUTOFIX: clone מקומי של תלויות (גרסאות נעולות) וניסיון חוזר ----
    Write-Fail "הקונפיגורציה נכשלה - מנסה תיקון אוטומטי (clone מקומי)..."
    New-Item -ItemType Directory -Force -Path third_party | Out-Null

    $pinned = @(
        @{ name = "llama.cpp";   url = "https://github.com/ggml-org/llama.cpp.git";   sha = "030ebb558a5820b444a8f836ed5cdd46c9b4bd7a"; marker = "CMakeLists.txt" },
        @{ name = "whisper.cpp"; url = "https://github.com/ggml-org/whisper.cpp.git"; sha = "592feef04a1802b18cbeffd0fd0eb5d02570c2ec"; marker = "CMakeLists.txt" },
        @{ name = "porcupine";   url = "https://github.com/Picovoice/porcupine.git";  sha = "c23ab023ae410766cb835446765537b25013b166"; marker = "include\pv_porcupine.h" }
    )

    foreach ($p in $pinned) {
        $dir = Join-Path "third_party" $p.name
        $markerPath = Join-Path $dir $p.marker
        if (Test-Path $dir -and -not (Test-Path $markerPath)) {
            Write-Fail "$($p.name) פגום - משכפל מחדש"
            Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $dir) {
            # השלמת checkout אם נכשל קודם (קבצים עם נתיבים ארוכים)
            cmd /c "git -C `"$dir`" config core.longpaths true >nul 2>&1"
            cmd /c "git -C `"$dir`" checkout . >nul 2>&1"
            Write-Ok "$($p.name) קיים ותקין"
        } else {
            Write-Step "משכפל $($p.name) ..."
            cmd /c "git -c core.longpaths=true clone --depth 1 $($p.url) `"$dir`" >nul 2>&1"
            if ($LASTEXITCODE -eq 0) {
                cmd /c "git -C `"$dir`" fetch --depth 1 origin $($p.sha) >nul 2>&1"
                cmd /c "git -C `"$dir`" checkout FETCH_HEAD >nul 2>&1"
                cmd /c "git -C `"$dir`" config core.longpaths true >nul 2>&1"
                Write-Ok "$($p.name) מוכן"
            } else {
                Write-Fail "שכפול $($p.name) נכשל"
            }
        }
    }

    $extra = @(
        "-DADIEL_LLAMA_DIR=third_party/llama.cpp",
        "-DADIEL_WHISPER_DIR=third_party/whisper.cpp",
        "-DADIEL_PORCUPINE_DIR=third_party/porcupine"
    )
    Remove-Item build -Recurse -Force -ErrorAction SilentlyContinue
    $code = Invoke-Configure $gen $extra
    if ($code -ne 0) {
        Remove-Item build -Recurse -Force -ErrorAction SilentlyContinue
        $code = Invoke-Configure $alt $extra
    }
    if ($code -ne 0) { Write-Fail "הקונפיגורציה נכשלה שוב. בדקו את ההודעות למעלה."; exit 1 }
}

# ---- 6. בנייה ----
Write-Step "בנייה..."
& $cmake --build build --config $Config --target AdielJunior --parallel
if ($LASTEXITCODE -ne 0) {
    Write-Fail "הבנייה נכשלה. טיפים:"
    Write-Fail "  1. GPU: נסו -NoGpu לבניית CPU"
    Write-Fail "  2. מחקו את תיקיית build ונסו שוב"
    exit 1
}

# ---- 7. אריזה ----
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
