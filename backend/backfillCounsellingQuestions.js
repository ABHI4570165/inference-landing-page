const Workspace = require('./models/Workspace');
const CounsellingQuestion = require('./models/CounsellingQuestion');

// One-time migration, safe to re-run on every boot.
//
// The counselling questionnaire used to be a single global set: every
// workspace's students answered the same 35 questions, and `code` was unique
// across the whole collection so no second drive could have its own Q1.
//
// Each workspace now owns its questionnaire. The existing 35 questions are
// moved into the default-intake workspace — the drive they were written for —
// so that workspace behaves exactly as before. Nothing is renamed, reordered or
// deleted, and existing CounsellingResponses are untouched: they snapshot the
// question text and code on the answer itself.
module.exports = async function backfillCounsellingQuestions() {
  try {
    const orphans = await CounsellingQuestion.countDocuments({
      $or: [{ workspace: { $exists: false } }, { workspace: null }]
    });

    if (orphans) {
      const intake = await Workspace.findOne({ isDefaultIntake: true }).select('_id companyName').lean();
      if (!intake) {
        console.warn('[backfillCounsellingQuestions] No default-intake workspace yet — will retry on next boot.');
        return;
      }
      const res = await CounsellingQuestion.updateMany(
        { $or: [{ workspace: { $exists: false } }, { workspace: null }] },
        { $set: { workspace: intake._id } }
      );
      console.log(`✅  Moved ${res.modifiedCount} counselling questions into "${intake.companyName}"`);
    }

    // Swap the global unique index for a per-workspace one. dropIndex is a
    // no-op once already dropped; createIndex is a no-op once it matches.
    await CounsellingQuestion.collection.dropIndex('code_1').catch(() => {});
    await CounsellingQuestion.collection.createIndex(
      { workspace: 1, code: 1 },
      { unique: true }
    ).catch(err => console.error('[backfillCounsellingQuestions] index:', err.message));
  } catch (err) {
    console.error('[backfillCounsellingQuestions] Migration error:', err);
  }
};
