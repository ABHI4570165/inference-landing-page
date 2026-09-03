import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import API from '../utils/api'
import Spinner from '../components/Spinner'
import PublicShell from '../components/PublicShell'
import { IconCheckCircle, IconClose } from '../components/Icons'

// Public submission page for one custom form.
//
// The shell (M H Foundation header + footer) is identical for every form; the
// CONTENT is entirely driven by the form's own configuration, so a new form
// with different fields renders correctly with no change here.
//
// The field list — including which colleges a 'college' field offers — comes
// from the server, which resolves it from the colleges the admin selected for
// THIS form. The browser is never trusted: the backend re-verifies the
// submitted college id against that same selection before saving.

// Fields that read better on their own row; everything else pairs up two-per-
// row on wider screens.
const FULL_WIDTH_TYPES = new Set(['textarea', 'checkbox', 'radio', 'file'])

// ── Searchable college dropdown ────────────────────────────────────────────────
function CollegeSelect({ field, colleges, value, onChange, slug, onCollegeAdded }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const ref = useRef()

  const labelOf = c =>
    [c.code ? `${c.name} (${c.code})` : c.name, c.location, c.address].filter(Boolean).join(' — ')

  const options = colleges.map(c => ({ _id: c._id, name: labelOf(c) }))
  const typed = query.trim()
  const filtered = options.filter(o => o.name.toLowerCase().includes(typed.toLowerCase()))

  // College names are stored in capitals with runs of whitespace collapsed, so
  // that is what a candidate is shown they are about to save — and it is the
  // same comparison used to decide "already listed", so "svce", "SVCE" and
  // "S V C E  " are never all added as separate colleges.
  const normalise = v => String(v || '').trim().replace(/\s+/g, ' ').toUpperCase()
  const asSaved = normalise(typed)

  // Typing the name of a college that IS already listed must not create a
  // second copy of it — the candidate simply has not spotted it in the list,
  // so point them at the existing entry instead of offering to add it again.
  const duplicate = colleges.find(c => normalise(c.name) === asSaved)
  const canAdd = !!field.allowCustomCollege && asSaved.length >= 4 && !duplicate

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(college) { onChange(college._id); setQuery(college.name); setOpen(false) }

  useEffect(() => {
    const selected = colleges.find(c => c._id === value)
    // Only overwrite what they typed once a real selection exists, so an
    // in-progress search is never wiped out by this syncing effect.
    if (selected) setQuery(labelOf(selected))
  }, [value, colleges])

  async function addCollege() {
    setAdding(true)
    setAddError('')
    try {
      const res = await API.post(`/api/public/forms/${slug}/colleges`, {
        fieldId: field._id,
        name: typed
      })
      onCollegeAdded(field._id, res.data)
      onChange(res.data._id)
      setQuery(labelOf(res.data))
      setOpen(false)
    } catch (err) {
      const data = err.response?.data
      // Someone else added the same college between this page loading and the
      // button being pressed. Nothing went wrong for the candidate — put the
      // existing college in front of them and select it.
      if (data?.code === 'ALREADY_LISTED' && data.college) {
        onCollegeAdded(field._id, data.college)
        onChange(data.college._id)
        setQuery(labelOf(data.college))
        setOpen(false)
        return
      }
      setAddError(data?.message || 'Could not add that college. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        className="form-input w-full pr-8"
        placeholder="Type to search your college…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setAddError(''); if (!e.target.value) onChange('') }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg text-sm overflow-hidden">
          {filtered.length > 0 && (
            <ul className="max-h-48 overflow-y-auto">
              {filtered.map(opt => (
                <li
                  key={opt._id}
                  onMouseDown={() => select(opt)}
                  className={`px-4 py-2 cursor-pointer hover:bg-brand-50 hover:text-brand-700
                    ${value === opt._id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
                >
                  {opt.name}
                </li>
              ))}
            </ul>
          )}
          {filtered.length === 0 && typed && (
            <p className="px-4 py-2.5 text-gray-500">No college matches “{typed}”</p>
          )}

          {duplicate && field.allowCustomCollege && value !== duplicate._id ? (
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-200">
              <p className="text-xs text-amber-900 mb-2">
                <strong>{duplicate.name}</strong> is already in the list — please select it
                instead of adding it again.
              </p>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select({ _id: duplicate._id, name: labelOf(duplicate) })}
                className="w-full rounded-lg bg-amber-500 text-white text-[13px] font-semibold px-3 py-2
                           hover:bg-amber-600 transition-colors"
              >
                Select {duplicate.name}
              </button>
            </div>
          ) : canAdd ? (
            <div className="px-4 py-3 bg-brand-50 border-t border-brand-100">
              <p className="text-xs text-brand-900 mb-2">
                Can’t find your college? Add it exactly as it is officially known.
              </p>
              <button
                type="button"
                disabled={adding}
                onMouseDown={e => e.preventDefault()}
                onClick={addCollege}
                className="w-full rounded-lg bg-brand-600 text-white text-[13px] font-semibold px-3 py-2
                           hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {adding ? 'Adding…' : `Add “${asSaved}”`}
              </button>
              <p className="text-[11px] text-brand-800/80 mt-1.5">
                Saved in capitals as <strong>{asSaved}</strong>. Please check the spelling.
              </p>
              {addError && <p className="text-xs text-red-700 mt-2">{addError}</p>}
            </div>
          ) : field.allowCustomCollege && typed && asSaved.length < 4 ? (
            <div className="px-4 py-2.5 bg-surface-100 border-t border-surface-200 text-ink-500 text-xs">
              Keep typing your full college name to add it.
            </div>
          ) : !field.allowCustomCollege ? (
            <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 text-amber-800 text-xs">
              🏫 College not listed? Please contact your <strong>Placement Officer</strong> to get your college added.
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Loading state ──────────────────────────────────────────────────────────
// The first request after a quiet spell can take a while to answer. A bare
// spinner for that long reads as "broken" and candidates close the tab, so the
// wait is narrated instead — centred on screen, and reassuring rather than
// technical. Candidates should never be shown anything about how the service is
// hosted; that is our problem, not theirs.
const WAIT_STAGES = [
  { after: 0,  text: 'Please wait…',                       sub: 'Your application form is being prepared.' },
  { after: 5,  text: 'Getting your form ready…',           sub: 'This will only take a moment.' },
  { after: 12, text: 'Almost ready…',                      sub: 'Thank you for your patience.' },
  { after: 25, text: 'Just a little longer…',              sub: 'Please keep this page open — your form is on its way.' }
]

function FormLoading() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const stage = WAIT_STAGES.filter(s => seconds >= s.after).pop() || WAIT_STAGES[0]

  return (
    <div className="flex flex-col items-center justify-center text-center animate-fade-in
                    min-h-[60vh] px-6">
      <Spinner size="lg" />
      <p className="mt-5 text-[17px] font-semibold text-ink-800" aria-live="polite">
        {stage.text}
      </p>
      <p className="mt-1.5 text-[13.5px] text-ink-500 max-w-xs leading-relaxed">
        {stage.sub}
      </p>
    </div>
  )
}

// Uploads the chosen file immediately and stores the descriptor the server
// returns as this field's value. Previously only the filename was captured and
// the file itself was never sent anywhere, so uploaded CVs could never be
// opened by an admin.
function FileField({ field, value, onChange, slug }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('fieldId', field._id)
      const res = await API.post(`/api/public/forms/${slug}/upload`, fd)
      onChange(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.')
      onChange('')
      e.target.value = ''
    } finally {
      setUploading(false)
    }
  }

  const uploaded = value && typeof value === 'object' && value.url

  return (
    <div>
      <input
        type="file"
        // Required only until a file has actually been uploaded
        required={field.required && !uploaded}
        disabled={uploading}
        className="form-input file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0
                   file:text-[13px] file:font-medium file:bg-brand-50 file:text-brand-700 cursor-pointer
                   disabled:opacity-60"
        onChange={handleFile}
      />
      {uploading && (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-500 mt-1.5"><Spinner /> Uploading…</p>
      )}
      {uploaded && !uploading && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-brand-700 mt-1.5">
          <IconCheckCircle size={14} /> {value.originalName} uploaded
        </p>
      )}
      {error && <p className="text-[12.5px] text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}

function Field({ field, value, onChange, slug, onCollegeAdded }) {
  const common = {
    className: 'form-input',
    placeholder: field.placeholder || '',
    required: field.required
  }

  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={4} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'dropdown':
      return (
        <select {...common} value={value || ''} onChange={e => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case 'college': {
      const options = field.collegeOptions || []
      // An empty list is only a dead end when the candidate also cannot add
      // their own — otherwise the picker still has a job to do.
      if (options.length === 0 && !field.allowCustomCollege) {
        return (
          <p className="text-[13px] text-ink-400 bg-surface-100 border border-surface-200 rounded-lg px-3.5 py-2.5">
            No colleges are available for this form.
          </p>
        )
      }
      return (
        <CollegeSelect
          field={field}
          colleges={options}
          value={value || ''}
          onChange={onChange}
          slug={slug}
          onCollegeAdded={onCollegeAdded}
        />
      )
    }
    case 'radio':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {field.options.map(o => {
            const on = value === o
            return (
              <label key={o}
                className={`flex items-center gap-2.5 text-[14px] rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors duration-150
                            ${on ? 'border-brand-400 bg-brand-50/60 text-brand-900' : 'border-surface-300 bg-white text-ink-700 hover:border-brand-300'}`}>
                <input type="radio" name={field._id} checked={on}
                  onChange={() => onChange(o)} required={field.required} className="flex-shrink-0" />
                <span className="min-w-0 break-words">{o}</span>
              </label>
            )
          })}
        </div>
      )
    case 'checkbox':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {field.options.map(o => {
            const arr = Array.isArray(value) ? value : []
            const on = arr.includes(o)
            return (
              <label key={o}
                className={`flex items-center gap-2.5 text-[14px] rounded-lg border px-3.5 py-2.5 cursor-pointer transition-colors duration-150
                            ${on ? 'border-brand-400 bg-brand-50/60 text-brand-900' : 'border-surface-300 bg-white text-ink-700 hover:border-brand-300'}`}>
                <input type="checkbox" checked={on} className="flex-shrink-0"
                  onChange={e => onChange(e.target.checked ? [...arr, o] : arr.filter(x => x !== o))} />
                <span className="min-w-0 break-words">{o}</span>
              </label>
            )
          })}
        </div>
      )
    case 'file':
      return <FileField field={field} value={value} onChange={onChange} slug={slug} />
    case 'date':
      return <input type="date" {...common} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'number':
      return <input type="number" {...common} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'email':
      return <input type="email" {...common} value={value || ''} onChange={e => onChange(e.target.value)} />
    case 'phone':
      return <input type="tel" {...common} value={value || ''} onChange={e => onChange(e.target.value)} />
    default:
      return <input type="text" {...common} value={value || ''} onChange={e => onChange(e.target.value)} />
  }
}

function StatusCard({ tone, icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-surface-200 shadow-card px-6 sm:px-8 py-12 text-center animate-scale-in">
      <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-5 ${tone}`}>{icon}</div>
      <h1 className="font-heading text-[22px] font-bold text-ink-900 mb-2">{title}</h1>
      <p className="text-ink-500 text-[14px] max-w-sm mx-auto">{children}</p>
    </div>
  )
}

export default function PublicForm() {
  const { publicSlug } = useParams()
  const [form, setForm] = useState(null)
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Each public link renders only its own stored configuration. State is reset
  // whenever the slug changes so a previously opened form's fields — and, more
  // importantly, its typed answers (which are keyed by that form's field ids)
  // can never carry over into a different form's submission.
  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setNotFound(false)
    setSubmitted(false)
    setError('')
    setForm(null)
    setValues({})

    API.get(`/api/public/forms/${publicSlug}`)
      .then(res => { if (!cancelled) setForm(res.data) })
      .catch(() => { if (!cancelled) setNotFound(true) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [publicSlug])

  // A college the candidate just added becomes a normal option straight away,
  // so the dropdown shows it selected instead of looking like nothing happened.
  function addCollegeOption(fieldId, college) {
    setForm(prev => {
      if (!prev) return prev
      return {
        ...prev,
        fields: prev.fields.map(f => {
          if (String(f._id) !== String(fieldId)) return f
          const existing = f.collegeOptions || []
          if (existing.some(c => String(c._id) === String(college._id))) return f
          return {
            ...f,
            collegeOptions: [...existing, college]
              .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
          }
        })
      }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await API.post(`/api/public/forms/${publicSlug}/submit`, { responses: values })
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PublicShell>
        <FormLoading />
      </PublicShell>
    )
  }

  if (notFound) {
    return (
      <PublicShell>
        <StatusCard tone="bg-surface-100" icon={<IconClose size={26} className="text-ink-400" />} title="Form not available">
          This form link is invalid, closed, or no longer active.
        </StatusCard>
      </PublicShell>
    )
  }

  if (submitted) {
    return (
      <PublicShell>
        <StatusCard
          tone="bg-brand-50 ring-8 ring-brand-50/50"
          icon={<IconCheckCircle size={30} className="text-brand-600" />}
          title="Thank you!"
        >
          Your response to <span className="font-medium text-ink-700">{form.name}</span> has been submitted
          successfully. You may now close this page.
        </StatusCard>
      </PublicShell>
    )
  }

  const requiredCount = form.fields.filter(f => f.required).length

  return (
    <PublicShell>
      {/* Form title card */}
      <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden mb-5 animate-fade-up">
        <div className="h-1.5 bg-brand-600" />
        <div className="px-6 sm:px-8 py-6">
          <h1 className="font-heading text-[22px] sm:text-[26px] leading-tight font-bold text-ink-900">
            {form.name}
          </h1>
          {form.description && (
            <p className="text-ink-500 text-[14px] mt-2 leading-relaxed">{form.description}</p>
          )}
          {requiredCount > 0 && (
            <p className="text-[12.5px] text-ink-400 mt-3">
              <span className="text-red-500">*</span> indicates a required field
              {' · '}{requiredCount} of {form.fields.length} required
            </p>
          )}
        </div>
      </div>

      {/* Fields card — one section, rendered from the form's own configuration */}
      <form onSubmit={handleSubmit} noValidate={false}>
        <div className="bg-white rounded-2xl border border-surface-200 shadow-card overflow-hidden mb-5">
          <div className="px-6 sm:px-8 py-4 border-b border-surface-200 bg-surface-50">
            <h2 className="font-heading text-[15px] font-bold text-ink-900">Application Details</h2>
            <p className="text-[12.5px] text-ink-400 mt-0.5">Please fill in your details accurately.</p>
          </div>

          <div className="px-6 sm:px-8 py-6">
            {form.fields.length === 0 ? (
              <p className="text-ink-400 text-[14px] text-center py-8">This form has no questions yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                {form.fields.map(field => (
                  <div
                    key={field._id}
                    className={FULL_WIDTH_TYPES.has(field.type) ? 'sm:col-span-2' : ''}
                  >
                    <label className="form-label">
                      {field.label}{field.required && <span className="text-red-500"> *</span>}
                    </label>
                    <Field
                      field={field}
                      value={values[field._id]}
                      slug={publicSlug}
                      onChange={v => setValues(prev => ({ ...prev, [field._id]: v }))}
                      onCollegeAdded={addCollegeOption}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {form.fields.length > 0 && (
            <div className="px-6 sm:px-8 py-5 border-t border-surface-200 bg-surface-50">
              {error && (
                <p className="text-[13.5px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5 mb-4">
                  {error}
                </p>
              )}
              <button type="submit" disabled={submitting} className="btn-primary w-full sm:w-auto sm:min-w-[200px] !py-3">
                {submitting ? <><Spinner /> Submitting…</> : 'Submit Application'}
              </button>
              <p className="text-[12px] text-ink-400 mt-3">
                Your details are used only for this recruitment drive.
              </p>
            </div>
          )}
        </div>
      </form>
    </PublicShell>
  )
}
