"""
Text-to-Speech Module
Uses Edge-TTS for natural Hebrew speech synthesis.
"""
import asyncio
import io
import logging
import tempfile
from pathlib import Path
from typing import Optional

from config import TTS_VOICE

logger = logging.getLogger(__name__)


class TextToSpeech:
    """
    Hebrew text-to-speech using Edge-TTS (Microsoft Edge's TTS engine).
    Supports Hebrew voices: he-IL-HilaNeural (female), he-IL-AvriNeural (male)
    """

    def __init__(self, voice: str = None):
        self.voice = voice or TTS_VOICE
        self._playback_available = self._check_playback()

    def _check_playback(self) -> bool:
        """Check if audio playback is available."""
        try:
            import sounddevice as sd
            return True
        except ImportError:
            logger.warning("sounddevice not available - TTS playback disabled")
            return False

    async def _synthesize(self, text: str, output_path: str = None, rate: str = "+0%", pitch: str = "+0Hz") -> bytes:
        """
        Synthesize speech using Edge-TTS.
        
        Args:
            text: Hebrew text to speak
            output_path: optional path to save audio file
            rate: speech rate adjustment (e.g., "+20%", "-10%")
            pitch: pitch adjustment
            
        Returns:
            audio bytes (MP3 format)
        """
        try:
            import edge_tts
        except ImportError:
            raise ImportError("edge-tts not installed. Install with: pip install edge-tts")

        communicate = edge_tts.Communicate(
            text=text,
            voice=self.voice,
            rate=rate,
            pitch=pitch,
        )

        audio_buffer = io.BytesIO()

        if output_path:
            await communicate.save(output_path)
            with open(output_path, "rb") as f:
                return f.read()
        else:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])
            return audio_buffer.getvalue()

    def synthesize(self, text: str, output_path: str = None, rate: str = "+0%") -> bytes:
        """
        Synchronous wrapper for text-to-speech synthesis.
        
        Args:
            text: Hebrew text to speak
            output_path: optional path to save audio file
            rate: speech rate adjustment
            
        Returns:
            audio bytes (MP3 format)
        """
        return asyncio.run(self._synthesize(text, output_path, rate))

    async def _speak_async(self, text: str, rate: str = "+0%"):
        """
        Synthesize and immediately play audio.
        """
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            temp_path = f.name

        try:
            await self._synthesize(text, temp_path, rate)
            
            if self._playback_available:
                await self._play_audio(temp_path)
            else:
                logger.info(f"TTS output saved to: {temp_path}")
                
        finally:
            # Clean up
            try:
                Path(temp_path).unlink()
            except:
                pass

    async def _play_audio(self, file_path: str):
        """Play audio file using available system tools."""
        # Try ffplay (ffmpeg) first
        try:
            import subprocess
            process = subprocess.Popen(
                ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", file_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            while process.poll() is None:
                await asyncio.sleep(0.1)
            return
        except FileNotFoundError:
            pass

        # Try pygame-ce (newer pygame)
        try:
            import pygame
            pygame.mixer.init()
            pygame.mixer.music.load(file_path)
            pygame.mixer.music.play()
            while pygame.mixer.music.get_busy():
                await asyncio.sleep(0.1)
            pygame.mixer.quit()
            return
        except Exception:
            pass

        # Windows: try PowerShell audio playback
        try:
            import subprocess
            # Use Windows Media Player via PowerShell
            ps_cmd = f'''
            Add-Type -AssemblyName presentationCore
            $media = New-Object System.Windows.Media.MediaPlayer
            $media.Open("{file_path}")
            while ($media.NaturalDuration.TimeSpan -eq $null) {{ Start-Sleep -Milliseconds 100 }}
            $duration = $media.NaturalDuration.TimeSpan.TotalSeconds
            $media.Play()
            Start-Sleep -Seconds ($duration + 0.5)
            $media.Close()
            '''
            process = subprocess.Popen(
                ["powershell", "-Command", ps_cmd],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            while process.poll() is None:
                await asyncio.sleep(0.1)
            return
        except Exception:
            pass

        logger.warning("No audio playback method available. Audio saved to file.")

    async def speak_async(self, text: str, rate: str = "+0%"):
        """
        Async speak - synthesize and play audio (for use in running event loop).
        
        Args:
            text: Hebrew text to speak
            rate: speech rate adjustment
        """
        logger.info(f"Speaking: {text}")
        await self._speak_async(text, rate)

    def speak(self, text: str, rate: str = "+0%"):
        """
        Synchronous speak - synthesize and play audio.
        Tries async first (for running event loop), falls back to asyncio.run().
        
        Args:
            text: Hebrew text to speak
            rate: speech rate adjustment
        """
        logger.info(f"Speaking: {text}")
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're inside a running event loop - schedule the coroutine
                asyncio.ensure_future(self._speak_async(text, rate))
            else:
                loop.run_until_complete(self._speak_async(text, rate))
        except RuntimeError:
            asyncio.run(self._speak_async(text, rate))

    def speak_to_file(self, text: str, output_path: str, rate: str = "+0%") -> str:
        """
        Synthesize speech and save to file (for streaming to frontend).
        
        Args:
            text: Hebrew text to speak
            output_path: path to save audio file
            rate: speech rate adjustment
            
        Returns:
            path to saved audio file
        """
        asyncio.run(self._synthesize(text, output_path, rate))
        return output_path

    @staticmethod
    def list_voices() -> list:
        """List available Edge-TTS voices (Hebrew ones)."""
        async def _list():
            import edge_tts
            voices = await edge_tts.list_voices()
            hebrew_voices = [v for v in voices if v["Locale"].startswith("he-")]
            return hebrew_voices
        return asyncio.run(_list())
