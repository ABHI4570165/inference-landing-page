const Workspace = require('../models/Workspace');
const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const Student = require('../models/Student');
const { IST_OFFSET_MS } = require('../utils/dates');

// ── Daily applications report ───────────────────────────────────────────────
//
// Counts applications received in one IST day, broken down by workspace and by
// the form they came through.
//
// "Application" means the same thing here as on the Applications dashboard and
// the Forms list (see routes/applications.js and responseCountsFor in
// routes/forms.js), so the numbers agree with what an admin sees on screen:
//
//   • a FormSubmission  — a response to a form built in the Form Builder
//   • a Student         — the resume-bearing intake application
//
// A Student created BY a submission is NOT counted again, or every custom-form
// application would appear twice. That is what `hasFormSubmission: { $ne: true }`
// is doing below — the same guard the Forms list uses.

// Start/end instants of one IST calendar day, as real UTC Dates suitable for a
// range query. Written from the 'YYYY-MM-DD' string rather than "now" so the
// report can be re-run for any past day.
function istDayRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startUTC = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS;
  return { start: new Date(startUTC), end: new Date(startUTC + 24 * 60 * 60 * 1000) };
}

function istDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

// Human date for the report heading, e.g. "Tue, 9 Sep 2026".
function prettyDate(dateStr) {
  const { start } = istDayRange(dateStr);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  }).format(new Date(start.getTime() + 60 * 60 * 1000));
}

async function buildDailyReport(dateStr = istDateString()) {
  const { start, end } = istDayRange(dateStr);
  const window = { $gte: start, $lt: end };

  const [workspaces, forms, submissions, students] = await Promise.all([
    Workspace.find({}).select('companyName recruitmentDriveName status').lean(),
    Form.find({}).select('name workspace origin').lean(),
    FormSubmission.aggregate([
      { $match: { submittedAt: window } },
      { $group: { _id: { workspace: '$workspace', form: '$form' }, count: { $sum: 1 } } }
    ]),
    Student.aggregate([
      { $match: { createdAt: window, hasFormSubmission: { $ne: true } } },
      { $group: { _id: { workspace: '$workspace', form: '$form' }, count: { $sum: 1 } } }
    ])
  ]);

  const workspaceById = new Map(workspaces.map(w => [String(w._id), w]));
  const formById = new Map(forms.map(f => [String(f._id), f]));

  // Merge both sources into one count per (workspace, form).
  const tally = new Map();
  for (const row of [...submissions, ...students]) {
    const wsId = String(row._id.workspace);
    const formId = row._id.form ? String(row._id.form) : 'none';
    const key = `${wsId}|${formId}`;
    tally.set(key, (tally.get(key) || 0) + row.count);
  }

  const byWorkspace = new Map();
  for (const [key, count] of tally) {
    const [wsId, formId] = key.split('|');
    if (!byWorkspace.has(wsId)) {
      const ws = workspaceById.get(wsId);
      byWorkspace.set(wsId, {
        workspaceId: wsId,
        workspaceName: ws ? ws.companyName : 'Unknown workspace',
        driveName: ws ? ws.recruitmentDriveName : '',
        total: 0,
        forms: []
      });
    }
    const entry = byWorkspace.get(wsId);
    const form = formById.get(formId);
    entry.forms.push({
      formId,
      // An application with no form at all predates the Forms module; label it
      // rather than dropping it, so the totals always reconcile.
      formName: form ? form.name : 'No form (direct entry)',
      count
    });
    entry.total += count;
  }

  const rows = [...byWorkspace.values()].sort((a, b) => b.total - a.total);
  rows.forEach(r => {
    r.forms.sort((a, b) => b.count - a.count || a.formName.localeCompare(b.formName));

    // Nothing stops two forms in one workspace sharing a name, and they do
    // ("Registration Form" twice). Identical lines in a report are unreadable,
    // so a repeated name gets a short id suffix to tell them apart.
    const seen = new Map();
    r.forms.forEach(f => seen.set(f.formName, (seen.get(f.formName) || 0) + 1));
    r.forms.forEach(f => {
      if (seen.get(f.formName) > 1 && f.formId !== 'none') {
        f.formName = `${f.formName} (#${f.formId.slice(-4)})`;
      }
    });
  });

  return {
    date: dateStr,
    prettyDate: prettyDate(dateStr),
    total: rows.reduce((n, r) => n + r.total, 0),
    workspaces: rows,
    generatedAt: new Date()
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────
// Plain text, for WhatsApp (and as the email's text alternative). WhatsApp
// renders *bold* between single asterisks.
function formatText(report) {
  const lines = [`*Applications — ${report.prettyDate}*`, ''];

  if (report.total === 0) {
    lines.push('No applications received today.');
  } else {
    lines.push(`*Total: ${report.total}*`, '');
    for (const ws of report.workspaces) {
      lines.push(`*${ws.workspaceName}* — ${ws.total}`);
      for (const f of ws.forms) lines.push(`  • ${f.formName}: ${f.count}`);
      lines.push('');
    }
  }
  lines.push('— Inference Labs Portal');
  return lines.join('\n').trim();
}

const escapeHtml = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function formatHtml(report) {
  const head = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:640px">
      <h2 style="margin:0 0 4px;font-size:19px;">Applications received</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">${escapeHtml(report.prettyDate)}</p>
      <p style="margin:0 0 20px;font-size:15px;">
        <strong style="font-size:26px;">${report.total}</strong>
        <span style="color:#6b7280;">application${report.total === 1 ? '' : 's'} today</span>
      </p>`;

  if (report.total === 0) {
    return head + `<p style="color:#6b7280;font-size:14px;">No applications were received today.</p></div>`;
  }

  const blocks = report.workspaces.map(ws => `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:14px;border-collapse:separate;">
      <tr>
        <td style="padding:12px 16px;background:#f9fafb;border-bottom:1px solid #e5e7eb;border-radius:10px 10px 0 0;">
          <strong style="font-size:14px;">${escapeHtml(ws.workspaceName)}</strong>
          <span style="float:right;font-weight:700;">${ws.total}</span>
        </td>
      </tr>
      ${ws.forms.map(f => `
      <tr>
        <td style="padding:9px 16px;border-bottom:1px solid #f3f4f6;font-size:13.5px;">
          ${escapeHtml(f.formName)}
          <span style="float:right;color:#374151;font-weight:600;">${f.count}</span>
        </td>
      </tr>`).join('')}
    </table>`).join('');

  return head + blocks + `
      <p style="margin-top:22px;color:#9ca3af;font-size:12px;">
        Sent automatically by the Inference Labs Portal.
      </p>
    </div>`;
}

module.exports = { buildDailyReport, formatText, formatHtml, istDateString, istDayRange };
