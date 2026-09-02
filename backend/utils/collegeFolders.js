const mongoose = require('mongoose');
const CollegeCategory = require('../models/CollegeCategory');

// Every college has to live in a folder. Callers that do not name one — the
// older single-list API, a College field that was never pointed at a folder, a
// candidate adding their own college on such a field — resolve to the
// workspace's default folder, which is created on demand so there is always
// somewhere valid to put a college.
//
// Shared by routes/colleges.js and routes/publicForms.js so both create that
// folder identically instead of drifting apart.
async function resolveCategory(workspaceId, categoryId) {
  if (categoryId) {
    if (!mongoose.isValidObjectId(categoryId)) return { error: 'Invalid folder' };
    const found = await CollegeCategory.findOne({ _id: categoryId, workspace: workspaceId }).lean();
    if (!found) return { error: 'Folder not found' };
    return { category: found };
  }

  let fallback = await CollegeCategory.findOne({ workspace: workspaceId, isDefault: true }).lean();
  if (!fallback) {
    // A workspace may already have folders without a default one (all created
    // by hand). Reuse the first rather than adding a stray "All Colleges".
    fallback = await CollegeCategory.findOne({ workspace: workspaceId })
      .sort({ order: 1, createdAt: 1 }).lean();
  }
  if (!fallback) {
    fallback = (await CollegeCategory.create({
      workspace: workspaceId,
      name: 'All Colleges',
      description: 'Default folder.',
      isDefault: true,
      order: 0
    })).toObject();
  }
  return { category: fallback };
}

module.exports = { resolveCategory };
