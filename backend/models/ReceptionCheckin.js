const mongoose = require('mongoose');

// One permanent record per student per day they complete Reception
// Registration. Never overwritten by a later registration on a different
// day — this is the audit trail the admin Reception dashboard fetches
// day-wise. Mirrors the (student, date) pattern already used by Attendance.
const receptionCheckinSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },

  // Snapshot at check-in time — stays readable even if the student record changes later
  name:    { type: String, required: true, trim: true },
  phone:   { type: String, required: true, trim: true },
  college: { type: String, trim: true, index: true },

  // Calendar day (IST) this check-in belongs to — 'YYYY-MM-DD' avoids the
  // timezone drift a Date would introduce, same convention as Attendance.date
  date: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    index: true
  },

  registeredAt: { type: Date, required: true, default: Date.now },

  // Cloudinary fields — null if the admin later deletes the photo, the
  // check-in record itself is kept
  photoUrl:      { type: String },
  photoPublicId: { type: String },

  // Counselling completion for THIS specific day's drive
  counsellingStatus: {
    type: String,
    enum: ['PENDING', 'COMPLETED'],
    default: 'PENDING'
  },
  counsellingCompletedAt: { type: Date }
}, { timestamps: true });

// One check-in per student per day
receptionCheckinSchema.index({ student: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ReceptionCheckin', receptionCheckinSchema);
