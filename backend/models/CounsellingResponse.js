const mongoose = require('mongoose');

// One student's counselling questionnaire — draft (autosaved) or submitted.
// Collection name kept as 'studentcounsellings' via the model name below.
const answerSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'CounsellingQuestion', required: true },
  code:     { type: String, required: true },     // Q1, Q2 … (stable key)
  // Snapshots so the response stays readable even if the question is edited later
  questionText: { type: String },
  sectionKey:   { type: String },
  type:         { type: String },

  // Selected option label(s) for radio/checkbox; free text for text/textarea
  selected:  { type: [String], default: [] },
  otherText: { type: String, trim: true },

  points: { type: Number, default: 0 }
}, { _id: false });

const counsellingResponseSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },

  // Denormalised for fast filtering / analytics
  college: { type: String, required: true, trim: true, index: true },
  branch:  { type: String, trim: true },
  batch:   { type: String, trim: true },

  // The attendance session and day that made this student eligible
  attendanceSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
    index: true,
    sparse: true
  },
  attendanceDate: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    index: true
  },
  aiReport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CounsellingReport',
    index: true,
    sparse: true
  },

  // Basic details entered on the verification screen
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },

  answers: { type: [answerSchema], default: [] },

  status: {
    type: String,
    enum: ['in_progress', 'submitted'],
    default: 'in_progress',
    index: true
  },

  completionPercent: { type: Number, default: 0 },
  totalScore:        { type: Number, default: 0 },
  maxScore:          { type: Number, default: 0 },

  lastSavedAt: { type: Date },
  submittedAt: { type: Date },

  // Admin unlock trail — unlocking flips status back to in_progress so the
  // student can revise and resubmit for the same attendance date
  unlockedBy: { type: String, trim: true },
  unlockedAt: { type: Date },

  // Free-text opinion typed by the GD (Group Discussion) counsellor after
  // meeting the student in person. Stored and shown verbatim — never passed
  // through the AI — alongside the AI-generated report on the admin detail page.
  gdCounsellorOpinion: {
    text:    { type: String, trim: true, maxLength: 5000 },
    addedBy: { type: String, trim: true },
    addedAt: { type: Date }
  }
}, { timestamps: true });

// One counselling response per student per attendance session/date
counsellingResponseSchema.index({ student: 1, attendanceDate: 1 }, { unique: true });
counsellingResponseSchema.index({ student: 1, attendanceSession: 1 }, { unique: true, sparse: true });
counsellingResponseSchema.index({ college: 1, status: 1 });
counsellingResponseSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('StudentCounselling', counsellingResponseSchema);
