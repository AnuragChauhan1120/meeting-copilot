import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, RefreshCw, Loader2, Settings, Download } from "lucide-react";
import { transcribe } from "./groq.js";
import { chat } from "./groq.js";
import { SUGGESTION_PROMPT, DETAIL_PROMPT, CHAT_PROMPT, CONFIG, DEPTH_OPTIONS } from "./prompts.js";

// ── helpers ──────────────────────────────────────────────
let _id = 0;
const uid = () => String(++_id);

function getRecentTranscript(entries, seconds) {
  const cutoff = Date.now() - seconds * 1000;
  return entries
    .filter((e) => e.ts >= cutoff)
    .map((e) => e.text)
    .join(" ");
}

function buildPrompt(template, vars) {
  return Object.entries(vars).reduce(
    (str, [k, v]) => str.replace(`{${k}}`, v),
    template
  );
}

// ── recording hook ────────────────────────────────────────
function useRecorder(onChunk) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) onChunk(e.data);
      };

      recorder.start();

      // every AUDIO_CHUNK_MS, stop and immediately restart
      // this forces ondataavailable to fire with a complete blob
      intervalRef.current = setInterval(() => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
          const newRecorder = new MediaRecorder(streamRef.current);
          newRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) onChunk(e.data);
          };
          newRecorder.start();
          recorderRef.current = newRecorder;
        }
      }, CONFIG.AUDIO_CHUNK_MS);

      setRecording(true);
    } catch (err) {
      setError(
        err.name === "NotAllowedError"
          ? "Microphone access denied."
          : err.message
      );
    }
  }

  function stop() {
    clearInterval(intervalRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  return { recording, error, start, stop };
}

// ── App ───────────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("groq_key") || "");
  const [transcript, setTranscript] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [chat_history, setChatHistory] = useState([]);
  const [streaming, setStreaming] = useState("");
  const [loadingSugg, setLoadingSugg] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [suggInterval, setSuggInterval] = useState(30);
  const [suggContext, setSuggContext] = useState(3);
  const [chatContext, setChatContext] = useState(10);
  const [depth, setDepth] = useState("Medium");

  const [elapsed, setElapsed] = useState(0);

  const transcriptRef = useRef([]);
  const apiKeyRef = useRef(apiKey);
  const suggTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);

  // keep refs in sync with state
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);

  // ── audio chunk handler ──
  async function handleChunk(blob) {
    const key = apiKeyRef.current;
    if (!key) return;
    try {
      const text = await transcribe(blob, key);
      if (text.length > 2) {
        const entry = { id: uid(), text, ts: Date.now() };
        setTranscript((prev) => [...prev, entry]);
      }
    } catch (e) {
      console.error("Whisper error:", e.message);
    }
  }

  const { recording, error: recError, start, stop } = useRecorder(handleChunk);

  // ── suggestion generation ──
  async function generateSuggestions() {
    const key = apiKeyRef.current;
    const entries = transcriptRef.current;
    if (!key || entries.length === 0) return;

    setLoadingSugg(true);
    try {
      const transcript_text = getRecentTranscript(entries, suggContext * 60);
      const prompt = buildPrompt(SUGGESTION_PROMPT, { transcript: transcript_text });
      let full = "";
      await chat([{ role: "user", content: prompt }], key, (t) => { full = t; });

      const clean = full.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) setSuggestions(parsed.slice(0, 3));
    } catch (e) {
      console.error("Suggestions error:", e.message);
    } finally {
      setLoadingSugg(false);
    }
  }

  // ── start/stop recording ──
  function handleStart() {
    if (!apiKey) { setShowSettings(true); return; }
    setElapsed(0);
    start();
    elapsedTimerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
    setTimeout(generateSuggestions, 15000);
    suggTimerRef.current = setInterval(generateSuggestions, suggInterval * 1000);
  }

  function handleStop() {
    stop();
    clearInterval(suggTimerRef.current);
    clearInterval(elapsedTimerRef.current);
  }

  // ── chat ──
  async function sendMessage(text, linkedSuggestion = null) {
    const key = apiKeyRef.current;
    if (!key) return;

    const userMsg = { id: uid(), role: "user", content: text, linked: linkedSuggestion, ts: Date.now() };
    setChatHistory((prev) => [...prev, userMsg]);

    const transcript_text = getRecentTranscript(transcriptRef.current, chatContext * 60);
    const history_text = chat_history.slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const prompt = linkedSuggestion
      ? buildPrompt(DETAIL_PROMPT, { suggestion: linkedSuggestion, transcript: transcript_text, depth: DEPTH_OPTIONS[depth] })
      : buildPrompt(CHAT_PROMPT, { transcript: transcript_text, history: history_text });

    setStreaming("...");
    try {
      const full = await chat(
        [{ role: "user", content: prompt }],
        key,
        (t) => setStreaming(t)
      );
      setChatHistory((prev) => [...prev, { id: uid(), role: "assistant", content: full, ts: Date.now() }]);
    } catch (e) {
      setChatHistory((prev) => [...prev, { id: uid(), role: "assistant", content: `Error: ${e.message}`, ts: Date.now() }]);
    } finally {
      setStreaming("");
    }
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(suggTimerRef.current);
      clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const fmtTime = (s) => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

  return (
    <div className="app">

      {/* ── Column 1: Transcript ── */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-label">1. Mic &amp; Transcript</span>
          <div className="panel-header-right">
            {recording && <span className="rec-time">{fmtTime(elapsed)}</span>}
            <span className="panel-status">{recording ? "RECORDING" : "IDLE"}</span>
            <button className="icon-btn" onClick={() => setShowSettings(true)}>
              <Settings size={14} />
            </button>
          </div>
        </div>

        <div className="mic-row">
          <button className={`mic-btn ${recording ? "active" : ""}`} onClick={recording ? handleStop : handleStart}>
            {recording ? <MicOff size={18} /> : <Mic size={18} />}
            {recording && <span className="mic-ring" />}
          </button>
          <span className="mic-label">
            {recError
              ? <span style={{color:"var(--red)"}}>{recError}</span>
              : recording ? "Recording — click to stop"
              : "Click to start recording"}
          </span>
        </div>

        <div className="transcript-body">
          {transcript.length === 0
            ? <p className="empty">No transcript yet — start the mic.</p>
            : transcript.map((e) => (
                <div key={e.id} className="transcript-entry">
                  <span className="entry-time">
                    {new Date(e.ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})}
                  </span>
                  <span>{e.text}</span>
                </div>
              ))
          }
        </div>
      </div>

      {/* ── Column 2: Suggestions ── */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-label">2. Live Suggestions</span>
          <span className="panel-status">{suggestions.length > 0 ? "READY" : "WAITING"}</span>
        </div>

        <div className="sugg-toolbar">
          <button className="reload-btn" onClick={generateSuggestions}
            disabled={loadingSugg || !apiKey || transcript.length === 0}>
            {loadingSugg ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
            Reload suggestions
          </button>
          <span className="refresh-label">auto-refresh in 30s</span>
        </div>

        <div className="sugg-body">
          {loadingSugg && suggestions.length === 0 && (
            <div className="sugg-loading">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          )}
          {suggestions.length === 0 && !loadingSugg && (
            <p className="empty">Suggestions appear once recording starts.</p>
          )}
          {suggestions.map((s, i) => (
            <button key={i} className="sugg-card" onClick={() => sendMessage(s, s)}>
              <span className="sugg-text">{s}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Column 3: Chat ── */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-label">3. Chat (Detailed Answers)</span>
          <span className="panel-status">SESSION-ONLY</span>
        </div>

        <div className="chat-body">
          {chat_history.length === 0 && !streaming && (
            <p className="empty">Click a suggestion or type a question below.</p>
          )}
          {chat_history.map((m) => (
            <div key={m.id} className={`message ${m.role}`}>
              {m.linked && <div className="linked">↳ {m.linked}</div>}
              <div className="bubble">{m.content}</div>
            </div>
          ))}
          {streaming && (
            <div className="message assistant">
              <div className="bubble">{streaming}<span className="cursor" /></div>
            </div>
          )}
        </div>

        <div className="chat-input-row">
          <ChatInput onSend={(t) => sendMessage(t, null)} disabled={!!streaming} />
        </div>
      </div>

      {/* ── Settings modal ── */}
      {showSettings && (
  <div className="modal-overlay" onClick={() => setShowSettings(false)}>
    <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <span>Settings</span>
        <button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button>
      </div>
      <div className="modal-body">

        <div className="modal-section">
          <div className="modal-section-title">API</div>
          <label>Groq API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); localStorage.setItem("groq_key", e.target.value); }}
            placeholder="gsk_..."
          />
          <p className="hint">Get yours at console.groq.com/keys</p>
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Behaviour</div>

          <label>Suggestion refresh interval (seconds)</label>
          <input type="number" min="10" max="120" value={suggInterval}
            onChange={(e) => setSuggInterval(Number(e.target.value))} />

          <label>Suggestion context window (minutes)</label>
          <input type="number" min="1" max="10" value={suggContext}
            onChange={(e) => setSuggContext(Number(e.target.value))} />

          <label>Chat context window (minutes)</label>
          <input type="number" min="1" max="30" value={chatContext}
            onChange={(e) => setChatContext(Number(e.target.value))} />

          <label>Answer depth</label>
          <select value={depth} onChange={(e) => setDepth(e.target.value)}>
            {Object.keys(DEPTH_OPTIONS).map((k) => (
              <option key={k} value={k}>{k} (~{DEPTH_OPTIONS[k]} words)</option>
            ))}
          </select>
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Export</div>
          <button className="export-btn" onClick={() => {
            const text = transcriptRef.current.map((e) =>
              `[${new Date(e.ts).toLocaleTimeString()}] ${e.text}`
            ).join("\n");
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "transcript.txt"; a.click();
            URL.revokeObjectURL(url);
          }}>
            Download transcript (.txt)
          </button>
        </div>

      </div>
    </div>
  </div>
)}

    </div>
  );
}

// ── ChatInput ─────────────────────────────────────────────
function ChatInput({ onSend, disabled }) {
  const [val, setVal] = useState("");
  const send = () => { const t = val.trim(); if (!t || disabled) return; setVal(""); onSend(t); };
  return (
    <div className="chat-input-row">
      <textarea
        className="chat-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
        placeholder="Ask anything..."
        rows={1}
        disabled={disabled}
      />
      <button className="send-btn" onClick={send} disabled={!val.trim() || disabled}>Send</button>
    </div>
  );
}