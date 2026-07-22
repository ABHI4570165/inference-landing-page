import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ADMIN_COUNSELLING_RESPONSES } from '../utils/routes'
import API from '../utils/api'
import AdminLayout from '../components/AdminLayout'
import Spinner from '../components/Spinner'
import { Meter } from '../components/Charts'

// The calendar day (IST) a response was actually filled — distinct from
// attendanceDate, which is the attendance SESSION it's tied to and can be an
// older date if the student's last "Present" mark wasn't from today.
function istDate(dateInput) {
  if (!dateInput) return '—'
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(dateInput))
}

const BEHAVIOUR_LABELS = {
  learningStyle: 'Learning Style', problemSolving: 'Problem Solving',
  decisionMaking: 'Decision Making', confidence: 'Confidence',
  riskTaking: 'Risk Taking', leadership: 'Leadership',
  teamWork: 'Team Work', communication: 'Communication', adaptability: 'Adaptability'
}

export default function AdminCounsellingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null) // { response, report, attendance }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // 'unlock' | 'regenerate' | 'delete'
  const [message, setMessage] = useState(null)
  const [editingOpinion, setEditingOpinion] = useState(false)
  const [opinionDraft, setOpinionDraft] = useState('')
  const [savingOpinion, setSavingOpinion] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)

  useEffect(() => {
    if (!photoOpen) return
    const onKey = e => { if (e.key === 'Escape') setPhotoOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photoOpen])

  const load = useCallback(async () => {
    try {
      const res = await API.get(`/api/admin/counselling/responses/${id}`)
      setData(res.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load response')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function handleUnlock() {
    if (!window.confirm('Unlock this submission so the student can revise and resubmit?')) return
    setBusy('unlock')
    try {
      const res = await API.post(`/api/admin/counselling/responses/${id}/unlock`)
      setMessage({ type: 'success', text: res.data.message })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Unlock failed' })
    } finally {
      setBusy(null)
    }
  }

  async function handleRegenerate() {
    setBusy('regenerate')
    setMessage({ type: 'info', text: 'Generating AI report — this can take a minute…' })
    try {
      const res = await API.post(`/api/admin/counselling/responses/${id}/regenerate`)
      setMessage({
        type: res.data.report?.status === 'completed' ? 'success' : 'error',
        text: res.data.report?.status === 'completed' ? 'AI report generated' : (res.data.report?.error || 'Report generation failed')
      })
      await load()
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Report generation failed' })
    } finally {
      setBusy(null)
    }
  }

  function startEditOpinion() {
    setOpinionDraft(data.response.gdCounsellorOpinion?.text || '')
    setEditingOpinion(true)
  }

  async function handleSaveOpinion() {
    setSavingOpinion(true)
    try {
      const res = await API.put(`/api/admin/counselling/responses/${id}/gd-opinion`, { text: opinionDraft })
      setData(d => ({ ...d, response: { ...d.response, gdCounsellorOpinion: res.data.gdCounsellorOpinion } }))
      setEditingOpinion(false)
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to save counsellor opinion' })
    } finally {
      setSavingOpinion(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this counselling response? The student will be able to fill the form again from scratch. This cannot be undone.')) return
    setBusy('delete')
    try {
      await API.delete(`/api/admin/counselling/responses/${id}`)
      navigate(ADMIN_COUNSELLING_RESPONSES)
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Delete failed' })
      setBusy(null)
    }
  }

  if (loading) {
    return <AdminLayout><div className="card flex justify-center py-20 text-gray-400 gap-2"><Spinner /> Loading profile…</div></AdminLayout>
  }
  if (error || !data) {
    return <AdminLayout><div className="card text-center py-16 text-red-600">{error || 'Not found'}</div></AdminLayout>
  }

  const { response: r, report, attendance } = data
  const scores = report?.scores

  // group answers by section
  const sections = []
  const byKey = new Map()
  for (const a of r.answers) {
    if (!byKey.has(a.sectionKey)) {
      const s = { key: a.sectionKey, answers: [] }
      byKey.set(a.sectionKey, s)
      sections.push(s)
    }
    byKey.get(a.sectionKey).answers.push(a)
  }

  return (
    <AdminLayout>
      {/* hide admin chrome when printing */}
      <style>{`@media print { header, .print-hide { display: none !important } main { max-width: 100% !important } .card { box-shadow: none !important; border: 1px solid #ddd !important; break-inside: avoid } }`}</style>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5 print-hide">
        <div>
          <Link to={ADMIN_COUNSELLING_RESPONSES} className="text-sm text-brand-600 hover:underline">← Back to responses</Link>
          <h2 className="font-heading text-2xl font-bold text-gray-800 mt-1">{r.name}</h2>
          <p className="text-gray-500 text-sm">{r.college}{r.branch ? ` • ${r.branch}` : ''} • Filled {istDate(r.submittedAt || r.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.status === 'submitted' && (
            <button className="btn-secondary text-sm" onClick={handleUnlock} disabled={!!busy}>
              {busy === 'unlock' ? 'Unlocking…' : '🔓 Unlock Resubmission'}
            </button>
          )}
          <button className="btn-secondary text-sm" onClick={handleRegenerate} disabled={!!busy || r.status !== 'submitted'}>
            {busy === 'regenerate' ? <><Spinner /> Generating…</> : (report?.status === 'completed' ? '↻ Regenerate AI Report' : '⚡ Generate AI Report')}
          </button>
          <button className="btn-primary text-sm" onClick={() => window.print()}>🖨 Print / PDF</button>
          <button className="btn-danger text-sm" onClick={handleDelete} disabled={!!busy}>
            {busy === 'delete' ? 'Deleting…' : '🗑 Delete Response'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border print-hide ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200'
          : message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>{message.text}</div>
      )}

      {report?.status === 'completed' && (
        <div className="mb-4 flex flex-wrap items-center gap-3 print-hide">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            AI Report
          </span>
          {report.reportSource && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              report.reportSource === 'Gemini' ? 'bg-blue-100 text-blue-700'
              : report.reportSource === 'Ollama' ? 'bg-purple-100 text-purple-700'
              : 'bg-amber-100 text-amber-700'
            }`}>
              {report.reportSource === 'Ollama' ? `Ollama (${report.aiModel})` : report.reportSource}
            </span>
          )}
          {report.fallbackReason && (
            <span className="text-xs text-gray-500" title={report.fallbackReason}>ⓘ {report.fallbackReason}</span>
          )}
        </div>
      )}

      {/* ── basic details ── */}
      <div className="card mb-5">
        <h3 className="font-heading font-bold text-gray-800 mb-3">Basic Details</h3>
        <div className="flex flex-col sm:flex-row gap-5">
          {r.student?.registrationPhoto ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="flex-shrink-0 w-28 h-28 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden group relative print-hide"
              title="Click to enlarge"
            >
              <img src={r.student.registrationPhoto} alt={`${r.name} — registration photo`}
                className="w-full h-full object-contain" />
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 transition text-white text-xs font-semibold">Enlarge</span>
              </span>
            </button>
          ) : (
            <div className="flex-shrink-0 w-28 h-28 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1 print-hide">
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-[10px] text-gray-400 text-center px-2">No photo on file</span>
            </div>
          )}
          {/* print-only static photo (the enlarge button/overlay above is screen-only) */}
          {r.student?.registrationPhoto && (
            <img src={r.student.registrationPhoto} alt={`${r.name} — registration photo`}
              className="hidden print:block flex-shrink-0 w-28 h-28 rounded-xl border border-gray-200 object-contain" />
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm flex-1">
          <Info label="Name" value={r.name} />
          <Info label="Email" value={r.email} />
          <Info label="Phone" value={r.phone} />
          <Info label="College" value={r.college} />
          <Info label="Branch" value={r.branch || '—'} />
          <Info label="Filled On" value={istDate(r.submittedAt || r.createdAt)} />
          <Info label="Attendance Session" value={r.attendanceDate} />
          <Info label="Status" value={r.status === 'submitted' ? `Submitted ${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}` : 'In progress'} />
          <Info label="Questionnaire Score" value={`${r.totalScore} / ${r.maxScore} (${r.completionPercent}% complete)`} />
          </div>
        </div>
        {r.unlockedAt && (
          <p className="text-xs text-amber-600 mt-3">Unlocked for resubmission by {r.unlockedBy} on {new Date(r.unlockedAt).toLocaleString()}</p>
        )}
      </div>

      {/* ── attendance timeline ── */}
      <div className="card mb-5">
        <h3 className="font-heading font-bold text-gray-800 mb-3">Recent Attendance</h3>
        {attendance.length === 0 ? (
          <p className="text-sm text-gray-400">No attendance records</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {attendance.map(a => (
              <span key={a.date} title={`${a.date}: ${a.status}`}
                className={`text-[11px] font-medium px-2 py-1 rounded-md ${
                  a.status === 'Present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>
                {a.date.slice(5)} {a.status === 'Present' ? '✓' : '✗'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── AI scores ── */}
      {scores && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-gray-800">AI Scores</h3>
            {report?.generatedAt && <span className="text-xs text-gray-400">Generated {new Date(report.generatedAt).toLocaleString()}</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            <Meter label="Career Clarity" value={scores.careerClarity} />
            <Meter label="Confidence" value={scores.confidence} />
            <Meter label="Technical Readiness" value={scores.technicalReadiness} />
            <Meter label="Learning Attitude" value={scores.learningAttitude} />
            <Meter label="Placement Readiness" value={scores.placementReadiness} />
            <Meter label="Communication" value={scores.communicationReadiness} />
            <Meter label="Motivation" value={scores.motivation} />
            <Meter label="Risk Level" value={scores.riskLevel} invert />
            <Meter label="Overall Score" value={scores.overall} />
          </div>
        </div>
      )}

      {/* ── GD Counsellor Opinion — human-written, shown verbatim as part of the final report ── */}
      <div className="card mb-5 border-brand-200 bg-brand-50/40">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-bold text-gray-800">GD Counsellor Opinion</h3>
          {!editingOpinion && (
            <button className="btn-secondary text-xs !px-3 !py-1.5 print-hide" onClick={startEditOpinion}>
              {r.gdCounsellorOpinion?.text ? 'Edit' : '+ Add Opinion'}
            </button>
          )}
        </div>

        {editingOpinion ? (
          <div className="print-hide">
            <textarea
              className="form-input min-h-[120px]"
              placeholder="Type the GD counsellor's opinion from meeting this student in person…"
              maxLength={5000}
              value={opinionDraft}
              onChange={e => setOpinionDraft(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button className="btn-secondary text-sm" onClick={() => setEditingOpinion(false)} disabled={savingOpinion}>Cancel</button>
              <button className="btn-primary text-sm" onClick={handleSaveOpinion} disabled={savingOpinion}>
                {savingOpinion ? <><Spinner /> Saving…</> : 'Save Opinion'}
              </button>
            </div>
          </div>
        ) : r.gdCounsellorOpinion?.text ? (
          <>
            <p className="text-sm leading-relaxed whitespace-pre-line text-gray-800">{r.gdCounsellorOpinion.text}</p>
            {r.gdCounsellorOpinion.addedAt && (
              <p className="text-xs text-gray-400 mt-2 print-hide">
                — {r.gdCounsellorOpinion.addedBy || 'admin'}, {new Date(r.gdCounsellorOpinion.addedAt).toLocaleString()}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">No counsellor opinion added yet.</p>
        )}
      </div>

      {/* ── AI report ── */}
      {report?.status === 'completed' ? (
        <div className="space-y-5 mb-5">
          <ReportSection title="Counsellor Recommendation" highlight>
            <p className="text-sm leading-relaxed whitespace-pre-line">{report.counsellorRecommendation}</p>
          </ReportSection>

          <ReportSection title="Overall Personality">
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{report.overallPersonality}</p>
          </ReportSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ReportSection title="Technical Interest">
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{report.technicalInterest}</p>
            </ReportSection>
            <ReportSection title="Career Readiness">
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{report.careerReadiness}</p>
            </ReportSection>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ReportSection title="Strengths">
              <ul className="space-y-1.5">
                {report.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600"><span className="text-green-600">✓</span>{s}</li>
                ))}
              </ul>
            </ReportSection>
            <ReportSection title="Areas to Improve">
              <ul className="space-y-1.5">
                {report.weaknesses.map((w, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600"><span className="text-amber-500">▲</span>{w}</li>
                ))}
              </ul>
            </ReportSection>
          </div>

          {report.behaviourAnalysis && (
            <ReportSection title="Behaviour Analysis">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(BEHAVIOUR_LABELS).map(([k, label]) => report.behaviourAnalysis[k] && (
                  <div key={k}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{report.behaviourAnalysis[k]}</p>
                  </div>
                ))}
              </div>
            </ReportSection>
          )}

          <ReportSection title="Career Fit">
            <div className="space-y-3">
              {report.careerFit.map((c, i) => (
                <div key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.path}</p>
                    <p className="text-sm text-gray-500">{c.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </ReportSection>

          {report.trainingRecommendation && (
            <ReportSection title="Training Recommendation">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {[['courses', 'Courses'], ['skills', 'Skills'], ['certifications', 'Certifications'],
                  ['projects', 'Projects'], ['softSkills', 'Soft Skills'], ['interviewPrep', 'Interview Preparation']]
                  .map(([k, label]) => (report.trainingRecommendation[k] || []).length > 0 && (
                    <div key={k}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                      <ul className="space-y-1">
                        {report.trainingRecommendation[k].map((item, i) => (
                          <li key={i} className="text-sm text-gray-600 flex gap-2"><span className="text-brand-500">•</span>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
              {report.trainingRecommendation.timeline && (
                <p className="text-sm text-gray-600 mt-4"><span className="font-semibold">Suggested timeline:</span> {report.trainingRecommendation.timeline}</p>
              )}
            </ReportSection>
          )}
        </div>
      ) : (
        <div className="card mb-5 text-center py-10">
          {report?.status === 'failed' ? (
            <>
              <p className="text-red-600 font-medium mb-1">AI report generation failed</p>
              <p className="text-sm text-gray-500 mb-4">{report.error}</p>
            </>
          ) : report?.status === 'generating' ? (
            <p className="text-blue-600 font-medium">AI report is being generated — refresh in a moment.</p>
          ) : r.status === 'submitted' ? (
            <p className="text-gray-500">No AI report yet.</p>
          ) : (
            <p className="text-gray-500">The AI report will be generated after the student submits the form.</p>
          )}
        </div>
      )}

      {/* ── raw answers ── */}
      <div className="card mb-8">
        <h3 className="font-heading font-bold text-gray-800 mb-4">Questionnaire Answers</h3>
        {sections.length === 0 ? (
          <p className="text-sm text-gray-400">No answers saved yet.</p>
        ) : sections.map(s => (
          <div key={s.key} className="mb-5 last:mb-0">
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wide mb-2">Section {s.key}</p>
            <div className="space-y-3">
              {s.answers.map(a => (
                <div key={a.code} className="border-l-2 border-gray-100 pl-3">
                  <p className="text-sm text-gray-500"><span className="text-gray-400 mr-1">{a.code}.</span>{a.questionText}</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">
                    {a.selected.map(s => (s === '__other__' ? 'Other' : s)).join('; ') || null}
                    {a.otherText && <span className="text-gray-600">{a.selected.length ? ' — ' : ''}Other: {a.otherText}</span>}
                    <span className="text-xs text-gray-400 ml-2">[{a.points} pts]</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── enlarged photo lightbox ── */}
      {photoOpen && r.student?.registrationPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 print-hide"
          onClick={() => setPhotoOpen(false)}
        >
          <button
            type="button"
            onClick={() => setPhotoOpen(false)}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
            title="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={r.student.registrationPhoto}
            alt={`${r.name} — registration photo`}
            onClick={e => e.stopPropagation()}
            className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
          />
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 text-sm">{r.name}</p>
        </div>
      )}
    </AdminLayout>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="font-medium text-gray-800 break-words">{value}</p>
    </div>
  )
}

function ReportSection({ title, children, highlight }) {
  return (
    <div className={`card ${highlight ? 'border-brand-200 bg-brand-50/40' : ''}`}>
      <h3 className="font-heading font-bold text-gray-800 mb-3">{title}</h3>
      {children}
    </div>
  )
}
