const router = require('express').Router();
const mongoose = require('mongoose');
const College = require('../models/College');
const Workspace = require('../models/Workspace');
const auth = require('../config/auth');
const requireWorkspace = require('../middleware/workspace');

// Public: GET all colleges. Used by both the public application forms (no
// admin session — falls back to the default intake workspace) and the admin
// Colleges page (sends X-Workspace-Id like every other admin request, so it
// sees the currently selected workspace's list instead).
router.get('/', async (req, res) => {
  try {
    const headerId = req.headers['x-workspace-id'];
    let workspaceId = null;

    if (headerId && mongoose.isValidObjectId(headerId)) {
      const ws = await Workspace.findById(headerId).select('_id').lean();
      if (ws) workspaceId = ws._id;
    }
    if (!workspaceId) {
      const intake = await Workspace.findOne({ isDefaultIntake: true }).select('_id').lean();
      workspaceId = intake?._id || null;
    }
    if (!workspaceId) return res.json([]);

    const colleges = await College.find({ workspace: workspaceId }).sort({ name: 1 });
    res.json(colleges);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: POST create college
router.post('/', auth, requireWorkspace, async (req, res) => {
  try {
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ message: 'College name is required' });
    const college = await College.create({ name, location, workspace: req.workspaceId });
    res.status(201).json(college);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'College already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: PUT update college
router.put('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const { name, location } = req.body;
    const college = await College.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspaceId }, { name, location }, { new: true }
    );
    if (!college) return res.status(404).json({ message: 'College not found' });
    res.json(college);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: DELETE college
router.delete('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const college = await College.findOneAndDelete({ _id: req.params.id, workspace: req.workspaceId });
    if (!college) return res.status(404).json({ message: 'College not found' });
    res.json({ message: 'College deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
