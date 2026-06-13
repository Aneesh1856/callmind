"""
state.py — In-memory application state shared across the process.
Keeps track of ARIA's enabled/disabled toggle and any active call sessions.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional

from config import settings


@dataclass
class CallSession:
    """Transient state for one live call."""
    call_sid: str
    caller_number: str
    conversation_history: list = field(default_factory=list)
    transcript_chunks: list = field(default_factory=list)
    question_count: int = 0
    caller_name: Optional[str] = None
    intent: Optional[str] = None
    urgency: Optional[str] = None
    escalated: bool = False
    closing: bool = False


class AppState:
    def __init__(self) -> None:
        self._enabled: bool = settings.aria_enabled
        self._lock: asyncio.Lock = asyncio.Lock()
        # call_sid → CallSession
        self.active_calls: Dict[str, CallSession] = {}

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def set_enabled(self, value: bool) -> None:
        async with self._lock:
            self._enabled = value

    def add_call(self, session: CallSession) -> None:
        self.active_calls[session.call_sid] = session

    def get_call(self, call_sid: str) -> Optional[CallSession]:
        return self.active_calls.get(call_sid)

    def remove_call(self, call_sid: str) -> None:
        self.active_calls.pop(call_sid, None)

    @property
    def active_count(self) -> int:
        return len(self.active_calls)


# Singleton — import this everywhere
app_state = AppState()
