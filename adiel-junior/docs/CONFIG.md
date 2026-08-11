# ⚙️ קונפיגורציה — `config/adieljunior.json`

כל ההגדרות בקובץ JSON אחד. המערכת יוצרת קובץ ברירת מחדל אם הוא חסר.

## `ai` — מנוע השפה

| מפתח | ברירת מחדל | תיאור |
|------|-----------|-------|
| `engine` | `"llama"` | `"llama"` (llama.cpp) או `"stub"` (הדגמה) |
| `model_path` | `models/AdielJunior-3B-Q4_K_M.gguf` | נתיב המודל שלנו (GGUF) |
| `gpu_layers` | `-1` | מספר שכבות ב-VRAM; **שלילי = הכל** |
| `n_ctx` | `4096` | אורך הקשר (טוקנים) |
| `n_threads` | `0` | 0 = אוטומטי |
| `max_tokens` | `512` | אורך תשובה מרבי |
| `temperature` / `top_p` / `min_p` | `0.7` / `0.9` / `0.05` | פרמטרי דגימה |
| `history_limit` | `10` | הודעות עבר שנשמרות |
| `use_mmap` / `use_mlock` | `true` / `false` | מצב טעינת קבצי המודל |

## `vision` — ראיית מסך

| מפתח | ברירת מחדל | תיאור |
|------|-----------|-------|
| `enabled` | `true` | הפעלת לכידת מסך |
| `fps` | `30` | קצב לכידה |
| `change_threshold` | `0.02` | 2% שינוי = פריים "מעניין" לניתוח |
| `ocr` | `true` | קריאת טקסט מהמסך (Windows.Media.Ocr) |
| `gdi_fallback` | `true` | GDI BitBlt אם DXGI לא זמין |

## `wake_word` — מילת הפעלה

| מפתח | ברירת מחדל | תיאור |
|------|-----------|-------|
| `engine` | `"porcupine"` | `"porcupine"` או `"stub"` (מקש חם) |
| `keyword` | `"אדיאל ג'וניור"` | מילת ההפעלה המדויקת |
| `porcupine_params` | `models/porcupine/porcupine_params.pv` | קובץ הפרמטרים |
| `porcupine_keyword_model` | `models/porcupine/אדיאל-ג'וניור_windows_v3_0_0.ppn` | המודל המאומן |
| `sensitivity` | `0.6` | 0–1; גבוה = פחות פספוסים, יותר אזעקות שווא |
| `mic_device_id` | `""` | ריק = מיקרופון ברירת מחדל |

## `stt` — זיהוי דיבור

| מפתח | ברירת מחדל | תיאור |
|------|-----------|-------|
| `engine` | `"whisper"` | `"whisper"` או `"stub"` |
| `whisper_model` | `models/whisper/ggml-small-he.bin` | מודל עברית |
| `whisper_threads` | `4` | חוטי תמלול |
| `whisper_use_gpu` | `true` | האצת GPU אם זמין |
| `silence_timeout_ms` | `900` | שתיקה שמסיימת הקלטת פקודה |

## `tts` — דיבור

| מפתח | ברירת מחדל | תיאור |
|------|-----------|-------|
| `engine` | `"sherpa"` | `"sherpa"` / `"piper"` / `"stub"` |
| `sherpa_vits_model` / `_tokens` / `_lexicon` / `_data_dir` | `models/sherpa/...` | מודל קול עברי (VITS ONNX) |
| `sherpa_vits_speaker` / `_speed` | `0` / `1.0` | דובר ומהירות |
| `piper_voice_model` / `_config` / `_espeak_data` | `models/piper/...` | חלופת Piper |
| `volume` | `1.0` | עוצמה |

## `hud` — הממשק ההולוגרפי

| מפתח | ברירת מחדל | תיאור |
|------|-----------|-------|
| `enabled` | `true` | הצגת HUD |
| `mode` | `"center"` | `"center"` / `"docked"` / `"hidden"` |
| `opacity` | `0.92` | שקיפות הפאנל |
| `width` / `height` | `620` / `400` | גודל הפאנל (מרכז) |
| `click_through` | `true` | לחיצות עוברות דרכו (חוץ מכפתורים) |
| `font` | `"Segoe UI"` | פונט (תומך עברית) |

## `general` + `hotkeys`

| מפתח | ברירת מחדל | תיאור |
|------|-----------|-------|
| `hotkeys` | `true` | הפעלת מקשי קיצור גלובליים |
| `log_to_file` / `log_file` | `true` / `logs/adieljunior.log` | יומן |
| `listen` / `dock` / `center` / `hide` / `quit` / `screen` | L/D/C/H/Q/S | קודי VK (כולם עם Ctrl+Alt) |
