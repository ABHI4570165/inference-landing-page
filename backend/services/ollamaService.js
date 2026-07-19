// Local LLM fallback via Ollama (http://localhost:11434) — runs on the same
// machine as this backend. Used as a middle tier between Gemini and the local
// rule-engine: if Gemini's quota/auth fails, try a real local model before
// giving up to the crude deterministic fallback.
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 180000; // local CPU inference is slow

async function sendOllamaPrompt(prompt, model = OLLAMA_MODEL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 }
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Ollama request failed: ${res.status} ${text}`.trim());
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    if (!data.response || typeof data.response !== 'string') {
      const err = new Error('Ollama returned no usable output');
      err.name = 'OllamaResponseError';
      throw err;
    }
    return data.response;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Ollama request timed out after ${OLLAMA_TIMEOUT_MS}ms`);
      timeoutErr.name = 'OllamaTimeoutError';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateOllamaConnection() {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!res.ok) throw new Error(`Ollama not reachable at ${OLLAMA_BASE_URL} (status ${res.status})`);
  const data = await res.json();
  const names = (data.models || []).map(m => m.name);
  if (!names.some(n => n === OLLAMA_MODEL || n.startsWith(OLLAMA_MODEL.split(':')[0]))) {
    throw new Error(`Model "${OLLAMA_MODEL}" not found in Ollama. Run: ollama pull ${OLLAMA_MODEL}`);
  }
  return names;
}

module.exports = { sendOllamaPrompt, validateOllamaConnection, OLLAMA_MODEL };
