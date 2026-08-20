const mongoose = require('mongoose');

// Names are stored UPPERCASE and whitespace-collapsed. Doing it in a setter
// means every write path — single create, edit, and bulk import — normalises
// identically, so the list can never drift into a mix of "RV College",
// "RV COLLEGE" and "RV  College" that reads as three different institutions.
const normaliseName = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toUpperCase();
const tidy = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');

const collegeSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  name:     { type: String, required: true, trim: true, set: normaliseName },
  // Short institutional code (VTU-style "1RV", an internal reference, …).
  // Uppercased like the name so the list reads consistently; optional, and
  // NOT the identity — a college is still identified by its name.
  code:     { type: String, trim: true, set: normaliseName, maxLength: 20 },
  location: { type: String, trim: true, set: tidy },
  address:  { type: String, trim: true, set: tidy, maxLength: 300 }
}, { timestamps: true });

// Same college name may exist in more than one workspace, but not twice
// within the same one. Because names are normalised above, this index also
// catches case and spacing variants of the same institution.
collegeSchema.index({ workspace: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('College', collegeSchema);
module.exports.normaliseName = normaliseName;
