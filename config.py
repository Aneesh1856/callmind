"""
config.py — Centralised settings loaded from .env
"""
from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Groq (AI brain — free tier, ultra-low latency) ─────────────────────
    groq_api_key: str = ""
    # llama-3.3-70b-versatile = best quality (free)
    # llama-3.1-8b-instant    = fastest, good for classifiers
    groq_model: str = "llama-3.3-70b-versatile"
    groq_fast_model: str = "llama-3.1-8b-instant"  # for parallel classifiers

    # ── Deepgram ───────────────────────────────────────────────────────────
    deepgram_api_key: str = ""
    deepgram_language: str = "hi"          # Default language for transcription (e.g., 'en', 'hi' supports Hindi+English)
    deepgram_encoding: str = "linear16"       # Exotel streams 16-bit PCM (s16le)
    deepgram_sample_rate: int = 8000

    # ── ElevenLabs ─────────────────────────────────────────────────────────
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_model_id: str = "eleven_multilingual_v2"  # Multilingual model for Hindi/Hinglish
    elevenlabs_output_format: str = "pcm_8000"      # Match Exotel input

    # ── Exotel ─────────────────────────────────────────────────────────────
    exotel_api_key: str = ""
    exotel_api_token: str = ""
    exotel_sid: str = ""
    exotel_caller_id: str = ""
    exotel_subdomain: str = "api.exotel.com"

    # ── WhatsApp ───────────────────────────────────────────────────────────
    whatsapp_provider: str = "url"           # "url" | "twilio" | "meta"
    whatsapp_api_url: str = ""
    whatsapp_api_token: str = ""
    whatsapp_from_number: str = "+14155238886"  # Twilio Sandbox default
    whatsapp_to_number: str = ""

    # ── Twilio Voice (Outbound Call Demo) ──────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # ── App Config ─────────────────────────────────────────────────────────
    base_url: str = "https://your-ngrok-or-domain.com"
    aria_owner_name: str = "Aneesh"
    aria_owner_context: str = ""  # Custom instructions, schedule, or FAQs for ARIA
    aria_enabled: bool = True
    # SQLite for local dev; set DATABASE_URL env var to postgresql+asyncpg://... in production
    database_url: str = "sqlite+aiosqlite:///./aria.db"

    # ── Security ───────────────────────────────────────────────────────────
    whitelisted_numbers: str = ""

    @property
    def whitelist(self) -> List[str]:
        """Return parsed list of trusted caller numbers."""
        return [
            n.strip()
            for n in self.whitelisted_numbers.split(",")
            if n.strip()
        ]

    def model_post_init(self, __context) -> None:
        """
        Render injects DATABASE_URL as postgresql://...
        asyncpg requires postgresql+asyncpg://...
        Auto-fix it here so no manual editing is needed.
        """
        if self.database_url.startswith("postgresql://"):
            object.__setattr__(
                self,
                "database_url",
                self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1),
            )


settings = Settings()
