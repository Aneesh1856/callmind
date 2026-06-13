"""
main.py — ARIA CallMind FastAPI application entry point.

Start with:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

For production (with ngrok or a reverse proxy):
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1

Note: Use --workers 1 because app_state is in-process memory.
      Scale-out requires Redis or a shared store — out of scope for v1.
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from models.database import create_db_and_tables
from routers import exotel, calls, websocket, twilio

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle handler."""
    logger.info("ARIA CallMind starting up…")
    await create_db_and_tables()
    logger.info(
        "DB ready | ARIA enabled=%s | Owner=%s | Model=%s",
        settings.aria_enabled,
        settings.aria_owner_name,
        settings.groq_model,
    )
    yield
    logger.info("ARIA CallMind shutting down…")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ARIA CallMind",
    description=(
        "AI call assistant that answers calls on behalf of the owner. "
        "Powered by Exotel + Deepgram + Groq (Llama) + Edge TTS."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS (allow frontend dev server) ─────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(exotel.router)
app.include_router(calls.router)
app.include_router(websocket.router)
app.include_router(twilio.router)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health():
    return {
        "status": "ok",
        "aria_enabled": settings.aria_enabled,
        "owner": settings.aria_owner_name,
    }
