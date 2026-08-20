import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { ADMIN_FORMS, ADMIN_COLLEGES, formUrlFor } from '../utils/routes'
import {
  IconType, IconMail, IconPhone, IconHash, IconCalendar, IconList, IconRadio,
  IconCheckSquare, IconParagraph, IconUpload, IconBuilding, IconPlus, IconTrash,
  IconSearch, IconClose, IconArrowRight, IconCheckCircle, IconSparkle
} from '../components/Icons'

// ── Form Builder ────────────────────────────────────────────────────────────
// Three panels: the field palette, the form canvas, and the properties of the
// selected field. The 'college' field type has no manual option list — its
// choices are the colleges that already exist in Workspace → Colleges, fetched
// live from the existing /api/colleges endpoint (workspace-scoped by the
// X-Workspace-Id header). Colleges are never created or duplicated here.

const FIELD_TYPES = [
  { value: 'text',     label: 'Text',        icon: IconType,        hint: 'Single line answer' },
  { value: 'email',    label: 'Email',       icon: IconMail,        hint: 'Validated email' },
  { value: 'phone',    label: 'Phone',       icon: IconPhone,       hint: 'Mobile number' },
  { value: 'number',   label: 'Number',      icon: IconHash,        hint: 'Numeric answer' },
  { value: 'date',     label: 'Date',        icon: IconCalendar,    hint: 'Date picker' },
  { value: 'college',  label: 'College',     icon: IconBuilding,    hint: 'From your colleges' },
  { value: 'dropdown', label: 'Dropdown',    icon: IconList,        hint: 'Select one' },
  { value: 'radio',    label: 'Radio',       icon: IconRadio,       hint: 'Pick one option' },
  { value: 'checkbox', label: 'Checkbox',    icon: IconCheckSquare, hint: 'Pick many' },
  { value: 'textarea', label: 'Paragraph',   icon: IconParagraph,   hint: 'Long answer' },
  { value: 'file',     label: 'File Upload', icon: IconUpload,      hint: 'Attach a file' }
]

const TYPE_META = Object.fromEntries(FIELD_TYPES.map(t => [t.value, t]))
const OPTION_TYPES = new Set(['dropdown', 'radio', 'checkbox'])

let tmpKeySeq = 0
const tmpKey = () => `tmp_${++tmpKeySeq}`

