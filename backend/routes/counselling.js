const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const AttendanceSession = require('../models/AttendanceSession');
const CounsellingQuestion = require('../models/CounsellingQuestion');
const CounsellingResponse = require('../models/CounsellingResponse');
const ReceptionCheckin = require('../models/ReceptionCheckin');
const counsellingAuth = require('../middleware/counsellingAuth');
const { generateReportInBackground } = require('../services/aiReport');

// Today's calendar day in India — attendance dates are stored as IST days,
// so the server's own timezone must not leak into eligibility checks.
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

const clean = v => (typeof v === 'string' ? v.trim() : '');

// Strip points before anything leaves the API — students never see scores
function publicQuestion(q) {
  return {
    id: q._id,
    code: q.code,
    text: q.text,
    type: q.type,
    options: q.options.map(o => o.label),
    allowOther: q.allowOther,
    required: q.required,
    sectionKey: q.sectionKey,
    sectionTitle: q.sectionTitle,
    sectionNote: q.sectionNote
  };
}

// Group active questions into ordered sections
async function loadForm() {
  const questions = await CounsellingQuestion.find({ active: true }).sort({ order: 1 }).lean();
  const sections = [];
  const byKey = new Map();
  for (const q of questions) {
    if (!byKey.has(q.sectionKey)) {
      const s = { key: q.sectionKey, title: q.sectionTitle, note: q.sectionNote || '', questions: [] };
      byKey.set(q.sectionKey, s);
      sections.push(s);
    }
    byKey.get(q.sectionKey).questions.push(publicQuestion(q));
  }
  return { sections, totalQuestions: questions.length };
}

async function resolveEligibleAttendance(student) {
  const presentRecords = await Attendance.find({ student: student._id, status: 'Present' })
    .sort({ date: -1 })
    .lean();

  if (!presentRecords.length) return null;

  const latestRecord = presentRecords[0];
  const session = await AttendanceSession.findOne({ college: latestRecord.college, date: latestRecord.date }).lean();

  return {
    attendanceDate: latestRecord.date,
    attendanceSessionId: session?._id || null,
    college: latestRecord.college || student.college,
    batch: session?.batch || '',
    branch: student.branch === 'Others' ? (student.customBranch || '') : student.branch
  };
}

