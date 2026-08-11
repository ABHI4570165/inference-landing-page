const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../config/auth');
const requireWorkspace = require('../middleware/workspace');
const Student = require('../models/Student');
const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const College = require('../models/College');
const { startOfTodayIST } = require('../utils/dates');
const { buildWorkflowMap, currentStage } = require('../services/candidateWorkflow');
const { buildCandidateSummary } = require('../services/applicationForms');

// ── Unified Applications API ──────────────────────────────────────────────
// An "application" in this system is one of two physical records:
//
//   • a Student   — the resume-bearing intake application
//   • a FormSubmission — a response to a custom form built in the Form Builder
//
// Both carry `workspace` + `form`, so the dashboard treats them uniformly:
// every category, count, label and filter is derived from the Form documents
// that exist in the ACTIVE WORKSPACE. There is no category list in this file
// and none in the frontend — rename a form and the dashboard renames with it.
//
// Every query below starts from req.workspaceId, which middleware/workspace.js
// re-verifies against the database. Nothing is filtered on the client.

const ALLOWED_ROLES = [
  'Junior Data Engineer',
  'Junior Data Scientist – Generative AI',
  'Sales Executive (Inside Sales / Junior Sales Track)'
];

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Fields that must never reach the client (see students.js)
const HIDDEN_STUDENT_FIELDS = { resumeUrl: 0, cloudinary_public_id: 0 };

function parseFilters(query) {
  const search   = (query.search   || '').trim();
  const college  = (query.college  || '').trim();
  const role     = (query.role     || '').trim();
  const formId   = (query.form     || '').trim();
  const dateFrom = (query.dateFrom || '').trim();
  const dateTo   = (query.dateTo   || '').trim();

  const range = {};
  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!isNaN(from)) { from.setHours(0, 0, 0, 0); range.$gte = from; }
  }
  if (dateTo) {
    const to = new Date(dateTo);
    if (!isNaN(to)) { to.setHours(23, 59, 59, 999); range.$lte = to; }
  }

  return {
    search,
    college,
    role: ALLOWED_ROLES.includes(role) ? role : '',
    // Filtering is by form _id — never by a name or a text match, so renaming
    // a form can never break or silently change a saved filter.
    formId: mongoose.isValidObjectId(formId) ? new mongoose.Types.ObjectId(formId) : null,
    dateRange: Object.keys(range).length ? range : null
  };
}

// Match stage for the Student collection
function studentMatch(workspaceId, f) {
  const conditions = [{ workspace: workspaceId }];
  if (f.formId) conditions.push({ form: f.formId });
  if (f.college) conditions.push({ college: f.college });
  if (f.role) conditions.push({ selected_role: f.role });
  if (f.dateRange) conditions.push({ createdAt: f.dateRange });
  if (f.search) {
    const rx = escapeRegex(f.search);
    conditions.push({
      $or: ['name', 'email', 'phone', 'college', 'aadhar'].map(k => ({ [k]: { $regex: rx, $options: 'i' } }))
    });
  }
  return { $and: conditions };
}

// Match stage for the FormSubmission collection.
// Submissions that produced a candidate (`student` set) are represented on
// this dashboard by that candidate's own row — including them here as well
// would list the same person twice. Only response-only submissions (forms
// that collect no identifying details) appear in their own right.
const UNLINKED_ONLY = { student: { $in: [null, undefined] } };

function submissionMatch(workspaceId, f) {
  const conditions = [{ workspace: workspaceId }, UNLINKED_ONLY];
  if (f.formId) conditions.push({ form: f.formId });
  if (f.college) conditions.push({ 'candidate.college': f.college });
  if (f.dateRange) conditions.push({ submittedAt: f.dateRange });
  if (f.search) {
    const rx = escapeRegex(f.search);
    conditions.push({
      $or: ['candidate.name', 'candidate.email', 'candidate.phone', 'candidate.college']
        .map(k => ({ [k]: { $regex: rx, $options: 'i' } }))
    });
  }
  return { $and: conditions };
}

