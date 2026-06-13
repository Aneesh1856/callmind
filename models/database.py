"""
models/database.py — SQLModel database setup and ORM model for call records.
Supports both SQLite (local dev) and PostgreSQL (production/cloud).
Set DATABASE_URL in .env to switch between them.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel, create_engine, Session, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from config import settings


# ── Engine ────────────────────────────────────────────────────────────────────

# connect_args only needed for SQLite (not PostgreSQL)
_is_sqlite = settings.database_url.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}

async_engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Model ─────────────────────────────────────────────────────────────────────

class CallRecord(SQLModel, table=True):
    __tablename__ = "calls"

    id: Optional[int] = Field(default=None, primary_key=True)
    call_sid: str = Field(index=True, unique=True)
    caller_number: str = Field(default="")
    caller_name: Optional[str] = Field(default=None)
    organization: Optional[str] = Field(default=None)

    # Status lifecycle: RINGING → ACTIVE → COMPLETED | FAILED | SPAM
    status: str = Field(default="RINGING")

    started_at: Optional[datetime] = Field(default=None)
    ended_at: Optional[datetime] = Field(default=None)
    duration_seconds: Optional[int] = Field(default=None)

    # Raw transcript (newline-separated speaker turns)
    transcript: Optional[str] = Field(default=None)

    # Classification results
    intent: Optional[str] = Field(default=None)
    urgency: Optional[str] = Field(default=None)

    # Tagging
    primary_tag: Optional[str] = Field(default=None)
    secondary_tag: Optional[str] = Field(default=None)
    tag_color: Optional[str] = Field(default=None)

    # Post-call summary (WhatsApp message text)
    summary: Optional[str] = Field(default=None)

    # Full structured info as JSON string
    info_json: Optional[str] = Field(default=None)

    # Sentiment & language
    sentiment: Optional[str] = Field(default=None)
    language: Optional[str] = Field(default=None)

    # Action items
    action_required: Optional[str] = Field(default=None)
    deadline: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)

    def set_info(self, data: dict) -> None:
        self.info_json = json.dumps(data, ensure_ascii=False)

    def get_info(self) -> dict:
        if self.info_json:
            return json.loads(self.info_json)
        return {}


# ── Lifecycle helpers ─────────────────────────────────────────────────────────

async def create_db_and_tables() -> None:
    """Create all tables on startup."""
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session() -> AsyncSession:
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        yield session


# ── Sync helper (used by init_db.py seed script only) ─────────────────────────

def init_db() -> None:
    """Synchronous table creation — used by the seed script."""
    from sqlalchemy import create_engine as _create_engine

    # Convert async URL scheme to sync for the seed script
    sync_url = (
        settings.database_url
        .replace("sqlite+aiosqlite", "sqlite")
        .replace("postgresql+asyncpg", "postgresql")
    )
    sync_engine = _create_engine(sync_url)
    SQLModel.metadata.create_all(sync_engine)
    sync_engine.dispose()
