// ── Outbound notification channels ──────────────────────────────────────────
//
// Two ways to deliver a report, each enabled purely by whether its environment
// variables are set. Neither ever throws: a failed notification must never take
// the API down or abort whatever produced the report.

const nodemailer = require('nodemailer');

// ── Email (SMTP) ────────────────────────────────────────────────────────────
// Works with any SMTP provider — a Hostinger mailbox, Gmail with an App
// Password, Zoho, SES. This is the dependable channel: no approval process and
// no template rules.
function emailConfig(env = process.env) {
  return {
    host: (env.SMTP_HOST || '').trim(),
    port: Number(env.SMTP_PORT) || 587,
    user: (env.SMTP_USER || '').trim(),
    pass: env.SMTP_PASS || '',
    from: (env.REPORT_EMAIL_FROM || env.SMTP_USER || '').trim(),
    // Comma-separated; every address gets the same report.
    to: (env.REPORT_EMAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean)
  };
}

const emailConfigured = (env = process.env) => {
  const c = emailConfig(env);
  return !!(c.host && c.user && c.pass && c.to.length);
};

async function sendEmail({ subject, text, html }, env = process.env) {
  const c = emailConfig(env);
  if (!emailConfigured(env)) {
    return { ok: false, skipped: true, reason: 'email not configured' };
  }
  try {
    const transport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: c.port === 465,
      auth: { user: c.user, pass: c.pass }
    });
    const info = await transport.sendMail({
      from: c.from, to: c.to.join(', '), subject, text, html
    });
    return { ok: true, channel: 'email', to: c.to, messageId: info.messageId };
  } catch (err) {
    return { ok: false, channel: 'email', error: err.message };
  }
}

// ── WhatsApp (Meta Cloud API) ───────────────────────────────────────────────
// Requires a WhatsApp Business Account: a phone number id and a permanent
// access token.
//
// The rule that shapes this: a business-initiated message — which a scheduled
// daily report always is — may ONLY be a pre-approved TEMPLATE. A free-form
// text message is accepted solely inside the 24 hours after the recipient last
// messaged the business number, so it cannot be relied on for a 6pm report.
//
// So: if a template name is configured, the report is sent as that template
// with the whole report text as its single body variable (create the template
// with one body placeholder, {{1}}). Without a template name it falls back to a
// plain text message, which is useful for testing inside the 24-hour window but
// will be rejected outside it — hence the explicit error surfaced below.
function whatsappConfig(env = process.env) {
  return {
    phoneNumberId: (env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    token: (env.WHATSAPP_TOKEN || '').trim(),
    to: (env.WHATSAPP_TO || '').split(',').map(s => s.replace(/[^\d]/g, '')).filter(Boolean),
    template: (env.WHATSAPP_TEMPLATE || '').trim(),
    language: (env.WHATSAPP_TEMPLATE_LANG || 'en').trim(),
    apiVersion: (env.WHATSAPP_API_VERSION || 'v21.0').trim()
  };
}

const whatsappConfigured = (env = process.env) => {
  const c = whatsappConfig(env);
  return !!(c.phoneNumberId && c.token && c.to.length);
};

async function sendWhatsApp({ text }, env = process.env) {
  const c = whatsappConfig(env);
  if (!whatsappConfigured(env)) {
    return { ok: false, skipped: true, reason: 'whatsapp not configured' };
  }

  const url = `https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`;
  const results = [];

  for (const to of c.to) {
    const body = c.template
      ? {
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: c.template,
            language: { code: c.language },
            components: [{ type: 'body', parameters: [{ type: 'text', text }] }]
          }
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);

      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        results.push({ to, ok: true, id: payload?.messages?.[0]?.id });
      } else {
        results.push({ to, ok: false, error: payload?.error?.message || `HTTP ${res.status}` });
      }
    } catch (err) {
      results.push({ to, ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message });
    }
  }

  const ok = results.some(r => r.ok);
  return { ok, channel: 'whatsapp', results };
}

module.exports = {
  sendEmail, sendWhatsApp,
  emailConfigured, whatsappConfigured,
  emailConfig, whatsappConfig
};
