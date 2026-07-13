const Attendance = require('../models/Attendance');
const AttendanceSession = require('../models/AttendanceSession');
const Student = require('../models/Student');

// Keeps the historical AttendanceSession in sync with the per-student
// Attendance records for one (college, date). Called after every save from
// the marking screen or the history editor. Never overwrites history — any
// difference from the previous state is appended to editHistory.
async function syncSessionFromAttendance(college, date, adminEmail, extras = {}) {
  const rows = await Attendance.find({ college, date }).select('student status').lean();
  const newRecords = rows.map(r => ({ student: r.student, status: r.status }));
  const presentCount = newRecords.filter(r => r.status === 'Present').length;
  const absentCount = newRecords.length - presentCount;

  let session = await AttendanceSession.findOne({ college, date });

  if (!session) {
    session = await AttendanceSession.create({
      college, date,
      takenBy: adminEmail,
      records: newRecords,
      presentCount, absentCount,
      batch: extras.batch || '',
      remarks: extras.remarks || ''
    });
    return session;
  }

  // Diff previous vs new state for the audit trail
  const oldByStudent = new Map(session.records.map(r => [String(r.student), r.status]));
  const newByStudent = new Map(newRecords.map(r => [String(r.student), r.status]));
  const changedIds = new Set();
  for (const [id, status] of newByStudent) {
    if (oldByStudent.get(id) !== status) changedIds.add(id);
  }
  for (const id of oldByStudent.keys()) {
    if (!newByStudent.has(id)) changedIds.add(id);
  }

  if (changedIds.size > 0) {
    const students = await Student.find({ _id: { $in: [...changedIds] } }).select('name').lean();
    const nameById = new Map(students.map(s => [String(s._id), s.name]));
    session.editHistory.push({
      editedBy: adminEmail,
      editedAt: new Date(),
      changes: [...changedIds].map(id => ({
        student: id,
        studentName: nameById.get(id) || 'Unknown',
        from: oldByStudent.get(id) || 'Not Marked',
        to: newByStudent.get(id) || 'Not Marked'
      }))
    });
  }

  session.records = newRecords;
  session.presentCount = presentCount;
  session.absentCount = absentCount;
  if (extras.batch !== undefined)   session.batch = extras.batch;
  if (extras.remarks !== undefined) session.remarks = extras.remarks;
  await session.save();
  return session;
}

module.exports = { syncSessionFromAttendance };
