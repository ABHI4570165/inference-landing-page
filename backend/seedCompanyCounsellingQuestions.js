/*
 * Seeds the short (5–6 minute) counselling questionnaire for a company drive.
 *
 * Run manually, not on boot:
 *     node seedCompanyCounsellingQuestions.js                 # list + dry run
 *     node seedCompanyCounsellingQuestions.js --apply         # seed both
 *     node seedCompanyCounsellingQuestions.js --apply --only="Paras"
 *
 * Idempotent: a workspace that already has counselling questions is skipped, so
 * this can never duplicate a questionnaire or clobber one an admin has edited.
 *
 * The ten questions on the printed form map to THIRTEEN records here, because
 * three of them ask two things at once and this model stores one answer per
 * question: the role dropdown and the degree (Q1/Q2), the work-style choice and
 * the "went beyond" example (Q10/Q11), and the hours and the ownership rating
 * (Q12/Q13). The student answers the same content in the same time.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const Workspace = require('./models/Workspace');
const CounsellingQuestion = require('./models/CounsellingQuestion');

const SEC = {
  A: { sectionKey: 'A', sectionTitle: 'About You', sectionNote: 'Role and background' },
  B: { sectionKey: 'B', sectionTitle: 'Domain Strength', sectionNote: 'What you can actually do' },
  C: { sectionKey: 'C', sectionTitle: 'Judgement Under Pressure', sectionNote: 'Scenarios' },
  D: { sectionKey: 'D', sectionTitle: 'Learning, Work Style & Commitment', sectionNote: '' }
};

const opt = (label, points) => ({ label, points });

// 1–5 scales are stored as radio options, since this questionnaire has no
// separate scale type. Points mirror the scale so it scores directly.
const SCALE_CONFIDENCE = [
  opt('1 — Not confident', 1), opt('2', 2), opt('3 — Somewhat confident', 3),
  opt('4', 4), opt('5 — Very confident', 5)
];
const SCALE_AGREE = [
  opt('1 — Strongly disagree', 1), opt('2', 2), opt('3 — Neutral', 3),
  opt('4', 4), opt('5 — Strongly agree', 5)
];

const ROLES = [
  opt('Marketing Operations Intern', 0),
  opt('Accountant – Finance', 0),
  opt('Accounts Associate', 0)
];

const WORK_STYLE = [
  opt('I prefer clear instructions and stick closely to them.', 2),
  opt('I like clear goals but decide my own approach.', 4),
  opt('I enjoy figuring out both goals and approach on my own.', 5),
  opt('I need frequent check-ins to stay on track.', 1)
];

// Everything that differs between the two drives lives here, so the two
// questionnaires cannot silently drift apart in structure.
const FLAVOURS = {
  jewels: {
    match: /paras prithvi/i,
    business: 'a jewellery manufacturing and retail business',
    resultEg: 'items tracked, entries posted, enquiries generated',
    toolsEg: 'Excel — pivot tables and SUMIFS to summarise daily stock movement',
    pressureIntro: 'It is a busy festive week in the showroom. Three things are due today:',
    pressureItems: [
      'A daily sales and stock summary for your manager',
      'Fixing a gold stock sheet where weights and making charges do not tally',
      'Replying to an important customer asking when their custom order will be ready'
    ],
    mistakeEg: 'the wrong making charges on a customer invoice, the wrong gold weight in a stock entry, or the wrong cost-per-lead in a campaign report',
    mistakeWhen: 'after the invoice or report has already gone out',
    selfTaughtEg: 'a new Excel feature, GST on gold and making charges in Tally, or a retail marketing concept',
    caseMarketing: 'You launched a lead-generation campaign for a new bridal gold collection. Day 1: high clicks, very few enquiries. Day 2: both clicks and enquiries fall. List the first 3 things you would check, and one change you would make.',
    caseFinance: 'This month’s showroom expenses are 15% higher than last month, but sales revenue is flat. List the first 3 analyses you would run — making charges, karigar payments, wastage — and one recommendation you would give your manager.',
    caseAccounts: 'While reconciling the bank statement you find a difference of ₹12,000 that timing differences do not explain. Describe your step-by-step approach to trace it and fix it.'
  },
  sugars: {
    match: /chamundeswari/i,
    business: 'a sugar manufacturing and cane procurement business',
    resultEg: 'records updated, entries posted, registrations generated',
    toolsEg: 'Excel — pivot tables and SUMIFS to summarise daily cane receipts',
    pressureIntro: 'It is peak crushing season. Three things are due today:',
    pressureItems: [
      'A daily crushing and production summary for your manager',
      'Fixing a cane weighment sheet where the farmer payment amounts do not tally',
      'Replying to an important farmer asking when his cane payment will be released'
    ],
    mistakeEg: 'the wrong cane weight in a farmer payment voucher, the wrong recovery percentage in a production report, or the wrong cost-per-lead in a campaign report',
    mistakeWhen: 'after the payment has been released or the report shared',
    selfTaughtEg: 'a new Excel feature, GST on sugar and by-products in Tally, or a farmer-outreach marketing concept',
    caseMarketing: 'You ran a campaign asking sugarcane farmers to register their cane for the coming crushing season. Day 1: high clicks, very few registrations. Day 2: both clicks and registrations fall. List the first 3 things you would check, and one change you would make.',
    caseFinance: 'This month’s plant expenses are 15% higher than last month, but sugar sales revenue is flat. List the first 3 analyses you would run — harvesting and transport costs, power and fuel, cane procurement rates — and one recommendation you would give your manager.',
    caseAccounts: 'While reconciling the bank statement against farmer payments you find a difference of ₹12,000 that timing differences do not explain. Describe your step-by-step approach to trace it and fix it.'
  }
};

function questionsFor(f, companyName) {
  return [
    { ...SEC.A, code: 'Q1', type: 'radio', options: ROLES, metricTags: ['careerClarity'],
      text: `Which role are you applying for at ${companyName}?` },

    { ...SEC.A, code: 'Q2', type: 'text', metricTags: [],
      text: 'Your degree and year of passing? (e.g. B.Com 2025, BBA 2026)' },

    { ...SEC.B, code: 'Q3', type: 'radio', options: SCALE_CONFIDENCE,
      metricTags: ['confidence'],
      text: `On a scale of 1–5, how confident are you handling the core tasks of your chosen role in ${f.business}, without step-by-step guidance?` },

    { ...SEC.B, code: 'Q4', type: 'textarea', metricTags: ['technicalReadiness'],
      text: 'Describe one recent task you did that connects directly to this role — a college project, internship, freelance job, or personal work. In 3–5 lines, mention: what exactly you did; which tools you used (Excel, Tally, Google Sheets, Meta Ads Manager, GA4); and one result or output with numbers if you have them (' + f.resultEg + ').' },

    { ...SEC.B, code: 'Q5', type: 'textarea', metricTags: ['technicalReadiness'],
      text: `List the top 3 tools or software you are most comfortable using for your role, and for each write one specific thing you can do confidently. Example: “${f.toolsEg}”.` },

    { ...SEC.C, code: 'Q6', type: 'textarea', metricTags: ['placementReadiness', 'communicationReadiness'],
      text: `${f.pressureIntro} (1) ${f.pressureItems[0]}. (2) ${f.pressureItems[1]}. (3) ${f.pressureItems[2]}. You can realistically finish only two of them properly. In 4–6 lines, explain which two you will do first and why, and how you will communicate about the third.` },

    { ...SEC.C, code: 'Q7', type: 'textarea', metricTags: ['communicationReadiness', 'riskLevel'],
      text: `You realise you have made a mistake that affects numbers — ${f.mistakeEg}. You find it ${f.mistakeWhen}. In 4–6 lines, describe what you would do immediately, how you would inform your manager or team, and what you would change in your process so it does not happen again.` },

    { ...SEC.B, code: 'Q8', type: 'textarea', metricTags: ['technicalReadiness', 'careerClarity'],
      text: `Answer ONLY the case for the role you chose in Q1, in 4–6 lines.\n\n• Marketing Operations Intern — ${f.caseMarketing}\n\n• Accountant – Finance — ${f.caseFinance}\n\n• Accounts Associate — ${f.caseAccounts}` },

    { ...SEC.D, code: 'Q9', type: 'textarea', metricTags: ['learningAttitude'],
      text: `Tell us about one skill you taught yourself in the last 6 months that is useful for this role — ${f.selfTaughtEg}. How did you learn it (YouTube, a course, documentation, a mentor), and give one example of how you actually applied it.` },

    { ...SEC.D, code: 'Q10', type: 'radio', options: WORK_STYLE, metricTags: ['learningAttitude'],
      text: 'Which statement fits you best?' },

    { ...SEC.D, code: 'Q11', type: 'textarea', metricTags: ['motivation'],
      text: 'In 1–2 lines: describe a time you did more than what was asked of you in a project or task.' },

    { ...SEC.D, code: 'Q12', type: 'text', metricTags: ['motivation'],
      text: 'How many hours per day can you consistently give to work and learning for the next 3–6 months? (e.g. 4–5 hours)' },

    { ...SEC.D, code: 'Q13', type: 'radio', options: SCALE_AGREE,
      metricTags: ['motivation', 'placementReadiness'],
      text: 'How strongly do you agree: “I am ready to take ownership of real work tasks, even if they feel challenging at first”?' }
  ];
}

async function seedWorkspace(ws, flavour, apply) {
  const existing = await CounsellingQuestion.countDocuments({ workspace: ws._id });
  if (existing > 0) {
    console.log(`  SKIP  ${ws.companyName} — already has ${existing} counselling question(s)`);
    return { skipped: true };
  }

  const questions = questionsFor(flavour, ws.companyName).map((q, i) => ({
    ...q,
    workspace: ws._id,
    order: (i + 1) * 10,
    required: q.code === 'Q2' ? false : true,
    active: true
  }));

  console.log(`  SEED  ${ws.companyName} — ${questions.length} questions`);
  questions.forEach(q => console.log(`          ${q.code.padEnd(4)} ${q.type.padEnd(9)} ${q.text.split('\n')[0].slice(0, 72)}…`));

  if (apply) {
    await CounsellingQuestion.insertMany(questions);
    console.log(`  ✅    inserted ${questions.length} into ${ws.companyName}`);
  }
  return { seeded: questions.length };
}

(async () => {
  const apply = process.argv.includes('--apply');
  const onlyArg = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(apply ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===\n');

  const workspaces = await Workspace.find({}).select('companyName').lean();
  let done = 0;

  for (const [name, flavour] of Object.entries(FLAVOURS)) {
    const ws = workspaces.find(w => flavour.match.test(w.companyName));
    if (!ws) {
      console.log(`  MISS  no workspace matching ${flavour.match} — skipped`);
      continue;
    }
    if (onlyArg && !new RegExp(onlyArg, 'i').test(ws.companyName)) continue;

    const r = await seedWorkspace(ws, flavour, apply);
    if (r.seeded) done += r.seeded;
    console.log('');
  }

  console.log(apply ? `inserted ${done} question(s) in total` : `would insert ${done} question(s)`);
  await mongoose.disconnect();
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
