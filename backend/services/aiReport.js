const crypto = require('crypto');
const CounsellingReport = require('../models/CounsellingReport');
const CounsellingQuestion = require('../models/CounsellingQuestion');
const { buildFinalReport } = require('./localCounsellingEngine');
const { sendGeminiPrompt } = require('./geminiService');
const { sendOllamaPrompt, OLLAMA_MODEL } = require('./ollamaService');
const { sendHuggingFacePrompt, HF_MODEL } = require('./huggingFaceService');

const MAX_GEMINI_RETRIES = 2;
const MAX_OLLAMA_RETRIES = 1; // local CPU inference is slow — don't retry aggressively
const MAX_HF_RETRIES = 1;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MAX_PROMPT_CHARS = 14000;
const MAX_PROMPT_TOKENS = 2800;
const PROMPT_DUPLICATE_WINDOW_MS = 60 * 1000;

const reportGenerationLocks = new Map();
const promptHistory = new Map();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Defensive coercion for fields the schema expects as a plain string (or an
// array of plain strings). LLMs occasionally drift from the requested shape
// — e.g. returning [{ topic, duration }, ...] instead of a sentence — which
// would otherwise fail Mongoose validation and discard an entire report.
// Applies to both Gemini and Ollama output, since either can drift.
function toText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${toText(v)}`)
      .filter(Boolean)
      .join(' — ');
  }
  return String(value);
}

function toTextArray(value) {
  return Array.isArray(value) ? value.map(toText).filter(Boolean) : [];
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

// ── Cloud LLM alternative (Hugging Face) ────────────────────────────────────
// Same prompt/JSON-shape as Gemini/Ollama. Only used when explicitly selected
// via AI_PROVIDER=huggingface — never part of the automatic fallback chain.
function stripJsonFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

async function generateHuggingFaceReport(response, questions, baseScores, totalGot, totalMax) {
  let prompt = buildGeminiPrompt(response, questions, baseScores, totalGot, totalMax);
  if (shouldCompressPrompt(prompt)) {
    prompt = buildCompressedGeminiPrompt(response, questions, baseScores, totalGot, totalMax);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_HF_RETRIES; attempt += 1) {
    try {
      const output = await sendHuggingFacePrompt(prompt);
      return JSON.parse(stripJsonFences(output));
    } catch (err) {
      lastError = err;
      console.warn(`[HuggingFace][attempt] response=${String(response._id)} student=${String(response.student)} attempt=${attempt} error=${err.message || err}`);
      if (attempt < MAX_HF_RETRIES) continue;
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
      const tr = data.trainingRecommendation || {};
      const behaviour = data.behaviourAnalysis || {};

      report.set({
        status: 'completed',
        aiStatus: 'Completed',
        reportSource,
        generatedBy,
        fallbackReason: null,
        overallPersonality: toText(data.overallPersonality),
        technicalInterest: toText(data.technicalInterest),
        careerReadiness: toText(data.careerReadiness),
        learningBehaviour: toText(data.learningBehaviour),
        confidenceAnalysis: toText(data.confidenceAnalysis),
        skillGapAnalysis: toText(data.skillGapAnalysis),
        strengths: toTextArray(data.strengths),
        weaknesses: toTextArray(data.weaknesses),
        behaviourAnalysis: Object.fromEntries(
          Object.keys(behaviour).map(k => [k, toText(behaviour[k])])
        ),
        careerFit: (Array.isArray(data.careerFit) ? data.careerFit : []).map(c => ({
          path: toText(c?.path), reason: toText(c?.reason)
        })),
        trainingRecommendation: {
          courses: toTextArray(tr.courses),
          skills: toTextArray(tr.skills),
          certifications: toTextArray(tr.certifications),
          projects: toTextArray(tr.projects),
          softSkills: toTextArray(tr.softSkills),
          interviewPrep: toTextArray(tr.interviewPrep),
          timeline: toText(tr.timeline)
        },
        recommendedCareerPath: toText(data.recommendedCareerPath),
        recommendedTrainingPlan: toText(data.recommendedTrainingPlan),
        counsellorRecommendation: toText(data.counsellorRecommendation),
        scores,
        aiModel,
        generatedAt: new Date(),
        error: null
      });
    }

    // Shared last-resort fallback — deterministic report from this student's
    // own rubric scores. Used whichever AI path (Gemini, Ollama, Hugging
    // Face) was attempted, so a report always gets produced.
    function applyLocalFallback(fallbackReason) {
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
    }

    // Explicit provider selection — set AI_PROVIDER=huggingface in
    // backend/.env to skip Gemini AND Ollama entirely and always generate via
    // Hugging Face's hosted model. Independent of the Ollama override below;
    // only one of AI_PROVIDER's values is ever active at a time.
    if (process.env.AI_PROVIDER === 'huggingface') {
      try {
        const hfData = await generateHuggingFaceReport(response, questions, baseScores, totalGot, totalMax);
        applyAiData('Hugging Face', 'Hugging Face', HF_MODEL, hfData);
        report.set({ fallbackReason: 'AI_PROVIDER=huggingface is set — generated directly via Hugging Face.' });
        await report.save();
        return report;
      } catch (hfErr) {
        console.error(`[AI Report] Hugging Face generation failed for response ${response._id}:`, hfErr.message);
        applyLocalFallback(`AI_PROVIDER=huggingface is set, but Hugging Face failed (${hfErr.message}).`);
        await report.save();
        return report;
      }
    }

    // Local dev/testing override — set AI_PROVIDER=ollama in backend/.env to
    // skip Gemini entirely and always generate via the local Ollama model.
    // Unset (the default, and always the case in production) preserves the
    // normal Gemini -> Ollama -> rule-engine chain exactly as before.
    const forceOllama = process.env.AI_PROVIDER === 'ollama';

    try {
      if (forceOllama) {
        const err = new Error('AI_PROVIDER=ollama is set — skipping Gemini');
        err.forcedSkip = true;
        throw err;
      }
      const geminiData = await generateGeminiReport(response, questions, baseScores, totalGot, totalMax);
      applyAiData('Gemini', 'Gemini', GEMINI_MODEL, geminiData);
      await report.save();
      return report;
    } catch (geminiErr) {
      if (geminiErr.forcedSkip) {
        console.info(`[AI Report] AI_PROVIDER=ollama set for response ${response._id} — generating via Ollama directly`);
      } else {
        console.error(`[AI Report] Gemini generation failed for response ${response._id}:`, geminiErr.message);
      }

      try {
        const ollamaData = await generateOllamaReport(response, questions, baseScores, totalGot, totalMax);
        applyAiData('Ollama', 'Ollama (local)', OLLAMA_MODEL, ollamaData);
        report.set({
          fallbackReason: geminiErr.forcedSkip
            ? 'AI_PROVIDER=ollama is set — generated directly via the local Ollama model.'
            : `Gemini unavailable (${sanitizeFallbackReason(geminiErr)}); used local Ollama model instead.`
        });
        await report.save();
        return report;
      } catch (ollamaErr) {
        console.error(`[AI Report] Ollama generation failed for response ${response._id}:`, ollamaErr.message);
        const fallbackReason = geminiErr.forcedSkip
          ? `AI_PROVIDER=ollama is set, but the local Ollama model failed (${ollamaErr.message}).`
          : `${sanitizeFallbackReason(geminiErr)} Local Ollama model also unavailable (${ollamaErr.message}).`;
        applyLocalFallback(fallbackReason);
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
