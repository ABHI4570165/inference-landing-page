// ── SERVER ONLY — the Section B answer key ──────────────────────────────────
//
// This file must never be reachable from anything that serialises to the
// browser. It is required by services/accountsFinanceScoring.js alone; the
// public form payload is built by publicQuestion() in routes/counselling.js,
// which sends option LABELS only and never option points.
//
// Answers are stored as the option TEXT, not a position, because Section B
// options are shuffled per student — scoring by index would mark the wrong
// answer correct for everyone whose options were reordered.

const ANSWER_KEY = {
  B1: 'Assets = Liabilities + Capital',
  B2: 'Dr Machinery, Cr Cash',
  B3: 'Current liability',
  B4: 'CGST + SGST',
  B5: 'Tax Deducted at Source',
  B6: 'Cash book (bank column) and Bank passbook',
  B7: 'Current assets ÷ Current liabilities',
  B8: '40%'
};

// Which knowledge questions roll up into each topic score.
const TOPICS = {
  accounting: { label: 'Accounting', codes: ['B1', 'B2', 'B3', 'B6'] },
  taxation:   { label: 'Taxation',   codes: ['B4', 'B5'] },
  analysis:   { label: 'Analysis',   codes: ['B7', 'B8'] }
};

module.exports = { ANSWER_KEY, TOPICS };
