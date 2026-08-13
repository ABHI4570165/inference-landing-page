const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../config/auth');
const requireWorkspace = require('../middleware/workspace');
const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const Student = require('../models/Student');
const College = require('../models/College');
const { generatePublicToken } = require('../utils/publicToken');

const VALID_STATUS = ['Active', 'Inactive'];

// A form's response count spans both places an application can live: custom
// forms collect FormSubmissions, while the legacy intake forms own Student
// records. One number, whichever kind of form it is.
//
// Counted the same way as the Applications dashboard — one row per APPLICATION.
// A candidate created BY a submission must not be added on top of it, or every
// custom-form response is counted twice (this is what made a form with 46
// responses report 83).
async function responseCountsFor(workspaceId, formIds) {
  const [submissions, students] = await Promise.all([
    FormSubmission.aggregate([
      { $match: { workspace: workspaceId, form: { $in: formIds } } },
      { $group: { _id: '$form', count: { $sum: 1 } } }
    ]),
    Student.aggregate([
      { $match: { workspace: workspaceId, form: { $in: formIds }, hasFormSubmission: { $ne: true } } },
      { $group: { _id: '$form', count: { $sum: 1 } } }
    ])
  ]);

  const counts = new Map();
  [...submissions, ...students].forEach(row => {
    counts.set(String(row._id), (counts.get(String(row._id)) || 0) + row.count);
  });
  return counts;
}

// Field ids MUST survive an edit. Every FormSubmission stores its answers
// keyed by field _id, so letting Mongoose mint fresh subdocument ids on save
// would silently orphan every response the form has already collected —
// historical applications would still exist but render blank. An _id the
// builder sends back is therefore kept, but only when it is genuinely one of
// THIS form's existing field ids and has not already been claimed by an
// earlier field in the same payload; anything else gets a fresh id. That keeps
// history attached without letting a crafted request duplicate ids or graft a
// field id in from another form.
function cleanFields(rawFields, existingIds = new Set()) {
  if (!Array.isArray(rawFields)) return [];
  const claimed = new Set();

  return rawFields
    .map((f, i) => {
      const fieldId = mongoose.isValidObjectId(f._id) ? String(f._id) : null;
      const keepId = !!fieldId && existingIds.has(fieldId) && !claimed.has(fieldId);
      if (keepId) claimed.add(fieldId);

      return {
        ...(keepId ? { _id: new mongoose.Types.ObjectId(fieldId) } : {}),
        type: Form.FIELD_TYPES.includes(f.type) ? f.type : 'text',
        label: String(f.label || '').trim().slice(0, 200),
        placeholder: String(f.placeholder || '').trim().slice(0, 200),
        required: !!f.required,
        options: Array.isArray(f.options) ? f.options.map(o => String(o).trim()).filter(Boolean).slice(0, 50) : [],
        selectedCollegeIds: Array.isArray(f.selectedCollegeIds)
          ? f.selectedCollegeIds.filter(id => mongoose.isValidObjectId(id))
          : [],
        order: Number.isFinite(f.order) ? f.order : i
      };
    })
    .filter(f => f.label);
}

// Server-side trust boundary: a 'college' field's selectedCollegeIds is
// never taken on faith from the client — every id is re-verified to
// actually exist AND belong to this workspace before being saved, so a
// tampered request can never wire a form to another company's colleges.
async function validateCollegeSelections(fields, workspaceId) {
  const allIds = [...new Set(
    fields.filter(f => f.type === 'college').flatMap(f => f.selectedCollegeIds.map(String))
  )];
  if (!allIds.length) return fields;

  const valid = await College.find({ _id: { $in: allIds }, workspace: workspaceId }).select('_id').lean();
  const validSet = new Set(valid.map(c => String(c._id)));

  return fields.map(f => f.type === 'college'
    ? { ...f, selectedCollegeIds: f.selectedCollegeIds.filter(id => validSet.has(String(id))) }
    : f);
}

