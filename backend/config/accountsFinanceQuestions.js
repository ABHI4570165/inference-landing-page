// ── Accounts & Finance counselling questionnaire ────────────────────────────
//
// The single source of truth for this questionnaire. The seeder turns these
// into CounsellingQuestion documents for one workspace; the form UI renders
// whatever the database returns, so editing a question here (and re-seeding) or
// in the admin Question Editor changes the form without touching any component.
//
// CORRECT ANSWERS ARE NOT IN THIS FILE. They live in accountsFinanceAnswerKey.js,
// which is required only by the scoring service — never by anything that
// serialises to the browser.
//
// Field notes:
//   topic         — groups Section B for topic-wise scoring (see the scoring service)
//   maxSelect     — cap on a multi-select
//   skipIfNo      — this question is hidden when the named yes/no question is "No"
//   shuffleOptions— present the options in a per-student order (scored by value)
//   clearsOthers  — picking this option deselects every other one ("None")
//   allowOther    — adds an "Other" choice that reveals a text box; what the
//                   candidate types is stored on the answer's otherText

const SECTIONS = {
  A: { key: 'A', title: 'Profile', note: 'Basic details' },
  B: { key: 'B', title: 'Knowledge Check', note: 'One mark each' },
  C: { key: 'C', title: 'Skills Self-Rating', note: 'Rate yourself 1–5' },
  D: { key: 'D', title: 'Academic Project', note: '' },
  E: { key: 'E', title: 'Internship', note: '' },
  F: { key: 'F', title: 'Career Interest', note: '' }
};

const RATING_1_5 = ['1', '2', '3', '4', '5'];
const YES_NO = ['Yes', 'No'];

