const Workspace = require('./models/Workspace');
const CollegeCategory = require('./models/CollegeCategory');
const College = require('./models/College');

// One-time migration, safe to re-run on every boot.
//
// Colleges used to be one flat list per workspace. They now live in folders
// ("Engineering Colleges", "MBA Colleges", …). Nothing is deleted or renamed:
// every existing college is moved into a default folder for its workspace, so
// the Colleges page and every form that references a college id keep working
// exactly as before — the colleges are simply grouped now.
const DEFAULT_CATEGORY_NAME = 'All Colleges';

module.exports = async function backfillCollegeCategories() {
  try {
    const workspaces = await Workspace.find({}).select('_id companyName').lean();

    for (const ws of workspaces) {
      // One default folder per workspace, created only when missing.
      let fallback = await CollegeCategory.findOne({ workspace: ws._id, isDefault: true });
      if (!fallback) {
        // A workspace with no colleges at all does not need a folder yet —
        // the admin will create their own. Only workspaces with existing
        // colleges get one, so new workspaces start clean.
        const orphanCount = await College.countDocuments({
          workspace: ws._id,
          $or: [{ category: { $exists: false } }, { category: null }]
        });
        if (!orphanCount) continue;

        fallback = await CollegeCategory.create({
          workspace: ws._id,
          name: DEFAULT_CATEGORY_NAME,
          description: 'Colleges added before folders existed. Rename this folder or move colleges into new ones.',
          isDefault: true,
          order: 0
        });
        console.log(`✅  Created default college folder for "${ws.companyName}"`);
      }

      const result = await College.updateMany(
        { workspace: ws._id, $or: [{ category: { $exists: false } }, { category: null }] },
        { $set: { category: fallback._id } }
      );
      if (result.modifiedCount > 0) {
        console.log(`✅  Moved ${result.modifiedCount} colleges into "${fallback.name}" for "${ws.companyName}"`);
      }
    }

    // Rows that existed before `source`/`reviewed` were added are admin-curated
    // by definition — mark them so the "needs review" filter only ever surfaces
    // genuinely candidate-submitted colleges.
    await College.updateMany(
      { source: { $exists: false } },
      { $set: { source: 'admin', reviewed: true } }
    );

    // The old per-workspace unique index blocked one college name appearing in
    // two different folders, which is exactly what categories are meant to
    // allow. dropIndex is a no-op once already dropped; createIndex is a no-op
    // once it matches.
    await College.collection.dropIndex('workspace_1_name_1').catch(() => {});
    await College.collection.createIndex(
      { workspace: 1, category: 1, name: 1 },
      { unique: true }
    ).catch(err => console.error('[backfillCollegeCategories] College index:', err.message));
  } catch (err) {
    console.error('[backfillCollegeCategories] Migration error:', err);
  }
};
