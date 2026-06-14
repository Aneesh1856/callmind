# CallMind — Autonomous AI Voice Call Agent
---

## What is CallMind?

CallMind is an AI-powered voice agent that autonomously handles incoming phone calls on your behalf — no human intervention needed.

When a call comes in, CallMind picks up, understands the caller's intent in real time, responds naturally in English or Hinglish, categorizes the call (urgent, lead, follow-up, spam), and logs a full summary with action items to your dashboard and WhatsApp — all before you even look at your phone.

---

## The Problem

60 million people miss important calls every single day — during meetings, while driving, or simply when unavailable. Missed calls mean missed patients, missed clients, and missed opportunities. Existing voicemail and call-screening tools are passive. They record. They don't *think*.

---

## Our Solution

CallMind is the first call agent that doesn't just answer — it understands and acts.

| Feature | Description |
|---|---|
| 🎙️ Live Call Handling | Answers calls autonomously, speaks naturally |
| 🧠 Intent Classification | Detects urgency, spam, leads, and follow-ups in real time |
| 🌐 Bilingual Support | Responds fluently in English and Hinglish |
| 📋 Auto Summary | Generates call summary + action items instantly |
| 📲 WhatsApp Alerts | Sends post-call summaries directly to owner |
| 🖥️ Live Dashboard | Real-time call feed with transcripts and analytics |

---

## The Vision — ARIA

CallMind handles the conversation. **ARIA** (our next-stage architecture) closes the loop on action.

Imagine CallMind takes a call where someone asks for a file. ARIA would go to your computer, find that file, and email it — while you're still in the meeting. Same AI brain. Now it doesn't just talk, it acts.

We've designed the full ARIA architecture and built an interactive simulation of exactly how it works. Try it at the `/demo` route on the dashboard.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI (Python) |
| **Frontend** | React + Vite + Tailwind CSS |
| **Speech-to-Text** | Deepgram (real-time WebSocket stream) |
| **LLM Brain** | Groq (Llama-3) |
| **Text-to-Speech** | ElevenLabs |
| **Telephony** | Exotel / Twilio |
| **Database** | SQLite via SQLModel + aiosqlite |
| **Notifications** | WhatsApp API |
| **Deployment** | Render (backend) + Netlify (frontend) |

---

## Architecture

```
Incoming Call
     │
     ▼
Exotel/Twilio Virtual Number
     │
     ▼
FastAPI WebSocket ──► Deepgram STT (real-time transcription)
     │
     ▼
Groq LLM (intent classification + response generation)
     │
     ▼
ElevenLabs TTS ──► Audio back to caller
     │
     ▼
Post-Call Pipeline ──► Summary + Tags + WhatsApp notification
     │
     ▼
React Dashboard (live update)
```

---

## Live Demo

📞 **Call the agent directly:** `+918618796251`
Speak naturally in English or Hinglish — ask for a callback, state your purpose, or just see how it handles a spam attempt.

🖥️ **Dashboard:** `https://aria-callmind.netlify.app`
Watch the call feed, transcripts, and AI summaries update in real time.

🤖 **ARIA Simulation:** Navigate to `/demo` on the dashboard to see the future vision in action.

---

## Run Locally

### Prerequisites
- Python 3.10+
- Node.js v18+

### Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Fill in your API keys in .env

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
API docs available at `http://localhost:8000/docs`

### Frontend
```bash
cd dashboard
npm install
npm run dev
```
Dashboard available at `http://localhost:5173`

### Seed Demo Data (optional)
To populate the dashboard with sample calls without placing a real phone call:
```bash
python seed_test_data.py
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the following:

```
GROQ_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
EXOTEL_SID=
EXOTEL_CALLER_ID=
EXOTEL_SUBDOMAIN=api.exotel.com
```

---

## Team

Built at FAR AWAY 2026 by:

- **Aneesh**[Amity University Bengaluru, India] — Backend, AI pipeline, telephony integration
- **Poojitha**[Dayananda Sagar University, India] — Frontend, ARIA simulation

Agentic & Autonomous Systems Track

---

## Future Scope

- ARIA full deployment — autonomous file retrieval and email actions
- Multi-language support beyond English/Hinglish
- CRM integration — auto-log leads to Salesforce/HubSpot
- Voice persona customization for businesses
- Mobile app for on-the-go dashboard access