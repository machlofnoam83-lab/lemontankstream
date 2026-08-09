"""
AI Engine Module
Integrates with OpenAI GPT-4o or Anthropic Claude for conversation + vision.
"""
import base64
import json
import logging
from typing import Optional

from config import (
    AI_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL,
    SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


class AIEngine:
    """
    AI engine that supports both OpenAI and Anthropic APIs.
    Handles text conversation and vision (screen image analysis).
    """

    def __init__(self, provider: str = None):
        self.provider = provider or AI_PROVIDER
        self.conversation_history = []
        self._client = None
        self._model = None
        self._initialized = False

    def _init_client(self):
        """Initialize the AI client based on provider (lazy)."""
        if self._initialized:
            return

        if self.provider == "openai":
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=OPENAI_API_KEY)
                self._model = OPENAI_MODEL
                logger.info(f"OpenAI client initialized (model: {self._model})")
            except ImportError:
                logger.warning("openai not installed. Install with: pip install openai")
                self._client = None
                self._model = OPENAI_MODEL
        elif self.provider == "anthropic":
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
                self._model = ANTHROPIC_MODEL
                logger.info(f"Anthropic client initialized (model: {self._model})")
            except ImportError:
                logger.warning("anthropic not installed. Install with: pip install anthropic")
                self._client = None
                self._model = ANTHROPIC_MODEL
        else:
            logger.warning(f"Unknown AI provider: {self.provider}")
            self._client = None

        self._initialized = True

    def chat(self, user_message: str, screen_image_b64: Optional[str] = None) -> str:
        """
        Send a message to the AI and get a response.
        
        Args:
            user_message: the user's text message
            screen_image_b64: optional base64-encoded screenshot for vision analysis
            
        Returns:
            AI response text
        """
        # Build the user content
        user_content = []
        
        if screen_image_b64:
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{screen_image_b64}",
                },
            })
        
        user_content.append({
            "type": "text",
            "text": user_message,
        })

        # Add to conversation history
        self.conversation_history.append({
            "role": "user",
            "content": user_content if screen_image_b64 else user_message,
        })

        # Call the AI
        try:
            self._init_client()
            if self._client is None:
                response = "המודל עדיין לא מוגדר. אנא הגדר מפתח API בקובץ .env והפעל מחדש."
            elif self.provider == "openai":
                response = self._call_openai()
            else:
                response = self._call_anthropic()
        except Exception as e:
            logger.error(f"AI API error: {e}")
            response = "סליחה, הייתה שגיאה בתקשורת עם המודל. נסה שוב."

        # Add response to history
        self.conversation_history.append({
            "role": "assistant",
            "content": response,
        })

        return response

    def _call_openai(self) -> str:
        """Call OpenAI API."""
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ] + self.conversation_history

        response = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            max_tokens=1024,
            temperature=0.7,
        )

        return response.choices[0].message.content

    def _call_anthropic(self) -> str:
        """Call Anthropic API."""
        # Anthropic has a different message format
        messages = []
        for msg in self.conversation_history:
            messages.append(msg)

        response = self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
        )

        return response.content[0].text

    def analyze_screen(self, screen_image_b64: str, question: str = "מה יש על המסך? תנתח ותן תובנות.") -> str:
        """
        Analyze a screen image with a question.
        
        Args:
            screen_image_b64: base64-encoded screenshot
            question: question about the screen
            
        Returns:
            AI analysis of the screen
        """
        return self.chat(question, screen_image_b64)

    def quick_command(self, command: str, screen_image_b64: Optional[str] = None) -> str:
        """
        Process a quick voice command (shorter context, faster response).
        
        Args:
            command: voice command text
            screen_image_b64: optional current screen image
            
        Returns:
            AI response
        """
        # For quick commands, use only the last few messages for context
        if len(self.conversation_history) > 10:
            self.conversation_history = self.conversation_history[-10:]

        return self.chat(command, screen_image_b64)

    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []
        logger.info("Conversation history cleared")

    def get_history(self) -> list:
        """Get conversation history."""
        return self.conversation_history
