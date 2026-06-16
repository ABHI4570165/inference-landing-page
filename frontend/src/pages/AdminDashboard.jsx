import { useState, useEffect, useRef } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'

const ROLE_OPTIONS = [
  'Junior Data Engineer',
  'Junior Data Scientist – Generative AI',
  'Sales Executive (Inside Sales / Junior Sales Track)'
]

const SOURCE_LABELS = {
  official_college: 'Official College',
  instagram:        'Instagram'
}

const RESUME_EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/gif':  'gif',
  'image/webp': 'webp'
}

const initialFilters = {
  source: '', college: '', role: '', dateFrom: '', dateTo: ''
}

function sourceLabel(s) {
  // Legacy documents without `source` are official college applications
  return SOURCE_LABELS[s?.source] || SOURCE_LABELS.official_college
}

function EditModal({ student, onClose, onSave }) {
  const [form, setForm] = useState({ ...student })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await API.put(`/api/students/${student._id}`, form)
      onSave(res.data)
      onClose()
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const fields = [
    { key: 'name', label: 'Full Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'country', label: 'Country' },
    { key: 'state', label: 'State' },
    { key: 'city', label: 'City' },
    { key: 'address', label: 'Address' },
    { key: 'college', label: 'College' },
    { key: 'customCollege', label: 'College (Custom)' },
    { key: 'course', label: 'Course' },
    { key: 'customCourse', label: 'Course (Custom)' },
    { key: 'branch', label: 'Branch' },
    { key: 'customBranch', label: 'Branch (Custom)' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-heading font-bold text-lg">Edit Application</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-3 flex-1">
          {fields.map(f => (
            <div key={f.key}>
              <label className="form-label">{f.label}</label>
              <input className="form-input" value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="form-label">Experience</label>
            <select className="form-input" value={form.experience || ''} onChange={e => setForm(p => ({ ...p, experience: e.target.value }))}>
              {['Fresher', '0-3 Years', '3+ Years'].map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Selected Role</label>
            <select className="form-input" value={form.selected_role || ''} onChange={e => setForm(p => ({ ...p, selected_role: e.target.value }))}>
              <option value="">Select Role</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="p-5 border-t flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><Spinner /> Saving...</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Excel export (no external library needed) ──────────────────
function exportToExcel(students) {
  const headers = [
    '#', 'Name', 'Email', 'Phone', 'Country', 'State', 'City', 'Address',
    'College', 'Course', 'Branch', 'Experience', 'Role Applied', 'Source', 'Applied Date', 'Resume Link (admin login required)'
  ]

  const apiBase = API.defaults.baseURL || ''

  const rows = students.map((s, i) => [
    i + 1,
    s.name,
    s.email,
    s.phone,
    s.country,
    s.state,
    s.city,
    s.address || '',
    s.college === 'Others' ? (s.customCollege || '') : s.college,
    s.course  === 'Others' ? (s.customCourse  || '') : s.course,
    s.branch  === 'Others' ? (s.customBranch  || '') : s.branch,
    s.experience,
    s.selected_role,
    sourceLabel(s),
    new Date(s.createdAt).toLocaleDateString('en-IN'),
    `${apiBase}/api/students/${s._id}/resume`
  ])

  // Build CSV (Excel opens it natively)
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n')

  // UTF-8 BOM so Excel renders Indian characters correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `applications_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Stats card ──────────────────────────────────────────────────
function StatCard({ label, value, icon, accent }) {
  return (
    <div className="card flex items-center gap-4 py-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xl ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-800 leading-tight">{value ?? '—'}</p>
        <p className="text-gray-500 text-xs mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Top colleges list panel ─────────────────────────────────────
function TopCollegesPanel({ title, icon, items }) {
  const max = items?.[0]?.count || 1
  return (
    <div className="card py-4">
      <h3 className="font-heading text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      {!items?.length ? (
        <p className="text-gray-400 text-sm py-2">No applications yet.</p>
      ) : (
        <ul className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '300px' }}>
          {items.map((c, i) => (
            <li key={c.college} className="text-sm">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-gray-700 truncate" title={c.college}>
                  <span className="text-gray-400 mr-1.5">{i + 1}.</span>{c.college}
                </span>
                <span className="font-semibold text-gray-800 flex-shrink-0">{c.count}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const [students, setStudents]   = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [search, setSearch]       = useState('')
  const [filters, setFilters]     = useState(initialFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [stats, setStats]         = useState(null)
  const [collegeOptions, setCollegeOptions] = useState([])
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const skipNextFilterFetch = useRef(true)

  function buildQuery(p, q, f, limit = 15) {
    const params = new URLSearchParams({ page: p, limit, search: q })
    Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v) })
    return params.toString()
  }

  async function fetchStudents(p = 1, q = search, f = filters) {
    setLoading(true)
    try {
      const res = await API.get(`/api/students?${buildQuery(p, q, f)}`)
      setStudents(res.data.students)
      setTotal(res.data.total)
      setPage(res.data.page)
      setPages(res.data.pages)
    } catch { }
    setLoading(false)
  }

  // Stats + unique college list (feeds the college filter dropdown)
  async function fetchMeta() {
    try {
      const [statsRes, collegesRes] = await Promise.all([
        API.get('/api/students/stats'),
        API.get('/api/students/colleges')
      ])
      setStats(statsRes.data)
      setCollegeOptions(collegesRes.data)
    } catch { }
  }

  useEffect(() => {
    fetchStudents(1, '')
    fetchMeta()
  }, [])

  // Live filtering — debounced, no page reload
  useEffect(() => {
    if (skipNextFilterFetch.current) { skipNextFilterFetch.current = false; return }
    const t = setTimeout(() => fetchStudents(1, search, filters), 350)
    return () => clearTimeout(t)
  }, [filters])

  function setFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function clearFilters() {
    setFilters(initialFilters)
  }

  const hasActiveFilters = Object.values(filters).some(Boolean)

  function handleSearch(e) {
    e.preventDefault()
    fetchStudents(1, search)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this application permanently?')) return
    try {
      await API.delete(`/api/students/${id}`)
      fetchStudents(page, search)
      fetchMeta()
    } catch { alert('Delete failed') }
  }

  function resumeFilename(student, mime) {
    const extFromName = (student.resume_original_name || '').split('.').pop().toLowerCase()
    const ext = RESUME_EXT_BY_MIME[mime]
            || (['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'].includes(extFromName) ? extFromName : 'pdf')
    const safeName = student.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
    return `resume_${safeName}.${ext}`
  }

  function saveBlob(blob, filename) {
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.click()
    URL.revokeObjectURL(blobUrl)
  }

  // ── Resume viewer ───────────────────────────────────────────────
  // Files stream through the authenticated /api/students/:id/resume proxy —
  // there is no public Cloudinary URL on the client. PDFs and images open
  // inline in a new tab; Word documents download with a proper filename.
  function handleViewResume(student) {
    // Open the tab synchronously (inside the click) so popup blockers allow it
    const win = window.open('', '_blank')
    if (win) win.document.write('<p style="font-family:sans-serif;color:#666">Loading resume…</p>')

    ;(async () => {
      try {
        const res = await API.get(`/api/students/${student._id}/resume`, { responseType: 'blob' })
        const mime = res.data.type || 'application/pdf'

        // Browsers can't render Word files — hand them over as a download
        if (mime.includes('msword') || mime.includes('wordprocessingml')) {
          if (win) win.close()
          saveBlob(res.data, resumeFilename(student, mime))
          return
        }

        const blobUrl = URL.createObjectURL(res.data)
        if (win) win.location = blobUrl
        else window.open(blobUrl, '_blank')
        // Give the tab time to load before releasing the blob
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      } catch {
        if (win) win.close()
        alert('Unable to open resume')
      }
    })()
  }

  // ── Resume download — via the authenticated proxy ───────────────
  async function handleDownloadResume(student) {
    try {
      const res = await API.get(`/api/students/${student._id}/resume?download=1`, { responseType: 'blob' })
      saveBlob(res.data, resumeFilename(student, res.data.type))
    } catch { alert('Resume not found') }
  }

  // ── Export ALL matching students (respects current filters) ────
  async function handleExport() {
    setExporting(true)
    try {
      const res = await API.get(`/api/students?${buildQuery(1, search, filters, 10000)}`)
      exportToExcel(res.data.students)
    } catch { alert('Export failed') }
    setExporting(false)
  }

  const roleColors = {
    'Junior Data Engineer':                          'bg-indigo-100 text-indigo-700',
    'Junior Data Scientist – Generative AI':         'bg-purple-100 text-purple-700',
    'Sales Executive (Inside Sales / Junior Sales Track)': 'bg-orange-100 text-orange-700'
  }

  const sourceTabs = [
    { value: '',                 label: 'All Applications' },
    { value: 'official_college', label: 'Official College' },
    { value: 'instagram',        label: 'Instagram' }
  ]

  return (
    <AdminLayout>
      {/* ── Statistics cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Applications"            value={stats?.total}           icon="📊" accent="bg-brand-50"  />
        <StatCard label="Official College Applications" value={stats?.officialCollege} icon="🏛️" accent="bg-blue-50"   />
        <StatCard label="Instagram Applications"        value={stats?.instagram}       icon="📸" accent="bg-pink-50"   />
        <StatCard label="Today's Applications"          value={stats?.today}           icon="🗓️" accent="bg-green-50"  />
      </div>

      {/* ── Top colleges analytics ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <TopCollegesPanel title="Top Colleges"                              icon="🏆" items={stats?.topColleges} />
        <TopCollegesPanel title="Top Colleges From Instagram Applications" icon="📸" items={stats?.topInstagramColleges} />
      </div>

      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-gray-800">Applications</h2>
          <p className="text-gray-500 text-sm">{total} total applications</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              className="form-input w-56"
              placeholder="Search name, email, college..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" className="btn-primary px-4 py-2 text-sm">Search</button>
            {search && (
              <button type="button" className="btn-secondary" onClick={() => { setSearch(''); fetchStudents(1, '') }}>Clear</button>
            )}
          </form>
          {/* Filters toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`btn-secondary flex items-center gap-1.5 text-sm ${hasActiveFilters ? 'ring-1 ring-brand-400' : ''}`}
            title="Show filters"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters{hasActiveFilters ? ' •' : ''}
          </button>
          {/* Excel export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Export all results to Excel/CSV"
          >
            {exporting ? <Spinner /> : (
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            )}
            Export Excel
          </button>
        </div>
      </div>

      {/* ── Source tabs ── */}
      <div className="flex gap-2 mb-4">
        {sourceTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter('source', tab.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition border
              ${filters.source === tab.value
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Advanced filters (live — no page reload) ── */}
      {showFilters && (
        <div className="card mb-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <div>
              <label className="form-label">College</label>
              <select className="form-input" value={filters.college} onChange={e => setFilter('college', e.target.value)}>
                <option value="">All Colleges</option>
                {collegeOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Applied Role</label>
              <select className="form-input" value={filters.role} onChange={e => setFilter('role', e.target.value)}>
                <option value="">All Roles</option>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Source</label>
              <select className="form-input" value={filters.source} onChange={e => setFilter('source', e.target.value)}>
                <option value="">All Sources</option>
                <option value="official_college">Official College</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <div>
              <label className="form-label">From Date</label>
              <input
                type="date"
                className="form-input"
                value={filters.dateFrom}
                onChange={e => setFilter('dateFrom', e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">To Date</label>
              <input
                type="date"
                className="form-input"
                value={filters.dateTo}
                onChange={e => setFilter('dateTo', e.target.value)}
              />
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 flex justify-end">
              <button className="btn-secondary text-sm" onClick={clearFilters}>Clear All Filters</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : students.length === 0 ? (
        <div className="card text-center py-16 text-gray-500">No applications found.</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['#', 'Name', 'Email', 'Phone', 'Country', 'State', 'City',
                    'College', 'Course', 'Branch', 'Experience', 'Role Applied', 'Source', 'Applied', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s._id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-400">{(page - 1) * 15 + i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.email}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.phone}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.country}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.state}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.city}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate" title={s.college === 'Others' ? s.customCollege : s.college}>
                      {s.college === 'Others' ? s.customCollege : s.college}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.course === 'Others' ? s.customCourse : s.course}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[120px] truncate">{s.branch === 'Others' ? s.customBranch : s.branch}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.experience === 'Fresher'    ? 'bg-green-100 text-green-700'  :
                        s.experience === '0-3 Years'  ? 'bg-blue-100 text-blue-700'    :
                                                        'bg-purple-100 text-purple-700'
                      }`}>
                        {s.experience}
                      </span>
                    </td>
                    {/* Role Applied — was missing */}
                    <td className="px-4 py-3 min-w-[180px]">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[s.selected_role] || 'bg-gray-100 text-gray-700'}`}>
                        {s.selected_role}
                      </span>
                    </td>
                    {/* Source */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.source === 'instagram' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {sourceLabel(s)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {/* Edit */}
                        <button onClick={() => setEditStudent(s)} title="Edit" className="p-1.5 rounded hover:bg-brand-50 text-brand-600 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {/* View resume — streams through authenticated proxy */}
                        <button onClick={() => handleViewResume(s)} title="View Resume" className="p-1.5 rounded hover:bg-green-50 text-green-600 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        {/* Download resume */}
                        <button onClick={() => handleDownloadResume(s)} title="Download Resume" className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </button>
                        {/* Delete */}
                        <button onClick={() => handleDelete(s._id)} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-red-500 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button className="btn-secondary" disabled={page === 1} onClick={() => fetchStudents(page - 1, search)}>← Prev</button>
              <span className="text-sm text-gray-600">Page {page} of {pages}</span>
              <button className="btn-secondary" disabled={page === pages} onClick={() => fetchStudents(page + 1, search)}>Next →</button>
            </div>
          )}
        </>
      )}

      {editStudent && (
        <EditModal
          student={editStudent}
          onClose={() => setEditStudent(null)}
          onSave={updated => setStudents(prev => prev.map(s => s._id === updated._id ? updated : s))}
        />
      )}
    </AdminLayout>
  )
}
