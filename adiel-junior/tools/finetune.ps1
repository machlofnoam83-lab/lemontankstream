# =============================================================================
#  Adiel Junior - Fine-Tuning Pipeline (100% Native C++, ללא Python)
#
#  מאמן את המודל שלנו: llama-finetune (כוונון עדין) + llama-quantize (קוונטיזציה)
#  על נתוני העברית שלנו (data\hebrew_corpus.txt - נבנה ע"י tools\build_corpus).
#
#  שימוש:
#    powershell -ExecutionPolicy Bypass -File tools\finetune.ps1 `
#        -BaseModel models\AdielJunior-3B-Base.gguf `
#        -Data data\hebrew_corpus.txt `
#        -OutModel models\AdielJunior-3B-Q4_K_M.gguf
#
#  הערה: לאימון CPU - בנו llama.cpp ללא CUDA/DirectML (בנייה נקייה).
# =============================================================================
param(
    [string]$BaseModel = "models\AdielJunior-3B-Base.gguf",   # מודל הבסיס שלנו (אימון קודם)
    [string]$Data      = "data\hebrew_corpus.txt",            # קורפוס האימון שלנו (עברית)
    [string]$OutModel  = "models\AdielJunior-3B-Q4_K_M.gguf", # התוצר הסופי שלנו
    [int]$Ctx          = 512,
    [int]$Batch        = 16,
    [int]$GpuLayers    = -1,     # -1 = הכל (GPU); 0 = CPU
    [double]$Lr        = 1e-4,
    [int]$Epochs       = 2,
    [string]$LlamaDir  = "third_party\llama.cpp"               # clone מקומי
)

$ErrorActionPreference = "Continue"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path $BaseModel)) { Write-Error "מודל הבסיס לא נמצא: $BaseModel"; exit 1 }
if (-not (Test-Path $Data)) { Write-Error "קובץ האימון לא נמצא: $Data"; exit 1 }

$finetune = Join-Path $LlamaDir "build\bin\Release\llama-finetune.exe"
$quantize = Join-Path $LlamaDir "build\bin\Release\llama-quantize.exe"
if (-not (Test-Path $finetune)) { Write-Error "llama-finetune לא נמצא. בנו את llama.cpp: cmake --build third_party\llama.cpp\build --config Release --target llama-finetune llama-quantize"; exit 1 }

$f32 = "models\finetuned-f32.gguf"

Write-Host "=== שלב 1: אימון המודל שלנו (llama-finetune) ===" -ForegroundColor Cyan
& $finetune `
    --file $Data `
    --model $BaseModel `
    -c $Ctx -b $Batch -ub $Batch `
    -ngl $GpuLayers `
    -lr $Lr --epochs $Epochs `
    --output $f32
if ($LASTEXITCODE -ne 0) { Write-Error "אימון נכשל"; exit 1 }

Write-Host "=== שלב 2: קוונטיזציה ל-Q4_K_M ===" -ForegroundColor Cyan
& $quantize $f32 $OutModel Q4_K_M
if ($LASTEXITCODE -ne 0) { Write-Error "קוונטיזציה נכשלה"; exit 1 }

Remove-Item $f32 -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "המודל שלנו מוכן: $OutModel" -ForegroundColor Green
Write-Host "הגדירו אותו בקונפיג: ai.model_path = `"$OutModel`"" -ForegroundColor Green
