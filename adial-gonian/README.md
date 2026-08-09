# ⚡ אדיאל גוניון - Adial Gonian

> עוזר אישי חכם למחשב בסגנון ג'רוויס מאירון מן
> Smart Desktop Assistant inspired by JARVIS & Friday from Iron Man

---

## 🎯 סקירה כללית | Overview

**אדיאל גוניון** הוא עוזר אישי חכם למחשב שפועל באמצעות קול וטקסט, רואה את המסך בזמן אמת, ומציג ממשק עתידני צף על המסך. המערכת דוברת עברית שוטפת ומופעלת באמצעות מילת הפעלה.

### תכונות עיקריות

| תכונה | תיאור |
|--------|--------|
| 🎤 **זיהוי קולי** | Wake word "אדיאל גוניון" + זיהוי דיבור בעברית |
| 🗣️ **דיבור** | דיבור בעברית טבעית (Edge-TTS) |
| 👁️ **ראיית מסך** | צילום וניתוח המסך בזמן אמת (Vision API) |
| 🖥️ **HUD צף** | ממשק עתידני שקוף בסגנון Iron Man |
| 🔄 **מיקום דינמי** | מרכז המסך ↔ צד המסך (Sidebar) |
| 🧠 **AI חכם** | GPT-4o / Claude 3.5 עם יכולת Vision |

---

## 🏗️ ארכיטקטורת המערכת

```
┌─────────────────────────────────────────────────────────┐
│                    Electron (HUD)                        │
│  ┌─────────────────────────────────────────────────┐    │
│  │  React + Tailwind CSS                           │    │
│  │  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │    │
│  │  │ Arc Reactor│  │ Waveform │  │ Chat Messages│ │    │
│  │  └───────────┘  └──────────┘  └──────────────┘ │    │
│  │  ┌────────────────────────────────────────────┐ │    │
│  │  │        Text Input + Quick Actions          │ │    │
│  │  └────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────┘    │
│                         │ WebSocket                     │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│              FastAPI Backend (Python)                    │
│                         │                               │
│  ┌──────────────┐  ┌───┴───┐  ┌──────────────┐        │
│  │ Wake Word    │  │Command │  │ AI Engine    │        │
│  │ Detector     │  │Router  │  │ (GPT-4o/     │        │
│  │ (Vosk)       │  │        │  │  Claude)     │        │
│  └──────┬───────┘  └───┬───┘  └──────┬───────┘        │
│         │              │              │                  │
│  ┌──────┴───────┐  ┌───┴───┐  ┌──────┴───────┐        │
│  │ Speech       │  │Screen │  │ Text-to-     │        │
│  │ Recognition  │  │Capture│  │ Speech       │        │
│  │ (Whisper)    │  │(PyAuto│  │ (Edge-TTS)   │        │
│  └──────────────┘  │ GUI)  │  └──────────────┘        │
│                    └───────┘                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 מבנה הפרויקט

```
adial-gonian/
├── backend/                    # Python Backend
│   ├── main.py                 # FastAPI server + WebSocket
│   ├── config.py               # Configuration management
│   ├── requirements.txt        # Python dependencies
│   └── core/
│       ├── wake_word.py        # Wake word detection (Vosk)
│       ├── speech_recognition.py # STT (faster-whisper)
│       ├── text_to_speech.py   # TTS (Edge-TTS Hebrew)
│       ├── screen_capture.py   # Screen capture (PyAutoGUI)
│       ├── ai_engine.py        # AI core (OpenAI / Anthropic)
│       └── command_router.py   # Command parsing & routing
│
├── frontend/                   # Electron + React HUD
│   ├── main.js                 # Electron main process
│   ├── preload.js              # Preload (IPC bridge)
│   ├── index.html              # HTML template
│   ├── package.json            # Node dependencies
│   ├── vite.config.js          # Vite bundler config
│   ├── tailwind.config.js      # Tailwind + Iron Man theme
│   ├── postcss.config.js       # PostCSS config
│   └── src/
│       ├── main.jsx            # React entry
│       ├── App.jsx             # Root component
│       ├── components/
│       │   └── HUD.jsx         # Main HUD component
│       ├── hooks/
│       │   └── useWebSocket.js # WebSocket hook
│       └── styles/
│           └── globals.css     # Tailwind + HUD styles
│
├── .env.example                # Environment template
├── start.bat                   # Windows startup script
├── start-dev.bat               # Dev mode (backend only)
├── install.bat                 # Installation script
└── README.md                   # This file
```

---

## 🚀 התקנה והרצה (Windows)

### דרישות מקדימות

| דרוש | גרסה מינימללית | הורדה |
|------|----------------|--------|
| Python | 3.10+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| FFmpeg | כל גרסה | [ffmpeg.org](https://ffmpeg.org) (אופציונלי, לניגון אודיו) |
| API Key | OpenAI או Anthropic | [platform.openai.com](https://platform.openai.com) |

### שלב 1: שכפול הפרויקט

```bash
git clone <repo-url>
cd adial-gonian
```

### שלב 2: הגדרת משתני סביבה

```bash
# העתק את קובץ התבנית
copy .env.example .env

# ערוך את .env והוסף את מפתח ה-API שלך
# לדוגמה:
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-your-key-here
```

### שלב 3: התקנה אוטומטית

```bash
# הרץ את סקריפט ההתקנה
install.bat
```

**או** התקנה ידנית:

```bash
# Backend
cd backend
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### שלב 4: הרצה

