const mongoose = require('mongoose');
const Workspace = require('../models/Workspace');

// Every workspace-scoped admin route sits behind this AFTER `auth`. It never
// trusts the workspace id the frontend sends — it re-verifies the id against
// the database before req.workspaceId is set, so changing the id in
// devtools/network tab cannot pull data for a workspace that does not exist.
//
// Access model: workspaces belong to the ORGANISATION, not to the individual
// admin who happened to create one. Every authenticated admin can open every
// workspace; `createdBy` is retained purely as an audit trail of who set it
// up. The isolation this system actually enforces is between workspaces —
// one recruitment drive's applications, colleges, attendance, reception,
// counselling and reports never leak into another — and that boundary is
// unchanged: it comes from req.workspaceId being applied to every query.
module.exports = async function requireWorkspace(req, res, next) {
  const id = req.headers['x-workspace-id'];

  if (!id || !mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Workspace context required', code: 'NO_WORKSPACE' });
  }

  try {
    const workspace = await Workspace.findById(id).lean();
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
