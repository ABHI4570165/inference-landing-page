import { useState, useEffect, useCallback } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import CounsellingNav from '../components/CounsellingNav'
import Spinner from '../components/Spinner'

// Question editor — the questionnaire lives in the database, so admins can
// edit wording/options/points, add questions, reorder and deactivate here.
const METRIC_TAGS = [
  'careerClarity', 'confidence', 'technicalReadiness', 'learningAttitude',
  'placementReadiness', 'communicationReadiness', 'motivation', 'riskLevel'
]

const EMPTY = {
  sectionKey: '', sectionTitle: '', sectionNote: '', code: '', text: '',
  type: 'radio', options: [{ label: '', points: 0 }, { label: '', points: 0 }],
  allowOther: false, required: true, active: true, order: 0, metricTags: []
}

export default function AdminCounsellingQuestions() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [editing, setEditing] = useState(null) // question object or EMPTY clone
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await API.get('/api/admin/counselling/questions')
      setQuestions(res.data)
    } catch {
      setMessage({ type: 'error', text: 'Failed to load questions' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew(section) {
    const last = questions[questions.length - 1]
    setEditing({
      ...EMPTY,
      sectionKey: section?.key || '',
      sectionTitle: section?.title || '',
      sectionNote: section?.note || '',
      order: (last?.order || 0) + 10
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const payload = {
        ...editing,
        options: (editing.type === 'radio' || editing.type === 'checkbox') ? editing.options.filter(o => o.label.trim()) : []
      }
      if (editing._id) {
        await API.put(`/api/admin/counselling/questions/${editing._id}`, payload)
        setMessage({ type: 'success', text: `${editing.code} updated` })
      } else {
        await API.post('/api/admin/counselling/questions', payload)
        setMessage({ type: 'success', text: 'Question added' })
      }
      setEditing(null)
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(q) {
    try {
      if (q.active) {
        if (!window.confirm(`Deactivate ${q.code}? It disappears from the student form; past answers are kept.`)) return
        await API.delete(`/api/admin/counselling/questions/${q._id}`)
      } else {
        await API.put(`/api/admin/counselling/questions/${q._id}`, { active: true })
      }
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Update failed' })
    }
  }

  // group by section for display
  const visible = questions.filter(q => showInactive || q.active)
  const sections = []
  const byKey = new Map()
  for (const q of visible) {
    if (!byKey.has(q.sectionKey)) {
      const s = { key: q.sectionKey, title: q.sectionTitle, note: q.sectionNote, questions: [] }
      byKey.set(q.sectionKey, s)
      sections.push(s)
    }
    byKey.get(q.sectionKey).questions.push(q)
  }

  return (
    <AdminLayout>
      <div className="mb-4">
        <h2 className="font-heading text-2xl font-bold text-gray-800">Counselling Questions</h2>
        <p className="text-gray-500 text-sm">The questionnaire is stored in the database — edit wording, options, points and order here. Changes appear on the student form immediately.</p>
      </div>
      <CounsellingNav />

      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>{message.text}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" className="accent-green-700" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show deactivated questions
        </label>
        <button className="btn-primary text-sm" onClick={() => openNew(null)}>+ Add Question</button>
      </div>

      {loading ? (
        <div className="card flex justify-center py-16 text-gray-400 gap-2"><Spinner /> Loading…</div>
      ) : sections.map(s => (
        <div key={s.key} className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-gray-800">
              <span className="text-brand-600 mr-2">Section {s.key}</span>{s.title}
              {s.note && <span className="text-xs text-gray-400 font-normal ml-2">({s.note})</span>}
            </h3>
            <button className="btn-secondary text-sm" onClick={() => openNew(s)}>+ Add here</button>
          </div>
          <div className="divide-y divide-gray-100">
            {s.questions.map(q => (
              <div key={q._id} className={`py-3 flex items-start justify-between gap-4 ${!q.active ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    <span className="text-gray-400 mr-1.5">{q.code}.</span>{q.text}
                    {!q.active && <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">inactive</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {q.type}{q.options.length ? ` • ${q.options.length} options` : ''}{q.allowOther ? ' • allows "Other"' : ''}
                    {q.required ? ' • required' : ' • optional'} • order {q.order}
                    {q.metricTags?.length ? ` • ${q.metricTags.join(', ')}` : ''}
                  </p>
                  {q.options.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {q.options.map((o, i) => (
                        <li key={i} className="text-xs text-gray-500">
                          ◦ {o.label} <span className="text-brand-600 font-medium">[{o.points} pts]</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className="btn-secondary text-xs !px-3 !py-1.5" onClick={() => setEditing({ ...q, options: q.options.map(o => ({ ...o })) })}>Edit</button>
                  <button className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                    q.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`} onClick={() => toggleActive(q)}>
                    {q.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── edit / add modal ── */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setEditing(null)}>
          <form className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()} onSubmit={handleSave}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg text-gray-800">{editing._id ? `Edit ${editing.code}` : 'Add Question'}</h3>
              <button type="button" className="text-gray-400 hover:text-gray-600 text-2xl leading-none" onClick={() => setEditing(null)}>&times;</button>
            </div>

            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Section Key</label>
                  <input className="form-input" required placeholder="A" value={editing.sectionKey}
                    onChange={e => setEditing(v => ({ ...v, sectionKey: e.target.value.toUpperCase() }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label">Section Title</label>
                  <input className="form-input" required placeholder="About You" value={editing.sectionTitle}
                    onChange={e => setEditing(v => ({ ...v, sectionTitle: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="form-label">Question Text</label>
                <textarea className="form-input min-h-[64px]" required value={editing.text}
                  onChange={e => setEditing(v => ({ ...v, text: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="form-label">Code</label>
                  <input className="form-input" placeholder="auto" value={editing.code}
                    onChange={e => setEditing(v => ({ ...v, code: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <select className="form-input" value={editing.type}
                    onChange={e => setEditing(v => ({ ...v, type: e.target.value }))}>
                    <option value="radio">Radio (single choice)</option>
                    <option value="checkbox">Checkbox (multiple)</option>
                    <option value="text">Text (one line)</option>
                    <option value="textarea">Textarea (paragraph)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Order</label>
                  <input className="form-input" type="number" value={editing.order}
                    onChange={e => setEditing(v => ({ ...v, order: Number(e.target.value) }))} />
                </div>
                <div className="flex flex-col justify-end gap-1.5 pb-1">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" className="accent-green-700" checked={editing.required}
                      onChange={e => setEditing(v => ({ ...v, required: e.target.checked }))} /> Required
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" className="accent-green-700" checked={editing.allowOther}
                      onChange={e => setEditing(v => ({ ...v, allowOther: e.target.checked }))} /> Allow "Other"
                  </label>
                </div>
              </div>

              {(editing.type === 'radio' || editing.type === 'checkbox') && (
                <div>
                  <label className="form-label">Options <span className="text-gray-400 font-normal">(points are hidden from students)</span></label>
                  <div className="space-y-2">
                    {editing.options.map((o, i) => (
                      <div key={i} className="flex gap-2">
                        <input className="form-input flex-1" placeholder={`Option ${i + 1}`} value={o.label}
                          onChange={e => setEditing(v => {
                            const options = [...v.options]; options[i] = { ...options[i], label: e.target.value }
                            return { ...v, options }
                          })} />
                        <input className="form-input !w-20" type="number" title="Points" value={o.points}
                          onChange={e => setEditing(v => {
                            const options = [...v.options]; options[i] = { ...options[i], points: Number(e.target.value) }
                            return { ...v, options }
                          })} />
                        <button type="button" className="text-gray-400 hover:text-red-500 px-1"
                          onClick={() => setEditing(v => ({ ...v, options: v.options.filter((_, j) => j !== i) }))}>&times;</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn-secondary text-xs mt-2"
                    onClick={() => setEditing(v => ({ ...v, options: [...v.options, { label: '', points: 0 }] }))}>
                    + Add option
                  </button>
                </div>
              )}

              <div>
                <label className="form-label">Score Metrics <span className="text-gray-400 font-normal">(which AI scores this question feeds)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {METRIC_TAGS.map(tag => {
                    const on = editing.metricTags?.includes(tag)
                    return (
                      <button key={tag} type="button"
                        className={`text-xs px-2.5 py-1 rounded-full border transition ${
                          on ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'
                        }`}
                        onClick={() => setEditing(v => ({
                          ...v,
                          metricTags: on ? v.metricTags.filter(t => t !== tag) : [...(v.metricTags || []), tag]
                        }))}>
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100 rounded-b-2xl">
              <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary text-sm" disabled={saving}>
                {saving ? <><Spinner /> Saving…</> : (editing._id ? 'Save Changes' : 'Add Question')}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  )
}
