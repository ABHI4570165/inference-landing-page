const crypto = require('crypto');
const CounsellingReport = require('../models/CounsellingReport');
const CounsellingQuestion = require('../models/CounsellingQuestion');
const { buildFinalReport } = require('./localCounsellingEngine');
const { sendGeminiPrompt } = require('./geminiService');
const { sendOllamaPrompt, OLLAMA_MODEL } = require('./ollamaService');

const MAX_GEMINI_RETRIES = 2;
const MAX_OLLAMA_RETRIES = 1; // local CPU inference is slow — don't retry aggressively
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MAX_PROMPT_CHARS = 14000;
const MAX_PROMPT_TOKENS = 2800;
const PROMPT_DUPLICATE_WINDOW_MS = 60 * 1000;

const reportGenerationLocks = new Map();
const promptHistory = new Map();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildGeminiPrompt(response, questions, baseScores, totalGot, totalMax) {
  const answerData = response.answers.map(answer => {
    const question = questions.find(q => String(q._id) === String(answer.question));
    return {
      code: question?.code || answer.code || null,
      sectionKey: question?.sectionKey || answer.sectionKey || null,
      selected: answer.selected || [],
      otherText: answer.otherText || null,
      points: answer.points || 0
    };
  });

  const condensed = {
    student: {
      id: String(response.student || 'unknown'),
      name: response.name,
      college: response.college,
      branch: response.branch || 'N/A',
      attendanceDate: response.attendanceDate,
      questionnaireScore: `${totalGot}/${totalMax}`
    },
    baselineScores: baseScores,
    answers: answerData
  };

  return `You are an experienced career counsellor. Given the student metadata and answers below, produce a JSON object only with these keys:\n` +
    `overallPersonality, technicalInterest, careerReadiness, learningBehaviour, confidenceAnalysis, skillGapAnalysis, strengths, weaknesses, communicationAssessment, placementReadiness, recommendedCareerPath, recommendedTrainingPlan, counsellorRecommendation, careerFit, scores\n` +
    `strengths and weaknesses should be arrays of short phrases. careerFit should be an array of objects with path and reason. scores should contain integer values for careerClarity, confidence, technicalReadiness, learningAttitude, placementReadiness, communicationReadiness, motivation, riskLevel, overall.\n` +
    `Do not include markdown or extra explanation. Output valid JSON only.\n\n` +
    `Student metadata and answers:\n${JSON.stringify(condensed, null, 2)}`;
}

function buildCompressedGeminiPrompt(response, questions, baseScores, totalGot, totalMax) {
  const condensed = {
    student: {
      id: String(response.student || 'unknown'),
      name: response.name,
      college: response.college,
      branch: response.branch || 'N/A',
      attendanceDate: response.attendanceDate,
      questionnaireScore: `${totalGot}/${totalMax}`
    },
    baselineScores: baseScores,
    answers: questions.map(q => {
      const answer = response.answers.find(a => String(a.question) === String(q._id));
      return {
        code: q.code,
        sectionKey: q.sectionKey,
        sectionTitle: q.sectionTitle,
        question: q.text,
        selected: answer?.selected || [],
        otherText: answer?.otherText || null,
        points: answer?.points || 0
      };
    })
  };

  return `You are an experienced career counsellor. Given the student's answers below, produce a JSON object only with these keys:\n` +
    `overallPersonality, technicalInterest, careerReadiness, learningBehaviour, confidenceAnalysis, skillGapAnalysis, strengths, weaknesses, communicationAssessment, placementReadiness, recommendedCareerPath, recommendedTrainingPlan, counsellorRecommendation, careerFit, scores\n` +
    `strengths and weaknesses should be arrays of short phrases. careerFit should be an array of objects with path and reason. scores should contain integer values for careerClarity, confidence, technicalReadiness, learningAttitude, placementReadiness, communicationReadiness, motivation, riskLevel, overall.\n` +
    `Do not include markdown or extra explanation. Output valid JSON only.\n\n` +
    `Student metadata:\n${JSON.stringify(condensed.student, null, 2)}\n\n` +
    `Baseline scores:\n${JSON.stringify(condensed.baselineScores, null, 2)}\n\n` +
    `Questionnaire answer summary (JSON):\n${JSON.stringify(condensed.answers, null, 2)}`;
}

