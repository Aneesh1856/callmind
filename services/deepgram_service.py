"""
services/deepgram_service.py
─────────────────────────────────────────────────────────────────────────────
Real-time speech-to-text via Deepgram's WebSocket streaming API.

Exotel streams audio as µ-law 8 kHz.  We open a Deepgram WebSocket,
forward each audio chunk, and yield transcripts via an asyncio.Queue so
the call loop can consume them without blocking.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator, Optional

import websockets
from websockets.exceptions import ConnectionClosedError

from config import settings

logger = logging.getLogger(__name__)

class DeepgramSTT:
    """
    Manages one Deepgram WebSocket connection per call.

    Usage:
        async with DeepgramSTT() as stt:
            await stt.send_audio(chunk)   # from Exotel/Twilio
            async for transcript in stt.transcripts():
                ...
    """

    def __init__(self, encoding: Optional[str] = None) -> None:
        self.encoding = encoding or settings.deepgram_encoding
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._transcript_queue: asyncio.Queue[str] = asyncio.Queue()
        self._listen_task: Optional[asyncio.Task] = None
        self._closed = False

    async def __aenter__(self) -> "DeepgramSTT":
        await self.connect()
        return self

    async def __aexit__(self, *_) -> None:
        await self.close()

    async def connect(self) -> None:
        headers = {"Authorization": f"Token {settings.deepgram_api_key}"}
        
        # Build the WS URL dynamically based on the requested encoding format
        url = (
            "wss://api.deepgram.com/v1/listen"
            f"?encoding={self.encoding}"
            f"&sample_rate={settings.deepgram_sample_rate}"
            "&language=multi"
            "&model=nova-2"
            "&punctuate=true"
            "&interim_results=true"
            "&endpointing=800"          # 800 ms of silence = utterance end (prevents interrupting)
            "&utterance_end_ms=1500"
            "&smart_format=true"
        )
        
        self._ws = await websockets.connect(
            url,
            extra_headers=headers,
            ping_interval=10,
            ping_timeout=20,
        )
        self._listen_task = asyncio.create_task(self._listen())
        logger.info("Deepgram WebSocket connected (encoding=%s)", self.encoding)

    async def _listen(self) -> None:
        """Background task: read Deepgram responses and enqueue final transcripts."""
        accumulated_transcript = []
        
        try:
            async for message in self._ws:
                data = json.loads(message)
                msg_type = data.get("type")

                # Accumulate is_final chunks
                if msg_type == "Results" and data.get("is_final"):
                    chunk = (
                        data.get("channel", {})
                        .get("alternatives", [{}])[0]
                        .get("transcript", "")
                        .strip()
                    )
                    if chunk:
                        accumulated_transcript.append(chunk)
                    
                    # If Deepgram explicitly flags it as the end of speech
                    if data.get("speech_final"):
                        final_text = " ".join(accumulated_transcript).strip()
                        if final_text:
                            await self._transcript_queue.put(final_text)
                        accumulated_transcript = []

                # Fallback: if Deepgram triggers an UtteranceEnd (via utterance_end_ms),
                # we force-yield whatever we've accumulated so far.
                elif msg_type == "UtteranceEnd":
                    final_text = " ".join(accumulated_transcript).strip()
                    if final_text:
                        await self._transcript_queue.put(final_text)
                    accumulated_transcript = []

        except ConnectionClosedError:
            logger.info("Deepgram WebSocket closed")
        except Exception as exc:
            logger.error("Deepgram listener error: %s", exc)
        finally:
            self._closed = True
            # Sentinel to unblock any consumer waiting on the queue
            await self._transcript_queue.put(None)

    async def send_audio(self, chunk: bytes) -> None:
        """Forward a raw audio chunk to Deepgram."""
        if self._ws and not self._closed:
            try:
                await self._ws.send(chunk)
            except Exception as exc:
                logger.warning("Deepgram send error: %s", exc)

    async def transcripts(self) -> AsyncIterator[str]:
        """Async generator that yields completed transcript strings."""
        while True:
            item = await self._transcript_queue.get()
            if item is None:
                break
            yield item

    async def finalize(self) -> None:
        """Signal Deepgram that the stream has ended."""
        if self._ws and not self._closed:
            try:
                await self._ws.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass

    async def close(self) -> None:
        self._closed = True
        if self._listen_task:
            self._listen_task.cancel()
        if self._ws:
            await self._ws.close()
        logger.info("Deepgram WebSocket closed")
