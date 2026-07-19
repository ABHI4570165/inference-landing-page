import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import API from '../utils/api'
import Spinner from '../components/Spinner'

// Public counselling assessment form (opened from the QR code).
// Flow: verify identity → attendance check → section-wise questionnaire with
// autosave + resume → submit. No login; a short-lived token from /verify
// authorises the form APIs.
const TOKEN_KEY = 'counselling_token'
const OTHER = '__other__'

const authHeaders = token => ({ headers: { Authorization: `Bearer ${token}` } })

export default function CounsellingForm() {
  const [stage, setStage] = useState('verify') // verify | form | done
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [studentInfo, setStudentInfo] = useState(null)

  // ── verify step state ──
  const [verify, setVerify] = useState({ name: '', email: '', phone: '' })
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState(null) // { code, message }

  // ── form state ──
  const [form, setForm] = useState(null) // { sections, totalQuestions }
  const [answers, setAnswers] = useState({}) // { code: { selected: [], otherText: '' } }
  const [openSections, setOpenSections] = useState({})
  const [loadingForm, setLoadingForm] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [missing, setMissing] = useState([]) // codes failing validation
  const dirtyRef = useRef(false)
  const answersRef = useRef(answers)
  answersRef.current = answers

  // ── helpers ──
  const requiredCodes = useMemo(() => {
    if (!form) return []
    return form.sections.flatMap(s => s.questions.filter(q => q.required).map(q => q.code))
  }, [form])

  const isAnswered = useCallback(a => a && (a.selected?.length > 0 || (a.otherText || '').trim().length > 0), [])

  const answeredRequired = useMemo(
    () => requiredCodes.filter(c => isAnswered(answers[c])).length,
    [requiredCodes, answers, isAnswered]
  )
  const progress = requiredCodes.length
    ? Math.round((answeredRequired / requiredCodes.length) * 100)
    : 0

  const serializeAnswers = useCallback(() => (
    Object.entries(answersRef.current)
      .filter(([, a]) => a.selected?.length > 0 || (a.otherText || '').trim())
      .map(([code, a]) => ({ code, selected: a.selected || [], otherText: a.otherText || '' }))
  ), [])

  // ── load form + saved draft once we have a token ──
  const loadForm = useCallback(async (tok) => {
    setLoadingForm(true)
    try {
      const [formRes, sessionRes] = await Promise.all([
        API.get('/api/counselling/form', authHeaders(tok)),
        API.get('/api/counselling/session', authHeaders(tok))
      ])
      setForm(formRes.data)
      const restored = {}
      sessionRes.data.answers.forEach(a => {
        restored[a.code] = { selected: a.selected || [], otherText: a.otherText || '' }
      })
      setAnswers(restored)
      setLastSavedAt(sessionRes.data.lastSavedAt)
      // open the first section by default
      const open = {}
      formRes.data.sections.forEach((s, i) => { open[s.key] = i === 0 })
      setOpenSections(open)
      setStage('form')
    } catch (err) {
      // expired / invalid token → back to verify (saved answers are on the server)
      sessionStorage.removeItem(TOKEN_KEY)
      setToken('')
      setStage('verify')
      if (err.response?.status !== 401) {
        setVerifyError({ message: err.response?.data?.message || 'Could not load the form. Please try again.' })
      }
    } finally {
      setLoadingForm(false)
    }
  }, [])

  useEffect(() => {
    if (token && stage === 'verify') loadForm(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── autosave every 5 seconds while there are unsaved changes ──
  useEffect(() => {
    if (stage !== 'form' || !token) return
    const id = setInterval(async () => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      setSaveState('saving')
      try {
        const res = await API.put('/api/counselling/autosave', { answers: serializeAnswers() }, authHeaders(token))
        setSaveState('saved')
        setLastSavedAt(res.data.savedAt)
      } catch (err) {
        setSaveState('error')
        dirtyRef.current = true
        if (err.response?.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY)
          setToken('')
          setStage('verify')
          setVerifyError({ message: 'Your session expired. Please verify again — your answers are saved.' })
        }
      }
    }, 5000)
    return () => clearInterval(id)
  }, [stage, token, serializeAnswers])

  // ── warn before leaving with unsaved changes ──
  useEffect(() => {
    const warn = e => {
      if (dirtyRef.current && stage === 'form') { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [stage])

  // ── verify submit ──
  async function handleVerify(e) {
    e.preventDefault()
    setVerifying(true)
    setVerifyError(null)
    try {
      const res = await API.post('/api/counselling/verify', verify)
      sessionStorage.setItem(TOKEN_KEY, res.data.token)
      setToken(res.data.token)
      setStudentInfo(res.data.student)
      await loadForm(res.data.token)
    } catch (err) {
      setVerifyError(err.response?.data || { message: 'Something went wrong. Please try again.' })
    } finally {
      setVerifying(false)
    }
  }

  // ── answer updates ──
  function setAnswer(code, updater) {
    setAnswers(prev => {
      const cur = prev[code] || { selected: [], otherText: '' }
      const next = { ...prev, [code]: updater(cur) }
      return next
    })
    dirtyRef.current = true
    setSaveState('idle')
    setMissing(m => m.filter(c => c !== code))
  }

  function pickRadio(code, label) {
    setAnswer(code, cur => ({
      ...cur,
      selected: [label],
      otherText: label === OTHER ? cur.otherText : ''
    }))
  }
  function toggleCheckbox(code, label) {
    setAnswer(code, cur => {
      const has = cur.selected.includes(label)
      const selected = has ? cur.selected.filter(s => s !== label) : [...cur.selected, label]
      return { ...cur, selected, otherText: selected.includes(OTHER) ? cur.otherText : (label === OTHER && has ? '' : cur.otherText) }
    })
  }

  // ── submit ──
  async function handleSubmit() {
    const missingCodes = requiredCodes.filter(c => !isAnswered(answers[c]))
    if (missingCodes.length > 0) {
      setMissing(missingCodes)
      // open the section containing the first missing question and scroll to it
      const first = missingCodes[0]
      const section = form.sections.find(s => s.questions.some(q => q.code === first))
      if (section) setOpenSections(o => ({ ...o, [section.key]: true }))
      setSubmitError(`Please answer the ${missingCodes.length} highlighted question${missingCodes.length > 1 ? 's' : ''} before submitting.`)
      setTimeout(() => {
        document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await API.post('/api/counselling/submit', { answers: serializeAnswers() }, authHeaders(token))
      dirtyRef.current = false
      sessionStorage.removeItem(TOKEN_KEY)
      setStage('done')
      window.scrollTo({ top: 0 })
    } catch (err) {
      const data = err.response?.data
      setSubmitError(data?.message || 'Submission failed. Please try again.')
      if (data?.missing) setMissing(data.missing)
    } finally {
      setSubmitting(false)
    }
  }

  // ═══════════════ RENDER ═══════════════

  if (stage === 'done') {
    return (
      <Shell>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-heading text-2xl font-bold text-gray-800">Thank you!</h2>
          <p className="text-gray-500 mt-2 px-6">
            Your counselling assessment has been submitted successfully. Our team will review your
            profile and guide you during your counselling session.
          </p>
        </div>
      </Shell>
    )
  }

  if (stage === 'verify') {
    return (
      <Shell>
        <div className="max-w-md mx-auto">
          <div className="card">
            <h2 className="font-heading text-xl font-bold text-gray-800 mb-1">Verify your details</h2>
            <p className="text-sm text-gray-500 mb-5">
              Enter the same details you used during registration. If you were marked present in any attendance session,
              you can continue with the counselling form.
            </p>

            {verifyError && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
                verifyError.code === 'NOT_PRESENT' || verifyError.code === 'ALREADY_SUBMITTED'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {verifyError.message}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="form-label">Full Name <span className="text-red-500">*</span></label>
                <input className="form-input" required minLength={2} maxLength={100}
                  value={verify.name} onChange={e => setVerify(v => ({ ...v, name: e.target.value }))}
                  placeholder="Your full name" autoComplete="name" />
              </div>
              <div>
                <label className="form-label">Email <span className="text-red-500">*</span></label>
                <input className="form-input" type="email" required
                  value={verify.email} onChange={e => setVerify(v => ({ ...v, email: e.target.value }))}
                  placeholder="you@example.com" autoComplete="email" />
              </div>
              <div>
                <label className="form-label">Mobile Number <span className="text-red-500">*</span></label>
                <input className="form-input" type="tel" required inputMode="numeric"
                  value={verify.phone} onChange={e => setVerify(v => ({ ...v, phone: e.target.value.replace(/[^\d+ ]/g, '') }))}
                  placeholder="10-digit mobile number" autoComplete="tel" />
              </div>
              <button className="btn-primary w-full" disabled={verifying}>
                {verifying ? <><Spinner /> Verifying…</> : 'Continue'}
              </button>
            </form>
          </div>
        </div>
      </Shell>
    )
  }

  // stage === 'form'
  if (loadingForm || !form) {
    return (
      <Shell>
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="card">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
              <div className="h-3 bg-gray-100 rounded w-full mb-2" />
              <div className="h-3 bg-gray-100 rounded w-5/6" />
            </div>
          ))}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      {/* sticky progress header */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-gray-200 mb-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-gray-700">
              {studentInfo?.name ? `Hi ${studentInfo.name.split(' ')[0]} — ` : ''}
              {answeredRequired} of {requiredCodes.length} answered
            </span>
            <span className="flex items-center gap-2">
              <SaveBadge state={saveState} lastSavedAt={lastSavedAt} />
              <span className="font-bold text-brand-700">{progress}%</span>
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {form.sections.map(section => {
          const answered = section.questions.filter(q => isAnswered(answers[q.code])).length
          const open = !!openSections[section.key]
          return (
            <div key={section.key} className="card !p-0 overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenSections(o => ({ ...o, [section.key]: !o[section.key] }))}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition"
              >
                <div>
                  <h3 className="font-heading font-bold text-gray-800">
                    <span className="text-brand-600 mr-2">Section {section.key}</span>{section.title}
                  </h3>
                  {section.note && <p className="text-xs text-gray-400 mt-0.5">{section.note}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    answered === section.questions.length
                      ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {answered}/{section.questions.length}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {open && (
                <div className="px-5 pb-5 space-y-6 border-t border-gray-100 pt-4">
                  {section.questions.map(q => (
                    <Question
                      key={q.code} q={q}
                      answer={answers[q.code] || { selected: [], otherText: '' }}
                      invalid={missing.includes(q.code)}
                      onRadio={label => pickRadio(q.code, label)}
                      onCheckbox={label => toggleCheckbox(q.code, label)}
                      onText={text => setAnswer(q.code, cur => ({ ...cur, otherText: text }))}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {submitError && (
          <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {submitError}
          </div>
        )}

        <button className="btn-primary w-full !py-3.5 text-base" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <><Spinner /> Submitting…</> : `Submit Assessment${progress < 100 ? ` (${progress}% complete)` : ''}`}
        </button>
        <p className="text-center text-xs text-gray-400 pb-8">
          Your answers are saved automatically every few seconds — you can safely resume later on this device.
        </p>
      </div>
    </Shell>
  )
}

// ── single question ──────────────────────────────────────────────────────────
function Question({ q, answer, invalid, onRadio, onCheckbox, onText }) {
  const otherSelected = answer.selected.includes(OTHER)
  return (
    <div id={`q-${q.code}`} className={`rounded-xl transition ${invalid ? 'ring-2 ring-red-300 bg-red-50/40 p-3 -m-3' : ''}`}>
      <p className="text-sm font-medium text-gray-800 mb-2.5">
        <span className="text-gray-400 mr-1.5">{q.code}.</span>{q.text}
        {q.required && <span className="text-red-400 ml-1">*</span>}
      </p>

      {(q.type === 'radio' || q.type === 'checkbox') && (
        <div className="space-y-2">
          {q.options.map(label => {
            const checked = answer.selected.includes(label)
            return (
              <label key={label} className={`flex items-start gap-3 px-3.5 py-2.5 rounded-lg border cursor-pointer transition text-sm ${
                checked ? 'border-brand-500 bg-brand-50 text-gray-800' : 'border-gray-200 hover:border-brand-300 text-gray-600'
              }`}>
                <input
                  type={q.type} name={q.code} checked={checked}
                  onChange={() => (q.type === 'radio' ? onRadio(label) : onCheckbox(label))}
                  className="mt-0.5 accent-green-700"
                />
                <span>{label}</span>
              </label>
            )
          })}
          {q.allowOther && (
            <label className={`flex items-start gap-3 px-3.5 py-2.5 rounded-lg border cursor-pointer transition text-sm ${
              otherSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300 text-gray-600'
            }`}>
              <input
                type={q.type} name={q.code} checked={otherSelected}
                onChange={() => (q.type === 'radio' ? onRadio(OTHER) : onCheckbox(OTHER))}
                className="mt-0.5 accent-green-700"
              />
              <span className="flex-1">
                Other (please type your answer)
                {otherSelected && (
                  <input
                    className="form-input mt-2"
                    placeholder="Type your answer…"
                    value={answer.otherText}
                    maxLength={2000}
                    onClick={e => e.preventDefault()}
                    onChange={e => onText(e.target.value)}
                  />
                )}
              </span>
            </label>
          )}
        </div>
      )}

      {q.type === 'text' && (
        <input className="form-input" placeholder="Your answer…" maxLength={2000}
          value={answer.otherText} onChange={e => onText(e.target.value)} />
      )}
      {q.type === 'textarea' && (
        <textarea className="form-input min-h-[90px]" placeholder="Your answer…" maxLength={2000}
          value={answer.otherText} onChange={e => onText(e.target.value)} />
      )}

      {invalid && <p className="text-xs text-red-500 mt-1.5">This question is required</p>}
    </div>
  )
}

// ── autosave indicator ───────────────────────────────────────────────────────
function SaveBadge({ state, lastSavedAt }) {
  if (state === 'saving') return <span className="text-gray-400">Saving…</span>
  if (state === 'error') return <span className="text-red-500">Save failed — retrying</span>
  if (state === 'saved' || lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-green-600">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Saved
      </span>
    )
  }
  return null
}

// ── page shell ───────────────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-800 text-white">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-3">
          <img src="/mandi-logo.png" alt="M H Foundation" className="w-10 h-10 object-contain bg-white rounded-full p-0.5 flex-shrink-0" />
          <div>
            <h1 className="font-heading font-bold text-lg leading-tight">Student Counselling Assessment</h1>
            <p className="text-brand-200 text-xs">M H Foundation — Career Counselling</p>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
