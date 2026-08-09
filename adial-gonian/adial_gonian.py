"""
אדיאל גוניון - Adial Gonian
Single-file Desktop Application

Uses pywebview for native window + FastAPI for backend.
No browser, no Node.js - just a desktop app!
"""
import asyncio
import base64
import json
import logging
import os
import sys
import threading
import time
import uuid
import tempfile
from pathlib import Path
from typing import Optional

# ============================================
# Setup paths
# ============================================
BASE_DIR = Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

# Load .env
try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass

# ============================================
# Config
# ============================================
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
WAKE_WORD = os.getenv("WAKE_WORD", "אדיאל גוניון")
TTS_VOICE = os.getenv("TTS_VOICE", "he-IL-HilaNeural")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
PRIMARY_LANGUAGE = os.getenv("PRIMARY_LANGUAGE", "he")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8765"))

SYSTEM_PROMPT = """אתה 'אדיאל גוניון' - עוזר אישי חכם למחשב בסגנון ג'רוויס מאירון מן.
תפקידיך: לעזור למשתמש, לנתח מה שעל המסך, לענות בעברית שוטפת וטבעית.
תמיד ענה בעברית. היה קצר ולעניין. אם רואה בעיה במסך - הצע פתרון.
פקודות מיוחדות: "שים בצד"=הזז חלון לצד, "חזור לאמצע"=מרכז, "הסתר"=הסתר, "צלם מסך"=נתח מסך, "תפסיק"=הפסק."""

# ============================================
# Logging
# ============================================
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("adial_gonian")

# ============================================
# AI Engine (inline)
# ============================================
class AIEngine:
    def __init__(self):
        self.provider = AI_PROVIDER
        self.history = []
        self._client = None
        self._model = None
        self._init = False

    def _ensure(self):
        if self._init: return
        try:
            if self.provider == "openai":
                from openai import OpenAI
                self._client = OpenAI(api_key=OPENAI_API_KEY)
                self._model = OPENAI_MODEL
            elif self.provider == "anthropic":
                import anthropic
                self._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
                self._model = ANTHROPIC_MODEL
        except Exception as e:
            logger.error(f"AI init error: {e}")
            self._client = None
        self._init = True

    def chat(self, message: str, image_b64: str = None) -> str:
        self._ensure()
        content = []
        if image_b64:
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}})
        content.append({"type": "text", "text": message})
        self.history.append({"role": "user", "content": content if image_b64 else message})
        try:
            if not self._client:
                return "המודל לא מוגדר. הגדר מפתח API בקובץ .env"
            if self.provider == "openai":
                msgs = [{"role": "system", "content": SYSTEM_PROMPT}] + self.history
                r = self._client.chat.completions.create(model=self._model, messages=msgs, max_tokens=1024, temperature=0.7)
                resp = r.choices[0].message.content
            else:
                r = self._client.messages.create(model=self._model, max_tokens=1024, system=SYSTEM_PROMPT, messages=self.history)
                resp = r.content[0].text
            self.history.append({"role": "assistant", "content": resp})
            return resp
        except Exception as e:
            logger.error(f"AI error: {e}")
            return f"שגיאה: {e}"

    def clear(self):
        self.history = []

# ============================================
# Screen Capture (inline)
# ============================================
class ScreenCapture:
    def capture_to_base64(self, resize=None, quality=80):
        try:
            import pyautogui
            from PIL import Image
            import io
            img = pyautogui.screenshot()
            if resize: img = img.resize(resize, Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality)
            return base64.b64encode(buf.getvalue()).decode()
        except Exception as e:
            logger.error(f"Screen capture error: {e}")
            return None

