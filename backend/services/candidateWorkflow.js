const Attendance = require('../models/Attendance');
const ReceptionCheckin = require('../models/ReceptionCheckin');
const CounsellingResponse = require('../models/CounsellingResponse');
const CounsellingReport = require('../models/CounsellingReport');

// ── Candidate workflow: one definition, used everywhere ─────────────────────
//
//   REGISTERED → ATTENDANCE(Present) → RECEPTION → COUNSELLING → AI REPORT
//
// Each stage is derived from the EXISTING status fields already carried by the
// existing models — no new state column was introduced:
//
//   registration  Student document exists (created by the application form)
//   attendance    Attendance{ student, date, status } — 'Present' unlocks the rest
//   reception     Student.registrationStatus === 'REGISTERED' (+ ReceptionCheckin)
//   counselling   CounsellingResponse.status === 'submitted'
//   aiReport      CounsellingReport.status === 'completed'
//
// The gate functions below are what the public reception/counselling routes
// call, so the rule lives in exactly one place instead of being re-typed (and
// drifting) in each route.

const STAGES = ['registration', 'attendance', 'reception', 'counselling', 'aiReport'];

// A student is eligible for the next stage only once the previous one is done.
// Every lookup is scoped by workspace as well as student so a candidate from
// another company's drive can never satisfy a gate here.

// ── Attendance ──────────────────────────────────────────────────────────────
// Attendance is per IST calendar day; being marked Present on ANY day of the
// drive unlocks the rest of the workflow (a candidate may attend on one day
// and be received on the same day). Absent — or never marked — blocks.
async function findPresentAttendance(studentId, workspaceId) {
  return Attendance.findOne({ student: studentId, workspace: workspaceId, status: 'Present' })
    .sort({ date: -1 })
    .lean();
}

// ── Gate: may this candidate complete Reception Registration? ───────────────
// Returns { ok: true, attendance } or { ok: false, status, code, message }.
async function checkReceptionEligibility(student, workspaceId) {
  if (!student) {
    return { ok: false, status: 404, code: 'NOT_REGISTERED',
      message: 'Student record not found.\n\nPlease complete student registration first.' };
  }
  // Defence in depth — the caller should already have scoped the query.
  if (String(student.workspace) !== String(workspaceId)) {
    return { ok: false, status: 404, code: 'WRONG_WORKSPACE',
      message: 'Student record not found.\n\nPlease contact the administrator.' };
  }

  const attendance = await findPresentAttendance(student._id, workspaceId);
  if (!attendance) {
    return { ok: false, status: 403, code: 'NOT_PRESENT',
      message: 'You are not eligible for Reception Registration because your attendance has not been marked present.\n\nPlease contact the administrator.' };
  }

  if (student.counsellingStatus === 'COMPLETED') {
    return { ok: false, status: 409, code: 'COUNSELLING_DONE', message: 'Counselling already completed.' };
  }
  if (student.registrationStatus === 'REGISTERED') {
    return { ok: false, status: 409, code: 'ALREADY_RECEIVED',
      message: 'You have already completed Reception Registration.\n\nPlease proceed to Counselling.' };
  }

  return { ok: true, attendance };
}

// ── Gate: may this candidate start/submit Counselling? ──────────────────────
async function checkCounsellingEligibility(student, workspaceId) {
  if (!student) {
    return { ok: false, status: 404, code: 'NOT_REGISTERED',
      message: 'We could not find your registration. Please complete student registration first.' };
  }
  if (String(student.workspace) !== String(workspaceId)) {
    return { ok: false, status: 404, code: 'WRONG_WORKSPACE',
      message: 'We could not find your registration. Please contact the coordinator.' };
  }

  const attendance = await findPresentAttendance(student._id, workspaceId);
  if (!attendance) {
    return { ok: false, status: 403, code: 'NOT_PRESENT',
      message: 'Your attendance has not been recorded yet. Please contact the coordinator.' };
  }

  if (student.registrationStatus !== 'REGISTERED') {
    return { ok: false, status: 403, code: 'REGISTRATION_REQUIRED',
      message: 'Reception Registration Required\n\nPlease complete Reception Registration first.' };
  }

  return { ok: true, attendance };
}

