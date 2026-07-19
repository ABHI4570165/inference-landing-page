const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const upload   = require('../middleware/upload');
const auth     = require('../config/auth');
const Student  = require('../models/Student');
const cloudinary = require('../config/cloudinary');

const ALLOWED_ROLES = [
  'Junior Data Engineer',
  'Junior Data Scientist – Generative AI',
  'Sales Executive (Inside Sales / Junior Sales Track)'
];

const ALLOWED_SOURCES = ['official_college', 'instagram', 'missed_test'];

// Cloudinary raw files often come back as octet-stream; map by extension
const MIME_BY_EXT = {
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp'
};

// Resume file URLs and Cloudinary IDs never leave the server —
// resumes are served only through the authenticated /:id/resume proxy
const PUBLIC_FIELDS = '-resumeUrl -cloudinary_public_id';

// Escape user input before embedding it in a $regex
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Collapse internal whitespace and trim — keeps free-text college names
// (Instagram form) consistent for the admin college filter
const normalizeText = s => s.trim().replace(/\s+/g, ' ');

// ── Resume upload wrapper ──────────────────────────────────────────────────────
// Runs multer manually so upload errors (file filter, size limit, Cloudinary)
// return meaningful 4xx responses and show up in Render logs with context,
// instead of falling through to the global 500 handler.
function handleResumeUpload(req, res, next) {
  upload.single('resume')(req, res, err => {
    if (!err) return next();

    const ua = req.headers['user-agent'] || 'unknown';
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      console.warn(`[SUBMIT REJECTED] file too large | ua="${ua}"`);
      return res.status(413).json({ message: 'Resume file is too large. Maximum size is 10MB.' });
    }
    if (err.message === 'Only PDF, DOC, DOCX files are allowed') {
      // Already logged with file details by the upload middleware
      return res.status(400).json({ message: err.message });
    }
    // Anything else here is a storage/Cloudinary failure
    console.error(`[SUBMIT ERROR] resume upload failed | ua="${ua}"`, err.stack || err);
    return res.status(502).json({ message: 'Resume upload failed. Please try again in a moment.' });
  });
}

