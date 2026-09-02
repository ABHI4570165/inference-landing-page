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

  try {
    // ── Legacy clients ──
    // Frontend builds deployed BEFORE multi-workspace support existed know
    // nothing about workspaces and send no header at all, so every admin
    // screen in them broke with a 400. They are treated exactly like the
    // original un-tokened public links (see routes/counselling.js,
    // reception.js, colleges.js): resolve to the default-intake workspace —
    // the same one backfillWorkspaces.js assigned all pre-workspace data to,
    // which is precisely the data those builds used to show.
    //
    // This only affects requests that carry NO header, i.e. requests that
    // could only have failed before. Current builds always send the header
    // (frontend/src/utils/api.js) and are routed exactly as they were.
    if (!id) {
      const intake = await Workspace.findOne({ isDefaultIntake: true }).lean();
      if (!intake) {
        return res.status(400).json({ message: 'Workspace context required', code: 'NO_WORKSPACE' });
      }
      req.workspace = intake;
      req.workspaceId = intake._id;
      req.legacyWorkspaceFallback = true;
      return next();
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Workspace context required', code: 'NO_WORKSPACE' });
    }

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