function shouldCompressPrompt(prompt) {
  return prompt.length > MAX_PROMPT_CHARS || estimateTokens(prompt) > MAX_PROMPT_TOKENS;
}

function prunePromptHistory() {
  const now = Date.now();
  for (const [hash, entry] of promptHistory.entries()) {
    if (now - entry.timestamp > PROMPT_DUPLICATE_WINDOW_MS) promptHistory.delete(hash);
  }
}

function recordPromptHash(prompt, response) {
  const hash = crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
  const now = Date.now();
  const existing = promptHistory.get(hash);
  if (existing) {
    console.warn(`[Gemini][duplicate] detected duplicate prompt for response=${String(response._id)} student=${String(response.student)} within ${PROMPT_DUPLICATE_WINDOW_MS}ms`);
  }
  promptHistory.set(hash, { timestamp: now, responseId: String(response._id), studentId: String(response.student) });
  prunePromptHistory();
}

function acquireReportLock(responseId) {
  const id = String(responseId);
  if (reportGenerationLocks.has(id)) {
    const err = new Error(`Report generation already in progress for response ${id}`);
    err.name = 'ReportGenerationLockedError';
    throw err;
  }
  reportGenerationLocks.set(id, { startedAt: Date.now() });
}

function releaseReportLock(responseId) {
  reportGenerationLocks.delete(String(responseId));
}

function logPromptStats(prompt, questions, response) {
  const promptLength = prompt.length;
  const estimatedTokens = estimateTokens(prompt);
  const questionCount = questions.length;
  const answerCount = response.answers.length;
  console.info(`[Gemini][prompt] response=${String(response._id)} student=${String(response.student)} promptChars=${promptLength} estTokens=${estimatedTokens} questions=${questionCount} answers=${answerCount}`);
}

function isTransientGeminiError(err) {
  const status = Number(err.status || err.response?.status || 0);
  if (status >= 500 && status < 600) return true;
  const transientMessages = ['timeout', 'timed out', 'network', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'connection refused'];
  const msg = String(err.message || '').toLowerCase();
  return transientMessages.some(token => msg.includes(token));
}

async function callGemini(prompt, response, attempt) {
  recordPromptHash(prompt, response);
  return sendGeminiPrompt(prompt, GEMINI_MODEL, {
    studentId: String(response.student),
    responseId: String(response._id),
    retryNumber: attempt
  });
}

function sanitizeFallbackReason(err) {
  const message = String(err?.message || err?.response?.statusText || err?.response?.data?.message || err?.response?.data || '').trim();
  if (!message) {
    return 'Gemini API unavailable; using local fallback.';
  }

  const lower = message.toLowerCase();
  if (/quota|limit|rate limit|resource_exhausted|429/.test(lower)) {
    return 'Gemini API quota limit reached; using local fallback.';
  }
  if (/api key|authentication|unauthorized|403|401|forbidden/.test(lower)) {
    return 'Gemini API authentication error; using local fallback.';
  }
  if (/timeout|timed out|network|connection reset|econrreset|eai_again|enotfound/.test(lower)) {
    return 'Gemini API request failed; using local fallback.';
  }
  return 'Gemini API unavailable; using local fallback.';
}

async function generateGeminiReport(response, questions, baseScores, totalGot, totalMax) {
  let lastError = null;
  let prompt = buildGeminiPrompt(response, questions, baseScores, totalGot, totalMax);
  let compressed = false;

  if (shouldCompressPrompt(prompt)) {
    console.warn(`[Gemini][compress] prompt too large for response=${String(response._id)}; switching to structured JSON payload`);
    prompt = buildCompressedGeminiPrompt(response, questions, baseScores, totalGot, totalMax);
    compressed = true;
  }

  logPromptStats(prompt, questions, response);

  for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
    try {
      const output = await callGemini(prompt, response, attempt);
      const parsed = JSON.parse(output);
      return parsed;
    } catch (err) {
      lastError = err;
      const status = Number(err.status || err.response?.status || 0);
      console.warn(`[Gemini][attempt] response=${String(response._id)} student=${String(response.student)} attempt=${attempt} status=${status} error=${err.message || err}`);
      if (attempt < MAX_GEMINI_RETRIES) {
        await delay(1000 * attempt);
        continue;
      }
      break;
    }
  }

  throw lastError;
}

