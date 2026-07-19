import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ADMIN_COUNSELLING_RESPONSES } from '../utils/routes'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import CounsellingNav from '../components/CounsellingNav'
import Spinner from '../components/Spinner'

const REPORT_BADGE = {
  completed:  'bg-green-100 text-green-700',
  generating: 'bg-blue-100 text-blue-700',
  pending:    'bg-gray-100 text-gray-500',
  failed:     'bg-red-100 text-red-600'
}

export default function AdminCounsellingResponses() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(20)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [colleges, setColleges] = useState([])
  const [filters, setFilters] = useState({ college: '', status: '', from: '', to: '', search: '' })
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    API.get('/api/attendance/colleges').then(r => setColleges(r.data)).catch(() => {})
  }, [])

  // debounce search box
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters(f => (f.search === searchInput ? f : { ...f, search: searchInput }))
      setPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    let ignore = false
    setLoading(true)
    const params = new URLSearchParams({ page, limit })
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    API.get(`/api/admin/counselling/responses?${params}`)
      .then(r => { if (!ignore) { setRows(r.data.rows); setTotal(r.data.total) } })
      .catch(() => {})
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [page, limit, filters])

  const pages = Math.max(1, Math.ceil(total / limit))

  async function handleDelete(e, r) {
    e.stopPropagation()
    if (!confirm(`Delete ${r.name}'s counselling response? They will be able to fill the form again from scratch.`)) return
    try {
      await API.delete(`/api/admin/counselling/responses/${r._id}`)
      setRows(prev => prev.filter(row => row._id !== r._id))
      setTotal(t => t - 1)
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed')
    }
  }

  async function fetchExportData() {
    const params = new URLSearchParams()
    if (filters.college) params.set('college', filters.college)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    const res = await API.get(`/api/admin/counselling/export?${params}`)
    return res.data
  }

  function baseRow(r) {
    return {
      Name: r.name, Email: r.email, Phone: r.phone, College: r.college,
      Branch: r.branch, Date: r.attendanceDate,
      'Completion %': r.completionPercent,
      Score: `${r.totalScore}/${r.maxScore}`,
      'Career Clarity': r.scores?.careerClarity ?? '',
      Confidence: r.scores?.confidence ?? '',
      'Technical Readiness': r.scores?.technicalReadiness ?? '',
      'Placement Readiness': r.scores?.placementReadiness ?? '',
      'Risk Level': r.scores?.riskLevel ?? '',
      Overall: r.scores?.overall ?? '',
      'Career Fit': r.careerFit,
      'AI Summary': r.aiSummary
    }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      const { rows: data, questions } = await fetchExportData()
      const flat = data.map(r => ({
        ...baseRow(r),
        ...Object.fromEntries(questions.map(q => [`${q.code}`, r.answers[q.code] || '']))
      }))
      if (!flat.length) return
      const headers = Object.keys(flat[0])
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [headers.map(esc).join(','), ...flat.map(r => headers.map(h => esc(r[h])).join(','))].join('\r\n')
      downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `Counselling_Responses_${today()}.csv`)
    } finally {
      setExporting(false)
    }
  }

  async function exportExcel() {
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const { rows: data, questions } = await fetchExportData()

      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Counselling', { views: [{ state: 'frozen', ySplit: 1 }] })
      const headers = [...Object.keys(baseRow(data[0] || {
        name: '', email: '', phone: '', college: '', branch: '', attendanceDate: '',
        completionPercent: '', totalScore: '', maxScore: '', careerFit: '', aiSummary: ''
      })), ...questions.map(q => q.code)]

      const headerRow = ws.addRow(headers)
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } }
        cell.alignment = { vertical: 'middle' }
      })
      data.forEach(r => {
        const base = baseRow(r)
        ws.addRow([...Object.values(base), ...questions.map(q => r.answers[q.code] || '')])
      })
      ws.columns.forEach((col, i) => { col.width = i === 0 ? 24 : Math.min(Math.max(String(headers[i]).length + 4, 10), 40) })

      const buf = await wb.xlsx.writeBuffer()
      downloadBlob(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `Counselling_Responses_${today()}.xlsx`
      )
    } finally {
      setExporting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="mb-4">
        <h2 className="font-heading text-2xl font-bold text-gray-800">Counselling Responses</h2>
        <p className="text-gray-500 text-sm">Search, filter and open student assessment profiles.</p>
      </div>
      <CounsellingNav />

      {/* filters */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input className="form-input" placeholder="Search name, email, phone…"
            value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          <select className="form-input" value={filters.college}
            onChange={e => { setFilters(f => ({ ...f, college: e.target.value })); setPage(1) }}>
            <option value="">All colleges</option>
            {colleges.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input" value={filters.status}
            onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1) }}>
            <option value="">Any status</option>
            <option value="submitted">Submitted</option>
            <option value="in_progress">In progress</option>
          </select>
          <input type="date" className="form-input" value={filters.from}
            onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(1) }} />
          <input type="date" className="form-input" value={filters.to}
            onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(1) }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-sm text-gray-500">{total} response{total === 1 ? '' : 's'}</p>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" onClick={exportCSV} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button className="btn-secondary text-sm" onClick={exportExcel} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['Student', 'College', 'Date', 'Status', 'Completion', 'Score', 'AI Report', 'Overall', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-14 text-center text-gray-400"><Spinner /> Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-14 text-center text-gray-400">No responses match these filters.</td></tr>
            ) : rows.map(r => (
              <tr key={r._id}
                onClick={() => navigate(`${ADMIN_COUNSELLING_RESPONSES}/${r._id}`)}
                className="border-b border-gray-100 hover:bg-brand-50/40 cursor-pointer transition">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800 whitespace-nowrap">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{r.college}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.attendanceDate}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    r.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {r.status === 'submitted' ? 'Submitted' : 'In progress'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{r.completionPercent}%</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.totalScore}/{r.maxScore}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${REPORT_BADGE[r.reportStatus] || 'bg-gray-100 text-gray-400'}`}>
                    {r.reportStatus || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-800">{r.scores?.overall ?? '—'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={e => handleDelete(e, r)}
                    title="Delete Response — student can refill from scratch"
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

      {/* pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button className="btn-secondary text-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-sm text-gray-500 px-2">Page {page} of {pages}</span>
          <button className="btn-secondary text-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </AdminLayout>
  )
}

function today() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
