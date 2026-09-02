const router = require('express').Router();
const mongoose = require('mongoose');
const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const College = require('../models/College');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { buildCandidateSummary, linkSubmissionToCandidate } = require('../services/applicationForms');
const { resolveCategory } = require('../utils/collegeFolders');

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

    const collegeFields = form.fields.filter(f => f.type === 'college');

    // A College field draws from a FOLDER ("MBA Colleges"), optionally narrowed
    // to a hand-picked subset. Fields built before folders existed have no
    // category and keep behaving exactly as they did — their explicit id list
    // is the whole option set.
    const selectedIds = [...new Set(collegeFields.flatMap(f => (f.selectedCollegeIds || []).map(String)))];
    const categoryIds = [...new Set(collegeFields.map(f => f.collegeCategory).filter(Boolean).map(String))];

    // Scoped to the form's own workspace as well — a college from another
    // company's workspace can never be rendered here even if a stale id
    // somehow survived on the field.
    // A College field that offers nothing is a dead end no admin ever intends —
    // it is what makes a newly added college look like it "isn't showing". Two
    // real configurations produce it: a field with no folder and nothing ticked,
    // and a field whose ticked ids have since been deleted (leaving them all
    // dangling). Both fall back below, so a field without a folder needs the
    // whole workspace available to fall back to.
    const anyFieldWithoutFolder = collegeFields.some(f => !f.collegeCategory);

    const or = [];
    if (selectedIds.length) or.push({ _id: { $in: selectedIds } });
    if (categoryIds.length) or.push({ category: { $in: categoryIds } });
    const colleges = (anyFieldWithoutFolder || or.length)
      ? await College.find(
          anyFieldWithoutFolder ? { workspace: form.workspace } : { workspace: form.workspace, $or: or }
        ).select('name code location address category').lean()
      : [];
    const collegeById = new Map(colleges.map(c => [String(c._id), c]));

    // Location and address travel with the name so the candidate can tell two
    // similarly-named institutions apart. Sorted alphabetically, case-insensitively.
    const shape = c => ({
      _id: String(c._id), name: c.name, code: c.code || '',
      location: c.location || '', address: c.address || ''
    });
    const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

    const fields = form.fields.map(({ selectedCollegeIds, collegeCategory, ...f }) => {
      if (f.type !== 'college') return f;

      const picked = (selectedCollegeIds || []).map(String);
      let options;
      if (collegeCategory) {
        const inCategory = colleges.filter(c => String(c.category) === String(collegeCategory));
        // An explicit subset narrows the folder; no subset means the whole
        // folder. If the subset resolves to nothing (every ticked college was
        // deleted) fall back to the folder — but never outside it, or an MBA
        // form would start listing engineering colleges.
        const subset = picked.length ? inCategory.filter(c => picked.includes(String(c._id))) : [];
        options = subset.length ? subset : inCategory;
      } else {
        // Pre-folder field: its explicit list is the option set, falling back
        // to the workspace when it is empty or entirely dangling.
        const subset = picked.map(id => collegeById.get(id)).filter(Boolean);
        options = subset.length ? subset : colleges;
      }

      return {
        ...f,
        collegeOptions: options.map(shape).sort(byName),
        // Drives the "my college isn't listed" affordance on the public page.
        // Not gated on a folder — see the note in routes/forms.js.
        allowCustomCollege: !!f.allowCustomCollege
      };
    });

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

