const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  // Denormalised from the student for direct workspace-scoped queries
  // without a populate/lookup on every read.
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  // The student this attendance record belongs to
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },

  // College name is denormalised so college-wise summaries don't need a join.
  // Kept in sync with the student's college at the time the record is created.
  college: { type: String, required: true, trim: true, index: true },

  // Attendance day as a plain 'YYYY-MM-DD' string. Storing the calendar day as
  // a string avoids timezone drift that a Date would introduce.
  date: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    index: true
  },

  status: {
    type: String,
    required: true,
    enum: ['Present', 'Absent']
  },

  // Admin email that recorded / last changed this entry (audit trail)
  markedBy: { type: String, trim: true }
}, { timestamps: true });

// One attendance record per student per day — re-marking updates in place
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
