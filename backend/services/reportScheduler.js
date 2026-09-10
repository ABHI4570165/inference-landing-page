const ReportDelivery = require('../models/ReportDelivery');
const { buildDailyReport, formatText, formatHtml, istDateString } = require('./dailyReport');
const {
  sendEmail, sendWhatsApp, emailConfigured, whatsappConfigured
} = require('./notifiers');

// ── Daily report at 18:00 IST ───────────────────────────────────────────────
//
// WhatsApp is tried first when configured, with email as the fallback (and
// both are sent when both are configured, since a report is cheap and a missed
// one is not).
//
// Delivery is recorded in ReportDelivery, whose unique { kind, date } index is
// what makes this safe to call more than once: the in-process timer and an
// external cron can both fire, and the process can restart during the evening,
// without anyone receiving two copies.

const KIND = 'daily-applications';
const DEFAULT_HOUR = 18;   // 6pm IST

function istHourMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = t => Number(parts.find(p => p.type === t)?.value);
  return { hour: get('hour'), minute: get('minute') };
}

function readConfig(env = process.env) {
  const hour = Number(env.DAILY_REPORT_HOUR);
  return {
    enabled: env.DAILY_REPORT_ENABLED !== 'false',
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR
  };
}

// Sends the report for one IST day. `force` re-sends a day already delivered.
async function sendDailyReport({ date = istDateString(), triggeredBy = 'scheduler', force = false } = {}) {
  if (!emailConfigured() && !whatsappConfigured()) {
    return { ok: false, skipped: true, reason: 'no delivery channel configured (set SMTP_* or WHATSAPP_*)' };
  }

  // Claim the day BEFORE sending. Losing this race means someone else is
  // already sending it, which is exactly the outcome we want.
  if (!force) {
    const already = await ReportDelivery.findOne({ kind: KIND, date }).lean();
    if (already) {
      return { ok: true, skipped: true, reason: 'already sent', date, sentAt: already.createdAt };
    }
  }

  const report = await buildDailyReport(date);
  const text = formatText(report);
  const html = formatHtml(report);
  const subject = `Applications — ${report.prettyDate} (${report.total})`;

  const channels = [];
  const results = {};

  if (whatsappConfigured()) {
    channels.push('whatsapp');
    results.whatsapp = await sendWhatsApp({ text });
  }
  if (emailConfigured()) {
    channels.push('email');
    results.email = await sendEmail({ subject, text, html });
  }

  const delivered = Object.entries(results).filter(([, r]) => r.ok).map(([c]) => c);

  // Only record a day as done once something actually went out, or a transient
  // outage at 18:00 would suppress the report permanently.
  if (delivered.length) {
    try {
      await ReportDelivery.findOneAndUpdate(
        { kind: KIND, date },
        { $set: { total: report.total, channels, delivered, results, triggeredBy } },
        { upsert: true, new: true }
      );
    } catch (err) {
      if (err.code !== 11000) console.error('[daily-report] could not record delivery:', err.message);
    }
  }

  const summary = `[daily-report] ${date}: ${report.total} application(s), ` +
    `sent via ${delivered.join(' + ') || 'nothing'}` +
    (delivered.length < channels.length
      ? ` (failed: ${channels.filter(c => !delivered.includes(c)).join(', ')})`
      : '');
  delivered.length ? console.log(summary) : console.warn(summary, JSON.stringify(results));

  return { ok: delivered.length > 0, date, total: report.total, channels, delivered, results };
}

// The timer checks every minute rather than sleeping until 18:00, so a restart
// at any point in the day still picks the report up, and a clock change or a
// long GC pause cannot make it miss its slot.
function startReportScheduler(env = process.env) {
  const cfg = readConfig(env);

  if (!cfg.enabled) {
    console.log('ℹ️  Daily report scheduler disabled (DAILY_REPORT_ENABLED=false)');
    return null;
  }
  if (!emailConfigured(env) && !whatsappConfigured(env)) {
    console.log('ℹ️  Daily report not scheduled — configure SMTP_* (email) or WHATSAPP_* to enable it');
    return null;
  }

  console.log(`✅  Daily applications report at ${String(cfg.hour).padStart(2, '0')}:00 IST`);

  const tick = async () => {
    const { hour, minute } = istHourMinute();
    // Fire in the first few minutes of the hour; the ReportDelivery record
    // stops the repeated minutes from sending anything twice.
    if (hour !== cfg.hour || minute > 4) return;
    try {
      await sendDailyReport({ triggeredBy: 'scheduler' });
    } catch (err) {
      console.error('[daily-report] scheduler error:', err.message);
    }
  };

  const timer = setInterval(tick, 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  return { stop: () => clearInterval(timer), config: cfg, tick };
}

module.exports = { startReportScheduler, sendDailyReport, readConfig, istHourMinute, KIND };
