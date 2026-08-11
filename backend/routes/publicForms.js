const router = require('express').Router();
const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const College = require('../models/College');
const { buildCandidateSummary, linkSubmissionToCandidate } = require('../services/applicationForms');

// Legacy intake forms exist only to categorise pre-Forms applications; they
// have no builder-defined fields and their real public pages are the original
// /apply/... routes. They must never resolve as a custom form page.
const PUBLIC_FORM_QUERY = { status: 'Active', origin: { $ne: 'legacy' } };

// ── GET /api/public/forms/:publicSlug — form schema for the public page ────
// Only ever returns an Active form; never exposes workspace internals. A
// 'college' field's raw selectedCollegeIds are never sent as-is — they're
// resolved to real {_id, name} pairs from the College collection so the
// candidate sees the actual college names, not ids or workspace internals.
router.get('/:publicSlug', async (req, res) => {
  try {
    const form = await Form.findOne({ publicSlug: req.params.publicSlug, ...PUBLIC_FORM_QUERY })
      .select('name description fields workspace')
      .lean();
    if (!form) return res.status(404).json({ message: 'This form is not available.' });

    const collegeIds = [...new Set(
      form.fields.filter(f => f.type === 'college').flatMap(f => (f.selectedCollegeIds || []).map(String))
    )];
    // Scoped to the form's own workspace as well as the selected ids —
    // a college from another company's workspace can never be rendered here
    // even if a stale id somehow survived on the field.
    const colleges = collegeIds.length
      ? await College.find({ _id: { $in: collegeIds }, workspace: form.workspace }).select('name').sort({ name: 1 }).lean()
      : [];
    const collegeById = new Map(colleges.map(c => [String(c._id), c.name]));

    const fields = form.fields.map(({ selectedCollegeIds, ...f }) => (
      f.type === 'college'
        ? { ...f, collegeOptions: (selectedCollegeIds || []).map(id => ({ _id: String(id), name: collegeById.get(String(id)) })).filter(c => c.name) }
        : f
    ));

    const { workspace, ...publicForm } = form;
    res.json({ ...publicForm, fields });
  } catch (err) {
    console.error('[GET /api/public/forms/:publicSlug]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/public/forms/:publicSlug/submit ───────────────────────────────
// workspace + form are always resolved server-side from the slug — the
// candidate's request body can never inject a workspaceId/formId.
router.post('/:publicSlug/submit', async (req, res) => {
  try {
    const form = await Form.findOne({ publicSlug: req.params.publicSlug, ...PUBLIC_FORM_QUERY }).lean();
    if (!form) return res.status(404).json({ message: 'This form is not available.' });

    const responses = (req.body && typeof req.body.responses === 'object' && req.body.responses) || {};
    const missing = form.fields
      .filter(f => f.required)
      .filter(f => {
        const v = responses[String(f._id)];
        return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
      });
    if (missing.length) {
      return res.status(400).json({ message: `Please fill in all required fields (${missing.length} remaining)` });
    }

    // Keep only responses for fields that actually exist on this form
    const validIds = new Set(form.fields.map(f => String(f._id)));
    const cleanResponses = {};
    for (const [key, value] of Object.entries(responses)) {
      if (validIds.has(key)) cleanResponses[key] = value;
    }

    // College fields: the submitted value must be the _id of a college that
    // (a) exists, (b) belongs to this form's workspace, and (c) was actually
    // selected as an available option on this specific field — never trust
    // an id the candidate's browser sent. Once verified, the raw id is
    // replaced with the real college name so responses display and export
    // like every other field, with no separate lookup needed later.
    const collegeFields = form.fields.filter(f => f.type === 'college');
    if (collegeFields.length) {
      const allSelectedIds = [...new Set(collegeFields.flatMap(f => (f.selectedCollegeIds || []).map(String)))];
      const validColleges = allSelectedIds.length
        ? await College.find({ _id: { $in: allSelectedIds }, workspace: form.workspace }).select('name').lean()
        : [];
      const collegeById = new Map(validColleges.map(c => [String(c._id), c.name]));

      for (const field of collegeFields) {
        const key = String(field._id);
        const submitted = cleanResponses[key];
        if (submitted === undefined) continue;

        const allowedIds = new Set((field.selectedCollegeIds || []).map(String));
        const name = allowedIds.has(String(submitted)) ? collegeById.get(String(submitted)) : null;
        if (!name) {
          return res.status(400).json({ message: `Invalid selection for "${field.label}"` });
        }
        cleanResponses[key] = name;
      }
    }

    // workspace + form come from the slug lookup, never from the request —
    // this is what guarantees a submission lands in the right workspace and
    // is attributed to the right category on the Applications dashboard.
    const candidate = buildCandidateSummary(form.fields, cleanResponses);

    // Turn the submission into a real candidate so the person can continue
    // through Attendance → Reception → Counselling → AI Report. Matches an
    // existing candidate when one already exists in this workspace, so
    // filling in a second form never creates a duplicate person. A failure
    // here must never cost the candidate their response, so it is logged and
    // the submission is still saved.
    let student = null;
    try {
      student = await linkSubmissionToCandidate({
        workspaceId: form.workspace, formId: form._id, candidate
      });
    } catch (err) {
      console.error('[POST /api/public/forms/:publicSlug/submit] candidate linking failed', err);
    }

    await FormSubmission.create({
      workspace: form.workspace,
      form: form._id,
      responses: cleanResponses,
      candidate,
      student: student?._id || null,
      submittedAt: new Date()
    });

    res.status(201).json({ message: 'Submitted successfully' });
  } catch (err) {
    console.error('[POST /api/public/forms/:publicSlug/submit]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
