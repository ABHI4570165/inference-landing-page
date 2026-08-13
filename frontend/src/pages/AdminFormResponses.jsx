import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { ADMIN_FORMS, ADMIN_DASHBOARD } from '../utils/routes'
import { IconChevronLeft, IconChevronRight, IconDownload, IconInbox } from '../components/Icons'

// An uploaded file renders as its filename; everything else as text.
const isFile = v => v && typeof v === 'object' && !Array.isArray(v) && v.url
const cell = v => isFile(v) ? (v.originalName || 'Uploaded file')
  : Array.isArray(v) ? v.join(', ') : (v ?? '')

export default function AdminFormResponses() {
  const { formId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

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
  }, [formId, page])

  function handleExport() {
    const fields = data.form.fields || []
    const headers = ['#', 'Submitted At', ...fields.map(f => f.label)]
    const body = data.rows.map((row, i) => [
      i + 1,
      new Date(row.submittedAt).toLocaleString('en-IN'),
      ...fields.map(f => cell(row.responses?.[f._id]))
    ])
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [headers, ...body].map(r => r.map(escape).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.form.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_responses.csv`
    a.click()
    URL.revokeObjectURL(url)
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
                        const v = cell(row.responses?.[f._id])
                        return (
                          <td key={f._id} className="max-w-[220px]">
                            <span className="block truncate" title={v}>{v || <span className="text-ink-300">—</span>}</span>
                          </td>
                        )
                      })}
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
    </AdminLayout>
  )
}
