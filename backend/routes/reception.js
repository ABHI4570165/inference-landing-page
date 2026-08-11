const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()
const auth = require('../config/auth')
const { checkReceptionEligibility } = require('../services/candidateWorkflow')
const requireWorkspace = require('../middleware/workspace')
const Student = require('../models/Student')
const Attendance = require('../models/Attendance')
const ReceptionCheckin = require('../models/ReceptionCheckin')
const Workspace = require('../models/Workspace')
const cloudinary = require('../config/cloudinary')
const multer = require('multer')

// Multer in memory for image capture uploads from tablet
const storage = multer.memoryStorage()
const upload = multer({ storage, limits: { fileSize: 1 * 1024 * 1024 } }) // 1MB

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/

// Today's calendar day in India — attendance dates are stored as IST
// 'YYYY-MM-DD' strings, so the server's own timezone must not leak in.
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Find the candidate from whatever identifier they typed at the entrance
// tablet — a mobile number OR an email address.
//
// This used to accept a phone number only. That silently excluded every
// candidate who registered through a Custom Form that did not collect a
// phone-typed field: they could be marked Present but were then told "Student
// record not found" at reception, with no way to identify themselves.
// Scoped to whichever workspace the tablet's link belongs to — there is no
// admin session here to read a workspace selection from.
async function findCandidateByIdentifier(rawIdentifier, workspaceId) {
  const raw = String(rawIdentifier || '').trim()
  if (!raw) return null

  const digits = raw.replace(/\D/g, '').slice(-10)
  if (digits.length === 10 && !raw.includes('@')) {
    // Stored numbers vary in formatting (+91, spaces) — compare last 10 digits
    const candidates = await Student.find({ workspace: workspaceId, phone: { $regex: escapeRegex(digits) + '\\s*$' } })
    const match = candidates.find(s => (s.phone || '').replace(/\D/g, '').slice(-10) === digits)
    if (match) return match
  }

  if (raw.includes('@')) {
    return Student.findOne({ workspace: workspaceId, email: raw.toLowerCase() })
  }

  return null
}

// Resolves which workspace a public reception request targets: an explicit
// per-workspace `token` (new links, e.g. /reception/<token>) if the request
// carries one and it matches an Active workspace, otherwise the one legacy
// default-intake workspace that the original un-tokened /reception link
// (already printed/circulated) has always pointed at.
async function resolveReceptionWorkspace(token) {
  if (token) {
    const ws = await Workspace.findOne({ receptionToken: token, status: 'Active' }).select('_id').lean()
    return ws ? ws._id : null
  }
  const intake = await Workspace.findOne({ isDefaultIntake: true }).select('_id').lean()
  return intake ? intake._id : null
}

