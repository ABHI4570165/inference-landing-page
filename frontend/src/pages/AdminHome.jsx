import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import GlobalSidebar from '../components/GlobalSidebar'
import Spinner from '../components/Spinner'
import { ADMIN_WORKSPACE_DASHBOARD, ADMIN_LOGIN } from '../utils/routes'
import {
  IconRocket, IconUsers, IconDocument, IconBuilding,
  IconCalendar, IconEye, IconDots, IconEdit, IconArrowRight, IconPlus, IconCheckCircle, IconCamera
} from '../components/Icons'

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const CURRENT_YEAR = new Date().getFullYear()
const emptyForm = { companyName: '', recruitmentDriveName: '', year: String(CURRENT_YEAR), description: '', status: 'Active' }

function initialsOf(name) {
  return (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('') || 'W'
}

// Handles BOTH creating a new workspace and editing an existing one.
// Editing never touches receptionToken/counsellingToken — the backend PUT
// only ever updates companyName/recruitmentDriveName/year/description/status.
function WorkspaceFormModal({ editing, onClose, onSaved }) {
  const [form, setForm] = useState(editing ? {
    companyName: editing.companyName,
    recruitmentDriveName: editing.recruitmentDriveName,
    year: String(editing.year),
    description: editing.description || '',
    status: editing.status
  } : emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.companyName.trim())          return setError('Company name is required')
    if (!form.recruitmentDriveName.trim()) return setError('Recruitment drive name is required')
    if (!form.year || Number(form.year) < 2000) return setError('A valid year is required')

    setSaving(true)
    setError('')
    try {
      const res = editing
        ? await API.put(`/api/workspaces/${editing._id}`, form)
        : await API.post('/api/workspaces', form)
      onSaved(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save workspace')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-lg font-bold text-gray-800">
            {editing ? 'Edit Recruitment Workspace' : 'Create Recruitment Workspace'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Company Name <span className="text-red-500">*</span></label>
            <input className="form-input" value={form.companyName}
              onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))}
              placeholder="e.g. ABC Technologies" autoFocus />
          </div>
          <div>
            <label className="form-label">Recruitment Drive <span className="text-red-500">*</span></label>
            <input className="form-input" value={form.recruitmentDriveName}
              onChange={e => setForm(p => ({ ...p, recruitmentDriveName: e.target.value }))}
              placeholder="e.g. ABC Technologies Campus Hiring 2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Year <span className="text-red-500">*</span></label>
              <input type="number" className="form-input" value={form.year}
                onChange={e => setForm(p => ({ ...p, year: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Description (Optional)</label>
            <textarea className="form-input" rows={2} value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Notes about this drive" />
          </div>

          {error && <p className="text-red-500 text-sm bg-red-50 p-2.5 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? <><Spinner /> Saving...</> : editing ? 'Save Changes' : 'Create Workspace'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function WorkspaceDetailsModal({ ws, onClose }) {
  const rows = [
    ['Company Name', ws.companyName],
    ['Recruitment Drive', ws.recruitmentDriveName],
    ['Year', ws.year],
    ['Status', ws.status],
    ['Created', new Date(ws.createdAt).toLocaleString('en-IN')],
    ['Applications', ws.stats.applications],
    ['Counselling Completed', ws.stats.counsellingCompleted],
    ['Counselling Pending', ws.stats.counsellingPending],
    ['Reception Check-ins', ws.stats.receptionCheckins],
    ['Forms (Active / Total)', `${ws.stats.activeForms} / ${ws.stats.forms}`]
  ]
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading text-lg font-bold text-gray-800">Workspace Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <dl className="divide-y divide-gray-100">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2.5 text-sm">
              <dt className="text-gray-500">{label}</dt>
              <dd className="font-medium text-gray-800 text-right">{value}</dd>
            </div>
          ))}
        </dl>
        <button onClick={onClose} className="btn-secondary w-full mt-5">Close</button>
      </div>
    </div>
  )
}

function CardMenu({ onEdit }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-label="Workspace options" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
        <IconDots />
      </button>
      {open && (
        <div className="absolute right-0 top-9 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 w-44 z-10">
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <IconEdit /> Edit Workspace
          </button>
        </div>
      )}
    </div>
  )
}

function StatItem({ icon, value, label, color }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="font-bold text-gray-800 leading-tight">{value}</p>
        <p className="text-[11px] text-gray-500 leading-tight truncate">{label}</p>
      </div>
    </div>
  )
}

