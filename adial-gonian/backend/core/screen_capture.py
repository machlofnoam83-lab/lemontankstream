"""
Screen Capture Module
Captures the screen, compresses images, and provides them to the AI for vision analysis.
"""
import base64
import io
import logging
import threading
import time
from typing import Callable, Optional

from PIL import Image

from config import SCREEN_CAPTURE_INTERVAL, SCREEN_CAPTURE_QUALITY

logger = logging.getLogger(__name__)


class ScreenCapture:
    """
    Captures the screen at regular intervals and provides:
    1. Base64-encoded images for AI vision analysis
    2. Screen content analysis
    """

    def __init__(self, interval: float = None, quality: int = None):
        self.interval = interval or SCREEN_CAPTURE_INTERVAL
        self.quality = quality or SCREEN_CAPTURE_QUALITY
        self._is_capturing = False
        self._thread = None
        self._latest_screenshot = None
        self._on_capture: Optional[Callable] = None
        self._pyautogui_available = self._check_pyautogui()

    def _check_pyautogui(self) -> bool:
        try:
            import pyautogui
            return True
        except ImportError:
            logger.warning("pyautogui not installed. Install with: pip install pyautogui")
            return False

    def capture(self) -> Image.Image:
        """
        Take a single screenshot.
        
        Returns:
            PIL Image of the screen
        """
        if not self._pyautogui_available:
            raise ImportError("pyautogui is required for screen capture")

        import pyautogui

        screenshot = pyautogui.screenshot()
        return screenshot

    def capture_to_base64(self, resize: tuple = None, quality: int = None) -> str:
        """
        Capture screen and return as base64-encoded JPEG string.
        
        Args:
            resize: optional (width, height) to resize before encoding
            quality: JPEG quality (1-100)
            
        Returns:
            base64-encoded string of the screenshot
        """
        img = self.capture()
        
        if resize:
            img = img.resize(resize, Image.LANCZOS)
        
        quality = quality or self.quality
        
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=quality)
        b64_string = base64.b64encode(buffer.getvalue()).decode("utf-8")
        
        return b64_string

    def capture_to_bytes(self, resize: tuple = None, quality: int = None) -> bytes:
        """
        Capture screen and return as JPEG bytes.
        
        Args:
            resize: optional (width, height) to resize before encoding
            quality: JPEG quality (1-100)
            
        Returns:
            JPEG bytes of the screenshot
        """
        img = self.capture()
        
        if resize:
            img = img.resize(resize, Image.LANCZOS)
        
        quality = quality or self.quality
        
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=quality)
        
        return buffer.getvalue()

    def save_screenshot(self, path: str) -> str:
        """
        Save screenshot to a file.
        
        Args:
            path: file path to save to
            
        Returns:
            path to saved file
        """
        img = self.capture()
        img.save(path, quality=self.quality)
        logger.info(f"Screenshot saved to: {path}")
        return path

    def _capture_loop(self):
        """Continuous capture loop - runs in background thread."""
        while self._is_capturing:
            try:
                img = self.capture()
                self._latest_screenshot = img
                
                if self._on_capture:
                    self._on_capture(img)
                    
            except Exception as e:
                logger.error(f"Screen capture error: {e}")
                
            time.sleep(self.interval)

    def start_continuous(self, on_capture: Optional[Callable] = None):
        """
        Start continuous screen capture in background thread.
        
        Args:
            on_capture: callback function called with PIL Image on each capture
        """
        if self._is_capturing:
            logger.warning("Already capturing")
            return

        self._on_capture = on_capture
        self._is_capturing = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info(f"Continuous screen capture started (interval: {self.interval}s)")

    def stop_continuous(self):
        """Stop continuous screen capture."""
        self._is_capturing = False
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("Screen capture stopped")

    @property
    def latest_screenshot(self) -> Optional[Image.Image]:
        """Get the most recent screenshot."""
        return self._latest_screenshot

    def get_screen_info(self) -> dict:
        """
        Get basic screen information.
        
        Returns:
            dict with screen dimensions and capture status
        """
        try:
            import pyautogui
            return {
                "width": pyautogui.size().width,
                "height": pyautogui.size().height,
                "is_capturing": self._is_capturing,
                "interval": self.interval,
            }
        except:
            return {
                "width": 1920,
                "height": 1080,
                "is_capturing": self._is_capturing,
                "interval": self.interval,
            }
