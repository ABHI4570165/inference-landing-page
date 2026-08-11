const router = require('express').Router();
const auth = require('../config/auth');
const requireWorkspace = require('../middleware/workspace');
const Attendance = require('../models/Attendance');
const AttendanceSession = require('../models/AttendanceSession');
const Student = require('../models/Student');
const AuditLog = require('../models/AuditLog');
const { syncSessionFromAttendance } = require('../services/attendanceSessions');

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = ['Present', 'Absent'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── GET /api/attendance-sessions ────────────────────────────────────────────
// Historical attendance, session by session. Filters: college, from, to,
// month (YYYY-MM), takenBy. Paginated, newest first.
router.get('/', auth, requireWorkspace, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));

    const match = { workspace: req.workspaceId };
    const sortMode = String(req.query.sort || 'latest').toLowerCase();
    if (req.query.college) match.college = String(req.query.college);
    if (req.query.batch) match.batch = new RegExp(escapeRegex(String(req.query.batch).trim()), 'i');
    if (req.query.admin || req.query.takenBy) {
      match.takenBy = new RegExp(escapeRegex(String(req.query.admin || req.query.takenBy).trim()), 'i');
    }
    if (req.query.search) {
      match.college = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    }
    if (/^\d{4}-\d{2}$/.test(req.query.month || '')) {
      match.date = { $regex: `^${req.query.month}` };
    } else if (DATE_RX.test(req.query.from || '') || DATE_RX.test(req.query.to || '')) {
      match.date = {};
      if (DATE_RX.test(req.query.from || '')) match.date.$gte = req.query.from;
      if (DATE_RX.test(req.query.to || ''))   match.date.$lte = req.query.to;
    }
    if (req.query.year) {
      const year = String(req.query.year).trim();
      match.date = { ...(match.date || {}), $regex: `^${year}-` };
    }

    const sort =
      sortMode === 'oldest' ? { date: 1, college: 1 } :
      sortMode === 'college' ? { college: 1, date: -1 } :
      sortMode === 'highest' ? { presentCount: -1, date: -1 } :
      sortMode === 'lowest' ? { presentCount: 1, date: -1 } :
      { date: -1, college: 1 };

    const [total, sessions] = await Promise.all([
      AttendanceSession.countDocuments(match),
      AttendanceSession.find(match)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('college date batch remarks takenBy presentCount absentCount editHistory createdAt updatedAt')
        .lean()
    ]);

    res.json({
      page, limit, total,
      rows: sessions.map(s => ({
        _id: s._id,
        college: s.college,
        date: s.date,
        batch: s.batch,
        remarks: s.remarks,
        takenBy: s.takenBy,
        presentCount: s.presentCount,
        absentCount: s.absentCount,
        totalMarked: s.presentCount + s.absentCount,
        editCount: (s.editHistory || []).length,
        lastEditedAt: s.editHistory?.length ? s.editHistory[s.editHistory.length - 1].editedAt : null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      }))
    });
  } catch (err) {
    console.error('[GET /api/attendance-sessions]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/attendance-sessions/analytics ──────────────────────────────────
// Attendance percentages: overall, college-wise, branch-wise, month-wise and
// per-day trend. Optional ?college=&from=&to=
router.get('/analytics', auth, requireWorkspace, async (req, res) => {
  try {
    const match = { workspace: req.workspaceId };
    if (req.query.college) match.college = String(req.query.college);
    if (req.query.batch) match.batch = new RegExp(escapeRegex(String(req.query.batch).trim()), 'i');
    if (req.query.admin || req.query.takenBy) {
      match.takenBy = new RegExp(escapeRegex(String(req.query.admin || req.query.takenBy).trim()), 'i');
    }
    if (req.query.search) {
      match.college = new RegExp(escapeRegex(String(req.query.search).trim()), 'i');
    }
    if (/^\d{4}-\d{2}$/.test(req.query.month || '')) {
      match.date = { $regex: `^${req.query.month}` };
    } else if (DATE_RX.test(req.query.from || '') || DATE_RX.test(req.query.to || '')) {
      match.date = {};
      if (DATE_RX.test(req.query.from || '')) match.date.$gte = req.query.from;
      if (DATE_RX.test(req.query.to || ''))   match.date.$lte = req.query.to;
    }
    if (req.query.year) {
      const year = String(req.query.year).trim();
      match.date = { ...(match.date || {}), $regex: `^${year}-` };
    }

    const presentSum = { $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] } };

    const [overall, byCollege, byMonth, byDate, byBranch] = await Promise.all([
      Attendance.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: 1 }, present: presentSum } }
      ]),
      Attendance.aggregate([
        { $match: match },
        { $group: { _id: '$college', total: { $sum: 1 }, present: presentSum } },
        { $sort: { total: -1 } }
      ]),
      Attendance.aggregate([
        { $match: match },
        { $group: { _id: { $substrCP: ['$date', 0, 7] }, total: { $sum: 1 }, present: presentSum } },
        { $sort: { _id: 1 } }
      ]),
      Attendance.aggregate([
        { $match: match },
        { $group: { _id: '$date', total: { $sum: 1 }, present: presentSum } },
        { $sort: { _id: -1 } },
        { $limit: 45 },
        { $sort: { _id: 1 } }
      ]),
      Attendance.aggregate([
        { $match: match },
        { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'stu' } },
        { $unwind: '$stu' },
        {
          $group: {
            _id: { $cond: [{ $eq: ['$stu.branch', 'Others'] }, { $ifNull: ['$stu.customBranch', 'Others'] }, '$stu.branch'] },
            total: { $sum: 1 },
            present: presentSum
          }
        },
        { $sort: { total: -1 } },
        { $limit: 15 }
      ])
    ]);

    const pct = e => (e.total ? Math.round((e.present / e.total) * 100) : 0);
    const shape = (arr, key) => arr.map(e => ({
      [key]: e._id, total: e.total, present: e.present, absent: e.total - e.present, percent: pct(e)
    }));

    res.json({
      overall: overall[0]
        ? { total: overall[0].total, present: overall[0].present, absent: overall[0].total - overall[0].present, percent: pct(overall[0]) }
        : { total: 0, present: 0, absent: 0, percent: 0 },
      byCollege: shape(byCollege, 'college'),
      byMonth: shape(byMonth, 'month'),
      byDate: shape(byDate, 'date'),
      byBranch: shape(byBranch, 'branch')
    });
  } catch (err) {
    console.error('[GET /api/attendance-sessions/analytics]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/attendance-sessions/:id ────────────────────────────────────────
// One session in full: present/absent student lists, stats, edit history.
router.get('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, workspace: req.workspaceId })
      .populate('records.student', 'name email phone course customCourse branch customBranch')
      .lean();
    if (!session) return res.status(404).json({ message: 'Session not found' });

    // Include the full roster so unmarked students are visible/editable too
    const roster = await Student.find({ college: session.college, workspace: req.workspaceId })
      .select('name email phone course customCourse branch customBranch')
      .sort({ name: 1 })
      .lean();
    const statusById = new Map(
      session.records.map(r => [String(r.student?._id || r.student), r.status])
    );

    res.json({
      ...session,
      roster: roster.map(s => ({ ...s, status: statusById.get(String(s._id)) || null }))
    });
  } catch (err) {
    console.error('[GET /api/attendance-sessions/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PATCH /api/attendance-sessions/:id ──────────────────────────────────────
// Edit a past session (used by the history editor's autosave). Body:
// { records: [{ studentId, status: 'Present'|'Absent'|null }], remarks, batch }
// Updates the per-student Attendance records, then appends the diff to the
// session's editHistory — previous values are never lost.
router.patch('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, workspace: req.workspaceId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const { college, date } = session;
    const records = Array.isArray(req.body.records) ? req.body.records : [];

    if (records.length) {
      const ids = [...new Set(records.map(r => r.studentId).filter(Boolean))];
      const students = await Student.find({ _id: { $in: ids }, college, workspace: req.workspaceId }).select('_id').lean();
      const validIds = new Set(students.map(s => String(s._id)));

      const ops = [];
      const clearIds = [];
      for (const r of records) {
        if (!r.studentId || !validIds.has(String(r.studentId))) continue;
        if (VALID_STATUS.includes(r.status)) {
          ops.push({
            updateOne: {
              filter: { student: r.studentId, date },
              update: {
                $set: { status: r.status, college, workspace: req.workspaceId, markedBy: req.admin?.email },
                $setOnInsert: { student: r.studentId, date }
              },
              upsert: true
            }
          });
        } else if (r.status === null || r.status === '' || r.status === undefined) {
          clearIds.push(r.studentId);
        }
      }
      if (clearIds.length) {
        ops.push({ deleteMany: { filter: { student: { $in: clearIds }, date } } });
      }
      if (ops.length) await Attendance.bulkWrite(ops, { ordered: false });
    }

    const updated = await syncSessionFromAttendance(req.workspaceId, college, date, req.admin?.email, {
      remarks: req.body.remarks,
      batch: req.body.batch
    });

    AuditLog.create({
      action: 'attendance.session.edit',
      entityType: 'AttendanceSession',
      entityId: session._id,
      admin: req.admin?.email,
      meta: { college, date, recordCount: records.length }
    }).catch(() => {});

    res.json({
      message: 'Saved',
      presentCount: updated.presentCount,
      absentCount: updated.absentCount,
      editCount: updated.editHistory.length,
      savedAt: new Date()
    });
  } catch (err) {
    console.error('[PATCH /api/attendance-sessions/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, workspace: req.workspaceId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    await Promise.all([
      Attendance.deleteMany({ college: session.college, date: session.date, workspace: req.workspaceId }),
      AttendanceSession.deleteOne({ _id: session._id })
    ]);

    AuditLog.create({
      action: 'attendance.session.delete',
      entityType: 'AttendanceSession',
      entityId: session._id,
      admin: req.admin?.email,
      meta: { college: session.college, date: session.date }
    }).catch(() => {});

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[DELETE /api/attendance-sessions/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
