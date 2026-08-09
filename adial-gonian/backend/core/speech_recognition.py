"""
Speech Recognition Module
Uses faster-whisper for accurate Hebrew speech-to-text after wake word detection.
"""
import io
import logging
import tempfile
import wave
from typing import Optional

import numpy as np

from config import WHISPER_MODEL, PRIMARY_LANGUAGE

logger = logging.getLogger(__name__)


class SpeechRecognizer:
    """
    Speech-to-text using faster-whisper.
    After wake word is detected, records a full command and transcribes it.
    """

    def __init__(self, model_size: str = None, language: str = None):
        self.model_size = model_size or WHISPER_MODEL
        self.language = language or PRIMARY_LANGUAGE
        self._model = None

    def _ensure_model(self):
        """Lazy-load the Whisper model."""
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
                logger.info(f"Loading Whisper model: {self.model_size}")
                self._model = WhisperModel(
                    self.model_size,
                    compute_type="int8",
                    device="cpu",
                )
                logger.info("Whisper model loaded successfully")
            except ImportError:
                logger.error("faster-whisper not installed. Install with: pip install faster-whisper")
                raise
        return self._model

    def record_command(self, max_duration: float = 10.0, silence_threshold: float = 1.5) -> np.ndarray:
        """
        Record audio after wake word detection.
        Stops after silence_threshold seconds of silence or max_duration.
        
        Returns:
            numpy array of float32 audio data
        """
        try:
            import sounddevice as sd
        except ImportError:
            raise ImportError("sounddevice not installed. Install with: pip install sounddevice")

        sample_rate = 16000
        silence_samples = int(silence_threshold * sample_rate)
        max_samples = int(max_duration * sample_rate)
        
        all_audio = []
        silence_buffer = []
        is_speaking = False
        energy_threshold = 0.02  # Adjust based on environment
        
        logger.info("Recording command... (speak now)")

        def callback(indata, frames, time_info, status):
            nonlocal is_speaking
            chunk = indata.flatten()
            energy = np.abs(chunk).mean()
            
            if energy > energy_threshold:
                is_speaking = True
                all_audio.extend(chunk.tolist())
                silence_buffer.clear()
            elif is_speaking:
                silence_buffer.extend(chunk.tolist())
                all_audio.extend(chunk.tolist())
                
                if len(silence_buffer) >= silence_samples:
                    raise sd.CallbackStop

        with sd.InputStream(
            samplerate=sample_rate,
            blocksize=1024,
            dtype="float32",
            channels=1,
            callback=callback,
        ):
            sd.sleep(int(max_duration * 1000))

        audio = np.array(all_audio, dtype=np.float32)
        logger.info(f"Recorded {len(audio) / sample_rate:.1f}s of audio")
        return audio

    def transcribe(self, audio: np.ndarray = None, audio_path: str = None) -> str:
        """
        Transcribe audio to text using Whisper.
        
        Args:
            audio: numpy array of float32 audio data
            audio_path: path to audio file (alternative to audio array)
            
        Returns:
            transcribed text string
        """
        model = self._ensure_model()

        if audio_path:
            segments, info = model.transcribe(
                audio_path,
                language=self.language if self.language != "he" else "he",
                beam_size=5,
                vad_filter=True,
            )
        elif audio is not None:
            # Save to temp WAV file for whisper
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                temp_path = f.name
                with wave.open(temp_path, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(16000)
                    # Convert float32 to int16
                    audio_int16 = (audio * 32767).astype(np.int16)
                    wf.writeframes(audio_int16.tobytes())

            segments, info = model.transcribe(
                temp_path,
                language=self.language if self.language != "he" else "he",
                beam_size=5,
                vad_filter=True,
            )
            
            # Clean up temp file
            import os
            try:
                os.unlink(temp_path)
            except:
                pass
        else:
            raise ValueError("Either audio or audio_path must be provided")

        text = " ".join(seg.text for seg in segments).strip()
        logger.info(f"Transcribed: {text}")
        return text

    def listen_and_transcribe(self, max_duration: float = 10.0) -> str:
        """
        Convenience method: record audio and transcribe in one call.
        """
        audio = self.record_command(max_duration=max_duration)
        if len(audio) < 1600:  # Less than 0.1s of audio
            return ""
        return self.transcribe(audio=audio)
