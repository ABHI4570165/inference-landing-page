import { useState, useEffect, useMemo, useCallback } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { useWorkspace } from '../context/WorkspaceContext'
import { RECEPTION_PATH, receptionUrlFor } from '../utils/routes'

const FILTER_TABS = [
  { value: 'all',        label: 'All Students' },
  { value: 'registered', label: 'Registered' },
  { value: 'pending',    label: 'Pending Counselling' },
  { value: 'completed',  label: 'Completed Counselling' }
]

function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

// Shift a 'YYYY-MM-DD' string by whole days without local-timezone drift
function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function StatusBadge({ ok, yes, no }) {
  return ok ? (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{yes}</span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{no}</span>
  )
}

export default function AdminReception() {
  const { workspace } = useWorkspace()
  const [students, setStudents] = useState([])
  const [date, setDate] = useState(todayIST())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  // QR + link for the reception tablet — this workspace's own unique link
  // if it has a token yet, falling back to the original bare link otherwise.
  const receptionPath = workspace?.receptionToken ? receptionUrlFor(workspace.receptionToken) : RECEPTION_PATH
  const receptionUrl = `${window.location.origin}${receptionPath}`
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    import('qrcode').then(QRCode =>
      QRCode.toDataURL(receptionUrl, { width: 480, margin: 2, color: { dark: '#0F4C81' } })
        .then(setQrDataUrl)
    ).catch(() => {})
  }, [receptionUrl])

  function copyLink() {
    navigator.clipboard.writeText(receptionUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Day-wise fetch — every registration is stored permanently against its own
  // calendar day, so any past day can be pulled up on demand.
  const fetchDay = useCallback(async d => {
    setLoading(true)
    try {
      const res = await API.get(`/api/reception/day?date=${d}`)
      setStudents(res.data.students)
      setDate(res.data.date)
    } catch { }
    setLoading(false)
  }, [])

  useEffect(() => { fetchDay(date) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function goToDate(d) {
    setDate(d)
    fetchDay(d)
  }

  const isToday = date === todayIST()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(s => {
      if (filter === 'registered' && s.registrationStatus !== 'REGISTERED') return false
      if (filter === 'pending' && !(s.registrationStatus === 'REGISTERED' && s.counsellingStatus !== 'COMPLETED')) return false
      if (filter === 'completed' && s.counsellingStatus !== 'COMPLETED') return false
      if (!q) return true
      // Search by name or mobile number
      return (s.name || '').toLowerCase().includes(q) || (s.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || q)
    })
  }, [students, filter, search])

  const registeredCount = students.filter(s => s.registrationStatus === 'REGISTERED').length
  const completedCount = students.filter(s => s.counsellingStatus === 'COMPLETED').length

  async function handleDeleteRegistration(s) {
    if (!confirm(`Delete ${s.name}'s reception registration for ${date}? Their photo and check-in record will be removed and they will need to check in again from scratch.`)) return
    try {
      await API.delete(`/api/reception/registration/${s._id}?date=${date}`)
      // Remove the row immediately instead of refetching — a refetch would pull
      // this student straight back into the list via their attendance record
      // for the day (now correctly flagged Not Registered), which looks like
      // the delete had no effect. If they check in again, they'll reappear.
      setStudents(prev => prev.filter(x => x._id !== s._id))
    } catch { alert('Delete failed') }
  }

  // Rows with no registration have nothing to delete — they're only listed
  // because of their Attendance "Present" mark for the day, which this page
  // never touches. This just hides the row from the current view; it will
  // reappear on refresh (or once they do check in) since attendance is intact.
  function handleHideUnregistered(s) {
    if (!confirm(`Remove ${s.name} from this list? They have not registered — their attendance record is not affected and this row will come back if you refresh.`)) return
    setStudents(prev => prev.filter(x => x._id !== s._id))
  }

  return (
    <AdminLayout
      title="Reception"
      subtitle={`${students.length} students · ${registeredCount} registered · ${completedCount} counselling completed`}
      actions={
        <>
          <input
            type="search"
            className="form-input w-full sm:w-64"
            placeholder="Search by name or mobile number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button onClick={() => fetchDay(date)} className="btn-secondary" title="Refresh">↻ Refresh</button>
        </>
      }
    >
      {/* ── Day-wise navigation ── */}
      <div className="card mb-5 flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => goToDate(shiftDate(date, -1))} title="Previous day">← Prev Day</button>
        <input
          type="date"
          className="form-input w-44"
          value={date}
          max={todayIST()}
          onChange={e => goToDate(e.target.value)}
        />
        <button className="btn-secondary" onClick={() => goToDate(shiftDate(date, 1))} disabled={isToday} title="Next day">Next Day →</button>
        {!isToday && (
          <button className="btn-secondary" onClick={() => goToDate(todayIST())}>Jump to Today</button>
        )}
        <span className="text-sm text-gray-500 ml-1">Drive date: <span className="font-medium text-gray-700">{date}</span></span>
      </div>

      {/* ── QR + link for the entrance tablet ── */}
      <div className="card mb-5 flex flex-wrap items-center gap-6">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="Reception check-in QR code" className="w-36 h-36 rounded-lg border border-gray-200" />
          : <div className="w-36 h-36 rounded-lg bg-gray-100 animate-pulse" />}
        <div className="flex-1 min-w-[240px]">
          <h3 className="font-heading font-bold text-gray-800 mb-1">Reception Tablet Link</h3>
          <p className="text-sm text-gray-500 mb-3">
            Open this link on the tablet placed at the office entrance. Students enter their name and mobile number,
            then capture a photo to complete check-in before counselling.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 break-all">{receptionUrl}</code>
            <button className="btn-secondary text-sm" onClick={copyLink}>{copied ? '✓ Copied' : 'Copy Link'}</button>
            {qrDataUrl && (
              <a className="btn-secondary text-sm" href={qrDataUrl} download="reception-qr.png">Download QR</a>
            )}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition border
              ${filter === tab.value
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-500">No students found for this day / filter.</div>
      ) : (
        <div className="table-scroll scroll-slim rounded-xl border border-surface-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['#', 'Photo', 'Name', 'Phone', 'Attendance', 'Registration', 'Counselling', 'Time', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s._id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    {s.registrationPhoto ? (
                      <a href={s.registrationPhoto} target="_blank" rel="noreferrer" title="View photo">
                        <img src={s.registrationPhoto} alt={s.name} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                      </a>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">—</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.phone}</td>
                  <td className="px-4 py-3">
                    <StatusBadge ok={s.attendanceStatus === 'Present'} yes="Present" no={s.attendanceStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge ok={s.registrationStatus === 'REGISTERED'} yes="Registered" no="Not Registered" />
                  </td>
                  <td className="px-4 py-3">
                    {s.counsellingStatus === 'COMPLETED' ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">Completed</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {s.registrationTime ? new Date(s.registrationTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => s.registrationStatus === 'REGISTERED' ? handleDeleteRegistration(s) : handleHideUnregistered(s)}
                      title={s.registrationStatus === 'REGISTERED' ? 'Delete Registration' : 'Remove from list (attendance not affected)'}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
