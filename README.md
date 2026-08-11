# lemontankstream

## ⚡ אדיאל ג'וניור — Adiel Junior (Native C++20 Engine)

עוזר אישי חכם למחשב בסגנון JARVIS & Friday — **Native C++20, 100% מקומי, ללא ענן.**

- 🧠 מודל שפה מקומי 3B (llama.cpp, GGUF Q4_K_M, VRAM מלא)
- 👁️ תפיסת מסך חיה (DXGI Desktop Duplication) + OCR עברית
- 🎤 מילת הפעלה "אדיאל ג'וניור" (Porcupine) + זיהוי דיבור (Whisper.cpp)
- 🔊 דיבור עברית מקומי (Sherpa-ONNX / Piper)
- 🖥️ HUD הולוגרפי צף (Direct2D על Direct3D 12 + DirectComposition)
- ❌ אין Python · אין Electron · אין דפדפן · אין שרתי ענן

### Quick Start (Windows)

```powershell
cd adiel-junior
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
dist\AdielJunior\AdielJunior.exe --demo     # מצב הדגמה (בלי מודלים)
dist\AdielJunior\AdielJunior.exe --selftest # בדיקות עצמיות
```

📚 תיעוד מלא: [`adiel-junior/README.md`](adiel-junior/README.md)

---

## 🗂️ היסטוריית פרויקטים

| תיקייה | טכנולוגיה | סטטוס |
|--------|-----------|-------|
| `adiel-junior/` | **Native C++20** — המנוע הנוכחי | ✅ פעיל |
| `adial-gonian/` | Electron + React + Python (FastAPI, Vosk, Edge-TTS, ענן) | 🗄️ היסטורי — הוחלף ע"י המנוע ה-C++ |