// ── POST /api/public/forms/:publicSlug/colleges ─────────────────────────────
// A candidate whose college genuinely is not on the list adds it themselves,
// rather than abandoning the form or picking a wrong-but-close entry (which is
// what silently corrupts the attendance roster later).
//
// Deliberately narrow: it only ever writes into the folder that THIS field
// already points at, only when the admin ticked "allow candidates to add", and
// only a name/location — never a code, never another workspace, never a
// different folder. The row is flagged source:'candidate', reviewed:false so
// the admin can vet, correct or delete it from the Colleges page.
router.post('/:publicSlug/colleges', async (req, res) => {
  try {
    const form = await Form.findOne({ publicSlug: req.params.publicSlug, ...PUBLIC_FORM_QUERY })
      .select('fields workspace').lean();
    if (!form) return res.status(404).json({ message: 'This form is not available.' });

    const field = form.fields.find(f => String(f._id) === String(req.body?.fieldId) && f.type === 'college');
    if (!field) return res.status(400).json({ message: 'Unknown college field' });
    if (!field.allowCustomCollege) {
      return res.status(403).json({ message: 'This form does not accept new colleges. Please contact your placement officer.' });
    }

    // The field's own folder when it has one, otherwise the workspace's default
    // folder — so a College field that was never pointed at a folder can still
    // accept an addition instead of dead-ending the candidate.
    const resolved = await resolveCategory(form.workspace, field.collegeCategory);
    if (resolved.error) return res.status(400).json({ message: resolved.error });
    const categoryId = resolved.category._id;

    const rawName = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
    if (rawName.length < 4) {
      return res.status(400).json({ message: 'Please type your full college name' });
    }
    if (rawName.length > 200) {
      return res.status(400).json({ message: 'College name is too long' });
    }
    // Must read like an institution name, not a stray phrase or a pasted URL.
    if (!/[A-Za-z]{3}/.test(rawName) || /https?:\/\//i.test(rawName)) {
      return res.status(400).json({ message: 'Please enter a valid college name' });
    }

    const name = College.normaliseName(rawName);

    // Already in this folder (in any casing)? Refuse the add and point at the
    // existing entry — the candidate simply did not spot it in the list, and a
    // second copy of one institution is exactly what fragments the college list
    // and the attendance roster later. The row is returned so the page can
    // select it for them rather than leaving them stuck.
    const inFolder = await College.find({ workspace: form.workspace, category: categoryId })
      .select('name code location address').lean();
    const existing = inFolder.find(c => College.normaliseName(c.name) === name);
    if (existing) {
      return res.status(409).json({
        message: `${existing.name} is already in the list. Please select it from the list.`,
        code: 'ALREADY_LISTED',
        existed: true,
        college: {
          _id: String(existing._id), name: existing.name, code: existing.code || '',
          location: existing.location || '', address: existing.address || ''
        }
      });
    }

    const college = await College.create({
      workspace: form.workspace,
      category: categoryId,
      name,
      location: String(req.body?.location || '').trim().slice(0, 200),
      source: 'candidate',
      addedByName: String(req.body?.addedByName || '').trim().slice(0, 200),
      reviewed: false
    });

    // Make it a permanent option on this field, so the next candidate from the
    // same college picks it from the list instead of typing it again. Only
    // needed when the admin narrowed the field to a subset — an un-narrowed
    // field already offers its whole folder.
    if ((field.selectedCollegeIds || []).length) {
      await Form.updateOne(
        { _id: form._id, 'fields._id': field._id },
        { $addToSet: { 'fields.$.selectedCollegeIds': college._id } }
      );
    }

    console.info(`[public-forms] candidate added college ${JSON.stringify(college.name)} to folder ${categoryId}`);

    res.status(201).json({
      _id: String(college._id), name: college.name, code: '',
      location: college.location || '', address: '', existed: false
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'This college is already listed' });
    console.error('[POST /api/public/forms/:publicSlug/colleges]', err);
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
      const submittedIds = collegeFields
        .map(f => cleanResponses[String(f._id)])
        .filter(v => typeof v === 'string' && mongoose.isValidObjectId(v));

      // Look the submitted ids up within this workspace only, then check each
      // one against what its own field actually offers.
      const validColleges = submittedIds.length
        ? await College.find({ _id: { $in: submittedIds }, workspace: form.workspace })
            .select('name category').lean()
        : [];
      const collegeById = new Map(validColleges.map(c => [String(c._id), c]));

      // Which ticked ids still exist decides whether a field is running on its
      // explicit list or on the fallback — this MUST match the GET above, or a
      // candidate is shown options the submit endpoint then rejects.
      const liveTicked = new Set(
        (await College.find({
          _id: { $in: [...new Set(collegeFields.flatMap(f => (f.selectedCollegeIds || []).map(String)))] },
          workspace: form.workspace
        }).select('_id').lean()).map(c => String(c._id))
      );

      for (const field of collegeFields) {
        const key = String(field._id);
        const submitted = cleanResponses[key];
        if (submitted === undefined) continue;

        const college = collegeById.get(String(submitted));
        // Accept the id when it is either explicitly offered on this field, or
        // — for a folder-backed field — simply belongs to that folder. The
        // second case is what lets a college the candidate just added (or one
        // another candidate added seconds earlier, after this page loaded) be
        // submitted without the browser needing a refreshed option list.
        const ticked = (field.selectedCollegeIds || []).map(String);
        // A tick list only constrains the field while at least one of its
        // colleges still exists; once they are all gone the field has fallen
        // back (see the GET above) and is no longer narrowed by it.
        const narrowed = ticked.some(id => liveTicked.has(id));

        const explicitlyOffered = ticked.includes(String(submitted));
        const inFolder = !!field.collegeCategory && !!college &&
                         String(college.category) === String(field.collegeCategory);
        // Mirrors the GET fallback: a field with no folder that is not narrowed
        // offers the whole workspace, so any college in it is a legitimate
        // answer. The lookup is already scoped to this form's workspace, so
        // this still cannot accept another company's college.
        const workspaceWide = !field.collegeCategory && !narrowed && !!college;

        if (!college || !(inFolder || (explicitlyOffered && narrowed) || workspaceWide)) {
          return res.status(400).json({ message: `Invalid selection for "${field.label}"` });
        }
        // Store the NAME so responses display and export like every other
        // field, with no lookup needed later.
        cleanResponses[key] = college.name;
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
