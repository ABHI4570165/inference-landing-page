const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true },
  gender: {
    type: String,
    required: true,
    enum: ['Male', 'Female', 'Other']
  },
  email:  { type: String, required: true, trim: true, lowercase: true },
  phone:  { type: String, required: true, trim: true },

  // Aadhar — stored as string to preserve leading zeros, must be 12 digits
  aadhar: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{12}$/, 'Aadhar must be exactly 12 digits'],
    unique: true   // prevents duplicate applications via same Aadhar
  },

  country:       { type: String, required: true },
  state:         { type: String, required: true },
  city:          { type: String, required: true },
  address:       { type: String, trim: true },

  college:       { type: String, required: true },
  // customCollege removed — college must come from the admin-managed list

  course:        { type: String, required: true },
  customCourse:  { type: String, trim: true },
  branch:        { type: String, required: true },
  customBranch:  { type: String, trim: true },

  experience: {
    type: String,
    required: true,
    enum: ['Fresher', '0-3 Years', '3+ Years']
  },

  // Where the application came from.
  // Defaults to 'official_college' so legacy documents and the existing
  // form keep working without a migration.
  source: {
    type: String,
    enum: ['official_college', 'instagram'],
    required: true,
    default: 'official_college',
    index: true
  },

  selected_role: {
    type: String,
    required: true,
    enum: [
      'Junior Data Engineer',
      'Junior Data Scientist – Generative AI',
      'Sales Executive (Inside Sales / Junior Sales Track)'
    ],
    index: true
  },

  // Cloudinary fields
  resumeUrl:            { type: String, required: true },
  cloudinary_public_id: { type: String, required: true },
  resume_original_name: { type: String, required: true },
  resume_file_size:     { type: Number, required: true },
  resume_mime_type:     { type: String, required: true },
  uploaded_at:          { type: Date, required: true, default: Date.now, index: true }

}, { timestamps: true });

// Compound unique index: one application per (aadhar + role)
// If you want to allow the same person to apply for multiple roles, remove this
// and keep only the aadhar unique index above.
// studentSchema.index({ aadhar: 1, selected_role: 1 }, { unique: true });

module.exports = mongoose.model('Student', studentSchema);