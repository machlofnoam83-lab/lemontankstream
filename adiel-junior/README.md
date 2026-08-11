# ⚡ אדיאל ג'וניור — Adiel Junior

> **עוזר אישי חכם למחשב, בסגנון JARVIS — Native C++20, 100% מקומי, ללא ענן.**

מנוע מלא בשפת C++ טהורה (ללא Python, ללא Electron, ללא דפדפן, ללא שרתים):
זיהוי קולי בעברית, תפיסת מסך חיה, מודל שפה מקומי 3B על כרטיס המסך,
וממשק הולוגרפי צף בסגנון Iron Man — הכל בקובץ `AdielJunior.exe` אחד.

---

## 🏗️ אדריכלות — במבט אחד

```
┌────────────────────────────────────────────────────────────────┐
│                        AdielJunior.exe                          │
│  ┌────────────┐   ┌───────────────┐   ┌──────────────────────┐ │
│  │ AI Core    │   │ Vision        │   │ Voice Pipeline       │ │
│  │ llama.cpp  │   │ DXGI Desktop  │   │ Porcupine (מילת      │ │
│  │ 3B GGUF    │   │ Duplication   │   │ הפעלה) → Whisper.cpp │ │
│  │ Q4_K_M     │   │ + FrameDiffer │   │ → Piper/Sherpa TTS   │ │
│  │ GPU VRAM   │   │ + OCR (WinRT) │   │ (עברית, מקומי)       │ │
│  └─────┬──────┘   └──────┬────────┘   └──────────┬───────────┘ │
│        └─────────────────┼───────────────────────┘             │
│                    ┌─────▼─────┐                               │
│                    │ AdielApp  │  Orchestrator + CommandRouter │
│                    │ (ליבה)    │  (פקודות עברית: "שים בצד"...)│
│                    └─────┬─────┘                               │
│              ┌───────────▼───────────┐                         │
│              │ Holographic HUD       │  D2D1.3 + D3D12(11on12) │
│              │ DirectComposition     │  חלון שקוף click-through│
│              │ טבעות אנרגיה + FFT    │  מצבים: מרכז/צד/מוסתר    │
│              └───────────────────────┘                         │
└────────────────────────────────────────────────────────────────┘
```

## ✨ תכונות

| תכונה | טכנולוגיה | סטטוס |
|-------|-----------|-------|
| 🧠 מודל שפה מקומי 3B — **המודל שלנו** (מאומן על הנתונים שלנו) | llama.cpp C API, קישור סטטי, GGUF Q4_K_M/Q8_0, טעינה מלאה ל-VRAM (`gpu_layers=-1`) | ✅ ממומש |
| 👁️ תפיסת מסך 30–60 FPS | DXGI Desktop Duplication (Zero-Copy) + GDI fallback | ✅ ממומש |
| 🔍 זיהוי שינויים דינמי | FrameDiffer (רשת 64×36, רק שינוי משמעותי → ניתוח) | ✅ ממומש |
| 📖 "ראייה" בעברית | Windows.Media.Ocr (WinRT) — קורא טקסט מהמסך ל-AI | ✅ ממומש |
| 🎤 מילת הפעלה "אדיאל ג'וניור" | Porcupine C API (DLL דינמי, CPU <1%) + מקש חם גיבוי | ✅ ממומש |
| 🗣️ זיהוי דיבור עברית | whisper.cpp (קישור סטטי, מודל `ggml-small-he`) | ✅ ממומש |
| 🔊 דיבור עברית מקומי | Sherpa-ONNX VITS / Piper — קול עברי, אופליין | ✅ ממומש (אופציונלי) |
| 🖥️ HUD הולוגרפי צף | Direct2D 1.3 על Direct3D 12 (11on12) + DirectComposition + DirectWrite RTL | ✅ ממומש |
| 🎛️ מצבי תצוגה | מרכז / צד (Docked) / מוסתר — בקול ("שים בצד", "חזור לאמצע", "הסתר") או בלחיצה | ✅ ממומש |
| 🌊 גל קול תגובתי + טבעות אנרגיה | FFT משלנו (radix-2) על שמע המיקרופון | ✅ ממומש |
| ⌨️ מקשי קיצור | Ctrl+Alt+L/D/C/H/Q/S (האזנה/צד/מרכז/הסתר/יציאה/מסך) | ✅ ממומש |
| 🔧 בניית המודל שלנו מאפס | קורפוס משלנו (`build_corpus`) → אימון (`llama-finetune`) → קוונטיזציה — C++ טהור, ללא Python | ✅ צינור מוכן |
| 🧪 בדיקות עצמיות | `AdielJunior.exe --selftest` — 26 בדיקות ליבה | ✅ עוברות |

