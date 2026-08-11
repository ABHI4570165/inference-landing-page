const mongoose = require('mongoose');

// One attendance-taking session: a college roster marked on one date.
// Sessions are never overwritten — every save appends to editHistory, so the
// full history of who changed what (and when) is preserved.
const recordSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  status:  { type: String, enum: ['Present', 'Absent'], required: true }
}, { _id: false });

const changeSchema = new mongoose.Schema({
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: { type: String },
  from:        { type: String },  // 'Present' | 'Absent' | 'Not Marked'
  to:          { type: String }
}, { _id: false });

const editSchema = new mongoose.Schema({
  editedBy: { type: String, trim: true },
  editedAt: { type: Date, default: Date.now },
  changes:  { type: [changeSchema], default: [] }
}, { _id: false });

const attendanceSessionSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  college: { type: String, required: true, trim: true, index: true },
  date: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    index: true
  },
  batch:   { type: String, trim: true, default: '' },
  remarks: { type: String, trim: true, default: '' },

  // Admin email that created the session
  takenBy: { type: String, trim: true },

  // Current state of every marked student
  records: { type: [recordSchema], default: [] },

  // Denormalised counts for fast history listings
  presentCount: { type: Number, default: 0 },
  absentCount:  { type: Number, default: 0 },

  // Full audit trail of edits after creation
  editHistory: { type: [editSchema], default: [] }
}, { timestamps: true });

// One session per college per day PER WORKSPACE — two different companies
// can each run a session at the same college on the same date without
// colliding. Edits update the same session (with an audit entry) instead of
// creating duplicates or overwriting silently.
attendanceSessionSchema.index({ workspace: 1, college: 1, date: 1 }, { unique: true });
attendanceSessionSchema.index({ workspace: 1, date: -1, college: 1 });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
