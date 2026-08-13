import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { formUrlFor, ADMIN_FORM_EDIT, ADMIN_FORM_RESPONSES, ADMIN_DASHBOARD } from '../utils/routes'
import {
  IconPlus, IconClose, IconLink, IconEdit, IconEye, IconTrash, IconDocument,
  IconArrowRight, IconCheckCircle, IconCalendar, IconArchive, IconSearch, IconCopy
} from '../components/Icons'

function CreateFormModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('Active')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Form name is required')
    setSaving(true)
    setError('')
    try {
      const res = await API.post('/api/forms', { name, description, status, fields: [] })
      onCreated(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create form')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-panel w-full max-w-md animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-surface-200">
          <div>
            <h3 className="font-heading text-lg font-bold text-ink-900">Create Form</h3>
            <p className="text-[13px] text-ink-500 mt-0.5">You'll add fields in the builder next.</p>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close"><IconClose /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="form-label">Form Name <span className="text-red-500">*</span></label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Campus Registration" autoFocus />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={2} value={description}
              onChange={e => setDescription(e.target.value)} placeholder="Optional — shown to candidates" />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          {error && <p className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? <><Spinner /> Creating…</> : <>Create &amp; open builder <IconArrowRight /></>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FormCard({ form, onOpenBuilder, onOpenResponses, onDelete, onCopyLink, onDuplicate }) {
  const [copied, setCopied] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const isLegacy = form.origin === 'legacy'
  const active = form.status === 'Active'

  async function duplicate() {
    setDuplicating(true)
    try { await onDuplicate(form) } finally { setDuplicating(false) }
  }

  function copy() {
    onCopyLink(form)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="card !p-5 card-hover flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                           ${active ? 'bg-brand-50' : 'bg-surface-100'}`}>
            <IconDocument size={18} className={active ? 'text-brand-700' : 'text-ink-400'} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-900 text-[15px] leading-snug truncate" title={form.name}>{form.name}</p>
            <p className="text-[12.5px] text-ink-500 mt-0.5 line-clamp-2">
              {form.description || (isLegacy ? 'Built-in intake form' : 'No description')}
            </p>
          </div>
        </div>
        <span className={`badge flex-shrink-0 ${active ? 'badge-green' : 'badge-neutral'}`}>
          {!active && <IconArchive size={11} />}{active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {isLegacy && (
        <span className="badge badge-blue self-start mb-3">Built-in</span>
      )}

      <div className="grid grid-cols-2 gap-3 py-3.5 my-1 border-y border-surface-200">
        <div>
          <p className="font-heading text-[22px] leading-none font-bold text-ink-900 tabular-nums">
            {(form.responseCount || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-[11.5px] text-ink-400 mt-1">Response{form.responseCount === 1 ? '' : 's'}</p>
        </div>
        <div>
          <p className="font-heading text-[22px] leading-none font-bold text-ink-900 tabular-nums">
            {form.fields?.length || 0}
          </p>
          <p className="text-[11.5px] text-ink-400 mt-1">Field{form.fields?.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[12px] text-ink-400 mb-4">
        <IconCalendar size={13} /> Created {new Date(form.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>

      <div className="flex flex-wrap gap-2 mt-auto">
        <button onClick={() => onOpenBuilder(form)} className="btn-secondary !py-2 !px-3 text-[13px]">
          <IconEdit /> Edit
        </button>
        <button onClick={() => onOpenResponses(form)} className="btn-secondary !py-2 !px-3 text-[13px]">
          <IconEye /> Responses
        </button>
        {!isLegacy && (
          <button onClick={copy} className="btn-secondary !py-2 !px-3 text-[13px]" title="Copy the public form link">
            {copied ? <><IconCheckCircle size={14} className="text-brand-600" /> Copied</> : <><IconLink /> Public Link</>}
          </button>
        )}
        {!isLegacy && (
          <button onClick={duplicate} disabled={duplicating}
            className="btn-secondary !py-2 !px-3 text-[13px]"
            title="Create a copy of this form with the same fields">
            {duplicating ? <><Spinner /> Copying…</> : <><IconCopy /> Duplicate</>}
          </button>
        )}
        {!isLegacy && (
          <button onClick={() => onDelete(form)} title="Delete form"
            className="icon-btn ml-auto hover:!bg-red-50 hover:!text-red-600"><IconTrash /></button>
        )}
      </div>
    </div>
  )
}

export default function AdminForms() {
  const navigate = useNavigate()
  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')

  function load() {
    setLoading(true)
    API.get('/api/forms')
      .then(res => setForms(res.data))
      .catch(err => setError(err.response?.data?.message || 'Failed to load forms'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  function handleCreated(form) {
    setShowCreate(false)
    navigate(ADMIN_FORM_EDIT.replace(':formId', form._id))
  }

  const copyLink = form => navigator.clipboard.writeText(`${window.location.origin}${formUrlFor(form.publicSlug)}`)

  // Built-in intake forms collect Student applications, which have their own
  // full column set — those are reviewed on the Applications dashboard,
  // pre-filtered to the form.
  const openResponses = form => navigate(
    form.origin === 'legacy'
      ? `${ADMIN_DASHBOARD}?form=${form._id}`
      : ADMIN_FORM_RESPONSES.replace(':formId', form._id)
  )

  // Duplicating opens the copy straight in the builder — the point is to
  // tweak the reused fields, not to hunt for the new card afterwards.
  async function handleDuplicate(form) {
    try {
      const res = await API.post(`/api/forms/${form._id}/duplicate`)
      navigate(ADMIN_FORM_EDIT.replace(':formId', res.data._id))
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to duplicate form')
    }
  }

  async function handleDelete(form) {
    if (!confirm(`Delete "${form.name}"? This cannot be undone.`)) return
    try {
      await API.delete(`/api/forms/${form._id}`)
      setForms(prev => prev.filter(f => f._id !== form._id))
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete form')
    }
  }

  const visible = forms.filter(f => f.name.toLowerCase().includes(query.trim().toLowerCase()))
  const totalResponses = forms.reduce((sum, f) => sum + (f.responseCount || 0), 0)

  const actions = (
    <>
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <input className="form-input pl-9 w-full sm:w-56" placeholder="Search forms…" type="search"
          value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <button onClick={() => setShowCreate(true)} className="btn-primary"><IconPlus /> Create Form</button>
    </>
  )

  return (
    <AdminLayout
      title="Forms"
      subtitle="Create and manage recruitment forms for this workspace."
      actions={actions}
    >
      {!loading && !error && forms.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6 stagger">
          {[
            { label: 'Total Forms', value: forms.length },
            { label: 'Active Forms', value: forms.filter(f => f.status === 'Active').length },
            { label: 'Total Responses', value: totalResponses }
          ].map(s => (
            <div key={s.label} className="card !p-4">
              <p className="font-heading text-[24px] leading-none font-bold text-ink-900 tabular-nums">
                {s.value.toLocaleString('en-IN')}
              </p>
              <p className="text-[12.5px] text-ink-500 mt-1.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="skeleton h-[248px] rounded-xl" />)}
        </div>
      ) : error ? (
        <div className="card text-center py-16 text-red-600">{error}</div>
      ) : forms.length === 0 ? (
        <div className="card text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <IconDocument size={24} className="text-ink-400" />
          </div>
          <p className="font-heading text-lg font-bold text-ink-900 mb-1">No forms yet</p>
          <p className="text-[13.5px] text-ink-500 max-w-sm mx-auto mb-5">
            Build a form to collect applications. Every form you create becomes its own category
            on the Applications dashboard automatically.
          </p>
          <button onClick={() => setShowCreate(true)} className="btn-primary"><IconPlus /> Create Form</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="card text-center py-16">
          <p className="font-medium text-ink-700">No forms match “{query}”</p>
          <button className="btn-secondary mt-4" onClick={() => setQuery('')}>Clear search</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {visible.map(f => (
            <FormCard
              key={f._id}
              form={f}
              onOpenBuilder={form => navigate(ADMIN_FORM_EDIT.replace(':formId', form._id))}
              onOpenResponses={openResponses}
              onDelete={handleDelete}
              onCopyLink={copyLink}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateFormModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </AdminLayout>
  )
}
