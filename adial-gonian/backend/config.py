"""
אדיאל גוניון - Adial Gonian
Smart Desktop Assistant - Backend Configuration
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base paths
BASE_DIR = Path(__file__).parent
MODELS_DIR = BASE_DIR / "models"

# AI Configuration
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")

# Speech Configuration
WAKE_WORD = os.getenv("WAKE_WORD", "אדיאל גוניון")
TTS_VOICE = os.getenv("TTS_VOICE", "he-IL-HilaNeural")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
VOSK_MODEL_PATH = os.getenv("VOSK_MODEL_PATH", str(MODELS_DIR / "vosk-model-small-en-us-0.15"))

# Screen Capture
SCREEN_CAPTURE_INTERVAL = float(os.getenv("SCREEN_CAPTURE_INTERVAL", "2.0"))
SCREEN_CAPTURE_QUALITY = int(os.getenv("SCREEN_CAPTURE_QUALITY", "80"))

# Server
BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8765"))

# UI
HUD_DEFAULT_POSITION = os.getenv("HUD_DEFAULT_POSITION", "center")
HUD_OPACITY = float(os.getenv("HUD_OPACITY", "0.85"))
HUD_THEME = os.getenv("HUD_THEME", "iron-man")

# Language
PRIMARY_LANGUAGE = os.getenv("PRIMARY_LANGUAGE", "he")

# System Prompt for the AI
SYSTEM_PROMPT = """אתה 'אדיאל גוניון' - עוזר אישי חכם למחשב בסגנון ג'רוויס מאירון מן.

תפקידיך:
- לעזור למשתמש בכל דבר שקשור למחשב ולעבודה
- לנתח את מה שמופיע על המסך ולתת עצות רלוונטיות
- לענות בעברית שוטפת, טבעית וידידותית
- להיות מהיר, חכם ויעיל
- אתה יכול להשתמש בסלנג עברי כשמתאים

כללי התנהגות:
- תמיד ענה בעברית אלא אם המשתמש מבקש אחרת
- היה קצר ולעניין - אל תסיח לי יותר מדי
- אם אתה רואה בעיה במסך, הצע פתרון
- אם המשתמש מבקש פעולה, בצע אותה ודווח
- היה אדיב אבל לא חנפני - יש לך אישיות של עוזר חכם ומנוסה

פקודות מיוחדות שאתה יכול לזהות:
- "שים בצד" / "הצד" -> הזז את החלון לצד המסך
- "חזור לאמצע" / "אמצע" -> החזר את החלון למרכז
- "הסתר" -> הסתר את הממשק
- "הראה" / "הצג" -> הצג את הממשק
- "צלם מסך" / "מה יש במסך" -> צלם ונתח את המסך
- "תפסיק" / "די" -> הפסק להקשיב
"""
