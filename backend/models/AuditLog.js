const mongoose = require('mongoose');

// Generic audit trail for sensitive admin actions (attendance edits, question
// changes, response unlocks …).
const auditLogSchema = new mongoose.Schema({
  action:     { type: String, required: true, trim: true, index: true },
  entityType: { type: String, required: true, trim: true, index: true },
  entityId:   { type: mongoose.Schema.Types.ObjectId, index: true },
  admin:      { type: String, trim: true },
  before:     { type: mongoose.Schema.Types.Mixed },
  after:      { type: mongoose.Schema.Types.Mixed },
  meta:       { type: mongoose.Schema.Types.Mixed }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
