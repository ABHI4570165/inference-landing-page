const mongoose = require('mongoose');

// A folder of colleges inside one workspace — "Engineering Colleges",
// "MBA Colleges", "Degree Colleges", whatever groupings a drive needs.
//
// Categories are fully dynamic and workspace-scoped. A college belongs to
// exactly ONE category, and a form's College field offers exactly one
// category's colleges — which is what keeps an MBA form from ever listing
// engineering colleges, and vice versa.
//
// Names keep the case the admin typed (unlike College, which is uppercased)
// because these are labels an admin reads in the UI rather than values matched
// against free-text student data.
const tidy = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');

const collegeCategorySchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  name:        { type: String, required: true, trim: true, set: tidy, maxLength: 120 },
  description: { type: String, trim: true, set: tidy, default: '', maxLength: 300 },

  // The folder that pre-existing colleges were moved into when categories were
  // introduced. Exactly one per workspace, and it cannot be deleted, so a
  // college always has somewhere to live. It CAN be renamed.
  isDefault: { type: Boolean, default: false, index: true },

  order: { type: Number, default: 0 }
}, { timestamps: true });

// Two folders in one workspace may not share a name. Different workspaces are
// free to each have their own "MBA Colleges".
collegeCategorySchema.index({ workspace: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CollegeCategory', collegeCategorySchema);
