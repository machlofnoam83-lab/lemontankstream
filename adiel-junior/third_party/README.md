# third_party — SDK חיצוניים (לא נכללים במאגר)

כל הספריות החיצוניות נשלפות **בזמן בנייה** (FetchContent) עם גרסאות נעולות.
אם אתם מעדיפים clone מקומי (למשל לעבודה אופליין), שכפלו לכאן והגדירו את המשתנים ב-CMake.

| ספרייה | גרסה נעולה (commit) | שימוש | הגדרת נתיב מקומי |
|--------|---------------------|-------|------------------|
| [llama.cpp](https://github.com/ggml-org/llama.cpp) | `030ebb558a5820b444a8f836ed5cdd46c9b4bd7a` | מנוע ה-AI (3B GGUF) | `-DADIEL_LLAMA_DIR=third_party/llama.cpp` |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | `592feef04a1802b18cbeffd0fd0eb5d02570c2ec` | זיהוי דיבור עברית | `-DADIEL_WHISPER_DIR=third_party/whisper.cpp` |
| [Porcupine](https://github.com/Picovoice/porcupine) | `c23ab023ae410766cb835446765537b25013b166` | מילת הפעלה (DLL בלבד) | `-DADIEL_PORCUPINE_DIR=third_party/porcupine` |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | `17ab05b76066ae1cf1e5219e9fd10e660b5bdc0a` | TTS עברית (אופציונלי) | `-DADIEL_SHERTA_ONNX_DIR=third_party/sherpa-onnx` |
| [piper](https://github.com/rhasspy/piper) | `73c04d81d5590ecc46e522de3601ce7fb29fc2be` | TTS חלופי (אופציונלי) | `-DADIEL_PIPER_DIR=third_party/piper` |

## הערות

- **llama.cpp / whisper.cpp**: נבנים אוטומטית כספריות סטטיות ומקושרות ל-`AdielJunior.exe`.
  ל-GPU: `-DGGML_CUDA=ON` (NVIDIA) או `-DGGML_DML=ON` (DirectML, כל GPU של Windows).
- **Porcupine**: Picovoice מספקים רק DLL — נטענת דינמית בזמן ריצה מה-exe.
  מודל מילת ההפעלה "אדיאל ג'וניור" מאומן ב-[Picovoice Console](https://console.picovoice.ai) (חינם).
- **sherpa-onnx / piper**: אופציונליים. בונים אותם בנפרד ומצביעים עם `*_DIR`.
  בלי TTS מקומי, המערכת עובדת במצב "צפצוף" הדגמה.