// ── Shared submission handler ──────────────────────────────────────────────────
// Both the Official College form and the Instagram form go through the same
// validation and persistence logic; only `source` differs.
function submitApplication(source) {
  return async (req, res) => {
    const startedAt = Date.now();
    const ua = req.headers['user-agent'] || 'unknown';
    // Render-visible diagnostics. Deliberately excludes personal data
    // (name, email, phone, Aadhar are never logged).
    console.log(
      `[SUBMIT RECEIVED] source=${source} role="${req.body?.selectedRole || ''}" ` +
      `file="${req.file?.originalname || 'NONE'}" size=${req.file?.size ?? 0} ` +
      `mime="${req.file?.mimetype || ''}" ua="${ua}"`
    );

    const rejected = (status, logReason, message) => {
      console.warn(`[SUBMIT REJECTED] source=${source} reason="${logReason}" ua="${ua}"`);
      return res.status(status).json({ message });
    };

    try {
      if (!req.file) return rejected(400, 'no resume file in request', 'Resume is required');
      if (req.file.size === 0) return rejected(400, 'empty resume file', 'The uploaded resume file is empty. Please try uploading it again.');

      const {
        name, gender, email, phone, aadhar,
        country, state, city, address,
        college,
        course, customCourse,
        branch, customBranch,
        experience, selectedRole
      } = req.body;

      // ── Basic presence checks ──
      const missing = [];
      if (!name)         missing.push('name');
      if (!gender)       missing.push('gender');
      if (!email)        missing.push('email');
      if (!phone)        missing.push('phone');
      if (!aadhar)       missing.push('aadhar');
      if (!country)      missing.push('country');
      if (!state)        missing.push('state');
      if (!city)         missing.push('city');
      if (!college)      missing.push('college');
      if (!course)       missing.push('course');
      if (!branch)       missing.push('branch');
      if (!experience)   missing.push('experience');
      if (!selectedRole) missing.push('selectedRole');
      if (missing.length) {
        return rejected(400, `missing fields: ${missing.join(',')}`, `Missing required fields: ${missing.join(', ')}`);
      }

      // ── Phone validation: exactly 10 digits ──
      if (!/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
        return rejected(400, 'invalid phone format', 'Phone number must be exactly 10 digits');
      }

      // ── Aadhar validation: exactly 12 digits ──
      const cleanAadhar = aadhar.replace(/\s/g, '');
      if (!/^\d{12}$/.test(cleanAadhar)) {
        return rejected(400, 'invalid aadhar format', 'Aadhar number must be exactly 12 digits');
      }

      // ── Role validation ──
      if (!ALLOWED_ROLES.includes(selectedRole)) {
        return rejected(400, 'invalid role', 'Invalid role selected');
      }

      // ── Duplicate checks ──
      const dupAadhar = await Student.findOne({ aadhar: cleanAadhar });
      if (dupAadhar) {
        return rejected(409, 'duplicate aadhar',
          'An application with this Aadhar number already exists. Duplicate applications are not allowed.');
      }

      const dupEmail = await Student.findOne({ email: email.toLowerCase().trim() });
      if (dupEmail) {
        return rejected(409, 'duplicate email',
          'An application with this email address already exists. If you just submitted, your application was received — please do not submit again.');
      }

      // ── Build and save student ──
      const student = new Student({
        name:    normalizeText(name),
        gender,
        email:   email.toLowerCase().trim(),
        phone:   phone.replace(/\s/g, ''),
        aadhar:  cleanAadhar,
        country, state, city,
        address: address || '',
        college: normalizeText(college),
        course:  normalizeText(course),
        customCourse:  customCourse  || '',
        branch,
        customBranch:  customBranch  || '',
        experience,
        selected_role: selectedRole,
        source,

        // Cloudinary
        resumeUrl:            req.file.path,
        cloudinary_public_id: req.file.filename,
        resume_original_name: req.file.originalname,
        resume_file_size:     req.file.size,
        resume_mime_type:     req.file.mimetype,
        uploaded_at:          new Date()
      });

      await student.save();
      console.log(`[SUBMIT OK] source=${source} id=${student._id} ms=${Date.now() - startedAt}`);
      res.status(201).json({ message: 'Application submitted successfully', id: student._id });

    } catch (err) {
      // MongoDB duplicate key error (aadhar unique index)
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern || {})[0] || 'field';
        const msg   = field === 'aadhar'
          ? 'An application with this Aadhar number already exists.'
          : `A duplicate ${field} was detected.`;
        return rejected(409, `duplicate key: ${field}`, msg);
      }
      // Mongoose validation failure → 400 with the specific reason
      if (err.name === 'ValidationError') {
        const detail = Object.values(err.errors || {}).map(e => e.message).join('; ');
        return rejected(400, `schema validation: ${detail}`, detail || 'Invalid application data');
      }
      console.error(
        `[SUBMIT ERROR] source=${source} ms=${Date.now() - startedAt} ua="${ua}"`,
        err.stack || err
      );
      res.status(500).json({ message: 'Something went wrong while saving your application. Please try again.' });
    }
  };
}

// ── POST /api/students — Official College form submission ──────────────────────
router.post('/', handleResumeUpload, submitApplication('official_college'));

// ── POST /api/students/instagram — Instagram form submission ───────────────────
router.post('/instagram', handleResumeUpload, submitApplication('instagram'));

// ── POST /api/students/missed-test — Missed Test form submission ───────────────
// For students who could not visit/attend the test.
router.post('/missed-test', handleResumeUpload, submitApplication('missed_test'));

