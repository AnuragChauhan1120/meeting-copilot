const GROQ_BASE = "https://api.groq.com/openai/v1";

export async function transcribe(blob, apiKey) {
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "text");
  form.append("language", "en");

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Whisper failed: ${res.status}`);
  }

  const text = await res.text();
  return text.trim();
}

export async function chat(messages, apiKey, onChunk) {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Chat failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6);
      if (json === "[DONE]") continue;
      try {
        const delta = JSON.parse(json).choices?.[0]?.delta?.content || "";
        if (delta) { full += delta; onChunk(full); }
      } catch { /* skip malformed chunk */ }
    }
  }

  return full;
}