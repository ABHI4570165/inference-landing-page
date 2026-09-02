const mongoose = require('mongoose');

// Names are stored UPPERCASE and whitespace-collapsed. Doing it in a setter
// means every write path — single create, edit, and bulk import — normalises
// identically, so the list can never drift into a mix of "RV College",
// "RV COLLEGE" and "RV  College" that reads as three different institutions.
const normaliseName = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toUpperCase();
const tidy = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');

const collegeSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  // Which folder this college sits in — "Engineering Colleges", "MBA
  // Colleges", … See models/CollegeCategory.js. Every college has one;
  // backfillCollegeCategories.js moved pre-existing rows into the workspace's
  // default folder when categories were introduced.
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'CollegeCategory', index: true },

  // Where this row came from. 'candidate' means a student typed it into a
  // public form because their college was not on the list — those are the
  // rows an admin most wants to check, so they are flagged rather than
  // silently mixed in with the curated list.
  source:      { type: String, enum: ['admin', 'candidate'], default: 'admin', index: true },
  addedByName: { type: String, trim: true, default: '', maxLength: 200 },
  // Candidate-added rows land as false so the admin can find and vet them.
  reviewed:    { type: Boolean, default: true, index: true },

  name:     { type: String, required: true, trim: true, set: normaliseName },
  // Short institutional code (VTU-style "1RV", an internal reference, …).
  // Uppercased like the name so the list reads consistently; optional, and
  // NOT the identity — a college is still identified by its name.
  code:     { type: String, trim: true, set: normaliseName, maxLength: 20 },
  location: { type: String, trim: true, set: tidy },
  address:  { type: String, trim: true, set: tidy, maxLength: 300 }
}, { timestamps: true });

// Same college name may exist in more than one workspace, and in more than one
// FOLDER within a workspace — an institution that runs both an engineering and
// an MBA programme legitimately belongs in both lists — but never twice in the
// same folder. Because names are normalised above, this index also catches case
// and spacing variants of the same institution.
//
// Duplicates across folders are safe downstream: students store the college
// NAME, and both the attendance picker and its roster match on the normalised
// name (see utils/collegeMatch.js), so two rows sharing a name still resolve to
// one picker entry listing all of its students.
//
// The older { workspace, name } unique index is dropped by
// backfillCollegeCategories.js — leaving it in place would block exactly the
// cross-folder duplicates this index is meant to allow.
collegeSchema.index({ workspace: 1, category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('College', collegeSchema);
module.exports.normaliseName = normaliseName;
