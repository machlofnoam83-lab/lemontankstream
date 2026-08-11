# 🔧 בנייה ב-Windows (x64 Release) — Adiel Junior

## דרישות

| תוכנה | הערות |
|-------|-------|
| Windows 10/11 64-bit | יעד יחיד |
| Visual Studio 2022 | עם "Desktop development with C++" (MSVC x64) |
| CMake ≥ 3.20 | [cmake.org](https://cmake.org/download/) |
| Git | להורדת תלויות בזמן בנייה (FetchContent) |
| (אופציונלי) CUDA Toolkit | `-DGGML_CUDA=ON` לכרטיס NVIDIA |
| (אופציונלי) DirectML | מובנה ב-Windows — `-DGGML_DML=ON` לכל GPU |

> אין צורך ב-Python, Node.js, או שום סביבת ריצה אחרת.

## צינור בנייה רשמי (מומלץ)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```

מה הצינור עושה:
1. בודק VS 2022 + CMake.
2. מריץ `gen_icon` — מחולל הלוגו (C++ טהור) → `assets/adieljunior.ico`.
3. Configure: `cmake -B build -G "Visual Studio 17 2022" -A x64 -DADIEL_USE_LLAMA=ON ...`
   - שולף אוטומטית llama.cpp + whisper.cpp בגרסאות נעולות (commit קבוע — API יציב).
4. Build Release → `build/bin/Release/AdielJunior.exe` (קישור סטטי, `/MT` — קובץ יחיד).
5. Deploy → `dist/AdielJunior/` (exe + קונפיג + תיקיות מודלים + `start.bat`).

### דגלים שימושיים
```powershell
scripts\build.ps1 -Cuda          # בנייה עם CUDA (NVIDIA)
scripts\build.ps1 -Dml           # בנייה עם DirectML (כל GPU)
scripts\build.ps1 -NoGpu         # CPU בלבד
scripts\build.ps1 -Fast          # בנייה מהירה יותר
```

## בנייה ידנית

```bat
cmake -B build -G "Visual Studio 17 2022" -A x64 ^
      -DGGML_CUDA=ON ^
      -DADIEL_USE_LLAMA=ON -DADIEL_USE_WHISPER=ON
cmake --build build --config Release --target AdielJunior -m
```

## עבודה אופליין (ללא FetchContent)

שכפלו את הספריות פעם אחת לתיקיית `third_party` והצביעו עליהן:

```powershell
git clone --depth 1 https://github.com/ggml-org/llama.cpp third_party/llama.cpp
git clone --depth 1 https://github.com/ggml-org/whisper.cpp third_party/whisper.cpp

cmake -B build -G "Visual Studio 17 2022" -A x64 `
      -DADIEL_LLAMA_DIR=third_party/llama.cpp `
      -DADIEL_WHISPER_DIR=third_party/whisper.cpp
```

## בעיות נפוצות

| בעיה | פתרון |
|------|-------|
| `D3D12CreateDevice` נכשל | תקין — המערכת נופלת אוטומטית ל-D3D11 |
| Porcupine לא מזהה | ודאו שהמודל `.ppn` אומן ב-Picovoice Console עם אותו שם מילת הפעלה; בדקו `models/porcupine/` |
| המודל לא נטען | בדקו נתיב ב-`adieljunior.json` → `ai.model_path`; ודאו שהקובץ הוא GGUF Q4_K_M/Q8_0 |
| בנייה איטית ראשונה | תקין — llama.cpp נבנה סטטית (5–15 דקות תלוי בחומרה) |
| `llama-finetune` לאימון | בנו llama.cpp ללא CUDA לאימון CPU (ראו docs/FINETUNE.md) |

## רישוי SDK

- llama.cpp / whisper.cpp: MIT.
- Porcupine: Apache-2.0 (המודלים `.ppn` ברישיון Picovoice — חינם לשימוש אישי).
- sherpa-onnx / piper: Apache-2.0 / MIT (מודלי קול ברישיונותיהם).
