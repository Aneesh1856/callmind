"""
services/elevenlabs_service.py
─────────────────────────────────────────────────────────────────────────────
Text-to-Speech using ElevenLabs API (streaming and non-streaming).

AUDIO PIPELINE:
  ElevenLabs API (pcm_8000) -> raw 16-bit linear PCM mono 8kHz bytes -> Exotel WebSocket
  No transcoding required.
"""
from __future__ import annotations

import logging
from typing import AsyncIterator
import httpx

from config import settings

logger = logging.getLogger(__name__)

# Standard premade voices that are accessible on ElevenLabs Free Tier
DEFAULT_FALLBACK_VOICE = "EXAVITQu4vr4xnSDxMaL"  # Bella (female)


async def synthesize(
    text: str,
    voice_id: str | None = None,
    output_format: str | None = None,
) -> bytes:
    """
    Synthesise text to raw audio bytes.
    (Awaits full synthesis, useful for fallbacks or short notifications).
    """
    if not settings.elevenlabs_api_key:
        logger.error("ElevenLabs API key is not configured in settings.")
        return b""

    if voice_id is None:
        voice_id = settings.elevenlabs_voice_id or "21m00Tcm4TlvDq8ikWAM"
    model_id = settings.elevenlabs_model_id or "eleven_turbo_v2_5"
    output_format = output_format or settings.elevenlabs_output_format or "pcm_8000"

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        }
    }
    params = {
        "output_format": output_format,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload, headers=headers, params=params)
            
            # Check if plan restrictions prevent using this voice ID
            if response.status_code in (402, 404):
                if voice_id != DEFAULT_FALLBACK_VOICE:
                    logger.warning(
                        "Voice ID %s failed (%d). Falling back to Bella (%s).",
                        voice_id,
                        response.status_code,
                        DEFAULT_FALLBACK_VOICE
                    )
                    return await synthesize(text, voice_id=DEFAULT_FALLBACK_VOICE)
            
            if response.status_code != 200:
                logger.error(
                    "ElevenLabs API error: status=%d response=%s",
                    response.status_code,
                    response.text
                )
                return b""
            return response.content
    except Exception as exc:
        logger.error("ElevenLabs synthesis failed: %s", exc)
        return b""


async def synthesize_stream(
    text: str,
    voice_id: str | None = None,
    output_format: str | None = None,
) -> AsyncIterator[bytes]:
    """
    LOW-LATENCY streaming TTS — yields raw audio chunks as they arrive from ElevenLabs.
    """
    if not settings.elevenlabs_api_key:
        logger.error("ElevenLabs API key is not configured in settings.")
        return

    if voice_id is None:
        voice_id = settings.elevenlabs_voice_id or "21m00Tcm4TlvDq8ikWAM"
    model_id = settings.elevenlabs_model_id or "eleven_turbo_v2_5"
    output_format = output_format or settings.elevenlabs_output_format or "pcm_8000"

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        }
    }
    params = {
        "output_format": output_format,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers, params=params) as response:
                if response.status_code in (402, 404):
                    if voice_id != DEFAULT_FALLBACK_VOICE:
                        logger.warning(
                            "Voice ID %s stream failed (%d). Falling back to Bella (%s).",
                            voice_id,
                            response.status_code,
                            DEFAULT_FALLBACK_VOICE
                        )
                        # Close current connection before spawning the fallback stream
                        await response.aclose()
                        async for chunk in synthesize_stream(text, voice_id=DEFAULT_FALLBACK_VOICE):
                            yield chunk
                        return
                
                if response.status_code != 200:
                    err_msg = await response.aread()
                    logger.error(
                        "ElevenLabs API stream error: status=%d response=%s",
                        response.status_code,
                        err_msg.decode("utf-8", errors="replace")
                    )
                    return
                
                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk
    except Exception as exc:
        logger.error("ElevenLabs streaming synthesis failed: %s", exc)


async def list_voices() -> list[dict]:
    """List available voices from ElevenLabs."""
    if not settings.elevenlabs_api_key:
        logger.error("ElevenLabs API key is not configured in settings.")
        return []

    url = "https://api.elevenlabs.io/v1/voices"
    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                return data.get("voices", [])
            else:
                logger.error("Failed to list voices: %d %s", response.status_code, response.text)
                return []
    except Exception as exc:
        logger.error("Error listing ElevenLabs voices: %s", exc)
        return []
