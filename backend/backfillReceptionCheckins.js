const Student = require('./models/Student');
const ReceptionCheckin = require('./models/ReceptionCheckin');

function toISTDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

// One-time migration: before day-wise ReceptionCheckin records existed,
// registration data lived only as a single "current status" snapshot on the
// Student document. Runs once (skips if any check-in already exists) so
// students registered under the old system still show up when an admin
// fetches that historical day.
module.exports = async function backfillReceptionCheckins() {
  const count = await ReceptionCheckin.estimatedDocumentCount();
  if (count > 0) return;

  const registered = await Student.find({
    registrationStatus: 'REGISTERED',
    registrationTime: { $ne: null }
  }).lean();

  if (!registered.length) return;

  const docs = registered.map(s => ({
    student: s._id,
    name: s.name,
    phone: s.phone,
    college: s.college,
    date: toISTDateString(new Date(s.registrationTime)),
    registeredAt: s.registrationTime,
    photoUrl: s.registrationPhoto || null,
    photoPublicId: s.registrationPhotoPublicId || null,
    counsellingStatus: s.counsellingStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING'
  }));

  try {
    await ReceptionCheckin.insertMany(docs, { ordered: false });
    console.log(`✅  Backfilled ${docs.length} reception check-in record(s) from existing student data`);
  } catch (err) {
    console.error('[backfillReceptionCheckins]', err.message);
  }
};
