# Meeting Copilot

A real-time AI meeting assistant that transcribes your conversation live, surfaces contextual suggestions every 30 seconds, and lets you dive deeper into any topic through an integrated chat — all in the browser, no backend required.

**Live demo**: https://your-netlify-url.netlify.app

---

## What it does

- **Live transcription** — captures microphone audio in 5-second chunks and transcribes using Groq Whisper Large V3
- **Smart suggestions** — every 30 seconds, analyzes the last 3 minutes of transcript and generates 3 distinct suggestions: a clarifying question, an action item, and a risk or insight
- **Instant answers** — clicking any suggestion streams a detailed, context-aware response grounded in what was actually said
- **Freeform chat** — ask anything about the meeting at any time
- **Export** — download the full transcript as a .txt file for evaluation or review
- **Configurable** — adjust refresh interval, context windows, and answer depth without touching code

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Transcription | Groq Whisper Large V3 |
| LLM | Llama 3.3 70B (via Groq) |
| Styling | Plain CSS |
| Deployment | Netlify |

No backend. All API calls go directly from the browser to Groq. No data is stored anywhere.

---

## Setup

```bash
