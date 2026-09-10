const mongoose = require('mongoose');

// One row per report actually sent. Its job is idempotency: the in-process
// scheduler and an external cron may BOTH fire around 18:00, and the service
// can restart mid-evening — none of which should produce a second copy of the
// same report. The unique index on { kind, date } is what enforces that, in the
// database rather than in memory, so it survives restarts and concurrency.
//
// It doubles as a small delivery history: which channels were tried, whether
// they worked, and what the totals were.
const reportDeliverySchema = new mongoose.Schema({
  kind: { type: String, required: true, default: 'daily-applications' },

  // IST calendar day the report covers, 'YYYY-MM-DD' — the same string format
  // used by Attendance and Reception.
  date: { type: String, required: true },

  total:      { type: Number, default: 0 },
  channels:   { type: [String], default: [] },   // which were attempted
  delivered:  { type: [String], default: [] },   // which succeeded
  results:    { type: mongoose.Schema.Types.Mixed },
  triggeredBy: { type: String, default: 'scheduler' }   // 'scheduler' | 'manual' | 'api'
}, { timestamps: true });

reportDeliverySchema.index({ kind: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ReportDelivery', reportDeliverySchema);
