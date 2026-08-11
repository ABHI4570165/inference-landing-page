const Form = require('../models/Form');
const Workspace = require('../models/Workspace');
const { generatePublicToken } = require('../utils/publicToken');

// ── Legacy intake channels ────────────────────────────────────────────────
// The portal shipped three hard-coded application sources before the Forms
// module existed. Rather than keep those labels hard-coded in the dashboard,
// each one is materialised ONCE per workspace as a real Form document; from
// then on the dashboard reads the name off that document like any other form,
// and the admin can rename it. These strings are therefore seed data for a
// one-time insert — not a runtime mapping. Nothing looks a name up here after
// the record exists; lookups go by (workspace, legacySource).
const LEGACY_FORM_SEED = {
  official_college: {
    name: 'Official College',
    description: 'Applications received through the official college application link.'
  },
  instagram: {
    name: 'Instagram',
    description: 'Applications received through the Instagram campaign link.'
  },
  missed_test: {
    name: 'Missed Test',
    description: 'Applications from candidates who could not attend the scheduled test.'
  }
};

const LEGACY_SOURCES = Object.keys(LEGACY_FORM_SEED);

// Returns the Form document representing `source` inside `workspaceId`,
// creating it on first use. Idempotent and safe to call on every submission:
// a duplicate-key race just re-reads the winner.
async function ensureLegacyForm(workspaceId, source) {
  const seed = LEGACY_FORM_SEED[source];
  if (!seed) return null;

  const existing = await Form.findOne({ workspace: workspaceId, legacySource: source });
  if (existing) return existing;

  const workspace = await Workspace.findById(workspaceId).select('createdBy').lean();
  if (!workspace) return null;

  try {
    return await Form.create({
      workspace: workspaceId,
      name: seed.name,
      description: seed.description,
      status: 'Active',
      origin: 'legacy',
      legacySource: source,
      publicSlug: generatePublicToken('frm'),
      fields: [],
      createdBy: workspace.createdBy
    });
  } catch (err) {
    if (err.code === 11000) {
      return Form.findOne({ workspace: workspaceId, legacySource: source });
    }
    throw err;
  }
}

// ── Candidate summary for a custom-form submission ────────────────────────
// Derived from field TYPES, never from field labels, so a form whose fields
// are called anything at all still produces usable Candidate/Email/Phone/
// College columns in the unified Applications table.
function buildCandidateSummary(fields, responses) {
  const summary = { name: '', email: '', phone: '', college: '' };
  const readable = v => Array.isArray(v) ? v.filter(Boolean).join(', ') : (v == null ? '' : String(v));

  const firstOfType = types => {
    const field = (fields || []).find(f => types.includes(f.type) && readable(responses[String(f._id)]).trim());
    return field ? readable(responses[String(field._id)]).trim() : '';
  };

  summary.email   = firstOfType(['email']);
  summary.phone   = firstOfType(['phone']);
  summary.college = firstOfType(['college']);

  // A phone number is frequently collected through a plain 'number' or 'text'
  // field ("Contact Number", "Mobile", whatever the admin called it) rather
  // than the dedicated 'phone' type. Without a phone the candidate cannot be
  // found at the reception desk, so fall back to recognising the VALUE rather
  // than the label: a lone 10-digit number, optionally with a country code.
  // Matching on shape keeps this dynamic — no field name is hard-coded.
  if (!summary.phone) {
    for (const field of fields || []) {
      if (['email', 'college', 'date'].includes(field.type)) continue;
      const raw = readable(responses[String(field._id)]).trim();
      if (!raw) continue;
      const digits = raw.replace(/\D/g, '');
      const isPhoneShaped = /^\+?[\d\s-]{10,15}$/.test(raw) &&
        (digits.length === 10 || (digits.length >= 11 && digits.length <= 13));
      if (isPhoneShaped) { summary.phone = digits.slice(-10); break; }
    }
  }

  // Same idea for email: an address typed into a plain text field still
  // identifies the candidate on the counselling screen.
  if (!summary.email) {
    for (const field of fields || []) {
      const raw = readable(responses[String(field._id)]).trim();
      if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) { summary.email = raw.toLowerCase(); break; }
    }
  }

  // Name: the first plain text field that isn't already used as another
  // column, falling back to the first non-empty answer of any kind so a row
  // is never completely anonymous in the table.
  const usedIds = new Set(
    (fields || [])
      .filter(f => ['email', 'phone', 'college'].includes(f.type))
      .map(f => String(f._id))
  );
  const nameField = (fields || []).find(
    f => f.type === 'text' && !usedIds.has(String(f._id)) && readable(responses[String(f._id)]).trim()
  );
  summary.name = nameField
    ? readable(responses[String(nameField._id)]).trim()
    : firstOfType(['text', 'textarea', 'dropdown', 'radio']);

  // Keep the denormalised copy small — it is a table cell, not storage.
  for (const key of Object.keys(summary)) summary[key] = summary[key].slice(0, 200);
  return summary;
}

