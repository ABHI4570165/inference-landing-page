import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { ADMIN_FORMS, ADMIN_DASHBOARD } from '../utils/routes'
import {
  IconChevronLeft, IconChevronRight, IconDownload, IconInbox,
  IconEye, IconEdit, IconTrash, IconClose
} from '../components/Icons'

// A value that came from a real upload — it carries a stored URL. Responses
// collected before file storage existed hold only the chosen filename as a
// plain string, and that file was never saved anywhere.
const isStoredFile = v => v && typeof v === 'object' && !Array.isArray(v) && !!v.url
const cell = v => isStoredFile(v) ? (v.originalName || 'Uploaded file')
  : Array.isArray(v) ? v.join(', ') : (v ?? '')

// Streams a stored file through the authenticated proxy, so the underlying
// storage URL is never handed to the browser.
async function openFile(submissionId, fieldId, download) {
  const win = download ? null : window.open('', '_blank')
  if (win) win.document.write('<p style="font-family:sans-serif;color:#666">Loading…</p>')
  try {
    const res = await API.get(
      `/api/applications/submissions/${submissionId}/file/${fieldId}${download ? '?download=1' : ''}`,
      { responseType: 'blob' }
    )
    const url = URL.createObjectURL(res.data)
    if (download) {
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers['content-disposition']?.match(/filename="(.+?)"/)?.[1] || 'file'
      a.click()
    } else if (win) {
      win.location = url
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    if (win) win.close()
    alert('Unable to open the file')
  }
}

function FileCell({ row, field }) {
  const value = row.responses?.[field._id]

  if (isStoredFile(value)) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="truncate max-w-[150px]" title={value.originalName}>{value.originalName}</span>
        <button onClick={() => openFile(row._id, field._id, false)} title="View file"
          className="icon-btn !w-7 !h-7 hover:!bg-blue-50 hover:!text-blue-600"><IconEye size={14} /></button>
        <button onClick={() => openFile(row._id, field._id, true)} title="Download file"
          className="icon-btn !w-7 !h-7 hover:!bg-blue-50 hover:!text-blue-600"><IconDownload size={14} /></button>
      </span>
    )
  }

  if (value) {
    // Filename only — the upload predates file storage, so there is nothing to
    // open. Saying so beats a button that silently fails.
    return (
      <span className="flex items-center gap-1.5 text-ink-400"
        title="This file was not stored — it was submitted before file uploads were saved. Ask the candidate to re-upload.">
        <span className="truncate max-w-[150px] line-through decoration-ink-300">{String(value)}</span>
        <span className="badge badge-amber flex-shrink-0">Not stored</span>
      </span>
    )
  }
  return <span className="text-ink-300">—</span>
}

