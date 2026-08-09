"""
אדיאל גוניון - Adial Gonian
Smart Desktop Assistant - Main Backend Server

FastAPI + WebSocket server that orchestrates:
- Wake word detection
- Speech recognition (STT)
- Text-to-speech (TTS)
- Screen capture
- AI engine (vision + chat)
- Command routing
- Real-time communication with Electron HUD
"""
import asyncio
import base64
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config import *
from core.ai_engine import AIEngine
from core.command_router import CommandRouter, CommandType, ParsedCommand
from core.screen_capture import ScreenCapture
from core.speech_recognition import SpeechRecognizer
from core.text_to_speech import TextToSpeech
from core.wake_word import WakeWordDetector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(BASE_DIR / "adial_gonian.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("adial_gonian")

# ============================================
# Initialize FastAPI App
# ============================================
app = FastAPI(
    title="אדיאל גוניון - Adial Gonian",
    description="Smart Desktop Assistant API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# Initialize Core Components
# ============================================
ai_engine = AIEngine()
command_router = CommandRouter()
screen_capture = ScreenCapture()
speech_recognizer = SpeechRecognizer()
tts = TextToSpeech()
wake_word_detector = WakeWordDetector()

# WebSocket connections
active_connections: list[WebSocket] = []

# State
assistant_state = {
    "status": "idle",  # idle, listening, processing, speaking
    "last_command": None,
    "last_response": None,
    "is_muted": False,
    "hud_position": HUD_DEFAULT_POSITION,
    "hud_visible": True,
    "session_id": str(uuid.uuid4()),
}


# ============================================
# WebSocket Communication
# ============================================
async def broadcast_to_hud(message: dict):
    """Broadcast a message to all connected HUD clients."""
    disconnected = []
    for ws in active_connections:
        try:
            await ws.send_json(message)
        except:
            disconnected.append(ws)
    for ws in disconnected:
        active_connections.remove(ws)


async def send_to_hud(event: str, data: dict = None):
    """Send a typed event to the HUD."""
    msg = {"event": event, "data": data or {}, "timestamp": time.time()}
    await broadcast_to_hud(msg)


# ============================================
# Command Handlers
# ============================================
async def handle_ui_move_side(parsed: ParsedCommand):
    """Move HUD to the side."""
    assistant_state["hud_position"] = "side"
    await send_to_hud("hud_position", {"position": "side"})
    await tts.speak_async("עברתי הצידה")


async def handle_ui_move_center(parsed: ParsedCommand):
    """Move HUD to center."""
    assistant_state["hud_position"] = "center"
    await send_to_hud("hud_position", {"position": "center"})
    await tts.speak_async("חזרתי לאמצע")


async def handle_ui_hide(parsed: ParsedCommand):
    """Hide HUD."""
    assistant_state["hud_visible"] = False
    await send_to_hud("hud_visibility", {"visible": False})


async def handle_ui_show(parsed: ParsedCommand):
    """Show HUD."""
    assistant_state["hud_visible"] = True
    await send_to_hud("hud_visibility", {"visible": True})


async def handle_screen_capture(parsed: ParsedCommand):
    """Capture and analyze the screen."""
    try:
        screen_b64 = screen_capture.capture_to_base64(resize=(1280, 720))
        analysis = ai_engine.analyze_screen(screen_b64, parsed.clean_text)
        await send_to_hud("screen_analysis", {"analysis": analysis, "image": screen_b64[:100] + "..."})
        await tts.speak_async(analysis)
    except Exception as e:
        logger.error(f"Screen capture error: {e}")
        await tts.speak_async("לא הצלחתי לצלם את המסך")


async def handle_stop_listening(parsed: ParsedCommand):
    """Stop listening."""
    assistant_state["status"] = "idle"
    await send_to_hud("status_change", {"status": "idle"})
    await tts.speak_async("בסדר, אני מפסיק להקשיב")


async def handle_ai_query(parsed: ParsedCommand):
    """Handle a general AI query."""
    try:
        assistant_state["status"] = "processing"
        await send_to_hud("status_change", {"status": "processing"})

        # Get current screen for context
        screen_b64 = None
        try:
            screen_b64 = screen_capture.capture_to_base64(resize=(800, 600))
        except:
            pass

        response = ai_engine.chat(parsed.clean_text, screen_b64)
        
        assistant_state["last_response"] = response
        assistant_state["status"] = "speaking"
        await send_to_hud("ai_response", {"text": response, "command": parsed.clean_text})

        # Speak the response
        await tts.speak_async(response)

        assistant_state["status"] = "idle"
        await send_to_hud("status_change", {"status": "idle"})

    except Exception as e:
        logger.error(f"AI query error: {e}")
        await tts.speak_async("מצטער, הייתה שגיאה. נסה שוב.")
        assistant_state["status"] = "idle"
        await send_to_hud("status_change", {"status": "idle"})


# Register command handlers (sync wrappers for async handlers)
def make_sync_handler(async_handler):
    def handler(parsed):
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Schedule the coroutine to run on the existing loop
                asyncio.ensure_future(async_handler(parsed))
            else:
                loop.run_until_complete(async_handler(parsed))
        except RuntimeError:
            # No event loop exists - create one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(async_handler(parsed))
    return handler

command_router.register_handler(CommandType.UI_MOVE_SIDE, make_sync_handler(handle_ui_move_side))
command_router.register_handler(CommandType.UI_MOVE_CENTER, make_sync_handler(handle_ui_move_center))
command_router.register_handler(CommandType.UI_HIDE, make_sync_handler(handle_ui_hide))
command_router.register_handler(CommandType.UI_SHOW, make_sync_handler(handle_ui_show))
command_router.register_handler(CommandType.SCREEN_CAPTURE, make_sync_handler(handle_screen_capture))
command_router.register_handler(CommandType.STOP_LISTENING, make_sync_handler(handle_stop_listening))
command_router.register_default_handler(make_sync_handler(handle_ai_query))


# ============================================
# Wake Word Callback
# ============================================
def on_wake_word_detected(text: str):
    """Called when wake word is detected."""
    logger.info(f"Wake word detected in: {text}")
    assistant_state["status"] = "listening"
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(send_to_hud("wake_word_detected", {"text": text}))
            asyncio.ensure_future(process_voice_command())
        else:
            loop.run_until_complete(send_to_hud("wake_word_detected", {"text": text}))
            loop.run_until_complete(process_voice_command())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(send_to_hud("wake_word_detected", {"text": text}))
        loop.run_until_complete(process_voice_command())


async def process_voice_command():
    """Process a voice command after wake word detection."""
    try:
        assistant_state["status"] = "listening"
        await send_to_hud("status_change", {"status": "listening"})

        # Record and transcribe
        text = speech_recognizer.listen_and_transcribe(max_duration=10.0)
        
        if not text:
            await send_to_hud("status_change", {"status": "idle"})
            assistant_state["status"] = "idle"
            return

        logger.info(f"Transcribed command: {text}")
        assistant_state["last_command"] = text
        await send_to_hud("command_received", {"text": text})

        # Route the command
        parsed = command_router.route(text)

    except Exception as e:
        logger.error(f"Voice command processing error: {e}")
        assistant_state["status"] = "idle"
        await send_to_hud("status_change", {"status": "idle"})


# Set wake word callback
wake_word_detector.on_detected = on_wake_word_detected


# ============================================
# API Endpoints
# ============================================
class ChatRequest(BaseModel):
    message: str
    include_screen: bool = False

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    rate: str = "+0%"


@app.get("/")
async def root():
    return {"name": "אדיאל גוניון - Adial Gonian", "version": "1.0.0", "status": "running"}


@app.get("/api/status")
async def get_status():
    return {
        **assistant_state,
        "screen": screen_capture.get_screen_info(),
        "connections": len(active_connections),
        "ai_provider": AI_PROVIDER,
        "wake_word": WAKE_WORD,
    }


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Text-based chat endpoint."""
    screen_b64 = None
    if request.include_screen:
        try:
            screen_b64 = screen_capture.capture_to_base64(resize=(800, 600))
        except:
            pass

    response = ai_engine.chat(request.message, screen_b64)
    return {"response": response, "screen_included": request.include_screen}


@app.post("/api/command")
async def process_command(text: str):
    """Process a text command (alternative to voice)."""
    parsed = command_router.route(text)
    return {"type": parsed.type.value, "clean_text": parsed.clean_text}


@app.get("/api/screen")
async def capture_screen():
    """Capture and return the current screen as base64."""
    try:
        b64 = screen_capture.capture_to_base64(resize=(1280, 720))
        return {"image": b64, "format": "jpeg"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze-screen")
async def analyze_screen(question: str = "מה יש על המסך?"):
    """Capture screen and analyze with AI."""
    try:
        b64 = screen_capture.capture_to_base64(resize=(1280, 720))
        analysis = ai_engine.analyze_screen(b64, question)
        return {"analysis": analysis}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech and return audio file."""
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            temp_path = f.name
        
        tts.speak_to_file(request.text, temp_path, request.rate)
        return FileResponse(temp_path, media_type="audio/mpeg", filename="response.mp3")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/wake-word/start")
async def start_wake_word():
    """Start wake word detection."""
    wake_word_detector.start()
    return {"status": "listening", "wake_word": WAKE_WORD}


@app.post("/api/wake-word/stop")
async def stop_wake_word():
    """Stop wake word detection."""
    wake_word_detector.stop()
    return {"status": "stopped"}


@app.post("/api/hud/position")
async def set_hud_position(position: str):
    """Set HUD position (center or side)."""
    assistant_state["hud_position"] = position
    await send_to_hud("hud_position", {"position": position})
    return {"position": position}


@app.post("/api/hud/visibility")
async def set_hud_visibility(visible: bool):
    """Set HUD visibility."""
    assistant_state["hud_visible"] = visible
    await send_to_hud("hud_visibility", {"visible": visible})
    return {"visible": visible}


@app.get("/api/history")
async def get_history():
    """Get conversation history."""
    return {"history": ai_engine.get_history()}


@app.post("/api/history/clear")
async def clear_history():
    """Clear conversation history."""
    ai_engine.clear_history()
    return {"status": "cleared"}


# ============================================
# WebSocket Endpoint
# ============================================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket connection for real-time HUD communication."""
    await websocket.accept()
    active_connections.append(websocket)
    logger.info(f"HUD connected. Total connections: {len(active_connections)}")
    
    # Send initial state
    await websocket.send_json({
        "event": "connected",
        "data": {
            **assistant_state,
            "wake_word": WAKE_WORD,
            "session_id": assistant_state["session_id"],
        },
    })
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                event = message.get("event")
                payload = message.get("data", {})
                
                # Handle incoming HUD events
                if event == "chat_message":
                    # Text message from HUD
                    parsed = command_router.route(payload.get("text", ""))
                    
                elif event == "request_screen":
                    # HUD requests screen capture
                    try:
                        b64 = screen_capture.capture_to_base64(resize=(800, 600))
                        await websocket.send_json({
                            "event": "screen_update",
                            "data": {"image": b64},
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "event": "error",
                            "data": {"message": str(e)},
                        })
                        
                elif event == "toggle_listening":
                    # Toggle wake word listening
                    if wake_word_detector.is_listening:
                        wake_word_detector.stop()
                    else:
                        wake_word_detector.start()
                    await websocket.send_json({
                        "event": "listening_state",
                        "data": {"is_listening": wake_word_detector.is_listening},
                    })
                    
                elif event == "ping":
                    await websocket.send_json({"event": "pong"})
                    
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON from HUD: {data}")
                
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        logger.info(f"HUD disconnected. Total connections: {len(active_connections)}")


# ============================================
# Startup & Shutdown
# ============================================
@app.on_event("startup")
async def startup():
    logger.info("=" * 50)
    logger.info("אדיאל גוניון - Adial Gonian Starting...")
    logger.info(f"AI Provider: {AI_PROVIDER}")
    logger.info(f"Wake Word: {WAKE_WORD}")
    logger.info(f"TTS Voice: {TTS_VOICE}")
    logger.info(f"Primary Language: {PRIMARY_LANGUAGE}")
    logger.info("=" * 50)
    
    # Auto-start wake word detection
    wake_word_detector.start()


@app.on_event("shutdown")
async def shutdown():
    logger.info("אדיאל גוניון Shutting down...")
    wake_word_detector.stop()
    screen_capture.stop_continuous()


# ============================================
# Main Entry Point
# ============================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        reload=False,
        log_level="info",
    )