// Role only exists on Student applications, so filtering by one necessarily
// excludes custom-form submissions rather than silently returning them.
const includeSubmissions = f => !f.role;

// Normalises both collections onto one row shape so the table can render them
// side by side. `kind` tells the UI which actions apply to the row.
const STUDENT_PROJECTION = {
  kind: { $literal: 'student' },
  form: 1,
  submittedAt: '$createdAt',
  name: 1, email: 1, phone: 1, college: 1,
  gender: 1, aadhar: 1, country: 1, state: 1, city: 1, address: 1,
  course: 1, customCourse: 1, branch: 1, customBranch: 1,
  experience: 1, selected_role: 1,
  registrationStatus: 1, registrationTime: 1, registrationPhoto: 1, registrationPhotoPublicId: 1,
  counsellingStatus: 1,
  resume_original_name: 1, resume_mime_type: 1,
  createdAt: 1
};

const SUBMISSION_PROJECTION = {
  kind: { $literal: 'submission' },
  form: 1,
  submittedAt: 1,
  name:    { $ifNull: ['$candidate.name', ''] },
  email:   { $ifNull: ['$candidate.email', ''] },
  phone:   { $ifNull: ['$candidate.phone', ''] },
  college: { $ifNull: ['$candidate.college', ''] },
  responses: 1,
  createdAt: 1
};