// ── POST /api/reception/verify — body: { name, phone, token } ──────────────
// Public (no auth) — used by the entrance tablet to verify the student exists
// and attendance is marked Present before allowing the photo capture step.
// The workflow rule itself lives in services/candidateWorkflow so /verify and
// /register can never drift apart.
router.post('/verify', async (req, res) => {
  try {
    // `phone` is the historical field name from the tablet form; it now
    // carries either a mobile number or an email address.
    const { name, token } = req.body || {}
    const identifier = req.body?.identifier || req.body?.phone
    if (!name || !identifier) {
      return res.status(400).json({ message: 'Please enter your name and your mobile number or email' })
    }

    const workspaceId = await resolveReceptionWorkspace(token)
    if (!workspaceId) return res.status(404).json({ message: 'This reception link is invalid or no longer active.' })

    const student = await findCandidateByIdentifier(identifier, workspaceId)

    const gate = await checkReceptionEligibility(student, workspaceId)
    if (!gate.ok) return res.status(gate.status).json({ code: gate.code, message: gate.message })

    return res.json({ id: student._id, name: student.name, phone: student.phone })
  } catch (err) {
    console.error('[POST /api/reception/verify]', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/reception/register ────────────────────────────────────────────
// multipart/form-data: file field `photo`, body: studentId
// Uploads the compressed photo to Cloudinary, marks the student REGISTERED,
// and writes a permanent day-wise ReceptionCheckin record for today.
router.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const { studentId, token } = req.body || {}
    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Missing studentId' })
    }
    if (!req.file) return res.status(400).json({ message: 'Missing photo' })

    // This endpoint used to trust `studentId` alone: it looked the student up
    // with findById() and never resolved a workspace, so a candidate belonging
    // to one company's drive could be checked in through another company's
    // reception link. The link's own token now decides the workspace, and the
    // student must belong to it.
    const workspaceId = await resolveReceptionWorkspace(token)
    if (!workspaceId) return res.status(404).json({ message: 'This reception link is invalid or no longer active.' })

    const student = await Student.findOne({ _id: studentId, workspace: workspaceId })

    // Re-checked here and not just in /verify — the tablet's state could be
    // stale, and this endpoint is reachable directly.
    const gate = await checkReceptionEligibility(student, workspaceId)
    if (!gate.ok) return res.status(gate.status).json({ code: gate.code, message: gate.message })

    // Upload to Cloudinary (folder: student-registration) via base64 data URI —
    // buffers are small (≤300KB compressed client-side, 1MB hard cap above)
    const dataUri = `data:${req.file.mimetype || 'image/jpeg'};base64,${req.file.buffer.toString('base64')}`
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'student-registration',
      resource_type: 'image'
    })

    const registeredAt = new Date()
    const date = todayIST()

    student.registrationStatus = 'REGISTERED'
    student.registrationTime = registeredAt
    student.registrationPhoto = result.secure_url
    student.registrationPhotoPublicId = result.public_id
    await student.save()

    // Permanent day-wise record — never overwritten by a future registration
    // on a different day, and what the admin Reception dashboard fetches by date.
    await ReceptionCheckin.findOneAndUpdate(
      { student: student._id, date },
      {
        student: student._id,
        workspace: student.workspace,
        name: student.name,
        phone: student.phone,
        college: student.college,
        date,
        registeredAt,
        photoUrl: result.secure_url,
        photoPublicId: result.public_id
      },
      { upsert: true, setDefaultsOnInsert: true }
    )

    res.json({ message: 'Registration successful', photoUrl: result.secure_url })
  } catch (err) {
    console.error('[POST /api/reception/register]', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/reception/day?date=YYYY-MM-DD — admin reception dashboard ─────
// Everyone relevant to that day's drive: students marked in that day's
// attendance, plus anyone who completed reception registration that day.
// Defaults to today (IST) when no date is given.
router.get('/day', auth, requireWorkspace, async (req, res) => {
  try {
    const requested = req.query.date
    const date = DATE_RX.test(requested || '') ? requested : todayIST()

    const [attendance, checkins] = await Promise.all([
      Attendance.find({ date, workspace: req.workspaceId }).lean(),
      ReceptionCheckin.find({ date, workspace: req.workspaceId }).lean()
    ])

    const attendanceByStudent = new Map(attendance.map(a => [String(a.student), a.status]))
    const checkinByStudent = new Map(checkins.map(c => [String(c.student), c]))

    const ids = [...new Set([...attendanceByStudent.keys(), ...checkinByStudent.keys()])]
    const studentDocs = await Student.find({ _id: { $in: ids }, workspace: req.workspaceId }).select('name phone college').lean()
    const studentById = new Map(studentDocs.map(s => [String(s._id), s]))

    const students = ids.map(id => {
      const checkin = checkinByStudent.get(id)
      const student = studentById.get(id)
      return {
        _id: id,
        name: checkin?.name || student?.name || 'Unknown',
        phone: checkin?.phone || student?.phone || '',
        college: checkin?.college || student?.college || '',
        attendanceStatus: attendanceByStudent.get(id) || 'Not marked',
        registrationStatus: checkin ? 'REGISTERED' : 'NOT_REGISTERED',
        registrationTime: checkin?.registeredAt || null,
        registrationPhoto: checkin?.photoUrl || null,
        registrationPhotoPublicId: checkin?.photoPublicId || null,
        counsellingStatus: checkin?.counsellingStatus || 'PENDING'
      }
    }).sort((a, b) => {
      const ta = a.registrationTime ? new Date(a.registrationTime).getTime() : 0
      const tb = b.registrationTime ? new Date(b.registrationTime).getTime() : 0
      return tb - ta
    })

    res.json({ date, students })
  } catch (err) {
    console.error('[GET /api/reception/day]', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/reception/registration/:studentId?date=YYYY-MM-DD — admin only
// Fully deletes a student's reception registration — removes the Cloudinary
// photo, deletes that day's ReceptionCheckin record, and resets the student
// back to NOT_REGISTERED so they can check in again from scratch (e.g. after
// a mistaken/test registration).
router.delete('/registration/:studentId', auth, requireWorkspace, async (req, res) => {
  try {
    const { studentId } = req.params
    const requestedDate = req.query.date
    const student = await Student.findOne({ _id: studentId, workspace: req.workspaceId })
    if (!student) return res.status(404).json({ message: 'Not found' })

    const checkin = DATE_RX.test(requestedDate || '')
      ? await ReceptionCheckin.findOne({ student: studentId, date: requestedDate, workspace: req.workspaceId })
      : await ReceptionCheckin.findOne({ student: studentId, workspace: req.workspaceId }).sort({ date: -1 })

    const publicId = checkin?.photoPublicId || student.registrationPhotoPublicId
    if (!checkin && student.registrationStatus !== 'REGISTERED' && !publicId) {
      return res.status(400).json({ message: 'No registration to delete' })
    }

    if (publicId) await cloudinary.uploader.destroy(publicId)
    if (checkin) await checkin.deleteOne()

    student.registrationStatus = 'NOT_REGISTERED'
    student.registrationTime = null
    student.registrationPhoto = null
    student.registrationPhotoPublicId = null
    await student.save()

    res.json({ message: 'Registration deleted' })
  } catch (err) {
    console.error('[DELETE /api/reception/registration/:studentId]', err)
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router
