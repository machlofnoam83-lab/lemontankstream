"""
Command Router Module
Routes detected commands to appropriate handlers (UI control, screen actions, AI queries).
"""
import logging
import re
from enum import Enum
from typing import Callable, Dict, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


class CommandType(Enum):
    """Types of commands the assistant can handle."""
    UI_MOVE_SIDE = "ui_move_side"
    UI_MOVE_CENTER = "ui_move_center"
    UI_HIDE = "ui_hide"
    UI_SHOW = "ui_show"
    SCREEN_CAPTURE = "screen_capture"
    SCREEN_ANALYZE = "screen_analyze"
    STOP_LISTENING = "stop_listening"
    AI_QUERY = "ai_query"
    SYSTEM_ACTION = "system_action"
    UNKNOWN = "unknown"


@dataclass
class ParsedCommand:
    """Parsed command with type and parameters."""
    type: CommandType
    original_text: str
    clean_text: str  # Text without command keywords (for AI)
    params: dict


class CommandRouter:
    """
    Routes voice commands to appropriate handlers.
    Recognizes Hebrew command patterns and dispatches them.
    """

    # Command patterns (Hebrew)
    COMMAND_PATTERNS = {
        CommandType.UI_MOVE_SIDE: [
            r"שים בצד",
            r"הצד",
            r"לצד",
            r"תזוז הצידה",
            r"דוק",
            r"סיידבר",
            r"sidebar",
            r"דוק.*צד",
        ],
        CommandType.UI_MOVE_CENTER: [
            r"חזור לאמצע",
            r"אמצע",
            r"תחזור",
            r"מרכז",
            r"תחזיר לאמצע",
            r"באמצע",
        ],
        CommandType.UI_HIDE: [
            r"הסתר",
            r"תסתיר",
            r"תעלם",
            r"היסתרות",
            r"hide",
        ],
        CommandType.UI_SHOW: [
            r"הראה",
            r"הצג",
            r"תחזור",
            r"תראה",
            r"show",
        ],
        CommandType.SCREEN_CAPTURE: [
            r"צלם מסך",
            r"מה יש במסך",
            r"מה קורה במסך",
            r"תראה מסך",
            r"מה פתוח",
            r"מה יש על המסך",
            r"נתח מסך",
            r"screenshot",
        ],
        CommandType.STOP_LISTENING: [
            r"תפסיק",
            r"די",
            r"עצור",
            r"סיים",
            r"ביי",
            r"להתראות",
        ],
    }

    def __init__(self):
        self._handlers: Dict[CommandType, Callable] = {}
        self._default_handler: Optional[Callable] = None
        self._compile_patterns()

    def _compile_patterns(self):
        """Pre-compile regex patterns for faster matching."""
        self._compiled = {}
        for cmd_type, patterns in self.COMMAND_PATTERNS.items():
            self._compiled[cmd_type] = [re.compile(p, re.IGNORECASE) for p in patterns]

    def register_handler(self, command_type: CommandType, handler: Callable):
        """Register a handler for a command type."""
        self._handlers[command_type] = handler

    def register_default_handler(self, handler: Callable):
        """Register default handler for unrecognized commands (AI query)."""
        self._default_handler = handler

    def parse(self, text: str) -> ParsedCommand:
        """
        Parse text and determine command type.
        
        Args:
            text: recognized speech text
            
        Returns:
            ParsedCommand with type and cleaned text
        """
        clean_text = text.strip()
        
        # Remove wake word from text
        wake_words = ["אדיאל גוניון", "אדיאל גוניון", "אדיאל", "גוניון"]
        for ww in wake_words:
            clean_text = clean_text.replace(ww, "").strip()

        # Check command patterns
        for cmd_type, patterns in self._compiled.items():
            for pattern in patterns:
                if pattern.search(clean_text):
                    return ParsedCommand(
                        type=cmd_type,
                        original_text=text,
                        clean_text=clean_text,
                        params={},
                    )

        # Default: AI query
        return ParsedCommand(
            type=CommandType.AI_QUERY,
            original_text=text,
            clean_text=clean_text,
            params={},
        )

    def route(self, text: str) -> ParsedCommand:
        """
        Parse and route a command to its handler.
        
        Args:
            text: recognized speech text
            
        Returns:
            ParsedCommand (handler is also called if registered)
        """
        parsed = self.parse(text)
        logger.info(f"Routed command: {parsed.type.value} | Text: {parsed.clean_text}")

        # Call handler if registered
        handler = self._handlers.get(parsed.type)
        if handler:
            try:
                handler(parsed)
            except Exception as e:
                logger.error(f"Handler error for {parsed.type}: {e}")
        elif self._default_handler and parsed.type == CommandType.AI_QUERY:
            try:
                self._default_handler(parsed)
            except Exception as e:
                logger.error(f"Default handler error: {e}")

        return parsed

    def route_async(self, text: str, callback: Optional[Callable] = None):
        """
        Route command asynchronously.
        """
        import threading
        
        def _run():
            result = self.route(text)
            if callback:
                callback(result)
        
        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
