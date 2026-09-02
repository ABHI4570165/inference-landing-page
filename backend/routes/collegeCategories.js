const router = require('express').Router();
const mongoose = require('mongoose');
const CollegeCategory = require('../models/CollegeCategory');
const College = require('../models/College');
const Workspace = require('../models/Workspace');
const Form = require('../models/Form');
const auth = require('../config/auth');
const requireWorkspace = require('../middleware/workspace');

const tidy = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
const key = v => tidy(v).toLowerCase();

// Resolve the workspace for the PUBLIC read below the same way /api/colleges
// does: an explicit header when the admin UI asks, otherwise the default
// intake workspace that the original un-tokened public links point at.
async function resolvePublicWorkspace(req) {
  const headerId = req.headers['x-workspace-id'];
  if (headerId && mongoose.isValidObjectId(headerId)) {
    const ws = await Workspace.findById(headerId).select('_id').lean();
    if (ws) return ws._id;
  }
  const intake = await Workspace.findOne({ isDefaultIntake: true }).select('_id').lean();
  return intake?._id || null;
}

// ── GET /api/college-categories — folders + how many colleges each holds ────
// Public in the same limited sense as GET /api/colleges: it exposes only
// folder names and counts for one workspace, which the Form Builder and the
// admin Colleges page both read.
router.get('/', async (req, res) => {
  try {
    const workspaceId = await resolvePublicWorkspace(req);
    if (!workspaceId) return res.json([]);

    const categories = await CollegeCategory.find({ workspace: workspaceId })
      .sort({ order: 1, name: 1 }).collation({ locale: 'en' }).lean();

    // One grouped count instead of a query per folder.
    const counts = await College.aggregate([
      { $match: { workspace: new mongoose.Types.ObjectId(String(workspaceId)) } },
      { $group: {
        _id: '$category',
        total: { $sum: 1 },
        needsReview: { $sum: { $cond: [{ $eq: ['$reviewed', false] }, 1, 0] } }
      } }
    ]);
    const byId = new Map(counts.map(c => [String(c._id), c]));

    res.json(categories.map(c => ({
      ...c,
      collegeCount: byId.get(String(c._id))?.total || 0,
      needsReviewCount: byId.get(String(c._id))?.needsReview || 0
    })));
  } catch (err) {
    console.error('[GET /api/college-categories]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/college-categories — create a folder ─────────────────────────
router.post('/', auth, requireWorkspace, async (req, res) => {
  try {
    const name = tidy(req.body?.name);
    if (!name) return res.status(400).json({ message: 'Folder name is required' });

    // Case-insensitive duplicate check — the unique index is case-sensitive,
    // so without this "MBA Colleges" and "MBA colleges" would both be allowed
    // and the admin would have two folders that look identical.
    const clash = (await CollegeCategory.find({ workspace: req.workspaceId }).select('name').lean())
      .find(c => key(c.name) === key(name));
    if (clash) return res.status(400).json({ message: `A folder called "${clash.name}" already exists` });

    const last = await CollegeCategory.findOne({ workspace: req.workspaceId }).sort({ order: -1 }).select('order').lean();

    const category = await CollegeCategory.create({
      workspace: req.workspaceId,
      name,
      description: tidy(req.body?.description),
      order: (last?.order ?? -1) + 1
    });
    res.status(201).json({ ...category.toObject(), collegeCount: 0, needsReviewCount: 0 });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A folder with this name already exists' });
    console.error('[POST /api/college-categories]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/college-categories/:id — rename / re-describe ─────────────────
router.put('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const update = {};
    if (req.body?.name !== undefined) {
      const name = tidy(req.body.name);
      if (!name) return res.status(400).json({ message: 'Folder name is required' });
      const clash = (await CollegeCategory.find({ workspace: req.workspaceId }).select('name').lean())
        .find(c => key(c.name) === key(name) && String(c._id) !== String(req.params.id));
      if (clash) return res.status(400).json({ message: `A folder called "${clash.name}" already exists` });
      update.name = name;
    }
    if (req.body?.description !== undefined) update.description = tidy(req.body.description);

    const category = await CollegeCategory.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspaceId }, update, { new: true, runValidators: true }
    ).lean();
    if (!category) return res.status(404).json({ message: 'Folder not found' });
    res.json(category);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A folder with this name already exists' });
    console.error('[PUT /api/college-categories/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/college-categories/:id ──────────────────────────────────────
// Deleting a folder must never silently delete the colleges inside it, nor
// leave forms pointing at a folder that no longer exists. So:
//   • a folder still holding colleges must either be emptied first, or the
//     caller must say where those colleges should go (?moveTo=<id>);
//   • a folder still referenced by a form's College field is refused outright,
//     naming the forms, because deleting it would empty those fields.
router.delete('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const category = await CollegeCategory.findOne({ _id: req.params.id, workspace: req.workspaceId });
    if (!category) return res.status(404).json({ message: 'Folder not found' });

    const usedBy = await Form.find({
      workspace: req.workspaceId,
      'fields.collegeCategory': category._id
    }).select('name').lean();
    if (usedBy.length) {
      return res.status(409).json({
        message: `This folder is used by ${usedBy.length} form(s): ${usedBy.map(f => f.name).join(', ')}. ` +
                 `Point those College fields at another folder first.`,
        code: 'IN_USE_BY_FORMS'
      });
    }

    const count = await College.countDocuments({ workspace: req.workspaceId, category: category._id });
    if (count) {
      const moveTo = req.query.moveTo;
      if (!moveTo) {
        return res.status(409).json({
          message: `This folder still holds ${count} college(s). Move them to another folder or delete them first.`,
          code: 'NOT_EMPTY',
          collegeCount: count
        });
      }
      if (!mongoose.isValidObjectId(moveTo)) return res.status(400).json({ message: 'Invalid destination folder' });
      const target = await CollegeCategory.findOne({ _id: moveTo, workspace: req.workspaceId }).lean();
      if (!target) return res.status(404).json({ message: 'Destination folder not found' });
      if (String(target._id) === String(category._id)) {
        return res.status(400).json({ message: 'Choose a different destination folder' });
      }

      // A college already present in the destination would violate the
      // { workspace, category, name } unique index, so those are dropped
      // rather than moved — the destination already lists that college.
      const targetNames = new Set(
        (await College.find({ workspace: req.workspaceId, category: target._id }).select('name').lean())
          .map(c => key(c.name))
      );
      const moving = await College.find({ workspace: req.workspaceId, category: category._id }).select('name').lean();
      const duplicates = moving.filter(c => targetNames.has(key(c.name))).map(c => c._id);
      const movable = moving.filter(c => !targetNames.has(key(c.name))).map(c => c._id);

      if (movable.length) {
        await College.updateMany({ _id: { $in: movable } }, { $set: { category: target._id } });
      }
      if (duplicates.length) {
        await College.deleteMany({ _id: { $in: duplicates } });
      }
    }

    await CollegeCategory.deleteOne({ _id: category._id });
    res.json({ message: 'Folder deleted' });
  } catch (err) {
    console.error('[DELETE /api/college-categories/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
