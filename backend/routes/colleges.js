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

    const colleges = await College.find({ workspace: workspaceId })
      .sort({ name: 1 }).collation({ locale: 'en' });
    res.json(colleges);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: POST create college
router.post('/', auth, requireWorkspace, async (req, res) => {
  try {
    const { name, location, address } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ message: 'College name is required' });
    // The model normalises name to UPPERCASE and collapses whitespace.
    const college = await College.create({ name, location, address, workspace: req.workspaceId });
    res.status(201).json(college);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'This college is already in the list' });
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Admin: POST /api/colleges/bulk — add many at once ──────────────────────
// Adding a hundred colleges one at a time is the actual bottleneck, so this
// takes the whole list in one request. It is deliberately additive and
// idempotent: a college already present is reported as skipped rather than
// duplicated or overwritten, so the same list can be pasted twice safely.
router.post('/bulk', auth, requireWorkspace, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.colleges) ? req.body.colleges : null;
    if (!rows) return res.status(400).json({ message: 'Send { colleges: [ { name, location, address } ] }' });
    if (!rows.length) return res.status(400).json({ message: 'No colleges to add' });
    if (rows.length > 1000) return res.status(400).json({ message: 'Please add at most 1000 colleges at a time' });

    // Existing colleges are left exactly as they are — including their original
    // casing. New entries arrive UPPERCASE, so the "already present" check
    // compares case-insensitively; otherwise importing "RV COLLEGE" alongside an
    // existing "RV College" would create a second entry for one institution.
    const existing = new Set(
      (await College.find({ workspace: req.workspaceId }).select('name').lean())
        .map(c => String(c.name).trim().replace(/\s+/g, ' ').toUpperCase())
    );

    const seen = new Set();
    const toInsert = [];
    const skipped = [];
    const invalid = [];

    for (const row of rows) {
      const name = College.normaliseName(row?.name);
      if (!name) { invalid.push(row?.name ?? ''); continue; }
      if (existing.has(name)) { skipped.push(name); continue; }   // already in the list
      if (seen.has(name)) { skipped.push(name); continue; }       // repeated within this paste
      seen.add(name);
      toInsert.push({
        workspace: req.workspaceId,
        name,
        location: row?.location || '',
        address: row?.address || ''
      });
    }

    let created = [];
    if (toInsert.length) {
      // ordered:false so one unexpected clash cannot abort the whole import
      created = await College.insertMany(toInsert, { ordered: false }).catch(err => err.insertedDocs || []);
    }

    const all = await College.find({ workspace: req.workspaceId })
      .sort({ name: 1 }).collation({ locale: 'en' }).lean();

    res.status(201).json({
      added: created.length,
      skipped: skipped.length,
      invalid: invalid.length,
      skippedNames: skipped.slice(0, 25),
      colleges: all
    });
  } catch (err) {
    console.error('[POST /api/colleges/bulk]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: PUT update college
router.put('/:id', auth, requireWorkspace, async (req, res) => {
  try {
    const { name, location, address } = req.body;
    const update = {};
    if (name !== undefined)     update.name = name;         // setter uppercases
    if (location !== undefined) update.location = location;
    if (address !== undefined)  update.address = address;
    const college = await College.findOneAndUpdate(
      { _id: req.params.id, workspace: req.workspaceId }, update, { new: true, runValidators: true }
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
