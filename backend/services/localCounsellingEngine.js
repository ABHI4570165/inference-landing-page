const templates = {
  introduction: [
    'The student shows a genuine interest in {path} and approaches their career planning with a thoughtful and curious mindset.',
    'This learner has expressed a clear inclination toward {path} and seems eager to build practical skills in that domain.',
    'There is an emerging passion for {path} in this profile, with signs of both ambition and a need for structured guidance.'
  ],
  confidence: [
    'Confidence appears to be {confidence}, which suggests that with the right early successes, the student can become more self-assured.',
    'The current confidence level is {confidence}, so the recommendation is to focus on manageable wins to build momentum.',
    '{confidence} confidence is visible in the responses, and the student will benefit from repeated exposure to real tasks.'
  ],
  coding: [
    'Technical foundation in coding is {coding}, so practical exposure through projects will be critical.',
    'Programming skills are currently {coding}, and a focused learning plan will help accelerate readiness.',
    'The student’s coding ability appears {coding}, making hands-on practice the best way to grow.'
  ],
  roadmap: [
    'Roadmap awareness is {roadmap}, so creating a step-by-step plan will reduce uncertainty.',
    'The learner is {roadmap} about the next steps, which means mentoring and a clear pathway are essential.',
    'A more defined roadmap would help the student turn enthusiasm into measurable progress.'
  ],
  communication: [
    'Communication looks {communication}, which is important for both interviews and workplace collaboration.',
    'The student’s communication style appears {communication}, and building confidence there will help them in group settings.',
    'Improving communication will enhance this student’s ability to present ideas effectively.'
  ],
  closing: [
    'A structured training plan, coupled with mentorship, will help convert this interest into a viable career trajectory.',
    'With targeted learning and realistic goals, this student can move from exploration to strong preparation.',
    'A clear path forward will make the student’s motivation count, helping them build the skills needed for early placement success.'
  ]
};

function choice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ── Real per-student signal ─────────────────────────────────────────────────
// The old version of this file classified students by scanning the full text
// of their answers for hardcoded phrases ("high confidence", "advanced",
// "clear plan"...). The actual questionnaire options never contain those
// literal phrases (they read like "Comfortable — I can write joins..."), so
// almost every student failed every keyword check and fell into the same
// default bucket — producing identical scores and near-identical report text
// for everyone. These helpers instead read the student's own answers and the
// already-computed, per-student `baseScores` (real question points), so the
// classification always reflects what that student actually selected.

function findAnswer(response, code) {
  return response.answers.find(a => a.code === code);
}

function tierHML(score) {
  if (score >= 70) return 'high';
  if (score < 40) return 'low';
  return 'medium';
}

function tierMotivation(score) {
  if (score >= 70) return 'high';
  if (score < 40) return 'low';
  return 'moderate';
}

function tierCoding(score) {
  if (score >= 70) return 'advanced';
  if (score < 40) return 'beginner';
  return 'intermediate';
}

function tierCommunication(score) {
  if (score >= 70) return 'good';
  if (score < 40) return 'weak';
  return 'average';
}

// Q6 — "Which role are you MORE interested in?" — direct single-select lookup
function inferCareerPath(response) {
  const sel = (findAnswer(response, 'Q6')?.selected || []).join(' ').toLowerCase();
  if (sel.includes('data analyst') && sel.includes('data engineer')) return 'Data Analyst & Data Engineer';
  if (sel.includes('data analyst')) return 'Data Analyst';
  if (sel.includes('data engineer')) return 'Data Engineer';
  if (sel.includes('both')) return 'Data Analyst & Data Engineer';
  return 'Data Analytics / Data Engineering (still exploring)';
}

// Q17 — "Have you done any internship or training in a data-related area?" —
// treat a meaningfully completed internship/training (2+ pts) as "has experience"
function inferInternshipExperience(response) {
  const ans = findAnswer(response, 'Q17');
  return (ans?.points || 0) >= 2;
}

// Q30 — preparing for higher studies / government exams instead of this role
function inferAttritionRisk(response) {
  const ans = findAnswer(response, 'Q30');
  return (ans?.points || 0) === 0;
}

// Q34 (college project) / Q35 (final-year internship) — read directly since
// these are free-text answers with no scoring; used only to build the
// deterministic fallback's practicalExperience paragraph.
function buildPracticalExperience(response) {
  const project = findAnswer(response, 'Q34')?.otherText?.trim();
  const internship = findAnswer(response, 'Q35')?.otherText?.trim();
  const parts = [];
  parts.push(project
    ? `College project: ${project}`
    : 'College project: not described by the student.');
  parts.push(internship
    ? `Final-year internship: ${internship}`
    : 'Final-year internship: not completed / not described by the student.');
  return parts.join(' ');
}

