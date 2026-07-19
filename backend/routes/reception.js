const express = require('express')
const router = express.Router()
const auth = require('../config/auth')
const Student = require('../models/Student')
const Attendance = require('../models/Attendance')
const ReceptionCheckin = require('../models/ReceptionCheckin')
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

// Match a student by mobile number the same way counselling does: compare the
// last 10 digits, tolerating +91 / spaces in whatever format was stored.
async function findStudentByPhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return null
  const candidates = await Student.find({ phone: { $regex: escapeRegex(digits) + '\\s*$' } })
  return candidates.find(s => (s.phone || '').replace(/\D/g, '').slice(-10) === digits) || null
}

// Same eligibility rule as the counselling module: the student must have been
// marked Present in an attendance session (attendance is per IST calendar day).
function hasPresentAttendance(studentId) {
  return Attendance.exists({ student: studentId, status: 'Present' })
}

// ── POST /api/reception/verify — body: { name, phone } ─────────────────────
// Public (no auth) — used by the entrance tablet to verify the student exists
// and attendance is marked Present before allowing the photo capture step.
router.post('/verify', async (req, res) => {
  try {
    const { name, phone } = req.body || {}
    if (!name || !phone) return res.status(400).json({ message: 'Missing name or phone' })

    const student = await findStudentByPhone(phone)
    if (!student) return res.status(404).json({ message: 'Student record not found.\n\nPlease contact the administrator.' })

    if (!(await hasPresentAttendance(student._id))) {
      return res.status(403).json({ message: 'Attendance not found.\n\nPlease contact the administrator.' })
    }

    if (student.counsellingStatus === 'COMPLETED') {
      return res.status(409).json({ message: 'Counselling already completed.' })
    }
    if (student.registrationStatus === 'REGISTERED') {
      return res.status(409).json({ message: 'You have already completed Reception Registration.\n\nPlease proceed to Counselling.' })
    }

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
    const { studentId } = req.body || {}
    if (!studentId) return res.status(400).json({ message: 'Missing studentId' })
    if (!req.file) return res.status(400).json({ message: 'Missing photo' })

    const student = await Student.findById(studentId)
    if (!student) return res.status(404).json({ message: 'Student record not found.\n\nPlease contact the administrator.' })

    // Re-check eligibility — the tablet flow could be stale
    if (!(await hasPresentAttendance(student._id))) {
      return res.status(403).json({ message: 'Attendance not found.\n\nPlease contact the administrator.' })
    }
    if (student.registrationStatus === 'REGISTERED') {
      return res.status(409).json({ message: 'You have already completed Reception Registration.\n\nPlease proceed to Counselling.' })
    }

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
router.get('/day', auth, async (req, res) => {
  try {
    const requested = req.query.date
    const date = DATE_RX.test(requested || '') ? requested : todayIST()

    const [attendance, checkins] = await Promise.all([
      Attendance.find({ date }).lean(),
      ReceptionCheckin.find({ date }).lean()
    ])

    const attendanceByStudent = new Map(attendance.map(a => [String(a.student), a.status]))
    const checkinByStudent = new Map(checkins.map(c => [String(c.student), c]))

    const ids = [...new Set([...attendanceByStudent.keys(), ...checkinByStudent.keys()])]
    const studentDocs = await Student.find({ _id: { $in: ids } }).select('name phone college').lean()
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
router.delete('/registration/:studentId', auth, async (req, res) => {
  try {
    const { studentId } = req.params
    const requestedDate = req.query.date
    const student = await Student.findById(studentId)
    if (!student) return res.status(404).json({ message: 'Not found' })

    const checkin = DATE_RX.test(requestedDate || '')
      ? await ReceptionCheckin.findOne({ student: studentId, date: requestedDate })
      : await ReceptionCheckin.findOne({ student: studentId }).sort({ date: -1 })

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