// ── College picker ──────────────────────────────────────────────────────────
// Searchable, multi-select list of the workspace's EXISTING colleges. Stores
// college _ids on the field — never names — so renaming a college in
// Workspace → Colleges is reflected everywhere with no data migration.
function CollegePicker({ field, colleges, onChange, disabled }) {
  const [search, setSearch] = useState('')
  const selected = useMemo(() => new Set((field.selectedCollegeIds || []).map(String)), [field.selectedCollegeIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? colleges.filter(c =>
      c.name.toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q)) : colleges
  }, [colleges, search])

  function toggle(id) {
    const next = new Set(selected)
    next.has(String(id)) ? next.delete(String(id)) : next.add(String(id))
    onChange({ ...field, selectedCollegeIds: [...next] })
  }
  const selectAll = () => onChange({ ...field, selectedCollegeIds: colleges.map(c => String(c._id)) })
  const clearAll  = () => onChange({ ...field, selectedCollegeIds: [] })

  if (colleges.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-300 bg-surface-50 p-5 text-center">
        <div className="w-10 h-10 rounded-xl bg-white ring-1 ring-surface-200 flex items-center justify-center mx-auto mb-3">
          <IconBuilding size={19} className="text-ink-400" />
        </div>
        <p className="text-[13px] font-medium text-ink-700">No colleges in this workspace yet</p>
        <p className="text-[12.5px] text-ink-400 mt-1 mb-3.5">
          Colleges are managed in one place and reused by every form.
        </p>
        <Link to={ADMIN_COLLEGES} className="btn-secondary !py-2 text-[13px]">
          Add colleges <IconArrowRight />
        </Link>
      </div>
    )
  }

  return (
    <div className={disabled ? 'opacity-60 pointer-events-none' : ''}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[12.5px] text-ink-500">
          <span className="font-semibold text-brand-700">{selected.size}</span> of {colleges.length} selected
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={selectAll} className="text-[12px] font-medium text-brand-700 hover:text-brand-800 px-2 py-1 rounded hover:bg-brand-50 transition">
            Select all
          </button>
          <span className="text-surface-300">|</span>
          <button type="button" onClick={clearAll} className="text-[12px] font-medium text-ink-500 hover:text-ink-800 px-2 py-1 rounded hover:bg-surface-100 transition">
            Clear all
          </button>
        </div>
      </div>

      <div className="relative mb-2">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
        <input
          className="form-input pl-9 pr-8"
          placeholder="Search colleges…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn !w-6 !h-6" aria-label="Clear search">
            <IconClose size={14} />
          </button>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto scroll-slim rounded-lg border border-surface-200 bg-white divide-y divide-surface-200/70">
        {filtered.length === 0 ? (
          <p className="text-[13px] text-ink-400 px-3.5 py-4 text-center">No colleges match “{search}”</p>
        ) : filtered.map(c => {
          const on = selected.has(String(c._id))
          return (
            <label key={c._id}
              className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors duration-150
                          ${on ? 'bg-brand-50/60' : 'hover:bg-surface-50'}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(c._id)} className="flex-shrink-0" />
              <span className="min-w-0 flex-1">
                <span className={`block text-[13.5px] truncate ${on ? 'text-brand-800 font-medium' : 'text-ink-700'}`}>
                  {c.name}
                  {c.code && <span className="text-ink-400 font-normal"> · {c.code}</span>}
                </span>
                {(c.location || c.address) && (
                  <span className="block text-[11.5px] text-ink-400 truncate">
                    {[c.location, c.address].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>

      <p className="form-hint">
        Only the colleges you tick here appear on this form's public page. Colleges added later
        stay available in <Link to={ADMIN_COLLEGES} className="text-brand-700 hover:underline">Workspace → Colleges</Link> until you select them.
      </p>
    </div>
  )
}

// ── Properties panel ────────────────────────────────────────────────────────
function FieldProperties({ field, colleges, onChange, onRemove, readOnly }) {
  if (!field) {
    return (
      <div className="text-center py-12 px-5">
        <div className="w-11 h-11 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
          <IconSparkle size={19} className="text-ink-400" />
        </div>
        <p className="text-[13px] font-medium text-ink-700">No field selected</p>
        <p className="text-[12.5px] text-ink-400 mt-1">Select a field on the canvas to edit its properties.</p>
      </div>
    )
  }

  const set = patch => onChange({ ...field, ...patch })
  const setOption = (i, value) => set({ options: field.options.map((o, idx) => idx === i ? value : o) })
  const Icon = TYPE_META[field.type]?.icon || IconType

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-2.5 pb-4 border-b border-surface-200">
        <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Icon size={17} className="text-brand-700" />
        </div>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink-800">{TYPE_META[field.type]?.label || 'Field'}</p>
          <p className="text-[11.5px] text-ink-400">Field properties</p>
        </div>
      </div>

      <div>
        <label className="form-label">Field Label <span className="text-red-500">*</span></label>
        <input className="form-input" value={field.label} disabled={readOnly}
          onChange={e => set({ label: e.target.value })} placeholder="e.g. Full Name" />
      </div>

      <div>
        <label className="form-label">Field Type</label>
        <select className="form-input" value={field.type} disabled={readOnly}
          onChange={e => {
            const type = e.target.value
            const patch = { type }
            if (OPTION_TYPES.has(type) && !field.options?.length) patch.options = ['']
            if (type === 'college' && !field.selectedCollegeIds) patch.selectedCollegeIds = []
            set(patch)
          }}>
          {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {field.type !== 'college' && (
        <div>
          <label className="form-label">Placeholder</label>
          <input className="form-input" value={field.placeholder || ''} disabled={readOnly}
            onChange={e => set({ placeholder: e.target.value })} placeholder="Optional hint text" />
        </div>
      )}

      <label className="flex items-start gap-3 rounded-lg border border-surface-200 bg-surface-50 px-3.5 py-3 cursor-pointer">
        <input type="checkbox" checked={!!field.required} disabled={readOnly}
          onChange={e => set({ required: e.target.checked })} className="mt-0.5" />
        <span>
          <span className="block text-[13.5px] font-medium text-ink-800">Required</span>
          <span className="block text-[12px] text-ink-400">Candidates cannot submit without answering.</span>
        </span>
      </label>

      {OPTION_TYPES.has(field.type) && (
        <div>
          <label className="form-label">Options</label>
          <div className="space-y-2">
            {(field.options || []).map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input className="form-input flex-1" value={opt} disabled={readOnly}
                  onChange={e => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                <button type="button" disabled={readOnly}
                  onClick={() => set({ options: field.options.filter((_, idx) => idx !== i) })}
                  className="icon-btn hover:!bg-red-50 hover:!text-red-600 flex-shrink-0" aria-label="Remove option">
                  <IconClose size={15} />
                </button>
              </div>
            ))}
            <button type="button" disabled={readOnly}
              onClick={() => set({ options: [...(field.options || []), ''] })}
              className="btn-secondary !py-2 w-full text-[13px]">
              <IconPlus size={14} /> Add option
            </button>
          </div>
        </div>
      )}

      {field.type === 'college' && (
        <div>
          <label className="form-label">Select Colleges</label>
          <CollegePicker field={field} colleges={colleges} onChange={onChange} disabled={readOnly} />
        </div>
      )}

      {!readOnly && (
        <button type="button" onClick={onRemove}
          className="w-full flex items-center justify-center gap-2 text-[13px] font-medium text-red-600
                     hover:bg-red-50 border border-red-100 rounded-lg py-2.5 transition">
          <IconTrash /> Remove field
        </button>
      )}
    </div>
  )
}

// ── Canvas preview of a single field ────────────────────────────────────────
function FieldPreview({ field, colleges, selected, onSelect, onMove, isFirst, isLast, index, readOnly }) {
  const Icon = TYPE_META[field.type]?.icon || IconType
  const selectedNames = (field.selectedCollegeIds || [])
    .map(id => colleges.find(c => String(c._id) === String(id))?.name)
    .filter(Boolean)

  const preview = () => {
    switch (field.type) {
      case 'textarea':
        return <div className="form-input !bg-surface-50 h-[68px] text-ink-400">{field.placeholder || 'Long answer…'}</div>
      case 'college':
        return (
          <div className="form-input !bg-surface-50 flex items-center justify-between text-ink-400">
            <span>{selectedNames.length ? 'Select college…' : 'No colleges selected yet'}</span>
            <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
              {selectedNames.length} available
            </span>
          </div>
        )
      case 'dropdown':
        return <div className="form-input !bg-surface-50 text-ink-400">{(field.options || []).filter(Boolean)[0] || 'Select…'}</div>
      case 'radio':
      case 'checkbox':
        return (
          <div className="space-y-1.5 pt-0.5">
            {((field.options || []).filter(Boolean).slice(0, 3)).map((o, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px] text-ink-500">
                <span className={`w-3.5 h-3.5 border border-surface-300 bg-white ${field.type === 'radio' ? 'rounded-full' : 'rounded'}`} />
                {o}
              </div>
            ))}
            {!(field.options || []).filter(Boolean).length && <p className="text-[13px] text-ink-400">No options yet</p>}
          </div>
        )
      case 'file':
        return <div className="form-input !bg-surface-50 text-ink-400">Choose file…</div>
      default:
        return <div className="form-input !bg-surface-50 text-ink-400">{field.placeholder || `Enter ${(field.label || 'value').toLowerCase()}…`}</div>
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`group relative rounded-xl border bg-white p-4 cursor-pointer transition-all duration-200
                  ${selected ? 'border-brand-500 ring-4 ring-brand-500/10 shadow-card' : 'border-surface-200 hover:border-surface-300 hover:shadow-card'}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0
                            ${selected ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-ink-400'}`}>
            <Icon size={13} />
          </span>
          <span className="text-[13.5px] font-semibold text-ink-800 truncate">
            {field.label || <span className="text-ink-400 italic font-normal">Untitled field</span>}
            {field.required && <span className="text-red-500"> *</span>}
          </span>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button type="button" disabled={isFirst} aria-label="Move up"
              onClick={e => { e.stopPropagation(); onMove(-1) }}
              className="icon-btn !w-7 !h-7 disabled:opacity-25">↑</button>
            <button type="button" disabled={isLast} aria-label="Move down"
              onClick={e => { e.stopPropagation(); onMove(1) }}
              className="icon-btn !w-7 !h-7 disabled:opacity-25">↓</button>
          </div>
        )}
      </div>
      {preview()}
      <span className="absolute -left-[9px] top-4 w-[18px] h-[18px] rounded-full bg-white border border-surface-300
                       text-[10px] font-bold text-ink-400 flex items-center justify-center">
        {index + 1}
      </span>
    </div>
  )
}

export default function AdminFormBuilder() {
  const { formId } = useParams()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('Active')
  const [publicSlug, setPublicSlug] = useState('')
  const [origin, setOrigin] = useState('custom')
  const [fields, setFields] = useState([])
  const [colleges, setColleges] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  // True only once THIS formId's configuration came back from the server.
  const [loaded, setLoaded] = useState(false)

  const readOnlyFields = origin === 'legacy'

  // Loading the form being edited.
  //
  // React Router keeps this component MOUNTED when moving from one form's
  // builder to another (same route, different :formId), so every piece of
  // editor state has to be cleared explicitly. Without the reset below the
  // previously opened form's fields stayed on screen while the new form was
  // being fetched — and if that fetch failed they stayed indefinitely, under
  // the new form's URL, with a Save button that would have written form A's
  // fields onto form B. The editor now shows nothing but what the server
  // returned for THIS formId.
  useEffect(() => {
    let cancelled = false

    // Clear every trace of the previously edited form before fetching
    setLoading(true)
    setError('')
    setSaved(false)
    setLoaded(false)
    setSelectedKey(null)
    setFields([])
    setName('')
    setDescription('')
    setStatus('Active')
    setPublicSlug('')
    setOrigin('custom')

    // Colleges come from the existing Workspace → Colleges API, already scoped
    // to the active workspace — no duplicate college store exists here.
    API.get('/api/colleges')
      .then(res => { if (!cancelled) setColleges(res.data) })
      .catch(() => { if (!cancelled) setColleges([]) })

    API.get(`/api/forms/${formId}`)
      .then(res => {
        if (cancelled) return   // a newer form was opened while this was in flight
        const f = res.data
        setName(f.name)
        setDescription(f.description || '')
        setStatus(f.status)
        setPublicSlug(f.publicSlug)
        setOrigin(f.origin || 'custom')
        setLoaded(true)
        // Fields come only from this form's stored configuration — there is no
        // default/sample field set anywhere in this component.
        setFields((f.fields || []).map(field => ({
          ...field,
          key: field._id || tmpKey(),
          options: field.options || [],
          selectedCollegeIds: (field.selectedCollegeIds || []).map(String)
        })))
      })
      .catch(err => { if (!cancelled) setError(err.response?.data?.message || 'Failed to load form') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [formId])

  function addField(type) {
    const key = tmpKey()
    const meta = TYPE_META[type]
    setFields(prev => [...prev, {
      key,
      type,
      label: meta ? meta.label : '',
      placeholder: '',
      required: false,
      options: OPTION_TYPES.has(type) ? [''] : [],
      selectedCollegeIds: []
    }])
    setSelectedKey(key)
  }

  const updateField = (key, updated) => setFields(prev => prev.map(f => f.key === key ? { ...updated, key } : f))
  function removeField(key) {
    setFields(prev => prev.filter(f => f.key !== key))
    setSelectedKey(null)
  }
  function moveField(key, dir) {
    setFields(prev => {
      const i = prev.findIndex(f => f.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const selectedField = fields.find(f => f.key === selectedKey) || null

  async function handleSave() {
    // If the form never loaded, editor state is empty by design — saving it
    // would blank out the stored configuration of a form we never read.
    if (!loaded) return setError('This form has not loaded yet. Reload the page before saving.')
    if (!name.trim()) return setError('Form name is required')
    if (fields.some(f => !f.label.trim())) return setError('Every field needs a label')

    setSaving(true)
    setError('')
    try {
      const payload = { name, description, status }
      // A built-in intake form's structure is fixed — only its labelling is
      // editable, so `fields` is left out of the request entirely.
      if (!readOnlyFields) {
        payload.fields = fields.map((f, i) => ({
          // _id is sent back so the server keeps existing field ids stable and
          // previously collected responses stay attached to their fields.
          ...(f._id ? { _id: f._id } : {}),
          type: f.type, label: f.label, placeholder: f.placeholder,
          required: f.required, options: f.options,
          selectedCollegeIds: f.selectedCollegeIds, order: i
        }))
      }
      await API.put(`/api/forms/${formId}`, payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save form')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <AdminLayout title="Form Builder"><div className="flex justify-center py-24"><Spinner size="lg" /></div></AdminLayout>
  }

  const actions = (
    <>
      {publicSlug && !readOnlyFields && (
        <a href={formUrlFor(publicSlug)} target="_blank" rel="noreferrer" className="btn-secondary">
          Preview public form <IconArrowRight />
        </a>
      )}
      <button onClick={handleSave} disabled={saving} className="btn-primary">
        {saving ? <><Spinner /> Saving…</> : saved ? <><IconCheckCircle size={16} /> Saved</> : 'Save Form'}
      </button>
    </>
  )

  return (
    <AdminLayout
      title={name || 'Form Builder'}
      subtitle={readOnlyFields
        ? 'Built-in intake form — rename it freely; its fields are fixed by the application it collects.'
        : 'Design the fields candidates will fill in on the public form.'}
      breadcrumb={[{ label: 'Forms', to: ADMIN_FORMS }, { label: 'Builder' }]}
      actions={actions}
    >
      {error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-[13.5px] text-red-700 animate-fade-up">
          {error}
        </div>
      )}

      {readOnlyFields && (
        <div className="mb-5 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-[13.5px] text-blue-800">
          This form represents applications received through a built-in intake link. Its name and description
          drive the Applications dashboard and can be changed at any time — the fields themselves cannot,
          because existing applications depend on them.
        </div>
      )}

      {/* ── Form settings ── */}
      <div className="card !p-5 mb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_180px] gap-4">
          <div>
            <label className="form-label">Form Name <span className="text-red-500">*</span></label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Campus Registration" />
          </div>
          <div>
            <label className="form-label">Description</label>
            <input className="form-input" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Shown to candidates under the title" />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Three-panel builder ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)_310px] gap-5 items-start">
        {/* LEFT — field palette */}
        <div className="panel lg:sticky lg:top-6">
          <div className="panel-head !py-3">
            <p className="text-[12.5px] font-bold uppercase tracking-wider text-ink-500">Field Types</p>
          </div>
          <div className="p-2.5 grid grid-cols-2 lg:grid-cols-1 gap-1.5">
            {FIELD_TYPES.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  disabled={readOnlyFields}
                  onClick={() => addField(t.value)}
                  className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left
                             hover:bg-brand-50 border border-transparent hover:border-brand-100
                             transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <span className="w-7 h-7 rounded-md bg-surface-100 group-hover:bg-white flex items-center justify-center flex-shrink-0 transition-colors">
                    <Icon size={14} className="text-ink-500 group-hover:text-brand-700 transition-colors" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink-700 group-hover:text-brand-800 truncate">{t.label}</span>
                    <span className="block text-[11px] text-ink-400 truncate">{t.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* CENTER — canvas */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="text-[13.5px] font-bold text-ink-800">Form Preview</p>
              <p className="text-[12px] text-ink-400 mt-0.5">
                {fields.length} field{fields.length === 1 ? '' : 's'} · this is what candidates will see
              </p>
            </div>
            {!readOnlyFields && (
              <button onClick={() => addField('text')} className="btn-secondary !py-2 text-[13px]">
                <IconPlus size={14} /> Add field
              </button>
            )}
          </div>

          <div className="p-5 bg-surface-50 min-h-[340px]">
            {fields.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-surface-300 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-white ring-1 ring-surface-200 flex items-center justify-center mx-auto mb-3">
                  <IconPlus size={20} className="text-ink-400" />
                </div>
                <p className="font-medium text-ink-700">This form has no fields yet</p>
                <p className="text-[13px] text-ink-400 mt-1">
                  {readOnlyFields ? 'Built-in intake forms collect a fixed application.' : 'Pick a field type from the left to start building.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 pl-2">
                {fields.map((f, i) => (
                  <FieldPreview
                    key={f.key}
                    field={f}
                    index={i}
                    colleges={colleges}
                    selected={selectedKey === f.key}
                    onSelect={() => setSelectedKey(f.key)}
                    onMove={dir => moveField(f.key, dir)}
                    isFirst={i === 0}
                    isLast={i === fields.length - 1}
                    readOnly={readOnlyFields}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — properties */}
        <div className="panel lg:sticky lg:top-6">
          <div className="panel-head !py-3">
            <p className="text-[12.5px] font-bold uppercase tracking-wider text-ink-500">Properties</p>
          </div>
          <div className="max-h-[calc(100vh-190px)] overflow-y-auto scroll-slim">
            <FieldProperties
              field={selectedField}
              colleges={colleges}
              readOnly={readOnlyFields}
              onChange={updated => updateField(selectedKey, updated)}
              onRemove={() => removeField(selectedKey)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button onClick={() => navigate(ADMIN_FORMS)} className="btn-secondary">Back to Forms</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? <><Spinner /> Saving…</> : saved ? <><IconCheckCircle size={16} /> Saved</> : 'Save Form'}
        </button>
      </div>
    </AdminLayout>
  )
}
