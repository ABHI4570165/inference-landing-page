const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  // Which recruitment drive / company this application belongs to.
  // Isolation boundary — every read/write is scoped by this field.
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  // ── Identity ──
  // A candidate can now enter the drive two ways: the fixed intake
  // application form (which collects every field below and validates them in
  // routes/students.js BEFORE saving), or a Custom Form built in the Form
  // Builder, which only collects whatever fields the admin chose. The
  // route-level validation for the intake form is unchanged; the schema-level
  // `required` flags below were relaxed so that a candidate registering
  // through a custom form can still become a real Student and therefore flow
  // through Attendance → Reception → Counselling → AI Report. Existing
  // documents are unaffected — they already carry all of these fields.
  name:   { type: String, required: true, trim: true },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  email:  { type: String, trim: true, lowercase: true },
  phone:  { type: String, trim: true },

  // Aadhar — stored as string to preserve leading zeros, must be 12 digits
  // when present. Uniqueness is enforced per-workspace by a partial index
  // that only covers documents where aadhar is actually a string, so
  // candidates who never supplied one never collide.
  aadhar: {
    type: String,
    trim: true,
    match: [/^\d{12}$/, 'Aadhar must be exactly 12 digits']
  },

  country:       { type: String },
  state:         { type: String },
  city:          { type: String },
  address:       { type: String, trim: true },

  college:       { type: String },
  // customCollege removed — college must come from the admin-managed list

  course:        { type: String },
  customCourse:  { type: String, trim: true },
  branch:        { type: String },
  customBranch:  { type: String, trim: true },

  experience: {
    type: String,
    enum: ['Fresher', '0-3 Years', '3+ Years']
  },

  // Which Form this application came through — the ONLY thing the
  // Applications dashboard groups, filters and labels by. Every application
  // (including the pre-Forms intake channels, via the legacy Form records
  // created by backfillApplicationForms) carries one, so category names are
  // always read from live Form documents rather than hard-coded anywhere.
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', index: true },

  // Legacy intake channel this record arrived through. Retained only so the
  // pre-Forms public links (/apply/..., /apply/ig-..., /apply/mt-...) can
  // resolve to the right Form; nothing displays or filters on it.
  source: {
    type: String,
    enum: ['official_college', 'instagram', 'missed_test'],
    required: true,
    default: 'official_college',
    index: true
  },

  selected_role: {
    type: String,
    enum: [
      'Junior Data Engineer',
      'Junior Data Scientist – Generative AI',
      'Sales Executive (Inside Sales / Junior Sales Track)'
    ],
    index: true
  },

  // Cloudinary fields — present for intake applications (which require a
  // resume upload); absent for candidates who registered through a custom
  // form that did not ask for one. The resume proxy already 404s when
  // resumeUrl is missing.
  resumeUrl:            { type: String },
  cloudinary_public_id: { type: String },
  resume_original_name: { type: String },
  resume_file_size:     { type: Number },
  resume_mime_type:     { type: String },
  uploaded_at:          { type: Date, required: true, default: Date.now, index: true }

  // Reception registration fields
  ,registrationStatus: {
    type: String,
    enum: ['NOT_REGISTERED', 'REGISTERED'],
    default: 'NOT_REGISTERED',
    index: true
  },
  registrationTime: { type: Date },
  registrationPhoto: { type: String },
  registrationPhotoPublicId: { type: String },

  // Counselling status
  counsellingStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED'],
    default: 'PENDING',
    index: true
  }

}, { timestamps: true });

// One application per Aadhar per workspace — the isolation boundary means the
// same Aadhar can appear once in each company's drive, but never twice within one.
studentSchema.index({ workspace: 1, aadhar: 1 }, { unique: true });
studentSchema.index({ workspace: 1, email: 1 });
studentSchema.index({ workspace: 1, college: 1 });

module.exports = mongoose.model('Student', studentSchema);