function buildStrengths(data) {
  const strengths = [];
  strengths.push(`Shows a genuine interest in ${data.careerPath}`);
  if (data.confidence === 'high') strengths.push('Demonstrates strong self-belief and willingness to take on new challenges');
  if (data.codingLevel !== 'beginner') strengths.push('Has a stable technical foundation that can be built into practical skills');
  if (data.hasInternship) strengths.push('Has already gained some practical exposure through projects or internships');
  if (data.communication === 'good') strengths.push('Presents thoughts clearly and can collaborate well with peers');
  if (data.motivation === 'high') strengths.push('Appears motivated and ready to follow a structured growth plan');
  if (!data.hasInternship) strengths.push('Shows curiosity and a willingness to learn, which is a strong starting point');
  return strengths.slice(0, 8);
}

function buildWeaknesses(data) {
  const weaknesses = [];
  if (data.roadmapAwareness === 'low') weaknesses.push('Lacks a clear roadmap for progressing toward the chosen career path');
  if (data.confidence === 'low') weaknesses.push('Needs to build confidence in technical ability and self-presentation');
  if (data.codingLevel === 'beginner') weaknesses.push('Requires stronger programming practice to match industry expectations');
  if (data.communication === 'weak') weaknesses.push('Communication skills need improvement for interviews and teamwork');
  if (!data.hasInternship) weaknesses.push('Would benefit from more real-world exposure through projects or internships');
  if (data.attritionRisk) weaknesses.push('May prioritise higher studies or government exam preparation over long-term commitment to this role');
  if (weaknesses.length === 0) weaknesses.push('Needs to convert motivation into a disciplined learning routine');
  return weaknesses.slice(0, 8);
}

function buildTrainingRecommendation(data) {
  const courses = [];
  const skills = [];
  const certifications = [];
  const projects = [];
  const softSkills = [];
  const interviewPrep = [];

  if (data.careerPath.includes('Data')) {
    courses.push('Data Science fundamentals', 'Statistics for analytics', 'Python for data processing');
    skills.push('Pandas and NumPy', 'Data visualization', 'basic machine learning concepts');
    projects.push('analysis of a real dataset', 'dashboard creation', 'predictive modelling exercise');
    certifications.push('Google Data Analytics Certificate');
  } else if (data.careerPath.includes('Cyber')) {
    courses.push('Network security basics', 'ethical hacking fundamentals', 'cyber security tools');
    skills.push('vulnerability assessment', 'incident response', 'security monitoring');
    projects.push('security audit of a sample system', 'capture-the-flag challenge');
    certifications.push('CompTIA Security+');
  } else if (data.careerPath.includes('Cloud')) {
    courses.push('Cloud fundamentals', 'AWS/Azure essentials', 'DevOps basics');
    skills.push('cloud deployment', 'containerization', 'automated builds');
    projects.push('deploying a simple web app in the cloud', 'CI/CD pipeline setup');
    certifications.push('AWS Cloud Practitioner');
  } else if (data.careerPath.includes('Design')) {
    courses.push('UI/UX design principles', 'design thinking', 'Figma/product design');
    skills.push('wireframing', 'user research', 'visual design');
    projects.push('design case study', 'mobile app prototype');
    certifications.push('Coursera UX Design Specialization');
  } else if (data.careerPath.includes('Government')) {
    courses.push('Competitive exam strategy', 'general awareness', 'problem solving');
    skills.push('time management', 'analytical reasoning', 'written communication');
    projects.push('mock test series', 'previous-year paper analysis');
    certifications.push('SSC/BANK exam preparatory course');
  } else {
    courses.push('Programming fundamentals', 'data structures & algorithms', 'project-based learning');
    skills.push('coding fluency', 'system design basics', 'debugging discipline');
    projects.push('web application from scratch', 'small team project');
    certifications.push('Google IT Automation with Python');
  }

  if (data.communication !== 'good') {
    softSkills.push('spoken communication practice', 'presentation drills', 'group discussion readiness');
  } else {
    softSkills.push('storytelling for interviews', 'professional email etiquette');
  }

  if (data.confidence === 'low') {
    interviewPrep.push('mock interviews with feedback', 'confidence-building sessions', 'small presentation practice');
  } else {
    interviewPrep.push('behavioral interview prep', 'STAR method responses', 'resume walkthroughs');
  }

  const timeline = data.roadmapAwareness === 'high'
    ? 'A 3–6 month structured plan with weekly milestones will work well.'
    : 'A 6-month learning track with monthly reviews will help build clarity and consistency.';

  return { courses, skills, certifications, projects, softSkills, interviewPrep, timeline };
}