## 🚀 התחלה מהירה (Windows 10/11 x64)

### דרך 1: בנייה אוטומטית
```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
# פלט: dist\AdielJunior\AdielJunior.exe
```

### דרך 2: CMake ידני
```bat
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

### הרצה
```bat
AdielJunior.exe --demo      :: מצב הדגמה — כל הצינור עובד בלי מודלים
AdielJunior.exe --selftest  :: בדיקות עצמיות
AdielJunior.exe             :: מצב מלא (אחרי הורדת מודלים)
```

## 🧠 המודל הוא שלנו — איך אנחנו בונים אותו

| שלב | הכלי שלנו | תיאור |
|-----|-----------|-------|
| 1. נתונים | `tools/build_corpus.cpp` | קבצי השיחות שלנו (עברית) → קורפוס אימון בפורמט ChatML + סטטיסטיקות |
| 2. אימון | `tools/finetune.ps1` + `llama-finetune` | אימון המודל על הנתונים שלנו (GPU/CPU) |
| 3. קוונטיזציה | `llama-quantize` | Q4_K_M → `models/AdielJunior-3B-Q4_K_M.gguf` |
| 4. הרצה | `AdielJunior.exe` | טוען את המודל שלנו — הכל מקומי |

**המנוע לא תלוי באף מודל מסחרי**: כל GGUF שמאומן על ידינו עובד.
תיעוד מלא: [docs/TRAIN_FROM_SCRATCH.md](docs/TRAIN_FROM_SCRATCH.md).

### קבצי עזר (לבדיקות/פיתוח בלבד — לא חלק מהמוצר)
| רכיב | הערה |
|------|------|
| Whisper עברית | `models/whisper/ggml-small-he.bin` — [whisper.cpp](https://github.com/ggml-org/whisper.cpp) |
| Porcupine params | `models/porcupine/porcupine_params.pv` — [Picovoice](https://github.com/Picovoice/porcupine) |
| מילת הפעלה `.ppn` | אומן אצלנו ב-[Picovoice Console](https://console.picovoice.ai) (חינם) — "אדיאל ג'וניור" |
| קול עברי (TTS) | `models/sherpa/vits-hebrew.onnx` — [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) |

## 📁 מבנה הפרויקט

```
adiel-junior/
├── CMakeLists.txt          # בנייה ראשית (C++20, x64 Release, קישור סטטי)
├── scripts/
│   ├── build.ps1 / build.bat   # צינור בנייה אחד → AdielJunior.exe
│   └── deploy.ps1              # אריזה ל-dist\AdielJunior
├── tools/
│   ├── gen_icon.cpp            # מחולל לוגו הולוגרפי (C++ טהור)
│   └── finetune.ps1            # כוונון עדין בעברית (llama-finetune)
├── data/                       # דוגמאות אימון עברית
├── config/adieljunior.json     # קונפיגורציה מלאה
├── src/
│   ├── core/      # Logger, JSON, Config, EventBus, ThreadQueue, FFT
│   ├── ai/        # LlamaCppEngine, PromptBuilder, StubLlm
│   ├── vision/    # DxgiScreenSource, FrameDiffer, ScreenContext (OCR)
│   ├── audio/     # WasapiMic, Porcupine, WhisperStt, SherpaTts, PiperTts
│   ├── hud/       # D2dHud (Direct2D+DComp), HudModel
│   └── app/       # AdielApp (אורקסטרטור), CommandRouter, main
└── docs/          # תיעוד מפורט
```

## 📚 תיעוד נוסף

- [ארכיטקטורה מלאה](docs/ARCHITECTURE.md)
- [בנייה ב-Windows](docs/BUILD_WINDOWS.md)
- [קונפיגורציה](docs/CONFIG.md)
- [בניית המודל שלנו מאפס](docs/TRAIN_FROM_SCRATCH.md)
- [כוונון עדין](docs/FINETUNE.md)

## 🧪 סטטוס בדיקות

הליבה (JSON, FFT, FrameDiffer, Config, CommandRouter, EventBus, ThreadQueue)
עוברת 26 בדיקות עצמיות (`--selftest`). קבצי השילוב עם llama.cpp / whisper.cpp /
Porcupine / Sherpa-ONNX נבדקו מול כותרות ה-SDK הרשמיות בגרסאות הנעולות.

> **הערה**: הפרויקט הקודם (`adial-gonian`, Electron+Python) נשמר במאגר כגרסה
> היסטורית בלבד ואינו חלק מהמנוע החדש.
