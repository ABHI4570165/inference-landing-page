import { useState, useEffect } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'

const ROLE_OPTIONS = [
  'Junior Data Engineer',
  'Junior Data Scientist – Generative AI',
  'Sales Executive (Inside Sales / Junior Sales Track)'
]

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
    'College', 'Course', 'Branch', 'Experience', 'Role Applied', 'Applied Date', 'Resume URL'
  ]

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
    new Date(s.createdAt).toLocaleDateString('en-IN'),
    s.resumeUrl || ''
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

export default function AdminDashboard() {
  const [students, setStudents]   = useState([])
  const [allStudents, setAllStudents] = useState([])   // for export
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [pages, setPages]         = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [exporting, setExporting] = useState(false)
  const [editStudent, setEditStudent] = useState(null)

  async function fetchStudents(p = 1, q = search) {
    setLoading(true)
    try {
      const res = await API.get(`/api/students?page=${p}&search=${encodeURIComponent(q)}&limit=15`)
      setStudents(res.data.students)
      setTotal(res.data.total)
      setPage(res.data.page)
      setPages(res.data.pages)
    } catch { }
    setLoading(false)
  }

  useEffect(() => { fetchStudents(1, '') }, [])

  function handleSearch(e) {
    e.preventDefault()
    fetchStudents(1, search)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this application permanently?')) return
    try {
      await API.delete(`/api/students/${id}`)
      fetchStudents(page, search)
    } catch { alert('Delete failed') }
  }

  // ── Resume download: open Cloudinary URL with correct filename ──
  async function handleDownloadResume(student) {
    try {
      const res = await API.get(`/api/students/${student._id}`)
      const url = res.data.resumeUrl
      if (!url) { alert('Resume not found'); return }

      // Get extension — prefer original filename, fall back to URL, default pdf
      const originalName = res.data.resume_original_name || ''
      const extFromName  = originalName.split('.').pop().toLowerCase()
      const extFromUrl   = url.split('?')[0].split('.').pop().toLowerCase()
      const validExts    = ['pdf', 'doc', 'docx']
      const ext = validExts.includes(extFromName) ? extFromName
                : validExts.includes(extFromUrl)  ? extFromUrl
                : 'pdf'

      const safeName = student.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
      const filename = `resume_${safeName}.${ext}`

      // Use fetch to get the blob so the browser saves it with our filename
      // instead of whatever Cloudinary's Content-Disposition says
      const response = await fetch(url)
      const blob     = await response.blob()
      const blobUrl  = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = blobUrl
      a.download     = filename
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch { alert('Resume not found') }
  }

  // ── Export ALL matching students (fetches all pages) ───────────
  async function handleExport() {
    setExporting(true)
    try {
      const res = await API.get(`/api/students?page=1&search=${encodeURIComponent(search)}&limit=10000`)
      exportToExcel(res.data.students)
    } catch { alert('Export failed') }
    setExporting(false)
  }

  const roleColors = {
    'Junior Data Engineer':                          'bg-indigo-100 text-indigo-700',
    'Junior Data Scientist – Generative AI':         'bg-purple-100 text-purple-700',
    'Sales Executive (Inside Sales / Junior Sales Track)': 'bg-orange-100 text-orange-700'
  }

  return (
    <AdminLayout>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
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
                    'College', 'Course', 'Branch', 'Experience', 'Role Applied', 'Applied', 'Actions'].map(h => (
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
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(s.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {/* Edit */}
                        <button onClick={() => setEditStudent(s)} title="Edit" className="p-1.5 rounded hover:bg-brand-50 text-brand-600 transition">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {/* Download resume — fixed */}
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