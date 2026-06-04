const express  = require('express');
const router   = express.Router();
const upload   = require('../middleware/upload');
const auth     = require('../middleware/auth');
const Student  = require('../models/Student');
const cloudinary = require('../config/cloudinary');

const ALLOWED_ROLES = [
  'Junior Data Engineer',
  'Junior Data Scientist – Generative AI',
  'Sales Executive (Inside Sales / Junior Sales Track)'
];

// ── POST /api/students — submit application ────────────────────────────────────
router.post('/', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Resume is required' });

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
      return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
    }

    // ── Phone validation: exactly 10 digits ──
    if (!/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
    }

    // ── Aadhar validation: exactly 12 digits ──
    const cleanAadhar = aadhar.replace(/\s/g, '');
    if (!/^\d{12}$/.test(cleanAadhar)) {
      return res.status(400).json({ message: 'Aadhar number must be exactly 12 digits' });
    }

    // ── Role validation ──
    if (!ALLOWED_ROLES.includes(selectedRole)) {
      return res.status(400).json({ message: 'Invalid role selected' });
    }

    // ── Duplicate checks ──
    const dupAadhar = await Student.findOne({ aadhar: cleanAadhar });
    if (dupAadhar) {
      return res.status(409).json({
        message: 'An application with this Aadhar number already exists. Duplicate applications are not allowed.'
      });
    }

    const dupEmail = await Student.findOne({ email: email.toLowerCase().trim() });
    if (dupEmail) {
      return res.status(409).json({
        message: 'An application with this email address already exists.'
      });
    }

    // ── Build and save student ──
    const student = new Student({
      name:    name.trim(),
      gender,
      email:   email.toLowerCase().trim(),
      phone:   phone.replace(/\s/g, ''),
      aadhar:  cleanAadhar,
      country, state, city,
      address: address || '',
      college,
      course,
      customCourse:  customCourse  || '',
      branch,
      customBranch:  customBranch  || '',
      experience,
      selected_role: selectedRole,

      // Cloudinary
      resumeUrl:            req.file.path,
      cloudinary_public_id: req.file.filename,
      resume_original_name: req.file.originalname,
      resume_file_size:     req.file.size,
      resume_mime_type:     req.file.mimetype,
      uploaded_at:          new Date()
    });

    await student.save();
    res.status(201).json({ message: 'Application submitted successfully', id: student._id });

  } catch (err) {
    // MongoDB duplicate key error (aadhar unique index)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || 'field';
      const msg   = field === 'aadhar'
        ? 'An application with this Aadhar number already exists.'
        : `A duplicate ${field} was detected.`;
      return res.status(409).json({ message: msg });
    }
    console.error('[POST /api/students]', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── GET /api/students — list (admin only) ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 15);
    const search = req.query.search?.trim() || '';
    const role   = req.query.role?.trim()   || '';

    const filter = {};
    if (search) {
      filter.$or = [
        { name:    { $regex: search, $options: 'i' } },
        { email:   { $regex: search, $options: 'i' } },
        { phone:   { $regex: search, $options: 'i' } },
        { college: { $regex: search, $options: 'i' } },
        { aadhar:  { $regex: search, $options: 'i' } }
      ];
    }
    if (role && ALLOWED_ROLES.includes(role)) {
      filter.selected_role = role;
    }

    const [students, total] = await Promise.all([
      Student.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Student.countDocuments(filter)
    ]);

    res.json({ students, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[GET /api/students]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/students/:id ─────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).lean();
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

    const student = await Student.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).lean();
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