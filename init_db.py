"""
init_db.py
──────────────────────────────────────────────────────────────────────────────
Optional script to seed the database with 3 realistic demo calls.
Run this ONCE after starting the backend to populate the dashboard with
sample data for demonstration purposes.

Usage:
    python init_db.py
──────────────────────────────────────────────────────────────────────────────
"""

from datetime import datetime, timedelta
from sqlmodel import Session
from models.database import engine, CallRecord, init_db

# ── Seed data ─────────────────────────────────────────────────────────────────
DEMO_CALLS = [
    {
        "call_sid":        "DEMO-001-FOLLOWUP",
        "caller_number":   "+917654321098",
        "caller_name":     "Arjun Nair",
        "status":          "completed",
        "duration_seconds": 98,
        "started_at":      (datetime.utcnow() - timedelta(hours=7)).isoformat(),
        "created_at":      (datetime.utcnow() - timedelta(hours=7)).isoformat(),
        "primary_tag":     "Follow-up",
        "secondary_tag":   "Call Back",
        "tag_color":       "orange",
        "urgency":         "HIGH",
        "intent":          "FOLLOW_UP",
        "language":        "hinglish",
        "sentiment":       "neutral",
        "summary": (
            "Purpose: Arjun called to follow up on the project proposal sent last week.\n"
            "• He has reviewed the document and is interested in proceeding\n"
            "• Wants to schedule a call with Aneesh to discuss pricing\n"
            "• Budget is approximately 5 lakh for the full project"
        ),
        "action_required": "Call Arjun back to discuss proposal pricing and next steps.",
        "deadline":        "Today EOD",
        "transcript": (
            "CALLER: Haan bhai, Arjun bol raha hoon. Aneesh available hai?\n"
            "ARIA: Hi Arjun! Aneesh is currently unavailable. Can I take a message?\n"
            "CALLER: Haan, I wanted to follow up on the proposal he sent last week.\n"
            "ARIA: Of course! I'll let him know you called. Koi specific message?\n"
            "CALLER: Just tell him I've reviewed it and want to discuss pricing. Budget is around 5 lakh.\n"
            "ARIA: Got it. I'll make sure Aneesh calls you back today. Thank you, Arjun!"
        ),
    },
    {
        "call_sid":        "DEMO-002-PERSONAL",
        "caller_number":   "+916543210987",
        "caller_name":     "Mom",
        "status":          "completed",
        "duration_seconds": 45,
        "started_at":      (datetime.utcnow() - timedelta(hours=7, minutes=10)).isoformat(),
        "created_at":      (datetime.utcnow() - timedelta(hours=7, minutes=10)).isoformat(),
        "primary_tag":     "Personal",
        "secondary_tag":   "No Action",
        "tag_color":       "green",
        "urgency":         "LOW",
        "intent":          "PERSONAL",
        "language":        "english",
        "sentiment":       "positive",
        "summary": (
            "Purpose: Mom called to check in and ask about dinner plans.\n"
            "• Asked if Aneesh will be home for dinner tonight\n"
            "• Mentioned she is making his favourite food\n"
            "• No urgent action required"
        ),
        "action_required": None,
        "deadline":        None,
        "transcript": (
            "CALLER: Hello, is Aneesh there?\n"
            "ARIA: Hi! Aneesh is busy right now. Can I take a message?\n"
            "CALLER: It's his mom. Just wanted to ask if he's coming for dinner tonight.\n"
            "ARIA: I'll let him know you called. Is there anything else?\n"
            "CALLER: No, just tell him I'm making his favourite food. He should come home!\n"
            "ARIA: I'll pass that along. Have a lovely evening!"
        ),
    },
    {
        "call_sid":        "DEMO-003-SPAM",
        "caller_number":   "+910000000000",
        "caller_name":     None,
        "status":          "SPAM",
        "duration_seconds": 12,
        "started_at":      (datetime.utcnow() - timedelta(hours=7, minutes=20)).isoformat(),
        "created_at":      (datetime.utcnow() - timedelta(hours=7, minutes=20)).isoformat(),
        "primary_tag":     "Spam",
        "secondary_tag":   "No Action",
        "tag_color":       "gray",
        "urgency":         "LOW",
        "intent":          "SPAM",
        "language":        "english",
        "sentiment":       "neutral",
        "summary": (
            "Purpose: Automated spam/robocall detected and blocked.\n"
            "• Caller did not respond to greeting\n"
            "• Pattern matched known spam number range\n"
            "• Call terminated automatically"
        ),
        "action_required": None,
        "deadline":        None,
        "transcript": (
            "ARIA: Hello, you've reached Aneesh's AI assistant. How can I help you?\n"
            "CALLER: [silence]\n"
            "ARIA: I'm sorry, I didn't catch that. Could you please state your name and purpose?\n"
            "CALLER: [silence]\n"
            "ARIA: This call will be ended. Goodbye."
        ),
    },
]


def seed():
    print("Initialising database...")
    init_db()  # Creates tables if they don't exist

    with Session(engine) as session:
        # Clear existing demo records to avoid duplicates on re-run
        existing_sids = {c.call_sid for c in session.exec(
            __import__("sqlmodel").select(CallRecord)
        ).all()}

        added = 0
        for data in DEMO_CALLS:
            if data["call_sid"] in existing_sids:
                print(f"  skip (already exists): {data['call_sid']}")
                continue
            record = CallRecord(**data)
            session.add(record)
            added += 1
            print(f"  added: {data['call_sid']} - {data.get('caller_name') or 'Unknown'} ({data['primary_tag']})")

        session.commit()

    print(f"\nDone. {added} demo call(s) seeded into aria.db.")
    print("Start the backend with: uvicorn main:app --reload")


if __name__ == "__main__":
    seed()