// ── Local LLM fallback (Ollama) ─────────────────────────────────────────────
// Same prompt/JSON-shape as Gemini so the two AI sources are interchangeable
// from generateReport's point of view. Tried only after Gemini fails, before
// giving up to the deterministic local rule-engine.
async function generateOllamaReport(response, questions, baseScores, totalGot, totalMax) {
  let prompt = buildGeminiPrompt(response, questions, baseScores, totalGot, totalMax);
  if (shouldCompressPrompt(prompt)) {
    prompt = buildCompressedGeminiPrompt(response, questions, baseScores, totalGot, totalMax);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_OLLAMA_RETRIES; attempt += 1) {
    try {
      const output = await sendOllamaPrompt(prompt);
      return JSON.parse(output);
    } catch (err) {
      lastError = err;
      console.warn(`[Ollama][attempt] response=${String(response._id)} student=${String(response.student)} attempt=${attempt} error=${err.message || err}`);
      if (attempt < MAX_OLLAMA_RETRIES) continue;
    }
  }
  throw lastError;
}

// ── Deterministic metric scores ─────────────────────────────────────────────
// Aggregates option points by each question's metricTags. Editable questions
// keep this working: tags live on the question document, not in code.
// riskLevel is inverted (low points on risk-tagged questions ⇒ high risk).
const METRICS = [
  'careerClarity', 'confidence', 'technicalReadiness', 'learningAttitude',
  'placementReadiness', 'communicationReadiness', 'motivation', 'riskLevel'
];

function computeMetricScores(response, questions) {
  const byId = new Map(questions.map(q => [String(q._id), q]));
  const buckets = {}; // metric -> { got, max }
  METRICS.forEach(m => { buckets[m] = { got: 0, max: 0 }; });

  let totalGot = 0, totalMax = 0;

  for (const q of questions) {
    const qMax = q.options.length ? Math.max(...q.options.map(o => o.points || 0)) : 0;
    totalMax += qMax;
  }

  for (const ans of response.answers) {
    const q = byId.get(String(ans.question));
    if (!q) continue;
    const qMax = q.options.length ? Math.max(...q.options.map(o => o.points || 0)) : 0;
    totalGot += ans.points || 0;
    for (const tag of q.metricTags || []) {
      if (!buckets[tag]) continue;
      buckets[tag].got += ans.points || 0;
      buckets[tag].max += qMax;
    }
  }

  const pct = (got, max) => (max > 0 ? Math.round((got / max) * 100) : 0);
  const scores = {};
  for (const m of METRICS) {
    scores[m] = pct(buckets[m].got, buckets[m].max);
  }
  scores.riskLevel = 100 - scores.riskLevel; // invert: fewer points ⇒ more risk
  scores.overall = pct(totalGot, totalMax);
  // Placement readiness blends its own tag with overall preparation
  scores.placementReadiness = Math.round((scores.placementReadiness + scores.overall) / 2);
  return { scores, totalGot, totalMax };
}

// ── Claude structured-output schema ─────────────────────────────────────────
const strList = { type: 'array', items: { type: 'string' } };
const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overallPersonality', 'technicalInterest', 'careerReadiness', 'strengths',
    'weaknesses', 'behaviourAnalysis', 'careerFit', 'trainingRecommendation',
    'counsellorRecommendation', 'scores'
  ],
  properties: {
    overallPersonality: { type: 'string' },
    technicalInterest:  { type: 'string' },
    careerReadiness:    { type: 'string' },
    strengths:  strList,
    weaknesses: strList,
    behaviourAnalysis: {
      type: 'object',
      additionalProperties: false,
      required: ['learningStyle', 'problemSolving', 'decisionMaking', 'confidence',
                 'riskTaking', 'leadership', 'teamWork', 'communication', 'adaptability'],
      properties: {
        learningStyle: { type: 'string' }, problemSolving: { type: 'string' },
        decisionMaking: { type: 'string' }, confidence: { type: 'string' },
        riskTaking: { type: 'string' }, leadership: { type: 'string' },
        teamWork: { type: 'string' }, communication: { type: 'string' },
        adaptability: { type: 'string' }
      }
    },
    careerFit: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'reason'],
        properties: { path: { type: 'string' }, reason: { type: 'string' } }
      }
    },
    trainingRecommendation: {
      type: 'object',
      additionalProperties: false,
      required: ['courses', 'skills', 'certifications', 'projects', 'softSkills',
                 'interviewPrep', 'timeline'],
      properties: {
        courses: strList, skills: strList, certifications: strList,
        projects: strList, softSkills: strList, interviewPrep: strList,
        timeline: { type: 'string' }
      }
    },
    counsellorRecommendation: { type: 'string' },
    scores: {
      type: 'object',
      additionalProperties: false,
      required: METRICS.concat('overall'),
      properties: Object.fromEntries(
        METRICS.concat('overall').map(m => [m, { type: 'integer' }])
      )
    }
  }
};

