"""
models/schemas.py — Pydantic response schemas for the REST API.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class CallOut(BaseModel):
    """Single call record returned to the frontend."""
    id: int
    call_sid: str
    caller_number: str
    caller_name: Optional[str]
    organization: Optional[str]
    status: str
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    intent: Optional[str]
    urgency: Optional[str]
    primary_tag: Optional[str]
    secondary_tag: Optional[str]
    tag_color: Optional[str]
    summary: Optional[str]
    sentiment: Optional[str]
    language: Optional[str]
    action_required: Optional[str]
    deadline: Optional[str]
    transcript: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CallListOut(BaseModel):
    total: int
    page: int
    page_size: int
    calls: List[CallOut]


class StatusOut(BaseModel):
    aria_enabled: bool
    active_calls: int
    total_calls_today: int


class ToggleIn(BaseModel):
    enabled: bool


class ToggleOut(BaseModel):
    aria_enabled: bool
    message: str


class ContextIn(BaseModel):
    context: str


class ContextOut(BaseModel):
    context: str
    message: str
