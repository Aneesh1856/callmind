"""
routers/exotel.py
─────────────────────────────────────────────────────────────────────────────
Exotel webhook endpoints.

POST /exotel/incoming  — Exotel hits this when a call arrives.
POST /exotel/status    — Exotel hits this when a call status changes.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Form, Query, Request, Response, BackgroundTasks
from sqlmodel import select

from config import settings
from models.database import CallRecord, AsyncSessionLocal
from services.exotel_service import exoml_connect_stream, exoml_hangup
from state import app_state, CallSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exotel", tags=["exotel"])


@router.api_route("/incoming", methods=["GET", "POST"])
async def incoming_call(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Exotel inbound call webhook — accepts GET (Passthru default) and POST.

    Exotel Passthru sends GET with query params:
      CallSid, CallFrom, CallTo, Direction, CallType, etc.
    POST sends the same as form fields.

    If ARIA is disabled, return hangup ExoML.
    If ARIA is enabled, return ExoML to stream audio to our WebSocket.
    """
    # Read params from query string (GET) or form body (POST)
    params = dict(request.query_params)
    if request.method == "POST":
        try:
            form = await request.form()
            params.update(dict(form))
        except Exception:
            pass

    call_sid    = params.get("CallSid") or params.get("callsid")
    caller      = params.get("From") or params.get("CallFrom") or "unknown"
    callee      = params.get("To")   or params.get("CallTo")   or settings.exotel_caller_id
    call_status = params.get("CallStatus", "ringing")

    if not call_sid:
        logger.warning("Incoming call with no CallSid — ignoring: %s", params)
        return Response(content=exoml_hangup(), media_type="application/xml")

    logger.info("Incoming call: SID=%s From=%s To=%s", call_sid, caller, callee)

    if not app_state.enabled:
        logger.info("ARIA is disabled — hanging up %s", call_sid)
        return Response(content=exoml_hangup(), media_type="application/xml")

    # Create in-memory session
    session = CallSession(call_sid=call_sid, caller_number=caller)
    app_state.add_call(session)

    # Persist initial call record to DB in the background
    background_tasks.add_task(_create_call_record, call_sid, caller, callee)

    # Tell Exotel to stream audio to our WebSocket
    exoml = exoml_connect_stream(call_sid)
    logger.debug("Returning ExoML: %s", exoml)
    return Response(content=exoml, media_type="application/xml")


@router.api_route("/voicebot", methods=["GET", "POST"])
async def voicebot_call(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Exotel Voicebot applet webhook — returns JSON format: {"url": "wss://..."}.
    """
    # Read params from query string (GET) or form body (POST)
    params = dict(request.query_params)
    if request.method == "POST":
        try:
            form = await request.form()
            params.update(dict(form))
        except Exception:
            pass

    call_sid    = params.get("CallSid") or params.get("callsid")
    caller      = params.get("From") or params.get("CallFrom") or "unknown"
    callee      = params.get("To")   or params.get("CallTo")   or settings.exotel_caller_id

    if not call_sid:
        logger.warning("Voicebot call with no CallSid — ignoring: %s", params)
        return {"url": ""}

    logger.info("Voicebot incoming call: SID=%s From=%s To=%s", call_sid, caller, callee)

    if not app_state.enabled:
        logger.info("ARIA is disabled — returning empty URL for %s", call_sid)
        return {"url": ""}

    # Create in-memory session
    session = CallSession(call_sid=call_sid, caller_number=caller)
    app_state.add_call(session)

    # Persist initial call record to DB in the background
    background_tasks.add_task(_create_call_record, call_sid, caller, callee)

    base = settings.base_url.rstrip("/")
    ws_base = base.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_base}/ws/call/{call_sid}"
    logger.debug("Returning Voicebot URL: %s", ws_url)
    return {"url": ws_url}




@router.post("/status")
async def call_status(
    CallSid: str = Form(...),
    CallStatus: str = Form(...),
    CallDuration: str = Form(default="0"),
):
    """
    Exotel call status callback.
    Marks the call as FAILED if it ends unexpectedly.
    """
    logger.info("Call status: SID=%s Status=%s", CallSid, CallStatus)

    if CallStatus in ("completed", "failed", "busy", "no-answer"):
        # Clean up in-memory state (WebSocket handler does the full cleanup;
        # this is a safety net for calls that never connected)
        app_state.remove_call(CallSid)

        async with AsyncSessionLocal() as db_session:
            result = await db_session.exec(
                select(CallRecord).where(CallRecord.call_sid == CallSid)
            )
            record = result.first()
            if record and record.status == "RINGING":
                record.status = "FAILED"
                record.ended_at = datetime.utcnow()
                await db_session.commit()

    return {"status": "ok"}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _create_call_record(call_sid: str, caller_number: str, to_number: str) -> None:
    """Persist a new RINGING call record to the database."""
    async with AsyncSessionLocal() as session:
        record = CallRecord(
            call_sid=call_sid,
            caller_number=caller_number,
            status="RINGING",
            started_at=datetime.utcnow(),
        )
        session.add(record)
        await session.commit()
        logger.debug("Created call record for %s", call_sid)
