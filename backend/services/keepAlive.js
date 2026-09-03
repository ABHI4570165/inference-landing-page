// ── Daytime keep-warm ping ──────────────────────────────────────────────────
//
// The API is hosted on a free tier that spins the process down after ~15
// minutes without inbound traffic, so the first candidate to open a form after
// a quiet spell waits through a cold start. This pings the service's own public
// URL on an interval, which counts as inbound traffic and keeps it warm.
//
// It only runs during the working day (09:00-20:00 IST by default). Outside
// that window nothing is sent, so the service is left to sleep overnight
// instead of being held awake for nobody.
//
// IMPORTANT and deliberate limitation: this keeps the service awake, it cannot
// WAKE it. Once the host stops the process the interval stops with it, so the
// first visitor of the morning still pays for one cold start and the pings take
// over from there. Waking it at 09:00 unattended needs a pinger that lives
// somewhere else (an external uptime monitor, or a scheduled job on the host).

const DEFAULTS = {
  startHour: 9,        // inclusive - first hour of the day that pings
  endHour: 20,         // exclusive - pings stop once this hour begins
  intervalMinutes: 10  // under the ~15 min idle timeout, with room to spare
};

// The drive runs in India, and every other date boundary in this codebase is
// IST (see utils/dates.js), so the ping window is too — the host's own clock is
// UTC and must not leak in. hourCycle 'h23' keeps midnight as 0 rather than 24.
function istHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const hour = parts.find(p => p.type === 'hour');
  return hour ? Number(hour.value) : NaN;
}

function readConfig(env = process.env) {
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) ? n : fallback;
  };

  const startHour = num(env.KEEP_ALIVE_START_HOUR, DEFAULTS.startHour);
  const endHour = num(env.KEEP_ALIVE_END_HOUR, DEFAULTS.endHour);
  const intervalMinutes = num(env.KEEP_ALIVE_INTERVAL_MINUTES, DEFAULTS.intervalMinutes);

  return {
    // Render exposes the service's own public URL; KEEP_ALIVE_URL overrides it
    // for any other host. Without one there is nothing to ping.
    url: (env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, ''),
    enabled: env.KEEP_ALIVE_ENABLED !== 'false',
    startHour: startHour >= 0 && startHour <= 23 ? startHour : DEFAULTS.startHour,
    endHour: endHour >= 1 && endHour <= 24 ? endHour : DEFAULTS.endHour,
    intervalMinutes: intervalMinutes >= 1 ? intervalMinutes : DEFAULTS.intervalMinutes
  };
}

// Whether the given hour falls inside the active window. Written to cope with a
// window that wraps past midnight (e.g. 22->6) even though the default does not,
// so changing the env vars can never silently produce a window that never opens.
function isWithinWindow(hour, startHour, endHour) {
  if (!Number.isInteger(hour)) return false;
  if (startHour === endHour) return false;            // zero-width: never ping
  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;            // wraps past midnight
}

async function pingOnce(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'mandi-portal-keepalive' }
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Starts the interval and returns a stop() handle (used by tests; the server
// itself just leaves it running for the life of the process).
function startKeepAlive(env = process.env) {
  const cfg = readConfig(env);

  if (!cfg.enabled) {
    console.log('ℹ️  Keep-alive ping disabled (KEEP_ALIVE_ENABLED=false)');
    return null;
  }
  if (!cfg.url) {
    console.log('ℹ️  Keep-alive ping not started — set KEEP_ALIVE_URL (or run on a host that provides RENDER_EXTERNAL_URL)');
    return null;
  }

  const target = `${cfg.url}/healthz`;
  console.log(
    `✅  Keep-alive ping every ${cfg.intervalMinutes} min, ` +
    `${String(cfg.startHour).padStart(2, '0')}:00–${String(cfg.endHour).padStart(2, '0')}:00 IST → ${target}`
  );

  const tick = async () => {
    const hour = istHour();
    if (!isWithinWindow(hour, cfg.startHour, cfg.endHour)) return;   // outside hours: stay quiet

    const result = await pingOnce(target);
    if (!result.ok) {
      // Worth seeing in the logs, but never fatal — a failed keep-warm ping
      // costs a cold start at worst and must not take the API down.
      console.warn(`[keep-alive] ping failed (${result.error || 'HTTP ' + result.status})`);
    }
  };

  const timer = setInterval(tick, cfg.intervalMinutes * 60 * 1000);
  // Do not hold the event loop open on shutdown.
  if (typeof timer.unref === 'function') timer.unref();

  return { stop: () => clearInterval(timer), config: cfg, tick };
}

module.exports = { startKeepAlive, isWithinWindow, istHour, readConfig, DEFAULTS };