const QUESTIONS = [
  // ── A · Profile ───────────────────────────────────────────────────────────
  { code: 'A1', section: 'A', type: 'text', required: true, prefill: 'name',
    text: 'Full name' },
  { code: 'A2', section: 'A', type: 'single', required: true, allowOther: true,
    text: 'Qualification',
    options: ['B.Com', 'BBA', 'M.Com', 'MBA (Finance)'] },
  { code: 'A3', section: 'A', type: 'single', required: true,
    text: 'Year of passing',
    options: ['2024', '2025', '2026', '2027'] },
  { code: 'A4', section: 'A', type: 'single', required: true,
    text: 'Percentage / CGPA range',
    options: ['Below 60%', '60–70%', '70–80%', 'Above 80%'] },

  // ── B · Knowledge Check ───────────────────────────────────────────────────
  // Scored 1 mark each, out of 8. Options are shuffled per student and scored
  // by the option TEXT, never by position.
  { code: 'B1', section: 'B', type: 'single', required: true, topic: 'accounting', shuffleOptions: true,
    text: 'The accounting equation is:',
    options: [
      'Assets = Liabilities − Capital',
      'Assets = Liabilities + Capital',
      'Capital = Assets + Liabilities',
      'Liabilities = Assets + Capital'
    ] },
  { code: 'B2', section: 'B', type: 'single', required: true, topic: 'accounting', shuffleOptions: true,
    text: 'Machinery bought for cash. The journal entry is:',
    options: [
      'Dr Cash, Cr Machinery',
      'Dr Machinery, Cr Cash',
      'Dr Purchases, Cr Cash',
      'Dr Machinery, Cr Capital'
    ] },
  { code: 'B3', section: 'B', type: 'single', required: true, topic: 'accounting', shuffleOptions: true,
    text: 'Outstanding salary appears in the Balance Sheet as a:',
    options: ['Current asset', 'Fixed asset', 'Current liability', 'Expense'] },
  { code: 'B4', section: 'B', type: 'single', required: true, topic: 'taxation', shuffleOptions: true,
    text: 'For a sale within the same state, GST charged is:',
    options: ['IGST', 'CGST + SGST', 'Only CGST', 'Customs duty'] },
  { code: 'B5', section: 'B', type: 'single', required: true, topic: 'taxation', shuffleOptions: true,
    text: 'TDS stands for:',
    options: [
      'Tax Deposit Scheme',
      'Tax Deducted at Source',
      'Total Deduction Sum',
      'Tax Due Statement'
    ] },
  { code: 'B6', section: 'B', type: 'single', required: true, topic: 'accounting', shuffleOptions: true,
    text: 'A Bank Reconciliation Statement matches:',
    options: [
      'Cash book and Ledger',
      'Cash book (bank column) and Bank passbook',
      'Trial balance and Balance sheet',
      'Sales and Purchases'
    ] },
  { code: 'B7', section: 'B', type: 'single', required: true, topic: 'analysis', shuffleOptions: true,
    text: 'Current Ratio =',
    options: [
      'Current assets ÷ Current liabilities',
      'Current liabilities ÷ Current assets',
      'Total assets ÷ Equity',
      'Net profit ÷ Sales'
    ] },
  { code: 'B8', section: 'B', type: 'single', required: true, topic: 'analysis', shuffleOptions: true,
    text: 'Sales ₹10,00,000 and COGS ₹6,00,000. Gross Profit Margin is:',
    options: ['60%', '40%', '66.7%', '25%'] },

  // ── C · Skills Self-Rating ────────────────────────────────────────────────
  { code: 'C1', section: 'C', type: 'rating', required: true, options: RATING_1_5,
    text: 'Financial Accounting' },
  { code: 'C2', section: 'C', type: 'rating', required: true, options: RATING_1_5,
    text: 'GST & Income Tax' },
  { code: 'C3', section: 'C', type: 'rating', required: true, options: RATING_1_5,
    text: 'MS Excel' },
  { code: 'C4', section: 'C', type: 'rating', required: true, options: RATING_1_5,
    text: 'English communication' },
  { code: 'C5', section: 'C', type: 'rating', required: true, options: RATING_1_5,
    text: 'Confidence in interviews' },
  { code: 'C6', section: 'C', type: 'multi', required: true, clearsOthers: 'None',
    text: 'Software you have used',
    options: ['Tally Prime', 'Zoho Books', 'SAP', 'Power BI', 'None'] },

  // ── D · Academic Project ──────────────────────────────────────────────────
  { code: 'D1', section: 'D', type: 'yesno', required: true, options: YES_NO,
    text: 'Have you done an academic project?' },
  { code: 'D2', section: 'D', type: 'single', required: true, skipIfNo: 'D1', allowOther: true,
    text: 'Project domain',
    options: ['Financial analysis', 'Taxation / GST', 'Banking', 'Stock market', 'Cost accounting'] },
  { code: 'D3', section: 'D', type: 'text', required: true, skipIfNo: 'D1', maxLength: 200,
    text: 'Project title and key finding (one line)' },

  // ── E · Internship ────────────────────────────────────────────────────────
  { code: 'E1', section: 'E', type: 'yesno', required: true, options: YES_NO,
    text: 'Have you done an internship?' },
  { code: 'E2', section: 'E', type: 'single', required: true, skipIfNo: 'E1', allowOther: true,
    text: 'Type of organisation',
    options: ['CA / Audit firm', 'Bank / NBFC', 'Corporate', 'Startup'] },
  { code: 'E3', section: 'E', type: 'single', required: true, skipIfNo: 'E1',
    text: 'Duration',
    options: ['Less than 1 month', '1–2 months', '3+ months'] },
  { code: 'E4', section: 'E', type: 'multi', required: true, skipIfNo: 'E1', allowOther: true,
    text: 'Work you did',
    options: [
      'Data / voucher entry', 'GST / TDS work', 'Bank reconciliation',
      'Audit support', 'Excel / MIS reports'
    ] },

  // ── F · Career Interest ───────────────────────────────────────────────────
  { code: 'F1', section: 'F', type: 'multi', required: true, maxSelect: 2,
    text: 'Areas of interest (choose up to 2)',
    options: ['Accounts', 'Taxation', 'Audit', 'Banking', 'Financial analysis', 'Investment', 'Not sure'] },
  { code: 'F2', section: 'F', type: 'single', required: true,
    text: 'Plan after graduation',
    options: ['Job', 'Higher studies', 'CA / CMA / ACCA', 'Job + course', 'Not decided'] },
  { code: 'F3', section: 'F', type: 'single', required: true,
    text: 'Preferred location',
    options: ['Bangalore only', 'Karnataka', 'Anywhere in India'] },
  { code: 'F4', section: 'F', type: 'single', required: true,
    text: 'Expected monthly salary',
    options: ['₹10–15K', '₹15–20K', '₹20–30K', 'Above ₹30K'] },
  { code: 'F5', section: 'F', type: 'single', required: true,
    text: 'When can you join?',
    options: ['Immediately', 'Within 1 month', 'After exams / results'] },
  { code: 'F6', section: 'F', type: 'text', required: true, maxLength: 200,
    text: 'Where do you see yourself in 3 years?' }
];

// Codes that identify this questionnaire at runtime. Scoring and the report's
// scoring block only engage when a response's workspace actually uses these
// questions, so every other drive's submit path is untouched.
const SIGNATURE_CODES = ['B1', 'B8', 'C6', 'F1'];

module.exports = { SECTIONS, QUESTIONS, SIGNATURE_CODES, RATING_1_5, YES_NO };
