const router     = require('express').Router();
const auth       = require('../middleware/auth');
const Student    = require('../models/Student');
const Attendance = require('../models/Attendance');
const { syncSessionFromAttendance } = require('../services/attendanceSessions');

const VALID_STATUS = ['Present', 'Absent'];
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// Fields the attendance screen needs from each student
const STUDENT_FIELDS = 'name email phone college course customCourse branch customBranch';

// ── GET /api/attendance/colleges ───────────────────────────────────────────────
// Distinct list of colleges that actually have students — feeds the college
// picker on the attendance screen. (Mirrors /api/students/colleges.)
router.get('/colleges', auth, async (req, res) => {
  try {
    const colleges = await Student.distinct('college');
    res.json(
      colleges
        .filter(c => typeof c === 'string' && c.trim())
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    );
  } catch (err) {
    console.error('[GET /api/attendance/colleges]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/attendance/summary?date=YYYY-MM-DD ────────────────────────────────
// College-wise present/absent/total roster counts for a given day, so the admin
// can see at a glance how each college turned out.
router.get('/summary', auth, async (req, res) => {
  try {
    const date = (req.query.date || '').trim();
    if (!DATE_RX.test(date)) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }

    // Total students enrolled per college (the full roster)
    const rosterAgg = await Student.aggregate([
      { $group: { _id: '$college', total: { $sum: 1 } } }
    ]);

    // Present / Absent counts per college for the requested day
    const markedAgg = await Attendance.aggregate([
      { $match: { date } },
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
router.get('/', auth, async (req, res) => {
  try {
    const college = (req.query.college || '').trim();
    const date    = (req.query.date || '').trim();

    if (!college) return res.status(400).json({ message: 'College is required' });
    if (!DATE_RX.test(date)) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }

    const students = await Student.find({ college })
      .select(STUDENT_FIELDS)
      .sort({ name: 1 })
      .lean();

    // Pull existing marks for these students on this date in one query
    const ids = students.map(s => s._id);
    const records = await Attendance.find({ student: { $in: ids }, date }).lean();
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
router.post('/', auth, async (req, res) => {
  try {
    const { studentId, date, status } = req.body;

    if (!studentId) return res.status(400).json({ message: 'studentId is required' });
    if (!DATE_RX.test((date || '').trim())) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ message: 'Status must be Present or Absent' });
    }

    const student = await Student.findById(studentId).select('college').lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const record = await Attendance.findOneAndUpdate(
      { student: studentId, date: date.trim() },
      { student: studentId, date: date.trim(), status, college: student.college, markedBy: req.admin?.email },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    // Record the change in the historical session (with edit audit trail)
    syncSessionFromAttendance(student.college, date.trim(), req.admin?.email)
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
router.post('/bulk', auth, async (req, res) => {
  try {
    const { date, records } = req.body;

    if (!DATE_RX.test((date || '').trim())) {
      return res.status(400).json({ message: 'A valid date (YYYY-MM-DD) is required' });
    }
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'records must be a non-empty array' });
    }

    const cleanDate = date.trim();

    // Resolve each student's college so summaries stay accurate
    const ids = [...new Set(records.map(r => r.studentId).filter(Boolean))];
    const students = await Student.find({ _id: { $in: ids } }).select('college').lean();
    const collegeById = new Map(students.map(s => [String(s._id), s.college]));

    const ops = [];
    const clearIds = [];
    for (const r of records) {
      if (!r.studentId) continue;
      const college = collegeById.get(String(r.studentId));
      if (!college) continue; // unknown / deleted student — skip silently

      if (VALID_STATUS.includes(r.status)) {
        // Present / Absent → upsert
        ops.push({
          updateOne: {
            filter: { student: r.studentId, date: cleanDate },
            update: {
              $set: { status: r.status, college, markedBy: req.admin?.email },
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
      syncSessionFromAttendance(college, cleanDate, req.admin?.email)
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
