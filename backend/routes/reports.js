const router = require('express').Router();
const auth = require('../config/auth');
const { sendDailyReport } = require('../services/reportScheduler');
const { buildDailyReport, formatText, istDateString } = require('../services/dailyReport');
const { emailConfigured, whatsappConfigured } = require('../services/notifiers');
const ReportDelivery = require('../models/ReportDelivery');

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// ── POST /api/reports/daily/run — external trigger ─────────────────────────
// The in-process scheduler only fires while the process is alive, and this API
// sleeps on its free tier. An external cron (cron-job.org, UptimeRobot, a
// GitHub Action) hitting this at 18:00 IST both WAKES the service and sends the
// report, which is what makes 6pm delivery dependable.
//
// Guarded by a shared secret rather than an admin JWT, because a cron has no
// session. Without REPORT_TRIGGER_TOKEN set, the route refuses everything, so
// it can never be an open "send email" endpoint.
router.post('/daily/run', async (req, res) => {
  const expected = (process.env.REPORT_TRIGGER_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({ message: 'Report trigger is not enabled (REPORT_TRIGGER_TOKEN is unset)' });
  }

  const supplied = (req.get('x-report-token') || req.query.token || '').trim();
  // Length check first so a mismatch cannot be distinguished by timing alone.
  if (supplied.length !== expected.length || supplied !== expected) {
    console.warn(`[SECURITY] Rejected report trigger | IP: ${req.ip}`);
    return res.status(401).json({ message: 'Invalid token' });
  }

  try {
    const date = DATE_RX.test(req.query.date || '') ? req.query.date : istDateString();
    const result = await sendDailyReport({
      date,
      triggeredBy: 'api',
      force: req.query.force === '1'
    });
    res.json(result);
  } catch (err) {
    console.error('[POST /api/reports/daily/run]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/reports/daily/preview — what would be sent (admin) ────────────
// Builds the report without delivering it, so the numbers can be checked
// against the Applications dashboard before trusting the 6pm message.
router.get('/daily/preview', auth, async (req, res) => {
  try {
    const date = DATE_RX.test(req.query.date || '') ? req.query.date : istDateString();
    const report = await buildDailyReport(date);
    res.json({
      ...report,
      text: formatText(report),
      channels: {
        whatsapp: whatsappConfigured(),
        email: emailConfigured()
      }
    });
  } catch (err) {
    console.error('[GET /api/reports/daily/preview]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/reports/daily/history — recent deliveries (admin) ─────────────
router.get('/daily/history', auth, async (req, res) => {
  try {
    const rows = await ReportDelivery.find({}).sort({ date: -1 }).limit(30).lean();
    res.json(rows);
  } catch (err) {
    console.error('[GET /api/reports/daily/history]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