// ── GET /api/applications — unified, paginated, workspace-scoped list ──────
router.get('/', auth, requireWorkspace, async (req, res) => {
  try {
    const ws = req.workspaceId;
    const f = parseFilters(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    // High cap so the admin export can pull every matching row in one request
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit, 10) || 15));

    const pipeline = [
      { $match: studentMatch(ws, f) },
      { $project: STUDENT_PROJECTION }
    ];

    if (includeSubmissions(f)) {
      pipeline.push({
        $unionWith: {
          coll: FormSubmission.collection.name,
          pipeline: [
            { $match: submissionMatch(ws, f) },
            { $project: SUBMISSION_PROJECTION }
          ]
        }
      });
    }

    pipeline.push({
      $facet: {
        rows: [{ $sort: { submittedAt: -1, _id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
        totalCount: [{ $count: 'value' }]
      }
    });

    const [result] = await Student.aggregate(pipeline);
    const rows = result?.rows || [];
    const total = result?.totalCount?.[0]?.value || 0;

    // Attach the live form name/status to every row. Read fresh on each
    // request from the Form collection, so a renamed or archived form is
    // reflected immediately with no stored copy to go stale.
    const forms = await Form.find({ workspace: ws }).select('name status origin').lean();
    const formById = new Map(forms.map(x => [String(x._id), x]));

    // Workflow chain for the intake applications on this page. Computed from
    // the same rules the public reception/counselling gates enforce
    // (services/candidateWorkflow), in one batched set of queries — so what
    // the admin sees is exactly what the backend will allow.
    const studentIds = rows.filter(r => r.kind === 'student').map(r => r._id);
    const workflowByStudent = await buildWorkflowMap(studentIds, ws);

    const withForm = rows.map(row => {
      const form = row.form ? formById.get(String(row.form)) : null;
      const workflow = row.kind === 'student' ? workflowByStudent.get(String(row._id)) : null;
      return {
        ...row,
        formId: row.form ? String(row.form) : null,
        formName: form?.name || 'Unassigned',
        formStatus: form?.status || null,
        formOrigin: form?.origin || null,
        workflow: workflow || null,
        workflowStage: workflow ? currentStage(workflow) : null
      };
    });

    res.json({ rows: withForm, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    console.error('[GET /api/applications]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/applications/stats ───────────────────────────────────────────
// Totals plus a per-form breakdown built from the workspace's own forms.
// A form with no submissions still appears (count 0) so a newly created form
// shows up on the dashboard immediately; a form that was deleted while its
// applications remain surfaces as an "Unassigned" bucket rather than making
// those applications disappear.
router.get('/stats', auth, requireWorkspace, async (req, res) => {
  try {
    const ws = req.workspaceId;
    const startOfToday = startOfTodayIST();

    const [forms, studentByForm, submissionByForm, studentTotals, submissionTotals, topColleges] = await Promise.all([
      Form.find({ workspace: ws }).select('name description status origin createdAt').sort({ createdAt: 1 }).lean(),
      Student.aggregate([
        { $match: { workspace: ws } },
        { $group: {
          _id: '$form',
          count: { $sum: 1 },
          today: { $sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] } }
        } }
      ]),
      FormSubmission.aggregate([
        { $match: { workspace: ws, ...UNLINKED_ONLY } },
        { $group: {
          _id: '$form',
          count: { $sum: 1 },
          today: { $sum: { $cond: [{ $gte: ['$submittedAt', startOfToday] }, 1, 0] } }
        } }
      ]),
      Student.aggregate([
        { $match: { workspace: ws } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          today: { $sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] } }
        } }
      ]),
      FormSubmission.aggregate([
        { $match: { workspace: ws, ...UNLINKED_ONLY } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          today: { $sum: { $cond: [{ $gte: ['$submittedAt', startOfToday] }, 1, 0] } }
        } }
      ]),
      Student.aggregate([
        { $match: { workspace: ws } },
        { $group: { _id: '$college', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 8 },
        { $project: { _id: 0, college: '$_id', count: 1 } }
      ])
    ]);

    const counts = new Map();
    const bump = agg => agg.forEach(row => {
      const key = row._id ? String(row._id) : 'unassigned';
      const prev = counts.get(key) || { count: 0, today: 0 };
      counts.set(key, { count: prev.count + row.count, today: prev.today + row.today });
    });
    bump(studentByForm);
    bump(submissionByForm);

    const formStats = forms.map(form => {
      const c = counts.get(String(form._id)) || { count: 0, today: 0 };
      return {
        _id: String(form._id),
        name: form.name,
        description: form.description || '',
        status: form.status,
        origin: form.origin || 'custom',
        createdAt: form.createdAt,
        count: c.count,
        today: c.today
      };
    });

    // Applications whose form record no longer exists keep their own bucket
    // instead of vanishing from the dashboard.
    const orphan = counts.get('unassigned');
    if (orphan?.count) {
      formStats.push({
        _id: null, name: 'Unassigned', description: 'Applications whose form is no longer available.',
        status: 'Archived', origin: 'unassigned', createdAt: null, count: orphan.count, today: orphan.today
      });
    }

    const total = (studentTotals[0]?.total || 0) + (submissionTotals[0]?.total || 0);
    const today = (studentTotals[0]?.today || 0) + (submissionTotals[0]?.today || 0);

    // Which optional columns are worth showing in this workspace.
    // The intake-only fields (role, experience, course/branch, city/state)
    // exist on candidates who came through the built-in application form.
    // A workspace whose candidates all registered through Custom Forms has
    // none of them, so the dashboard drops those columns instead of rendering
    // a wall of dashes.
    const intakeSample = await Student.findOne({
      workspace: ws,
      $or: [
        { selected_role: { $exists: true, $nin: [null, ''] } },
        { aadhar: { $exists: true, $nin: [null, ''] } },
        { experience: { $exists: true, $nin: [null, ''] } }
      ]
    }).select('_id').lean();

    res.json({
      total,
      today,
      activeForms: forms.filter(x => x.status === 'Active').length,
      forms: formStats.sort((a, b) => b.count - a.count),
      topColleges,
      hasIntakeApplications: !!intakeSample
    });
  } catch (err) {
    console.error('[GET /api/applications/stats]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/applications/colleges — values for the college filter ────────
// Union of both collections, so custom-form college answers are filterable
// exactly like intake-application ones.
router.get('/colleges', auth, requireWorkspace, async (req, res) => {
  try {
    const ws = req.workspaceId;
    const [fromStudents, fromSubmissions] = await Promise.all([
      Student.distinct('college', { workspace: ws }),
      FormSubmission.distinct('candidate.college', { workspace: ws })
    ]);

    const names = [...new Set([...fromStudents, ...fromSubmissions])]
      .filter(c => typeof c === 'string' && c.trim())
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

    res.json(names);
  } catch (err) {
    console.error('[GET /api/applications/colleges]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/applications/candidates/:id — dynamic candidate detail ───────
// What a candidate's record actually consists of depends on how they
// registered, so this never returns a fixed field list:
//
//   origin 'form'   — they registered through a Custom Form. The editable
//                     fields ARE that form's fields, in its own order, with
//                     their submitted answers. A form with 4 fields shows 4.
//   origin 'intake' — they came through the built-in application form, which
//                     genuinely does collect the fixed set below.
router.get('/candidates/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, workspace: req.workspaceId })
      .select('-resumeUrl -cloudinary_public_id').lean();
    if (!student) return res.status(404).json({ message: 'Candidate not found' });

    const submission = await FormSubmission.findOne({ student: student._id, workspace: req.workspaceId })
      .sort({ submittedAt: -1 }).lean();

    if (submission) {
      const form = await Form.findOne({ _id: submission.form, workspace: req.workspaceId })
        .select('name fields').lean();

      // Resolve each college field's allowed options to real names, exactly as
      // the public page does — the admin picks from the same list the
      // candidate saw, never a free-text college.
      const collegeIds = [...new Set(
        (form?.fields || []).filter(f => f.type === 'college')
          .flatMap(f => (f.selectedCollegeIds || []).map(String))
      )];
      const colleges = collegeIds.length
        ? await College.find({ _id: { $in: collegeIds }, workspace: req.workspaceId }).select('name').sort({ name: 1 }).lean()
        : [];
      const nameById = new Map(colleges.map(c => [String(c._id), c.name]));

      const fields = (form?.fields || []).map(f => ({
        _id: String(f._id),
        label: f.label,
        type: f.type,
        required: !!f.required,
        placeholder: f.placeholder || '',
        options: f.options || [],
        collegeOptions: f.type === 'college'
          ? (f.selectedCollegeIds || []).map(id => nameById.get(String(id))).filter(Boolean)
          : undefined,
        value: submission.responses?.[String(f._id)] ?? ''
      }));

      return res.json({
        _id: String(student._id),
        name: student.name,
        origin: 'form',
        form: form ? { _id: String(form._id), name: form.name } : null,
        submissionId: String(submission._id),
        submittedAt: submission.submittedAt,
        fields
      });
    }

    // Built-in intake application — these candidates really do carry this set.
    const INTAKE_FIELDS = [
      ['name', 'Full Name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'phone'],
      ['aadhar', 'Aadhar Number', 'text'], ['gender', 'Gender', 'text'],
      ['country', 'Country', 'text'], ['state', 'State', 'text'], ['city', 'City', 'text'],
      ['address', 'Address', 'textarea'], ['college', 'College', 'text'],
      ['course', 'Course', 'text'], ['customCourse', 'Course (Custom)', 'text'],
      ['branch', 'Branch', 'text'], ['customBranch', 'Branch (Custom)', 'text'],
      ['experience', 'Experience', 'dropdown'], ['selected_role', 'Selected Role', 'dropdown']
    ];
    const OPTIONS = {
      experience: ['Fresher', '0-3 Years', '3+ Years'],
      selected_role: ALLOWED_ROLES,
      gender: ['Male', 'Female', 'Other']
    };

    res.json({
      _id: String(student._id),
      name: student.name,
      origin: 'intake',
      form: null,
      submissionId: null,
      submittedAt: student.createdAt,
      fields: INTAKE_FIELDS.map(([key, label, type]) => ({
        _id: key, label, type, required: key === 'name',
        options: OPTIONS[key] || [],
        value: student[key] ?? ''
      }))
    });
  } catch (err) {
    console.error('[GET /api/applications/candidates/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/applications/candidates/:id — dynamic candidate update ───────
// Validated against whatever the candidate's own form defines, not a fixed
// schema. Updating a form-origin candidate rewrites their submission answers
// and re-derives the identity columns (name/email/phone/college) the rest of
// the workflow matches on, so one candidate stays one candidate.
router.put('/candidates/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, workspace: req.workspaceId });
    if (!student) return res.status(404).json({ message: 'Candidate not found' });

    const submission = await FormSubmission.findOne({ student: student._id, workspace: req.workspaceId })
      .sort({ submittedAt: -1 });

    // ── Intake candidates keep their existing fixed-schema update path ──
    if (!submission) {
      const allowed = [
        'name', 'gender', 'email', 'phone', 'aadhar', 'country', 'state', 'city', 'address',
        'college', 'course', 'customCourse', 'branch', 'customBranch', 'experience', 'selected_role'
      ];
      const update = {};
      allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
      Object.assign(student, update);
      await student.save();
      return res.json({ message: 'Saved' });
    }

    const form = await Form.findOne({ _id: submission.form, workspace: req.workspaceId }).lean();
    if (!form) return res.status(404).json({ message: 'The form for this candidate is no longer available' });

    const incoming = (req.body && typeof req.body.responses === 'object' && req.body.responses) || {};
    const byId = new Map(form.fields.map(f => [String(f._id), f]));

    // Only fields that exist on THIS form are accepted
    const responses = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (byId.has(key)) responses[key] = value;
    }

    // Required fields, per this form's own configuration
    const missing = form.fields.filter(f => f.required).filter(f => {
      const v = responses[String(f._id)];
      return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
    });
    if (missing.length) {
      return res.status(400).json({ message: `Please fill in: ${missing.map(f => f.label).join(', ')}` });
    }

    // College answers must still be one of the colleges selected for this form
    const collegeFields = form.fields.filter(f => f.type === 'college');
    if (collegeFields.length) {
      const allIds = [...new Set(collegeFields.flatMap(f => (f.selectedCollegeIds || []).map(String)))];
      const valid = allIds.length
        ? await College.find({ _id: { $in: allIds }, workspace: req.workspaceId }).select('name').lean()
        : [];
      for (const f of collegeFields) {
        const key = String(f._id);
        const submitted = responses[key];
        if (submitted === undefined || submitted === '') continue;
        const allowedNames = (f.selectedCollegeIds || [])
          .map(id => valid.find(c => String(c._id) === String(id))?.name)
          .filter(Boolean);
        if (!allowedNames.includes(String(submitted))) {
          return res.status(400).json({ message: `Invalid selection for "${f.label}"` });
        }
      }
    }

    submission.responses = responses;
    submission.candidate = buildCandidateSummary(form.fields, responses);
    await submission.save();

    // Keep the candidate's identity columns in step with the edited answers —
    // reception matches on phone, counselling on email, attendance on college.
    const summary = submission.candidate;
    if (summary.name) student.name = summary.name;
    if (summary.email) student.email = summary.email;
    if (summary.phone) student.phone = summary.phone;
    if (summary.college) student.college = summary.college;
    await student.save();

    res.json({ message: 'Saved' });
  } catch (err) {
    console.error('[PUT /api/applications/candidates/:id]', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── GET /api/applications/submissions/:id — one custom-form response ──────
// Returns the answers keyed by their field labels for the detail drawer.
router.get('/submissions/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const submission = await FormSubmission.findOne({ _id: req.params.id, workspace: req.workspaceId }).lean();
    if (!submission) return res.status(404).json({ message: 'Application not found' });

    const form = await Form.findOne({ _id: submission.form, workspace: req.workspaceId }).select('name fields status').lean();
    const answers = (form?.fields || []).map(field => {
      const value = submission.responses?.[String(field._id)];
      return {
        label: field.label,
        type: field.type,
        value: Array.isArray(value) ? value.join(', ') : (value ?? '')
      };
    });

    res.json({
      _id: String(submission._id),
      formName: form?.name || 'Unassigned',
      formStatus: form?.status || null,
      submittedAt: submission.submittedAt,
      answers
    });
  } catch (err) {
    console.error('[GET /api/applications/submissions/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/applications/submissions/:id ──────────────────────────────
router.delete('/submissions/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const deleted = await FormSubmission.findOneAndDelete({ _id: req.params.id, workspace: req.workspaceId });
    if (!deleted) return res.status(404).json({ message: 'Application not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('[DELETE /api/applications/submissions/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
