import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import {
  IconSearch, IconFilter, IconDownload, IconClipboard, IconCalendar, IconDocument,
  IconEdit, IconEye, IconTrash, IconClose, IconChevronLeft, IconChevronRight, IconArchive
} from '../components/Icons'

// ── Applications ────────────────────────────────────────────────────────────
// Every category, count and label on this page comes from the Form documents
// that exist in the ACTIVE WORKSPACE (GET /api/applications/stats). There is
// deliberately no list of application sources anywhere in this file: create a
// form and it appears here, rename it and the label follows, archive it and
// its applications stay reachable. Filtering is sent to the server as a form
// _id — never as a text match on a name.

const ROLE_OPTIONS = [
  'Junior Data Engineer',
  'Junior Data Scientist – Generative AI',
  'Sales Executive (Inside Sales / Junior Sales Track)'
]

const RESUME_EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/gif':  'gif',
  'image/webp': 'webp'
}

const PAGE_SIZE = 15
const emptyFilters = { form: '', college: '', role: '', dateFrom: '', dateTo: '' }

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateTime = d => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const initials = n => (n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'

// A palette rotated over the workspace's own forms, keyed by position in the
// list — no colour is ever tied to a particular form name.
const FORM_ACCENTS = [
  { bar: 'bg-brand-500',   soft: 'bg-brand-50',   text: 'text-brand-700',   ring: 'ring-brand-200' },
  { bar: 'bg-blue-500',    soft: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-200' },
  { bar: 'bg-purple-500',  soft: 'bg-purple-50',  text: 'text-purple-700',  ring: 'ring-purple-200' },
  { bar: 'bg-amber-500',   soft: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  { bar: 'bg-teal-500',    soft: 'bg-teal-50',    text: 'text-teal-700',    ring: 'ring-teal-200' },
  { bar: 'bg-rose-500',    soft: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-200' },
  { bar: 'bg-indigo-500',  soft: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-200' },
  { bar: 'bg-cyan-500',    soft: 'bg-cyan-50',    text: 'text-cyan-700',    ring: 'ring-cyan-200' }
]

const ROLE_BADGE = {
  'Junior Data Engineer': 'badge-indigo',
  'Junior Data Scientist – Generative AI': 'badge-purple',
  'Sales Executive (Inside Sales / Junior Sales Track)': 'badge-amber'
}

// ── Candidate edit modal ────────────────────────────────────────────────────
// There is NO fixed field list here. The server returns the fields that
// candidate actually has: for someone who registered through a Custom Form
// those are that form's own fields, in its order, with their answers — a form
// with four fields shows four. Only candidates who came through the built-in
// intake application get the intake field set, because they genuinely have it.
function FieldInput({ field, value, onChange }) {
  const common = { className: 'form-input', placeholder: field.placeholder || '' }

  if (field.type === 'college') {
    // Same options the candidate was offered — never free text
    return (
      <select {...common} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">Select college…</option>
        {(field.collegeOptions || []).map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    )
  }
  if (field.type === 'dropdown' || field.type === 'radio') {
    return (
      <select {...common} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>
        {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (field.type === 'checkbox') {
    const arr = Array.isArray(value) ? value : (value ? String(value).split(', ') : [])
    return (
      <div className="space-y-1.5">
        {(field.options || []).map(o => (
          <label key={o} className="flex items-center gap-2.5 text-[13.5px] text-ink-700 cursor-pointer">
            <input type="checkbox" checked={arr.includes(o)}
              onChange={e => onChange(e.target.checked ? [...arr, o] : arr.filter(x => x !== o))} />
            {o}
          </label>
        ))}
      </div>
    )
  }
  if (field.type === 'textarea') {
    return <textarea {...common} rows={3} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
  const inputType = field.type === 'date' ? 'date'
    : field.type === 'number' ? 'number'
    : field.type === 'email' ? 'email'
    : field.type === 'phone' ? 'tel' : 'text'
  return <input type={inputType} {...common} value={value || ''} onChange={e => onChange(e.target.value)} />
}

function EditModal({ student, onClose, onSaved }) {
  const [detail, setDetail] = useState(null)
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    API.get(`/api/applications/candidates/${student._id}`)
      .then(res => {
        if (cancelled) return
        setDetail(res.data)
        setValues(Object.fromEntries(res.data.fields.map(f => [f._id, f.value])))
      })
      .catch(err => { if (!cancelled) setError(err.response?.data?.message || 'Failed to load candidate') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [student._id])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      // Form-origin candidates are saved as responses keyed by their own field
      // ids; intake candidates keep their existing named-field payload.
      const payload = detail.origin === 'form'
        ? { responses: values }
        : values
      await API.put(`/api/applications/candidates/${student._id}`, payload)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const subtitle = detail?.origin === 'form'
    ? `Fields from “${detail.form?.name || 'this form'}”`
    : detail ? 'Application details' : undefined

  return (
    <Modal title="Edit Candidate" subtitle={subtitle} onClose={onClose} width="max-w-2xl">
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : !detail ? (
        <p className="text-red-600 text-sm">{error || 'Could not load this candidate.'}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            {detail.fields.map(f => (
              <div key={f._id} className={['textarea', 'checkbox'].includes(f.type) ? 'sm:col-span-2' : ''}>
                <label className="form-label">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </label>
                <FieldInput field={f} value={values[f._id]}
                  onChange={v => setValues(p => ({ ...p, [f._id]: v }))} />
              </div>
            ))}
          </div>
          {detail.fields.length === 0 && (
            <p className="text-ink-400 text-[13.5px] text-center py-6">This form has no fields.</p>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mt-4">{error}</p>}
          <div className="flex gap-3 justify-end pt-5 mt-5 border-t border-surface-200">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner /> Saving…</> : 'Save Changes'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── Candidate workflow chain ────────────────────────────────────────────────
// Registration → Attendance → Reception → Counselling → AI Report.
// `state` comes from the backend (services/candidateWorkflow), which is the
// same code the public reception/counselling endpoints gate on — so this is a
// readout of what the server will actually allow, not a frontend guess.
const WORKFLOW_STEPS = [
  { key: 'registration', label: 'Registration' },
  { key: 'attendance',   label: 'Attendance' },
  { key: 'reception',    label: 'Reception' },
  { key: 'counselling',  label: 'Counselling' },
  { key: 'aiReport',     label: 'AI Report' }
]

const STATE_STYLE = {
  done:        { dot: 'bg-brand-500',  badge: 'badge-green',   text: 'Completed', mark: '✓' },
  pending:     { dot: 'bg-amber-400',  badge: 'badge-amber',   text: 'Pending',   mark: '•' },
  in_progress: { dot: 'bg-blue-400',   badge: 'badge-blue',    text: 'In progress', mark: '•' },
  generating:  { dot: 'bg-blue-400',   badge: 'badge-blue',    text: 'Generating', mark: '•' },
  failed:      { dot: 'bg-red-400',    badge: 'badge-red',     text: 'Failed',    mark: '!' },
  blocked:     { dot: 'bg-red-400',    badge: 'badge-red',     text: 'Absent',    mark: '✕' },
  locked:      { dot: 'bg-surface-300', badge: 'badge-neutral', text: 'Locked',   mark: '🔒' }
}
const styleFor = s => STATE_STYLE[s] || STATE_STYLE.locked

// Compact 5-dot chain for the table cell
function WorkflowPips({ workflow, onOpen }) {
  if (!workflow) return <span className="text-ink-300">—</span>
  return (
    <button type="button" onClick={onOpen} title="View workflow progress"
      className="flex items-center gap-1 group" aria-label="View workflow progress">
      {WORKFLOW_STEPS.map((step, i) => {
        const st = styleFor(workflow[step.key]?.state)
        return (
          <span key={step.key} className="flex items-center">
            <span className={`w-2.5 h-2.5 rounded-full ${st.dot} ring-2 ring-white group-hover:scale-110 transition-transform`}
              title={`${step.label}: ${st.text}`} />
            {i < WORKFLOW_STEPS.length - 1 && <span className="w-1.5 h-px bg-surface-300" />}
          </span>
        )
      })}
    </button>
  )
}

function WorkflowModal({ row, onClose }) {
  const wf = row.workflow
  return (
    <Modal title="Candidate Workflow" subtitle={row.name} onClose={onClose} width="max-w-md">
      <ol className="relative">
        {WORKFLOW_STEPS.map((step, i) => {
          const stage = wf?.[step.key]
          const st = styleFor(stage?.state)
          const last = i === WORKFLOW_STEPS.length - 1
          return (
            <li key={step.key} className="flex gap-3.5 pb-1">
              <div className="flex flex-col items-center">
                <span className={`w-7 h-7 rounded-full ${st.dot} text-white text-[12px] font-bold
                                  flex items-center justify-center flex-shrink-0`}>
                  {st.mark}
                </span>
                {!last && <span className="w-px flex-1 min-h-[26px] bg-surface-300 my-1" />}
              </div>
              <div className="pb-5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-ink-800">{step.label}</p>
                  <span className={`badge ${st.badge}`}>
                    {step.key === 'attendance' && stage?.detail ? stage.detail : st.text}
                  </span>
                </div>
                {stage?.at && (
                  <p className="text-[12px] text-ink-400 mt-1">
                    {String(stage.at).match(/^\d{4}-\d{2}-\d{2}$/) ? stage.at : fmtDateTime(stage.at)}
                  </p>
                )}
                {stage?.state === 'locked' && (
                  <p className="text-[12px] text-ink-400 mt-1">
                    Blocked until the previous stage is completed.
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="text-[12px] text-ink-400 border-t border-surface-200 pt-4">
        Each stage is enforced by the backend — a candidate cannot skip ahead even by calling the API directly.
      </p>
    </Modal>
  )
}

// ── Generic modal shell ─────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, width = 'max-w-lg' }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 animate-fade-in" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-panel w-full ${width} max-h-[90vh] flex flex-col animate-scale-in`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-surface-200">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold text-ink-900">{title}</h3>
            {subtitle && <p className="text-[13px] text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="icon-btn flex-shrink-0" aria-label="Close"><IconClose /></button>
        </div>
        <div className="overflow-y-auto scroll-slim px-6 py-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── Custom-form response detail ─────────────────────────────────────────────
function SubmissionModal({ id, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    API.get(`/api/applications/submissions/${id}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load application'))
  }, [id])

  return (
    <Modal title="Application Details" subtitle={data?.formName} onClose={onClose} width="max-w-xl">
      {error ? <p className="text-red-600 text-sm">{error}</p>
        : !data ? <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        : (
          <>
            <div className="flex items-center gap-2 mb-5 text-[13px] text-ink-500">
              <IconCalendar size={14} /> Submitted {fmtDateTime(data.submittedAt)}
            </div>
            {data.answers.length === 0 ? (
              <p className="text-ink-400 text-sm">This form has no fields.</p>
            ) : (
              <dl className="divide-y divide-surface-200">
                {data.answers.map((a, i) => (
                  <div key={i} className="py-3 grid grid-cols-3 gap-4">
                    <dt className="text-[13px] text-ink-500 col-span-1">{a.label}</dt>
                    <dd className="text-sm text-ink-800 font-medium col-span-2 break-words">{a.value || '—'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
    </Modal>
  )
}

// ── CSV export ──────────────────────────────────────────────────────────────
function exportToExcel(rows) {
  const headers = [
    '#', 'Form', 'Type', 'Name', 'Email', 'Phone', 'Aadhar', 'Country', 'State', 'City', 'Address',
    'College', 'Course', 'Branch', 'Experience', 'Role Applied', 'Registered', 'Counselling',
    'Submitted', 'Resume Link (admin login required)'
  ]
  const apiBase = API.defaults.baseURL || ''

  const body = rows.map((r, i) => [
    i + 1,
    r.formName,
    r.kind === 'student' ? 'Intake Application' : 'Form Response',
    r.name, r.email, r.phone,
    r.aadhar || '', r.country || '', r.state || '', r.city || '', r.address || '',
    r.college || '',
    r.course === 'Others' ? (r.customCourse || '') : (r.course || ''),
    r.branch === 'Others' ? (r.customBranch || '') : (r.branch || ''),
    r.experience || '', r.selected_role || '',
    r.registrationStatus === 'REGISTERED' ? 'Registered' : (r.kind === 'student' ? 'Not Registered' : ''),
    r.counsellingStatus === 'COMPLETED' ? 'Completed' : (r.kind === 'student' ? 'Pending' : ''),
    new Date(r.submittedAt).toLocaleString('en-IN'),
    r.kind === 'student' ? `${apiBase}/api/students/${r._id}/resume` : ''
  ])

  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...body].map(r => r.map(escape).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `applications_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Overview stat card ──────────────────────────────────────────────────────
function OverviewCard({ label, value, sub, icon, tone, loading }) {
  return (
    <div className="card !p-5 card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
          {loading
            ? <div className="skeleton h-8 w-20 mt-2 rounded-md" />
            : <p className="font-heading text-[30px] leading-none font-bold text-ink-900 mt-2 tabular-nums">
                {(value ?? 0).toLocaleString('en-IN')}
              </p>}
          {sub && <p className="text-[12px] text-ink-400 mt-2">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}>{icon}</div>
      </div>
    </div>
  )
}

// ── Dynamic form card ───────────────────────────────────────────────────────
function FormStatCard({ form, accent, share, active, onSelect }) {
  const archived = form.status !== 'Active'
  const clickable = !!form._id

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onSelect(active ? '' : form._id)}
      className={`text-left w-full bg-white rounded-xl border shadow-card p-4 transition-all duration-200
                  ${clickable ? 'hover:shadow-lift hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'}
                  ${active ? 'border-brand-500 ring-4 ring-brand-500/10' : 'border-surface-200 hover:border-surface-300'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[13.5px] font-semibold text-ink-800 leading-snug line-clamp-2" title={form.name}>
          {form.name}
        </p>
        {archived && (
          <span className="badge badge-neutral flex-shrink-0" title="This form is no longer accepting submissions">
            <IconArchive size={11} /> Archived
          </span>
        )}
      </div>

      <p className="font-heading text-[26px] leading-none font-bold text-ink-900 tabular-nums">
        {form.count.toLocaleString('en-IN')}
      </p>
      <p className="text-[12px] text-ink-400 mt-1.5">
        application{form.count === 1 ? '' : 's'}
        {form.today > 0 && <span className="text-brand-600 font-medium"> · {form.today} today</span>}
      </p>

      <div className="mt-3.5 h-1.5 rounded-full bg-surface-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${accent.bar}`} style={{ width: `${share}%` }} />
      </div>
    </button>
  )
}

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [pages, setPages]     = useState(1)
  const [search, setSearch]   = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ ...emptyFilters, form: searchParams.get('form') || '' })
  const [showFilters, setShowFilters] = useState(false)
  const [stats, setStats]     = useState(null)
  const [collegeOptions, setCollegeOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [editStudent, setEditStudent] = useState(null)
  const [viewSubmission, setViewSubmission] = useState(null)
  const [workflowRow, setWorkflowRow] = useState(null)
  const firstRun = useRef(true)

  function buildQuery(p, q, f, limit = PAGE_SIZE) {
    const params = new URLSearchParams({ page: p, limit, search: q })
    Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v) })
    return params.toString()
  }

  async function fetchApplications(p = 1, q = search, f = filters) {
    setLoading(true)
    try {
      const res = await API.get(`/api/applications?${buildQuery(p, q, f)}`)
      setRows(res.data.rows)
      setTotal(res.data.total)
      setPage(res.data.page)
      setPages(res.data.pages)
    } catch { /* interceptor handles auth failures */ }
    setLoading(false)
  }

  async function fetchMeta() {
    setStatsLoading(true)
    try {
      const [statsRes, collegesRes] = await Promise.all([
        API.get('/api/applications/stats'),
        API.get('/api/applications/colleges')
      ])
      setStats(statsRes.data)
      setCollegeOptions(collegesRes.data)
    } catch { /* ignore */ }
    setStatsLoading(false)
  }

  useEffect(() => {
    fetchApplications(1, '', filters)
    fetchMeta()
  }, [])

  // Debounced live search + filtering — no page reload, no full refetch storm
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    const t = setTimeout(() => {
      setSearch(searchInput)
      fetchApplications(1, searchInput, filters)
    }, 350)
    return () => clearTimeout(t)
  }, [filters, searchInput])

  // Keep the selected form in the URL so a filtered view can be linked to
  // (the Forms page links straight here for built-in intake forms).
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    filters.form ? next.set('form', filters.form) : next.delete('form')
    setSearchParams(next, { replace: true })
  }, [filters.form])

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))
  const clearFilters = () => setFilters(emptyFilters)
  const activeFilterCount = Object.entries(filters).filter(([, v]) => v).length

  // Forms drive the tabs, the cards AND the filter dropdown — one source.
  // Intake-only columns (Location / Experience / Role Applied) are rendered
  // only when this workspace actually has candidates carrying that data.
  const showIntakeColumns = !!stats?.hasIntakeApplications
  const formList = stats?.forms || []
  const selectableForms = formList.filter(f => f._id)
  const maxCount = Math.max(1, ...formList.map(f => f.count))
  const accentFor = i => FORM_ACCENTS[i % FORM_ACCENTS.length]
  const accentByFormId = useMemo(() => {
    const map = new Map()
    formList.forEach((f, i) => { if (f._id) map.set(f._id, accentFor(i)) })
    return map
  }, [stats])

  async function handleDeleteStudent(row) {
    if (!confirm(`Delete ${row.name}'s application permanently?`)) return
    try {
      await API.delete(`/api/students/${row._id}`)
      fetchApplications(page, search, filters)
      fetchMeta()
    } catch { alert('Delete failed') }
  }

  async function handleDeleteSubmission(row) {
    if (!confirm(`Delete this response to "${row.formName}" permanently?`)) return
    try {
      await API.delete(`/api/applications/submissions/${row._id}`)
      fetchApplications(page, search, filters)
      fetchMeta()
    } catch { alert('Delete failed') }
  }

  function resumeFilename(row, mime) {
    const extFromName = (row.resume_original_name || '').split('.').pop().toLowerCase()
    const ext = RESUME_EXT_BY_MIME[mime]
      || (['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'].includes(extFromName) ? extFromName : 'pdf')
    const safeName = (row.name || 'candidate').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
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

  // Resumes stream through the authenticated proxy — no public Cloudinary URL
  // ever reaches the client.
  function handleViewResume(row) {
    const win = window.open('', '_blank')
    if (win) win.document.write('<p style="font-family:sans-serif;color:#666">Loading resume…</p>')
    ;(async () => {
      try {
        const res = await API.get(`/api/students/${row._id}/resume`, { responseType: 'blob' })
        const mime = res.data.type || 'application/pdf'
        if (mime.includes('msword') || mime.includes('wordprocessingml')) {
          if (win) win.close()
          saveBlob(res.data, resumeFilename(row, mime))
          return
        }
        const blobUrl = URL.createObjectURL(res.data)
        if (win) win.location = blobUrl
        else window.open(blobUrl, '_blank')
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
      } catch {
        if (win) win.close()
        alert('Unable to open resume')
      }
    })()
  }

  async function handleDownloadResume(row) {
    try {
      const res = await API.get(`/api/students/${row._id}/resume?download=1`, { responseType: 'blob' })
      saveBlob(res.data, resumeFilename(row, res.data.type))
    } catch { alert('Resume not found') }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const res = await API.get(`/api/applications?${buildQuery(1, search, filters, 10000)}`)
      exportToExcel(res.data.rows)
    } catch { alert('Export failed') }
    setExporting(false)
  }

  async function handleDeleteRegistration(row) {
    if (!confirm(`Delete ${row.name}'s reception registration? Their photo and check-in record will be removed and they will need to check in again from scratch.`)) return
    try {
      await API.delete(`/api/reception/registration/${row._id}`)
      fetchApplications(page, search, filters)
    } catch { alert('Delete failed') }
  }

  const headerActions = (
    <>
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <input
          type="search"
          className="form-input pl-9 w-full sm:w-64"
          placeholder="Search candidates…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
      </div>
      <button
        onClick={() => setShowFilters(v => !v)}
        className={`btn-secondary ${activeFilterCount ? '!border-brand-400 !text-brand-700 !bg-brand-50' : ''}`}
      >
        <IconFilter /> Filter
        {activeFilterCount > 0 && (
          <span className="ml-0.5 text-[11px] font-bold bg-brand-600 text-white rounded-full w-[18px] h-[18px] flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
      <button onClick={handleExport} disabled={exporting} className="btn-secondary" title="Export all matching rows">
        {exporting ? <Spinner /> : <IconDownload />} Export
      </button>
    </>
  )

  return (
    <AdminLayout
      title="Applications"
      subtitle="Manage and review candidates across your recruitment forms."
      actions={headerActions}
    >
      {/* ── Filters ── */}
      {showFilters && (
        <div className="card !p-5 mb-6 animate-fade-up">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div>
              <label className="form-label">Form</label>
              <select className="form-input" value={filters.form} onChange={e => setFilter('form', e.target.value)}>
                <option value="">All Applications</option>
                {selectableForms.map(f => (
                  <option key={f._id} value={f._id}>
                    {f.name}{f.status !== 'Active' ? ' (Archived)' : ''}
                  </option>
                ))}
              </select>
            </div>
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
              <label className="form-label">From Date</label>
              <input type="date" className="form-input" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} />
            </div>
            <div>
              <label className="form-label">To Date</label>
              <input type="date" className="form-input" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-4 pt-4 border-t border-surface-200 flex justify-between items-center gap-3">
              <p className="text-[13px] text-ink-500">
                {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} applied
                {filters.role && <span className="text-ink-400"> · role filters exclude custom-form responses</span>}
              </p>
              <button className="btn-ghost" onClick={clearFilters}>Clear all</button>
            </div>
          )}
        </div>
      )}

      {/* ── Application Overview ── */}
      <section className="mb-7">
        <div className="mb-3.5">
          <h2 className="section-title">Application Overview</h2>
          <p className="section-sub">Live totals across every form in this workspace.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger">
          <OverviewCard
            label="Total Applications" value={stats?.total} loading={statsLoading}
            sub="All forms, all time"
            icon={<IconClipboard size={19} className="text-brand-700" />} tone="bg-brand-50"
          />
          <OverviewCard
            label="Today's Applications" value={stats?.today} loading={statsLoading}
            sub="Received today"
            icon={<IconCalendar size={19} className="text-blue-600" />} tone="bg-blue-50"
          />
          <OverviewCard
            label="Active Forms" value={stats?.activeForms} loading={statsLoading}
            sub={`${formList.length} total in this workspace`}
            icon={<IconDocument size={19} className="text-purple-600" />} tone="bg-purple-50"
          />
        </div>
      </section>

      {/* ── Application Forms (fully dynamic) ── */}
      <section className="mb-7">
        <div className="mb-3.5 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="section-title">Application Forms</h2>
            <p className="section-sub">Where applications in this workspace came from. Select one to filter the list.</p>
          </div>
          {filters.form && (
            <button className="btn-ghost !text-brand-700" onClick={() => setFilter('form', '')}>Clear selection</button>
          )}
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-[132px] rounded-xl" />)}
          </div>
        ) : formList.length === 0 ? (
          <div className="card text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
              <IconDocument size={22} className="text-ink-400" />
            </div>
            <p className="font-medium text-ink-700">No forms in this workspace yet</p>
            <p className="text-[13px] text-ink-400 mt-1">
              Create a form under Forms and its applications will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
            {formList.map((f, i) => (
              <FormStatCard
                key={f._id || 'unassigned'}
                form={f}
                accent={accentFor(i)}
                share={Math.round((f.count / maxCount) * 100)}
                active={filters.form === f._id}
                onSelect={v => setFilter('form', v)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Candidate Applications ── */}
      <section>
        <div className="mb-3.5">
          <h2 className="section-title">Candidate Applications</h2>
          <p className="section-sub">
            {loading ? 'Loading…' : `${total.toLocaleString('en-IN')} application${total === 1 ? '' : 's'} match your view`}
          </p>
        </div>

        {/* Dynamic category tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setFilter('form', '')}
            className={`chip ${!filters.form ? 'chip-active' : 'chip-idle'}`}
          >
            All Applications
            {stats && <span className="chip-count">{stats.total.toLocaleString('en-IN')}</span>}
          </button>
          {selectableForms.map(f => (
            <button
              key={f._id}
              onClick={() => setFilter('form', f._id)}
              className={`chip ${filters.form === f._id ? 'chip-active' : 'chip-idle'}`}
              title={f.status !== 'Active' ? 'Archived form — historical applications remain available' : undefined}
            >
              {f.status !== 'Active' && <IconArchive size={12} />}
              {f.name}
              <span className="chip-count">{f.count.toLocaleString('en-IN')}</span>
            </button>
          ))}
        </div>

        <div className="panel">
          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 px-6">
              <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
                <IconSearch size={22} className="text-ink-400" />
              </div>
              <p className="font-medium text-ink-700">No applications found</p>
              <p className="text-[13px] text-ink-400 mt-1">Try a different search term or clear your filters.</p>
              {(activeFilterCount > 0 || search) && (
                <button className="btn-secondary mt-4" onClick={() => { clearFilters(); setSearchInput('') }}>
                  Clear search &amp; filters
                </button>
              )}
            </div>
          ) : (
            <div className="table-scroll scroll-slim">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-12">#</th>
                    <th>Candidate</th>
                    <th>Contact</th>
                    {showIntakeColumns && <th>Location</th>}
                    <th>{showIntakeColumns ? 'Academics' : 'College'}</th>
                    {showIntakeColumns && <th>Experience</th>}
                    {showIntakeColumns && <th>Role Applied</th>}
                    <th>Form</th>
                    <th>Workflow</th>
                    <th>Registered</th>
                    <th>Counselling</th>
                    <th>Submitted</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isStudent = r.kind === 'student'
                    const accent = r.formId ? accentByFormId.get(r.formId) : null
                    return (
                      <tr key={`${r.kind}_${r._id}`}>
                        <td className="text-ink-400 tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>

                        {/* Candidate */}
                        <td>
                          <div className="flex items-center gap-3 min-w-[190px]">
                            {r.registrationPhoto ? (
                              <a href={r.registrationPhoto} target="_blank" rel="noreferrer" title="View registration photo" className="flex-shrink-0">
                                <img src={r.registrationPhoto} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-surface-300" />
                              </a>
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-surface-100 ring-1 ring-surface-200 flex items-center justify-center
                                              text-[11px] font-bold text-ink-500 flex-shrink-0">
                                {initials(r.name)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-ink-800 truncate" title={r.name}>{r.name || 'Unnamed'}</p>
                              <p className="text-[11.5px] text-ink-400 truncate">
                                {isStudent ? (r.aadhar ? `Aadhar ${r.aadhar}` : r.gender || '—') : 'Form response'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td>
                          <div className="min-w-[170px]">
                            <p className="text-ink-700 truncate" title={r.email}>{r.email || '—'}</p>
                            <p className="text-[12px] text-ink-400">{r.phone || '—'}</p>
                          </div>
                        </td>

                        {/* Location — intake-only, hidden when the workspace has none */}
                        {showIntakeColumns && (
                          <td>
                            {r.city || r.state || r.country ? (
                              <div className="min-w-[120px]">
                                <p className="text-ink-700 truncate">{r.city || '—'}</p>
                                {(r.state || r.country) && (
                                  <p className="text-[12px] text-ink-400 truncate">
                                    {[r.state, r.country].filter(Boolean).join(', ')}
                                  </p>
                                )}
                              </div>
                            ) : <span className="text-ink-300">—</span>}
                          </td>
                        )}

                        {/* College (plus course/branch where the candidate has them) */}
                        <td>
                          <div className="max-w-[190px]">
                            <p className="text-ink-700 truncate" title={r.college}>{r.college || '—'}</p>
                            {(() => {
                              const academics = [
                                r.course === 'Others' ? r.customCourse : r.course,
                                r.branch === 'Others' ? r.customBranch : r.branch
                              ].filter(Boolean).join(' · ')
                              // Only rendered when there is something to show —
                              // a lone dash under every college is just noise.
                              return academics
                                ? <p className="text-[12px] text-ink-400 truncate">{academics}</p>
                                : null
                            })()}
                          </div>
                        </td>

                        {/* Experience — intake-only */}
                        {showIntakeColumns && (
                          <td>
                            {r.experience ? (
                              <span className={`badge ${r.experience === 'Fresher' ? 'badge-green'
                                : r.experience === '0-3 Years' ? 'badge-blue' : 'badge-purple'}`}>
                                {r.experience}
                              </span>
                            ) : <span className="text-ink-300">—</span>}
                          </td>
                        )}

                        {/* Role Applied — intake-only */}
                        {showIntakeColumns && (
                          <td>
                            {r.selected_role ? (
                              <span className={`badge ${ROLE_BADGE[r.selected_role] || 'badge-neutral'} max-w-[190px]`}>
                                <span className="truncate">{r.selected_role}</span>
                              </span>
                            ) : <span className="text-ink-300">—</span>}
                          </td>
                        )}

                        {/* Form — always the live form name */}
                        <td>
                          <span className={`badge ${accent ? `${accent.soft} ${accent.text} ring-1 ring-inset ${accent.ring}` : 'badge-neutral'} max-w-[170px]`}>
                            {r.formStatus && r.formStatus !== 'Active' && <IconArchive size={11} />}
                            <span className="truncate">{r.formName}</span>
                          </span>
                        </td>

                        {/* Workflow chain */}
                        <td>
                          <WorkflowPips workflow={r.workflow} onOpen={() => setWorkflowRow(r)} />
                        </td>

                        {/* Reception */}
                        <td>
                          {isStudent ? (
                            <>
                              <span className={`badge ${r.registrationStatus === 'REGISTERED' ? 'badge-green' : 'badge-neutral'}`}>
                                {r.registrationStatus === 'REGISTERED' ? 'Registered' : 'Not Registered'}
                              </span>
                              {r.registrationTime && (
                                <p className="text-[11px] text-ink-400 mt-1">
                                  {new Date(r.registrationTime).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                                </p>
                              )}
                            </>
                          ) : <span className="text-ink-300">—</span>}
                        </td>

                        {/* Counselling */}
                        <td>
                          {isStudent ? (
                            <span className={`badge ${r.counsellingStatus === 'COMPLETED' ? 'badge-indigo' : 'badge-amber'}`}>
                              {r.counsellingStatus === 'COMPLETED' ? 'Completed' : 'Pending'}
                            </span>
                          ) : <span className="text-ink-300">—</span>}
                        </td>

                        <td className="text-ink-500 whitespace-nowrap">{fmtDate(r.submittedAt)}</td>

                        {/* Actions */}
                        <td>
                          <div className="flex items-center justify-end gap-0.5">
                            {isStudent ? (
                              <>
                                <button onClick={() => setEditStudent(r)} title="Edit application"
                                  className="icon-btn hover:!bg-brand-50 hover:!text-brand-700"><IconEdit /></button>
                                {/* Resume actions only exist for candidates who
                                    actually uploaded one — a form that never
                                    asked for a resume gets no dead buttons. */}
                                {r.resume_original_name && (
                                  <>
                                    <button onClick={() => handleViewResume(r)} title="View resume"
                                      className="icon-btn hover:!bg-blue-50 hover:!text-blue-600"><IconEye /></button>
                                    <button onClick={() => handleDownloadResume(r)} title="Download resume"
                                      className="icon-btn hover:!bg-blue-50 hover:!text-blue-600"><IconDownload /></button>
                                  </>
                                )}
                                {!r.resume_original_name && (
                                  <button onClick={() => setEditStudent(r)} title="View details"
                                    className="icon-btn hover:!bg-blue-50 hover:!text-blue-600"><IconEye /></button>
                                )}
                                {(r.registrationStatus === 'REGISTERED' || r.registrationPhotoPublicId) && (
                                  <button onClick={() => handleDeleteRegistration(r)} title="Delete reception registration"
                                    className="icon-btn hover:!bg-amber-50 hover:!text-amber-600"><IconArchive /></button>
                                )}
                                <button onClick={() => handleDeleteStudent(r)} title="Delete application"
                                  className="icon-btn hover:!bg-red-50 hover:!text-red-600"><IconTrash /></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setViewSubmission(r._id)} title="View response"
                                  className="icon-btn hover:!bg-blue-50 hover:!text-blue-600"><IconEye /></button>
                                <button onClick={() => handleDeleteSubmission(r)} title="Delete response"
                                  className="icon-btn hover:!bg-red-50 hover:!text-red-600"><IconTrash /></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && rows.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-t border-surface-200 bg-surface-50">
              <p className="text-[13px] text-ink-500">
                Showing <span className="font-semibold text-ink-700">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</span> of{' '}
                <span className="font-semibold text-ink-700">{total.toLocaleString('en-IN')}</span>
              </p>
              <div className="flex items-center gap-2">
                <button className="btn-secondary !px-3" disabled={page === 1}
                  onClick={() => fetchApplications(page - 1, search, filters)}>
                  <IconChevronLeft /> Prev
                </button>
                <span className="text-[13px] text-ink-500 px-1">Page {page} of {pages}</span>
                <button className="btn-secondary !px-3" disabled={page >= pages}
                  onClick={() => fetchApplications(page + 1, search, filters)}>
                  Next <IconChevronRight />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {editStudent && (
        <EditModal
          student={editStudent}
          onClose={() => setEditStudent(null)}
          // Editing can change the identity columns the table shows (and that
          // reception/counselling match on), so refetch rather than patch.
          onSaved={() => { fetchApplications(page, search, filters); fetchMeta() }}
        />
      )}
      {viewSubmission && <SubmissionModal id={viewSubmission} onClose={() => setViewSubmission(null)} />}
      {workflowRow && <WorkflowModal row={workflowRow} onClose={() => setWorkflowRow(null)} />}
    </AdminLayout>
  )
}
