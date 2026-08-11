const router = require('express').Router();
const auth = require('../config/auth');
const Workspace = require('../models/Workspace');
const Student = require('../models/Student');
const CounsellingResponse = require('../models/CounsellingResponse');
const Form = require('../models/Form');
const ReceptionCheckin = require('../models/ReceptionCheckin');
const { generatePublicToken } = require('../utils/publicToken');

const VALID_STATUS = ['Active', 'Archived'];

// Real per-workspace counts for the workspace cards — never hardcoded.
// One aggregation per collection (grouped by workspace) instead of N queries
// per workspace, so this stays fast regardless of how many workspaces exist.
async function statsByWorkspace() {
  const [applications, counselling, forms, reception] = await Promise.all([
    Student.aggregate([{ $group: { _id: '$workspace', count: { $sum: 1 } } }]),
    CounsellingResponse.aggregate([
      { $group: { _id: { workspace: '$workspace', status: '$status' }, count: { $sum: 1 } } }
    ]),
    Form.aggregate([
      { $group: { _id: { workspace: '$workspace', status: '$status' }, count: { $sum: 1 } } }
    ]),
    ReceptionCheckin.aggregate([{ $group: { _id: '$workspace', count: { $sum: 1 } } }])
  ]);

  const appsByWs = new Map(applications.map(a => [String(a._id), a.count]));
  const counsellingByWs = new Map();
  counselling.forEach(c => {
    const key = String(c._id.workspace);
    const entry = counsellingByWs.get(key) || { completed: 0, pending: 0 };
    if (c._id.status === 'submitted') entry.completed = c.count;
    else if (c._id.status === 'in_progress') entry.pending = c.count;
    counsellingByWs.set(key, entry);
  });
  const formsByWs = new Map();
  forms.forEach(f => {
    const key = String(f._id.workspace);
    const entry = formsByWs.get(key) || { total: 0, active: 0 };
    entry.total += f.count;
    if (f._id.status === 'Active') entry.active = f.count;
    formsByWs.set(key, entry);
  });
  const receptionByWs = new Map(reception.map(r => [String(r._id), r.count]));

  return { appsByWs, counsellingByWs, formsByWs, receptionByWs };
}

// ── GET /api/workspaces — list this admin's workspaces with real stats ─────
router.get('/', auth, async (req, res) => {
  try {
    const [workspaces, { appsByWs, counsellingByWs, formsByWs, receptionByWs }] = await Promise.all([
      Workspace.find({ createdBy: req.admin.id }).sort({ createdAt: -1 }).lean(),
      statsByWorkspace()
    ]);

    const rows = workspaces.map(ws => {
      const id = String(ws._id);
      const counselling = counsellingByWs.get(id) || { completed: 0, pending: 0 };
      const forms = formsByWs.get(id) || { total: 0, active: 0 };
      return {
        ...ws,
        stats: {
          applications: appsByWs.get(id) || 0,
          counsellingCompleted: counselling.completed,
          counsellingPending: counselling.pending,
          forms: forms.total,
          activeForms: forms.active,
          receptionCheckins: receptionByWs.get(id) || 0
        }
      };
    });

    res.json({
      workspaces: rows,
      totals: {
        totalWorkspaces: rows.length,
        activeDrives: rows.filter(w => w.status === 'Active').length,
        totalApplications: rows.reduce((s, w) => s + w.stats.applications, 0),
        totalCounsellingCompleted: rows.reduce((s, w) => s + w.stats.counsellingCompleted, 0),
        totalActiveForms: rows.reduce((s, w) => s + w.stats.activeForms, 0)
      }
    });
  } catch (err) {
    console.error('[GET /api/workspaces]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/workspaces — create a new workspace ───────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const companyName = String(req.body.companyName || '').trim();
    const recruitmentDriveName = String(req.body.recruitmentDriveName || '').trim();
    const year = parseInt(req.body.year, 10);
    const description = String(req.body.description || '').trim();
    const status = VALID_STATUS.includes(req.body.status) ? req.body.status : 'Active';

    if (!companyName) return res.status(400).json({ message: 'Company name is required' });
    if (!recruitmentDriveName) return res.status(400).json({ message: 'Recruitment drive name is required' });
    if (!year || year < 2000 || year > 2100) return res.status(400).json({ message: 'A valid year is required' });

    const workspace = await Workspace.create({
      companyName, recruitmentDriveName, year, description, status,
      receptionToken: generatePublicToken('rcp'),
      counsellingToken: generatePublicToken('cns'),
      createdBy: req.admin.id
    });

    res.status(201).json({
      ...workspace.toObject(),
      stats: { applications: 0, counsellingCompleted: 0, counsellingPending: 0, forms: 0, activeForms: 0, receptionCheckins: 0 }
    });
  } catch (err) {
    console.error('[POST /api/workspaces]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/workspaces/:id ──────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findOne({ _id: req.params.id, createdBy: req.admin.id }).lean();
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/workspaces/:id — edit details ──────────────────────────────────
// Deliberately never touches receptionToken/counsellingToken — editing a
// workspace's name/year/status must never change its already-circulated
// public Reception/Counselling links.
router.put('/:id', auth, async (req, res) => {
  try {
    const allowed = ['companyName', 'recruitmentDriveName', 'year', 'description', 'status'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k] });
    if (update.year !== undefined) update.year = parseInt(update.year, 10);
    if (update.status !== undefined && !VALID_STATUS.includes(update.status)) {
      return res.status(400).json({ message: 'Status must be Active or Archived' });
    }

    const workspace = await Workspace.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.admin.id },
      update,
      { new: true, runValidators: true }
    );
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// ── PATCH /api/workspaces/:id/status — Active/Archived toggle ──────────────
router.patch('/:id/status', auth, async (req, res) => {
  try {
    if (!VALID_STATUS.includes(req.body.status)) {
      return res.status(400).json({ message: 'Status must be Active or Archived' });
    }
    const workspace = await Workspace.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.admin.id },
      { status: req.body.status },
      { new: true }
    );
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
