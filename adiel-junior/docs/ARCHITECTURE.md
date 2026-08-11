# 🏗️ ארכיטקטורת המערכת — Adiel Junior

## עקרונות על

1. **Native C++20 בלבד** — אין Python, אין Electron/Web, אין ענן. כל רכיב הוא C++ מקורי.
2. **מודולריות מלאה** — כל תת-מערכת מאחורי ממשק (`ILlmProvider`, `IScreenSource`, `IWakeWord`, `IStt`, `ITts`, `IHud`).
   כל ממשק כולל מימוש "Stub" — כך שהמנוע כולו רץ ומנותב גם בלי שום מודל.
3. **אשכול חוטים ברור** — כל משימה כבדה על חוט משלה, תקשורת דרך `EventBus` + `ThreadQueue`.
4. **אפס זליגות** — RAII מלא (unique_ptr / ComPtr), נעילות ברורות, כיבוי מסודר.

## תרשים זרימה קולי (תרחיש ראשי)

```
[מיקרופון] ──WASAPI──▶ [Porcupine: "אדיאל ג'וניור"?] ──כן──▶ הקלטת פקודה
                                                               │
                                              שתיקה 900ms ─────┤
                                                               ▼
                                                   [Whisper.cpp: תמלול עברית]
                                                               │
                                                               ▼
                                          [CommandRouter: פקודת מערכת?]
                                          ─כן─▶ ביצוע (Dock/Hide/שעה...) + דיבור
                                          ─לא─▶ [llama.cpp 3B: שיחה + הקשר מסך]
                                                               │
                                              טוקנים סטרימינג ─┤
                                                               ▼
                                              [HUD: טקסט חי + TTS: דיבור משפט-משפט]
```

## תרשים זרימת ראייה

```
[DXGI Desktop Duplication @30-60fps] → [FrameDiffer: רשת 64×36]
        │ שינוי < 2%  → זרוק (חיסכון CPU)
        ▼ שינוי ≥ 2%
[ScreenContext: כותרת חלון פעיל + תהליך (Win32)]
        │
        ▼ (כשנדרש — אחרי מילת הפעלה או פקודת "מה על המסך")
[Windows.Media.Ocr — עברית] → [הקשר טקסטואלי → PromptBuilder → LLM]
```

## תיאור מודולים

### `core/` — תשתית
| מודול | תפקיד |
|-------|-------|
| `Logger` | לוגר תרדי-סייפ (קונסול + קובץ, UTF-8) |
| `Json` | מפענח/מסדר JSON עצמאי (~350 שורות, אפס תלות) |
| `Config` | טוען `adieljunior.json` להגדרות מוקלדות |
| `EventBus` | pub/sub תרדי-סייפ (StateChanged, WakeWordDetected, AiToken...) |
| `ThreadQueue` | תור MPMC עם condition_variable |
| `Fft` | התמרת פורייה radix-2 + חלון Hann — לויזואליזציית קול |

### `ai/` — מנוע הבינה
| מודול | תפקיד |
|-------|-------|
| `LlamaCppEngine` | קישור סטטי ל-llama.cpp: טעינת GGUF (Q4_K_M/Q8_0), `gpu_layers=-1` (כל ה-VRAM), תבנית צ'אט מקורית של המודל (`llama_chat_apply_template`), סטרימינג טוקנים עם שרשרת דגימה (temp/top-p/min-p), עצירת EOG, טיפול נכון ב-UTF-8 רב-בייתי |
| `PromptBuilder` | מערכת הנחיות בעברית (סגנון JARVIS) + הזרקת הקשר מסך כהודעת system |
| `StubLlm` | מצב הדגמה: עונה על שעה/תאריך/שלום — לבדיקת הצינור בלי מודל |

### `vision/` — ראייה
| מודול | תפקיד |
|-------|-------|
| `DxgiScreenSource` | `IDXGIOutputDuplication` — לכידת מסך GPU→CPU בהעתקה אחת; נפילה אוטומטית ל-GDI BitBlt (RDP וכו'); המרת פורמטים (BGRA8/RGBA8/R10G10B10A2) |
| `FrameDiffer` | רשת בהירות 64×36, אחוז שינוי, אזור שינוי — ה-AI הוויזואלי מופעל רק על שינוי משמעותי |
| `ScreenContext` | כותרת חלון + תהליך פעיל + OCR (Windows.Media.Ocr, עברית) → טקסט ל-LLM |

### `audio/` — קול
| מודול | תפקיד |
|-------|-------|
| `WasapiMicCapture` | WASAPI event-driven, המרה לכל פורמט נפוץ ל-16kHz מונו float |
| `PorcupineWakeWord` | טעינה דינמית של `libpv_porcupine.dll` (אין צורך ב-import lib); רגישות להגדרה |
| `WakeWordStub` | מילת הפעלה ידנית (מקש חם) — גיבוי תמידי |
| `WhisperStt` | whisper.cpp: תמלול עברית (`language=he`), GPU אופציונלי |
| `TtsBase` | חוט דיבור + תור + WASAPI playback — ספקים רק מסנתזים |
| `SherpaTts` / `PiperTts` | קולות עברית מקומיים (VITS ONNX) |
| `TtsStub` | צפצוף הדגמה |

### `hud/` — ממשק הולוגרפי
| מודול | תפקיד |
|-------|-------|
| `D2dHud` | Direct2D 1.3 על Direct3D **12** (דרך D3D11On12) עם נפילה ל-D3D11; DirectComposition (שקיפות GPU, 60fps); חלון click-through (`WM_NCHITTEST→HTTRANSPARENT`) עם כפתורים אינטראקטיביים וגרירה; DirectWrite RTL לעברית; טבעות אנרגיה (קשת מסתובבת + 12 נקודות + זוהר רדיאלי), גל קול FFT, צבעים לפי מצב (סרק/מקשיב/חושב/מדבר) |
| `HudModel` | מצב משותף תרדי-סייפ (mode, state, tokens, bins...) |
| `HudNull` | מצב headless |

### `app/` — אורקסטרציה
| מודול | תפקיד |
|-------|-------|
| `AdielApp` | מכונת מצבים (Idle→Listening→Processing→Thinking→Speaking), חוטי עבודה (capture/stt/ai/hotkeys), סטרימינג TTS משפט-משפט, היסטוריית שיחה, מקשי קיצור גלובליים |
| `CommandRouter` | פקודות עברית: "שים בצד", "חזור לאמצע", "הסתר", "מה על המסך", "נקה שיחה", "תשתוק", "כבה את עצמך" |

## מכונת מצבים

```
        מילת הפעלה               שתיקה/סיום דיבור
Idle ───────────────▶ Listening ───────────────▶ Processing
  ▲                      │                          │
  │                      ▼                          ▼
  └── דיבור הושלם ◀── Speaking ◀── משפט מוכן ◀── Thinking
```

## ניהול זיכרון וביצועים

- **VRAM**: `gpu_layers = -1` — כל שכבות ה-3B על כרטיס המסך; llama.cpp מנהל את שאריות הזיכרון (KV cache).
- **CPU**: לכידת מסך לא קוראת פיקסלים אלא אם יש שינוי משמעותי; OCR מוגבל לפעם ב-3 שניות; FFT על חלון של 1024 דגימות.
- **שמע**: Porcupine צורך <1% CPU (frame = 512 דגימות).
- **זיכרון**: `unique_ptr`/`ComPtr` לכל אורך החיים; אין `new` גולמי מחוץ למפעלים.
