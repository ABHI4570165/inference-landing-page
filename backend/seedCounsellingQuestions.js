const CounsellingQuestion = require('./models/CounsellingQuestion');

// Seeds the Candidate Self-Assessment questionnaire into MongoDB on first
// boot. Runs only when the collection is empty — after that the questions
// live in the database and are managed from the admin Question Editor
// (edit text/options/points, add questions, deactivate). Nothing here is
// used at request time.
const S = (key, title, note) => ({ sectionKey: key, sectionTitle: title, sectionNote: note });

const SEC_A = S('A', 'About You', 'Basic profile');
const SEC_B = S('B', 'Your Interest in the Data Field', '');
const SEC_C = S('C', 'Your Technical Exposure', '');
const SEC_D = S('D', 'What You Have Already Done', 'Proof of effort');
const SEC_E = S('E', 'Do You Know What This Job Involves?', '');
const SEC_F = S('F', 'Learning Ability & Work Style', '');
const SEC_G = S('G', 'Commitment & Practical Readiness', '');
const SEC_H = S('H', 'Self-Rating', '');

const opt = (label, points) => ({ label, points });

const QUESTIONS = [
  // ── Section A — About You ──────────────────────────────────────────────
  {
    ...SEC_A, code: 'Q1', text: 'What is your current status?',
    type: 'radio', metricTags: [],
    options: [
      opt('Final year engineering student', 2),
      opt('Pre-final year (3rd year)', 1),
      opt('Passed out – less than 1 year ago', 2),
      opt('Passed out – more than 1 year ago', 1)
    ]
  },
  {
    ...SEC_A, code: 'Q2', text: 'Which branch did you study / are you studying?',
    type: 'radio', allowOther: true, metricTags: [],
    options: [
      opt('CSE / IT / AI / Data Science', 2),
      opt('ECE / EEE', 2),
      opt('Mechanical / Civil / other core branch', 1),
      opt('Non-engineering degree', 0)
    ]
  },
  {
    ...SEC_A, code: 'Q3', text: 'What is your CGPA (or overall percentage)?',
    type: 'radio', metricTags: ['learningAttitude'],
    options: [
      opt('Above 8.5 CGPA / above 85%', 3),
      opt('7.5 – 8.5 CGPA / 75 – 85%', 2),
      opt('6.5 – 7.5 CGPA / 65 – 75%', 1),
      opt('Below 6.5 CGPA / below 65%', 0)
    ]
  },
  {
    ...SEC_A, code: 'Q4', text: 'Do you have any active backlogs / arrears?',
    type: 'radio', metricTags: ['riskLevel'],
    options: [
      opt('No backlogs', 2),
      opt('Had backlogs earlier, all cleared now', 1),
      opt('Yes, 1 – 2 active backlogs', 0),
      opt('Yes, more than 2 active backlogs', 0)
    ]
  },

  // ── Section B — Interest in the Data Field ─────────────────────────────
  {
    ...SEC_B, code: 'Q5', text: 'Which role are you MORE interested in?',
    type: 'radio', metricTags: ['careerClarity'],
    options: [
      opt('Junior Data Analyst (analysis, dashboards, insights)', 2),
      opt('Junior Data Engineer (pipelines, databases, ETL)', 2),
      opt('Both are fine for me', 1),
      opt('I am not sure what these roles do yet', 0)
    ]
  },
  {
    ...SEC_B, code: 'Q6',
    text: 'Why do you want to build your career in Data Analytics / Data Engineering? (choose the closest)',
    type: 'radio', allowOther: true, metricTags: ['motivation', 'careerClarity'],
    options: [
      opt('I genuinely enjoy working with data and solving problems with it', 3),
      opt('It has good career growth and I have started liking it after exploring', 2),
      opt('Salary and job openings are good in this field', 1),
      opt('Someone suggested it / I just want any job', 0)
    ]
  },
  {
    ...SEC_B, code: 'Q7', text: 'How long have you been interested in the data field?',
    type: 'radio', metricTags: ['motivation'],
    options: [
      opt('More than a year — and I have been learning during this time', 3),
      opt('6 months to a year', 2),
      opt('Last few months', 1),
      opt('I became interested only after seeing this job opening', 0)
    ]
  },
  {
    ...SEC_B, code: 'Q8', text: 'Where do you see yourself in 3 years?',
    type: 'radio', metricTags: ['careerClarity', 'riskLevel'],
    options: [
      opt('A skilled Data Analyst / Data Engineer growing in the same field', 3),
      opt('In the data field, maybe moving to Data Science / ML', 2),
      opt('In IT, but not sure which area', 1),
      opt('Planning higher studies / government exams alongside the job', 0)
    ]
  },

  // ── Section C — Technical Exposure ─────────────────────────────────────
  {
    ...SEC_C, code: 'Q9', text: 'What is your level in SQL?',
    type: 'radio', metricTags: ['technicalReadiness'],
    options: [
      opt('Comfortable — I can write joins, GROUP BY and subqueries on my own', 3),
      opt('Basic — I can write simple SELECT / WHERE queries', 2),
      opt('I know the concepts but have not practised much', 1),
      opt('I have never used SQL', 0)
    ]
  },
  {
    ...SEC_C, code: 'Q10', text: 'What is your level in Python?',
    type: 'radio', metricTags: ['technicalReadiness'],
    options: [
      opt('Comfortable — I can write programs with loops, functions and use libraries', 3),
      opt('Basic — I know syntax, loops and lists', 2),
      opt('I learned it in college but forgot most of it', 1),
      opt('I have never coded in Python', 0)
    ]
  },
  {
    ...SEC_C, code: 'Q11', text: 'Have you used pandas / NumPy or any data library?',
    type: 'radio', metricTags: ['technicalReadiness'],
    options: [
      opt('Yes — I have used them in projects to clean and analyse data', 3),
      opt('Yes — practised in courses / tutorials only', 2),
      opt('I have only heard of them', 1),
      opt('No, never', 0)
    ]
  },
  {
    ...SEC_C, code: 'Q12', text: 'Have you worked with Excel / Google Sheets for data tasks?',
    type: 'radio', metricTags: ['technicalReadiness'],
    options: [
      opt('Yes — pivot tables, VLOOKUP/XLOOKUP, charts, formulas', 3),
      opt('Yes — basic formulas and tables', 2),
      opt('Only for simple data entry', 1),
      opt('Rarely / never used it', 0)
    ]
  },
  {
    ...SEC_C, code: 'Q13',
    text: 'Have you used any BI / visualization tool (Power BI, Tableau, Looker Studio)?',
    type: 'radio', metricTags: ['technicalReadiness'],
    options: [
      opt('Yes — built dashboards myself', 3),
      opt('Yes — tried it in a course / tutorial', 2),
      opt('No, but I know what these tools do', 1),
      opt("No, and I don't know these tools", 0)
    ]
  },
  {
    ...SEC_C, code: 'Q14',
    text: 'Do you know any of these data engineering concepts: ETL, data pipelines, data warehouse?',
    type: 'radio', metricTags: ['technicalReadiness'],
    options: [
      opt('Yes — I can explain them and have tried building something (even small)', 3),
      opt('Yes — I understand the concepts from courses / videos', 2),
      opt("I have heard the terms but can't explain them", 1),
      opt('No, these are new to me', 0)
    ]
  },

  // ── Section D — What You Have Already Done ─────────────────────────────
  {
    ...SEC_D, code: 'Q15',
    text: 'Have you done any project using real data (college or personal)?',
    type: 'radio', metricTags: ['technicalReadiness'],
    options: [
      opt('Yes — end-to-end project (collected/cleaned data, analysed, presented results)', 3),
      opt('Yes — a guided project from a course / YouTube', 2),
      opt('Only small classroom assignments', 1),
      opt('No projects yet', 0)
    ]
  },
  {
    ...SEC_D, code: 'Q16',
    text: 'Have you done any internship or training in a data-related area?',
    type: 'radio', metricTags: ['technicalReadiness', 'placementReadiness'],
    options: [
      opt('Yes — internship in data / analytics / related field', 3),
      opt('Yes — formal training or certification course completed', 2),
      opt('Currently doing a course / internship', 1),
      opt('No internship or training yet', 0)
    ]
  },
  {
    ...SEC_D, code: 'Q17',
    text: 'Have you completed any online course / certification in data skills?',
    type: 'radio', metricTags: ['technicalReadiness', 'learningAttitude'],
    options: [
      opt('Yes — completed with hands-on practice (can show certificate/projects)', 3),
      opt('Yes — completed video courses but little practice', 2),
      opt('Started courses but did not finish', 1),
      opt('Not yet started any course', 0)
    ]
  },
  {
    ...SEC_D, code: 'Q18',
    text: 'Do you practise coding / SQL on any platform (HackerRank, LeetCode, StrataScratch, Kaggle etc.)?',
    type: 'radio', metricTags: ['learningAttitude', 'motivation'],
    options: [
      opt('Yes — regularly (weekly or more)', 3),
      opt('Sometimes — when I get time', 2),
      opt('Created an account but rarely use it', 1),
      opt("No, I don't practise on any platform", 0)
    ]
  },
  {
    ...SEC_D, code: 'Q19',
    text: 'In the last 1 month, how many hours per week did you spend learning data skills?',
    type: 'radio', metricTags: ['learningAttitude', 'motivation'],
    options: [
      opt('More than 10 hours', 3),
      opt('5 – 10 hours', 2),
      opt('1 – 5 hours', 1),
      opt('Almost none', 0)
    ]
  },

  // ── Section E — Do You Know What This Job Involves? ────────────────────
  {
    ...SEC_E, code: 'Q20', text: 'What does a Data Analyst mainly do? (choose the BEST answer)',
    type: 'radio', metricTags: ['careerClarity'],
    options: [
      opt('Collects, cleans and analyses data to find insights and help business decisions', 3),
      opt('Builds websites and mobile apps', 0),
      opt('Only makes charts in Excel', 1),
      opt("Manages the company's computers and network", 0)
    ]
  },
  {
    ...SEC_E, code: 'Q21', text: 'What does a Data Engineer mainly do? (choose the BEST answer)',
    type: 'radio', metricTags: ['careerClarity'],
    options: [
      opt('Builds and maintains pipelines and systems that move and store data reliably', 3),
      opt('Repairs hardware and servers', 0),
      opt('Only writes SQL reports for managers', 1),
      opt('Designs the company logo and posters', 0)
    ]
  },
  {
    ...SEC_E, code: 'Q22', text: 'Do you know the typical day-to-day tools for the role you chose?',
    type: 'radio', metricTags: ['careerClarity'],
    options: [
      opt('Yes — I can name the main tools and have tried most of them', 3),
      opt('Yes — I can name them but tried only a few', 2),
      opt('I have a rough idea', 1),
      opt('No, I expect to learn after joining', 0)
    ]
  },

  // ── Section F — Learning Ability & Work Style ──────────────────────────
  {
    ...SEC_F, code: 'Q23',
    text: 'When you face a technical problem you cannot solve, what do you usually do?',
    type: 'radio', metricTags: ['learningAttitude'],
    options: [
      opt('Break it down, search documentation/Google/AI tools, and keep trying till I solve it', 3),
      opt("Search online; if I can't solve it in some time, I ask someone", 2),
      opt('Ask a friend / senior to solve it for me', 1),
      opt('I usually leave it and move on', 0)
    ]
  },
  {
    ...SEC_F, code: 'Q24',
    text: 'How do you feel about learning new tools continuously (this field changes fast)?',
    type: 'radio', metricTags: ['learningAttitude', 'motivation'],
    options: [
      opt('I enjoy it — I already learn new things on my own regularly', 3),
      opt('I am fine with it if the company provides training', 2),
      opt('I can manage, but I prefer sticking to what I know', 1),
      opt('I find constant learning stressful', 0)
    ]
  },
  {
    ...SEC_F, code: 'Q25',
    text: 'How comfortable are you explaining your work (e.g., presenting analysis to a team)?',
    type: 'radio', metricTags: ['communicationReadiness', 'confidence'],
    options: [
      opt('Very comfortable — I have presented projects / seminars before', 3),
      opt('Comfortable with small groups', 2),
      opt('Nervous, but I manage', 1),
      opt('Very uncomfortable speaking in front of others', 0)
    ]
  },

  // ── Section G — Commitment & Practical Readiness ───────────────────────
  {
    ...SEC_G, code: 'Q26', text: 'If selected, when can you join?',
    type: 'radio', metricTags: ['placementReadiness'],
    options: [
      opt('Immediately / within 2 weeks', 3),
      opt('Within a month', 2),
      opt('After my final exams', 1),
      opt('Not sure', 0)
    ]
  },
  {
    ...SEC_G, code: 'Q27',
    text: 'Are you preparing for higher studies (M.Tech/MS/MBA) or government exams right now?',
    type: 'radio', metricTags: ['riskLevel', 'motivation'],
    options: [
      opt('No — my full focus is on building my career in this field', 3),
      opt('Thinking about it, but job is my priority for the next 2–3 years', 2),
      opt('Yes — I may leave for studies/exams if I get through', 0),
      opt('Yes — actively preparing', 0)
    ]
  },
  {
    ...SEC_G, code: 'Q28', text: 'Are you willing to work from office (if the role requires it)?',
    type: 'radio', allowOther: true, metricTags: ['placementReadiness'],
    options: [
      opt('Yes, fully', 3),
      opt('Yes, but I would prefer hybrid', 2),
      opt('Only remote work suits me', 0),
      opt('Depends on the location', 1)
    ]
  },

  // ── Section H — Self-Rating ────────────────────────────────────────────
  {
    ...SEC_H, code: 'Q29',
    text: 'Rate your OVERALL technical readiness for this role, honestly.',
    type: 'radio', metricTags: ['confidence'],
    options: [
      opt('8 – 10 : Job-ready, I can start contributing quickly', 3),
      opt('6 – 7 : Good foundation, need some polishing', 2),
      opt('4 – 5 : Basics in place, need proper training', 1),
      opt('1 – 3 : Beginner, starting from scratch', 0)
    ]
  },
  {
    ...SEC_H, code: 'Q30',
    text: 'If we ask you in the interview to write a simple SQL join or a Python loop on the spot, how would you feel?',
    type: 'radio', metricTags: ['confidence', 'technicalReadiness'],
    options: [
      opt('Confident — I can do it right now', 3),
      opt('I can do it with a little thinking time', 2),
      opt('I would struggle but attempt it', 1),
      opt('I would not be able to do it today', 0)
    ]
  }
];

module.exports = async function seedCounsellingQuestions() {
  const count = await CounsellingQuestion.estimatedDocumentCount();
  if (count > 0) return; // already seeded — questions are managed from the admin UI

  await CounsellingQuestion.insertMany(
    QUESTIONS.map((q, i) => ({ ...q, order: (i + 1) * 10, required: true, active: true }))
  );
  console.log(`✅  Seeded ${QUESTIONS.length} counselling questions`);
};
