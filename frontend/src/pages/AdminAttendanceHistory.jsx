import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { useWorkspace } from '../context/WorkspaceContext'
import { StatTile, HBarList, TrendLine } from '../components/Charts'

// Attendance History — every marking session is stored permanently, can be
// reopened and edited later (changes autosave and are logged in an audit
// trail), and is analysed month-wise / college-wise / branch-wise.
export default function AdminAttendanceHistory() {
  const [selected, setSelected] = useState(null) // session id or null (list view)
  return (
    <AdminLayout
      title="Attendance History"
      subtitle="Every attendance session is stored permanently — browse recent sessions, review details, and edit them whenever needed."
    >
      {selected
        ? <SessionDetail id={selected} onBack={() => setSelected(null)} />
        : <HistoryList onOpen={setSelected} />}
    </AdminLayout>
  )
}

// ═══════════════════════ LIST + ANALYTICS ══════════════════════════════════
function HistoryList({ onOpen }) {
  const { workspace } = useWorkspace()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState(null)
  const [colleges, setColleges] = useState([])
  const [filters, setFilters] = useState({ college: '', month: '', from: '', to: '', batch: '', year: '', admin: '', search: '', sort: 'latest' })

  useEffect(() => {
    API.get('/api/attendance/colleges').then(r => setColleges(r.data)).catch(() => setColleges([]))
  }, [workspace?._id])

  const query = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    return params.toString()
  }, [filters])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    Promise.all([
      API.get(`/api/attendance-sessions?${query}&page=${page}&limit=${limit}`),
      API.get(`/api/attendance-sessions/analytics?${query}`)
    ]).then(([listRes, anRes]) => {
      if (ignore) return
      setRows(listRes.data.rows)
      setTotal(listRes.data.total)
      setAnalytics(anRes.data)
    }).catch(() => {})
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [query, page, limit])

  const pages = Math.max(1, Math.ceil(total / limit))

  const resetFilters = () => {
    setFilters({ college: '', month: '', from: '', to: '', batch: '', year: '', admin: '', search: '', sort: 'latest' })
    setPage(1)
  }

  const handleDelete = async (session) => {
    if (!window.confirm(`Delete attendance session for ${session.college} on ${session.date}?`)) return
    try {
      await API.delete(`/api/attendance-sessions/${session._id}`)
      setRows(prev => prev.filter(r => r._id !== session._id))
      setTotal(prev => prev - 1)
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not delete this session.')
    }
  }

  const exportCsv = (sessions) => {
    const rowsCsv = [
      ['College', 'Date', 'Batch', 'Present', 'Absent', 'Attendance %', 'Taken By', 'Created At'],
      ...sessions.map(s => {
        const pct = s.totalMarked ? Math.round((s.presentCount / s.totalMarked) * 100) : 0
        return [s.college, s.date, s.batch || '', s.presentCount, s.absentCount, `${pct}%`, s.takenBy || '', s.createdAt || '']
      })
    ]
    const csv = rowsCsv.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'attendance-history.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = (session) => {
    const pct = session.totalMarked ? Math.round((session.presentCount / session.totalMarked) * 100) : 0
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Attendance Session</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{margin-bottom:8px}p{margin:4px 0}</style></head><body><h1>${session.college}</h1><p>Date: ${session.date}</p><p>Batch: ${session.batch || '—'}</p><p>Present: ${session.presentCount}</p><p>Absent: ${session.absentCount}</p><p>Attendance %: ${pct}%</p><p>Taken By: ${session.takenBy || '—'}</p><p>Created: ${session.createdAt || '—'}</p></body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <>
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
          <div>
            <label className="form-label">College</label>
            <select className="form-input" value={filters.college}
              onChange={e => { setFilters(f => ({ ...f, college: e.target.value })); setPage(1) }}>
              <option value="">All colleges</option>
              {colleges.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Month</label>
            <input type="month" className="form-input" value={filters.month}
              onChange={e => { setFilters(f => ({ ...f, month: e.target.value, from: '', to: '' })); setPage(1) }} />
          </div>
          <div>
            <label className="form-label">Year</label>
            <input type="number" min="2020" max="2100" className="form-input" value={filters.year}
              onChange={e => { setFilters(f => ({ ...f, year: e.target.value })); setPage(1) }} placeholder="2026" />
          </div>
          <div>
            <label className="form-label">Batch</label>
            <input className="form-input" value={filters.batch}
              onChange={e => { setFilters(f => ({ ...f, batch: e.target.value })); setPage(1) }} placeholder="e.g. Final Year" />
          </div>
          <div>
            <label className="form-label">Admin</label>
            <input className="form-input" value={filters.admin}
              onChange={e => { setFilters(f => ({ ...f, admin: e.target.value })); setPage(1) }} placeholder="Email or name" />
          </div>
          <div>
            <label className="form-label">Sort</label>
            <select className="form-input" value={filters.sort}
              onChange={e => { setFilters(f => ({ ...f, sort: e.target.value })); setPage(1) }}>
              <option value="latest">Latest first</option>
              <option value="oldest">Oldest first</option>
              <option value="college">College A-Z</option>
              <option value="highest">Highest attendance</option>
              <option value="lowest">Lowest attendance</option>
            </select>
          </div>
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-input" value={filters.from}
              onChange={e => { setFilters(f => ({ ...f, from: e.target.value, month: '', year: '' })); setPage(1) }} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-input" value={filters.to}
              onChange={e => { setFilters(f => ({ ...f, to: e.target.value, month: '', year: '' })); setPage(1) }} />
          </div>
          <div className="sm:col-span-2 xl:col-span-4">
            <label className="form-label">Search by college</label>
            <div className="flex gap-2">
              <input className="form-input flex-1" value={filters.search}
                onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1) }} placeholder="Type a college name" />
              <button className="btn-secondary text-sm" onClick={resetFilters}>Reset</button>
            </div>
          </div>
        </div>
      </div>

      {analytics && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatTile label="Attendance %" value={`${analytics.overall.percent}%`} accent="text-brand-700" />
            <StatTile label="Total Marked" value={analytics.overall.total} />
            <StatTile label="Present" value={analytics.overall.present} accent="text-green-700" />
            <StatTile label="Absent" value={analytics.overall.absent} accent="text-red-600" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className="card lg:col-span-2">
              <h3 className="font-heading font-bold text-gray-800 mb-3">Daily Attendance %</h3>
              <TrendLine data={analytics.byDate.map(d => ({ label: d.date, value: d.percent }))} suffix="%" />
            </div>
            <div className="card">
              <h3 className="font-heading font-bold text-gray-800 mb-3">Monthly Attendance %</h3>
              <HBarList data={analytics.byMonth.map(m => ({ label: m.month, value: m.percent, sub: `${m.present}/${m.total}` }))} suffix="%" />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-heading font-bold text-gray-800 mb-3">College-wise Attendance %</h3>
              <HBarList data={analytics.byCollege.slice(0, 8).map(c => ({ label: c.college, value: c.percent, sub: `${c.present}/${c.total}` }))} suffix="%" />
            </div>
            <div className="card">
              <h3 className="font-heading font-bold text-gray-800 mb-3">Branch-wise Attendance %</h3>
              <HBarList color="#2a78d6" data={analytics.byBranch.slice(0, 8).map(b => ({ label: b.branch || 'Unknown', value: b.percent, sub: `${b.present}/${b.total}` }))} suffix="%" />
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">Showing {rows.length} of {total} sessions</p>
        <button className="btn-secondary text-sm" onClick={() => exportCsv(rows)}>Export Excel</button>
      </div>

      {loading ? (
        <div className="card flex justify-center py-14 text-gray-400"><Spinner /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card py-14 text-center text-gray-400">No attendance sessions found. Sessions appear here automatically when attendance is saved.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map(s => {
            const pct = s.totalMarked ? Math.round((s.presentCount / s.totalMarked) * 100) : 0
            return (
              <div key={s._id} className="card border border-gray-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-gray-800">{s.college}</h3>
                    <p className="text-sm text-gray-500">📅 {s.date}</p>
                  </div>
                  <span className="rounded-full bg-brand-50 text-brand-700 px-2.5 py-1 text-xs font-semibold">{s.batch || 'Batch not set'}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div className="rounded-lg bg-green-50 p-3 text-green-700">
                    <div className="text-xs uppercase tracking-wide opacity-70">Present</div>
                    <div className="font-bold text-lg">{s.presentCount}</div>
                  </div>
                  <div className="rounded-lg bg-red-50 p-3 text-red-600">
                    <div className="text-xs uppercase tracking-wide opacity-70">Absent</div>
                    <div className="font-bold text-lg">{s.absentCount}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  <div>Attendance Percentage: <span className="font-semibold text-gray-800">{pct}%</span></div>
                  <div>Created: <span className="font-medium">{s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</span></div>
                  <div>Created By: <span className="font-medium">{s.takenBy || '—'}</span></div>
                  <div>Last Updated: <span className="font-medium">{s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '—'}</span></div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="btn-primary text-sm" onClick={() => onOpen(s._id)}>View Attendance</button>
                  <button className="btn-secondary text-sm" onClick={() => onOpen(s._id)}>Edit Attendance</button>
                  <button className="btn-secondary text-sm" onClick={() => handleDelete(s)}>Delete</button>
                  <button className="btn-secondary text-sm" onClick={() => exportCsv([s])}>Export Excel</button>
                  <button className="btn-secondary text-sm" onClick={() => exportPdf(s)}>Export PDF</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button className="btn-secondary text-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-sm text-gray-500 px-2">Page {page} of {pages}</span>
          <button className="btn-secondary text-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </>
  )
}

// ═══════════════════════ SESSION DETAIL / EDITOR ═══════════════════════════
function SessionDetail({ id, onBack }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusMap, setStatusMap] = useState({})
  const [remarks, setRemarks] = useState('')
  const [batch, setBatch] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [saveState, setSaveState] = useState('idle') // idle | dirty | saving | saved | error
  const [showHistory, setShowHistory] = useState(false)
  const pendingRef = useRef({}) // studentId -> status|null (changes not yet saved)
  const metaDirtyRef = useRef(false)

  useEffect(() => {
    let ignore = false
    API.get(`/api/attendance-sessions/${id}`)
      .then(r => {
        if (ignore) return
        setSession(r.data)
        const map = {}
        r.data.roster.forEach(s => { if (s.status) map[s._id] = s.status })
        setStatusMap(map)
        setRemarks(r.data.remarks || '')
        setBatch(r.data.batch || '')
      })
      .catch(() => {})
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [id])

  // ── autosave every 3s when there are pending edits ──
  const flush = useCallback(async () => {
    const pending = pendingRef.current
    const hasRecords = Object.keys(pending).length > 0
    if (!hasRecords && !metaDirtyRef.current) return
    pendingRef.current = {}
    const wasMetaDirty = metaDirtyRef.current
    metaDirtyRef.current = false
    setSaveState('saving')
    try {
      const res = await API.patch(`/api/attendance-sessions/${id}`, {
        records: Object.entries(pending).map(([studentId, status]) => ({ studentId, status })),
        ...(wasMetaDirty ? { remarks, batch } : {})
      })
      setSaveState('saved')
      setSession(s => s ? { ...s, presentCount: res.data.presentCount, absentCount: res.data.absentCount, editCount: res.data.editCount } : s)
    } catch {
      // put the changes back so the next tick retries
      pendingRef.current = { ...pending, ...pendingRef.current }
      metaDirtyRef.current = metaDirtyRef.current || wasMetaDirty
      setSaveState('error')
    }
  }, [id, remarks, batch])

  useEffect(() => {
    const t = setInterval(flush, 3000)
    return () => clearInterval(t)
  }, [flush])

  // warn before leaving with unsaved edits
  useEffect(() => {
    const warn = e => {
      if (Object.keys(pendingRef.current).length || metaDirtyRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  function setStatus(studentId, status) {
    setStatusMap(prev => {
      const cur = prev[studentId]
      const next = { ...prev }
      const newStatus = cur === status ? null : status // click again to clear
      if (newStatus) next[studentId] = newStatus
      else delete next[studentId]
      pendingRef.current[studentId] = newStatus
      return next
    })
    setSaveState('dirty')
  }

  const counts = useMemo(() => {
    if (!session) return { total: 0, present: 0, absent: 0, notMarked: 0 }
    let present = 0, absent = 0
    session.roster.forEach(s => {
      if (statusMap[s._id] === 'Present') present++
      else if (statusMap[s._id] === 'Absent') absent++
    })
    return { total: session.roster.length, present, absent, notMarked: session.roster.length - present - absent }
  }, [session, statusMap])

  const visible = useMemo(() => {
    if (!session) return []
    const q = search.trim().toLowerCase()
    return session.roster.filter(s => {
      const st = statusMap[s._id]
      if (filter === 'present' && st !== 'Present') return false
      if (filter === 'absent' && st !== 'Absent') return false
      if (filter === 'unmarked' && st) return false
      if (q && !`${s.name} ${s.email} ${s.phone}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [session, statusMap, filter, search])

  if (loading) return <div className="card flex justify-center py-20 text-gray-400 gap-2"><Spinner /> Loading session…</div>
  if (!session) return <div className="card text-center py-16 text-red-600">Session not found</div>

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <button className="text-sm text-brand-600 hover:underline" onClick={onBack}>← Back to history</button>
          <h2 className="font-heading text-2xl font-bold text-gray-800 mt-1">{session.college}</h2>
          <p className="text-gray-500 text-sm">
            {session.date} • taken by {session.takenBy || 'unknown'}
            {session.editHistory?.length > 0 && ` • ${session.editHistory.length} edit${session.editHistory.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} />
          <button className="btn-secondary text-sm" onClick={() => setShowHistory(v => !v)}>
            {showHistory ? 'Hide' : 'Show'} Edit History
          </button>
        </div>
      </div>

      {/* counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatTile label="Total Students" value={counts.total} />
        <StatTile label="Present" value={counts.present} accent="text-green-700" />
        <StatTile label="Absent" value={counts.absent} accent="text-red-600" />
        <StatTile label="Not Marked" value={counts.notMarked} accent="text-amber-600" />
      </div>

      {/* remarks + batch */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="form-label">Batch</label>
            <input className="form-input" placeholder="e.g. Batch A / Morning" value={batch}
              onChange={e => { setBatch(e.target.value); metaDirtyRef.current = true; setSaveState('dirty') }} />
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">Remarks</label>
            <input className="form-input" placeholder="Optional notes about this session…" value={remarks}
              onChange={e => { setRemarks(e.target.value); metaDirtyRef.current = true; setSaveState('dirty') }} />
          </div>
        </div>
      </div>

      {/* edit history */}
      {showHistory && (
        <div className="card mb-4">
          <h3 className="font-heading font-bold text-gray-800 mb-3">Edit History</h3>
          {(session.editHistory || []).length === 0 ? (
            <p className="text-sm text-gray-400">No edits since this session was created.</p>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {[...session.editHistory].reverse().map((e, i) => (
                <div key={i} className="border-l-2 border-brand-200 pl-3">
                  <p className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">{e.editedBy || 'unknown'}</span> — {new Date(e.editedAt).toLocaleString()}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {e.changes.map((c, j) => (
                      <li key={j} className="text-xs text-gray-600">
                        {c.studentName}: <span className="text-gray-400">{c.from}</span> → <span className="font-medium">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* filter + search */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {[['all', 'All', counts.total], ['present', 'Present', counts.present], ['absent', 'Absent', counts.absent], ['unmarked', 'Not Marked', counts.notMarked]].map(([v, label, n]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              filter === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}>
            {label} <span className="opacity-70">({n})</span>
          </button>
        ))}
        <input className="form-input !w-auto flex-1 min-w-[180px]" placeholder="Search name, email, phone…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* roster */}
      <div className="table-scroll scroll-slim rounded-xl border border-surface-200 bg-white shadow-card mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['#', 'Name', 'Email', 'Phone', 'Attendance'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => {
              const st = statusMap[s._id]
              return (
                <tr key={s._id} className={`border-b border-gray-100 transition ${
                  st === 'Present' ? 'bg-green-50/60' : st === 'Absent' ? 'bg-red-50/60' : 'hover:bg-gray-50'
                }`}>
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.email}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.phone}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setStatus(s._id, 'Present')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                          st === 'Present' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                        }`}>Present</button>
                      <button onClick={() => setStatus(s._id, 'Absent')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                          st === 'Absent' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-300 hover:bg-red-50'
                        }`}>Absent</button>
                      {!st && <span className="text-xs text-amber-600 ml-1">Not marked</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No students match this filter.</div>}
      </div>
    </>
  )
}

function SaveIndicator({ state }) {
  const map = {
    dirty:  ['bg-amber-50 text-amber-700 border-amber-200', '● Unsaved — autosaving…'],
    saving: ['bg-blue-50 text-blue-700 border-blue-200', 'Saving…'],
    saved:  ['bg-green-50 text-green-700 border-green-200', '✓ All changes saved'],
    error:  ['bg-red-50 text-red-700 border-red-200', 'Save failed — retrying']
  }
  if (state === 'idle') return null
  const [cls, label] = map[state]
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cls}`}>{label}</span>
}
