const CounsellingReport = require('../models/CounsellingReport');
const CounsellingQuestion = require('../models/CounsellingQuestion');
const { buildFinalReport } = require('./localCounsellingEngine');
const { sendOllamaPrompt, OLLAMA_MODEL } = require('./ollamaService');
const { sendHuggingFacePrompt, HF_MODEL } = require('./huggingFaceService');

const MAX_OLLAMA_RETRIES = 1; // local CPU inference is slow — don't retry aggressively
const MAX_HF_RETRIES = 2;
const MAX_PROMPT_CHARS = 14000;
const MAX_PROMPT_TOKENS = 2800;

const reportGenerationLocks = new Map();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Defensive coercion for fields the schema expects as a plain string (or an
// array of plain strings). LLMs occasionally drift from the requested shape
// — e.g. returning [{ topic, duration }, ...] instead of a sentence — which
// would otherwise fail Mongoose validation and discard an entire report.
// Applies to both Hugging Face and Ollama output, since either can drift.
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

function buildReportPrompt(response, questions, baseScores, totalGot, totalMax) {
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

  return REPORT_PROMPT_INSTRUCTIONS +
    `\n\nStudent metadata and answers:\n${JSON.stringify(condensed, null, 2)}`;
}

function buildCompressedReportPrompt(response, questions, baseScores, totalGot, totalMax) {
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

  return REPORT_PROMPT_INSTRUCTIONS +
    `\n\nStudent metadata:\n${JSON.stringify(condensed.student, null, 2)}\n\n` +
    `Baseline scores:\n${JSON.stringify(condensed.baselineScores, null, 2)}\n\n` +
    `Questionnaire answer summary (JSON):\n${JSON.stringify(condensed.answers, null, 2)}`;
}

function shouldCompressPrompt(prompt) {
  return prompt.length > MAX_PROMPT_CHARS || estimateTokens(prompt) > MAX_PROMPT_TOKENS;
}

// How long a 'generating' lease stays valid. Generation is a couple of AI
// calls with their own timeouts; anything still 'generating' after this was
// abandoned by a process that is no longer running.
const GENERATION_LEASE_MS = 10 * 60 * 1000;

// True when a 'generating' report was left behind by a run that is definitely
// gone: this process is not the one holding it, and its lease has expired
// (or it predates leases entirely, so it has no start timestamp at all).
function isStaleGeneration(report) {
  if (!report || report.status !== 'generating') return false;
  if (reportGenerationLocks.has(String(report.response))) return false; // alive here
  if (!report.generationStartedAt) return true;                          // pre-lease record
  return Date.now() - new Date(report.generationStartedAt).getTime() > GENERATION_LEASE_MS;
}

// Called once at boot. A process that has only just started cannot be running
// any generation, so every report still marked 'generating' is orphaned from a
// previous run. They are moved to 'failed' with an explanation, which makes
// them visible in the admin UI and regenerable — rather than sitting on a blue
// "generating" badge that would never resolve.
async function recoverOrphanedReports() {
  try {
    const result = await CounsellingReport.updateMany(
      { status: 'generating' },
      {
        $set: {
          status: 'failed',
          error: 'Report generation was interrupted (the server restarted while it was running). Regenerate to try again.'
        }
      }
    );
    if (result.modifiedCount > 0) {
      console.log(`✅  Recovered ${result.modifiedCount} interrupted AI report(s) — they can now be regenerated`);
    }
  } catch (err) {
    console.error('[AI Report] failed to recover orphaned reports:', err.message);
  }
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


// ── Local LLM (Ollama) — second tier of the default chain ──────────────────
// Same prompt/JSON-shape as Hugging Face, so the two AI sources are
// interchangeable from generateReport's point of view. Only reachable when
// running the backend on the same machine as Ollama (e.g. local dev).
async function generateOllamaReport(response, questions, baseScores, totalGot, totalMax) {
  let prompt = buildReportPrompt(response, questions, baseScores, totalGot, totalMax);
  if (shouldCompressPrompt(prompt)) {
    prompt = buildCompressedReportPrompt(response, questions, baseScores, totalGot, totalMax);
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

// ── Cloud LLM (Hugging Face) — first tier of the default chain ─────────────
// Same prompt/JSON-shape as Ollama. Retried once on timeout/transient
// failure before falling to Ollama, since the free-tier router's latency
// varies (seen anywhere from ~7s to a 60s timeout).
function stripJsonFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

async function generateHuggingFaceReport(response, questions, baseScores, totalGot, totalMax) {
  let prompt = buildReportPrompt(response, questions, baseScores, totalGot, totalMax);
  if (shouldCompressPrompt(prompt)) {
    prompt = buildCompressedReportPrompt(response, questions, baseScores, totalGot, totalMax);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_HF_RETRIES; attempt += 1) {
    try {
      const output = await sendHuggingFacePrompt(prompt);
      return JSON.parse(stripJsonFences(output));
    } catch (err) {
      lastError = err;
      console.warn(`[HuggingFace][attempt] response=${String(response._id)} student=${String(response.student)} attempt=${attempt} error=${err.message || err}`);
      if (attempt < MAX_HF_RETRIES) { await delay(1000 * attempt); continue; }
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

// ── The actual prompt instructions sent to every AI provider ───────────────
// Single source of truth for what a report must contain — kept in sync with
// exactly the fields applyAiData() reads (see generateReport below). Written
// to be explicit about length/count/shape because these models (Ollama's
// llama3.1:8b, Hugging Face's hosted Llama) take instructions literally and
// go terse without them.
const REPORT_PROMPT_INSTRUCTIONS = `You are an experienced career counsellor at an engineering training academy in India, reviewing a student's self-assessment questionnaire for Junior Data Analyst / Junior Data Engineer roles.

Write a professional counselling report. Do NOT simply repeat the answers back — infer the student's personality, motivation, readiness and gaps from the pattern of their responses. Cross-check self-ratings (Section H) against actual technical exposure and effort (Sections C and D): if self-rating is high but exposure/effort is low, note that the self-assessment appears inflated. High interest with low effort means "interested in words only". Preparation for higher studies or government exams is an attrition risk. Write like an experienced human counsellor: warm, professional, specific, honest — never generic filler.

Produce a JSON object only, with exactly these keys and nothing else:

- overallPersonality (string, 2-4 sentences)
- technicalInterest (string, 2-3 sentences)
- careerReadiness (string, 2-3 sentences)
- learningBehaviour (string, 1-2 sentences)
- confidenceAnalysis (string, 1-2 sentences)
- skillGapAnalysis (string, 1-2 sentences)
- strengths: array of 6 to 10 short phrases
- weaknesses: array of 4 to 8 short phrases covering skill gaps, communication, roadmap, confidence, coding, projects, interview readiness as applicable
- behaviourAnalysis: object with exactly these string keys, one sentence each — learningStyle, problemSolving, decisionMaking, confidence, riskTaking, leadership, teamWork, communication, adaptability
- careerFit: array of 2 to 4 objects {path, reason} — recommended paths (e.g. Software Development, Data Analytics, Data Engineering, Data Science, Cyber Security, Cloud, Government, Higher Studies, Entrepreneurship), each reason a one-to-two sentence explanation grounded in the answers
- trainingRecommendation: object with courses, skills, certifications, projects, softSkills, interviewPrep (each an array of 2-5 short strings) and timeline (a one-sentence string)
- recommendedCareerPath (string, one sentence)
- recommendedTrainingPlan (string, one sentence)
- practicalExperience: a focused paragraph (100-200 words) specifically about the student's hands-on experience, grounded ONLY in their answers to question Q34 ("Describe your college project") and Q35 ("Where did you do your final year internship? Was it paid, stipend-based, or unpaid? What did you learn from it?"). Cover: what the project does and their role in it, and where/how the internship was structured (paid/stipend/unpaid) and what they took away from it. If either Q34 or Q35 was left blank, say so plainly (e.g. "No internship completed yet") instead of inventing details.
- counsellorRecommendation: a single flowing paragraph of 300 to 500 words, no bullet points and no headings. Reading only this paragraph, a counsellor must understand who this student is, what they need, where they struggle, what motivates them, and how to guide them in the conversation.
- scores: object with integer 0-100 values for careerClarity, confidence, technicalReadiness, learningAttitude, placementReadiness, communicationReadiness, motivation, riskLevel, overall. You are given rubric-derived baseline scores below; adjust them only where the qualitative picture justifies it (stay within about 15 points of each baseline). riskLevel is a RISK (higher = more likely to drop off / not join).

Do not include markdown, code fences, or any explanation outside the JSON object. Output valid JSON only.`;

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

  // A 'generating' report only blocks a new attempt while that attempt is
  // genuinely alive. Without this check a report whose process was killed
  // mid-generation stays 'generating' forever AND can never be regenerated,
  // because every retry is rejected by the very status the dead run left behind.
  if (existingReport?.status === 'generating' && !isStaleGeneration(existingReport)) {
    const err = new Error(`Report generation already in progress for response ${response._id}`);
    err.name = 'ReportGenerationLockedError';
    throw err;
  }
  if (existingReport?.status === 'generating') {
    console.warn(
      `[AI Report] reclaiming stale generation for response ${response._id} ` +
      `(started ${existingReport.generationStartedAt ? existingReport.generationStartedAt.toISOString() : 'unknown'})`
    );
  }

  acquireReportLock(response._id);
  try {
    const questions = await CounsellingQuestion.find({}).lean();
    const { scores: baseScores, totalGot, totalMax } = computeMetricScores(response, questions);

    // The in-process lock above already prevents two concurrent runs here, and
    // the staleness check above rejects a live one from another process, so
    // this claims the lease unconditionally and stamps when it started.
    let report = await CounsellingReport.findOneAndUpdate(
      { response: response._id },
      {
        response: response._id,
        student: response.student,
        workspace: response.workspace,
        status: 'generating',
        generationStartedAt: new Date(),
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

    // Shared by both real AI sources (Hugging Face and Ollama produce the
    // same JSON shape) — only reportSource/generatedBy/aiModel differ.
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
        practicalExperience: toText(data.practicalExperience),
        counsellorRecommendation: toText(data.counsellorRecommendation),
        scores,
        aiModel,
        generatedAt: new Date(),
        error: null
      });
    }

    // Shared last-resort fallback — deterministic report from this student's
    // own rubric scores. Used whichever AI path (Hugging Face, Ollama) was
    // attempted, so a report always gets produced.
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
        practicalExperience: localData.practicalExperience || '',
        counsellorRecommendation: localData.counsellorRecommendation,
        scores,
        aiModel: 'local-rule-engine',
        generatedAt: new Date(),
        error: null
      });
    }

    // Explicit provider selection — set AI_PROVIDER to "ollama" or
    // "huggingface" in backend/.env to force only that one provider, falling
    // back straight to the local rule-engine if it fails (skips the normal
    // two-tier chain below entirely). Useful for testing one provider in
    // isolation without changing the production default.
    const provider = process.env.AI_PROVIDER;

    if (provider === 'ollama' || provider === 'huggingface') {
      const runner = provider === 'ollama'
        ? () => generateOllamaReport(response, questions, baseScores, totalGot, totalMax)
        : () => generateHuggingFaceReport(response, questions, baseScores, totalGot, totalMax);
      const label = provider === 'ollama' ? 'Ollama (local)' : 'Hugging Face';
      const aiModel = provider === 'ollama' ? OLLAMA_MODEL : HF_MODEL;
      const reportSource = provider === 'ollama' ? 'Ollama' : 'Hugging Face';

      try {
        const data = await runner();
        applyAiData(reportSource, label, aiModel, data);
        report.set({ fallbackReason: `AI_PROVIDER=${provider} is set — generated directly via ${label}.` });
        await report.save();
        return report;
      } catch (err) {
        console.error(`[AI Report] ${label} generation failed for response ${response._id}:`, err.message);
        applyLocalFallback(`AI_PROVIDER=${provider} is set, but ${label} failed (${err.message}).`);
        await report.save();
        return report;
      }
    }

    // Production default (AI_PROVIDER unset): Hugging Face -> Ollama -> rule-engine.
    try {
      const hfData = await generateHuggingFaceReport(response, questions, baseScores, totalGot, totalMax);
      applyAiData('Hugging Face', 'Hugging Face', HF_MODEL, hfData);
      await report.save();
      return report;
    } catch (hfErr) {
      console.error(`[AI Report] Hugging Face generation failed for response ${response._id}:`, hfErr.message);

      try {
        const ollamaData = await generateOllamaReport(response, questions, baseScores, totalGot, totalMax);
        applyAiData('Ollama', 'Ollama (local)', OLLAMA_MODEL, ollamaData);
        report.set({ fallbackReason: `Hugging Face unavailable (${hfErr.message}); used local Ollama model instead.` });
        await report.save();
        return report;
      } catch (ollamaErr) {
        console.error(`[AI Report] Ollama generation failed for response ${response._id}:`, ollamaErr.message);
        applyLocalFallback(`Hugging Face unavailable (${hfErr.message}). Local Ollama model also unavailable (${ollamaErr.message}).`);
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

module.exports = {
  generateReport,
  generateReportInBackground,
  computeMetricScores,
  recoverOrphanedReports,
  isStaleGeneration
};
