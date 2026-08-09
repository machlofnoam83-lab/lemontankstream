"""
Wake Word Detection Module
Uses Vosk for lightweight continuous listening, detects 'אדיאל גוניון'
"""
import json
import logging
import queue
import threading
import time
from typing import Callable, Optional

from config import WAKE_WORD, VOSK_MODEL_PATH

logger = logging.getLogger(__name__)


class WakeWordDetector:
    """
    Continuously listens for the wake word 'אדיאל גוניון' using Vosk.
    Once detected, triggers a callback and pauses detection while the command is processed.
    """

    def __init__(self, wake_word: str = None, on_detected: Optional[Callable] = None):
        self.wake_word = wake_word or WAKE_WORD
        self.on_detected = on_detected
        self.is_listening = False
        self.is_paused = False
        self._audio_queue = queue.Queue()
        self._thread = None
        self._vosk_available = False

    def _init_vosk(self):
        """Initialize Vosk model and recognizer."""
        try:
            import vosk
            from pathlib import Path

            model_path = Path(VOSK_MODEL_PATH)
            if not model_path.exists():
                logger.warning(f"Vosk model not found at {model_path}. Falling back to simple detection.")
                return False

            self._model = vosk.Model(str(model_path))
            self._recognizer = vosk.KaldiRecognizer(self._model, 16000)
            self._vosk_available = True
            logger.info(f"Vosk initialized with model: {model_path}")
            return True
        except ImportError:
            logger.warning("Vosk not installed. Install with: pip install vosk")
            return False
        except Exception as e:
            logger.error(f"Failed to initialize Vosk: {e}")
            return False

    def _init_audio(self):
        """Initialize microphone audio stream."""
        try:
            import sounddevice as sd

            self._sample_rate = 16000
            self._channels = 1
            self._dtype = "int16"
            logger.info("Audio device initialized")
            return True
        except ImportError:
            logger.error("sounddevice not installed. Install with: pip install sounddevice")
            return False

    def _audio_callback(self, indata, frames, time_info, status):
        """Callback for audio stream - puts audio chunks into queue."""
        if status:
            logger.warning(f"Audio status: {status}")
        self._audio_queue.put(bytes(indata))

    def _listen_loop(self):
        """Main listening loop using Vosk for continuous speech recognition."""
        import sounddevice as sd

        with sd.RawInputStream(
            samplerate=16000,
            blocksize=8000,
            dtype="int16",
            channels=1,
            callback=self._audio_callback,
        ):
            while self.is_listening:
                if self.is_paused:
                    time.sleep(0.1)
                    continue

                try:
                    data = self._audio_queue.get(timeout=1)
                except queue.Empty:
                    continue

                if self._vosk_available:
                    import vosk
                    if self._recognizer.AcceptWaveform(data):
                        result = json.loads(self._recognizer.Result())
                        text = result.get("text", "")
                    else:
                        result = json.loads(self._recognizer.PartialResult())
                        text = result.get("partial", "")

                    if text and self.wake_word in text:
                        logger.info(f"Wake word detected: {text}")
                        if self.on_detected:
                            self.is_paused = True
                            self.on_detected(text)
                            self.is_paused = False
                else:
                    # Fallback: simple energy-based detection
                    # In production, you'd use a proper wake word engine
                    pass

    def _listen_loop_simple(self):
        """
        Simplified listening loop that uses sounddevice + whisper
        for wake word detection when Vosk is not available.
        """
        import sounddevice as sd
        import numpy as np

        CHUNK_DURATION = 3.0  # Listen in 3-second chunks
        chunk_samples = int(16000 * CHUNK_DURATION)

        logger.info("Starting simple wake word detection (record chunk -> whisper)")

        while self.is_listening:
            if self.is_paused:
                time.sleep(0.1)
                continue

            try:
                # Record a chunk of audio
                audio_data = sd.rec(
                    frames=chunk_samples,
                    samplerate=16000,
                    channels=1,
                    dtype="float32",
                )
                sd.wait()

                # Check energy level (skip if too quiet)
                energy = np.abs(audio_data).mean()
                if energy < 0.01:
                    continue

                # Use Whisper for quick transcription
                try:
                    from faster_whisper import WhisperModel
                    model = WhisperModel("tiny", compute_type="int8")
                    segments, _ = model.transcribe(
                        audio_data.flatten().astype(np.float32),
                        language="he",
                        beam_size=1,
                    )
                    text = " ".join(seg.text for seg in segments).strip()

                    if self.wake_word in text or self._fuzzy_match(text):
                        logger.info(f"Wake word detected in: {text}")
                        if self.on_detected:
                            self.is_paused = True
                            self.on_detected(text)
                            self.is_paused = False

                except Exception as e:
                    logger.debug(f"Whisper detection error: {e}")

            except Exception as e:
                logger.error(f"Audio capture error: {e}")
                time.sleep(0.5)

    def _fuzzy_match(self, text: str) -> bool:
        """Fuzzy matching for wake word - handles ASR imperfections."""
        # Common misrecognitions of 'אדיאל גוניון'
        variants = [
            "אדיאל גוניון",
            "אדיאל גוניון",
            "אדיאל",
            "גוניון",
            "adial gonian",
            "adial",
        ]
        text_lower = text.lower().strip()
        for variant in variants:
            if variant in text_lower:
                return True
        return False

    def start(self):
        """Start listening for the wake word."""
        if self.is_listening:
            logger.warning("Already listening")
            return

        self.is_listening = True
        vosk_ok = self._init_vosk()
        audio_ok = self._init_audio()

        if not audio_ok:
            logger.error("Cannot start - audio initialization failed")
            self.is_listening = False
            return

        if vosk_ok:
            self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        else:
            self._thread = threading.Thread(target=self._listen_loop_simple, daemon=True)

        self._thread.start()
        logger.info(f"Wake word detector started - listening for '{self.wake_word}'")

    def stop(self):
        """Stop listening for the wake word."""
        self.is_listening = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("Wake word detector stopped")

    def pause(self):
        """Temporarily pause detection."""
        self.is_paused = True

    def resume(self):
        """Resume detection after pause."""
        self.is_paused = False