// ── GET /api/forms — forms in the active workspace ──────────────────────────
router.get('/', auth, requireWorkspace, async (req, res) => {
  try {
    const forms = await Form.find({ workspace: req.workspaceId }).sort({ createdAt: -1 }).lean();
    const countByForm = await responseCountsFor(req.workspaceId, forms.map(f => f._id));
    res.json(forms.map(f => ({ ...f, responseCount: countByForm.get(String(f._id)) || 0 })));
  } catch (err) {
    console.error('[GET /api/forms]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/forms — create a form in the active workspace ────────────────
router.post('/', auth, requireWorkspace, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Form name is required' });

    const fields = await validateCollegeSelections(cleanFields(req.body.fields), req.workspaceId);

    const form = await Form.create({
      workspace: req.workspaceId,
      name,
      description: String(req.body.description || '').trim(),
      status: VALID_STATUS.includes(req.body.status) ? req.body.status : 'Active',
      fields,
      publicSlug: generatePublicToken('frm'),
      createdBy: req.admin.id
    });
    res.status(201).json({ ...form.toObject(), responseCount: 0 });
  } catch (err) {
    console.error('[POST /api/forms]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/forms/:id ────────────────────────────────────────────────────
router.get('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, workspace: req.workspaceId }).lean();
    if (!form) return res.status(404).json({ message: 'Form not found' });
    const counts = await responseCountsFor(req.workspaceId, [form._id]);
    res.json({ ...form, responseCount: counts.get(String(form._id)) || 0 });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/forms/:id ────────────────────────────────────────────────────
// Renaming is always allowed — including for legacy intake forms, since the
// dashboard reads the name live and nothing maps it back to a fixed string.
// `publicSlug` is never in the update object, so editing a form can never
// rotate a link that has already been shared.
router.put('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const existing = await Form.findOne({ _id: req.params.id, workspace: req.workspaceId }).lean();
    if (!existing) return res.status(404).json({ message: 'Form not found' });

    const update = {};
    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.description !== undefined) update.description = String(req.body.description).trim();
    if (VALID_STATUS.includes(req.body.status)) update.status = req.body.status;
    if (req.body.fields !== undefined) {
      // A legacy intake form's field structure is defined by the Student
      // schema and its already-circulated public page — the builder must not
      // be able to rewrite it out from under existing applications.
      if (existing.origin === 'legacy') {
        return res.status(400).json({
          message: 'This is a built-in intake form. Its fields are fixed — you can rename it or change its description.'
        });
      }
      const existingIds = new Set((existing.fields || []).map(f => String(f._id)));
      update.fields = await validateCollegeSelections(cleanFields(req.body.fields, existingIds), req.workspaceId);
    }
    if (update.name === '') return res.status(400).json({ message: 'Form name is required' });

    const form = await Form.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspaceId }, update, { new: true, runValidators: true }
    );
    res.json(form);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── DELETE /api/forms/:id ─────────────────────────────────────────────────
// Blocked once responses exist — set the form Inactive instead so the real
// submission history is never silently orphaned or lost.
router.delete('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, workspace: req.workspaceId });
    if (!form) return res.status(404).json({ message: 'Form not found' });

    if (form.origin === 'legacy') {
      return res.status(400).json({
        message: 'Built-in intake forms cannot be deleted — the applications received through them depend on this record. Set it to Inactive instead.'
      });
    }

    const counts = await responseCountsFor(req.workspaceId, [form._id]);
    const responseCount = counts.get(String(form._id)) || 0;
    if (responseCount > 0) {
      return res.status(400).json({
        message: `This form has ${responseCount} response(s) and can't be deleted. Set it to Inactive instead to stop new submissions.`
      });
    }

    await form.deleteOne();
    res.json({ message: 'Form deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/forms/:id/responses — paginated ────────────────────────────────
router.get('/:id/responses', auth, requireWorkspace, async (req, res) => {
  try {
    const form = await Form.findOne({ _id: req.params.id, workspace: req.workspaceId }).lean();
    if (!form) return res.status(404).json({ message: 'Form not found' });

    // A legacy intake form's applications are Student records with a fixed
    // schema, not free-form responses — they are viewed in the Applications
    // dashboard (filtered to this form), which renders all of their columns.
    if (form.origin === 'legacy') {
      return res.status(400).json({
        message: 'Applications for this built-in form are shown in the Applications dashboard.',
        code: 'USE_APPLICATIONS_DASHBOARD',
        formId: String(form._id)
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));

    const filter = { workspace: req.workspaceId, form: form._id };
    const [total, rows] = await Promise.all([
      FormSubmission.countDocuments(filter),
      FormSubmission.find(filter).sort({ submittedAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);

    res.json({ form, page, limit, total, rows });
  } catch (err) {
    console.error('[GET /api/forms/:id/responses]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
