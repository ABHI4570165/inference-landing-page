const mongoose = require('mongoose');

// AI-generated counselling report for one submitted response.
// Kept in its own collection so heavy report text never bloats list queries.
const scoreSchema = new mongoose.Schema({
  careerClarity:          { type: Number, min: 0, max: 100 },
  confidence:             { type: Number, min: 0, max: 100 },
  technicalReadiness:     { type: Number, min: 0, max: 100 },
  learningAttitude:       { type: Number, min: 0, max: 100 },
  placementReadiness:     { type: Number, min: 0, max: 100 },
  communicationReadiness: { type: Number, min: 0, max: 100 },
  motivation:             { type: Number, min: 0, max: 100 },
  riskLevel:              { type: Number, min: 0, max: 100 }, // higher = riskier
  overall:                { type: Number, min: 0, max: 100 }
}, { _id: false });

const counsellingReportSchema = new mongoose.Schema({
  response: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentCounselling',
    required: true,
    unique: true
  },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },

  status: {
    type: String,
    enum: ['pending', 'generating', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  error: { type: String },

  // Narrative sections
  overallPersonality: { type: String },
  technicalInterest:  { type: String },
  careerReadiness:    { type: String },
  strengths:          { type: [String], default: [] },
  weaknesses:         { type: [String], default: [] },
  behaviourAnalysis: {
    learningStyle:  String,
    problemSolving: String,
    decisionMaking: String,
    confidence:     String,
    riskTaking:     String,
    leadership:     String,
    teamWork:       String,
    communication:  String,
    adaptability:   String
  },
  careerFit: [{
    _id: false,
    path:   String,
    reason: String
  }],
  trainingRecommendation: {
    courses:        { type: [String], default: [] },
    skills:         { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    projects:       { type: [String], default: [] },
    softSkills:     { type: [String], default: [] },
    interviewPrep:  { type: [String], default: [] },
    timeline:       String
  },
  // 300–500 word final paragraph written for the counsellor
  counsellorRecommendation: { type: String },
  learningBehaviour: { type: String },
  confidenceAnalysis: { type: String },
  skillGapAnalysis: { type: String },
  recommendedCareerPath: { type: String },
  recommendedTrainingPlan: { type: String },

  // Dedicated section synthesizing the student's college project (Q34) and
  // final-year internship (Q35) answers — kept separate from the general
  // narrative sections above since it's grounded in two specific questions.
  practicalExperience: { type: String },

  scores: { type: scoreSchema, default: {} },

  aiStatus: { type: String, enum: ['Completed', 'Fallback'], index: true },
  reportSource: { type: String, index: true },
  generatedBy: { type: String },
  fallbackReason: { type: String },
  aiModel:     { type: String },
  generatedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('CounsellingReport', counsellingReportSchema);
