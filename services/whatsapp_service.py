"""
services/whatsapp_service.py
─────────────────────────────────────────────────────────────────────────────
Send WhatsApp notifications to the owner after each call ends.

Supports three providers via WHATSAPP_PROVIDER env var:
  "url"    — generic HTTP POST to any gateway (default)
  "twilio" — Twilio WhatsApp sandbox/production
  "meta"   — Meta Cloud API (WhatsApp Business)
"""
from __future__ import annotations

import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)


async def send_whatsapp(message: str) -> bool:
    """
    Send a WhatsApp message to the owner.
    Returns True on success, False on failure (never raises).
    """
    provider = settings.whatsapp_provider.lower()

    try:
        if provider == "twilio":
            return await _send_twilio(message)
        elif provider == "meta":
            return await _send_meta(message)
        else:
            return await _send_generic_url(message)
    except Exception as exc:
        logger.error("WhatsApp send failed: %s", exc)
        return False


async def _send_generic_url(message: str) -> bool:
    """POST message to a configurable webhook URL."""
    if not settings.whatsapp_api_url:
        logger.warning("WHATSAPP_API_URL not configured — skipping notification")
        return False

    headers = {}
    if settings.whatsapp_api_token:
        headers["Authorization"] = f"Bearer {settings.whatsapp_api_token}"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            settings.whatsapp_api_url,
            headers=headers,
            json={
                "to": settings.whatsapp_to_number,
                "message": message,
            },
        )
        resp.raise_for_status()
        logger.info("WhatsApp (generic) sent to %s", settings.whatsapp_to_number)
        return True


async def _send_twilio(message: str) -> bool:
    """Send via Twilio WhatsApp API."""
    # Twilio creds reuse the generic token field for simplicity
    # WHATSAPP_API_TOKEN should be "AccountSID:AuthToken" for Twilio
    creds = settings.whatsapp_api_token.split(":", 1)
    if len(creds) != 2:
        logger.error("Twilio creds must be 'AccountSID:AuthToken' in WHATSAPP_API_TOKEN")
        return False

    account_sid, auth_token = creds
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            url,
            auth=(account_sid, auth_token),
            data={
                "From": f"whatsapp:{settings.whatsapp_from_number}",
                "To": f"whatsapp:{settings.whatsapp_to_number}",
                "Body": message,
            },
        )
        resp.raise_for_status()
        logger.info("WhatsApp (Twilio) sent to %s", settings.whatsapp_to_number)
        return True


async def _send_meta(message: str) -> bool:
    """Send via Meta Cloud API (WhatsApp Business)."""
    if not settings.whatsapp_api_url or not settings.whatsapp_api_token:
        logger.error("Meta WhatsApp requires WHATSAPP_API_URL and WHATSAPP_API_TOKEN")
        return False

    # Remove '+' prefix from number for Meta API
    to_number = settings.whatsapp_to_number.lstrip("+")

    headers = {
        "Authorization": f"Bearer {settings.whatsapp_api_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": message},
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(settings.whatsapp_api_url, headers=headers, json=payload)
        resp.raise_for_status()
        logger.info("WhatsApp (Meta) sent to %s", to_number)
        return True
