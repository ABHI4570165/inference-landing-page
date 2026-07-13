const router = require('express').Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const CounsellingQuestion = require('../models/CounsellingQuestion');
const CounsellingResponse = require('../models/CounsellingResponse');
const CounsellingReport = require('../models/CounsellingReport');
const AuditLog = require('../models/AuditLog');
const { generateReport } = require('../services/aiReport');

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function logAudit(action, entityType, entityId, admin, before, after, meta) {
  AuditLog.create({ action, entityType, entityId, admin, before, after, meta })
    .catch(err => console.error('[AuditLog]', err));
}

// ═══════════════════════ QUESTION MANAGEMENT ═══════════════════════════════

// GET /api/admin/counselling/questions — full list (points included)
router.get('/questions', auth, async (req, res) => {
  try {
    const questions = await CounsellingQuestion.find({}).sort({ order: 1 }).lean();
    res.json(questions);
  } catch (err) {
    console.error('[GET counselling/questions]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

function cleanQuestionBody(body) {
  const doc = {};
  if (body.sectionKey !== undefined)   doc.sectionKey = String(body.sectionKey).trim().toUpperCase().slice(0, 4);
  if (body.sectionTitle !== undefined) doc.sectionTitle = String(body.sectionTitle).trim().slice(0, 200);
  if (body.sectionNote !== undefined)  doc.sectionNote = String(body.sectionNote || '').trim().slice(0, 300);
  if (body.text !== undefined)         doc.text = String(body.text).trim().slice(0, 1000);
  if (body.code !== undefined)         doc.code = String(body.code).trim().slice(0, 20);
  if (body.order !== undefined)        doc.order = Number(body.order) || 0;
  if (body.type !== undefined)         doc.type = String(body.type);
  if (body.allowOther !== undefined)   doc.allowOther = !!body.allowOther;
  if (body.required !== undefined)     doc.required = !!body.required;
  if (body.active !== undefined)       doc.active = !!body.active;
  if (Array.isArray(body.metricTags))  doc.metricTags = body.metricTags.map(t => String(t).trim()).filter(Boolean);
  if (Array.isArray(body.options)) {
    doc.options = body.options
      .map(o => ({ label: String(o.label || '').trim().slice(0, 500), points: Number(o.points) || 0 }))
      .filter(o => o.label);
  }
  return doc;
}

// POST /api/admin/counselling/questions — add a new question
router.post('/questions', auth, async (req, res) => {
  try {
    const doc = cleanQuestionBody(req.body);
    if (!doc.text) return res.status(400).json({ message: 'Question text is required' });
    if (!doc.sectionKey || !doc.sectionTitle) return res.status(400).json({ message: 'Section key and title are required' });
    if ((doc.type === 'radio' || doc.type === 'checkbox') && (!doc.options || doc.options.length < 2)) {
      return res.status(400).json({ message: 'Choice questions need at least 2 options' });
    }
    if (!doc.code) {
      // Auto-assign the next Q-number
      const last = await CounsellingQuestion.find({}).sort({ order: -1 }).limit(1).lean();
      const maxNum = (await CounsellingQuestion.find({}).lean())
        .reduce((m, q) => Math.max(m, parseInt(String(q.code).replace(/\D/g, ''), 10) || 0), 0);
      doc.code = `Q${maxNum + 1}`;
      if (doc.order === undefined) doc.order = (last[0]?.order || 0) + 10;
    }
    if (doc.order === undefined) {
      const last = await CounsellingQuestion.find({}).sort({ order: -1 }).limit(1).lean();
      doc.order = (last[0]?.order || 0) + 10;
    }

    const question = await CounsellingQuestion.create(doc);
    logAudit('question.create', 'CounsellingQuestion', question._id, req.admin?.email, null, question.toObject());
    res.status(201).json(question);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A question with this code already exists' });
    console.error('[POST counselling/questions]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/admin/counselling/questions/:id — edit a question
router.put('/questions/:id', auth, async (req, res) => {
  try {
    const before = await CounsellingQuestion.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ message: 'Question not found' });

    const doc = cleanQuestionBody(req.body);
    const question = await CounsellingQuestion.findByIdAndUpdate(
      req.params.id, { $set: doc }, { new: true, runValidators: true }
    );
    logAudit('question.update', 'CounsellingQuestion', question._id, req.admin?.email, before, question.toObject());
    res.json(question);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A question with this code already exists' });
    console.error('[PUT counselling/questions/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/admin/counselling/questions/:id — deactivate (soft delete).
// Historical responses keep their snapshot of the question text.
router.delete('/questions/:id', auth, async (req, res) => {
  try {
    const question = await CounsellingQuestion.findByIdAndUpdate(
      req.params.id, { $set: { active: false } }, { new: true }
    );
    if (!question) return res.status(404).json({ message: 'Question not found' });
    logAudit('question.deactivate', 'CounsellingQuestion', question._id, req.admin?.email);
    res.json({ message: 'Question deactivated', question });
  } catch (err) {
    console.error('[DELETE counselling/questions/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ═══════════════════════ RESPONSES ═════════════════════════════════════════

// GET /api/admin/counselling/responses — paginated list with filters
// ?page=&limit=&college=&branch=&status=&from=&to=&search=&sort=
router.get('/responses', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));

    const match = {};
    if (req.query.college) match.college = String(req.query.college);
    if (req.query.branch)  match.branch = String(req.query.branch);
    if (req.query.status && ['in_progress', 'submitted'].includes(req.query.status)) {
      match.status = req.query.status;
    }
    if (DATE_RX.test(req.query.from || '') || DATE_RX.test(req.query.to || '')) {
      match.attendanceDate = {};
      if (DATE_RX.test(req.query.from || '')) match.attendanceDate.$gte = req.query.from;
      if (DATE_RX.test(req.query.to || ''))   match.attendanceDate.$lte = req.query.to;
    }
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const [result] = await CounsellingResponse.aggregate([
      { $match: match },
      { $sort: { submittedAt: -1, updatedAt: -1 } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: 'counsellingreports',
                localField: '_id',
                foreignField: 'response',
                as: 'report'
              }
            },
            { $unwind: { path: '$report', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                name: 1, email: 1, phone: 1, college: 1, branch: 1,
                attendanceDate: 1, status: 1, completionPercent: 1,
                totalScore: 1, maxScore: 1, submittedAt: 1, updatedAt: 1,
                reportStatus: '$report.status',
                scores: '$report.scores'
              }
            }
          ]
        }
      }
    ]);

    res.json({
      page, limit,
      total: result.total[0]?.n || 0,
      rows: result.rows
    });
  } catch (err) {
    console.error('[GET counselling/responses]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/counselling/responses/:id — full profile
router.get('/responses/:id', auth, async (req, res) => {
  try {
    const response = await CounsellingResponse.findById(req.params.id)
      .populate('student', 'name email phone college course customCourse branch customBranch city state')
      .lean();
    if (!response) return res.status(404).json({ message: 'Response not found' });

    const report = await CounsellingReport.findOne({ response: response._id }).lean();

    // Attendance timeline for context
    const Attendance = require('../models/Attendance');
    const attendance = await Attendance.find({ student: response.student?._id || response.student })
      .sort({ date: -1 }).limit(60).select('date status').lean();

    res.json({ response, report, attendance });
  } catch (err) {
    console.error('[GET counselling/responses/:id]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/counselling/responses/:id/unlock — allow resubmission
router.post('/responses/:id/unlock', auth, async (req, res) => {
  try {
    const response = await CounsellingResponse.findById(req.params.id);
    if (!response) return res.status(404).json({ message: 'Response not found' });
    if (response.status !== 'submitted') {
      return res.status(400).json({ message: 'This response is not submitted, nothing to unlock' });
    }

    response.set({
      status: 'in_progress',
      unlockedBy: req.admin?.email,
      unlockedAt: new Date()
    });
    await response.save();
    logAudit('response.unlock', 'StudentCounselling', response._id, req.admin?.email);

    res.json({ message: 'Unlocked — the student can now revise and resubmit', response });
  } catch (err) {
    console.error('[POST counselling/responses/:id/unlock]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/counselling/responses/:id/regenerate — re-run the AI report
router.post('/responses/:id/regenerate', auth, async (req, res) => {
  try {
    const response = await CounsellingResponse.findById(req.params.id);
    if (!response) return res.status(404).json({ message: 'Response not found' });
    if (response.status !== 'submitted') {
      return res.status(400).json({ message: 'The form must be submitted before a report can be generated' });
    }

    logAudit('report.regenerate', 'StudentCounselling', response._id, req.admin?.email);
    // Await so the admin gets the fresh report (or the failure reason) directly
    const report = await generateReport(response);
    res.json({ message: report.status === 'completed' ? 'Report generated' : `Report ${report.status}`, report });
  } catch (err) {
    console.error('[POST counselling/responses/:id/regenerate]', err);
    if (err.name === 'ReportGenerationLockedError' || String(err.message).includes('already in progress')) {
      return res.status(409).json({ message: 'Report generation is already in progress for this response. Please wait a moment and try again.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// ═══════════════════════ DASHBOARD ANALYTICS ═══════════════════════════════

// GET /api/admin/counselling/dashboard?from=&to=&college=
router.get('/dashboard', auth, async (req, res) => {
  try {
    const match = {};
    if (req.query.college) match.college = String(req.query.college);
    if (DATE_RX.test(req.query.from || '') || DATE_RX.test(req.query.to || '')) {
      match.attendanceDate = {};
      if (DATE_RX.test(req.query.from || '')) match.attendanceDate.$gte = req.query.from;
      if (DATE_RX.test(req.query.to || ''))   match.attendanceDate.$lte = req.query.to;
    }

    const [
      statusCounts, collegeAgg, branchAgg, dateAgg, domainAgg, reportAgg
    ] = await Promise.all([
      CounsellingResponse.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      CounsellingResponse.aggregate([
        { $match: { ...match, status: 'submitted' } },
        { $group: { _id: '$college', count: { $sum: 1 }, avgScore: { $avg: '$totalScore' } } },
        { $sort: { count: -1 } }
      ]),
      CounsellingResponse.aggregate([
        { $match: { ...match, status: 'submitted' } },
        { $group: { _id: { $ifNull: ['$branch', 'Unknown'] }, count: { $sum: 1 }, avgScore: { $avg: '$totalScore' } } },
        { $sort: { count: -1 } }
      ]),
      CounsellingResponse.aggregate([
        { $match: { ...match, status: 'submitted' } },
        { $group: { _id: '$attendanceDate', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      // Preferred role/domain — distribution of the role-interest question (Q5)
      CounsellingResponse.aggregate([
        { $match: { ...match, status: 'submitted' } },
        { $unwind: '$answers' },
        { $match: { 'answers.code': 'Q5' } },
        { $unwind: '$answers.selected' },
        { $group: { _id: '$answers.selected', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // Average AI scores across completed reports (scoped to matching responses)
      CounsellingReport.aggregate([
        { $match: { status: 'completed' } },
        {
          $lookup: {
            from: 'studentcounsellings',
            localField: 'response',
            foreignField: '_id',
            as: 'resp'
          }
        },
        { $unwind: '$resp' },
        ...(Object.keys(match).length
          ? [{ $match: Object.fromEntries(Object.entries(match).map(([k, v]) => [`resp.${k}`, v])) }]
          : []),
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            careerClarity: { $avg: '$scores.careerClarity' },
            confidence: { $avg: '$scores.confidence' },
            technicalReadiness: { $avg: '$scores.technicalReadiness' },
            learningAttitude: { $avg: '$scores.learningAttitude' },
            placementReadiness: { $avg: '$scores.placementReadiness' },
            communicationReadiness: { $avg: '$scores.communicationReadiness' },
            motivation: { $avg: '$scores.motivation' },
            riskLevel: { $avg: '$scores.riskLevel' },
            overall: { $avg: '$scores.overall' }
          }
        }
      ])
    ]);

    const counts = { submitted: 0, in_progress: 0 };
    statusCounts.forEach(s => { counts[s._id] = s.count; });

    const avgScores = reportAgg[0] || null;
    if (avgScores) {
      delete avgScores._id;
      for (const k of Object.keys(avgScores)) {
        if (typeof avgScores[k] === 'number') avgScores[k] = Math.round(avgScores[k]);
      }
    }

    res.json({
      totals: {
        total: counts.submitted + counts.in_progress,
        submitted: counts.submitted,
        pending: counts.in_progress
      },
      avgScores,
      byCollege: collegeAgg.map(c => ({ college: c._id, count: c.count, avgScore: Math.round(c.avgScore || 0) })),
      byBranch: branchAgg.map(b => ({ branch: b._id || 'Unknown', count: b.count, avgScore: Math.round(b.avgScore || 0) })),
      byDate: dateAgg.map(d => ({ date: d._id, count: d.count })),
      preferredDomains: domainAgg.map(d => ({ domain: d._id, count: d.count }))
    });
  } catch (err) {
    console.error('[GET counselling/dashboard]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ═══════════════════════ EXPORT ════════════════════════════════════════════

// GET /api/admin/counselling/export — full submitted dataset (for CSV/Excel).
// Returns JSON rows; the frontend renders CSV or a styled Excel workbook.
router.get('/export', auth, async (req, res) => {
  try {
    const match = { status: 'submitted' };
    if (req.query.college) match.college = String(req.query.college);
    if (DATE_RX.test(req.query.from || '') || DATE_RX.test(req.query.to || '')) {
      match.attendanceDate = {};
      if (DATE_RX.test(req.query.from || '')) match.attendanceDate.$gte = req.query.from;
      if (DATE_RX.test(req.query.to || ''))   match.attendanceDate.$lte = req.query.to;
    }

    const responses = await CounsellingResponse.find(match)
      .sort({ submittedAt: -1 })
      .limit(5000)
      .lean();

    const ids = responses.map(r => r._id);
    const reports = await CounsellingReport.find({ response: { $in: ids } })
      .select('response status scores counsellorRecommendation careerFit')
      .lean();
    const reportByResponse = new Map(reports.map(r => [String(r.response), r]));

    const questions = await CounsellingQuestion.find({}).sort({ order: 1 }).lean();

    res.json({
      questions: questions.map(q => ({ code: q.code, text: q.text })),
      rows: responses.map(r => {
        const rep = reportByResponse.get(String(r._id));
        const answers = {};
        r.answers.forEach(a => {
          const labels = a.selected.map(s => (s === '__other__' ? 'Other' : s)).join('; ');
          answers[a.code] = labels + (a.otherText ? ` | Other: ${a.otherText}` : '');
        });
        return {
          name: r.name, email: r.email, phone: r.phone,
          college: r.college, branch: r.branch || '',
          attendanceDate: r.attendanceDate,
          submittedAt: r.submittedAt,
          completionPercent: r.completionPercent,
          totalScore: r.totalScore, maxScore: r.maxScore,
          scores: rep?.scores || null,
          careerFit: (rep?.careerFit || []).map(c => c.path).join('; '),
          aiSummary: rep?.counsellorRecommendation || '',
          answers
        };
      })
    });
  } catch (err) {
    console.error('[GET counselling/export]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
