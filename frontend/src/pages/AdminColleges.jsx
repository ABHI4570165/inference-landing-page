import { useState, useEffect } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'

export default function AdminColleges() {
  const [colleges, setColleges] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', location: '' })
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchColleges() {
    setLoading(true)
    try {
      const res = await API.get('/api/colleges')
      setColleges(res.data)
    } catch { }
    setLoading(false)
  }

  useEffect(() => { fetchColleges() }, [])

  function startEdit(college) {
    setEditId(college._id)
    setForm({ name: college.name, location: college.location || '' })
    setError('')
  }

  function cancelEdit() {
    setEditId(null)
    setForm({ name: '', location: '' })
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

  async function handleDelete(id) {
    if (!confirm('Delete this college?')) return
    try {
      await API.delete(`/api/colleges/${id}`)
      setColleges(prev => prev.filter(c => c._id !== id))
    } catch { alert('Delete failed') }
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-bold text-gray-800">Manage Colleges</h2>
          <p className="text-gray-500 text-sm">{colleges.length} colleges in database</p>
        </div>

        {/* Add/Edit Form */}
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-700 mb-4">{editId ? 'Edit College' : 'Add New College'}</h3>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="form-label">College Name <span className="text-red-500">*</span></label>
              <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Anna University" />
            </div>
            <div>
              <label className="form-label">Location (Optional)</label>
              <input className="form-input" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Chennai, Tamil Nadu" />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary text-sm">
                {saving ? <><Spinner /> Saving...</> : editId ? 'Update College' : 'Add College'}
              </button>
              {editId && <button type="button" className="btn-secondary" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </div>

        {/* College List */}
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : colleges.length === 0 ? (
          <div className="card text-center py-10 text-gray-500">No colleges yet. Add one above.</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {colleges.map((college, i) => (
                <li key={college._id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{college.name}</p>
                    {college.location && <p className="text-xs text-gray-500 mt-0.5">{college.location}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(college)} className="btn-secondary text-xs py-1 px-3">Edit</button>
                    <button onClick={() => handleDelete(college._id)} className="btn-danger text-xs py-1 px-3">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
