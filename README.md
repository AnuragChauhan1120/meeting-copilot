# Meeting Copilot

A real-time AI meeting assistant that transcribes your conversation live, surfaces contextual suggestions every 30 seconds, and lets you dive deeper into any topic through an integrated chat — all in the browser, no backend required.

**Live demo**: https://capable-unicorn-60b3ff.netlify.app/

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
git clone https://github.com/AnuragChauhan1120/Meeting_copilot.git
cd Meeting_copilot
npm install
npm run dev
```

Open `http://localhost:5173`, click the settings icon, paste your Groq API key and start recording.

Get a free Groq API key at https://console.groq.com/keys

---

## Project structure

src/
├── App.jsx       — all state, logic and UI in one file
├── groq.js       — two functions: transcribe() and chat()
├── prompts.js    — prompt templates and config constants
├── index.css     — all styles
└── main.jsx      — mounts the app

---

## Prompt strategy

**Suggestions (every 30s)**
Uses a rolling 3-minute context window instead of the full transcript so suggestions stay grounded in what's happening right now. The prompt enforces type variety — one clarifying question, one action item, one risk or insight — because without this constraint the model defaults to three similar questions.

**Detailed answers (on click)**
Uses a wider 10-minute context window because answers need meeting history, not just recent context. Prompt instructs the model to reference specific things said and end with a follow-up question to keep the conversation moving.

**Freeform chat**
Combines transcript context with the last 6 chat turns so multi-turn conversation stays coherent without blowing the context window.

**Why Groq**
Groq's inference speed is the core reason this feels real-time. Whisper transcription returns in under a second. LLM streaming starts in ~300ms. On any other provider the latency would make suggestions feel stale by the time they appear.

---

## Key technical decisions

**Stop/restart recording instead of timeslice chunking**
`MediaRecorder.start(5000)` is unreliable across browsers — Chrome stops firing `ondataavailable` after silence. Instead the recorder is stopped and restarted every 5 seconds, guaranteeing a fresh complete blob that Whisper handles correctly.

**Refs mirroring state for async callbacks**
Intervals and async functions capture stale closures in React. All values that need to be read inside `setInterval` or async API calls are mirrored into refs that stay current.

**No backend**
Zero deployment complexity. Groq's API allows browser-direct CORS calls. The API key lives in localStorage — acceptable for a demo tool, would move server-side in production.

---

## What I'd do with more time

- Speaker diarization — label who said what in the transcript
- Persistent sessions — save and reload past meetings
- Suggestion types as colored tags visible on the card
- Mobile layout
- Test suite for the prompt outputs

---

## Author

Anurag Chauhan — [github.com/AnuragChauhan1120](https://github.com/AnuragChauhan1120)
Website link - https://capable-unicorn-60b3ff.netlify.app/
