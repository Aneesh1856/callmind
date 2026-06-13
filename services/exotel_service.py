"""
services/exotel_service.py
─────────────────────────────────────────────────────────────────────────────
Exotel REST API helpers.

Used to:
  - Build ExoML (XML) responses for inbound webhooks
  - Hang up a call programmatically (e.g. after spam detected)
  - Retrieve call details
"""
from __future__ import annotations

import logging
from typing import Optional
from xml.etree.ElementTree import Element, SubElement, tostring

import httpx

from config import settings

logger = logging.getLogger(__name__)


# ── ExoML Builders ────────────────────────────────────────────────────────────

def exoml_connect_stream(call_sid: str) -> str:
    """
    Return ExoML that tells Exotel to stream the call audio to our WebSocket.

    IMPORTANT: The Stream URL must use wss:// (WebSocket Secure), not https://.
    We derive it from BASE_URL by swapping the scheme.
    """
    base = settings.base_url.rstrip("/")
    # Convert http(s):// → ws(s)://
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")

    response = Element("Response")
    stream = SubElement(response, "Stream")
    stream.set("url", f"{ws_base}/ws/call/{call_sid}")
    stream.set("bidirectional", "true")
    stream.set("statusCallback", f"{base}/exotel/status")
    return '<?xml version="1.0" encoding="UTF-8"?>' + tostring(
        response, encoding="unicode"
    )



def exoml_hangup() -> str:
    """Return ExoML that immediately hangs up the call."""
    response = Element("Response")
    SubElement(response, "Hangup")
    return '<?xml version="1.0" encoding="UTF-8"?>' + tostring(
        response, encoding="unicode"
    )


def exoml_say_and_hangup(text: str) -> str:
    """Return ExoML that plays a TTS message then hangs up."""
    response = Element("Response")
    say = SubElement(response, "Say")
    say.set("voice", "woman")
    say.set("language", "en-IN")
    say.text = text
    SubElement(response, "Hangup")
    return '<?xml version="1.0" encoding="UTF-8"?>' + tostring(
        response, encoding="unicode"
    )


# ── Exotel REST API ───────────────────────────────────────────────────────────

def _exotel_base_url() -> str:
    return (
        f"https://{settings.exotel_api_key}:{settings.exotel_api_token}"
        f"@{settings.exotel_subdomain}/v1/Accounts/{settings.exotel_sid}"
    )


async def hangup_call(call_sid: str) -> bool:
    """Programmatically hang up an active Exotel call."""
    url = f"{_exotel_base_url()}/Calls/{call_sid}.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(url, data={"Status": "completed"})
            resp.raise_for_status()
            logger.info("Hung up call %s", call_sid)
            return True
        except Exception as exc:
            logger.error("Failed to hang up %s: %s", call_sid, exc)
            return False


async def get_call_details(call_sid: str) -> Optional[dict]:
    """Fetch call metadata from Exotel."""
    url = f"{_exotel_base_url()}/Calls/{call_sid}.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.error("get_call_details %s: %s", call_sid, exc)
            return None
