const Student = require('./models/Student');
const Form = require('./models/Form');
const FormSubmission = require('./models/FormSubmission');
const { ensureLegacyForm, buildCandidateSummary, linkSubmissionToCandidate } = require('./services/applicationForms');

// One-time, idempotent migration for the dynamic Applications dashboard.
//
// The dashboard no longer knows any category names — it groups applications
// strictly by their Form. Two kinds of existing data have no Form reference
// yet, and NEITHER is deleted or rewritten:
//
//   1. Student applications that arrived through the pre-Forms intake links.
//      For each workspace, each intake channel that actually has data gets a
//      real Form record (origin 'legacy'), and its students are pointed at
//      it. Channels with no data produce no form — so a fresh workspace
//      never shows "Official College"/"Instagram"/"Missed Test" at all.
//
//   2. FormSubmissions saved before the candidate summary existed. Their
//      `responses` are untouched; only the derived summary is filled in.
module.exports = async function backfillApplicationForms() {
  try {
    // ── 0. Forms created before `origin` existed are builder-made ──────────
    const tagged = await Form.updateMany({ origin: { $exists: false } }, { $set: { origin: 'custom' } });
    if (tagged.modifiedCount > 0) {
      console.log(`✅  Tagged ${tagged.modifiedCount} existing form(s) as custom forms`);
    }

    // ── 1. Student applications → legacy Form records ──────────────────────
    const pending = await Student.aggregate([
      { $match: { form: { $in: [null, undefined] } } },
      { $group: { _id: { workspace: '$workspace', source: '$source' }, count: { $sum: 1 } } }
    ]);

    for (const group of pending) {
      const { workspace, source } = group._id;
      if (!workspace) continue;

      // Records predating the `source` field are official-college intake —
      // that was the only channel when they were created.
      const channel = source || 'official_college';
      const form = await ensureLegacyForm(workspace, channel);
      if (!form) {
        console.warn(`[backfillApplicationForms] could not resolve a form for source="${channel}" in workspace ${workspace}`);
        continue;
      }

      const match = { workspace, form: { $in: [null, undefined] } };
      if (source === null || source === undefined) match.source = { $in: [null, undefined] };
      else match.source = source;

      const result = await Student.updateMany(match, { $set: { form: form._id } });
      if (result.modifiedCount > 0) {
        console.log(`✅  Linked ${result.modifiedCount} application(s) to form "${form.name}" in workspace ${workspace}`);
      }
    }

    // ── 2. Re-attach responses orphaned by an earlier form edit ────────────
    // Saving a form used to regenerate every field's _id, which detached the
    // answers of submissions collected before that edit (they are keyed by
    // field _id). The data was never lost, only unreadable. Repaired here
    // ONLY in the unambiguous case: the submission shares no key at all with
    // the form's current fields and has exactly one answer per field, so the
    // original insertion order maps 1:1 onto the current field order.
    // cleanFields() now preserves ids, so this cannot happen again.
    const allSubmissions = await FormSubmission.find().lean();
    const formCache = new Map();
    let repaired = 0;

    for (const submission of allSubmissions) {
      const formId = String(submission.form);
      if (!formCache.has(formId)) {
        formCache.set(formId, await Form.findById(formId).select('fields').lean());
      }
      const form = formCache.get(formId);
      if (!form?.fields?.length) continue;

      const currentIds = form.fields.map(f => String(f._id));
      const answerKeys = Object.keys(submission.responses || {});
      if (!answerKeys.length) continue;
      if (answerKeys.some(k => currentIds.includes(k))) continue;      // already aligned
      if (answerKeys.length !== currentIds.length) continue;           // ambiguous — leave untouched

      const remapped = {};
      answerKeys.forEach((key, i) => { remapped[currentIds[i]] = submission.responses[key]; });
      await FormSubmission.updateOne({ _id: submission._id }, { $set: { responses: remapped } });
      submission.responses = remapped;
      repaired++;
    }
    if (repaired > 0) console.log(`✅  Re-attached ${repaired} form response(s) orphaned by an earlier form edit`);

    // ── 3. Custom-form submissions → candidate summary ─────────────────────
    const stale = await FormSubmission.find({
      $or: [{ candidate: { $exists: false } }, { 'candidate.name': { $in: [null, ''] } }]
    }).lean();

    if (stale.length) {
      const formIds = [...new Set(stale.map(s => String(s.form)))];
      const forms = await Form.find({ _id: { $in: formIds } }).select('fields').lean();
      const fieldsByForm = new Map(forms.map(f => [String(f._id), f.fields || []]));

      let filled = 0;
      for (const submission of stale) {
        const fields = fieldsByForm.get(String(submission.form));
        if (!fields) continue;
        const candidate = buildCandidateSummary(fields, submission.responses || {});
        if (!candidate.name && !candidate.email && !candidate.phone && !candidate.college) continue;
        await FormSubmission.updateOne({ _id: submission._id }, { $set: { candidate } });
        filled++;
      }
      if (filled > 0) console.log(`✅  Backfilled candidate summaries for ${filled} form submission(s)`);
    }
    // ── 4. Custom-form submissions → candidates ────────────────────────────
    // Submissions collected before candidate linking existed produced no
    // Student, so those people could never be marked present, checked in at
    // reception, counselled or reported on. Each one is matched to an existing
    // candidate in its workspace where possible, and only created when no
    // match exists. Purely additive: no existing record is deleted or
    // overwritten, and submissions without enough identity are left alone.
    const unlinked = await FormSubmission.find({
      student: { $in: [null, undefined] }
    }).select('workspace form candidate').lean();

    let linked = 0, created = 0;
    for (const submission of unlinked) {
      if (!submission.candidate) continue;
      const before = await Student.countDocuments({ workspace: submission.workspace });
      let student = null;
      try {
        student = await linkSubmissionToCandidate({
          workspaceId: submission.workspace,
          formId: submission.form,
          candidate: submission.candidate
        });
      } catch (err) {
        console.error('[backfillApplicationForms] could not link submission', String(submission._id), err.message);
        continue;
      }
      if (!student) continue;
      await FormSubmission.updateOne({ _id: submission._id }, { $set: { student: student._id } });
      linked++;
      if (await Student.countDocuments({ workspace: submission.workspace }) > before) created++;
    }
    if (linked > 0) {
      console.log(`✅  Linked ${linked} form submission(s) to a candidate (${created} new candidate record(s) created, ${linked - created} matched an existing candidate)`);
    }

    // ── 5. Recover contact details missed by earlier summary rules ─────────
    // The candidate summary originally read a phone only from a 'phone'-typed
    // field, so a form collecting "Contact Number" as a number/text field
    // produced a candidate with no phone — who could be marked Present but
    // then could not be found at the reception desk. Re-deriving the summary
    // now picks those up by value shape. Only ever FILLS BLANKS: an existing
    // phone or email is never overwritten.
    const linkedSubmissions = await FormSubmission.find({ student: { $ne: null } })
      .select('form student responses candidate').lean();

    let recovered = 0;
    const formFieldCache = new Map();
    for (const submission of linkedSubmissions) {
      const formId = String(submission.form);
      if (!formFieldCache.has(formId)) {
        const doc = await Form.findById(formId).select('fields').lean();
        formFieldCache.set(formId, doc?.fields || []);
      }
      const fields = formFieldCache.get(formId);
      if (!fields.length) continue;

      const fresh = buildCandidateSummary(fields, submission.responses || {});
      const student = await Student.findById(submission.student).select('phone email college').lean();
      if (!student) continue;

      const patch = {};
      if (!student.phone && fresh.phone) patch.phone = fresh.phone;
      if (!student.email && fresh.email) patch.email = fresh.email;
      if (!student.college && fresh.college) patch.college = fresh.college;
      if (!Object.keys(patch).length) continue;

      await Student.updateOne({ _id: submission.student }, { $set: patch });
      // Keep the submission's own summary consistent with what was recovered
      await FormSubmission.updateOne({ _id: submission._id }, { $set: { candidate: { ...submission.candidate, ...patch } } });
      recovered++;
    }
    if (recovered > 0) {
      console.log(`✅  Recovered missing contact details for ${recovered} candidate(s) from their form responses`);
    }

    // ── 6. Mark candidates that own a form submission ─────────────────────
    // The Applications dashboard lists one row per APPLICATION: every
    // submission is a row, so a candidate that owns submissions must not be
    // listed separately as well. Without this flag each form application was
    // counted twice on the workspace dashboard (once as the submission, once
    // as the candidate it created) and repeat applications were hidden from
    // the Applications list. Recomputed from the submissions themselves, so
    // it is always consistent and safe to re-run.
    const withSubmissions = (await FormSubmission.distinct('student')).filter(Boolean);
    const [flagged, unflagged] = await Promise.all([
      Student.updateMany(
        { _id: { $in: withSubmissions }, hasFormSubmission: { $ne: true } },
        { $set: { hasFormSubmission: true } }
      ),
      Student.updateMany(
        { _id: { $nin: withSubmissions }, hasFormSubmission: true },
        { $set: { hasFormSubmission: false } }
      )
    ]);
    if (flagged.modifiedCount || unflagged.modifiedCount) {
      console.log(`✅  Synced application ownership on ${flagged.modifiedCount + unflagged.modifiedCount} candidate(s)`);
    }
  } catch (err) {
    console.error('[backfillApplicationForms] Migration error:', err);
  }
};