const SYSTEM_PROMPT = `You are an experienced career counsellor at an engineering training academy in India. You are given a student's answers to a self-assessment questionnaire for Junior Data Analyst / Junior Data Engineer roles.

Write a professional counselling report. Do NOT simply repeat the answers back — infer the student's personality, motivation, readiness and gaps from the pattern of their responses. Cross-check self-ratings (Section H) against actual technical exposure and effort (Sections C and D): if self-rating is high but exposure/effort is low, note that the self-assessment appears inflated. High interest with low effort means "interested in words only". Preparation for higher studies or government exams is an attrition risk.

Style requirements:
- Write like an experienced human counsellor: warm, professional, specific, honest.
- "strengths": 6 to 10 short phrases. "weaknesses": 4 to 8 short phrases covering skill gaps, communication, roadmap, confidence, coding, projects, interview readiness as applicable.
- "careerFit": 2 to 4 recommended paths (e.g. Software Development, Data Analytics, Data Engineering, Data Science, Cyber Security, Cloud, Government, Higher Studies, Entrepreneurship) each with a one-to-two sentence reason grounded in the answers.
- "counsellorRecommendation": a single flowing paragraph of 300 to 500 words, no bullet points and no headings. Reading only this paragraph, a counsellor must understand who this student is, what they need, where they struggle, what motivates them, and how to guide them in the conversation.
- "scores": integers 0-100. You are given rubric-derived baseline scores; adjust them only where the qualitative picture justifies it (stay within about 15 points of each baseline). riskLevel is a RISK (higher = more likely to drop off / not join).`;

function buildTranscript(response, questions) {
  const byId = new Map(questions.map(q => [String(q._id), q]));
  const lines = [];
  let currentSection = '';
  for (const ans of response.answers) {
    const q = byId.get(String(ans.question));
    const sectionKey = q ? q.sectionKey : ans.sectionKey;
    const sectionTitle = q ? q.sectionTitle : '';
    if (sectionKey !== currentSection) {
      currentSection = sectionKey;
      lines.push(`\n## Section ${sectionKey} — ${sectionTitle}`);
    }
    const text = q ? q.text : ans.questionText;
    let answer = ans.selected.map(s => (s === '__other__' ? 'Other' : s)).join('; ');
    if (ans.otherText) answer += (answer ? ' — Other: ' : 'Other: ') + ans.otherText;
    lines.push(`${ans.code}. ${text}\nAnswer: ${answer || '(not answered)'} [${ans.points} pts]`);
  }
  return lines.join('\n');
}