// Edit one response against its own form's fields — no fixed field list.
function EditResponseModal({ form, row, onClose, onSaved }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries((form.fields || []).map(f => [f._id, row.responses?.[f._id] ?? ''])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setSaving(true)
    setError('')
    try {
      // File fields are omitted on purpose — the server keeps the stored file.
      const payload = Object.fromEntries(
        (form.fields || []).filter(f => f.type !== 'file').map(f => [f._id, values[f._id]])
      )
      await API.put(`/api/applications/submissions/${row._id}`, { responses: payload })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function input(f) {
    const v = values[f._id]
    const set = val => setValues(p => ({ ...p, [f._id]: val }))

    if (f.type === 'file') {
      return <div className="pt-1"><FileCell row={row} field={f} /></div>
    }
    if (f.type === 'college' || f.type === 'dropdown' || f.type === 'radio') {
      const opts = f.type === 'college' ? (f.collegeOptions || []) : (f.options || [])
      return (
        <select className="form-input" value={v || ''} onChange={e => set(e.target.value)}>
          <option value="">Select…</option>
          {/* The current answer stays selectable even if it is no longer an
              offered option, so editing another field cannot silently wipe it */}
          {v && !opts.includes(v) ? <option value={v}>{v}</option> : null}
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    if (f.type === 'checkbox') {
      const arr = Array.isArray(v) ? v : (v ? String(v).split(', ') : [])
      return (
        <div className="space-y-1.5">
          {(f.options || []).map(o => (
            <label key={o} className="flex items-center gap-2.5 text-[13.5px] text-ink-700 cursor-pointer">
              <input type="checkbox" checked={arr.includes(o)}
                onChange={e => set(e.target.checked ? [...arr, o] : arr.filter(x => x !== o))} />
              {o}
            </label>
          ))}
        </div>
      )
    }
    if (f.type === 'textarea') {
      return <textarea className="form-input" rows={3} value={v || ''} onChange={e => set(e.target.value)} />
    }
    const t = f.type === 'date' ? 'date' : f.type === 'number' ? 'number'
      : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'
    return <input type={t} className="form-input" value={v || ''} onChange={e => set(e.target.value)} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-panel w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-surface-200">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold text-ink-900">Edit Response</h3>
            <p className="text-[13px] text-ink-500 mt-0.5 truncate">
              {row.candidate?.name || 'Candidate'} · {form.name}
            </p>
          </div>
          <button onClick={onClose} className="icon-btn flex-shrink-0" aria-label="Close"><IconClose /></button>
        </div>

        <div className="overflow-y-auto scroll-slim px-6 py-5 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
            {(form.fields || []).map(f => (
              <div key={f._id} className={['textarea', 'checkbox', 'file'].includes(f.type) ? 'sm:col-span-2' : ''}>
                <label className="form-label">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </label>
                {input(f)}
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mt-4">{error}</p>}
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-surface-200">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <><Spinner /> Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminFormResponses() {
  const { formId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [editRow, setEditRow] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    API.get(`/api/forms/${formId}/responses?page=${page}&limit=20`)
      .then(res => setData(res.data))
      .catch(err => {
        // Built-in intake forms collect full application records — those live
        // on the Applications dashboard, pre-filtered to this form.
        if (err.response?.data?.code === 'USE_APPLICATIONS_DASHBOARD') {
          navigate(`${ADMIN_DASHBOARD}?form=${formId}`, { replace: true })
          return
        }
        setError(err.response?.data?.message || 'Failed to load responses')
      })
      .finally(() => setLoading(false))
  }, [formId, page, reloadKey])

  async function handleDelete(row) {
    if (!confirm(`Delete ${row.candidate?.name || 'this'} response permanently? This cannot be undone.`)) return
    try {
      await API.delete(`/api/applications/submissions/${row._id}`)
      setReloadKey(k => k + 1)
    } catch (err) {
      alert(err.response?.data?.message || 'Delete failed')
    }
  }

  function handleExport() {
    // Fetch all pages of responses (server limits page size to 100).
    const fields = data.form.fields || []
    const headers = ['#', 'Submitted At', ...fields.map(f => f.label)]

    const fetchAll = async () => {
      const limit = 100
      let page = 1
      let all = []
      let total = null
      while (true) {
        // Request pages until we've collected `total` rows
        const res = await API.get(`/api/forms/${formId}/responses?page=${page}&limit=${limit}`)
        const payload = res.data
        total = payload.total
        all = all.concat(payload.rows || [])
        if (all.length >= total) break
        page += 1
      }
      return { all, total }
    }

    ;(async () => {
      try {
        const { all } = await fetchAll()
        const body = all.map((row, i) => [
          i + 1,
          new Date(row.submittedAt).toLocaleString('en-IN'),
          ...fields.map(f => cell(row.responses?.[f._id]))
        ])
        const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
        const csv = [headers, ...body].map(r => r.map(escape).join(',')).join('\r\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${data.form.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_responses.csv`
        a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        alert('Export failed: ' + (err.response?.data?.message || err.message || 'Unknown error'))
      }
    })()
  }

  if (loading && !data) {
    return <AdminLayout title="Responses"><div className="flex justify-center py-24"><Spinner size="lg" /></div></AdminLayout>
  }
  if (error) {
    return <AdminLayout title="Responses"><div className="card text-center py-16 text-red-600">{error}</div></AdminLayout>
  }
  if (!data) return null

  const fields = data.form.fields || []
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit))

  return (
    <AdminLayout
      title={data.form.name}
      subtitle={`${data.total.toLocaleString('en-IN')} response${data.total === 1 ? '' : 's'} collected`}
      breadcrumb={[{ label: 'Forms', to: ADMIN_FORMS }, { label: 'Responses' }]}
      actions={
        data.rows.length > 0 &&
        <button onClick={handleExport} className="btn-secondary"><IconDownload /> Export</button>
      }
    >
      <div className="panel">
        {data.rows.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
              <IconInbox size={22} className="text-ink-400" />
            </div>
            <p className="font-medium text-ink-700">No responses yet</p>
            <p className="text-[13px] text-ink-400 mt-1">Share the public link and responses will appear here.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll scroll-slim">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-12">#</th>
                    <th>Submitted</th>
                    {fields.map(f => <th key={f._id}>{f.label}</th>)}
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={row._id}>
                      <td className="text-ink-400 tabular-nums">{(data.page - 1) * data.limit + i + 1}</td>
                      <td className="text-ink-500 whitespace-nowrap">
                        {new Date(row.submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      {fields.map(f => {
                        if (f.type === 'file') {
                          return <td key={f._id} className="min-w-[220px]"><FileCell row={row} field={f} /></td>
                        }
                        const v = cell(row.responses?.[f._id])
                        return (
                          <td key={f._id} className="max-w-[220px]">
                            <span className="block truncate" title={v}>{v || <span className="text-ink-300">—</span>}</span>
                          </td>
                        )
                      })}
                      <td>
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => setEditRow(row)} title="Edit response"
                            className="icon-btn hover:!bg-brand-50 hover:!text-brand-700"><IconEdit /></button>
                          <button onClick={() => handleDelete(row)} title="Delete response"
                            className="icon-btn hover:!bg-red-50 hover:!text-red-600"><IconTrash /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.total > data.limit && (
              <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3.5 border-t border-surface-200 bg-surface-50">
                <p className="text-[13px] text-ink-500">
                  Showing <span className="font-semibold text-ink-700">
                    {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)}
                  </span> of <span className="font-semibold text-ink-700">{data.total.toLocaleString('en-IN')}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary !px-3" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <IconChevronLeft /> Prev
                  </button>
                  <span className="text-[13px] text-ink-500 px-1">Page {data.page} of {totalPages}</span>
                  <button className="btn-secondary !px-3" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next <IconChevronRight />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editRow && (
        <EditResponseModal
          form={data.form}
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => setReloadKey(k => k + 1)}
        />
      )}
    </AdminLayout>
  )
}
