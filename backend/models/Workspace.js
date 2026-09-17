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

  // What this drive is hiring and counselling FOR. The counselling report used
  // to assume every drive was recruiting Junior Data Analysts / Data Engineers,
  // because that was hard-coded into the AI prompt and the fallback engine — so
  // an accounts candidate was told to learn Pandas. The report now takes its
  // domain from here instead.
  //
  // Blank is allowed and safe: the report then stays domain-neutral and speaks
  // only from the candidate's own answers, rather than inventing a field.
  specialisation: { type: String, trim: true, default: '', maxLength: 120 },

  // Career paths that are plausible for THIS drive, offered to the report as
  // examples. Empty means the report infers paths purely from the answers.
  careerPaths: { type: [String], default: [] },

  // Which links in the candidate journey this drive actually enforces.
  //
  //     Registration -> Attendance -> Reception -> Counselling
  //
  // Registration is not listed because it is not optional: a candidate who has
  // no Student record cannot be found by any of the later steps. Each flag below
  // is one ARROW in that chain, and every one defaults to true, so a workspace
  // saved before this existed enforces the full standard flow.
  //
  // Read through services/candidateWorkflow.js, which is the single place these
  // are interpreted — both for the public gates and for the progress chain the
  // admin sees, so the two can never disagree.
  workflow: {
    attendanceForReception:   { type: Boolean, default: true },
    attendanceForCounselling: { type: Boolean, default: true },
    receptionForCounselling:  { type: Boolean, default: true }
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true }
}, { timestamps: true });

module.exports = mongoose.model('Workspace', workspaceSchema);
