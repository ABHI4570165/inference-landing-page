const mongoose = require('mongoose');

// A single questionnaire question. Questions are stored in the database (never
// hard-coded) so admins can edit text/options/points, add new questions, or
// deactivate old ones without a code change.
const optionSchema = new mongoose.Schema({
  label:  { type: String, required: true, trim: true },
  // Score awarded when this option is selected (hidden from students)
  points: { type: Number, default: 0 }
}, { _id: false });

const counsellingQuestionSchema = new mongoose.Schema({
  // Which recruitment drive this questionnaire belongs to. Questions used to be
  // a single global set shared by every workspace, which meant a jewellery
  // drive and a sugar drive could not ask different things. Each workspace now
  // owns its own questionnaire; backfillCounsellingQuestions.js moved the
  // original 35 into the default-intake workspace, so nothing changed for it.
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },

  // Section grouping — e.g. key 'A', title 'About You'
  sectionKey:   { type: String, required: true, trim: true, index: true },
  sectionTitle: { type: String, required: true, trim: true },
  sectionNote:  { type: String, trim: true }, // e.g. "(basic profile — low weight)"

  // Ordering within the whole form (sections are ordered by the min order of
  // their questions, questions by this value)
  order: { type: Number, required: true, index: true },

  // Question code shown to admins (Q1, Q2 …) — also used as a stable key for
  // draft answers saved on the student's device. Unique per WORKSPACE, not
  // globally: every drive numbers its own questionnaire from Q1.
  code: { type: String, required: true, trim: true },

  text: { type: String, required: true, trim: true },

  type: {
    type: String,
    required: true,
    // 'rating' (a 1-5 scale) and 'yesno' are radios with a fixed option set;
    // they are separate types so the form can render a compact grid and a
    // two-button choice instead of five/two stacked radios.
    enum: ['radio', 'checkbox', 'text', 'textarea', 'rating', 'yesno'],
    default: 'radio'
  },

  // ── Optional question behaviour ──
  // All default to off, so every questionnaire that predates them behaves
  // exactly as it did.

  // Groups a question for topic-wise scoring (e.g. 'accounting').
  topic: { type: String, trim: true, default: '' },

  // Cap on a checkbox question ('choose up to 2'). 0 = no cap.
  maxSelect: { type: Number, default: 0 },

  // Hide this question when the named yes/no question was answered 'No'.
  skipIfNo: { type: String, trim: true, default: '' },

  // Selecting this option label clears every other selection ('None').
  clearsOthers: { type: String, trim: true, default: '' },

  // Never sent to a student; filled by the counsellor from the report page.
  counsellorOnly: { type: Boolean, default: false, index: true },

  // Present the options in a per-student order. Answers are stored and scored
  // by option TEXT, so reordering can never change a mark.
  shuffleOptions: { type: Boolean, default: false },

  // Character cap for a free-text answer. 0 = the model default.
  maxLength: { type: Number, default: 0 },

  // Pre-fill this answer from the student record ('name').
  prefill: { type: String, trim: true, default: '' },

  options: { type: [optionSchema], default: [] },

  // When true, an extra "Other (please type your answer)" free-text choice is
  // shown; its score is left for manual review (0 points automatically)
  allowOther: { type: Boolean, default: false },

  required: { type: Boolean, default: true },

  // Soft delete — inactive questions disappear from the form but historical
  // responses that reference them stay intact
  active: { type: Boolean, default: true, index: true },

  // Which AI/score metrics this question feeds (keeps scoring editable when
  // questions change). e.g. ['technicalReadiness', 'careerClarity']
  metricTags: { type: [String], default: [] }
}, { timestamps: true });

// One Q-code per workspace. The old global unique index on `code` is dropped by
// backfillCounsellingQuestions.js — leaving it would stop a second workspace
// ever having its own Q1.
counsellingQuestionSchema.index({ workspace: 1, code: 1 }, { unique: true });
counsellingQuestionSchema.index({ workspace: 1, order: 1 });

module.exports = mongoose.model('CounsellingQuestion', counsellingQuestionSchema);
