# 🧠 כוונון עדין של "אדיאל ג'וניור" — 100% C++, ללא Python

הצינור כולו משתמש בכלים המקוריים של llama.cpp:
`llama-finetune` (אימון) + `llama-quantize` (קוונטיזציה) + `llama-export-lora` (מיזוג LoRA).

## סקירה

```
data/hebrew_corpus.txt ──▶ llama-finetune ──▶ finetuned-f32.gguf
                                                       │
                                            llama-quantize Q4_K_M
                                                       │
                                                       ▼
                                   models/AdielJunior-3B-Q4_K_M.gguf
                                                       │
                                                       ▼
                                        AdielJunior.exe (config: model_path)
```

## שלבים

### 1. בניית כלי האימון

```powershell
# מהתיקייה של llama.cpp (third_party/llama.cpp)
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --target llama-finetune llama-quantize -m
```

> **לאימון CPU**: בנו בלי CUDA/DirectML. לאימון GPU: `-ngl` מקסימלי.

### 2. הכנת נתונים

ערכו את `data/hebrew_instruct.example.txt` — כל דוגמה בפורמט תבנית הצ'אט של המודל
(ChatML עבור Qwen). ככל שיותר דוגמאות מגוונות — התוצאה טובה יותר.

### 3. אימון

```powershell
powershell -ExecutionPolicy Bypass -File tools\finetune.ps1 `
    -BaseModel models\AdielJunior-3B-Base.gguf `
    -Data data\hebrew_corpus.txt `
    -OutModel models\AdielJunior-3B-Q4_K_M.gguf
```

פרמטרים מומלצים לסט קטן (500–5000 דוגמאות):
- `-Ctx 512 -Batch 16` (זיכרון נמוך)
- `-Lr 1e-4 --Epochs 2` (כוונון עדין, לא overfit)
- `-GpuLayers -1` עם GPU; `0` ל-CPU

### 4. שימוש

עדכנו בקונפיג: `"model_path": "models/AdielJunior-3B-Q4_K_M.gguf"` — והריצו.

## חלופה: LoRA

לאימון קל יותר, אפשר לאמן LoRA ולמזג:

```powershell
# 1. אימון עם פלט LoRA (data points דומים)
llama-finetune --file data\hebrew_instruct.txt --model base.gguf `
  -c 512 -b 16 -ub 16 --lora-out lora.gguf --out-file merged.gguf -lr 1e-4 --epochs 2

# 2. קוונטיזציה
llama-quantize merged.gguf models\AdielJunior-3B-Q4_K_M.gguf Q4_K_M
```

## טיפים לאיכות עברית

1. **איכות על כמות**: 500 דוגמאות כתובות היטב עדיפות על 50,000 גרועות.
2. **גיוון**: פקודות מערכת, שאלות כלליות, סיכומי מסך, שיחות המשך.
3. **עקביות סגנונית**: כל תשובות המודל צריכות להיראות אותו דבר (קצר, ידידותי).
4. **RTL/ניקוד**: כתבו עברית תקינה; מודל Qwen2.5-3B כבר מדבר עברית סבירה — הכוונון מחדד את האישיות והפקודות.
