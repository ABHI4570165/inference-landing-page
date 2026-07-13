const KEYWORDS = {
  data: ['data science', 'data analytics', 'data engineer', 'data analyst', 'machine learning', 'ml', 'ai', 'artificial intelligence', 'business analytics'],
  cyber: ['cyber security', 'cybersecurity', 'network security', 'ethical hacking', 'information security', 'infosec', 'security analyst'],
  cloud: ['cloud', 'aws', 'azure', 'gcp', 'google cloud', 'devops', 'cloud engineer', 'aws cloud', 'azure cloud'],
  software: ['software development', 'software engineer', 'web development', 'frontend', 'backend', 'full stack', 'app development', 'programmer'],
  government: ['government exam', 'bank', 'govt', 'civil service', 'ssc', 'railway', 'police', 'competitive exam'],
  higherStudies: ['higher studies', 'masters', 'mtech', 'mba', 'phd', 'research', 'postgraduate'],
  design: ['ui ux', 'ui/ux', 'design', 'graphic design', 'product design']
};

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

const scoreRanges = {
  high: ['high', 'strong', 'solid', 'well-developed'],
  medium: ['moderate', 'average', 'fair', 'steady'],
  low: ['low', 'developing', 'emerging', 'limited']
};

function choice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function extractText(response) {
  return response.answers
    .map(answer => [answer.selected || [], answer.otherText || ''].flat().join(' '))
    .join(' ')
    .toLowerCase();
}

function safeContains(text, terms) {
  return terms.some(t => text.includes(t));
}

function inferCareerPath(text) {
  if (safeContains(text, KEYWORDS.data)) return 'Data Science / Analytics';
  if (safeContains(text, KEYWORDS.cyber)) return 'Cyber Security';
  if (safeContains(text, KEYWORDS.cloud)) return 'Cloud Computing / DevOps';
  if (safeContains(text, KEYWORDS.design)) return 'UI/UX & Product Design';
  if (safeContains(text, KEYWORDS.government)) return 'Government / Competitive Exams';
  if (safeContains(text, KEYWORDS.higherStudies)) return 'Higher Studies / Research';
  if (safeContains(text, KEYWORDS.software)) return 'Software Development';
  return 'Technology Career Path';
}

function inferConfidence(text) {
  if (safeContains(text, ['high confidence', 'very confident', 'confident', 'strong confidence'])) return 'high';
  if (safeContains(text, ['low confidence', 'not confident', 'little confidence', 'less confident'])) return 'low';
  return 'moderate';
}

function inferCodingLevel(text) {
  if (safeContains(text, ['advanced', 'experienced', 'proficient', 'strong coding', 'good coding', 'good at coding'])) return 'advanced';
  if (safeContains(text, ['beginner', 'basic', 'learning', 'just started', 'novice'])) return 'beginner';
  return 'intermediate';
}

function inferRoadmapAwareness(text) {
  if (safeContains(text, ['clear plan', 'roadmap', 'path', 'next steps', 'structured learning', 'prepared plan'])) return 'high';
  if (safeContains(text, ['not sure', 'uncertain', 'confused', 'no idea', 'don’t know', 'dont know'])) return 'low';
  return 'medium';
}

function inferInternshipExperience(text) {
  return safeContains(text, ['internship', 'intern', 'project', 'training', 'hands-on', 'work experience']);
}

function inferCommunication(text) {
  if (safeContains(text, ['good communication', 'confidence in speaking', 'presentation', 'group discussion', 'writing skills'])) return 'good';
  if (safeContains(text, ['shy', 'nervous', 'not comfortable', 'poor communication', 'difficulty speaking'])) return 'weak';
  return 'average';
}

function inferMotivation(text) {
  if (safeContains(text, ['passion', 'eager', 'excited', 'very interested', 'enthusiastic', 'love'])) return 'high';
  if (safeContains(text, ['maybe', 'not sure', 'uncertain', 'not very interested'])) return 'low';
  return 'moderate';
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
  const text = extractText(response);
  const careerPath = inferCareerPath(text);
  const confidence = inferConfidence(text);
  const codingLevel = inferCodingLevel(text);
  const roadmapAwareness = inferRoadmapAwareness(text);
  const hasInternship = inferInternshipExperience(text);
  const communication = inferCommunication(text);
  const motivation = inferMotivation(text);

  const data = {
    careerPath,
    confidence,
    codingLevel,
    roadmapAwareness,
    hasInternship,
    communication,
    motivation
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
    scores: {
      careerClarity: data.roadmapAwareness === 'high' ? 85 : data.roadmapAwareness === 'medium' ? 65 : 45,
      confidence: data.confidence === 'high' ? 80 : data.confidence === 'medium' ? 60 : 40,
      technicalReadiness: data.codingLevel === 'advanced' ? 80 : data.codingLevel === 'intermediate' ? 60 : 40,
      learningAttitude: data.motivation === 'high' ? 80 : data.motivation === 'moderate' ? 65 : 50,
      placementReadiness: data.hasInternship ? 70 : 50,
      communicationReadiness: data.communication === 'good' ? 75 : data.communication === 'average' ? 60 : 45,
      motivation: data.motivation === 'high' ? 80 : data.motivation === 'moderate' ? 65 : 50,
      riskLevel: data.confidence === 'low' ? 75 : data.confidence === 'high' ? 40 : 55,
      overall: Math.round((data.codingLevel === 'advanced' ? 80 : data.codingLevel === 'intermediate' ? 65 : 50) * 0.4 + (data.motivation === 'high' ? 75 : data.motivation === 'moderate' ? 65 : 55) * 0.3 + (data.confidence === 'high' ? 70 : data.confidence === 'medium' ? 55 : 45) * 0.3)
    }
  };

  if (fallbackReason) {
    report.fallbackReason = fallbackReason;
  }

  return report;
}

module.exports = { buildFinalReport };