```bash
# הרצה מלאה (Backend + Electron HUD)
start.bat

# או מצב פיתוח (Backend בלבד)
start-dev.bat
```

### שלב 5: גישה למערכת

| כתובת | תיאור |
|--------|--------|
| `http://localhost:8765` | API ראשי |
| `http://localhost:8765/docs` | Swagger UI (תיעוד API) |
| `http://localhost:8765/ws` | WebSocket (HUD) |
| Electron Window | ממשק HUD צף |

---

## 🎤 שימוש

### מילת הפעלה (Wake Word)

אמור **"אדיאל גוניון"** ואז את הפקודה. לדוגמה:

- "אדיאל גוניון, מה מזג האוויר?"
- "אדיאל גוניון, מה יש על המסך?"
- "אדיאל גוניון, שים בצד"

### פקודות קוליות

| פקודה | פעולה |
|--------|--------|
| "שים בצד" / "הצד" | הזזת ה-HUD לצד המסך |
| "חזור לאמצע" / "אמצע" | החזרת ה-HUD למרכז |
| "הסתר" | הסתרת הממשק |
| "הראה" / "הצג" | הצגת הממשק |
| "צלם מסך" / "מה יש במסך" | צילום וניתוח המסך |
| "תפסיק" / "די" | הפסקת הקשבה |

### API Endpoints

```bash
# שאל שאלה
curl -X POST http://localhost:8765/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "מה יש על המסך?", "include_screen": true}'

# צלם מסך
curl http://localhost:8765/api/screen

# נתח מסך עם AI
curl -X POST "http://localhost:8765/api/analyze-screen?question=מה+יש+על+המסך"

# הפעל wake word
curl -X POST http://localhost:8765/api/wake-word/start

# שנה מיקום HUD
curl -X POST "http://localhost:8765/api/hud/position?position=side"

# המר טקסט לדיבור
curl -X POST http://localhost:8765/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "שלום, אני אדיאל גוניון"}' \
  --output response.mp3
```

---

## ⚙️ הגדרות

### כל משתני הסביבה

| משתנה | ברירת מחדל | תיאור |
|--------|-----------|--------|
| `AI_PROVIDER` | `openai` | ספק AI: `openai` או `anthropic` |
| `OPENAI_API_KEY` | - | מפתח OpenAI |
| `OPENAI_MODEL` | `gpt-4o` | מודל OpenAI |
| `ANTHROPIC_API_KEY` | - | מפתח Anthropic |
| `ANTHROPIC_MODEL` | `claude-3-5-sonnet-20241022` | מודל Anthropic |
| `WAKE_WORD` | `אדיאל גוניון` | מילת הפעלה |
| `TTS_VOICE` | `he-IL-HilaNeural` | קול TTS עברי |
| `WHISPER_MODEL` | `base` | גודל מודל Whisper |
| `VOSK_MODEL_PATH` | `./models/vosk-model-small-en-us-0.15` | נתיב מודל Vosk |
| `SCREEN_CAPTURE_INTERVAL` | `2.0` | מרווח צילומי מסך (שניות) |
| `SCREEN_CAPTURE_QUALITY` | `80` | איכות JPEG |
| `BACKEND_HOST` | `0.0.0.0` | כתובת שרת |
| `BACKEND_PORT` | `8765` | פורט שרת |
| `HUD_DEFAULT_POSITION` | `center` | מיקום HUD התחלתי |
| `HUD_OPACITY` | `0.85` | שקיפות HUD |
| `PRIMARY_LANGUAGE` | `he` | שפה ראשית |

### קולות TTS עבריים זמינים

| קול | מגדר | תיאור |
|------|------|--------|
| `he-IL-HilaNeural` | נקבה | קול טבעי, נעים (ברירת מחדל) |
| `he-IL-AvriNeural` | זכר | קול גברי |

---

## 🔧 טכנולוגיות

### Backend (Python)
- **FastAPI** - שרת אסינכרוני + WebSocket
- **faster-whisper** - זיהוי דיבור (STT) מבוסס Whisper
- **Vosk** - זיהוי מילת הפעלה (קל משקל, offline)
- **Edge-TTS** - דיבור בעברית (TTS)
- **PyAutoGUI** - צילום מסך
- **OpenAI / Anthropic** - מודל שפה + Vision

### Frontend (Electron + React)
- **Electron** - חלון שקוף, frameless, always-on-top
- **React 18** - ממשק משתמש
- **Tailwind CSS** - עיצוב עתידני (Iron Man theme)
- **Vite** - bundler מהיר
- **WebSocket** - תקשורת בזמן אמת עם backend

---

## 🎨 עיצוב HUD

הממשק מעוצב בהשראת Iron Man / JARVIS:

- **Arc Reactor** - אנימציית מעגל מרכזי (משנה צבע לפי סטטוס)
- **Waveform** - ויזואליזציה של גלי קול בזמן הקשבה
- **Glass Effect** - פאנלים שקופים עם blur (backdrop-filter)
- **Glow Effects** - זוהר כחול-סיאןי (Cyberpunk / Iron Man)
- **Scan Lines** - קווי סריקה עדינים
- **RTL** - תמיכה מלאה בעברית (ימין לשמאל)

---

## 📝 רישיון

MIT License - חופשי לשימוש, שינוי והפצה.

---

⚡ **אדיאל גוניון** - Just A Rather Very Intelligent System, גרסה עברית.
