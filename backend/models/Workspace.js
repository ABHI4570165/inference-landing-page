const mongoose = require('mongoose');

// One recruitment drive / company. Every recruitment-specific record
// (Student, Attendance, AttendanceSession, College, CounsellingResponse,
// CounsellingReport, ReceptionCheckin) carries a `workspace` reference so
// data from different companies never mixes — enforced in every query, not
// just the UI.
const workspaceSchema = new mongoose.Schema({
  companyName:           { type: String, required: true, trim: true, maxLength: 200 },
  recruitmentDriveName:  { type: String, required: true, trim: true, maxLength: 200 },
  year:                  { type: Number, required: true },
  description:           { type: String, trim: true, default: '', maxLength: 1000 },

  status: {
    type: String,
    enum: ['Active', 'Archived'],
    default: 'Active',
    index: true
  },

  // The one workspace the ORIGINAL, un-tokened public application forms
  // (/apply/..., bare /reception, bare /counselling) resolve to — those
  // links were already circulated for the live drive before workspaces
  // existed, so they keep working forever without a token. Exactly one
  // workspace should have this true.
  isDefaultIntake: { type: Boolean, default: false, index: true },

  // Per-workspace public tokens — every workspace (including new ones) gets
  // its own unguessable Reception and Counselling link/QR, e.g.
  // /reception/<receptionToken>, /counselling/<counsellingToken>. Sparse so
  // the unique index doesn't collide on workspaces created before this
  // existed (backfilled by the migration instead).
  receptionToken:   { type: String, unique: true, sparse: true, index: true },
  counsellingToken: { type: String, unique: true, sparse: true, index: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model('Workspace', workspaceSchema);
