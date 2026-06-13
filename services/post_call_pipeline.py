"""
services/post_call_pipeline.py
─────────────────────────────────────────────────────────────────────────────
Orchestrates all post-call processing after a call ends.

Runs THREE Claude tasks in PARALLEL via asyncio.gather():
  - Prompt 4: Information Extractor
  - Prompt 5: Post-Call Summary Generator
  - Prompt 6: Caller Tagger

Then persists results to DB and sends WhatsApp notification.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlmodel.ext.asyncio.session import AsyncSession

from config import settings
from models.database import CallRecord, AsyncSessionLocal
from services import claude_service, whatsapp_service

logger = logging.getLogger(__name__)


async def run_post_call_pipeline(
    call_sid: str,
    caller_number: str,
    transcript: str,
    intent: str,
    urgency: str,
    ended_at: datetime,
    started_at: Optional[datetime] = None,
) -> None:
    """
    Full post-call pipeline.  Call this as a background task after the
    WebSocket connection closes.

    Steps (parallel where possible):
      1. Extract info + Generate summary + Tag call — all in parallel
      2. Persist everything to DB
      3. Send WhatsApp notification
    """
    logger.info("Post-call pipeline starting for %s", call_sid)

    if not transcript.strip():
        logger.warning("Empty transcript for %s — skipping pipeline", call_sid)
        return

    call_time = ended_at.strftime("%d %b %Y, %I:%M %p IST")
    caller_name_placeholder = "Unknown caller"

    # ── Step 1: Run Prompts 4, 5, 6 in parallel ──────────────────────────
    try:
        info_task = claude_service.extract_info(transcript)
        # We'll get caller_name from info for the summary; run info first
        # but since we want parallelism, pass placeholder initially
        summary_task = claude_service.generate_summary(
            full_transcript=transcript,
            caller_name=caller_name_placeholder,
            intent=intent,
            urgency=urgency,
            call_time=call_time,
        )
        tags_task = claude_service.tag_call(transcript, intent, urgency)

        info, summary, tags = await asyncio.gather(
            info_task, summary_task, tags_task,
            return_exceptions=True,
        )
    except Exception as exc:
        logger.error("Post-call Claude tasks failed: %s", exc)
        info, summary, tags = {}, "", {}

    # Handle exceptions from gather
    if isinstance(info, Exception):
        logger.error("extract_info failed: %s", info)
        info = {}
    if isinstance(summary, Exception):
        logger.error("generate_summary failed: %s", summary)
        summary = ""
    if isinstance(tags, Exception):
        logger.error("tag_call failed: %s", tags)
        tags = {}

    # ── Step 2: Persist to DB ─────────────────────────────────────────────
    duration_seconds = None
    if started_at:
        duration_seconds = int((ended_at - started_at).total_seconds())

    async with AsyncSessionLocal() as session:
        from sqlmodel import select
        result = await session.exec(
            select(CallRecord).where(CallRecord.call_sid == call_sid)
        )
        record = result.first()

        if record is None:
            # Create a new record if for some reason it wasn't pre-created
            record = CallRecord(
                call_sid=call_sid,
                caller_number=caller_number,
            )
            session.add(record)

        record.status = "COMPLETED"
        record.ended_at = ended_at
        record.duration_seconds = duration_seconds
        record.transcript = transcript
        record.intent = intent
        record.urgency = urgency

        # From info extraction
        record.caller_name = info.get("caller_name") or record.caller_name
        record.organization = info.get("organization")
        record.action_required = info.get("action_required")
        record.deadline = info.get("deadline")
        record.sentiment = info.get("sentiment")
        record.language = info.get("language")
        record.set_info(info)

        # From tagger
        record.primary_tag = tags.get("primary_tag")
        record.secondary_tag = tags.get("secondary_tag")
        record.tag_color = tags.get("tag_color")

        # Summary
        record.summary = summary

        await session.commit()
        logger.info("Call %s saved to DB", call_sid)

    # ── Step 3: Send WhatsApp notification ────────────────────────────────
    # Only notify for urgent calls to prevent spam
    if urgency.upper() in ["CRITICAL", "HIGH", "URGENT"]:
        if summary:
            await whatsapp_service.send_whatsapp(summary)
        else:
            # Fallback minimal notification
            fallback = (
                f"🚨 URGENT CALL MISSED\n"
                f"From: {caller_number}\n"
                f"Intent: {intent}\n"
                f"Duration: {duration_seconds or '?'}s"
            )
            await whatsapp_service.send_whatsapp(fallback)

    logger.info("Post-call pipeline complete for %s", call_sid)
