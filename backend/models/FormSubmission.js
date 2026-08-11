const mongoose = require('mongoose');

// One candidate's answers to one custom Form. Kept schema-flexible
// (responses is a plain object keyed by field id) since Form.fields defines
// the actual shape and can change over time — same "snapshot, don't rigidly
// couple" approach already used by CounsellingResponse.
const formSubmissionSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  form:      { type: mongoose.Schema.Types.ObjectId, ref: 'Form', required: true, index: true },

  responses: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Denormalised candidate summary, derived at submit time from the field
  // TYPES on the parent form (the first text/email/phone/college field). The
  // unified Applications dashboard lists custom-form submissions alongside
  // Student applications and needs the same four columns for both without
  // re-reading every form's schema per row. `responses` stays the source of
  // truth; this is only a projection of it.
  candidate: {
    name:    { type: String, default: '' },
    email:   { type: String, default: '' },
    phone:   { type: String, default: '' },
    college: { type: String, default: '' }
  },

  // The candidate this submission belongs to. Set when the form collected
  // enough identity to match or create a Student, which is what lets the
  // person continue into Attendance → Reception → Counselling → AI Report.
  // Null for forms that collect no identifying details (e.g. anonymous
  // feedback) — those remain response-only records.
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true, default: null },

  status: {
    type: String,
    enum: ['submitted', 'reviewed'],
    default: 'submitted'
  },

  submittedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

formSubmissionSchema.index({ workspace: 1, form: 1, submittedAt: -1 });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);
