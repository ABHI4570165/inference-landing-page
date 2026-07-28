// Hugging Face Inference Providers — cloud-hosted (GPU-backed), used as an
// explicit alternative to local Ollama when AI_PROVIDER=huggingface is set.
// Much faster than local CPU inference; requires HUGGINGFACE_API_KEY.
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
const HF_MODEL = process.env.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.1-8B-Instruct';
const HF_TIMEOUT_MS = Number(process.env.HUGGINGFACE_TIMEOUT_MS) || 60000;
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';

async function sendHuggingFacePrompt(prompt, model = HF_MODEL) {
  if (!HF_API_KEY) {
    const err = new Error('HUGGINGFACE_API_KEY is not set in backend/.env or process.env. Add HUGGINGFACE_API_KEY to backend/.env and restart the server.');
    err.name = 'HuggingFaceKeyMissingError';
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  try {
    const res = await fetch(HF_ROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 3000
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let hint = '';
      if (res.status === 403) hint = ' — if this is a gated model (e.g. Llama), accept its license on the model\'s Hugging Face page with the same account that created your token.';
      if (res.status === 401) hint = ' — check HUGGINGFACE_API_KEY is correct.';
      const err = new Error(`Hugging Face request failed: ${res.status} ${text}${hint}`.trim());
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') {
      const err = new Error('Hugging Face returned no usable output');
      err.name = 'HuggingFaceResponseError';
      throw err;
    }
    return text;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Hugging Face request timed out after ${HF_TIMEOUT_MS}ms`);
      timeoutErr.name = 'HuggingFaceTimeoutError';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function validateHuggingFaceConnection() {
  const output = await sendHuggingFacePrompt('Reply with the single word: OK');
  if (!output || !output.trim()) {
    throw new Error('Hugging Face validation returned empty response');
  }
  return output.trim();
}

module.exports = { sendHuggingFacePrompt, validateHuggingFaceConnection, HF_MODEL };