// ── GET /api/students/colleges — unique college list for filter (admin only) ───
// Includes free-text colleges entered through the Instagram form.
// NOTE: must be declared before GET /:id
router.get('/colleges', auth, async (req, res) => {
  try {
    const colleges = await Student.distinct('college');
    res.json(
      colleges
        .filter(c => typeof c === 'string' && c.trim())
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    );
  } catch (err) {
    console.error('[GET /api/students/colleges]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/students/stats — dashboard statistics (admin only) ────────────────
// NOTE: must be declared before GET /:id
router.get('/stats', auth, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [total, instagram, missedTest, today, topColleges, topInstagramColleges] = await Promise.all([
      Student.countDocuments({}),
      Student.countDocuments({ source: 'instagram' }),
      Student.countDocuments({ source: 'missed_test' }),
      Student.countDocuments({ createdAt: { $gte: startOfToday } }),
      Student.aggregate([
        { $group: { _id: '$college', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $project: { _id: 0, college: '$_id', count: 1 } }
      ]),
      Student.aggregate([
        { $match: { source: 'instagram' } },
        { $group: { _id: '$college', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $project: { _id: 0, college: '$_id', count: 1 } }
      ])
    ]);

    // Legacy documents without `source` count as official_college
    res.json({
      total,
      officialCollege: total - instagram - missedTest,
      instagram,
      missedTest,
      today,
      topColleges,
      topInstagramColleges
    });
  } catch (err) {
    console.error('[GET /api/students/stats]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/students — list with filters (admin only) ─────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    // Cap is high (not 100) so the admin Excel export can pull every record in
    // one request; normal table pagination still defaults to 15 per page.
    const limit  = Math.min(10000, parseInt(req.query.limit) || 15);
    const search   = req.query.search?.trim()   || '';
    const role     = req.query.role?.trim()     || '';
    const source   = req.query.source?.trim()   || '';
    const college  = req.query.college?.trim()  || '';
    const dateFrom = req.query.dateFrom?.trim() || '';
    const dateTo   = req.query.dateTo?.trim()   || '';

    const conditions = [];

    if (search) {
      const rx = escapeRegex(search);
      conditions.push({
        $or: [
          { name:    { $regex: rx, $options: 'i' } },
          { email:   { $regex: rx, $options: 'i' } },
          { phone:   { $regex: rx, $options: 'i' } },
          { college: { $regex: rx, $options: 'i' } },
          { aadhar:  { $regex: rx, $options: 'i' } }
        ]
      });
    }

    if (role && ALLOWED_ROLES.includes(role)) {
      conditions.push({ selected_role: role });
    }

    if (ALLOWED_SOURCES.includes(source)) {
      // Legacy documents have no `source` field — treat them as official_college
      conditions.push(
        source === 'official_college'
          ? { source: { $nin: ['instagram', 'missed_test'] } }
          : { source }
      );
    }

    // College dropdown sends an exact value from GET /colleges
    if (college) {
      conditions.push({ college });
    }

    if (dateFrom || dateTo) {
      const range = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from)) { from.setHours(0, 0, 0, 0); range.$gte = from; }
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to)) { to.setHours(23, 59, 59, 999); range.$lte = to; }
      }
      if (Object.keys(range).length) conditions.push({ createdAt: range });
    }

    const filter = conditions.length ? { $and: conditions } : {};

    const [students, total] = await Promise.all([
      Student.find(filter)
        .select(PUBLIC_FIELDS)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter)
    ]);

    res.json({ students, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[GET /api/students]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/students/:id/resume — secure resume proxy (admin only) ────────────
// The Cloudinary URL never reaches the client; the file streams through the
// API behind JWT auth. ?download=1 forces an attachment download.
router.get('/:id/resume', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).lean();
    if (!student || !student.resumeUrl) {
      return res.status(404).json({ message: 'Resume not found' });
    }

    const upstream = await fetch(student.resumeUrl);
    if (!upstream.ok) {
      console.error(`[GET /api/students/:id/resume] upstream ${upstream.status} for ${student._id}`);
      return res.status(502).json({ message: 'Unable to retrieve resume file' });
    }

    const originalName = student.resume_original_name || 'resume.pdf';
    const ext  = originalName.split('.').pop().toLowerCase();
    let   mime = student.resume_mime_type;
    if (!mime || mime === 'application/octet-stream') {
      mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    }

    const safeName    = originalName.replace(/[^\w.\- ]/g, '_');
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, no-store');

    // Resumes are capped at 10 MB by the upload middleware — buffering is fine
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('[GET /api/students/:id/resume]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/students/:id ─────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select(PUBLIC_FIELDS).lean();
    if (!student) return res.status(404).json({ message: 'Not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/students/:id ─────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const allowed = [
      'name', 'gender', 'email', 'phone', 'aadhar',
      'country', 'state', 'city', 'address',
      'college', 'course', 'customCourse', 'branch', 'customBranch',
      'experience', 'selected_role'
    ];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] });

    const student = await Student.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .select(PUBLIC_FIELDS)
      .lean();
    if (!student) return res.status(404).json({ message: 'Not found' });
    res.json(student);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Duplicate Aadhar number.' });
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── DELETE /api/students/:id ──────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Not found' });

    // Delete resume from Cloudinary
    if (student.cloudinary_public_id) {
      await cloudinary.uploader.destroy(student.cloudinary_public_id, { resource_type: 'raw' }).catch(() => {});
    }

    await student.deleteOne();
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('[DELETE /api/students]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
