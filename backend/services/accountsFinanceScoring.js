const { ANSWER_KEY, TOPICS } = require('../config/accountsFinanceAnswerKey');
const { SIGNATURE_CODES } = require('../config/accountsFinanceQuestions');

// ── Accounts & Finance scoring ──────────────────────────────────────────────
//
// Pure functions over a plain answer map — no database, no Mongoose — so the
// whole thing is unit-testable and can be recomputed cheaply whenever the
// counsellor edits Section G.
//
// Everything here runs on the SERVER only. The answer key is never sent to a
// browser, and the computed result is written onto the submission so reports
// load without recalculating.

const BANDS = [
  { min: 7, max: 8, band: 'A', label: 'Strong fundamentals' },
  { min: 5, max: 6, band: 'B', label: 'Good base, needs practice' },
  { min: 3, max: 4, band: 'C', label: 'Basic, needs structured training' },
  { min: 0, max: 2, band: 'D', label: 'Start with foundation module' }
];

const EXPOSURE_BY_DURATION = {
  'Less than 1 month': 1,
  '1–2 months': 2,
  '1-2 months': 2,      // tolerate a hyphen typed instead of an en dash
  '3+ months': 3
};

// Answers arrive as the CounsellingResponse.answers array. Normalise to
// { code: { selected: [labels], otherText } } so every helper below reads the
// same shape regardless of question type.
function toAnswerMap(answers) {
  const map = {};
  for (const a of Array.isArray(answers) ? answers : []) {
    map[a.code] = {
      selected: Array.isArray(a.selected) ? a.selected.filter(Boolean) : [],
      otherText: a.otherText || ''
    };
  }
  return map;
}

const first = (map, code) => (map[code]?.selected || [])[0] || '';
const many = (map, code) => map[code]?.selected || [];
// Ratings are stored as the option label ('1'…'5'); NaN when unanswered.
const rating = (map, code) => {
  const n = Number(first(map, code));
  return Number.isFinite(n) ? n : null;
};

// Does this response belong to the Accounts & Finance questionnaire at all?
// Everything downstream is gated on this so no other drive's submit is touched.
function isAccountsFinanceResponse(answers) {
  const map = toAnswerMap(answers);
  return SIGNATURE_CODES.every(code => Object.prototype.hasOwnProperty.call(map, code));
}

function bandFor(score) {
  return BANDS.find(b => score >= b.min && score <= b.max) || BANDS[BANDS.length - 1];
}

function scoreKnowledge(map) {
  const perQuestion = {};
  let total = 0;
  for (const [code, correct] of Object.entries(ANSWER_KEY)) {
    // Compared on the option TEXT, so shuffling options cannot change a mark.
    const got = first(map, code);
    const ok = got !== '' && got === correct;
    perQuestion[code] = ok ? 1 : 0;
    if (ok) total += 1;
  }

  const topics = {};
  for (const [key, { label, codes }] of Object.entries(TOPICS)) {
    const got = codes.reduce((n, c) => n + (perQuestion[c] || 0), 0);
    topics[key] = {
      label,
      score: got,
      outOf: codes.length,
      percent: Math.round((got / codes.length) * 100)
    };
  }

  const { band, label } = bandFor(total);
  return {
    total,
    outOf: Object.keys(ANSWER_KEY).length,
    percent: Math.round((total / Object.keys(ANSWER_KEY).length) * 100),
    band,
    bandLabel: label,
    topics,
    perQuestion
  };
}

// A student who rates themselves 4+ but scores at or below half on that topic
// is flagged — the gap is the useful counselling signal, not either number
// alone. Unanswered ratings produce no flag rather than a false one.
function selfVsActualFlags(map, knowledge) {
  const flags = [];
  const compare = (ratingCode, topicKey, message) => {
    const self = rating(map, ratingCode);
    const topic = knowledge.topics[topicKey];
    if (self === null || !topic) return;
    if (self >= 4 && topic.percent <= 50) {
      flags.push({
        code: ratingCode,
        topic: topicKey,
        selfRating: self,
        actualPercent: topic.percent,
        message
      });
    }
  };
  compare('C1', 'accounting', 'Overestimates accounting knowledge');
  compare('C2', 'taxation', 'Overestimates taxation knowledge');
  return flags;
}

