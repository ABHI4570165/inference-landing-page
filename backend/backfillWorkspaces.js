const Admin = require('./models/Admin');
const Workspace = require('./models/Workspace');
const { generatePublicToken } = require('./utils/publicToken');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');
const AttendanceSession = require('./models/AttendanceSession');
const College = require('./models/College');
const CounsellingResponse = require('./models/CounsellingResponse');
const CounsellingReport = require('./models/CounsellingReport');
const ReceptionCheckin = require('./models/ReceptionCheckin');

// One-time migration: this portal used to serve a single company. Multi-
// workspace support adds a required `workspace` field to every recruitment
// record. Existing data is never deleted or overwritten — it is assigned to
// a "default intake" workspace created here (idempotent: skipped if it
// already exists), then every recruitment-specific unique index is
// upgraded to include `workspace` so it protects each company separately
// instead of globally.
module.exports = async function backfillWorkspaces() {
  try {
    let legacy = await Workspace.findOne({ isDefaultIntake: true });

    if (!legacy) {
      const admin = await Admin.findOne({ email: process.env.ADMIN_EMAIL }) || await Admin.findOne();
      if (!admin) {
        console.warn('[backfillWorkspaces] No admin found yet — will retry on next boot.');
        return;
      }

      legacy = await Workspace.create({
        companyName: 'Existing Recruitment Drive',
        recruitmentDriveName: 'Existing Recruitment Drive 2026',
        year: new Date().getFullYear(),
        description: 'Auto-created for data that existed before multi-workspace support was added.',
        status: 'Active',
        isDefaultIntake: true,
        createdBy: admin._id
      });
      console.log(`✅  Created default workspace "${legacy.companyName}" (${legacy._id}) for pre-existing data`);
    }

    // Any workspace created before per-workspace Reception/Counselling
    // links existed (the legacy one, or ones created between deploys) gets
    // tokens backfilled here — idempotent, only fills in what's missing.
    const needsTokens = await Workspace.find({
      $or: [{ receptionToken: { $exists: false } }, { counsellingToken: { $exists: false } }]
    });
    for (const ws of needsTokens) {
      if (!ws.receptionToken) ws.receptionToken = generatePublicToken('rcp');
      if (!ws.counsellingToken) ws.counsellingToken = generatePublicToken('cns');
      await ws.save();
      console.log(`✅  Backfilled public tokens for workspace "${ws.companyName}"`);
    }

    const jobs = [
      [Student, 'students'],
      [Attendance, 'attendance records'],
      [AttendanceSession, 'attendance sessions'],
      [College, 'colleges'],
      [CounsellingResponse, 'counselling responses'],
      [CounsellingReport, 'counselling reports'],
      [ReceptionCheckin, 'reception check-ins']
    ];

    for (const [Model, label] of jobs) {
      const result = await Model.updateMany(
        { workspace: { $exists: false } },
        { $set: { workspace: legacy._id } }
      );
      if (result.modifiedCount > 0) {
        console.log(`✅  Backfilled ${result.modifiedCount} ${label} into the default workspace`);
      }
    }

    // Upgrade unique indexes to be workspace-scoped instead of global. Safe
    // to run on every boot — dropIndex is a no-op (caught) once already
    // dropped, and createIndex is a no-op once it already matches.
    //
    // Partial filter on aadhar: a couple of pre-existing legacy records have
    // no Aadhar at all (predates that field being required). A plain unique
    // index would treat their `null` values as a collision; restricting the
    // index to documents where aadhar is an actual string keeps real
    // duplicate-Aadhar protection while leaving those old records alone.
    await Student.collection.dropIndex('aadhar_1').catch(() => {});
    await Student.collection.createIndex(
      { workspace: 1, aadhar: 1 },
      { unique: true, partialFilterExpression: { aadhar: { $type: 'string' } } }
    ).catch(err => console.error('[backfillWorkspaces] Student aadhar index:', err.message));

    await AttendanceSession.collection.dropIndex('college_1_date_1').catch(() => {});
    await AttendanceSession.collection.createIndex({ workspace: 1, college: 1, date: 1 }, { unique: true }).catch(err =>
      console.error('[backfillWorkspaces] AttendanceSession index:', err.message));

    // College previously had a GLOBAL unique index on `name` — that would
    // block two different companies from both recruiting from, say, "SRM",
    // so it's replaced with a per-workspace one.
    await College.collection.dropIndex('name_1').catch(() => {});
    await College.collection.createIndex({ workspace: 1, name: 1 }, { unique: true }).catch(err =>
      console.error('[backfillWorkspaces] College index:', err.message));
  } catch (err) {
    console.error('[backfillWorkspaces] Migration error:', err);
  }
};
