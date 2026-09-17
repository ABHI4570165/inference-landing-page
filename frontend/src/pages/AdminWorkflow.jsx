import { useState, useEffect, useCallback } from 'react'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { useWorkspace } from '../context/WorkspaceContext'
import { IconCheckSquare, IconCamera, IconCompass, IconClipboard } from '../components/Icons'

// ── Candidate Workflow ──────────────────────────────────────────────────────
// Which links of the journey this drive enforces:
//
//     Registration → Attendance → Reception → Counselling
//
// Each toggle is one ARROW, not a stage: turning one off does not remove the
// step, it stops the step being a PREREQUISITE for what follows. Registration
// has no toggle because it is not optional — a candidate with no application
// record cannot be found by any later step.
//
// The same settings drive the public gates and the progress chain on the
// Applications list, so what an admin sees here is exactly what a candidate
// experiences.

const STAGES = [
  { key: 'registration', label: 'Registration', icon: IconClipboard,
    detail: 'The candidate applies through a form. Always required.' },
  { key: 'attendance', label: 'Attendance', icon: IconCheckSquare,
    detail: 'Marked Present for the drive.' },
  { key: 'reception', label: 'Reception', icon: IconCamera,
    detail: 'Checked in at the desk, photo captured.' },
  { key: 'counselling', label: 'Counselling', icon: IconCompass,
    detail: 'Fills the counselling questionnaire.' }
]

const LINKS = [
  {
    key: 'attendanceForReception',
    title: 'Attendance before Reception',
    on: 'A candidate must be marked Present before they can complete Reception Registration.',
    off: 'Anyone can complete Reception Registration, whether or not attendance was marked.'
  },
  {
    key: 'attendanceForCounselling',
    title: 'Attendance before Counselling',
    on: 'A candidate must be marked Present before the Counselling form opens.',
    off: 'The Counselling form opens without attendance being marked.'
  },
  {
    key: 'receptionForCounselling',
    title: 'Reception before Counselling',
    on: 'A candidate must finish Reception Registration before the Counselling form opens.',
    off: 'The Counselling form opens without Reception Registration.'
  }
]

const DEFAULTS = { attendanceForReception: true, attendanceForCounselling: true, receptionForCounselling: true }

export default function AdminWorkflow() {
  const { workspace } = useWorkspace()
  const [flow, setFlow] = useState(DEFAULTS)
  const [saved, setSaved] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!workspace?._id) return
    setLoading(true)
    try {
      const res = await API.get(`/api/workspaces/${workspace._id}`)
      // A workspace saved before this existed has no `workflow`; a missing key
      // means the link is enforced, matching how the server reads it.
      const w = res.data?.workflow || {}
      const next = {}
      Object.keys(DEFAULTS).forEach(k => { next[k] = w[k] !== false })
      setFlow(next)
      setSaved(next)
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the workflow settings')
    } finally {
      setLoading(false)
    }
  }, [workspace?._id])

  useEffect(() => { load() }, [load])

  const dirty = Object.keys(DEFAULTS).some(k => flow[k] !== saved[k])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await API.put(`/api/workspaces/${workspace._id}`, { workflow: flow })
      setSaved(flow)
      setMessage('Workflow updated')
      setTimeout(() => setMessage(''), 2500)
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Whether the arrow INTO a stage is currently enforced, for the diagram.
  const arrowEnforced = i => {
    if (i === 1) return true                                   // Registration → Attendance
    if (i === 2) return flow.attendanceForReception
    if (i === 3) return flow.receptionForCounselling || flow.attendanceForCounselling
    return true
  }

  return (
    <AdminLayout
      title="Candidate Workflow"
      subtitle="Decide which steps this drive enforces before a candidate can move on."
    >
      {loading ? (
        <div className="flex justify-center py-24"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-5 max-w-3xl">
          {/* The chain, as it currently stands */}
          <div className="panel">
            <div className="panel-head">
              <p className="text-[13.5px] font-bold text-ink-800">This drive&rsquo;s journey</p>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-stretch gap-2">
                {STAGES.map((s, i) => (
                  <div key={s.key} className="flex items-stretch gap-2">
                    {i > 0 && (
                      <div className="flex items-center px-0.5" aria-hidden="true">
                        <span className={`text-lg leading-none ${arrowEnforced(i) ? 'text-brand-500' : 'text-surface-300'}`}>
                          →
                        </span>
                      </div>
                    )}
                    <div className={`rounded-xl border px-3.5 py-3 min-w-[132px] ${
                      i === 0 ? 'border-surface-300 bg-surface-100' : 'border-surface-200 bg-white'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <s.icon size={15} className="text-ink-400" />
                        <span className="text-[13px] font-semibold text-ink-800">{s.label}</span>
                      </div>
                      <p className="text-[11.5px] text-ink-400 leading-snug">{s.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-ink-400 mt-4">
                A faded arrow means that step is no longer a prerequisite — candidates can reach the
                next one without it. The step itself still exists and can still be completed.
              </p>
            </div>
          </div>

          {/* The toggles */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="text-[13.5px] font-bold text-ink-800">Required steps</p>
                <p className="text-[12px] text-ink-400 mt-0.5">Applies to {workspace?.companyName || 'this workspace'} only.</p>
              </div>
            </div>
            <ul className="divide-y divide-surface-200">
              {LINKS.map(link => (
                <li key={link.key}>
                  <label className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-surface-50 transition-colors">
                    <input
                      type="checkbox"
                      className="mt-0.5 flex-shrink-0"
                      checked={flow[link.key]}
                      onChange={e => setFlow(f => ({ ...f, [link.key]: e.target.checked }))}
                    />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-ink-800">{link.title}</span>
                      <span className="block text-[12.5px] text-ink-500 mt-0.5 leading-relaxed">
                        {flow[link.key] ? link.on : link.off}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3.5 border-t border-surface-200 bg-surface-50 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12.5px] text-ink-500">
                {dirty ? 'Unsaved changes' : 'All changes saved'}
                {message && <span className="text-emerald-700 font-medium ml-2">{message}</span>}
              </p>
              <button className="btn-primary text-sm" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? <><Spinner /> Saving…</> : 'Save Workflow'}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[13px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="rounded-lg bg-brand-50 border border-brand-100 px-4 py-3">
            <p className="text-[12.5px] text-brand-900 leading-relaxed">
              <strong>Registration cannot be turned off.</strong> Every later step looks the candidate
              up by their application record, so without one there is nobody to mark Present, receive
              at the desk, or counsel. Turning a link off changes only what is <em>required</em> —
              it never deletes a step or any data already recorded against it.
            </p>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
