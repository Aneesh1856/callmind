"""
migrate_to_postgres.py
──────────────────────────────────────────────────────────────────────────────
One-shot migration: copies ALL records from your local aria.db (SQLite)
into a remote PostgreSQL database (Neon / Render / Supabase etc.)

Prerequisites:
    pip install psycopg2-binary sqlmodel

Usage:
    python migrate_to_postgres.py --pg-url "postgresql://user:pass@host/dbname"

Or set PG_URL in your .env and just run:
    python migrate_to_postgres.py
──────────────────────────────────────────────────────────────────────────────
"""

import argparse
import os
import sys
from datetime import datetime

# ── Load .env so we can read PG_URL from there too ───────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy import text


# ── Inline CallRecord model (avoids importing from app which might fail) ──────
from typing import Optional
from sqlmodel import Field

class CallRecord(SQLModel, table=True):
    __tablename__ = "calls"

    id: Optional[int] = Field(default=None, primary_key=True)
    call_sid: str = Field(index=True, unique=True)
    caller_number: str = Field(default="")
    caller_name: Optional[str] = Field(default=None)
    organization: Optional[str] = Field(default=None)
    status: str = Field(default="RINGING")
    started_at: Optional[datetime] = Field(default=None)
    ended_at: Optional[datetime] = Field(default=None)
    duration_seconds: Optional[int] = Field(default=None)
    transcript: Optional[str] = Field(default=None)
    intent: Optional[str] = Field(default=None)
    urgency: Optional[str] = Field(default=None)
    primary_tag: Optional[str] = Field(default=None)
    secondary_tag: Optional[str] = Field(default=None)
    tag_color: Optional[str] = Field(default=None)
    summary: Optional[str] = Field(default=None)
    info_json: Optional[str] = Field(default=None)
    sentiment: Optional[str] = Field(default=None)
    language: Optional[str] = Field(default=None)
    action_required: Optional[str] = Field(default=None)
    deadline: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


def migrate(sqlite_path: str, pg_url: str) -> None:
    # ── Validate SQLite file exists ───────────────────────────────────────────
    if not os.path.exists(sqlite_path):
        print(f"ERROR: SQLite file not found: {sqlite_path}")
        sys.exit(1)

    # ── Connect to SQLite (source) ────────────────────────────────────────────
    print(f"\n📂 Source (SQLite): {sqlite_path}")
    sqlite_engine = create_engine(f"sqlite:///{sqlite_path}", echo=False)

    with Session(sqlite_engine) as src:
        records = src.exec(select(CallRecord)).all()

    print(f"   Found {len(records)} call record(s) to migrate.")

    if not records:
        print("\nNothing to migrate. Exiting.")
        return

    # ── Normalize pg_url (Render gives postgresql://, need psycopg2) ──────────
    if pg_url.startswith("postgresql+asyncpg://"):
        pg_url = pg_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    elif pg_url.startswith("postgresql+aiosqlite://"):
        pg_url = pg_url.replace("postgresql+aiosqlite://", "postgresql://", 1)

    # ── Connect to PostgreSQL (destination) ───────────────────────────────────
    print(f"\n🐘 Destination (PostgreSQL): {pg_url[:pg_url.index('@') + 1]}***")
    pg_engine = create_engine(pg_url, echo=False)

    print("   Creating tables if they don't exist...")
    SQLModel.metadata.create_all(pg_engine)

    # ── Copy records ──────────────────────────────────────────────────────────
    print(f"   Migrating {len(records)} records...\n")

    skipped = 0
    inserted = 0

    with Session(pg_engine) as dst:
        # Get existing call_sids to skip duplicates
        existing = {r[0] for r in dst.exec(
            text("SELECT call_sid FROM calls")
        ).all()}

        for rec in records:
            if rec.call_sid in existing:
                print(f"   ⏭  skip (exists): {rec.call_sid}")
                skipped += 1
                continue

            # Detach from SQLite session and insert into PG
            new_rec = CallRecord(
                call_sid=rec.call_sid,
                caller_number=rec.caller_number,
                caller_name=rec.caller_name,
                organization=rec.organization,
                status=rec.status,
                started_at=rec.started_at,
                ended_at=rec.ended_at,
                duration_seconds=rec.duration_seconds,
                transcript=rec.transcript,
                intent=rec.intent,
                urgency=rec.urgency,
                primary_tag=rec.primary_tag,
                secondary_tag=rec.secondary_tag,
                tag_color=rec.tag_color,
                summary=rec.summary,
                info_json=rec.info_json,
                sentiment=rec.sentiment,
                language=rec.language,
                action_required=rec.action_required,
                deadline=rec.deadline,
                created_at=rec.created_at or datetime.utcnow(),
            )
            dst.add(new_rec)
            caller_label = rec.caller_name or rec.caller_number or rec.call_sid
            print(f"   ✅ inserted: [{rec.primary_tag or '—':10s}] {caller_label}")
            inserted += 1

        dst.commit()

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"""
──────────────────────────────────────────────────────
✅  Migration complete!
    Inserted : {inserted}
    Skipped  : {skipped} (already existed)
    Total    : {len(records)}

Next steps:
  1. Update your .env → set DATABASE_URL to the PostgreSQL URL
  2. Restart the backend: uvicorn main:app --reload
  3. Verify the dashboard shows your migrated calls
  4. Delete aria.db once confirmed: del aria.db
──────────────────────────────────────────────────────
""")


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Migrate CallMind data from SQLite (aria.db) → PostgreSQL"
    )
    parser.add_argument(
        "--sqlite",
        default="aria.db",
        help="Path to local SQLite file (default: aria.db)",
    )
    parser.add_argument(
        "--pg-url",
        default=os.getenv("PG_URL") or os.getenv("DATABASE_URL"),
        help="PostgreSQL connection URL. Or set PG_URL in .env",
    )
    args = parser.parse_args()

    if not args.pg_url:
        print(
            "ERROR: PostgreSQL URL not provided.\n"
            "  Option 1: python migrate_to_postgres.py --pg-url 'postgresql://user:pass@host/db'\n"
            "  Option 2: Add PG_URL=postgresql://... to your .env file"
        )
        sys.exit(1)

    migrate(sqlite_path=args.sqlite, pg_url=args.pg_url)
