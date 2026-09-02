// ── Matching a candidate's college to the picker's college ──────────────────
//
// A candidate's `college` is free text: it is whatever their application form
// captured, and the same institution reaches us as "JSS COLLEGE", "jss college"
// or "JSS  College" depending on who typed it and when. The attendance picker,
// meanwhile, shows ONE spelling per institution — it de-duplicates
// case-insensitively and prefers the managed Colleges list's version.
//
// Matching the roster byte-exactly therefore drops candidates silently: the
// admin picks "jss college", the student stored as "JSS COLLEGE" is not
// returned, so they can never be marked Present — and because Present is what
// unlocks the rest of the workflow (see services/candidateWorkflow.js), they
// are locked out of Reception and Counselling as well, with nothing on screen
// explaining why.
//
// So every roster lookup compares the NORMALISED name instead.

const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normaliseCollege = v =>
  String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();

// Mongo condition for "this college, however it happens to be spelled".
// Anchored so it stays an equality test — "BGS College" must never match
// "BGS College of Engineering" — but case-insensitive and tolerant of
// differing inner whitespace.
function collegeCondition(name) {
  const wanted = normaliseCollege(name);
  const pattern = '^\\s*' + escapeRegex(wanted).replace(/ /g, '\\s+') + '\\s*$';
  return new RegExp(pattern, 'i');
}

const sameCollege = (a, b) => normaliseCollege(a) === normaliseCollege(b);

module.exports = { normaliseCollege, collegeCondition, sameCollege };
