const router = require('express').Router();
const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const College = require('../models/College');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { buildCandidateSummary, linkSubmissionToCandidate } = require('../services/applicationForms');

// ── File uploads for custom-form 'file' fields ──────────────────────────────
// A 'file' field used to store the FILENAME only — candidates uploaded their
// CV and the file itself was never sent anywhere, so nothing could be opened
// later. Files are now uploaded to Cloudinary before submission and the field
// stores a descriptor the admin UI can stream back.
const uploadToMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB, same cap as intake resumes
});

const EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'
};
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'];

function resolveExt(file) {
  const name = file.originalname || '';
  const dot = name.lastIndexOf('.');
  const fromName = dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
  if (ALLOWED_EXT.includes(fromName)) return fromName;
  return EXT_BY_MIME[file.mimetype] || null;
}

// A stored file value. Kept as an object so the admin can tell a real upload
// from the bare filename strings collected before uploads existed.
const isFileValue = v => v && typeof v === 'object' && !Array.isArray(v) && v.kind === 'file';

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

// ── POST /api/public/forms/:publicSlug/upload ───────────────────────────────
// Uploads one file for a specific 'file' field and returns the descriptor the
// candidate's browser then submits as that field's value. The form must be
// live and the target field must genuinely be a file field, so this cannot be
// used as an open upload endpoint.
router.post('/:publicSlug/upload', uploadToMemory.single('file'), async (req, res) => {
  try {
    const form = await Form.findOne({ publicSlug: req.params.publicSlug, ...PUBLIC_FORM_QUERY })
      .select('fields workspace').lean();
    if (!form) return res.status(404).json({ message: 'This form is not available.' });
    if (!req.file) return res.status(400).json({ message: 'No file received' });

    const field = form.fields.find(f => String(f._id) === String(req.body.fieldId) && f.type === 'file');
    if (!field) return res.status(400).json({ message: 'Unknown upload field' });

    const ext = resolveExt(req.file);
    if (!ext) {
      return res.status(400).json({ message: 'Only PDF, DOC, DOCX or image files are allowed' });
    }

    const dataUri = `data:${req.file.mimetype || 'application/octet-stream'};base64,${req.file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'form-uploads',
      resource_type: 'raw',
      public_id: `upload_${Date.now()}_${Math.round(Math.random() * 1e9)}.${ext}`
    });

    res.status(201).json({
      kind: 'file',
      url: result.secure_url,
      publicId: result.public_id,
      originalName: req.file.originalname || `file.${ext}`,
      size: req.file.size,
      mimeType: req.file.mimetype || ''
    });
  } catch (err) {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'File is too large. Maximum size is 10MB.' });
    }
    console.error('[POST /api/public/forms/:publicSlug/upload]', err);
    res.status(502).json({ message: 'Upload failed. Please try again.' });
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

    // File fields: the value must be a descriptor this server issued from the
    // /upload endpoint above. Only the known keys are kept and the URL must
    // point at our own Cloudinary account, so a crafted submission cannot
    // store an arbitrary link for an admin to click later.
    const ourCloud = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
    for (const field of form.fields.filter(f => f.type === 'file')) {
      const key = String(field._id);
      const value = cleanResponses[key];
      if (value === undefined) continue;

      if (isFileValue(value) && typeof value.url === 'string' && value.url.startsWith(ourCloud)) {
        cleanResponses[key] = {
          kind: 'file',
          url: value.url,
          publicId: String(value.publicId || ''),
          originalName: String(value.originalName || '').slice(0, 200),
          size: Number(value.size) || 0,
          mimeType: String(value.mimeType || '').slice(0, 100)
        };
      } else {
        // Anything else (including the bare filename strings collected before
        // uploads existed) is kept only as text — never as a link.
        cleanResponses[key] = typeof value === 'string' ? value.slice(0, 200) : '';
      }
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
