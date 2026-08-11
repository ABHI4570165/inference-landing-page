const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name: { type: String, required: true, trim: true },
  location: { type: String, trim: true }
}, { timestamps: true });

// Same college name may exist in more than one workspace, but not twice
// within the same one.
collegeSchema.index({ workspace: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('College', collegeSchema);
