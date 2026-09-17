/*
 * Seeds the Accounts & Finance questionnaire into one workspace.
 *
 *     node seedAccountsFinanceQuestions.js                    # dry run
 *     node seedAccountsFinanceQuestions.js --apply
 *     node seedAccountsFinanceQuestions.js --apply --workspace="Chamundeswari"
 *
 * Targets Sri Chamundeswari Sugars Ltd. by default and touches NO other
 * workspace — Inference Labs and every other drive keep their own questionnaire.
 *
 * Replacing, not appending: any questionnaire already in the target workspace is
 * DEACTIVATED (active: false) rather than deleted, because historical responses
 * reference those questions and the model treats `active` as a soft delete.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const Workspace = require('./models/Workspace');
const CounsellingQuestion = require('./models/CounsellingQuestion');
const { SECTIONS, QUESTIONS } = require('./config/accountsFinanceQuestions');

// The config speaks in the spec's vocabulary; the model has its own type names.
const TYPE_MAP = { single: 'radio', multi: 'checkbox', text: 'text', rating: 'rating', yesno: 'yesno' };

function toDocuments(workspaceId) {
  return QUESTIONS.map((q, i) => {
    const section = SECTIONS[q.section];
    return {
      workspace: workspaceId,
      sectionKey: section.key,
      sectionTitle: section.title,
      sectionNote: section.note || '',
      order: (i + 1) * 10,
      code: q.code,
      text: q.text,
      type: TYPE_MAP[q.type] || 'radio',
      // Points stay 0 throughout: Section B is marked by the server-side answer
      // key, never by option points, so nothing scoreable exists on the
      // documents the form reads from.
      options: (q.options || []).map(label => ({ label, points: 0 })),
      allowOther: !!q.allowOther,
      required: q.required !== false,
      active: true,
      topic: q.topic || '',
      maxSelect: q.maxSelect || 0,
      skipIfNo: q.skipIfNo || '',
      clearsOthers: q.clearsOthers || '',
      counsellorOnly: !!q.counsellorOnly,
      shuffleOptions: !!q.shuffleOptions,
      maxLength: q.maxLength || 0,
      prefill: q.prefill || '',
      metricTags: []
    };
  });
}

(async () => {
  const apply = process.argv.includes('--apply');
  const wsArg = (process.argv.find(a => a.startsWith('--workspace=')) || '').split('=')[1] || 'Chamundeswari';

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(apply ? '=== APPLYING ===\n' : '=== DRY RUN (pass --apply to write) ===\n');

  const ws = await Workspace.findOne({ companyName: new RegExp(wsArg, 'i') }).select('companyName').lean();
  if (!ws) {
    console.error(`No workspace matching "${wsArg}".`);
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }
  console.log(`target workspace: ${ws.companyName}  (${ws._id})\n`);

  const existing = await CounsellingQuestion.find({ workspace: ws._id }).select('code text active').lean();
  const alreadySeeded = existing.some(q => q.code === 'B1' && q.active);
  if (alreadySeeded) {
    console.log('  Accounts & Finance questionnaire is already active here — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (existing.length) {
    console.log(`  DEACTIVATE  ${existing.length} existing question(s) (soft delete, responses keep their snapshots):`);
    existing.forEach(q => console.log(`                ${q.code.padEnd(4)} ${q.text.slice(0, 64)}`));
    console.log('');
  }

  const docs = toDocuments(ws._id);
  const students = docs.filter(d => !d.counsellorOnly);
  console.log(`  INSERT      ${docs.length} question(s) — ${students.length} for students, ${docs.length - students.length} counsellor-only:`);
  let section = '';
  docs.forEach(d => {
    if (d.sectionKey !== section) { section = d.sectionKey; console.log(`              — Section ${d.sectionKey} · ${d.sectionTitle}`); }
    const tags = [
      d.counsellorOnly ? 'counsellor-only' : '',
      d.maxSelect ? `max ${d.maxSelect}` : '',
      d.skipIfNo ? `skip if ${d.skipIfNo}=No` : '',
      d.shuffleOptions ? 'shuffled' : '',
      d.topic || ''
    ].filter(Boolean).join(', ');
    console.log(`                ${d.code.padEnd(4)}${d.type.padEnd(9)}${d.text.slice(0, 52).padEnd(54)}${tags}`);
  });

  if (apply) {
    if (existing.length) {
      await CounsellingQuestion.updateMany({ workspace: ws._id }, { $set: { active: false } });
      console.log(`\n  ✅  deactivated ${existing.length} previous question(s)`);
    }
    // Codes are unique per workspace, so a previous run's rows must go before
    // the new ones land. Deactivated rows from a DIFFERENT questionnaire keep
    // their own codes and are unaffected.
    await CounsellingQuestion.deleteMany({ workspace: ws._id, code: { $in: docs.map(d => d.code) } });
    await CounsellingQuestion.insertMany(docs);
    console.log(`  ✅  inserted ${docs.length} question(s) into ${ws.companyName}`);
  } else {
    console.log('\n  (dry run — nothing written)');
  }

  await mongoose.disconnect();
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