function WorkspaceCard({ ws, onOpen, onEdit, onViewDetails }) {
  const archived = ws.status === 'Archived'
  return (
    <div className={`card !p-5 !p-6 transition hover:shadow-md duration-200 ${archived ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-brand-700 text-white flex items-center justify-center font-heading font-bold text-sm flex-shrink-0">
            {initialsOf(ws.companyName)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-heading font-bold text-gray-800 text-lg truncate" title={ws.companyName}>{ws.companyName}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${archived ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                {ws.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 truncate" title={ws.recruitmentDriveName}>{ws.recruitmentDriveName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
            <IconCalendar />
            <span>Created on<br /><span className="text-gray-600 font-medium">{new Date(ws.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
          </div>
          <CardMenu onEdit={() => onEdit(ws)} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-y border-gray-100 py-4 mb-4">
        <StatItem icon={<IconUsers size={15} className="text-brand-700" />} value={ws.stats.applications} label="Applications" color="bg-brand-50" />
        <StatItem icon={<IconCheckCircle size={15} className="text-blue-600" />} value={ws.stats.counsellingCompleted} label="Counselled" color="bg-blue-50" />
        <StatItem icon={<IconDocument size={15} className="text-amber-600" />} value={ws.stats.activeForms} label="Active Forms" color="bg-amber-50" />
        <StatItem icon={<IconCamera size={15} className="text-pink-600" />} value={ws.stats.receptionCheckins} label="Reception Check-ins" color="bg-pink-50" />
        <StatItem icon={<IconCheckCircle size={15} className="text-teal-600" />} value={ws.stats.counsellingPending} label="Counselling Pending" color="bg-teal-50" />
      </div>

      <div className="flex items-center justify-end gap-2.5">
        <button onClick={() => onViewDetails(ws)} className="btn-secondary text-sm flex items-center gap-1.5">
          <IconEye /> View Details
        </button>
        <button onClick={() => onOpen(ws)} className="btn-primary text-sm flex items-center gap-1.5">
          Open Workspace <IconArrowRight />
        </button>
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="card !p-6 animate-pulse">
      <div className="flex items-center gap-3.5 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-gray-200 rounded w-1/3" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
      <div className="h-16 bg-gray-100 rounded mb-4" />
      <div className="h-8 bg-gray-100 rounded w-1/3 ml-auto" />
    </div>
  )
}

export default function AdminHome() {
  const { admin, logout } = useAuth()
  const { setWorkspace } = useWorkspace()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingWs, setEditingWs] = useState(null)
  const [detailsWs, setDetailsWs] = useState(null)

  function load() {
    setLoading(true)
    API.get('/api/workspaces')
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load workspaces'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  function openWorkspace(ws) {
    setWorkspace(ws)
    navigate(ADMIN_WORKSPACE_DASHBOARD)
  }

  function handleSaved(ws) {
    setShowCreate(false)
    const wasEditing = !!editingWs
    setEditingWs(null)
    load()
    if (!wasEditing) openWorkspace(ws)
  }

  const name = admin?.email ? admin.email.split('@')[0] : 'there'

  return (
    <div className="app-shell">
      <GlobalSidebar />

      <main className="app-main">
        {/* Mobile header — the sidebar is desktop-only, so account actions
            still need a home on small screens. */}
        <header className="lg:hidden bg-brand-900 text-white px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/logo-white.svg" alt="" className="w-8 h-8 rounded-lg bg-white p-0.5 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-heading font-bold text-sm leading-tight">Recruitment</p>
              <p className="text-[11px] text-brand-300 leading-tight truncate">{admin?.email}</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate(ADMIN_LOGIN) }}
            className="text-[13px] font-medium bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">
            Logout
          </button>
        </header>

        <div className="app-content">
          <div className="mb-7 flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-heading text-[26px] font-bold text-ink-900">
                {greeting()}, <span className="text-brand-700 capitalize">{name}</span> 👋
              </h2>
              <p className="text-ink-500 text-[13.5px] mt-1">Manage your recruitment drives from one place.</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-1.5">
              <IconPlus /> Create Workspace
            </button>
          </div>

          {!loading && data && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Workspaces', sub: 'All time', value: data.totals.totalWorkspaces, icon: <IconBuilding className="text-brand-700" />, bg: 'bg-brand-50' },
                { label: 'Active Drives', sub: 'Currently running', value: data.totals.activeDrives, icon: <IconRocket className="text-blue-600" />, bg: 'bg-blue-50' },
                { label: 'Total Applications', sub: 'Across all workspaces', value: data.totals.totalApplications, icon: <IconUsers className="text-purple-600" />, bg: 'bg-purple-50' },
                { label: 'Active Forms', sub: 'Across all workspaces', value: data.totals.totalActiveForms, icon: <IconDocument className="text-amber-600" />, bg: 'bg-amber-50' }
              ].map(t => (
                <div key={t.label} className="card !p-5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${t.bg}`}>{t.icon}</div>
                  <p className="text-2xl font-bold text-gray-800 leading-tight">{t.value}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{t.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.sub}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mb-4">
            <h3 className="font-heading text-lg font-bold text-gray-800">Recruitment Workspaces</h3>
            <p className="text-sm text-gray-500">Manage and switch between your active recruitment drives.</p>
          </div>

          {loading ? (
            <div className="space-y-4 mb-6">
              {[0, 1].map(i => <CardSkeleton key={i} />)}
            </div>
          ) : error ? (
            <div className="card text-center py-16 text-red-600 mb-6">{error}</div>
          ) : data.workspaces.length === 0 ? (
            <div className="card text-center py-16 mb-6">
              <p className="text-gray-500 mb-1 font-medium">No recruitment workspaces yet</p>
              <p className="text-gray-400 text-sm mb-4">Create your first recruitment workspace to get started.</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">+ Create Workspace</button>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              {data.workspaces.map(ws => (
                <WorkspaceCard
                  key={ws._id}
                  ws={ws}
                  onOpen={openWorkspace}
                  onEdit={setEditingWs}
                  onViewDetails={setDetailsWs}
                />
              ))}
            </div>
          )}

          {/* Always-visible create-more section, per the reference design */}
          <div className="border-2 border-dashed border-gray-200 rounded-2xl py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <IconBuilding size={26} className="text-gray-400" />
            </div>
            <h4 className="font-heading font-bold text-gray-800 mb-1">Add more recruitment drives</h4>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-5">
              Create new workspaces for different companies and manage all your recruitment drives in one place.
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm inline-flex items-center gap-1.5">
              <IconPlus /> Create Workspace
            </button>
          </div>
        </div>
      </main>

      {showCreate && <WorkspaceFormModal onClose={() => setShowCreate(false)} onSaved={handleSaved} />}
      {editingWs && <WorkspaceFormModal editing={editingWs} onClose={() => setEditingWs(null)} onSaved={handleSaved} />}
      {detailsWs && <WorkspaceDetailsModal ws={detailsWs} onClose={() => setDetailsWs(null)} />}
    </div>
  )
}
