"""
routers/calls.py
─────────────────────────────────────────────────────────────────────────────
Frontend-facing REST API endpoints.

GET  /calls    — Paginated list of all call records
GET  /status   — ARIA enabled/disabled + active call count
POST /toggle   — Enable or disable ARIA
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, date
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

import os
import dotenv

from models.database import CallRecord, get_session
from models.schemas import CallOut, CallListOut, StatusOut, ToggleIn, ToggleOut, ContextIn, ContextOut
from state import app_state
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["frontend"])


# ── GET /calls ────────────────────────────────────────────────────────────────

@router.get("/calls", response_model=CallListOut)
async def list_calls(
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Results per page"),
    status: Optional[str] = Query(default=None, description="Filter by call status"),
    tag: Optional[str] = Query(default=None, description="Filter by primary_tag"),
    urgency: Optional[str] = Query(default=None, description="Filter by urgency level"),
    date_from: Optional[date] = Query(default=None, description="Filter from date (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(default=None, description="Filter to date (YYYY-MM-DD)"),
    session: AsyncSession = Depends(get_session),
):
    """Return a paginated list of call records, newest first."""
    query = select(CallRecord)

    if status:
        query = query.where(CallRecord.status == status.upper())
    if tag:
        query = query.where(CallRecord.primary_tag == tag)
    if urgency:
        query = query.where(CallRecord.urgency == urgency.upper())
    if date_from:
        query = query.where(CallRecord.started_at >= datetime(date_from.year, date_from.month, date_from.day))
    if date_to:
        query = query.where(CallRecord.started_at < datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.exec(count_query)
    total = total_result.one()

    # Paginate
    offset = (page - 1) * page_size
    query = query.order_by(CallRecord.created_at.desc()).offset(offset).limit(page_size)
    result = await session.exec(query)
    calls = result.all()

    return CallListOut(
        total=total,
        page=page,
        page_size=page_size,
        calls=[CallOut.model_validate(c) for c in calls],
    )


# ── GET /status ───────────────────────────────────────────────────────────────

@router.get("/status", response_model=StatusOut)
async def get_status(session: AsyncSession = Depends(get_session)):
    """Return ARIA's current operational status."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    count_today_query = select(func.count()).where(
        CallRecord.started_at >= today_start
    )
    result = await session.exec(count_today_query)
    total_today = result.one()

    return StatusOut(
        aria_enabled=app_state.enabled,
        active_calls=app_state.active_count,
        total_calls_today=total_today,
    )


# ── POST /toggle ──────────────────────────────────────────────────────────────

@router.post("/toggle", response_model=ToggleOut)
async def toggle_aria(body: ToggleIn):
    """Enable or disable ARIA's call answering."""
    await app_state.set_enabled(body.enabled)
    action = "enabled" if body.enabled else "disabled"
    logger.info("ARIA %s via /toggle", action)
    return ToggleOut(
        aria_enabled=body.enabled,
        message=f"ARIA has been {action}.",
    )


# ── GET /context ──────────────────────────────────────────────────────────────

@router.get("/context", response_model=ContextOut)
async def get_context():
    """Return ARIA's current owner context."""
    return ContextOut(
        context=settings.aria_owner_context,
        message="Context retrieved.",
    )


# ── POST /context ─────────────────────────────────────────────────────────────

@router.post("/context", response_model=ContextOut)
async def update_context(body: ContextIn):
    """Update ARIA's context dynamically and persist to .env."""
    settings.aria_owner_context = body.context
    
    # Persist to .env
    dotenv.set_key(".env", "ARIA_OWNER_CONTEXT", body.context)
    
    logger.info("ARIA context updated to: %s", body.context)
    return ContextOut(
        context=body.context,
        message="Context updated successfully.",
    )