// ── Read model: the workflow state of many candidates at once ───────────────
// Used by the admin Applications list so the progress chain is computed from
// the same rules the gates enforce, in one batched set of queries rather than
// per row.
async function buildWorkflowMap(studentIds, workspaceId) {
  const ids = studentIds.filter(Boolean);
  if (!ids.length) return new Map();

  const [attendance, checkins, responses] = await Promise.all([
    Attendance.find({ student: { $in: ids }, workspace: workspaceId })
      .select('student status date').sort({ date: -1 }).lean(),
    ReceptionCheckin.find({ student: { $in: ids }, workspace: workspaceId })
      .select('student date registeredAt').sort({ date: -1 }).lean(),
    CounsellingResponse.find({ student: { $in: ids }, workspace: workspaceId })
      .select('student status submittedAt').sort({ submittedAt: -1 }).lean()
  ]);

  const reports = responses.length
    ? await CounsellingReport.find({ student: { $in: ids }, workspace: workspaceId })
        .select('student status generatedAt').lean()
    : [];

  const first = (rows, key) => {
    const map = new Map();
    rows.forEach(r => { const k = String(r[key]); if (!map.has(k)) map.set(k, r); });
    return map;
  };

  // Present wins over Absent regardless of date ordering — one Present day is
  // what unlocks the workflow.
  const attendanceByStudent = new Map();
  attendance.forEach(a => {
    const k = String(a.student);
    const existing = attendanceByStudent.get(k);
    if (!existing || (existing.status !== 'Present' && a.status === 'Present')) {
      attendanceByStudent.set(k, a);
    }
  });

  const checkinByStudent = first(checkins, 'student');

  const responseByStudent = new Map();
  responses.forEach(r => {
    const k = String(r.student);
    const existing = responseByStudent.get(k);
    if (!existing || (existing.status !== 'submitted' && r.status === 'submitted')) {
      responseByStudent.set(k, r);
    }
  });

  const reportByStudent = new Map();
  reports.forEach(r => {
    const k = String(r.student);
    const existing = reportByStudent.get(k);
    if (!existing || (existing.status !== 'completed' && r.status === 'completed')) {
      reportByStudent.set(k, r);
    }
  });

  const result = new Map();
  for (const id of ids) {
    const key = String(id);
    const att = attendanceByStudent.get(key);
    const checkin = checkinByStudent.get(key);
    const response = responseByStudent.get(key);
    const report = reportByStudent.get(key);

    const present = att?.status === 'Present';
    const receptionDone = !!checkin;
    const counsellingDone = response?.status === 'submitted';
    const reportDone = report?.status === 'completed';

    // 'locked' means a prerequisite has not been met, so the stage cannot be
    // attempted yet — distinct from 'pending', which means it is unlocked and
    // simply not done.
    result.set(key, {
      registration: { state: 'done', at: null },
      attendance: {
        state: !att ? 'pending' : present ? 'done' : 'blocked',
        detail: att ? att.status : 'Not marked',
        at: att?.date || null
      },
      reception: {
        state: !present ? 'locked' : receptionDone ? 'done' : 'pending',
        at: checkin?.registeredAt || null
      },
      counselling: {
        state: !present || !receptionDone ? 'locked'
          : counsellingDone ? 'done'
          : response ? 'in_progress' : 'pending',
        at: response?.submittedAt || null
      },
      aiReport: {
        state: !counsellingDone ? 'locked'
          : reportDone ? 'done'
          : report ? report.status : 'pending',
        at: report?.generatedAt || null
      }
    });
  }
  return result;
}

// The furthest stage a candidate has completed — handy single label for lists.
function currentStage(workflow) {
  if (!workflow) return 'registration';
  if (workflow.aiReport.state === 'done') return 'aiReport';
  if (workflow.counselling.state === 'done') return 'counselling';
  if (workflow.reception.state === 'done') return 'reception';
  if (workflow.attendance.state === 'done') return 'attendance';
  return 'registration';
}

module.exports = {
  STAGES,
  findPresentAttendance,
  checkReceptionEligibility,
  checkCounsellingEligibility,
  buildWorkflowMap,
  currentStage
};