// ── POST /api/counselling/verify ────────────────────────────────────────────
// Student enters name + email + mobile. We match them to a registered student
// and check whether they were ever marked Present in any attendance session.
router.post('/verify', async (req, res) => {
  try {
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const phone = clean(req.body.phone).replace(/\D/g, '').slice(-10);

    if (!name || name.length < 2) return res.status(400).json({ message: 'Please enter your full name' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Please enter a valid email address' });
    if (phone.length !== 10) return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number' });

    // Match on email, then confirm the phone's last 10 digits agree
    const candidates = await Student.find({ email }).select('name email phone college branch customBranch registrationStatus').lean();
    const student = candidates.find(s => (s.phone || '').replace(/\D/g, '').slice(-10) === phone);

    if (!student) {
      return res.status(404).json({
        message: 'We could not find your registration with this email and mobile number. Please use the same details you registered with, or contact the coordinator.'
      });
    }

    const eligibleAttendance = await resolveEligibleAttendance(student);
    if (!eligibleAttendance) {
      return res.status(403).json({
        code: 'NOT_PRESENT',
        message: 'Your attendance has not been recorded yet. Please contact the coordinator.'
      });
    }

    // Reception Registration gate — the student must complete the office
    // check-in (photo capture at the entrance tablet) before counselling opens
    if (student.registrationStatus !== 'REGISTERED') {
      return res.status(403).json({
        code: 'REGISTRATION_REQUIRED',
        message: 'Reception Registration Required\n\nPlease complete Reception Registration first.'
      });
    }

    const { attendanceDate, attendanceSessionId, college, batch, branch } = eligibleAttendance;

    let response = attendanceSessionId
      ? await CounsellingResponse.findOne({ student: student._id, attendanceSession: attendanceSessionId })
      : await CounsellingResponse.findOne({ student: student._id, attendanceDate });

    if (response && response.status === 'submitted') {
      return res.status(409).json({
        code: 'ALREADY_SUBMITTED',
        message: 'You have already submitted the counselling form for this attendance session. If you need to make changes, please contact the coordinator.'
      });
    }
    if (!response) {
      response = await CounsellingResponse.create({
        student: student._id,
        college,
        branch,
        batch,
        attendanceSession: attendanceSessionId,
        attendanceDate,
        name: student.name,
        email: student.email,
        phone: student.phone
      });
    }

    const token = jwt.sign(
      {
        role: 'counselling',
        studentId: String(student._id),
        responseId: String(response._id),
        attendanceDate,
        attendanceSessionId: attendanceSessionId ? String(attendanceSessionId) : null
      },
      process.env.JWT_SECRET,
      { expiresIn: '3h' }
    );

    res.json({
      token,
      student: { name: student.name, email: student.email, college },
      attendanceDate,
      attendanceSessionId: attendanceSessionId ? String(attendanceSessionId) : null,
      resuming: response.answers.length > 0
    });
  } catch (err) {
    console.error('[POST /api/counselling/verify]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/counselling/form ───────────────────────────────────────────────
// The questionnaire (from the database), grouped by section, points stripped.
router.get('/form', counsellingAuth, async (req, res) => {
  try {
    res.json(await loadForm());
  } catch (err) {
    console.error('[GET /api/counselling/form]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/counselling/session ────────────────────────────────────────────
// The student's saved draft — lets them resume where they left off.
router.get('/session', counsellingAuth, async (req, res) => {
  try {
    const response = await CounsellingResponse.findById(req.counselling.responseId).lean();
    if (!response) return res.status(404).json({ message: 'Session not found' });
    res.json({
      status: response.status,
      completionPercent: response.completionPercent,
      lastSavedAt: response.lastSavedAt,
      answers: response.answers.map(a => ({
        code: a.code,
        selected: a.selected,
        otherText: a.otherText || ''
      }))
    });
  } catch (err) {
    console.error('[GET /api/counselling/session]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── answer validation shared by autosave + submit ───────────────────────────
// Accepts [{code, selected: [labels], otherText}], validates each against the
// live question set and computes points server-side (never trusts the client).
async function buildAnswers(rawAnswers) {
  const questions = await CounsellingQuestion.find({ active: true }).lean();
  const byCode = new Map(questions.map(q => [q.code, q]));

  const answers = [];
  const seen = new Set();
  for (const raw of Array.isArray(rawAnswers) ? rawAnswers : []) {
    const q = byCode.get(clean(raw.code));
    if (!q || seen.has(q.code)) continue;
    seen.add(q.code);

    const otherText = clean(raw.otherText).slice(0, 2000);
    let selected = Array.isArray(raw.selected)
      ? raw.selected.filter(s => typeof s === 'string').map(s => s.trim())
      : [];

    let points = 0;
    if (q.type === 'radio' || q.type === 'checkbox') {
      const validLabels = new Set(q.options.map(o => o.label));
      const OTHER = '__other__';
      selected = selected.filter(s => validLabels.has(s) || (q.allowOther && s === OTHER));
      if (q.type === 'radio' && selected.length > 1) selected = selected.slice(0, 1);
      const pointsByLabel = new Map(q.options.map(o => [o.label, o.points || 0]));
      points = selected.reduce((sum, s) => sum + (pointsByLabel.get(s) || 0), 0);
    } else {
      // free-text question — answer lives in otherText
      selected = [];
    }

    const isAnswered = selected.length > 0 || otherText.length > 0;
    if (!isAnswered) continue;

    answers.push({
      question: q._id,
      code: q.code,
      questionText: q.text,
      sectionKey: q.sectionKey,
      type: q.type,
      selected,
      otherText,
      points
    });
  }

  // completion = answered required questions / total required questions
  const required = questions.filter(q => q.required);
  const answeredRequired = required.filter(q => seen.has(q.code) &&
    answers.some(a => a.code === q.code)).length;
  const completionPercent = required.length
    ? Math.round((answeredRequired / required.length) * 100)
    : 100;

  const missingRequired = required
    .filter(q => !answers.some(a => a.code === q.code))
    .map(q => q.code);

  const totalScore = answers.reduce((s, a) => s + a.points, 0);
  const maxScore = questions.reduce(
    (s, q) => s + (q.options.length ? Math.max(...q.options.map(o => o.points || 0)) : 0), 0);

  return { answers, completionPercent, missingRequired, totalScore, maxScore };
}

// ── PUT /api/counselling/autosave ───────────────────────────────────────────
router.put('/autosave', counsellingAuth, async (req, res) => {
  try {
    const response = await CounsellingResponse.findById(req.counselling.responseId);
    if (!response) return res.status(404).json({ message: 'Session not found' });
    if (response.status === 'submitted') {
      return res.status(409).json({ code: 'ALREADY_SUBMITTED', message: 'This form has already been submitted' });
    }

    const { answers, completionPercent, totalScore, maxScore } = await buildAnswers(req.body.answers);
    response.set({ answers, completionPercent, totalScore, maxScore, lastSavedAt: new Date() });
    await response.save();

    res.json({ savedAt: response.lastSavedAt, completionPercent });
  } catch (err) {
    console.error('[PUT /api/counselling/autosave]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/counselling/submit ────────────────────────────────────────────
router.post('/submit', counsellingAuth, async (req, res) => {
  try {
    const response = await CounsellingResponse.findById(req.counselling.responseId);
    if (!response) return res.status(404).json({ message: 'Session not found' });
    if (response.status === 'submitted') {
      return res.status(409).json({ code: 'ALREADY_SUBMITTED', message: 'This form has already been submitted' });
    }

    // Re-check eligibility: if the admin removed the attendance record the form locks
    const attendance = await Attendance.findOne({
      student: response.student,
      date: response.attendanceDate,
      status: 'Present'
    }).lean();
    if (!attendance) {
      return res.status(403).json({
        code: 'NOT_PRESENT',
        message: 'You are not marked present for today\'s session. Please contact the coordinator.'
      });
    }

    const { answers, completionPercent, missingRequired, totalScore, maxScore } =
      await buildAnswers(req.body.answers);

    if (missingRequired.length > 0) {
      return res.status(400).json({
        code: 'INCOMPLETE',
        message: `Please answer all required questions (${missingRequired.length} remaining)`,
        missing: missingRequired
      });
    }

    response.set({
      answers, completionPercent, totalScore, maxScore,
      status: 'submitted',
      submittedAt: new Date(),
      lastSavedAt: new Date()
    });
    await response.save();

    // Reception flow: mark the student's counselling as completed — both the
    // current-status flag and that specific day's permanent check-in record
    await Student.updateOne(
      { _id: response.student },
      { counsellingStatus: 'COMPLETED' }
    );
    await ReceptionCheckin.updateOne(
      { student: response.student, date: response.attendanceDate },
      { counsellingStatus: 'COMPLETED', counsellingCompletedAt: new Date() }
    );

    // Generate the AI counselling report asynchronously — never blocks the student
    generateReportInBackground(response);

    res.json({
      message: 'Submitted successfully',
      submittedAt: response.submittedAt,
      completionPercent: response.completionPercent
    });
  } catch (err) {
    console.error('[POST /api/counselling/submit]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
