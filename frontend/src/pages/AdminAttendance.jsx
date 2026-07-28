import { useState, useEffect, useMemo } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'

// Local 'YYYY-MM-DD' for today (avoids the UTC shift that toISOString causes)
function todayStr() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

// ── Small stat pill shown above the roster ──────────────────────
function CountCard({ label, value, accent }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent}`}>
      <p className="text-2xl font-bold leading-tight">{value}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  )
}

export default function AdminAttendance() {
  const [mode, setMode]           = useState('college') // 'college' | 'search'
  const [colleges, setColleges]   = useState([])
  const [college, setCollege]     = useState('')
  const [date, setDate]           = useState(todayStr())
  const [students, setStudents]   = useState([])
  const [statusMap, setStatusMap] = useState({}) // { studentId: 'Present' | 'Absent' }
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [loaded, setLoaded]       = useState(false) // a roster has been fetched
  const [message, setMessage]     = useState(null)  // { type, text }
  const [filter, setFilter]       = useState('all') // all | present | absent | unmarked
  const [search, setSearch]       = useState('')    // name / email / phone
  // Generic confirmation modal — null when hidden, otherwise holds the config
  // { title, message, confirmLabel, danger, onConfirm }
  const [confirmDialog, setConfirmDialog] = useState(null)

  // ── "Search Student" mode — quick-mark one student without knowing/
  // selecting their college first (e.g. a stray student met individually) ──
  const [searchInput, setSearchInput]     = useState('')
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching]         = useState(false)
  const [pickedStudent, setPickedStudent] = useState(null) // student object
  const [pickedStatus, setPickedStatus]   = useState(null) // 'Present' | 'Absent' | null
  const [statusLoading, setStatusLoading] = useState(false)
  const [marking, setMarking]             = useState(false)
  const [quickMessage, setQuickMessage]   = useState(null) // { type, text }

  // debounce the search box
  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput.trim()), 400)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    if (mode !== 'search' || !searchQuery) { setSearchResults([]); return }
    let ignore = false
    setSearching(true)
    API.get(`/api/students?search=${encodeURIComponent(searchQuery)}&limit=8`)
      .then(res => { if (!ignore) setSearchResults(res.data.students) })
      .catch(() => { if (!ignore) setSearchResults([]) })
      .finally(() => { if (!ignore) setSearching(false) })
    return () => { ignore = true }
  }, [searchQuery, mode])

  async function pickStudent(student) {
    setPickedStudent(student)
    setPickedStatus(null)
    setQuickMessage(null)
    setStatusLoading(true)
    try {
      const res = await API.get(`/api/attendance/student/${student._id}?date=${date}`)
      setPickedStatus(res.data.status)
    } catch (err) {
      setQuickMessage({ type: 'error', text: err.response?.data?.message || 'Failed to load current status' })
    } finally {
      setStatusLoading(false)
    }
  }

  // Re-check status if the admin changes the date while a student is picked
  useEffect(() => {
    if (mode === 'search' && pickedStudent) pickStudent(pickedStudent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function markPickedStudent(status) {
    if (!pickedStudent) return
    setMarking(true)
    setQuickMessage(null)
    try {
      await API.post('/api/attendance', { studentId: pickedStudent._id, date, status })
      setPickedStatus(status)
      setQuickMessage({
        type: 'success',
        text: `Marked ${status} — ${pickedStudent.name} (${pickedStudent.college}) on ${date}`
      })
    } catch (err) {
      setQuickMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save attendance' })
    } finally {
      setMarking(false)
    }
  }

  function clearPickedStudent() {
    setPickedStudent(null)
    setPickedStatus(null)
    setQuickMessage(null)
    setSearchInput('')
    setSearchQuery('')
    setSearchResults([])
  }

  // Snapshot of the marks as last loaded/saved — lets us detect unsaved edits.
  // Kept as state (not a ref) so `dirty` recomputes when it changes after a save.
  const [savedSnapshot, setSavedSnapshot] = useState('{}')
  const dirty = useMemo(
    () => JSON.stringify(statusMap) !== savedSnapshot,
    [statusMap, savedSnapshot]
  )

  // Load the college list once
  useEffect(() => {
    (async () => {
      try {
        const res = await API.get('/api/attendance/colleges')
        setColleges(res.data)
      } catch { }
    })()
  }, [])

  // Warn before closing/refreshing the tab while there are unsaved marks
  useEffect(() => {
    if (!dirty) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function loadRoster() {
    if (!college) { setMessage({ type: 'error', text: 'Please select a college first.' }); return }
    // Guard against accidentally discarding unsaved marks on a re-load —
    // show a styled confirmation modal instead of reloading immediately
    if (dirty) {
      setConfirmDialog({
        title: 'Discard unsaved attendance?',
        message: "You have unsaved attendance changes. Reloading the roster will discard them. This can't be undone.",
        confirmLabel: 'Discard & reload',
        danger: true,
        onConfirm: doLoadRoster
      })
      return
    }
    doLoadRoster()
  }

  async function doLoadRoster() {
    setConfirmDialog(null)
    setLoading(true)
    setMessage(null)
    try {
      const res = await API.get(`/api/attendance?college=${encodeURIComponent(college)}&date=${date}`)
      setStudents(res.data.students)
      const map = {}
      res.data.students.forEach(s => { if (s.status) map[s._id] = s.status })
      setStatusMap(map)
      setSavedSnapshot(JSON.stringify(map))
      setLoaded(true)
      setFilter('all')
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to load roster' })
    } finally {
      setLoading(false)
    }
  }

  function setStatus(id, status) {
    setStatusMap(prev => {
      // Clicking the already-selected status clears it back to "not marked"
      if (prev[id] === status) {
        const next = { ...prev }; delete next[id]; return next
      }
      return { ...prev, [id]: status }
    })
  }

  // Overwrite EVERY student's status (replaces marks already made)
  function markAll(status) {
    const map = {}
    students.forEach(s => { map[s._id] = status })
    setStatusMap(map)
  }

  // Only fill in students who haven't been marked yet; existing
  // Present/Absent marks are left untouched
  function markRemaining(status) {
    setStatusMap(prev => {
      const next = { ...prev }
      students.forEach(s => { if (!next[s._id]) next[s._id] = status })
      return next
    })
  }

  function confirmMarkAll(status) {
    setConfirmDialog({
      title: `Mark ALL students ${status}?`,
      message: `This sets every one of the ${students.length} students to ${status}, replacing any Present/Absent marks you've already made. This can't be undone.`,
      confirmLabel: `Yes, mark all ${status}`,
      danger: true,
      onConfirm: () => markAll(status)
    })
  }

  function confirmMarkRemaining(status) {
    const remaining = counts.notMarked
    if (remaining === 0) {
      setMessage({ type: 'error', text: 'There are no unmarked students — every student is already marked.' })
      return
    }
    setConfirmDialog({
      title: `Mark remaining ${remaining} as ${status}?`,
      message: `Only the ${remaining} not-marked student(s) will be set to ${status}. Students already marked Present or Absent stay exactly as they are.`,
      confirmLabel: `Mark remaining ${status}`,
      danger: false,
      onConfirm: () => markRemaining(status)
    })
  }

  const counts = useMemo(() => {
    let present = 0, absent = 0
    students.forEach(s => {
      if (statusMap[s._id] === 'Present') present++
      else if (statusMap[s._id] === 'Absent') absent++
    })
    return {
      total: students.length,
      present,
      absent,
      notMarked: students.length - present - absent
    }
  }, [students, statusMap])

  const visibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(s => {
      // Status filter
      const st = statusMap[s._id]
      if (filter === 'present'  && st !== 'Present') return false
      if (filter === 'absent'   && st !== 'Absent')  return false
      if (filter === 'unmarked' && st)               return false

      // Search filter — matches name, email or phone
      if (q) {
        const haystack = `${s.name || ''} ${s.email || ''} ${s.phone || ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [students, statusMap, filter, search])

  async function handleSave() {
    if (students.length === 0) return

    // Send every student's status (Present / Absent / null). Sending nulls lets
    // the backend remove records the admin cleared, so Save is authoritative for
    // this roster + date.
    const records = students.map(s => ({ studentId: s._id, status: statusMap[s._id] || null }))
    const markedCount = records.filter(r => r.status).length

    setSaving(true)
    setMessage(null)
    try {
      await API.post('/api/attendance/bulk', { date, records })
      setSavedSnapshot(JSON.stringify(statusMap))
      setMessage({ type: 'success', text: `Attendance saved — ${markedCount} marked, ${students.length - markedCount} not marked.` })
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save attendance' })
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    // Loaded on demand so the heavy Excel library isn't in the initial bundle
    const ExcelJS = (await import('exceljs')).default

    const columns = ['#', 'Name', 'Email', 'Phone', 'Course', 'Branch', 'Status']
    const rows = students.map((s, i) => [
      i + 1, s.name, s.email, s.phone,
      s.course === 'Others' ? (s.customCourse || '') : s.course,
      s.branch === 'Others' ? (s.customBranch || '') : s.branch,
      statusMap[s._id] || 'Not Marked'
    ])
    const lastCol = columns.length // number of columns

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Attendance', {
      views: [{ state: 'frozen', ySplit: 6 }] // keep title + header visible while scrolling
    })

    const colLetter = n => String.fromCharCode(64 + n) // 1 -> A, 7 -> G

    // ── Row 1: M H Foundation (static brand heading) ──
    ws.mergeCells(`A1:${colLetter(lastCol)}1`)
    const title = ws.getCell('A1')
    title.value = 'M H Foundation'
    title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } }
    title.alignment = { horizontal: 'center', vertical: 'middle' }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } } // brand green
    ws.getRow(1).height = 28

    // ── Row 2: report subtitle ──
    ws.mergeCells(`A2:${colLetter(lastCol)}2`)
    const subtitle = ws.getCell('A2')
    subtitle.value = 'College Attendance Report'
    subtitle.font = { size: 12, bold: true, color: { argb: 'FF14532D' } }
    subtitle.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(2).height = 20

    // ── Row 3: College name (static label) ──
    ws.mergeCells(`A3:${colLetter(lastCol)}3`)
    const collegeCell = ws.getCell('A3')
    collegeCell.value = { richText: [
      { text: 'College:  ', font: { bold: true, color: { argb: 'FF555555' } } },
      { text: college, font: { bold: true, size: 12, color: { argb: 'FF111111' } } }
    ] }
    collegeCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // ── Row 4: Date + summary counts ──
    ws.mergeCells(`A4:${colLetter(lastCol)}4`)
    const metaCell = ws.getCell('A4')
    metaCell.value = `Date: ${date}    |    Total: ${counts.total}    Present: ${counts.present}    Absent: ${counts.absent}    Not Marked: ${counts.notMarked}`
    metaCell.font = { size: 10, color: { argb: 'FF555555' } }
    metaCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // Row 5 left blank as a spacer

    // ── Row 6: column headers ──
    const headerRowIdx = 6
    const headerRow = ws.getRow(headerRowIdx)
    columns.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = h
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } }
      }
    })
    headerRow.height = 20

    // ── Data rows ──
    rows.forEach((r, ri) => {
      const row = ws.getRow(headerRowIdx + 1 + ri)
      r.forEach((val, ci) => {
        const cell = row.getCell(ci + 1)
        cell.value = val
        cell.alignment = { vertical: 'middle', horizontal: ci === 0 ? 'center' : 'left' }
        cell.border = {
          top: { style: 'hair', color: { argb: 'FFE5E5E5' } },
          bottom: { style: 'hair', color: { argb: 'FFE5E5E5' } }
        }
      })
      // Colour the Status cell (last column) green / red / amber
      const statusCell = row.getCell(lastCol)
      const status = r[lastCol - 1]
      const palette = status === 'Present' ? { fill: 'FFDCFCE7', font: 'FF15803D' }
                    : status === 'Absent'  ? { fill: 'FFFEE2E2', font: 'FFB91C1C' }
                    :                         { fill: 'FFFEF3C7', font: 'FFB45309' }
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.fill } }
      statusCell.font = { bold: true, color: { argb: palette.font } }
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' }
      // Zebra striping for readability
      if (ri % 2 === 1) {
        for (let ci = 1; ci < lastCol; ci++) {
          row.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        }
      }
    })

    // ── Auto-fit column widths from the actual data ──
    ws.columns.forEach((colObj, idx) => {
      let max = columns[idx].length
      rows.forEach(r => {
        const len = String(r[idx] ?? '').length
        if (len > max) max = len
      })
      // padding + sensible min/max bounds
      colObj.width = Math.min(Math.max(max + 3, 8), 50)
    })

    // ── Download ──
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `MH_Foundation_Attendance_${college.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filterTabs = [
    { value: 'all',      label: 'All',        count: counts.total },
    { value: 'present',  label: 'Present',    count: counts.present },
    { value: 'absent',   label: 'Absent',     count: counts.absent },
    { value: 'unmarked', label: 'Not Marked', count: counts.notMarked }
  ]

  return (
    <AdminLayout>
      <div className="mb-6">
        <h2 className="font-heading text-2xl font-bold text-gray-800">College Attendance</h2>
        <p className="text-gray-500 text-sm">Mark attendance college-wise, or look up one student directly if you don't know their college.</p>
      </div>

      {/* ── Mode toggle ── */}
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={() => setMode('college')}
          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
            mode === 'college' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
          }`}
        >
          By College
        </button>
        <button
          onClick={() => setMode('search')}
          className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
            mode === 'search' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
          }`}
        >
          Search Student
        </button>
      </div>

      {mode === 'search' && (
        <>
          <div className="card mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-4">
              <div className="sm:col-span-2">
                <label className="form-label">Search by name, email, phone, college or Aadhar</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Start typing to search across every college…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
              </div>
            </div>

            {searching && <p className="text-sm text-gray-400 flex items-center gap-2"><Spinner /> Searching…</p>}

            {!searching && searchQuery && searchResults.length === 0 && (
              <p className="text-sm text-gray-400">No students match "{searchQuery}".</p>
            )}

            {!pickedStudent && searchResults.length > 0 && (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {searchResults.map(s => (
                  <button
                    key={s._id}
                    onClick={() => pickStudent(s)}
                    className="w-full text-left px-4 py-3 hover:bg-brand-50/40 transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-500 truncate">{s.college} • {s.email} • {s.phone}</p>
                    </div>
                    <span className="text-xs text-brand-600 font-semibold flex-shrink-0">Select →</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {pickedStudent && (
            <div className="card mb-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="font-heading font-bold text-lg text-gray-800">{pickedStudent.name}</h3>
                  <p className="text-sm text-gray-500">
                    {pickedStudent.college} • {pickedStudent.course === 'Others' ? pickedStudent.customCourse : pickedStudent.course}
                    {pickedStudent.branch ? ` • ${pickedStudent.branch === 'Others' ? pickedStudent.customBranch : pickedStudent.branch}` : ''}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{pickedStudent.email} • {pickedStudent.phone}</p>
                </div>
                <button className="btn-secondary text-xs !px-3 !py-1.5" onClick={clearPickedStudent}>Change student</button>
              </div>

              {statusLoading ? (
                <p className="text-sm text-gray-400 flex items-center gap-2"><Spinner /> Checking current status…</p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    Attendance for <span className="font-medium">{date}</span>:{' '}
                    {pickedStatus ? (
                      <span className={pickedStatus === 'Present' ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>{pickedStatus}</span>
                    ) : (
                      <span className="text-amber-600 font-semibold">Not marked</span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => markPickedStudent('Present')}
                      disabled={marking}
                      className={`px-5 py-2 rounded-full text-sm font-semibold border transition ${
                        pickedStatus === 'Present' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                      }`}
                    >
                      {marking ? <><Spinner /> Saving…</> : 'Mark Present'}
                    </button>
                    <button
                      onClick={() => markPickedStudent('Absent')}
                      disabled={marking}
                      className={`px-5 py-2 rounded-full text-sm font-semibold border transition ${
                        pickedStatus === 'Absent' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                      }`}
                    >
                      {marking ? <><Spinner /> Saving…</> : 'Mark Absent'}
                    </button>
                  </div>
                </>
              )}

              {quickMessage && (
                <div className={`mt-4 px-4 py-2.5 rounded-lg text-sm ${
                  quickMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {quickMessage.text}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mode === 'college' && (
      <>
      {/* ── Selector bar ── */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className="form-label">College <span className="text-red-500">*</span></label>
            <select className="form-input" value={college} onChange={e => setCollege(e.target.value)}>
              <option value="">Select a college…</option>
              {colleges.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Date</label>
            <input type="date" className="form-input" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <button className="btn-primary w-full" onClick={loadRoster} disabled={loading || !college}>
              {loading ? <><Spinner /> Loading…</> : 'Load Roster'}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {loaded && (
        <>
          {/* ── Live counts ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <CountCard label="Total Students" value={counts.total}     accent="bg-gray-50 border-gray-200 text-gray-800" />
            <CountCard label="Present"        value={counts.present}   accent="bg-green-50 border-green-200 text-green-700" />
            <CountCard label="Absent"         value={counts.absent}    accent="bg-red-50 border-red-200 text-red-700" />
            <CountCard label="Not Marked"     value={counts.notMarked} accent="bg-amber-50 border-amber-200 text-amber-700" />
          </div>

          {students.length === 0 ? (
            <div className="card text-center py-16 text-gray-500">
              No students found for <span className="font-medium">{college}</span>.
            </div>
          ) : (
            <>
              {/* ── Search bar ── */}
              <div className="relative mb-3 max-w-md">
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  className="form-input pl-9 w-full"
                  placeholder="Search by name, email or phone…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    title="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* ── Action toolbar ── */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex flex-wrap gap-1.5">
                  {filterTabs.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setFilter(t.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                        filter === t.value
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                      }`}
                    >
                      {t.label} <span className="opacity-70">({t.count})</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {dirty && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Unsaved changes
                    </span>
                  )}
                  <button className="btn-secondary text-sm" onClick={() => confirmMarkAll('Present')}>Mark All Present</button>
                  <button className="btn-secondary text-sm" onClick={() => confirmMarkAll('Absent')}>Mark All Absent</button>
                  <button
                    className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => confirmMarkRemaining('Present')}
                    disabled={counts.notMarked === 0}
                    title="Set only the not-marked students to Present"
                  >
                    Remaining → Present
                  </button>
                  <button
                    className="btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => confirmMarkRemaining('Absent')}
                    disabled={counts.notMarked === 0}
                    title="Set only the not-marked students to Absent"
                  >
                    Remaining → Absent
                  </button>
                  <button className="btn-secondary text-sm" onClick={handleExport}>Export Excel</button>
                  <button className="btn-primary text-sm" onClick={handleSave} disabled={saving || !dirty}>
                    {saving ? <><Spinner /> Saving…</> : 'Save Attendance'}
                  </button>
                </div>
              </div>

              {/* ── Roster ── */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['#', 'Name', 'Email', 'Phone', 'Course', 'Branch', 'Attendance'].map(h => (
                        <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStudents.map((s, i) => {
                      const st = statusMap[s._id]
                      return (
                        <tr
                          key={s._id}
                          className={`border-b border-gray-100 transition ${
                            st === 'Present' ? 'bg-green-50/60' :
                            st === 'Absent'  ? 'bg-red-50/60' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{s.name}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.email}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.phone}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.course === 'Others' ? s.customCourse : s.course}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{s.branch === 'Others' ? s.customBranch : s.branch}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setStatus(s._id, 'Present')}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                                  st === 'Present'
                                    ? 'bg-green-600 text-white border-green-600'
                                    : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                                }`}
                              >
                                Present
                              </button>
                              <button
                                onClick={() => setStatus(s._id, 'Absent')}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                                  st === 'Absent'
                                    ? 'bg-red-600 text-white border-red-600'
                                    : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                                }`}
                              >
                                Absent
                              </button>
                              {!st && <span className="text-xs text-amber-600 ml-1">Not marked</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {visibleStudents.length === 0 && (
                <div className="card text-center py-10 text-gray-500 mt-3">No students match this filter.</div>
              )}
            </>
          )}
        </>
      )}

      {!loaded && !loading && (
        <div className="card text-center py-16 text-gray-500">
          Select a college and date, then click <span className="font-medium">Load Roster</span> to begin marking attendance.
        </div>
      )}
      </>
      )}

      {/* ── Generic confirmation modal ── */}
      {confirmDialog && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                  confirmDialog.danger ? 'bg-red-100' : 'bg-amber-100'
                }`}>
                  <svg className={`w-6 h-6 ${confirmDialog.danger ? 'text-red-600' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-gray-800">{confirmDialog.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{confirmDialog.message}</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
              <button className="btn-secondary text-sm" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <button
                className={`text-sm ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => { confirmDialog.onConfirm?.(); setConfirmDialog(null) }}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