function buildCareerFit(data) {
  const recommendations = [];
  if (data.careerPath.includes('Data')) {
    recommendations.push({ path: 'Data Analytics', reason: 'The student’s interest in data and analytical thinking fits well with roles that combine business insight with technical analysis.' });
    recommendations.push({ path: 'Data Engineering', reason: 'A stronger focus on data tools and pipelines would suit their desire for practical, project-based work.' });
  } else if (data.careerPath.includes('Cyber')) {
    recommendations.push({ path: 'Cyber Security Analyst', reason: 'The profile shows security curiosity and would benefit from a role that blends vigilance with technical control.' });
    recommendations.push({ path: 'Information Security', reason: 'A structured security track can leverage their interest in safe systems and risk-aware decisions.' });
  } else if (data.careerPath.includes('Cloud')) {
    recommendations.push({ path: 'Cloud Operations', reason: 'The student’s interest in infrastructure is a good fit for cloud platform and deployment roles.' });
    recommendations.push({ path: 'DevOps Support', reason: 'A path that combines automation with practical systems work will help them learn quickly.' });
  } else if (data.careerPath.includes('Design')) {
    recommendations.push({ path: 'UI/UX Design', reason: 'Their creative and user-focused mindset is well matched to design roles that require empathy and structure.' });
    recommendations.push({ path: 'Product Design', reason: 'A career that blends problem solving with visual communication will highlight their strengths.' });
  } else if (data.careerPath.includes('Government')) {
    recommendations.push({ path: 'Government Services', reason: 'The student appears motivated by stable, exam-based career paths with long-term goals.' });
    recommendations.push({ path: 'Competitive Exam Preparation', reason: 'A focused study plan will be key to converting preparation into results.' });
  } else {
    recommendations.push({ path: 'Software Development', reason: 'A broad technical career path offers many entry points and aligns with their overall interest in technology.' });
    recommendations.push({ path: 'Technical Support / QA', reason: 'These roles can provide practical exposure while strengthening problem solving and communication.' });
  }
  return recommendations.slice(0, 3);
}

function buildCounsellorRecommendation(data) {
  const sentences = [];
  sentences.push(choice(templates.introduction).replace('{path}', data.careerPath));
  sentences.push(choice(templates.confidence).replace('{confidence}', data.confidence));
  sentences.push(choice(templates.coding).replace('{coding}', data.codingLevel));
  sentences.push(choice(templates.roadmap).replace('{roadmap}', data.roadmapAwareness));
  sentences.push(choice(templates.communication).replace('{communication}', data.communication));
  sentences.push(choice(templates.closing));

  const details = [];
  if (data.hasInternship) {
    details.push('They have already taken steps toward practical experience, which is a strong foundation to build on.');
  } else {
    details.push('Early exposure through small projects will make a big difference in their confidence and readiness.');
  }
  if (data.motivation === 'high') {
    details.push('Their motivation is one of the report’s strongest assets, and it should be channeled into a structured plan.');
  }
  if (data.roadmapAwareness === 'low') {
    details.push('A clearer plan is the missing link between enthusiasm and measurable progress.');
  }
  if (data.confidence === 'low') {
    details.push('Targeted practice and small wins will help reduce self-doubt before interviews.');
  }
  sentences.push(details.join(' '));

  const pathSentence = `Overall, ${data.careerPath} remains the best fit today because it balances the student’s current interests with the opportunity for rapid learning.`;
  sentences.push(pathSentence);
  return sentences.join(' ');
}

function buildOverallPersonality(data) {
  const parts = [];
  parts.push(`The student comes across as ${data.motivation === 'high' ? 'motivated and curious' : data.motivation === 'low' ? 'cautious and tentative' : 'steady and thoughtful'}.`);
  if (data.communication === 'good') parts.push('They communicate ideas clearly and seem capable of collaborating with peers.');
  if (data.communication === 'weak') parts.push('They may need confidence-building for verbal and written communication.');
  return parts.join(' ');
}

function buildTechnicalInterest(data) {
  return `There is a clear leaning toward ${data.careerPath}, with ${data.codingLevel === 'advanced' ? 'good programming readiness' : data.codingLevel === 'beginner' ? 'early-stage technical exposure' : 'moderate coding comfort'}.`; }

