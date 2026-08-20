import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { ADMIN_FORMS } from '../utils/routes'
import { IconBuilding, IconSearch, IconEdit, IconTrash, IconPlus, IconClose, IconArrowRight } from '../components/Icons'
import BulkCollegeImport from '../components/BulkCollegeImport'

// The single source of truth for colleges in this workspace. The Form Builder's
// College field reads this exact list — colleges are never typed into a form or
// duplicated into a second collection.
export default function AdminColleges() {
  const [colleges, setColleges] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', code: '', location: '', address: '' })
  const [showBulk, setShowBulk] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  async function fetchColleges() {
    setLoading(true)
    try {
      const res = await API.get('/api/colleges')
      setColleges(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { fetchColleges() }, [])

  function startEdit(college) {
    setEditId(college._id)
    setForm({ name: college.name, code: college.code || '', location: college.location || '', address: college.address || '' })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditId(null)
    setForm({ name: '', code: '', location: '', address: '' })
    setError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('College name is required'); return }
    setSaving(true)
    setError('')
    try {
      if (editId) {
        const res = await API.put(`/api/colleges/${editId}`, form)
        setColleges(prev => prev.map(c => c._id === editId ? res.data : c))
      } else {
        const res = await API.post('/api/colleges', form)
        setColleges(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
      }
      cancelEdit()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(college) {
    if (!confirm(`Delete "${college.name}"? Forms that offer it will stop showing it to candidates.`)) return
    try {
      await API.delete(`/api/colleges/${college._id}`)
      setColleges(prev => prev.filter(c => c._id !== college._id))
      if (editId === college._id) cancelEdit()
    } catch { alert('Delete failed') }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? colleges.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)) : colleges
  }, [colleges, query])

  return (
    <AdminLayout
      title="Colleges"
      subtitle="The colleges available to this workspace. Forms pick from this list — they never define their own."
      actions={
        <button onClick={() => setShowBulk(true)} className="btn-secondary">
          <IconPlus /> Import Many
        </button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
        {/* Add / edit */}
        <div className="panel lg:sticky lg:top-6">
          <div className="panel-head">
            <div>
              <p className="text-[13.5px] font-bold text-ink-800">{editId ? 'Edit College' : 'Add College'}</p>
              <p className="text-[12px] text-ink-400 mt-0.5">
                {editId ? 'Renaming updates it everywhere at once.' : 'Available to every form in this workspace.'}
              </p>
            </div>
            {editId && <button onClick={cancelEdit} className="icon-btn" aria-label="Cancel edit"><IconClose /></button>}
          </div>
          <form onSubmit={handleSave} className="p-5 space-y-4">
            <div>
              <label className="form-label">College Name <span className="text-red-500">*</span></label>
              <input className="form-input" value={form.name} placeholder="e.g. RV College of Engineering"
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">College Code</label>
              <input className="form-input" value={form.code} placeholder="e.g. 1RV"
                onChange={e => setForm(p => ({ ...p, code: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location} placeholder="e.g. Bengaluru, Karnataka"
                onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Address</label>
              <input className="form-input" value={form.address} placeholder="e.g. Mysore Road, RV Vidyaniketan Post"
                onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
              <p className="form-hint">Names are saved in capitals and listed alphabetically.</p>
            </div>
            {error && <p className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">{error}</p>}
            <div className="flex gap-2.5">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? <><Spinner /> Saving…</> : editId ? 'Update College' : <><IconPlus /> Add College</>}
              </button>
              {editId && <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>

          <div className="px-5 pb-5">
            <div className="rounded-lg bg-brand-50 border border-brand-100 px-3.5 py-3">
              <p className="text-[12.5px] text-brand-800 leading-relaxed">
                New colleges become selectable in the Form Builder immediately — but are never
                auto-added to existing forms. Pick them per form in{' '}
                <Link to={ADMIN_FORMS} className="font-semibold underline">Forms</Link>.
              </p>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="text-[13.5px] font-bold text-ink-800">
                {colleges.length.toLocaleString('en-IN')} College{colleges.length === 1 ? '' : 's'}
              </p>
              <p className="text-[12px] text-ink-400 mt-0.5">In this workspace only</p>
            </div>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
              <input className="form-input pl-9 w-full sm:w-60" type="search" placeholder="Search colleges…"
                value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : colleges.length === 0 ? (
            <div className="text-center py-20 px-6">
              <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
                <IconBuilding size={22} className="text-ink-400" />
              </div>
              <p className="font-medium text-ink-700">No colleges yet</p>
              <p className="text-[13px] text-ink-400 mt-1">
                Add your first college on the left — your forms will be able to offer it right away.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 px-6">
              <p className="font-medium text-ink-700">No colleges match “{query}”</p>
              <button className="btn-secondary mt-4" onClick={() => setQuery('')}>Clear search</button>
            </div>
          ) : (
            <ul className="divide-y divide-surface-200">
              {visible.map(college => (
                <li key={college._id}
                  className={`group flex items-center gap-3 px-5 py-3.5 transition-colors duration-150
                              ${editId === college._id ? 'bg-brand-50/60' : 'hover:bg-surface-50'}`}>
                  <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                    <IconBuilding size={16} className="text-ink-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-800 text-[14px] truncate">
                      {college.name}
                      {college.code && <span className="badge badge-neutral ml-2 align-middle">{college.code}</span>}
                    </p>
                    <p className="text-[12px] text-ink-400 truncate">
                      {[college.location, college.address].filter(Boolean).join(' · ') || 'No location set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(college)} title="Edit college"
                      className="icon-btn hover:!bg-brand-50 hover:!text-brand-700"><IconEdit /></button>
                    <button onClick={() => handleDelete(college)} title="Delete college"
                      className="icon-btn hover:!bg-red-50 hover:!text-red-600"><IconTrash /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!loading && colleges.length > 0 && (
            <div className="px-5 py-3.5 border-t border-surface-200 bg-surface-50 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12.5px] text-ink-500">
                Showing {visible.length} of {colleges.length}
              </p>
              <Link to={ADMIN_FORMS} className="btn-ghost !text-brand-700">
                Use these in a form <IconArrowRight />
              </Link>
            </div>
          )}
        </div>
      </div>
      {showBulk && (
        <BulkCollegeImport
          existing={colleges}
          onClose={() => setShowBulk(false)}
          onImported={list => setColleges(list)}
        />
      )}
    </AdminLayout>
  )
}