# ============================================
# TTS (inline)
# ============================================
class TTS:
    def __init__(self):
        self.voice = TTS_VOICE

    async def speak_async(self, text: str):
        logger.info(f"TTS: {text}")
        try:
            import edge_tts
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                tmp = f.name
            comm = edge_tts.Communicate(text=text, voice=self.voice)
            await comm.save(tmp)
            await self._play(tmp)
            try: os.unlink(tmp)
            except: pass
        except Exception as e:
            logger.error(f"TTS error: {e}")

    async def _play(self, path: str):
        import subprocess
        # ffplay
        try:
            p = subprocess.Popen(["ffplay","-nodisp","-autoexit","-loglevel","quiet",path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            while p.poll() is None: await asyncio.sleep(0.1)
            return
        except: pass
        # Windows PowerShell
        try:
            ps = f'''Add-Type -AssemblyName presentationCore
$m=New-Object System.Windows.Media.MediaPlayer
$m.Open("{path}")
while($m.NaturalDuration.TimeSpan -eq $null){{Start-Sleep -Milliseconds 100}}
$d=$m.NaturalDuration.TimeSpan.TotalSeconds
$m.Play()
Start-Sleep -Seconds ($d+0.5)
$m.Close()'''
            p = subprocess.Popen(["powershell","-Command",ps], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            while p.poll() is None: await asyncio.sleep(0.1)
            return
        except: pass
        logger.warning("No audio playback available")

    def speak_to_file(self, text: str, path: str) -> str:
        try:
            import edge_tts
            asyncio.run(edge_tts.Communicate(text=text, voice=self.voice).save(path))
            return path
        except Exception as e:
            logger.error(f"TTS file error: {e}")
            return None

# ============================================
# Command Router (inline)
# ============================================
import re
from enum import Enum
from dataclasses import dataclass

class CmdType(Enum):
    UI_SIDE = "ui_side"
    UI_CENTER = "ui_center"
    UI_HIDE = "ui_hide"
    UI_SHOW = "ui_show"
    SCREEN = "screen"
    STOP = "stop"
    AI = "ai"
    CLEAR = "clear"

@dataclass
class Cmd:
    type: CmdType
    text: str
    clean: str

CMDS = {
    CmdType.UI_SIDE: [r"שים בצד",r"הצד",r"לצד",r"תזוז הצידה",r"סיידבר",r"sidebar"],
    CmdType.UI_CENTER: [r"חזור לאמצע",r"אמצע",r"תחזור",r"מרכז",r"באמצע"],
    CmdType.UI_HIDE: [r"הסתר",r"תסתיר",r"תעלם",r"hide"],
    CmdType.UI_SHOW: [r"הראה",r"הצג",r"show"],
    CmdType.SCREEN: [r"צלם מסך",r"מה יש במסך",r"מה קורה במסך",r"נתח מסך",r"screenshot",r"מה יש על המסך"],
    CmdType.STOP: [r"תפסיק",r"עצור",r"סיים",r"ביי",r"להתראות"],
    CmdType.CLEAR: [r"נקה היסטוריה",r"נקה",r"clear"],
}
COMPILED = {k: [re.compile(p, re.I) for p in v] for k, v in CMDS.items()}

def route(text: str) -> Cmd:
    clean = text.strip()
    for ww in ["אדיאל גוניון","אדיאל","גוניון"]:
        clean = clean.replace(ww, "").strip()
    for ct, pats in COMPILED.items():
        for p in pats:
            if p.search(clean):
                return Cmd(ct, text, clean)
    return Cmd(CmdType.AI, text, clean)

# ============================================
# FastAPI Backend
# ============================================
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(title="אדיאל גוניון")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ai = AIEngine()
sc = ScreenCapture()
tts = TTS()
connections = []
state = {"status": "idle", "position": "center", "visible": True, "session": str(uuid.uuid4())}

async def broadcast(event, data=None):
    for ws in connections[:]:
        try: await ws.send_json({"event": event, "data": data or {}})
        except: connections.remove(ws)

@app.get("/")
async def root(): return {"name": "אדיאל גוניון", "version": "1.0.0"}

@app.get("/api/status")
async def get_status(): return {**state, "wake_word": WAKE_WORD, "ai_provider": AI_PROVIDER}

class ChatReq(BaseModel):
    message: str
    include_screen: bool = False

@app.post("/api/chat")
async def chat(req: ChatReq):
    img = sc.capture_to_base64((800,600)) if req.include_screen else None
    return {"response": ai.chat(req.message, img)}

@app.post("/api/command")
async def cmd(text: str):
    p = route(text)
    if p.type == CmdType.UI_SIDE:
        state["position"] = "side"
        await broadcast("hud_position", {"position": "side"})
    elif p.type == CmdType.UI_CENTER:
        state["position"] = "center"
        await broadcast("hud_position", {"position": "center"})
    elif p.type == CmdType.CLEAR:
        ai.clear()
    return {"type": p.type.value, "clean_text": p.clean}

@app.get("/api/screen")
async def screen():
    b = sc.capture_to_base64((1280,720))
    if b: return {"image": b}
    return {"error": "capture failed"}

@app.post("/api/analyze-screen")
async def analyze(question: str = "מה יש על המסך?"):
    b = sc.capture_to_base64((1280,720))
    if b: return {"analysis": ai.chat(question, b)}
    return {"error": "capture failed"}

class TTSReq(BaseModel):
    text: str
@app.post("/api/tts")
async def do_tts(req: TTSReq):
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp = f.name
    tts.speak_to_file(req.text, tmp)
    return FileResponse(tmp, media_type="audio/mpeg", filename="tts.mp3")

@app.post("/api/hud/position")
async def hud_pos(position: str):
    state["position"] = position
    await broadcast("hud_position", {"position": position})
    return {"position": position}

@app.get("/api/history")
async def history(): return {"history": ai.history}

@app.post("/api/history/clear")
async def clear_hist(): ai.clear(); return {"ok": True}

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    connections.append(ws)
    await ws.send_json({"event": "connected", "data": {**state, "wake_word": WAKE_WORD}})
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            ev = msg.get("event")
            d = msg.get("data", {})
            if ev == "chat_message":
                txt = d.get("text", "")
                p = route(txt)
                if p.type == CmdType.AI:
                    img = None
                    try: img = sc.capture_to_base64((800,600))
                    except: pass
                    resp = ai.chat(p.clean, img)
                    await ws.send_json({"event": "ai_response", "data": {"text": resp, "command": txt}})
                elif p.type == CmdType.UI_SIDE:
                    state["position"] = "side"
                    await broadcast("hud_position", {"position": "side"})
                elif p.type == CmdType.UI_CENTER:
                    state["position"] = "center"
                    await broadcast("hud_position", {"position": "center"})
                elif p.type == CmdType.CLEAR:
                    ai.clear()
                    await ws.send_json({"event": "history_cleared", "data": {}})
            elif ev == "request_screen":
                b = sc.capture_to_base64((800,600))
                if b: await ws.send_json({"event": "screen_update", "data": {"image": b}})
            elif ev == "ping":
                await ws.send_json({"event": "pong"})
    except WebSocketDisconnect:
        if ws in connections: connections.remove(ws)

# ============================================
# EMBEDDED HUD HTML (no external files needed!)
# ============================================
HUD_HTML = r"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>אדיאל גוניון</title>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;500;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;user-select:none}
body{background:transparent;overflow:hidden;font-family:'Rajdhani',sans-serif;color:#e0f0ff}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-thumb{background:#00d4ff44;border-radius:3px}

.panel{
  background:linear-gradient(135deg,rgba(10,14,23,.92),rgba(13,21,37,.85),rgba(10,14,23,.92));
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border:1px solid rgba(0,212,255,.25);
  box-shadow:0 0 20px rgba(0,212,255,.08),inset 0 0 20px rgba(0,212,255,.04);
  border-radius:10px;
}
.glow{text-shadow:0 0 10px rgba(0,212,255,.5)}

/* Arc Reactor */
.arc{position:relative;width:56px;height:56px}
.arc-ring{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(0,212,255,.3);transition:all .5s}
.arc-ring.active{border-color:#00d4ff;box-shadow:0 0 15px rgba(0,212,255,.4);animation:pulseG 1s ease-in-out infinite}
.arc-mid{position:absolute;inset:20%;border-radius:50%;border:1px solid rgba(0,212,255,.15);transition:all .5s}
.arc-mid.active{border-color:rgba(255,107,53,.5)}
.arc-core{position:absolute;inset:35%;border-radius:50%;transition:all .3s}
.arc-dot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;transition:all .3s}

@keyframes pulseG{0%,100%{box-shadow:0 0 8px rgba(0,212,255,.3)}50%{box-shadow:0 0 20px rgba(0,212,255,.6)}}
@keyframes breathe{0%,100%{opacity:.6}50%{opacity:1}}
@keyframes slideIn{0%{opacity:0;transform:translateX(15px)}100%{opacity:1;transform:translateX(0)}}

/* Waveform */
.wave{display:flex;align-items:end;justify-content:center;gap:2px;height:28px}
.wave-bar{width:3px;border-radius:2px;transition:height .08s}

/* Chat */
.msg{animation:slideIn .25s ease-out}
.msg-user{background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.15);border-radius:8px;padding:6px 10px;max-width:85%;margin-left:auto}
.msg-ai{background:rgba(13,21,37,.6);border:1px solid rgba(0,212,255,.12);border-radius:8px;padding:6px 10px;max-width:85%;margin-right:auto}

/* Input */
.input{
  width:100%;padding:7px 10px;border-radius:6px;font-family:'Rajdhani',sans-serif;font-size:14px;
  color:#e0f0ff;outline:none;direction:rtl;
  background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.18);
}
.input:focus{border-color:rgba(0,212,255,.45);box-shadow:0 0 8px rgba(0,212,255,.12)}

/* Buttons */
.btn{
  padding:3px 10px;border-radius:4px;font-family:'Rajdhani',sans-serif;font-size:12px;
  border:1px solid rgba(0,212,255,.25);background:rgba(0,212,255,.04);color:#00d4ff;
  cursor:pointer;transition:all .15s;
}
.btn:hover{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.5)}

/* Status dot */
.dot{width:7px;height:7px;border-radius:50%;animation:breathe 2s ease-in-out infinite}
.dot-idle{background:#00ff88;box-shadow:0 0 6px #00ff88}
.dot-listen{background:#00d4ff;box-shadow:0 0 6px #00d4ff;animation:pulseG .8s ease-in-out infinite}
.dot-proc{background:#ffaa00;box-shadow:0 0 6px #ffaa00;animation:pulseG .4s ease-in-out infinite}
.dot-speak{background:#00ff88;box-shadow:0 0 6px #00ff88}
</style>
</head>
<body>
<div id="app" style="height:100vh;display:flex;flex-direction:column;padding:6px">
  <div class="panel" style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:0">

    <!-- Header -->
    <div style="padding:10px 14px;border-bottom:1px solid rgba(0,212,255,.12);display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="arc">
          <div class="arc-ring" id="arcRing"></div>
          <div class="arc-mid" id="arcMid"></div>
          <div class="arc-core" id="arcCore" style="background:rgba(0,212,255,.15)"></div>
          <div class="arc-dot" id="arcDot" style="background:rgba(0,212,255,.5)"></div>
        </div>
        <div>
          <div class="glow" style="font-size:18px;font-weight:700;color:#00d4ff;letter-spacing:1px">אדיאל גוניון</div>
          <div style="font-size:10px;color:#5a7a9a;font-family:'Share Tech Mono',monospace">SMART ASSISTANT v1.0</div>
        </div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="btn" onclick="moveSide()" title="שים בצד">◫</button>
        <button class="btn" onclick="moveCenter()" title="אמצע">◼</button>
      </div>
    </div>

    <!-- Status -->
    <div style="padding:4px 14px;border-bottom:1px solid rgba(0,212,255,.08);display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:6px">
        <div class="dot dot-idle" id="statusDot"></div>
        <span id="statusText" style="font-size:11px;color:#5a7a9a;font-family:'Share Tech Mono',monospace">מוכן</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px">
        <span id="connStatus" style="font-size:9px;color:#5a7a9a;font-family:'Share Tech Mono',monospace">● CONNECTED</span>
      </div>
    </div>

    <!-- Waveform -->
    <div style="padding:6px 14px;border-bottom:1px solid rgba(0,212,255,.06)">
      <div class="wave" id="waveform"></div>
    </div>

    <!-- Chat -->
    <div id="chat" style="flex:1;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:6px">
      <div id="welcome" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:.5;text-align:center;gap:8px">
        <div style="font-size:28px">⚡</div>
        <div style="font-size:13px;color:#5a7a9a">אמור <b style="color:#00d4ff">"אדיאל גוניון"</b> כדי להתחיל</div>
        <div style="font-size:10px;color:#5a7a9a;opacity:.5;font-family:'Share Tech Mono',monospace">או הקלד פקודה למטה</div>
      </div>
    </div>

    <!-- Input -->
    <div style="padding:8px 12px;border-top:1px solid rgba(0,212,255,.1)">
      <form id="form" style="display:flex;gap:6px">
        <input class="input" id="input" placeholder="הקלד פקודה או שאלה..." autocomplete="off">
        <button type="submit" class="btn" style="padding:3px 12px">⚡</button>
      </form>
      <div style="display:flex;gap:4px;margin-top:6px;overflow-x:auto;padding-bottom:2px">
        <button class="btn" style="font-size:10px;white-space:nowrap" onclick="sendCmd('מה יש על המסך?')">צלם מסך</button>
        <button class="btn" style="font-size:10px;white-space:nowrap" onclick="sendCmd('שים בצד')">שים בצד</button>
        <button class="btn" style="font-size:10px;white-space:nowrap" onclick="sendCmd('חזור לאמצע')">אמצע</button>
        <button class="btn" style="font-size:10px;white-space:nowrap" onclick="clearChat()">נקה</button>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:3px 14px;border-top:1px solid rgba(0,212,255,.06);display:flex;justify-content:space-between">
      <span style="font-size:8px;color:#5a7a9a;opacity:.4;font-family:'Share Tech Mono',monospace">WAKE: "אדיאל גוניון"</span>
      <span id="timeSpan" style="font-size:8px;color:#5a7a9a;opacity:.4;font-family:'Share Tech Mono',monospace"></span>
    </div>
  </div>
</div>

<script>
const WS_URL = 'ws://localhost:8765/ws';
let ws, status='idle', waveActive=false, waveBars=[];

// Init waveform
const wf = document.getElementById('waveform');
for(let i=0;i<32;i++){
  const b=document.createElement('div');
  b.className='wave-bar';
  b.style.height='15%';
  b.style.background='linear-gradient(to top,#00d4ff,#00d4ff)';
  b.style.opacity='0.3';
  wf.appendChild(b);
  waveBars.push(b);
}

// WebSocket
function connect(){
  ws=new WebSocket(WS_URL);
  ws.onopen=()=>{document.getElementById('connStatus').textContent='● CONNECTED';document.getElementById('connStatus').style.color='#00ff88'};
  ws.onclose=()=>{document.getElementById('connStatus').textContent='○ OFFLINE';document.getElementById('connStatus').style.color='#ff3366';setTimeout(connect,2000)};
  ws.onmessage=(e)=>{
    const m=JSON.parse(e.data);
    if(m.event==='ai_response'){
      addMsg(m.data.command||'',true);
      addMsg(m.data.text||'',false);
      setStatus('idle');
    }
    if(m.event==='connected') setStatus('idle');
    if(m.event==='hud_position' && window.pywebview) {
      if(m.data.position==='side') window.pywebview.api.move_side();
      else window.pywebview.api.move_center();
    }
  };
}
connect();

function send(event,data={}){if(ws?.readyState===1)ws.send(JSON.stringify({event,data}))}
function sendCmd(t){addMsg(t,true);send('chat_message',{text:t});setStatus('processing')}
function addMsg(t,isUser){
  const w=document.getElementById('welcome');if(w)w.remove();
  const c=document.getElementById('chat');
  const d=document.createElement('div');
  d.className='msg '+(isUser?'msg-user':'msg-ai');
  if(!isUser){const l=document.createElement('div');l.style.cssText='font-size:9px;color:rgba(0,212,255,.4);margin-bottom:2px;font-family:"Share Tech Mono",monospace';l.textContent='אדיאל גוניון';d.appendChild(l)}
  const s=document.createElement('div');s.style.fontSize='13px';s.style.lineHeight='1.5';s.textContent=t;d.appendChild(s);
  const tm=document.createElement('div');tm.style.cssText='font-size:8px;color:#5a7a9a;margin-top:2px;font-family:"Share Tech Mono",monospace;text-align:left';tm.textContent=new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});d.appendChild(tm);
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}
function clearChat(){const c=document.getElementById('chat');c.innerHTML='';send('chat_message',{text:'נקה'})}

function setStatus(s){
  status=s;
  const dot=document.getElementById('statusDot'),txt=document.getElementById('statusText');
  const ring=document.getElementById('arcRing'),mid=document.getElementById('arcMid'),core=document.getElementById('arcCore'),dot2=document.getElementById('arcDot');
  dot.className='dot';
  if(s==='idle'){dot.classList.add('dot-idle');txt.textContent='מוכן';ring.classList.remove('active');mid.classList.remove('active');core.style.background='rgba(0,212,255,.15)';dot2.style.background='rgba(0,212,255,.5)'}
  else if(s==='listening'){dot.classList.add('dot-listen');txt.textContent='מקשיב...';ring.classList.add('active');mid.classList.add('active');core.style.background='rgba(0,212,255,.35)';dot2.style.background='#00d4ff'}
  else if(s==='processing'){dot.classList.add('dot-proc');txt.textContent='מעבד...';ring.classList.add('active');mid.classList.add('active');core.style.background='rgba(255,170,0,.3)';dot2.style.background='#ffaa00'}
  else if(s==='speaking'){dot.classList.add('dot-speak');txt.textContent='מדבר...';ring.classList.add('active');mid.classList.add('active');core.style.background='rgba(0,255,136,.25)';dot2.style.background='#00ff88'}
  waveActive=(s==='listening'||s==='processing');
}

// Animate waveform
function animWave(){
  waveBars.forEach(b=>{
    if(waveActive){const h=10+Math.random()*90;b.style.height=h+'%';b.style.background='linear-gradient(to top,#00d4ff,'+(h>60?'#ff6b35':'#00d4ff')+')';b.style.opacity=0.4+h/100*0.6}
    else{b.style.height='15%';b.style.background='linear-gradient(to top,#00d4ff,#00d4ff)';b.style.opacity='0.3'}
  });
  requestAnimationFrame(animWave);
}
animWave();

// Form
document.getElementById('form').onsubmit=(e)=>{e.preventDefault();const i=document.getElementById('input');if(i.value.trim()){sendCmd(i.value.trim());i.value=''}};

// pywebview API
function moveSide(){if(window.pywebview)window.pywebview.api.move_side()}
function moveCenter(){if(window.pywebview)window.pywebview.api.move_center()}

// Clock
setInterval(()=>{document.getElementById('timeSpan').textContent=new Date().toLocaleTimeString('he-IL')},1000);
</script>
</body>
</html>
"""

@app.get("/hud")
async def hud_page():
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=HUD_HTML)

# ============================================
# pywebview Desktop Window
# ============================================
class Api:
    """API exposed to the pywebview window."""
    def move_side(self):
        if hasattr(Api, 'window') and Api.window:
            Api.window.move(10, 50)
            Api.window.resize(380, 700)
    def move_center(self):
        if hasattr(Api, 'window') and Api.window:
            import screeninfo
            monitors = screeninfo.get_monitors()
            m = monitors[0]
            x = m.x + (m.width - 520) // 2
            y = m.y + (m.height - 700) // 2
            Api.window.move(x, y)
            Api.window.resize(520, 700)
    def move_center_simple(self):
        if hasattr(Api, 'window') and Api.window:
            Api.window.move(700, 150)
            Api.window.resize(520, 700)

def start_server():
    """Start FastAPI in a thread."""
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=BACKEND_PORT, log_level="warning")

def open_window():
    """Open pywebview desktop window."""
    import webview
    api = Api()
    w = webview.create_window(
        title="אדיאל גוניון",
        url=f"http://127.0.0.1:{BACKEND_PORT}/hud",
        width=520,
        height=700,
        resizable=True,
        frameless=True,
        easy_drag=True,
        transparent=False,
        js_api=api,
        background_color='#0a0e17',
    )
    Api.window = w
    webview.start(debug=False)

# ============================================
# MAIN
# ============================================
if __name__ == "__main__":
    logger.info("=" * 50)
    logger.info("אדיאל גוניון - Adial Gonian Starting...")
    logger.info(f"AI: {AI_PROVIDER} | Wake: {WAKE_WORD}")
    logger.info("=" * 50)

    # Start backend in thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2)

    # Open desktop window
    open_window()