// ── Report generation ───────────────────────────────────────────────────────
// Called fire-and-forget after submission, and from the admin "regenerate"
// action. Always writes a CounsellingReport document; if the AI call fails
// the rubric-derived scores are still stored so dashboards keep working.
async function generateReport(response) {
  const existingReport = await CounsellingReport.findOne({ response: response._id }).lean();
  if (existingReport?.status === 'generating') {
    const err = new Error(`Report generation already in progress for response ${response._id}`);
    err.name = 'ReportGenerationLockedError';
    throw err;
  }

  acquireReportLock(response._id);
  try {
    const questions = await CounsellingQuestion.find({}).lean();
    const { scores: baseScores, totalGot, totalMax } = computeMetricScores(response, questions);

    let report = await CounsellingReport.findOneAndUpdate(
      { response: response._id, status: { $ne: 'generating' } },
      {
        response: response._id,
        student: response.student,
        status: 'generating',
        scores: baseScores,
        error: null,
        fallbackReason: null
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (!report) {
      const err = new Error(`Report generation already in progress for response ${response._id}`);
      err.name = 'ReportGenerationLockedError';
      throw err;
    }

    // Shared by both real AI sources (Gemini and Ollama produce the same JSON
    // shape) — only reportSource/generatedBy/aiModel differ between them.
    function applyAiData(reportSource, generatedBy, aiModel, data) {
      const scores = {};
      for (const m of METRICS.concat('overall')) {
        const v = Number(data.scores?.[m]);
        scores[m] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : baseScores[m];
      }
      report.set({
        status: 'completed',
        aiStatus: 'Completed',
        reportSource,
        generatedBy,
        fallbackReason: null,
        overallPersonality: data.overallPersonality,
        technicalInterest: data.technicalInterest,
        careerReadiness: data.careerReadiness,
        learningBehaviour: data.learningBehaviour,
        confidenceAnalysis: data.confidenceAnalysis,
        skillGapAnalysis: data.skillGapAnalysis,
        strengths: data.strengths || [],
        weaknesses: data.weaknesses || [],
        behaviourAnalysis: data.behaviourAnalysis || {},
        careerFit: data.careerFit || [],
        trainingRecommendation: data.trainingRecommendation || {},
        recommendedCareerPath: data.recommendedCareerPath || '',
        recommendedTrainingPlan: data.recommendedTrainingPlan || '',
        counsellorRecommendation: data.counsellorRecommendation,
        scores,
        aiModel,
        generatedAt: new Date(),
        error: null
      });
    }

    try {
      const geminiData = await generateGeminiReport(response, questions, baseScores, totalGot, totalMax);
      applyAiData('Gemini', 'Gemini', GEMINI_MODEL, geminiData);
      await report.save();
      return report;
    } catch (geminiErr) {
      console.error(`[AI Report] Gemini generation failed for response ${response._id}:`, geminiErr.message);

      try {
        const ollamaData = await generateOllamaReport(response, questions, baseScores, totalGot, totalMax);
        applyAiData('Ollama', 'Ollama (local)', OLLAMA_MODEL, ollamaData);
        report.set({ fallbackReason: `Gemini unavailable (${sanitizeFallbackReason(geminiErr)}); used local Ollama model instead.` });
        await report.save();
        return report;
      } catch (ollamaErr) {
        console.error(`[AI Report] Ollama generation failed for response ${response._id}:`, ollamaErr.message);
        const fallbackReason = `${sanitizeFallbackReason(geminiErr)} Local Ollama model also unavailable (${ollamaErr.message}).`;
        const localData = buildFinalReport(response, questions, baseScores, fallbackReason);
        const scores = localData.scores || baseScores;

        report.set({
          status: 'completed',
          aiStatus: 'Fallback',
          reportSource: 'Local Engine',
          generatedBy: 'Rule Engine',
          fallbackReason,
          overallPersonality: localData.overallPersonality,
          technicalInterest: localData.technicalInterest,
          careerReadiness: localData.careerReadiness,
          learningBehaviour: localData.learningBehaviour,
          confidenceAnalysis: localData.confidenceAnalysis,
          skillGapAnalysis: localData.skillGapAnalysis,
          strengths: localData.strengths || [],
          weaknesses: localData.weaknesses || [],
          behaviourAnalysis: localData.behaviourAnalysis || {},
          careerFit: localData.careerFit || [],
          trainingRecommendation: localData.trainingRecommendation || {},
          recommendedCareerPath: localData.recommendedCareerPath || '',
          recommendedTrainingPlan: localData.recommendedTrainingPlan || '',
          counsellorRecommendation: localData.counsellorRecommendation,
          scores,
          aiModel: 'local-rule-engine',
          generatedAt: new Date(),
          error: null
        });
        await report.save();
        return report;
      }
    }
  } finally {
    releaseReportLock(response._id);
  }
}

// Fire-and-forget wrapper used by the submit endpoint
function generateReportInBackground(response) {
  generateReport(response).catch(err => {
    if (err.name === 'ReportGenerationLockedError') {
      console.info(`[AI Report] background generation skipped; report already generating for response ${response._id}`);
      return;
    }
    console.error('[AI Report] background generation error:', err);
  });
}

module.exports = { generateReport, generateReportInBackground, computeMetricScores };
