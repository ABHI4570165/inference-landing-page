import { useState, useEffect, useRef } from 'react'
import API from '../utils/api'
import Header from '../components/Header'
import Spinner from '../components/Spinner'
import { countries, statesByCountry, getCities, branchesByCourse } from '../utils/locationData'

const COURSES = ['BE', 'MBA', 'BCOM', 'MCOM', 'Others']

const ROLE_OPTIONS = [
  'Junior Data Engineer',
  'Junior Data Scientist – Generative AI',
  'Sales Executive (Inside Sales / Junior Sales Track)'
]

const WHATSAPP_LINKS = {
  'Junior Data Engineer':                                'https://chat.whatsapp.com/EHaZJcJ4NNu5XNHlukwitp?s=sh&p=a&mlu=1',
  'Junior Data Scientist – Generative AI':               'https://chat.whatsapp.com/EHaZJcJ4NNu5XNHlukwitp?s=sh&p=a&mlu=1',
  'Sales Executive (Inside Sales / Junior Sales Track)': 'https://chat.whatsapp.com/EHaZJcJ4NNu5XNHlukwitp?s=sh&p=a&mlu=1',
  default:                                               'https://chat.whatsapp.com/EHaZJcJ4NNu5XNHlukwitp?s=sh&p=a&mlu=1'
}

// Human-readable label for each field key — used in the toast error list
const FIELD_LABELS = {
  name:         'Full Name',
  gender:       'Gender',
  email:        'Email Address',
  phone:        'Contact Number',
  aadhar:       'Aadhar Number',
  country:      'Country',
  state:        'State',
  city:         'City',
  college:      'College / University',
  course:       'Course',
  customCourse: 'Course (specify)',
  branch:       'Branch / Specialization',
  customBranch: 'Branch (specify)',
  experience:   'Work Experience',
  selectedRole: 'Role Applying For',
  resume:       'Resume',
}

const initialForm = {
  name: '', gender: '', email: '', phone: '', aadhar: '',
  country: '', state: '', city: '', address: '',
  college: '',
  course: '', customCourse: '',
  branch: '', customBranch: '',
  experience: '',
  selectedRole: '',
  resume: null
}

