// Regenerate every remaining "Local Engine" report via HTTP.
// History of fixes from previous attempts:
//  1. (run 1) Logged in once, run took 8h3m — token (8h JWT) expired mid-run,
//     everything after failed with 401.
//  2. (run 2) "Fixed" by logging in before every request — immediately hit
//     the login rate limiter (max 10 attempts / 15 min), so everything
//     after the 10th request failed instantly.
//  3. (this run) Login ONCE, keep the 6-minute per-request timeout cap from
//     run 2 (which bounds total runtime to a few hours, well under 8h, so
//     the token won't expire) — and ONLY re-login reactively if a request
//     ever actually comes back 401, so the rate limiter is never at risk.
require('dotenv').config({ path: 'c:/Users/abhis/Downloads/mandi-portal/mandi-portal/backend/.env' });
const mongoose = require('mongoose');

const BASE_URL = process.argv[2] || 'http://localhost:5100';
const REQUEST_TIMEOUT_MS = 6 * 60 * 1000;

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  const data = await res.json();
  if (!data.token) throw new Error('login failed: ' + JSON.stringify(data));
  return data.token;
}

async function regenerateOnce(responseId, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}/api/admin/counselling/responses/${responseId}/regenerate`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  await mongoose.connection.db.admin().ping();

  const targets = await mongoose.connection.db.collection('counsellingreports')
    .find({ reportSource: 'Local Engine' }, { projection: { response: 1 } }).toArray();
  console.log(`Found ${targets.length} Local Engine reports to regenerate via ${BASE_URL}`);
  await mongoose.disconnect();

  let token = await login();
  console.log('Logged in once. Starting backfill...\n');

  const results = { huggingface: 0, ollama: 0, stillLocal: 0, errors: 0 };
  const startAll = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const responseId = String(targets[i].response);
    const t0 = Date.now();
    try {
      let res = await regenerateOnce(responseId, token);
      if (res.status === 401) {
        console.warn(`  token rejected, re-logging in once...`);
        token = await login();
        res = await regenerateOnce(responseId, token);
      }
      const data = await res.json();
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const source = data.report?.reportSource || `HTTP ${res.status}`;
      console.log(`[${i + 1}/${targets.length}] ${responseId} — ${source} (${secs}s)`);
      if (source === 'Hugging Face') results.huggingface++;
      else if (source === 'Ollama') results.ollama++;
      else if (source === 'Local Engine') results.stillLocal++;
      else results.errors++;
    } catch (err) {
      results.errors++;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`[${i + 1}/${targets.length}] ${responseId} — ERROR after ${secs}s: ${err.message}`);
    }
  }

  const totalMins = ((Date.now() - startAll) / 60000).toFixed(1);
  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Total time: ${totalMins} minutes`);
  console.log(`Hugging Face: ${results.huggingface}`);
  console.log(`Ollama: ${results.ollama}`);
  console.log(`Still Local Engine (both failed): ${results.stillLocal}`);
  console.log(`Errors: ${results.errors}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
