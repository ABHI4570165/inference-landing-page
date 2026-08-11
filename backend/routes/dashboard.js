const router = require('express').Router();
const auth = require('../config/auth');
const requireWorkspace = require('../middleware/workspace');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const CounsellingResponse = require('../models/CounsellingResponse');
const CounsellingReport = require('../models/CounsellingReport');
const ReceptionCheckin = require('../models/ReceptionCheckin');
const Form = require('../models/Form');
const FormSubmission = require('../models/FormSubmission');
const { todayIST, startOfTodayIST } = require('../utils/dates');

// Last N calendar days (IST), oldest first — used for the attendance trend
function lastNDaysIST(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d));
  }
  return days;
}

// ── GET /api/admin/dashboard/summary — trimmed KPI set for the workspace
// dashboard. Scoped entirely to the active workspace (X-Workspace-Id) —
// never mixes data from other companies' drives.
router.get('/summary', auth, requireWorkspace, async (req, res) => {
  try {
    const ws = req.workspaceId;
    const today = todayIST();
    const startOfToday = startOfTodayIST();
    const trendDays = lastNDaysIST(14);

    const [
      studentCount, studentsToday, topColleges,
      attendanceToday, counsellingStatusCounts, pendingReports,
      receptionToday, attendanceTrendAgg,
      activeForms, formResponses, submissionsToday
    ] = await Promise.all([
      Student.countDocuments({ workspace: ws }),
      Student.countDocuments({ workspace: ws, createdAt: { $gte: startOfToday } }),
      Student.aggregate([
        { $match: { workspace: ws } },
        { $group: { _id: '$college', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 5 },
        { $project: { _id: 0, college: '$_id', count: 1 } }
      ]),
      Attendance.aggregate([
        { $match: { workspace: ws, date: today } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      CounsellingResponse.aggregate([
        { $match: { workspace: ws } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      CounsellingReport.countDocuments({ workspace: ws, status: { $in: ['pending', 'generating'] } }),
      ReceptionCheckin.countDocuments({ workspace: ws, date: today }),
      Attendance.aggregate([
        { $match: { workspace: ws, date: { $in: trendDays }, status: 'Present' } },
        { $group: { _id: '$date', count: { $sum: 1 } } }
      ]),
      Form.countDocuments({ workspace: ws, status: 'Active' }),
      FormSubmission.countDocuments({ workspace: ws }),
      FormSubmission.countDocuments({ workspace: ws, submittedAt: { $gte: startOfToday } })
    ]);

    // "Applications" spans both kinds of record — intake applications and
    // custom-form submissions — so this matches the Applications dashboard.
    const totalStudents = studentCount + formResponses;
    const todaysApplications = studentsToday + submissionsToday;

    const attendance = { present: 0, absent: 0 };
    attendanceToday.forEach(a => { if (a._id === 'Present') attendance.present = a.count; else if (a._id === 'Absent') attendance.absent = a.count; });

    const counselling = { submitted: 0, in_progress: 0 };
    counsellingStatusCounts.forEach(c => { counselling[c._id] = c.count; });

    const trendByDate = new Map(attendanceTrendAgg.map(d => [d._id, d.count]));
    const attendanceTrend = trendDays.map(date => ({ label: date, value: trendByDate.get(date) || 0 }));

    res.json({
      workspace: { id: req.workspace._id, companyName: req.workspace.companyName, recruitmentDriveName: req.workspace.recruitmentDriveName },
      totalStudents,
      todaysApplications,
      topColleges,
      attendanceToday: attendance,
      counsellingCompleted: counselling.submitted,
      counsellingInProgress: counselling.in_progress,
      pendingReports,
      receptionToday,
      attendanceTrend,
      activeForms,
      formResponses
    });
  } catch (err) {
    console.error('[GET /api/admin/dashboard/summary]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
