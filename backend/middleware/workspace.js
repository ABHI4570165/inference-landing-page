const mongoose = require('mongoose');
const Workspace = require('../models/Workspace');

// Every workspace-scoped admin route sits behind this AFTER `auth`. It never
// trusts the workspace id the frontend sends — it re-verifies against the
// database that the authenticated admin actually owns that workspace before
// req.workspaceId is set, so changing the id in devtools/network tab cannot
// pull another company's data.
module.exports = async function requireWorkspace(req, res, next) {
  const id = req.headers['x-workspace-id'];

  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Workspace context required', code: 'NO_WORKSPACE' });
  }

  try {
    const workspace = await Workspace.findOne({ _id: id, createdBy: req.admin.id }).lean();
    if (!workspace) {
      console.warn(
        `[SECURITY] Workspace access denied | admin=${req.admin?.email || 'unknown'} ` +
        `workspace=${id} | ${req.method} ${req.originalUrl}`
      );
      return res.status(403).json({ message: 'You do not have access to this workspace', code: 'WORKSPACE_FORBIDDEN' });
    }

    req.workspace = workspace;
    req.workspaceId = workspace._id;
    next();
  } catch (err) {
    console.error('[requireWorkspace]', err);
    res.status(500).json({ message: 'Server error' });
  }
};
