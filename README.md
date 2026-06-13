# 🌸 CallMinds — AI-Powered Call Assistant

CallMinds is a state-of-the-art personal voice assistant that answers incoming mobile calls on your behalf. Built for the **Japan Trip Hackathon**, CallMinds features an elegant, high-readability visual theme inspired by traditional Japanese aesthetics: **Sumi-e Lacquer Ink Black** backgrounds, **Torii Gate Crimson Red** controls, and soft **Sakura Cherry Blossom Pink** highlights.

CallMinds intercepts unknown callers, interacts with them using low-latency, context-aware speech (in Hinglish and English), categorizes the calls, and logs actions and summaries directly to your dashboard and WhatsApp.

---

## ⛩️ Japan-Inspired Dashboard

The CallMinds dashboard utilizes a responsive two-column grid:
*   **Knowledge Base & Analytics (Left)**: A sticky card where you can customize context in real-time (e.g. *"I am in a meeting until 5 PM"*), alongside dynamic statistics card modules (calls processed, spam blocked, urgent alerts).
*   **Call History (Right)**: An interactive call feed displaying beautiful tag badges (🚨 Urgent, 🤝 Lead, 💬 Follow-up, 🚫 Spam) with a split-screen expanded drawer that shows the **AI Summary & Action Items** on the left and a **Conversation Chat Transcript** (with custom Sakura-rose dialogue bubbles) on the right.
*   **Animated Soundwave**: A digital audio visualizer that pulses with cherry blossom colors next to the status bar when CallMinds is active and waiting for a call.

---

## 🛠️ Tech Stack & Architecture

CallMinds leverages a modern, low-latency decoupled architecture:
*   **Frontend**: React (Vite) + Tailwind CSS (v4) + Axios.
*   **Backend**: FastAPI (Python) + SQLModel ORM (SQLite DB via `aiosqlite`).
*   **Telephony**: Carrier-level conditional forwarding (Busy Forwarding `*67*`) to an **Exotel** (or **Twilio**) virtual number.
*   **Real-time AI Pipeline**:
    1.  **Speech-to-Text (STT)**: Real-time audio stream connected via WebSockets to **Deepgram** (low-latency, multi-lingual model).
    2.  **LLM Brain**: Parallel processing via **Groq (Llama-3)** executing conversational managers, spam detection, intent classification, and urgency indicators.
    3.  **Text-to-Speech (TTS)**: Low-latency linear PCM and μ-law audio generation using **ElevenLabs**.
    4.  **Notifications**: Post-call triggers that send WhatsApp summary cards to the owner.

---

## 📞 Interactive Live Demo

Judges can test the live voice assistant directly from their own phones:

1.  **Call the Assistant**: Dial the active receptionist number:
    *   **Direct Number**: `[Insert Exotel Virtual Number or Personal Forwarding Number here]`
2.  **Interact with CallMinds**: Speak naturally (e.g. ask for Aneesh, request a callback, or state a business proposal). Feel free to speak in English or Hinglish (Hindi/English mix).
3.  **Watch the Live Dashboard**: Watch the call card, transcription speech bubbles, sentiment analysis, and AI-extracted action items update instantly on the dashboard!

---

## 🚀 Getting Started

Follow these steps to set up CallMinds locally on your machine.

### 1. Prerequisites
Ensure you have the following installed:
*   Python 3.10 or higher
*   Node.js (v18 or higher) and npm

---

### 2. Backend Setup (FastAPI)

1.  Navigate to the project root directory:
    ```bash
    # Open your terminal in the root directory
    ```
2.  Install the required Python packages:
    ```bash
    pip install -r requirements.txt
    ```
3.  Copy the environment variables template:
    ```bash
    cp .env.example .env
    ```
4.  Open the newly created `.env` file and fill in your API credentials (Groq key, Deepgram key, ElevenLabs key, and Exotel/Twilio credentials).
5.  Start the FastAPI backend:
    ```bash
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ```
    *The API docs will be active at `http://localhost:8000/docs`.*

---

### 3. Database Seeding (Crucial for Demo)

To help you review the dashboard and its full features without needing to place a real phone call, we have included a database seeder script containing three high-quality demo calls:
*   **Arjun Nair (Follow-up)**: Showcases bilingual/Hinglish speech translation and intent classification.
*   **Mom (Personal)**: Showcases family call classification and relationship routing.
*   **Spam Call (Lottery Scam)**: Showcases parallel spam detection and auto-hangup (terminates call in 12 seconds).

Run the seeding script from the root directory:
```bash
python seed_test_data.py
```
*This clears out previous test logs and inserts these 3 pristine records into `aria.db`.*

---

### 4. Frontend Setup (React/Vite)

1.  Navigate to the `dashboard` directory:
    ```bash
    cd dashboard
    ```
2.  Install the Node dependencies:
    ```bash
    npm install
    ```
3.  Start the Vite local development server:
    ```bash
    npm run dev
    ```
4.  Open `http://localhost:5173/` in your browser. You will see the beautiful Japan-themed CallMinds dashboard fully loaded with the seeded demo calls.

---

## ☁️ Separate Hosting Guide

For production, you can host the frontend and backend on separate platforms:

### A. Frontend (Netlify / Vercel)
*   Deploy the `dashboard` directory.
*   Configure the environment variables in your hosting provider's dashboard:
    *   `VITE_API_URL` = `https://your-backend-domain.onrender.com` (Vite will compile this base URL directly into the production code, allowing it to target your backend).
    *   *If no variable is set, it automatically defaults to `http://localhost:8000` for local development.*

### B. Backend (Render / Railway)
*   **Important**: Because the live call bridge requires open, stateful connections, **do not host the backend on Vercel** (serverless functions do not support WebSockets). Instead, host it on **Render** (Web Services) or **Railway**.
*   Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
*   Add your `.env` keys to your hosted environment variables.
*   Set your Exotel/Twilio inbound webhooks to target: `https://your-backend-domain.onrender.com/exotel/incoming`.
