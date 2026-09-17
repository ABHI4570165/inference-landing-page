/*
 * Scoring and role-matching tests. Plain node, no framework:
 *     node services/accountsFinanceScoring.test.js
 * (also wired up as `npm test` in backend/package.json)
 */
const assert = require('assert');
const { ANSWER_KEY } = require('../config/accountsFinanceAnswerKey');
const {
  computeScoring, isAccountsFinanceResponse, scoreKnowledge,
  selfVsActualFlags, practicalExposure, suggestedRoles, toAnswerMap, bandFor
} = require('./accountsFinanceScoring');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n          ${e.message}`); }
}

// Build an answers array the way CounsellingResponse stores it.
const A = obj => Object.entries(obj).map(([code, v]) => ({
  code, selected: Array.isArray(v) ? v : [v], otherText: ''
}));

const allCorrectB = Object.fromEntries(Object.entries(ANSWER_KEY));
const allWrongB = Object.fromEntries(
  Object.keys(ANSWER_KEY).map(c => [c, 'DEFINITELY NOT THE ANSWER'])
);

// A baseline non-B answer set so responses look complete.
const BASE = {
  A1: 'Test Student', A2: 'B.Com', A3: '2026', A4: '60–70%',
  C1: '3', C2: '3', C3: '3', C4: '3', C5: '3', C6: ['Tally Prime'],
  D1: 'Yes', D2: 'Taxation / GST', D3: 'GST filing study',
  E1: 'Yes', E2: 'Corporate', E3: '1–2 months', E4: ['GST / TDS work'],
  F1: ['Accounts'], F2: 'Job', F3: 'Karnataka', F4: '₹15–20K',
  F5: 'Immediately', F6: 'Finance manager'
};

console.log('\n=== KNOWLEDGE SCORE ===');

test('all 8 correct → 8/8, band A', () => {
  const s = scoreKnowledge(toAnswerMap(A({ ...BASE, ...allCorrectB })));
  assert.strictEqual(s.total, 8);
  assert.strictEqual(s.band, 'A');
  assert.strictEqual(s.bandLabel, 'Strong fundamentals');
  assert.strictEqual(s.percent, 100);
});

test('all 8 wrong → 0/8, band D', () => {
  const s = scoreKnowledge(toAnswerMap(A({ ...BASE, ...allWrongB })));
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.band, 'D');
  assert.strictEqual(s.bandLabel, 'Start with foundation module');
});

test('unanswered Section B scores 0, never crashes', () => {
  const s = scoreKnowledge(toAnswerMap(A(BASE)));
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.band, 'D');
});

test('topic-wise split is 4 / 2 / 2', () => {
  const s = scoreKnowledge(toAnswerMap(A({ ...BASE, ...allCorrectB })));
  assert.strictEqual(s.topics.accounting.outOf, 4);
  assert.strictEqual(s.topics.taxation.outOf, 2);
  assert.strictEqual(s.topics.analysis.outOf, 2);
  assert.strictEqual(s.topics.accounting.score, 4);
});

test('every band boundary maps correctly', () => {
  const expect = { 8: 'A', 7: 'A', 6: 'B', 5: 'B', 4: 'C', 3: 'C', 2: 'D', 1: 'D', 0: 'D' };
  for (const [score, band] of Object.entries(expect)) {
    assert.strictEqual(bandFor(Number(score)).band, band, `score ${score}`);
  }
});

test('scored by option TEXT, so shuffling cannot change a mark', () => {
  // Same answers, options presented in a different order — identical score.
  const s1 = scoreKnowledge(toAnswerMap(A({ ...BASE, ...allCorrectB })));
  const shuffled = A({ ...BASE, ...allCorrectB }).reverse();
  const s2 = scoreKnowledge(toAnswerMap(shuffled));
  assert.strictEqual(s1.total, s2.total);
});

console.log('\n=== SELF vs ACTUAL FLAGS ===');

test('rates accounting 5 but scores 0/4 → flagged', () => {
  const map = toAnswerMap(A({ ...BASE, ...allWrongB, C1: '5' }));
  const flags = selfVsActualFlags(map, scoreKnowledge(map));
  assert.ok(flags.some(f => f.message === 'Overestimates accounting knowledge'));
});

test('rates taxation 4 but scores 0/2 → flagged', () => {
  const map = toAnswerMap(A({ ...BASE, ...allWrongB, C2: '4' }));
  const flags = selfVsActualFlags(map, scoreKnowledge(map));
  assert.ok(flags.some(f => f.message === 'Overestimates taxation knowledge'));
});

test('rates high AND scores high → no flag', () => {
  const map = toAnswerMap(A({ ...BASE, ...allCorrectB, C1: '5', C2: '5' }));
  assert.strictEqual(selfVsActualFlags(map, scoreKnowledge(map)).length, 0);
});

test('rates low and scores low → no flag (honest self-assessment)', () => {
  const map = toAnswerMap(A({ ...BASE, ...allWrongB, C1: '2', C2: '1' }));
  assert.strictEqual(selfVsActualFlags(map, scoreKnowledge(map)).length, 0);
});

test('exactly 50% on the topic still flags (boundary is inclusive)', () => {
  const half = { ...allWrongB, B4: ANSWER_KEY.B4 };   // taxation 1/2 = 50%
  const map = toAnswerMap(A({ ...BASE, ...half, C2: '4' }));
  assert.ok(selfVsActualFlags(map, scoreKnowledge(map))
    .some(f => f.topic === 'taxation'));
});

console.log('\n=== PRACTICAL EXPOSURE ===');

test('no internship → 0', () => {
  assert.strictEqual(practicalExposure(toAnswerMap(A({ ...BASE, E1: 'No' }))).score, 0);
});
test('less than 1 month → 1', () => {
  assert.strictEqual(practicalExposure(toAnswerMap(A({ ...BASE, E1: 'Yes', E3: 'Less than 1 month' }))).score, 1);
});
test('1–2 months → 2', () => {
  assert.strictEqual(practicalExposure(toAnswerMap(A({ ...BASE, E1: 'Yes', E3: '1–2 months' }))).score, 2);
});
test('3+ months → 3', () => {
  assert.strictEqual(practicalExposure(toAnswerMap(A({ ...BASE, E1: 'Yes', E3: '3+ months' }))).score, 3);
});
test('skipped internship ignores a stale E3 answer', () => {
  // E1 = No but E3 still carries a value from before the student changed it.
  const e = practicalExposure(toAnswerMap(A({ ...BASE, E1: 'No', E3: '3+ months' })));
  assert.strictEqual(e.score, 0);
  assert.strictEqual(e.label, 'No internship');
});

console.log('\n=== SUGGESTED ROLES ===');

const rolesOf = answers => suggestedRoles(
  toAnswerMap(A(answers)), scoreKnowledge(toAnswerMap(A(answers)))
).map(r => r.role);

test('band A + Tally Prime + Accounts → Accounts Executive', () => {
  assert.ok(rolesOf({ ...BASE, ...allCorrectB, C6: ['Tally Prime'], F1: ['Accounts'] })
    .includes('Accounts Executive'));
});

test('band A + taxation 2/2 + Taxation interest → GST / Tax Associate', () => {
  assert.ok(rolesOf({ ...BASE, ...allCorrectB, F1: ['Taxation'] })
    .includes('GST / Tax Associate'));
});

test('CA firm internship + Audit interest → Audit Assistant', () => {
  assert.ok(rolesOf({ ...BASE, ...allCorrectB, E1: 'Yes', E2: 'CA / Audit firm', F1: ['Audit'] })
    .includes('Audit Assistant'));
});

test('Excel 4+ and Financial analysis → MIS / Finance Trainee', () => {
  assert.ok(rolesOf({ ...BASE, ...allCorrectB, C3: '4', F1: ['Financial analysis'] })
    .includes('MIS / Finance Trainee'));
});

test('Banking interest + communication 4+ → Banking Operations', () => {
  assert.ok(rolesOf({ ...BASE, ...allCorrectB, C4: '5', F1: ['Banking'] })
    .includes('Banking Operations'));
});

test('a student can match MORE THAN ONE role', () => {
  const roles = rolesOf({
    ...BASE, ...allCorrectB, C3: '5', C6: ['Tally Prime'], F1: ['Accounts', 'Financial analysis']
  });
  assert.ok(roles.length >= 2, `got ${JSON.stringify(roles)}`);
  assert.ok(roles.includes('Accounts Executive') && roles.includes('MIS / Finance Trainee'));
});

test('band C OVERRIDES every other match', () => {
  // 4/8 = band C, but with a role-matching interest/skill combination.
  const four = { ...allWrongB, B1: ANSWER_KEY.B1, B2: ANSWER_KEY.B2, B3: ANSWER_KEY.B3, B6: ANSWER_KEY.B6 };
  const roles = rolesOf({ ...BASE, ...four, C6: ['Tally Prime'], F1: ['Accounts'] });
  assert.deepStrictEqual(roles, ['Foundation training before placement']);
});

test('band D also overrides', () => {
  const roles = rolesOf({ ...BASE, ...allWrongB, C6: ['Tally Prime'], F1: ['Accounts'] });
  assert.deepStrictEqual(roles, ['Foundation training before placement']);
});

test('"None" in C6 means no Tally-based role', () => {
  const roles = rolesOf({ ...BASE, ...allCorrectB, C6: ['None'], F1: ['Accounts'] });
  assert.ok(!roles.includes('Accounts Executive'), `got ${JSON.stringify(roles)}`);
});

test('strong band with no matching combination still returns something usable', () => {
  const roles = rolesOf({ ...BASE, ...allCorrectB, C6: ['None'], F1: ['Not sure'] });
  assert.strictEqual(roles.length, 1);
  assert.ok(/trainee/i.test(roles[0]));
});

console.log('\n=== WHOLE-SUBMISSION SCORING ===');

test('computeScoring assembles every block', () => {
  const s = computeScoring(A({ ...BASE, ...allCorrectB }));
  assert.strictEqual(s.knowledge.total, 8);
  assert.ok(Array.isArray(s.suggestedRoles) && s.suggestedRoles.length);
  assert.strictEqual(s.practicalExposure.score, 2);
  assert.strictEqual(s.profile.yearOfPassing, '2026');
  assert.strictEqual(s.counsellorReviewed, false);
});

test('unreviewed until the counsellor fills Section G', () => {
  const before = computeScoring(A({ ...BASE, ...allCorrectB }), null);
  const after = computeScoring(A({ ...BASE, ...allCorrectB }), { G3: 'Placement-ready' });
  assert.strictEqual(before.counsellorReviewed, false);
  assert.strictEqual(after.counsellorReviewed, true);
});

test("counsellor's G3 outranks the derived track", () => {
  const s = computeScoring(A({ ...BASE, ...allCorrectB }), { G3: 'Higher studies guidance' });
  assert.strictEqual(s.recommendedTrack.track, 'Higher studies guidance');
  assert.strictEqual(s.recommendedTrack.source, 'counsellor');
});

test('derived track when Section G is empty', () => {
  const s = computeScoring(A({ ...BASE, ...allCorrectB }));
  assert.strictEqual(s.recommendedTrack.track, 'Placement-ready');
  assert.strictEqual(s.recommendedTrack.source, 'derived');
});

console.log('\n=== QUESTIONNAIRE DETECTION (other drives must be untouched) ===');

test('recognises an Accounts & Finance submission', () => {
  assert.strictEqual(isAccountsFinanceResponse(A({ ...BASE, ...allCorrectB })), true);
});

test('does NOT claim another drive\'s submission', () => {
  const other = A({ Q1: 'Final year engineering student', Q2: 'Yes', Q34: 'A project' });
  assert.strictEqual(isAccountsFinanceResponse(other), false);
});

test('empty answers are not claimed', () => {
  assert.strictEqual(isAccountsFinanceResponse([]), false);
  assert.strictEqual(isAccountsFinanceResponse(undefined), false);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