// ── Custom form submission → candidate ──────────────────────────────────────
// Attendance, Reception, Counselling and the AI report all key on a Student
// document. Without this step a candidate who registers through a Custom Form
// only ever produces a FormSubmission and dead-ends: they can never be marked
// present, checked in, counselled or reported on.
//
// So a submission that carries enough identity becomes a real candidate. It is
// deliberately a MATCH-OR-CREATE, never a blind insert: if someone with the
// same phone (last 10 digits) or email already exists in this workspace, the
// submission attaches to that existing candidate. One person stays one
// candidate no matter how many forms they fill in.
const Student = require('../models/Student');

const last10 = v => String(v || '').replace(/\D/g, '').slice(-10);

async function findExistingCandidate(workspaceId, { email, phone }) {
  const digits = last10(phone);
  if (digits.length === 10) {
    // Stored numbers vary in formatting (+91, spaces), so compare the last 10
    // digits rather than the raw string.
    const byPhone = await Student.find({ workspace: workspaceId, phone: { $regex: digits + '\\s*$' } });
    const match = byPhone.find(s => last10(s.phone) === digits);
    if (match) return match;
  }
  if (email) {
    const byEmail = await Student.findOne({ workspace: workspaceId, email: String(email).trim().toLowerCase() });
    if (byEmail) return byEmail;
  }
  return null;
}

// Returns the Student this submission belongs to, or null when the form did
// not collect enough to identify a person (e.g. a feedback form with no name).
// Never throws into the submission path — a linking failure must not lose the
// candidate's response.
async function linkSubmissionToCandidate({ workspaceId, formId, candidate }) {
  const name = (candidate?.name || '').trim();
  const email = (candidate?.email || '').trim().toLowerCase();
  const phone = (candidate?.phone || '').trim();
  const college = (candidate?.college || '').trim();

  // Needs a name plus at least one way to be found again at the reception desk
  // (phone) or the counselling screen (email).
  if (!name || (!email && last10(phone).length !== 10)) return null;

  const existing = await findExistingCandidate(workspaceId, { email, phone });
  if (existing) {
    // Fill only genuinely missing details — never overwrite what the candidate
    // already supplied through the full intake application.
    const patch = {};
    if (!existing.college && college) patch.college = college;
    if (!existing.email && email) patch.email = email;
    if (!existing.phone && phone) patch.phone = phone;
    if (Object.keys(patch).length) await Student.updateOne({ _id: existing._id }, { $set: patch });
    return existing;
  }

  return Student.create({
    workspace: workspaceId,
    form: formId,
    name,
    email: email || undefined,
    phone: phone || undefined,
    college: college || undefined,
    source: 'official_college'   // legacy channel discriminator; unused for display
  });
}

module.exports = {
  ensureLegacyForm,
  buildCandidateSummary,
  linkSubmissionToCandidate,
  findExistingCandidate,
  LEGACY_SOURCES,
  LEGACY_FORM_SEED
};
