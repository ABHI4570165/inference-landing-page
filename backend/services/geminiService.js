const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_KEY) {
  const err = new Error('GEMINI_API_KEY is not set in backend/.env or process.env. Add GEMINI_API_KEY to backend/.env and restart the server.');
  err.name = 'GeminiKeyMissingError';
  throw err;
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function logGeminiRequest({ model, retryNumber, promptLength, estimatedTokens, status }) {
  console.info(`Gemini | model=${model} retry=${retryNumber} promptChars=${promptLength} estTokens=${estimatedTokens} status=${status}`);
}

async function sendGeminiPrompt(prompt, model = GEMINI_MODEL, meta = {}) {
  if (!GEMINI_KEY) {
    const err = new Error('GEMINI_API_KEY is not set in backend/.env or process.env. Add GEMINI_API_KEY to backend/.env and restart the server.');
    err.name = 'GeminiKeyMissingError';
    throw err;
  }

  const requestId = crypto.randomUUID();
  const promptLength = prompt.length;
  const estimatedTokens = estimateTokens(prompt);
  const retryNumber = Number(meta.retryNumber) || 1;
  const studentId = meta.studentId || 'unknown';
  const responseId = meta.responseId || 'unknown';

  const startTime = Date.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      temperature: 0.2,
      maxOutputTokens: 3000
    });

    const durationMs = Date.now() - startTime;
    const text = typeof response?.text === 'string'
      ? response.text
      : response?.candidates?.[0]?.output || response?.output;

    if (!text || typeof text !== 'string') {
      const err = new Error('Gemini returned no usable output');
      err.name = 'GeminiResponseError';
      err.status = 502;
      throw err;
    }

    logGeminiRequest({ model, retryNumber, promptLength, estimatedTokens, status: 200 });
    return text;
  } catch (err) {
    const status = err.status || err.response?.status || 'unknown';
    logGeminiRequest({ model, retryNumber, promptLength, estimatedTokens, status });
    throw err;
  }
}

async function validateGeminiConnection() {
  if (!GEMINI_KEY) {
    throw new Error('GEMINI_API_KEY is not set in backend/.env or process.env. Add GEMINI_API_KEY to backend/.env and restart the server.');
  }

  try {
    const output = await sendGeminiPrompt('Reply with OK');
    if (!output || !output.trim()) {
      throw new Error('Gemini startup validation returned empty response');
    }
    if (!/ok/i.test(output.trim())) {
      console.warn('[GeminiService] validation response did not match expected text:', output.trim());
    }
    return output.trim();
  } catch (err) {
    console.error('[GeminiService] validateGeminiConnection failed:', err.stack || err);
    throw err;
  }
}

module.exports = { sendGeminiPrompt, validateGeminiConnection };
