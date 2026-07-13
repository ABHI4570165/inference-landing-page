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
  // Section grouping — e.g. key 'A', title 'About You'
  sectionKey:   { type: String, required: true, trim: true, index: true },
  sectionTitle: { type: String, required: true, trim: true },
  sectionNote:  { type: String, trim: true }, // e.g. "(basic profile — low weight)"

  // Ordering within the whole form (sections are ordered by the min order of
  // their questions, questions by this value)
  order: { type: Number, required: true, index: true },

  // Question code shown to admins (Q1, Q2 …) — also used as a stable key for
  // draft answers saved on the student's device
  code: { type: String, required: true, trim: true, unique: true },

  text: { type: String, required: true, trim: true },

  type: {
    type: String,
    required: true,
    enum: ['radio', 'checkbox', 'text', 'textarea'],
    default: 'radio'
  },

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

module.exports = mongoose.model('CounsellingQuestion', counsellingQuestionSchema);