function practicalExposure(map) {
  const didInternship = first(map, 'E1') === 'Yes';
  if (!didInternship) {
    return { score: 0, outOf: 3, label: 'No internship', duration: '' };
  }
  const duration = first(map, 'E3');
  const score = EXPOSURE_BY_DURATION[duration] ?? 0;
  return { score, outOf: 3, label: duration || 'Internship, duration not stated', duration };
}

// A student can match more than one role. Band C/D overrides everything: the
// recommendation is foundation training before placement, not a job title.
function suggestedRoles(map, knowledge) {
  const band = knowledge.band;
  const strongBand = band === 'A' || band === 'B';

  if (!strongBand) {
    return [{
      role: 'Foundation training before placement',
      why: `Knowledge band ${band} (${knowledge.total}/${knowledge.outOf}) — build fundamentals first.`,
      overrides: true
    }];
  }

  const interests = many(map, 'F1');
  const software = many(map, 'C6');
  const roles = [];

  if (software.includes('Tally Prime') && interests.includes('Accounts')) {
    roles.push({ role: 'Accounts Executive', why: `Band ${band}, uses Tally Prime, interested in Accounts.` });
  }
  if (knowledge.topics.taxation.score === knowledge.topics.taxation.outOf && interests.includes('Taxation')) {
    roles.push({ role: 'GST / Tax Associate', why: `Band ${band}, full marks in Taxation, interested in Taxation.` });
  }
  if (first(map, 'E2') === 'CA / Audit firm' && interests.includes('Audit')) {
    roles.push({ role: 'Audit Assistant', why: 'Interned at a CA / audit firm and interested in Audit.' });
  }
  if ((rating(map, 'C3') ?? 0) >= 4 && interests.includes('Financial analysis')) {
    roles.push({ role: 'MIS / Finance Trainee', why: `Excel self-rated ${rating(map, 'C3')}/5, interested in Financial analysis.` });
  }
  if (interests.includes('Banking') && (rating(map, 'C4') ?? 0) >= 4) {
    roles.push({ role: 'Banking Operations', why: `Interested in Banking, communication self-rated ${rating(map, 'C4')}/5.` });
  }

  if (!roles.length) {
    roles.push({
      role: 'General Accounts trainee',
      why: `Band ${band}, but no interest/skill combination matched a specific role.`
    });
  }
  return roles;
}

// The recommended track prefers the counsellor's own G3 when they have filled
// it — a person who met the candidate outranks the rubric.
function recommendedTrack(knowledge, counsellorSection) {
  const g3 = counsellorSection?.G3;
  if (g3) return { track: g3, source: 'counsellor' };
  const derived = knowledge.band === 'A' ? 'Placement-ready'
    : knowledge.band === 'B' ? 'Training + placement'
    : 'Foundation training';
  return { track: derived, source: 'derived' };
}

/**
 * Computes the whole scoring block for one submission.
 * @param {Array}  answers            CounsellingResponse.answers
 * @param {Object} counsellorSection  { G1, G2, G3, G4 } or null
 */
function computeScoring(answers, counsellorSection = null) {
  const map = toAnswerMap(answers);
  const knowledge = scoreKnowledge(map);
  const flags = selfVsActualFlags(map, knowledge);
  const exposure = practicalExposure(map);
  const roles = suggestedRoles(map, knowledge);
  const track = recommendedTrack(knowledge, counsellorSection);

  const counsellorFilled = !!(counsellorSection &&
    (counsellorSection.G1 || counsellorSection.G2 || counsellorSection.G3 || counsellorSection.G4));

  return {
    knowledge,
    selfVsActual: flags,
    practicalExposure: exposure,
    suggestedRoles: roles,
    recommendedTrack: track,
    counsellorReviewed: counsellorFilled,
    selfRatings: {
      C1: rating(map, 'C1'), C2: rating(map, 'C2'), C3: rating(map, 'C3'),
      C4: rating(map, 'C4'), C5: rating(map, 'C5')
    },
    profile: {
      qualification: first(map, 'A2'),
      yearOfPassing: first(map, 'A3'),
      marks: first(map, 'A4')
    },
    computedAt: new Date()
  };
}

module.exports = {
  computeScoring, isAccountsFinanceResponse,
  scoreKnowledge, selfVsActualFlags, practicalExposure, suggestedRoles,
  recommendedTrack, bandFor, toAnswerMap, BANDS
};
