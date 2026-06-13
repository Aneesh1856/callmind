"""
routers/websocket.py
─────────────────────────────────────────────────────────────────────────────
Live call WebSocket handler — LOW LATENCY PIPELINE.

HOW THE LATENCY REDUCTION WORKS:
  Old flow (sequential):
    Deepgram → [wait for full STT] → Groq → [wait for full response]
    → ElevenLabs → [wait for full audio] → send
    Total: ~1.5-2s per turn

  New flow (sentence-streaming pipeline):
    Deepgram → [first sentence from STT] → Groq streams →
    [first sentence from Groq, ~200ms] → immediately TTS that sentence →
    [stream audio chunks as they arrive] → send chunks in real time
    while Groq still generating next sentence →
    [next sentence ready] → TTS it → send → …
    Total TTFB: ~300ms  ✅

  This is exactly how GPT-4o voice and Gemini Live work.

AUDIO FORMAT:
  Exotel sends µ-law 8kHz → Deepgram decodes → transcribes.
  ElevenLabs outputs µ-law 8kHz → we base64-encode → send back to Exotel.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import settings
from services.claude_service import (
    run_parallel_classifiers,
    stream_conversation_turn,
    generate_closing,
    security_gate,
    get_aria_system_prompt,
)
from services.deepgram_service import DeepgramSTT
from services.elevenlabs_service import synthesize, synthesize_stream
from services.post_call_pipeline import run_post_call_pipeline
from services.whatsapp_service import send_whatsapp
from state import app_state, CallSession

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])

_SENSITIVE_KEYWORDS = (
    "send file", "email", "contact", "number", "address",
    "document", "share", "access", "password", "details",
)


@router.websocket("/ws/call/{call_sid}")
async def call_websocket(websocket: WebSocket, call_sid: str):
    await websocket.accept()
    logger.info("WebSocket accepted: %s", call_sid)

    provider = websocket.query_params.get("provider", "exotel")
    encoding = "mulaw" if provider == "twilio" else "linear16"
    logger.info("[%s] Call provider: %s, encoding: %s", call_sid, provider, encoding)

    session: Optional[CallSession] = app_state.get_call(call_sid)
    if session is None:
        session = CallSession(call_sid=call_sid, caller_number="unknown")
        app_state.add_call(session)

    started_at = datetime.utcnow()
    stream_sid: Optional[str] = None
    full_transcript_lines: list[str] = []

    async with DeepgramSTT(encoding=encoding) as stt:

        # ── Task A: Receive audio from Exotel, forward to Deepgram ──────────
        async def receive_audio():
            nonlocal stream_sid
            try:
                while True:
                    raw = await websocket.receive_text()
                    msg = json.loads(raw)
                    event = msg.get("event")

                    if event == "connected":
                        pass  # handshake, no action needed

                    elif event == "start":
                        stream_sid = (
                            msg.get("stream_sid")
                            or msg.get("streamSid")
                            or msg.get("start", {}).get("stream_sid")
                            or msg.get("start", {}).get("streamSid")
                        )
                        logger.info("Stream started: %s", stream_sid)
                        # Speak greeting — use streaming for instant first audio
                        greeting = (
                            f"Hello! You've reached {settings.aria_owner_name}'s phone. "
                            f"I'm his personal assistant. "
                            f"He's unavailable right now — how can I help you?"
                        )
                        await _speak_streaming(websocket, stream_sid, greeting, provider=provider)

                    elif event == "media":
                        payload = msg.get("media", {}).get("payload", "")
                        if payload:
                            await stt.send_audio(base64.b64decode(payload))

                    elif event == "stop":
                        logger.info("Exotel stop event: %s", call_sid)
                        await stt.finalize()
                        break

            except WebSocketDisconnect:
                logger.info("WS disconnected: %s", call_sid)
                await stt.finalize()
            except RuntimeError as exc:
                if "not connected" in str(exc):
                    logger.info("WS closed locally: %s", call_sid)
                else:
                    logger.error("receive_audio RuntimeError [%s]: %s", call_sid, exc)
                await stt.finalize()
            except Exception as exc:
                logger.error("receive_audio error [%s]: %s", call_sid, exc)
                await stt.finalize()

        # ── Task B: Process transcripts through the AI pipeline ─────────────
        async def process_transcripts():
            async for transcript in stt.transcripts():
                if not transcript:
                    continue

                logger.info("[%s] Caller: %s", call_sid, transcript)
                session.transcript_chunks.append(transcript)
                full_transcript_lines.append(f"CALLER: {transcript}")

                context = " | ".join(session.transcript_chunks[-5:])

                # ── GOLDEN RULE: Prompts 7+2+3 in PARALLEL ────────────────
                # All three use the fast 8B model simultaneously
                spam, intent, urgency_data = await run_parallel_classifiers(
                    caller_message=transcript,
                    context=context,
                )

                intent_str: str = intent or "OTHER"
                urgency_str: str = urgency_data.get("urgency", "LOW")
                escalate_now: bool = urgency_data.get("escalate_now", False)

                session.intent = intent_str
                session.urgency = urgency_str

                # ── Spam check ─────────────────────────────────────────────
                if spam.get("is_spam") and spam.get("confidence", 0) > 0.7:
                    logger.info("[%s] Spam detected: %s", call_sid, spam.get("spam_type"))
                    closing = await generate_closing(
                        caller_name=session.caller_name or "there",
                        purpose="spam call", urgency="LOW", action="none",
                    )
                    full_transcript_lines.append(f"ARIA: {closing}")
                    audio_bytes = await _speak_streaming(websocket, stream_sid, closing, provider=provider)
                    session.closing = True
                    wait = _audio_duration(audio_bytes, provider=provider) + 0.7  # playback time + jitter buffer
                    await asyncio.sleep(wait)
                    try:
                        await websocket.close()
                    except Exception:
                        pass
                    return

                # ── Urgency escalation mid-call ────────────────────────────
                if escalate_now and not session.escalated:
                    session.escalated = True
                    alert = (
                        f"🚨 URGENT CALL ALERT\n"
                        f"From: {session.caller_number}\n"
                        f"Message: {transcript}\n"
                        f"Urgency: {urgency_str} — {urgency_data.get('reason', '')}"
                    )
                    asyncio.create_task(send_whatsapp(alert))

                # ── Security gate ──────────────────────────────────────────
                if any(kw in transcript.lower() for kw in _SENSITIVE_KEYWORDS):
                    is_wl = session.caller_number in settings.whitelist
                    security = await security_gate(
                        caller_name=session.caller_name or "unknown",
                        caller_number=session.caller_number,
                        is_whitelisted=is_wl,
                        request=transcript,
                        context=context,
                    )
                    if security.get("notify_owner"):
                        asyncio.create_task(send_whatsapp(
                            f"⚠️ Security Alert\n"
                            f"Caller {session.caller_number}: {transcript}\n"
                            f"Risk: {security.get('risk_level')}"
                        ))
                    resp = security.get("response_to_caller", "")
                    if resp:
                        full_transcript_lines.append(f"ARIA: {resp}")
                        await _speak_streaming(websocket, stream_sid, resp, provider=provider)
                        session.question_count += 1
                        continue

                # ── Extract caller name heuristically ─────────────────────
                _try_extract_name(session, transcript)

                # ── Decide: close or continue ──────────────────────────────
                if session.closing:
                    closing_line = await generate_closing(
                        caller_name=session.caller_name or "there",
                        purpose=intent_str,
                        urgency=urgency_str,
                        action=session.intent or "noted",
                    )
                    full_transcript_lines.append(f"ARIA: {closing_line}")
                    audio_bytes = await _speak_streaming(websocket, stream_sid, closing_line, provider=provider)
                    session.closing = True
                    wait = _audio_duration(audio_bytes, provider=provider) + 0.7
                    await asyncio.sleep(wait)
                    try:
                        await websocket.close()
                    except Exception:
                        pass
                    return

                # ── SENTENCE-STREAMING PIPELINE (Prompt 8) ─────────────────
                # Groq streams → we grab each sentence → TTS it immediately
                # Audio starts before Groq finishes generating.
                aria_full_response = ""
                session.conversation_history.append(
                    {"role": "user", "content": transcript}
                )

                conclude_detected = False
                async for sentence in stream_conversation_turn(
                    conversation_history=session.conversation_history,
                    latest_message=transcript,
                    intent=intent_str,
                ):
                    if "[CONCLUDE]" in sentence:
                        conclude_detected = True
                        sentence = sentence.replace("[CONCLUDE]", "").strip()

                    if sentence:
                        logger.info("[%s] ARIA (streaming): %s", call_sid, sentence)
                        aria_full_response += sentence + " "
                        # Fire TTS for this sentence immediately — don't await next sentence
                        await _speak_streaming(websocket, stream_sid, sentence, provider=provider)

                # If the LLM requested call conclusion
                if conclude_detected:
                    closing_line = await generate_closing(
                        caller_name=session.caller_name or "there",
                        purpose=intent_str,
                        urgency=urgency_str,
                        action=session.intent or "noted",
                    )
                    logger.info("[%s] ARIA closing (due to CONCLUDE): %s", call_sid, closing_line)
                    full_transcript_lines.append(f"ARIA: {closing_line}")
                    audio_bytes = await _speak_streaming(websocket, stream_sid, closing_line, provider=provider)
                    session.closing = True
                    wait = _audio_duration(audio_bytes, provider=provider) + 0.7
                    logger.info("[%s] Waiting %.2fs for audio playback before closing", call_sid, wait)
                    await asyncio.sleep(wait)
                    try:
                        await websocket.close()
                    except Exception:
                        pass
                    return

                aria_full_response = aria_full_response.strip()
                if aria_full_response:
                    session.conversation_history.append(
                        {"role": "assistant", "content": aria_full_response}
                    )
                    full_transcript_lines.append(f"ARIA: {aria_full_response}")
                session.question_count += 1

        # ── Run both tasks concurrently ────────────────────────────────────
        recv_task    = asyncio.create_task(receive_audio())
        process_task = asyncio.create_task(process_transcripts())
        try:
            await asyncio.gather(recv_task, process_task)
        except Exception as exc:
            logger.error("Call loop error [%s]: %s", call_sid, exc)
        finally:
            recv_task.cancel()
            process_task.cancel()

    # ── Post-call cleanup ─────────────────────────────────────────────────────
    ended_at = datetime.utcnow()
    app_state.remove_call(call_sid)

    full_transcript = "\n".join(full_transcript_lines)
    logger.info("[%s] Call ended, %d transcript lines", call_sid, len(full_transcript_lines))

    asyncio.create_task(
        run_post_call_pipeline(
            call_sid=call_sid,
            caller_number=session.caller_number,
            transcript=full_transcript,
            intent=session.intent or "OTHER",
            urgency=session.urgency or "LOW",
            ended_at=ended_at,
            started_at=started_at,
        )
    )


# ── Audio helpers ──────────────────────────────────────────────────────────────

async def _speak_streaming(
    websocket: WebSocket,
    stream_sid: Optional[str],
    text: str,
    provider: Optional[str] = None,
) -> int:
    """
    Stream TTS audio chunk-by-chunk back to Exotel or Twilio.
    Returns the total number of PCM/PCMU bytes sent so the caller can
    calculate exact playback duration before closing the WebSocket.
    """
    if not text.strip():
        return 0
    bytes_sent = 0
    is_twilio = (provider == "twilio")
    
    # 200ms audio chunks
    # PCM 16-bit 8kHz mono = 8000 * 2 * 0.2 = 3200 bytes
    # PCMU 8-bit 8kHz mono = 8000 * 1 * 0.2 = 1600 bytes
    CHUNK_SIZE = 1600 if is_twilio else 3200
    output_format = "ulaw_8000" if is_twilio else "pcm_8000"

    try:
        buffer = bytearray()
        async for audio_chunk in synthesize_stream(text, output_format=output_format):
            buffer.extend(audio_chunk)
            while len(buffer) >= CHUNK_SIZE:
                to_send = buffer[:CHUNK_SIZE]
                buffer = buffer[CHUNK_SIZE:]
                payload = base64.b64encode(to_send).decode("utf-8")
                await websocket.send_text(json.dumps({
                    "event": "media",
                    "streamSid": stream_sid or "",
                    "stream_sid": stream_sid or "",
                    "media": {"payload": payload},
                }))
                bytes_sent += len(to_send)

        if is_twilio:
            # μ-law is 8-bit, no alignment needed
            if buffer:
                payload = base64.b64encode(buffer).decode("utf-8")
                await websocket.send_text(json.dumps({
                    "event": "media",
                    "streamSid": stream_sid or "",
                    "stream_sid": stream_sid or "",
                    "media": {"payload": payload},
                }))
                bytes_sent += len(buffer)
        else:
            if len(buffer) % 2 != 0:
                buffer.append(0)  # ensure 16-bit sample alignment
            if buffer:
                payload = base64.b64encode(buffer).decode("utf-8")
                await websocket.send_text(json.dumps({
                    "event": "media",
                    "streamSid": stream_sid or "",
                    "stream_sid": stream_sid or "",
                    "media": {"payload": payload},
                }))
                bytes_sent += len(buffer)

    except Exception as exc:
        logger.error("_speak_streaming error: %s", exc)
        # Fallback: try non-streaming synthesis
        try:
            audio = await synthesize(text, output_format=output_format)
            bytes_sent = 0
            for i in range(0, len(audio), CHUNK_SIZE):
                to_send = audio[i:i + CHUNK_SIZE]
                if not is_twilio and len(to_send) % 2 != 0:
                    to_send += b'\x00'
                payload = base64.b64encode(to_send).decode("utf-8")
                await websocket.send_text(json.dumps({
                    "event": "media",
                    "streamSid": stream_sid or "",
                    "stream_sid": stream_sid or "",
                    "media": {"payload": payload},
                }))
                bytes_sent += len(to_send)
        except Exception as exc2:
            logger.error("_speak fallback also failed: %s", exc2)

    return bytes_sent


def _audio_duration(bytes_sent: int, provider: Optional[str] = None) -> float:
    """Calculate playback duration in seconds for PCM/PCMU audio."""
    bit_depth = 8 if provider == "twilio" else 16
    bytes_per_second = 8000 * (bit_depth // 8)
    return bytes_sent / bytes_per_second if bytes_sent > 0 else 0.0


def _try_extract_name(session: CallSession, text: str) -> None:
    import re
    # Match names of any casing since STT transcripts can be lowercase
    for pattern in [
        r"(?:i am|i'm|this is|my name is|i am called|call me)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)",
        r"(?:main|mera naam)\s+([A-Za-z]+)",
    ]:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            session.caller_name = m.group(1).strip().title()
            break