// ── Toast notification ─────────────────────────────────────────────────────────
function Toast({ errors, onClose }) {
  const keys = Object.keys(errors).filter(k => k !== 'submit')
  if (!keys.length) return null

  return (
    <div
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] w-[calc(100%-2rem)] max-w-md
                 bg-red-600 text-white rounded-xl shadow-2xl px-5 py-4
                 animate-[slideDown_0.3s_ease-out]"
      style={{ animation: 'slideDown 0.3s ease-out' }}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -16px); }
          to   { opacity: 1; transform: translate(-50%, 0);     }
        }
      `}</style>

      <div className="flex items-start gap-3">
        {/* Warning icon */}
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm mb-1">
            {keys.length === 1
              ? 'Please fix 1 field before submitting'
              : `Please fix ${keys.length} fields before submitting`}
          </p>
          <ul className="space-y-0.5">
            {keys.map(k => (
              <li key={k} className="text-xs text-red-100 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-red-200 flex-shrink-0" />
                {FIELD_LABELS[k] || k}: <span className="text-white">{errors[k]}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="flex-shrink-0 text-red-200 hover:text-white transition text-lg leading-none mt-0.5"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  )
}

// ── Searchable dropdown ────────────────────────────────────────────────────────
function SearchableSelect({ id, options, value, onChange, placeholder, disabled = false, error }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef()

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(opt) { onChange(opt); setQuery(opt); setOpen(false) }
  useEffect(() => { setQuery(value || '') }, [value])

  return (
    <div ref={ref} className="relative">
      <input
        id={id}
        type="text"
        className={`form-input w-full pr-8 ${error ? 'border-red-400 ring-1 ring-red-300' : ''} ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
        placeholder={disabled ? placeholder : 'Type to search…'}
        value={query}
        disabled={disabled}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
        onFocus={() => !disabled && setOpen(true)}
        autoComplete="off"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </span>
      {open && !disabled && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.length > 0
            ? filtered.map(opt => (
                <li
                  key={opt}
                  onMouseDown={() => select(opt)}
                  className={`px-4 py-2 cursor-pointer hover:bg-brand-50 hover:text-brand-700
                    ${value === opt ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
                >
                  {opt}
                </li>
              ))
            : <li className="px-4 py-3 text-gray-400">No results found</li>
          }
        </ul>
      )}
    </div>
  )
}

// ── College searchable dropdown ────────────────────────────────────────────────
function CollegeSelect({ colleges, value, onChange, error }) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef()

  const options  = colleges.map(c => c.name)
  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(opt) { onChange(opt); setQuery(opt); setOpen(false) }
  useEffect(() => { setQuery(value || '') }, [value])

  return (
    <div ref={ref} className="relative">
      <input
        id="field-college"
        type="text"
        className={`form-input w-full pr-8 ${error ? 'border-red-400 ring-1 ring-red-300' : ''}`}
        placeholder="Type to search your college…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
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
                  key={opt}
                  onMouseDown={() => select(opt)}
                  className={`px-4 py-2 cursor-pointer hover:bg-brand-50 hover:text-brand-700
                    ${value === opt ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
                >
                  {opt}
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 text-amber-800 text-xs">
            🏫 College not listed? Please contact your <strong>Placement Officer</strong> to get your college added.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Non-sticky footer ──────────────────────────────────────────────────────────
function FooterInline() {
  return (
    <footer className="bg-brand-800 text-white">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm">
          <div className="text-center sm:text-left">
            <p className="font-heading font-bold text-sm">Mandi Hariyaanna Academy</p>
            <p className="text-brand-300 text-xs mt-0.5">Empowering students since 2010</p>
          </div>
          <div className="text-brand-300 text-xs text-center">
            <p>© {new Date().getFullYear()} All rights reserved.</p>
            <p className="mt-0.5">
              For queries:{' '}
              <a href="mailto:careers@mandihariyaanna.com" className="underline hover:text-white">
                careers@mandihariyaanna.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ApplicationForm() {
  const [form, setForm]               = useState(initialForm)
  const [errors, setErrors]           = useState({})
  const [showToast, setShowToast]     = useState(false)
  const [colleges, setColleges]       = useState([])
  const [loading, setLoading]         = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [submittedRole, setSubmittedRole] = useState('')
  const fileRef    = useRef()
  const toastTimer = useRef()

  useEffect(() => {
    API.get('/api/colleges').then(r => setColleges(r.data)).catch(() => {})
  }, [])

  // Auto-dismiss toast after 6 s
  useEffect(() => {
    if (showToast) {
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setShowToast(false), 6000)
    }
    return () => clearTimeout(toastTimer.current)
  }, [showToast])

  const states   = form.country ? (statesByCountry[form.country] || ['Other']) : []
  const cities   = form.state   ? getCities(form.state) : []
  const branches = form.course && form.course !== 'Others'
    ? (branchesByCourse[form.course] || ['Others'])
    : ['Others']

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'country') { next.state = ''; next.city = '' }
      if (field === 'state')   { next.city = '' }
      if (field === 'course')  { next.branch = ''; next.customCourse = ''; next.customBranch = '' }
      if (field === 'branch')  { next.customBranch = '' }
      return next
    })
    // Clear that field's error as soon as the student fixes it
    setErrors(prev => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function validate() {
    const e = {}
    if (!form.name.trim())                          e.name         = 'Required'
    if (!form.gender)                               e.gender       = 'Required'
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.phone || !/^\d{10}$/.test(form.phone))            e.phone = 'Must be exactly 10 digits'
    if (!form.aadhar || !/^\d{12}$/.test(form.aadhar))          e.aadhar = 'Must be exactly 12 digits'
    if (!form.country)                              e.country      = 'Required'
    if (!form.state)                                e.state        = 'Required'
    if (!form.city)                                 e.city         = 'Required'
    if (!form.college)                              e.college      = 'Select your college from the list'
    if (!form.course)                               e.course       = 'Required'
    if (form.course === 'Others' && !form.customCourse.trim())   e.customCourse = 'Please specify your course'
    if (!form.branch)                               e.branch       = 'Required'
    if (form.branch === 'Others' && !form.customBranch.trim())   e.customBranch = 'Please specify your branch'
    if (!form.experience)                           e.experience   = 'Required'
    if (!form.selectedRole)                         e.selectedRole = 'Select a role'
    if (!form.resume)                               e.resume       = 'Upload your resume'
    return e
  }

  // Field order used to find the first error and scroll to it
  const FIELD_ORDER = [
    'name', 'gender', 'email', 'phone', 'aadhar', 'selectedRole',
    'country', 'state', 'city',
    'college', 'course', 'customCourse', 'branch', 'customBranch',
    'experience', 'resume'
  ]

  function scrollToFirstError(errs) {
    const firstKey = FIELD_ORDER.find(k => errs[k])
    if (!firstKey) return
    // IDs on inputs are "field-{key}" (added via id prop)
    const el = document.getElementById(`field-${firstKey}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.focus({ preventScroll: true })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()

    if (Object.keys(errs).length) {
      setErrors(errs)
      setShowToast(true)
      // Slight delay so the DOM has updated error states before scroll
      setTimeout(() => scrollToFirstError(errs), 50)
      return
    }

    setShowToast(false)
    setLoading(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (k !== 'resume' && v) fd.append(k, v)
      })
      fd.append('resume', form.resume)
      await API.post('/api/students', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSubmittedRole(form.selectedRole)
      setSubmitted(true)
    } catch (err) {
      const msg = err.response?.data?.message || 'Submission failed. Please try again.'
      setErrors({ submit: msg })
      setShowToast(true)
    } finally {
      setLoading(false)
    }
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      setErrors(prev => ({ ...prev, resume: 'Only PDF, DOC, DOCX allowed' }))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, resume: 'File must be under 2MB' }))
      return
    }
    set('resume', file)
  }

  // ── Thank You page ──────────────────────────────────────────────────────────
  if (submitted) {
    const waLink = WHATSAPP_LINKS[submittedRole] || WHATSAPP_LINKS.default
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6 pt-28 pb-10">
          <div className="card max-w-lg w-full text-center py-10 px-6 sm:px-8">
            <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-heading text-2xl font-bold text-brand-800 mb-2">Application Submitted!</h2>
            <p className="text-gray-600 mb-2">
              Thank you for applying. Our team will review your application and get in touch with you soon.
            </p>
            {submittedRole && (
              <span className="inline-block mt-1 mb-6 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
                Applied for: {submittedRole}
              </span>
            )}

            <div className="border-t border-gray-100 my-6" />

            {/* WhatsApp CTA */}
            <div className="relative bg-green-50 border-2 border-green-400 rounded-xl p-5 overflow-hidden">
              <span className="absolute top-3 right-3 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-6 h-6 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span className="font-bold text-green-800 text-base">Join Our WhatsApp Group</span>
              </div>
              <p className="text-green-700 text-sm mb-4">
                Stay updated on interview schedules &amp; next steps.<br />
                <strong>Don't miss out — join now!</strong>
              </p>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ animationDuration: '1.2s' }}
                className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 active:scale-95
                           text-white font-bold text-sm px-6 py-3 rounded-lg shadow-lg shadow-green-200
                           animate-bounce transition-all duration-150"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                👉 Join WhatsApp Group Now
              </a>
              <p className="text-green-600 text-xs mt-3 italic">Tap the button above to join instantly</p>
            </div>
          </div>
        </main>
        <FooterInline />
      </div>
    )
  }

  // Helper: red ring on errored inputs
  const inputCls = key =>
    `form-input ${errors[key] ? 'border-red-400 ring-1 ring-red-300 bg-red-50' : ''}`

  // ── Form page ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Toast — sits above everything */}
      {showToast && (
        <Toast
          errors={errors}
          onClose={() => setShowToast(false)}
        />
      )}

      <main className="flex-1 py-8 px-4 pt-28 pb-10">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="font-heading text-3xl font-bold text-gray-800">Apply Now</h2>
            <p className="text-gray-500 mt-2">Fill in the form below to submit your application</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>

            {/* ── Personal Info ── */}
            <div className="card">
              <h3 className="font-heading text-lg font-bold text-brand-800 mb-4 pb-2 border-b border-gray-100">
                Personal Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Full Name */}
                <div className="sm:col-span-2">
                  <label className="form-label" htmlFor="field-name">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="field-name"
                    type="text"
                    className={inputCls('name')}
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Enter your full name"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">⚠ {errors.name}</p>}
                </div>

                {/* Gender */}
                <div className="sm:col-span-2" id="field-gender">
                  <label className="form-label">Gender <span className="text-red-500">*</span></label>
                  <div className="flex gap-3 mt-1">
                    {['Male', 'Female', 'Other'].map(g => (
                      <label
                        key={g}
                        className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg cursor-pointer transition
                          flex-1 justify-center text-sm font-medium
                          ${form.gender === g
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : errors.gender
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <input type="radio" name="gender" value={g} checked={form.gender === g}
                          onChange={() => set('gender', g)} className="accent-brand-600" />
                        {g}
                      </label>
                    ))}
                  </div>
                  {errors.gender && <p className="text-red-500 text-xs mt-1">⚠ {errors.gender}</p>}
                </div>

                {/* Email */}
                <div>
                  <label className="form-label" htmlFor="field-email">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="field-email"
                    type="email"
                    className={inputCls('email')}
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="you@example.com"
                  />
                  {errors.email && <p className="text-red-500 text-xs mt-1">⚠ {errors.email}</p>}
                </div>

                {/* Phone */}
                <div>
                  <label className="form-label" htmlFor="field-phone">
                    Contact Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="field-phone"
                    type="tel"
                    inputMode="numeric"
                    className={inputCls('phone')}
                    value={form.phone}
                    maxLength={10}
                    onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                  />
                  <p className="text-gray-400 text-xs mt-1">{form.phone.length}/10 digits</p>
                  {errors.phone && <p className="text-red-500 text-xs mt-1">⚠ {errors.phone}</p>}
                </div>

                {/* Aadhar */}
                <div className="sm:col-span-2">
                  <label className="form-label" htmlFor="field-aadhar">
                    Aadhar Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="field-aadhar"
                    type="text"
                    inputMode="numeric"
                    className={inputCls('aadhar')}
                    value={form.aadhar}
                    maxLength={12}
                    onChange={e => set('aadhar', e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="12-digit Aadhar number"
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    {form.aadhar.length}/12 digits
                  </p>
                  {errors.aadhar && <p className="text-red-500 text-xs mt-1">⚠ {errors.aadhar}</p>}
                </div>

                {/* Role */}
                <div className="sm:col-span-2">
                  <label className="form-label" htmlFor="field-selectedRole">
                    Select Role Applying For <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    id="field-selectedRole"
                    options={ROLE_OPTIONS}
                    value={form.selectedRole}
                    onChange={v => set('selectedRole', v)}
                    placeholder="Select Role"
                    error={errors.selectedRole}
                  />
                  {errors.selectedRole && <p className="text-red-500 text-xs mt-1">⚠ {errors.selectedRole}</p>}
                </div>

              </div>
            </div>

            {/* ── Address ── */}
            <div className="card">
              <h3 className="font-heading text-lg font-bold text-brand-800 mb-4 pb-2 border-b border-gray-100">
                Address
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="form-label" htmlFor="field-country">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    id="field-country"
                    options={countries}
                    value={form.country}
                    onChange={v => set('country', v)}
                    placeholder="Select Country"
                    error={errors.country}
                  />
                  {errors.country && <p className="text-red-500 text-xs mt-1">⚠ {errors.country}</p>}
                </div>
                <div>
                  <label className="form-label" htmlFor="field-state">
                    State <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    id="field-state"
                    options={states}
                    value={form.state}
                    onChange={v => set('state', v)}
                    placeholder="Select State"
                    disabled={!form.country}
                    error={errors.state}
                  />
                  {errors.state && <p className="text-red-500 text-xs mt-1">⚠ {errors.state}</p>}
                </div>
                <div>
                  <label className="form-label" htmlFor="field-city">
                    City <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    id="field-city"
                    options={cities}
                    value={form.city}
                    onChange={v => set('city', v)}
                    placeholder="Select City"
                    disabled={!form.state}
                    error={errors.city}
                  />
                  {errors.city && <p className="text-red-500 text-xs mt-1">⚠ {errors.city}</p>}
                </div>
                <div className="sm:col-span-3">
                  <label className="form-label" htmlFor="field-address">Address (Optional)</label>
                  <input
                    id="field-address"
                    type="text"
                    className="form-input"
                    value={form.address}
                    onChange={e => set('address', e.target.value)}
                    placeholder="Street address"
                  />
                </div>
              </div>
            </div>

            {/* ── Education ── */}
            <div className="card">
              <h3 className="font-heading text-lg font-bold text-brand-800 mb-4 pb-2 border-b border-gray-100">
                Education Details
              </h3>
              <div className="space-y-4">

                <div>
                  <label className="form-label" htmlFor="field-college">
                    College / University <span className="text-red-500">*</span>
                  </label>
                  <CollegeSelect
                    colleges={colleges}
                    value={form.college}
                    onChange={v => set('college', v)}
                    error={errors.college}
                  />
                  {errors.college && <p className="text-red-500 text-xs mt-1">⚠ {errors.college}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label" htmlFor="field-course">
                      Course <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      id="field-course"
                      options={COURSES}
                      value={form.course}
                      onChange={v => set('course', v)}
                      placeholder="Select Course"
                      error={errors.course}
                    />
                    {errors.course && <p className="text-red-500 text-xs mt-1">⚠ {errors.course}</p>}
                  </div>
                  <div>
                    <label className="form-label" htmlFor="field-branch">
                      Branch / Specialization <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      id="field-branch"
                      options={branches}
                      value={form.branch}
                      onChange={v => set('branch', v)}
                      placeholder="Select Branch"
                      disabled={!form.course}
                      error={errors.branch}
                    />
                    {errors.branch && <p className="text-red-500 text-xs mt-1">⚠ {errors.branch}</p>}
                  </div>
                </div>

                {form.course === 'Others' && (
                  <div>
                    <label className="form-label" htmlFor="field-customCourse">
                      Specify Course <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="field-customCourse"
                      className={inputCls('customCourse')}
                      rows={2}
                      value={form.customCourse}
                      onChange={e => set('customCourse', e.target.value)}
                      placeholder="Enter your course name"
                    />
                    {errors.customCourse && <p className="text-red-500 text-xs mt-1">⚠ {errors.customCourse}</p>}
                  </div>
                )}

                {form.branch === 'Others' && (
                  <div>
                    <label className="form-label" htmlFor="field-customBranch">
                      Specify Branch <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="field-customBranch"
                      className={inputCls('customBranch')}
                      rows={2}
                      value={form.customBranch}
                      onChange={e => set('customBranch', e.target.value)}
                      placeholder="Enter your branch / specialization"
                    />
                    {errors.customBranch && <p className="text-red-500 text-xs mt-1">⚠ {errors.customBranch}</p>}
                  </div>
                )}

              </div>
            </div>

            {/* ── Experience & Resume ── */}
            <div className="card">
              <h3 className="font-heading text-lg font-bold text-brand-800 mb-4 pb-2 border-b border-gray-100">
                Experience & Resume
              </h3>
              <div className="space-y-4">

                {/* Experience radio */}
                <div id="field-experience">
                  <label className="form-label">Work Experience <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    {['Fresher', '0-3 Years', '3+ Years'].map(exp => (
                      <label
                        key={exp}
                        className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition
                          ${form.experience === exp
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : errors.experience
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                      >
                        <input type="radio" name="experience" value={exp}
                          checked={form.experience === exp}
                          onChange={() => set('experience', exp)}
                          className="accent-brand-600"
                        />
                        <span className="text-sm font-medium">{exp}</span>
                      </label>
                    ))}
                  </div>
                  {errors.experience && <p className="text-red-500 text-xs mt-1">⚠ {errors.experience}</p>}
                </div>

                {/* Resume upload */}
                <div>
                  <label className="form-label">Resume <span className="text-red-500">*</span></label>
                  <div
                    id="field-resume"
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition
                      ${errors.resume
                        ? 'border-red-400 bg-red-50'
                        : form.resume
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
                      }`}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={handleFile}
                    />
                    {form.resume ? (
                      <div className="flex items-center justify-center gap-2 text-brand-700">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium">{form.resume.name}</span>
                      </div>
                    ) : (
                      <div className="text-gray-500">
                        <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm">Click to upload your resume</p>
                        <p className="text-xs mt-1 text-gray-400">PDF, DOC, DOCX — Max 2MB</p>
                      </div>
                    )}
                  </div>
                  {errors.resume && <p className="text-red-500 text-xs mt-1">⚠ {errors.resume}</p>}
                </div>

              </div>
            </div>

            {/* Server / submit error */}
            {errors.submit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-base py-3.5 flex items-center justify-center gap-2"
            >
              {loading ? <><Spinner /> Submitting…</> : 'Submit Application'}
            </button>

          </form>
        </div>
      </main>

      <FooterInline />
    </div>
  )
}