import { useState, useEffect } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import CounsellingNav from '../components/CounsellingNav'
import Spinner from '../components/Spinner'
import { useWorkspace } from '../context/WorkspaceContext'
import { StatTile, HBarList, Donut, TrendLine, Meter } from '../components/Charts'
import { COUNSELLING_FORM_PATH, counsellingUrlFor } from '../utils/routes'

export default function AdminCounselling() {
  const { workspace } = useWorkspace()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [colleges, setColleges] = useState([])
  const [filters, setFilters] = useState({ college: '', from: '', to: '' })

  // QR code — this workspace's own unique link if it has a token yet,
  // falling back to the original bare link otherwise.
  const counsellingPath = workspace?.counsellingToken ? counsellingUrlFor(workspace.counsellingToken) : COUNSELLING_FORM_PATH
  const formUrl = `${window.location.origin}${counsellingPath}`
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    API.get('/api/attendance/colleges').then(r => setColleges(r.data)).catch(() => {})
    import('qrcode').then(QRCode =>
      QRCode.toDataURL(formUrl, { width: 480, margin: 2, color: { dark: '#14532d' } })
        .then(setQrDataUrl)
    ).catch(() => {})
  }, [formUrl])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.college) params.set('college', filters.college)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    API.get(`/api/admin/counselling/dashboard?${params}`)
      .then(r => { if (!ignore) { setData(r.data); setError(null) } })
      .catch(err => { if (!ignore) setError(err.response?.data?.message || 'Failed to load dashboard') })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [filters])

  function copyLink() {
    navigator.clipboard.writeText(formUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <AdminLayout
      title="Counselling"
      subtitle="Assessment responses, AI insights and the student QR code."
    >
      <CounsellingNav />

      {/* ── QR + link ── */}
      <div className="card mb-5 flex flex-wrap items-center gap-6">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="Counselling form QR code" className="w-36 h-36 rounded-lg border border-gray-200" />
          : <div className="w-36 h-36 rounded-lg bg-gray-100 animate-pulse" />}
        <div className="flex-1 min-w-[240px]">
          <h3 className="font-heading font-bold text-gray-800 mb-1">Student Counselling QR</h3>
          <p className="text-sm text-gray-500 mb-3">
            Students scan this to open the assessment. They verify with name, email and mobile —
            only students marked <span className="font-medium text-green-700">Present today</span> can submit.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 break-all">{formUrl}</code>
            <button className="btn-secondary text-sm" onClick={copyLink}>{copied ? '✓ Copied' : 'Copy Link'}</button>
            {qrDataUrl && (
              <a className="btn-secondary text-sm" href={qrDataUrl} download="counselling-qr.png">Download QR</a>
            )}
          </div>
        </div>
      </div>

      {/* ── filters ── */}
      <div className="card mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="form-label">College</label>
            <select className="form-input" value={filters.college}
              onChange={e => setFilters(f => ({ ...f, college: e.target.value }))}>
              <option value="">All colleges</option>
              {colleges.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-input" value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-input" value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          </div>
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-2.5 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{error}</div>}

      {loading ? (
        <div className="card flex items-center justify-center py-20 text-gray-400 gap-2"><Spinner /> Loading analytics…</div>
      ) : data && (
        <>
          {/* ── stat tiles ── */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
            <StatTile label="Total Forms" value={data.totals.total} />
            <StatTile label="Completed" value={data.totals.submitted} accent="text-green-700" />
            <StatTile label="Pending / In Progress" value={data.totals.pending} accent="text-amber-600" />
            <StatTile label="Avg Confidence" value={data.avgScores ? data.avgScores.confidence : '—'} sub="out of 100" />
            <StatTile label="Avg Career Clarity" value={data.avgScores ? data.avgScores.careerClarity : '—'} sub="out of 100" />
            <StatTile label="Avg Readiness" value={data.avgScores ? data.avgScores.technicalReadiness : '—'} sub="out of 100" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            {/* submissions over time */}
            <div className="card">
              <h3 className="font-heading font-bold text-gray-800 mb-3">Submissions by Date</h3>
              <TrendLine data={data.byDate.map(d => ({ label: d.date, value: d.count }))} />
            </div>

            {/* preferred domains */}
            <div className="card">
              <h3 className="font-heading font-bold text-gray-800 mb-3">Most Preferred Roles</h3>
              <Donut data={data.preferredDomains.map(d => ({ label: d.domain, value: d.count }))} />
            </div>

            {/* college-wise */}
            <div className="card">
              <h3 className="font-heading font-bold text-gray-800 mb-3">College-wise Submissions</h3>
              <HBarList
                data={data.byCollege.slice(0, 10).map(c => ({ label: c.college, value: c.count, sub: `avg ${c.avgScore} pts` }))}
              />
            </div>

            {/* branch-wise */}
            <div className="card">
              <h3 className="font-heading font-bold text-gray-800 mb-3">Branch-wise Submissions</h3>
              <HBarList
                color="#2a78d6"
                data={data.byBranch.slice(0, 10).map(b => ({ label: b.branch, value: b.count, sub: `avg ${b.avgScore} pts` }))}
              />
            </div>
          </div>

          {/* average AI scores */}
          <div className="card mb-8">
            <h3 className="font-heading font-bold text-gray-800 mb-1">Average AI Scores</h3>
            {data.avgScores ? (
              <>
                <p className="text-xs text-gray-400 mb-4">Across {data.avgScores.count} generated report{data.avgScores.count === 1 ? '' : 's'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                  <Meter label="Career Clarity" value={data.avgScores.careerClarity} />
                  <Meter label="Confidence" value={data.avgScores.confidence} />
                  <Meter label="Technical Readiness" value={data.avgScores.technicalReadiness} />
                  <Meter label="Learning Attitude" value={data.avgScores.learningAttitude} />
                  <Meter label="Placement Readiness" value={data.avgScores.placementReadiness} />
                  <Meter label="Communication" value={data.avgScores.communicationReadiness} />
                  <Meter label="Motivation" value={data.avgScores.motivation} />
                  <Meter label="Risk Level" value={data.avgScores.riskLevel} invert />
                  <Meter label="Overall" value={data.avgScores.overall} />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 py-6 text-center">No AI reports generated yet</p>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  )
}
