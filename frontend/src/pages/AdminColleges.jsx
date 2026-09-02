import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { ADMIN_FORMS } from '../utils/routes'
import { IconBuilding, IconSearch, IconEdit, IconTrash, IconPlus, IconClose, IconArrowRight } from '../components/Icons'
import BulkCollegeImport from '../components/BulkCollegeImport'

// The single source of truth for colleges in this workspace.
//
// Colleges live in FOLDERS — "Engineering Colleges", "MBA Colleges", … — that
// the admin defines. A folder's colleges are only ever shown inside that
// folder, and a form's College field draws from exactly one folder, so an MBA
// form can never offer an engineering college.
//
// Colleges a CANDIDATE added from a public form (because theirs was missing)
// land in the folder that form points at, flagged for review, so they surface
// here to be corrected, approved or deleted.
export default function AdminColleges() {
  const [categories, setCategories] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [colleges, setColleges] = useState([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)

  const [form, setForm] = useState({ name: '', code: '', location: '', address: '' })
  const [showBulk, setShowBulk] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyReview, setOnlyReview] = useState(false)

  const [folderDraft, setFolderDraft] = useState(null)   // { _id?, name, description }
  const [folderBusy, setFolderBusy] = useState(false)
  const [folderError, setFolderError] = useState('')

  const active = useMemo(() => categories.find(c => c._id === activeId) || null, [categories, activeId])

  async function fetchCategories(selectId) {
    try {
      const res = await API.get('/api/college-categories')
      setCategories(res.data)
      setActiveId(prev => {
        const want = selectId || prev
        return res.data.some(c => c._id === want) ? want : (res.data[0]?._id || null)
      })
      return res.data
    } catch { return [] }
  }

  async function fetchColleges(categoryId) {
    if (!categoryId) { setColleges([]); return }
    setListLoading(true)
    try {
      const res = await API.get('/api/colleges', { params: { category: categoryId } })
      setColleges(res.data)
    } catch { /* ignore */ }
    setListLoading(false)
  }

  useEffect(() => {
    (async () => {
      setLoading(true)
      await fetchCategories()
      setLoading(false)
    })()
  }, [])

  useEffect(() => { fetchColleges(activeId); cancelEdit(); setQuery('') }, [activeId])

  // Keep the folder counts honest after adding/deleting without a full refetch.
  function bumpCount(categoryId, delta, reviewDelta = 0) {
    setCategories(prev => prev.map(c => c._id === categoryId
      ? { ...c,
          collegeCount: Math.max(0, (c.collegeCount || 0) + delta),
          needsReviewCount: Math.max(0, (c.needsReviewCount || 0) + reviewDelta) }
      : c))
  }

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
    if (!activeId) { setError('Create a folder first'); return }
    setSaving(true)
    setError('')
    try {
      if (editId) {
        // Editing a candidate-submitted college is how an admin approves it.
        const res = await API.put(`/api/colleges/${editId}`, { ...form, reviewed: true })
        const was = colleges.find(c => c._id === editId)
        setColleges(prev => prev.map(c => c._id === editId ? res.data : c))
        if (was && was.reviewed === false) bumpCount(activeId, 0, -1)
      } else {
        const res = await API.post('/api/colleges', { ...form, category: activeId })
        setColleges(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
        bumpCount(activeId, 1)
      }
      cancelEdit()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function approve(college) {
    try {
      const res = await API.put(`/api/colleges/${college._id}`, { reviewed: true })
      setColleges(prev => prev.map(c => c._id === college._id ? res.data : c))
      bumpCount(activeId, 0, -1)
    } catch { alert('Could not approve') }
  }

  async function handleDelete(college) {
    if (!confirm(`Delete "${college.name}"? Forms that offer it will stop showing it to candidates.`)) return
    try {
      await API.delete(`/api/colleges/${college._id}`)
      setColleges(prev => prev.filter(c => c._id !== college._id))
      bumpCount(activeId, -1, college.reviewed === false ? -1 : 0)
      if (editId === college._id) cancelEdit()
    } catch { alert('Delete failed') }
  }

  async function saveFolder(e) {
    e.preventDefault()
    const name = (folderDraft?.name || '').trim()
    if (!name) { setFolderError('Folder name is required'); return }
    setFolderBusy(true)
    setFolderError('')
    try {
      if (folderDraft._id) {
        await API.put(`/api/college-categories/${folderDraft._id}`, { name, description: folderDraft.description || '' })
        await fetchCategories(folderDraft._id)
      } else {
        const res = await API.post('/api/college-categories', { name, description: folderDraft.description || '' })
        await fetchCategories(res.data._id)
      }
      setFolderDraft(null)
    } catch (err) {
      setFolderError(err.response?.data?.message || 'Could not save folder')
    } finally {
      setFolderBusy(false)
    }
  }

  async function deleteFolder(cat) {
    if (!confirm(`Delete the folder "${cat.name}"?`)) return
    try {
      await API.delete(`/api/college-categories/${cat._id}`)
      await fetchCategories()
    } catch (err) {
      const data = err.response?.data
      // A folder still holding colleges can be emptied into another one rather
      // than forcing the admin to move every college by hand.
      if (data?.code === 'NOT_EMPTY') {
        const others = categories.filter(c => c._id !== cat._id)
        if (!others.length) { alert(`${data.message}\n\nCreate another folder to move them into first.`); return }
        const target = prompt(
          `${data.message}\n\nMove them into which folder? Type the number:\n` +
          others.map((c, i) => `${i + 1}. ${c.name}`).join('\n')
        )
        const idx = Number(target) - 1
        if (!Number.isInteger(idx) || idx < 0 || idx >= others.length) return
        try {
          await API.delete(`/api/college-categories/${cat._id}`, { params: { moveTo: others[idx]._id } })
          await fetchCategories(others[idx]._id)
        } catch (e2) { alert(e2.response?.data?.message || 'Delete failed') }
        return
      }
      alert(data?.message || 'Delete failed')
    }
  }

  const visible = useMemo(() => {
    let list = colleges
    if (onlyReview) list = list.filter(c => c.reviewed === false)
    const q = query.trim().toLowerCase()
    return q ? list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.code || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)) : list
  }, [colleges, query, onlyReview])

  const reviewCount = colleges.filter(c => c.reviewed === false).length

  return (
    <AdminLayout
      title="Colleges"
      subtitle="Colleges grouped into folders. Each form's College field draws from exactly one folder."
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => { setFolderDraft({ name: '', description: '' }); setFolderError('') }} className="btn-secondary">
            <IconPlus /> New Folder
          </button>
          <button onClick={() => setShowBulk(true)} disabled={!activeId} className="btn-secondary disabled:opacity-50">
            <IconPlus /> Import Many
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : categories.length === 0 ? (
        <div className="panel text-center py-20 px-6">
          <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
            <IconBuilding size={22} className="text-ink-400" />
          </div>
          <p className="font-medium text-ink-700">No college folders yet</p>
          <p className="text-[13px] text-ink-400 mt-1 max-w-md mx-auto">
            Create a folder such as “Engineering Colleges” or “MBA Colleges”, then add or import
            colleges into it. Forms pick one folder to offer.
          </p>
          <button className="btn-primary mt-5" onClick={() => { setFolderDraft({ name: '', description: '' }); setFolderError('') }}>
            <IconPlus /> Create your first folder
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-5 items-start">
          {/* Folders */}
          <div className="panel lg:sticky lg:top-6">
            <div className="panel-head">
              <p className="text-[13.5px] font-bold text-ink-800">Folders</p>
            </div>
            <ul className="p-2 space-y-1">
              {categories.map(cat => (
                <li key={cat._id}>
                  <div
                    className={`group w-full flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                                ${cat._id === activeId ? 'bg-brand-50 text-brand-800' : 'hover:bg-surface-50 text-ink-700'}`}
                    onClick={() => setActiveId(cat._id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium truncate">{cat.name}</p>
                      <p className="text-[11.5px] text-ink-400">
                        {(cat.collegeCount || 0).toLocaleString('en-IN')} college{cat.collegeCount === 1 ? '' : 's'}
                        {cat.needsReviewCount > 0 && (
                          <span className="ml-1.5 text-amber-700 font-semibold">· {cat.needsReviewCount} to review</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button title="Rename folder"
                        onClick={e => { e.stopPropagation(); setFolderDraft({ _id: cat._id, name: cat.name, description: cat.description || '' }); setFolderError('') }}
                        className="icon-btn !w-7 !h-7 hover:!bg-brand-100"><IconEdit size={13} /></button>
                      {!cat.isDefault && (
                        <button title="Delete folder"
                          onClick={e => { e.stopPropagation(); deleteFolder(cat) }}
                          className="icon-btn !w-7 !h-7 hover:!bg-red-50 hover:!text-red-600"><IconTrash size={13} /></button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-5 items-start">
            {/* Add / edit college */}
            <div className="panel">
              <div className="panel-head">
                <div>
                  <p className="text-[13.5px] font-bold text-ink-800">{editId ? 'Edit College' : 'Add College'}</p>
                  <p className="text-[12px] text-ink-400 mt-0.5">
                    {editId ? 'Renaming updates it everywhere at once.' : <>Into <span className="font-semibold text-ink-600">{active?.name}</span></>}
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

            {/* College list */}
            <div className="panel">
              <div className="panel-head flex-wrap gap-3">
                <div>
                  <p className="text-[13.5px] font-bold text-ink-800">
                    {colleges.length.toLocaleString('en-IN')} College{colleges.length === 1 ? '' : 's'}
                  </p>
                  <p className="text-[12px] text-ink-400 mt-0.5">In “{active?.name}”</p>
                </div>
                <div className="flex items-center gap-2">
                  {reviewCount > 0 && (
                    <button
                      onClick={() => setOnlyReview(v => !v)}
                      className={`px-3 py-2 rounded-lg text-[12.5px] font-medium border transition-colors
                                  ${onlyReview ? 'bg-amber-500 text-white border-amber-500'
                                               : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}
                    >
                      {reviewCount} added by candidates
                    </button>
                  )}
                  <div className="relative">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                    <input className="form-input pl-9 w-full sm:w-52" type="search" placeholder="Search colleges…"
                      value={query} onChange={e => setQuery(e.target.value)} />
                  </div>
                </div>
              </div>

              {listLoading ? (
                <div className="flex justify-center py-20"><Spinner size="lg" /></div>
              ) : colleges.length === 0 ? (
                <div className="text-center py-20 px-6">
                  <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
                    <IconBuilding size={22} className="text-ink-400" />
                  </div>
                  <p className="font-medium text-ink-700">No colleges in this folder yet</p>
                  <p className="text-[13px] text-ink-400 mt-1">
                    Add one on the left, or import a spreadsheet into “{active?.name}”.
                  </p>
                </div>
              ) : visible.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <p className="font-medium text-ink-700">
                    {onlyReview ? 'Nothing left to review' : `No colleges match “${query}”`}
                  </p>
                  <button className="btn-secondary mt-4"
                    onClick={() => { setQuery(''); setOnlyReview(false) }}>Clear filters</button>
                </div>
              ) : (
                <ul className="divide-y divide-surface-200">
                  {visible.map(college => (
                    <li key={college._id}
                      className={`group flex items-center gap-3 px-5 py-3.5 transition-colors duration-150
                                  ${editId === college._id ? 'bg-brand-50/60'
                                    : college.reviewed === false ? 'bg-amber-50/50 hover:bg-amber-50'
                                    : 'hover:bg-surface-50'}`}>
                      <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center flex-shrink-0">
                        <IconBuilding size={16} className="text-ink-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink-800 text-[14px] truncate">
                          {college.name}
                          {college.code && <span className="badge badge-neutral ml-2 align-middle">{college.code}</span>}
                          {college.reviewed === false && (
                            <span className="ml-2 align-middle text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                              added by candidate
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-ink-400 truncate">
                          {[college.location, college.address].filter(Boolean).join(' · ') || 'No location set'}
                          {college.addedByName ? ` · by ${college.addedByName}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {college.reviewed === false && (
                          <button onClick={() => approve(college)} title="Looks right — approve"
                            className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200">
                            Approve
                          </button>
                        )}
                        <button onClick={() => startEdit(college)} title="Edit college"
                          className="icon-btn hover:!bg-brand-50 hover:!text-brand-700"><IconEdit /></button>
                        <button onClick={() => handleDelete(college)} title="Delete college"
                          className="icon-btn hover:!bg-red-50 hover:!text-red-600"><IconTrash /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {!listLoading && colleges.length > 0 && (
                <div className="px-5 py-3.5 border-t border-surface-200 bg-surface-50 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[12.5px] text-ink-500">Showing {visible.length} of {colleges.length}</p>
                  <Link to={ADMIN_FORMS} className="btn-ghost !text-brand-700">
                    Use these in a form <IconArrowRight />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Folder create / rename */}
      {folderDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 animate-fade-in"
          onClick={() => !folderBusy && setFolderDraft(null)}>
          <form onSubmit={saveFolder} onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-panel w-full max-w-md animate-scale-in">
            <div className="px-6 py-5 border-b border-surface-200">
              <h3 className="font-heading text-lg font-bold text-ink-900">
                {folderDraft._id ? 'Rename Folder' : 'New College Folder'}
              </h3>
              <p className="text-[13px] text-ink-500 mt-0.5">
                Colleges in one folder never appear in another.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="form-label">Folder Name <span className="text-red-500">*</span></label>
                <input className="form-input" autoFocus value={folderDraft.name}
                  placeholder="e.g. Engineering Colleges"
                  onChange={e => setFolderDraft(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Description</label>
                <input className="form-input" value={folderDraft.description || ''}
                  placeholder="Optional — what this folder is for"
                  onChange={e => setFolderDraft(p => ({ ...p, description: e.target.value }))} />
              </div>
              {folderError && <p className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">{folderError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-surface-200 flex justify-end gap-2.5">
              <button type="button" className="btn-secondary" onClick={() => setFolderDraft(null)} disabled={folderBusy}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={folderBusy}>
                {folderBusy ? <><Spinner /> Saving…</> : folderDraft._id ? 'Save' : 'Create Folder'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showBulk && (
        <BulkCollegeImport
          existing={colleges}
          category={activeId}
          categoryName={active?.name}
          onClose={() => setShowBulk(false)}
          onImported={list => { setColleges(list); fetchCategories(activeId) }}
        />
      )}
    </AdminLayout>
  )
}
