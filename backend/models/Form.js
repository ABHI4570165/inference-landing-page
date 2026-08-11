const mongoose = require('mongoose');

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'date', 'dropdown', 'radio', 'checkbox', 'textarea', 'file', 'college'];

const fieldSchema = new mongoose.Schema({
  type:        { type: String, enum: FIELD_TYPES, required: true },
  label:       { type: String, required: true, trim: true, maxLength: 200 },
  placeholder: { type: String, trim: true, default: '', maxLength: 200 },
  required:    { type: Boolean, default: false },
  // Only meaningful for dropdown/radio/checkbox
  options:     { type: [String], default: [] },
  // Only meaningful for type 'college' — which of the workspace's EXISTING
  // colleges (Workspace → Colleges) are offered on this specific field.
  // References the College collection; never stores college names here, so
  // there is exactly one source of truth for what a college is called.
  selectedCollegeIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'College', default: [] },
  order:       { type: Number, default: 0 }
}, { _id: true });

// A custom recruitment form belonging to one workspace — the generic
// counterpart to the specialized Reception/Counselling flows, for whatever
// ad-hoc data an admin wants to collect for a specific drive.
const formSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  name:        { type: String, required: true, trim: true, maxLength: 200 },
  description: { type: String, trim: true, default: '', maxLength: 1000 },

  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true
  },

  // 'custom'  — built in the Form Builder, submitted through /form/<publicSlug>.
  // 'legacy'  — a Form record materialised for application data that predates
  //             the Forms module (the hard-coded /apply intake channels). It
  //             exists so EVERY application in the system belongs to a real,
  //             renameable Form record instead of a hard-coded label, which is
  //             what makes the Applications dashboard fully dynamic. Its
  //             fields are fixed by the Student schema, so the Form Builder
  //             never edits them.
  origin: {
    type: String,
    enum: ['custom', 'legacy'],
    default: 'custom',
    index: true
  },

  // For origin === 'legacy' only: which Student.source this form represents.
  // The pairing (workspace, legacySource) is what the migration and the
  // public intake endpoints look up — never the form NAME, so renaming a
  // legacy form is safe and changes nothing but the display label.
  legacySource: { type: String, default: null },

  // Unguessable public URL segment — /form/<publicSlug>. Never the form name.
  publicSlug: { type: String, required: true, unique: true, index: true },

  fields: { type: [fieldSchema], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }
}, { timestamps: true });

formSchema.index({ workspace: 1, status: 1 });
formSchema.index({ workspace: 1, legacySource: 1 });

module.exports = mongoose.model('Form', formSchema);
module.exports.FIELD_TYPES = FIELD_TYPES;
