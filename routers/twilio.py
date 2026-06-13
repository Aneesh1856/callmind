"""
routers/twilio.py
─────────────────────────────────────────────────────────────────────────────
Twilio Outbound Calling and Webhook Router.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from config import settings
from models.database import CallRecord, AsyncSessionLocal
from state import app_state, CallSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/twilio", tags=["twilio"])


class OutboundCallRequest(BaseModel):
    phone_number: str


@router.post("/call")
async def trigger_outbound_call(payload: OutboundCallRequest):
    """
    Trigger an outbound call using Twilio's programmable voice API.
    """
    if not settings.twilio_account_sid or not settings.twilio_auth_token or not settings.twilio_phone_number:
        raise HTTPException(
            status_code=400,
            detail="Twilio voice credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are not configured."
        )

    phone_number = payload.phone_number.strip()
    if not phone_number.startswith("+"):
        raise HTTPException(
            status_code=400,
            detail="Phone number must include country code (e.g. +91XXXXXXXXXX or +1XXXXXXXXXX)."
        )

    # Trigger Twilio Call via REST API
    twilio_url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls.json"
    
    # We will pass the call_sid as a query parameter to our twiml endpoint.
    # Since we don't have the Twilio SID yet, we can generate a temporary uuid or let Twilio hit twiml with the Twilio SID.
    # Actually, we can trigger the call pointing to a TwiML URL. Twilio's incoming request contains the Twilio CallSid.
    # So we can just map the Twilio CallSid in the TwiML webhook!
    base = settings.base_url.rstrip("/")
    twiml_url = f"{base}/twilio/twiml"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                twilio_url,
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                data={
                    "To": phone_number,
                    "From": settings.twilio_phone_number,
                    "Url": twiml_url,
                    "Method": "POST",
                }
            )
            if resp.status_code != 201:
                logger.error("Twilio API Call failed: %d %s", resp.status_code, resp.text)
                raise HTTPException(
                    status_code=500,
                    detail=f"Twilio API call failed: {resp.text}"
                )
            
            data = resp.json()
            call_sid = data.get("sid")
            logger.info("Outbound call successfully triggered via Twilio. SID: %s", call_sid)

            # Register Call Session
            session = CallSession(call_sid=call_sid, caller_number=phone_number)
            app_state.add_call(session)

            # Persist call record to SQLite DB
            async with AsyncSessionLocal() as db_session:
                record = CallRecord(
                    call_sid=call_sid,
                    caller_number=phone_number,
                    status="RINGING",
                    started_at=datetime.now(timezone.utc),
                )
                db_session.add(record)
                await db_session.commit()

            return {
                "status": "success",
                "call_sid": call_sid,
                "message": f"Dialing {phone_number}..."
            }

        except Exception as exc:
            logger.error("Failed to trigger Twilio call: %s", exc)
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(
                status_code=500,
                detail=f"Twilio call initiation failed: {str(exc)}"
            )


@router.api_route("/twiml", methods=["GET", "POST"])
async def twilio_twiml(request: Request):
    """
    Twilio voice webhook.
    Twilio hits this when the call is answered.
    It returns TwiML directing Twilio to stream audio to our WebSocket.
    """
    # Read Twilio CallSid
    params = dict(request.query_params)
    if request.method == "POST":
        try:
            form = await request.form()
            params.update(dict(form))
        except Exception:
            pass

    call_sid = params.get("CallSid")
    if not call_sid:
        logger.error("TwiML webhook hit without CallSid! params: %s", params)
        raise HTTPException(status_code=400, detail="Missing CallSid")

    logger.info("TwiML webhook triggered for call %s", call_sid)

    # If call session doesn't exist, create it (e.g. if we missed the call_websocket creation somehow)
    session = app_state.get_call(call_sid)
    if session is None:
        caller = params.get("From") or "unknown"
        session = CallSession(call_sid=call_sid, caller_number=caller)
        app_state.add_call(session)

        # Ensure call record exists in DB
        async with AsyncSessionLocal() as db_session:
            result = await db_session.exec(
                select(CallRecord).where(CallRecord.call_sid == call_sid)
            )
            record = result.first()
            if not record:
                record = CallRecord(
                    call_sid=call_sid,
                    caller_number=caller,
                    status="RINGING",
                    started_at=datetime.now(timezone.utc),
                )
                db_session.add(record)
                await db_session.commit()

    base = settings.base_url.rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_base}/ws/call/{call_sid}?provider=twilio"

    logger.info("Returning Connect Stream TwiML pointing to: %s", ws_url)

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}" />
    </Connect>
</Response>
"""
    return Response(content=twiml, media_type="application/xml")