function buildCareerReadiness(data) {
  return `Career clarity is ${data.roadmapAwareness}, and placement readiness is ${data.confidence === 'high' ? 'promising' : data.confidence === 'low' ? 'developing' : 'in progress'}.`; }

function buildBehaviourAnalysis(data) {
  return {
    learningStyle: data.roadmapAwareness === 'high' ? 'Prefers structured learning with clear milestones.' : 'Needs a more guided approach to learning and planning.',
    problemSolving: data.codingLevel === 'beginner' ? 'Feels comfortable with basic problem-solving concepts but needs more practice.' : 'Shows a practical approach to solving technical problems.',
    decisionMaking: data.motivation === 'high' ? 'Decisive and ready to take action.' : 'May hesitate without a clear plan.',
    confidence: data.confidence === 'high' ? 'Self-assured about their abilities.' : data.confidence === 'low' ? 'Needs support to build confidence in technical tasks.' : 'Moderately confident and improving.',
    riskTaking: data.motivation === 'high' ? 'Willing to try new challenges.' : 'Prefers safer, more familiar paths.',
    leadership: data.communication === 'good' ? 'Can take initiative in team settings.' : 'May benefit from teaming exercises to build leadership presence.',
    teamWork: data.communication === 'good' ? 'Collaborates effectively and listens to others.' : 'Supports from peers will help them settle into team dynamics.',
    communication: data.communication === 'good' ? 'Communicates clearly and professionally.' : data.communication === 'weak' ? 'Should work on clarity and confidence in communication.' : 'Generally acceptable, with room for polish.',
    adaptability: data.roadmapAwareness === 'low' ? 'Open to new directions but needs structure.' : 'Ready to adapt as they follow a clear plan.'
  };
}

function buildFinalReport(response, questions, baseScores, fallbackReason) {
  // Every value below is derived from this student's own answers/points —
  // never from a generic keyword scan of the combined answer text — so two
  // students who answer differently always get a different report.
  const careerPath = inferCareerPath(response);
  const confidence = tierHML(baseScores.confidence);
  const codingLevel = tierCoding(baseScores.technicalReadiness);
  const roadmapAwareness = tierHML(baseScores.careerClarity);
  const hasInternship = inferInternshipExperience(response);
  const communication = tierCommunication(baseScores.communicationReadiness);
  const motivation = tierMotivation(baseScores.motivation);
  const attritionRisk = inferAttritionRisk(response);

  const data = {
    careerPath,
    confidence,
    codingLevel,
    roadmapAwareness,
    hasInternship,
    communication,
    motivation,
    attritionRisk
  };

  const recommendedCareerPath = `${careerPath} is the strongest fit given the student’s current interest and early exposure.`;
  const recommendedTrainingPlan = `Begin with a focused, hands-on learning track that balances foundational concepts, small projects, and communication practice over the next 4-6 months.`;

  const report = {
    overallPersonality: buildOverallPersonality(data),
    technicalInterest: buildTechnicalInterest(data),
    careerReadiness: buildCareerReadiness(data),
    strengths: buildStrengths(data),
    weaknesses: buildWeaknesses(data),
    behaviourAnalysis: buildBehaviourAnalysis(data),
    careerFit: buildCareerFit(data),
    trainingRecommendation: buildTrainingRecommendation(data),
    counsellorRecommendation: buildCounsellorRecommendation(data),
    learningBehaviour: `${data.motivation === 'high' ? 'Eager to learn and open to direction.' : data.motivation === 'low' ? 'Needs encouragement and clearer guidance.' : 'Generally receptive but could use a stronger structure.'}`,
    confidenceAnalysis: `${data.confidence === 'high' ? 'Confidence is a strength.' : data.confidence === 'low' ? 'Confidence is fragile and would benefit from early wins.' : 'Confidence is moderate with room for steady improvement.'}`,
    skillGapAnalysis: `${data.codingLevel === 'beginner' ? 'Requires more practical coding practice and project experience.' : data.codingLevel === 'intermediate' ? 'Needs to deepen technical skills and apply them to real problems.' : 'Can polish existing skills with more challenging projects.'}`,
    recommendedCareerPath,
    recommendedTrainingPlan,
    practicalExperience: buildPracticalExperience(response),
    // The deterministic rubric score, computed from this student's actual
    // question points (see computeMetricScores in aiReport.js) — always
    // varies per student, unlike a re-derived generic tier formula.
    scores: baseScores
  };

  if (fallbackReason) {
    report.fallbackReason = fallbackReason;
  }

  return report;
}

module.exports = { buildFinalReport };
