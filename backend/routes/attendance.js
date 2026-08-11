const router     = require('express').Router();
const auth       = require('../config/auth');
const requireWorkspace = require('../middleware/workspace');
const Student    = require('../models/Student');
const College    = require('../models/College');
const Attendance = require('../models/Attendance');
const { syncSessionFromAttendance } = require('../services/attendanceSessions');

const VALID_STATUS = ['Present', 'Absent'];
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// Fields the attendance screen needs from each student
const STUDENT_FIELDS = 'name email phone college course customCourse branch customBranch';

// ── GET /api/attendance/colleges ───────────────────────────────────────────────
// The college picker for attendance (and the history / counselling filters).
//
// This used to return ONLY `Student.distinct('college')` — the college names
// that happened to appear on application records. That meant a workspace whose
// colleges were set up under Workspace → Colleges but which had no applications
// yet showed an EMPTY picker, and managed colleges with no applicants were
// never selectable.
//
// It now leads with the workspace's managed College collection — the same
// single source of truth the Form Builder uses — and then adds any college
// still referenced by this workspace's own student records. That second half
// matters: some applications carry free-text college names entered through the
// public forms, and dropping them would make their existing attendance
// unreachable. Managed spelling wins on a case-insensitive clash.
//
// Both queries are scoped to req.workspaceId (re-verified by requireWorkspace),
// so a workspace can never see another company's colleges.
router.get('/colleges', auth, requireWorkspace, async (req, res) => {
  try {
    const [managed, onApplications] = await Promise.all([
      College.find({ workspace: req.workspaceId }).select('name').lean(),
      Student.distinct('college', { workspace: req.workspaceId })
    ]);

    const byKey = new Map();
    const add = name => {
      if (typeof name !== 'string' || !name.trim()) return;
      const key = name.trim().toLowerCase();
      if (!byKey.has(key)) byKey.set(key, name.trim());
    };

    managed.forEach(c => add(c.name));       // authoritative list, added first
    onApplications.forEach(add);             // keeps historical data reachable

    res.json([...byKey.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  } catch (err) {
    console.error('[GET /api/attendance/colleges]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/attendance/student/:studentId?date=YYYY-MM-DD ─────────────────────
// A single student's attendance status for one date — used by the "Search
// Student" quick-mark flow (coordinator meets one student and doesn't know/
// need to select their college first; POST /api/attendance below already
// resolves the student's college automatically).
router.get('/student/:studentId', auth, requireWorkspace, async (req, res) => {
  try {
    const date = (req.query.date || '').trim();
    if (!DATE_RX.test(date)) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }

    const student = await Student.findOne({ _id: req.params.studentId, workspace: req.workspaceId }).select(STUDENT_FIELDS).lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const record = await Attendance.findOne({ student: req.params.studentId, date, workspace: req.workspaceId }).lean();
    res.json({ student, date, status: record?.status || null });
  } catch (err) {
    console.error('[GET /api/attendance/student/:studentId]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/attendance/summary?date=YYYY-MM-DD ────────────────────────────────
// College-wise present/absent/total roster counts for a given day, so the admin
// can see at a glance how each college turned out.
router.get('/summary', auth, requireWorkspace, async (req, res) => {
  try {
    const date = (req.query.date || '').trim();
    if (!DATE_RX.test(date)) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }

    // Total students enrolled per college (the full roster)
    const rosterAgg = await Student.aggregate([
      { $match: { workspace: req.workspaceId } },
      { $group: { _id: '$college', total: { $sum: 1 } } }
    ]);

    // Present / Absent counts per college for the requested day
    const markedAgg = await Attendance.aggregate([
      { $match: { workspace: req.workspaceId, date } },
      { $group: { _id: { college: '$college', status: '$status' }, count: { $sum: 1 } } }
    ]);

    const map = new Map();
    rosterAgg.forEach(r => {
      if (!r._id) return;
      map.set(r._id, { college: r._id, total: r.total, present: 0, absent: 0 });
    });
    markedAgg.forEach(m => {
      const college = m._id.college;
      if (!map.has(college)) {
        map.set(college, { college, total: 0, present: 0, absent: 0 });
      }
      const entry = map.get(college);
      if (m._id.status === 'Present') entry.present = m.count;
      else if (m._id.status === 'Absent') entry.absent = m.count;
    });

    const summary = [...map.values()].map(e => ({
      ...e,
      notMarked: Math.max(0, e.total - e.present - e.absent)
    })).sort((a, b) => a.college.localeCompare(b.college, 'en', { sensitivity: 'base' }));

    const totals = summary.reduce((acc, e) => ({
      total:     acc.total     + e.total,
      present:   acc.present   + e.present,
      absent:    acc.absent    + e.absent,
      notMarked: acc.notMarked + e.notMarked
    }), { total: 0, present: 0, absent: 0, notMarked: 0 });

    res.json({ date, totals, colleges: summary });
  } catch (err) {
    console.error('[GET /api/attendance/summary]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/attendance?college=&date= ─────────────────────────────────────────
// Roster for one college on one day: every student plus their attendance status
// for that date ('Present' | 'Absent' | null when not yet marked).
router.get('/', auth, requireWorkspace, async (req, res) => {
  try {
    const college = (req.query.college || '').trim();
    const date    = (req.query.date || '').trim();

    if (!college) return res.status(400).json({ message: 'College is required' });
    if (!DATE_RX.test(date)) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }

    const students = await Student.find({ college, workspace: req.workspaceId })
      .select(STUDENT_FIELDS)
      .sort({ name: 1 })
      .lean();

    // Pull existing marks for these students on this date in one query
    const ids = students.map(s => s._id);
    const records = await Attendance.find({ student: { $in: ids }, date, workspace: req.workspaceId }).lean();
    const statusById = new Map(records.map(r => [String(r.student), r.status]));

    const roster = students.map(s => ({
      ...s,
      status: statusById.get(String(s._id)) || null
    }));

    const present = roster.filter(s => s.status === 'Present').length;
    const absent  = roster.filter(s => s.status === 'Absent').length;

    res.json({
      college,
      date,
      counts: {
        total: roster.length,
        present,
        absent,
        notMarked: roster.length - present - absent
      },
      students: roster
    });
  } catch (err) {
    console.error('[GET /api/attendance]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/attendance ───────────────────────────────────────────────────────
// Mark (or update) a single student's attendance for a date.
// body: { studentId, date, status }
router.post('/', auth, requireWorkspace, async (req, res) => {
  try {
    const { studentId, date, status } = req.body;

    if (!studentId) return res.status(400).json({ message: 'studentId is required' });
    if (!DATE_RX.test((date || '').trim())) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ message: 'Status must be Present or Absent' });
    }

    const student = await Student.findOne({ _id: studentId, workspace: req.workspaceId }).select('college').lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const record = await Attendance.findOneAndUpdate(
      { student: studentId, date: date.trim() },
      { student: studentId, date: date.trim(), status, college: student.college, workspace: req.workspaceId, markedBy: req.admin?.email },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    // Record the change in the historical session (with edit audit trail)
    syncSessionFromAttendance(req.workspaceId, student.college, date.trim(), req.admin?.email)
      .catch(e => console.error('[attendance session sync]', e));

    res.json(record);
  } catch (err) {
    console.error('[POST /api/attendance]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/attendance/bulk ──────────────────────────────────────────────────
// Save attendance for many students at once (the "Save Attendance" button).
// body: { date, records: [{ studentId, status }] }
router.post('/bulk', auth, requireWorkspace, async (req, res) => {
  try {
    const { date, records } = req.body;

    if (!DATE_RX.test((date || '').trim())) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'records must be a non-empty array' });
    }

    const cleanDate = date.trim();

    // Resolve each student's college so summaries stay accurate — scoped to
    // this workspace, so an id from another company's drive is silently skipped
    const ids = [...new Set(records.map(r => r.studentId).filter(Boolean))];
    const students = await Student.find({ _id: { $in: ids }, workspace: req.workspaceId }).select('college').lean();
    const collegeById = new Map(students.map(s => [String(s._id), s.college]));

    const ops = [];
    const clearIds = [];
    for (const r of records) {
      if (!r.studentId) continue;
      const college = collegeById.get(String(r.studentId));
      if (!college) continue; // unknown / deleted / other-workspace student — skip silently

      if (VALID_STATUS.includes(r.status)) {
        // Present / Absent → upsert
        ops.push({
          updateOne: {
            filter: { student: r.studentId, date: cleanDate },
            update: {
              $set: { status: r.status, college, workspace: req.workspaceId, markedBy: req.admin?.email },
              $setOnInsert: { student: r.studentId, date: cleanDate }
            },
            upsert: true
          }
        });
      } else if (r.status === null || r.status === undefined || r.status === '') {
        // Cleared by the admin → remove any existing record for this day
        clearIds.push(r.studentId);
      }
      // Any other (invalid) status value is ignored
    }

    if (clearIds.length) {
      ops.push({
        deleteMany: {
          filter: { student: { $in: clearIds }, date: cleanDate }
        }
      });
    }

    if (ops.length === 0) {
      return res.status(400).json({ message: 'No valid attendance records to save' });
    }

    const result = await Attendance.bulkWrite(ops, { ordered: false });

    // Record this save in the historical sessions (one per college touched),
    // appending any changes to the edit audit trail
    const colleges = [...new Set([...collegeById.values()])];
    for (const college of colleges) {
      syncSessionFromAttendance(req.workspaceId, college, cleanDate, req.admin?.email)
        .catch(e => console.error('[attendance session sync]', e));
    }

    res.json({
      message: 'Attendance saved',
      upserted: result.upsertedCount || 0,
      modified: result.modifiedCount || 0,
      cleared:  result.deletedCount || 0
    });
  } catch (err) {
    console.error('[POST /api/attendance/bulk]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
