// Submission logging + error reporting shared by both application forms.
// Vite sets import.meta.env.DEV at build time: local dev gets full diagnostics,
// production builds log a compact line and show clean user-facing messages.
const DEV = import.meta.env.DEV

// Log what is about to be submitted. Aadhar is masked to its last 4 digits
// and full form values are only printed in development.
export function logSubmissionAttempt(formName, form) {
  const { resume, aadhar, ...values } = form
  const fileInfo = resume
    ? { name: resume.name, sizeKB: +(resume.size / 1024).toFixed(1), type: resume.type }
    : null

  if (DEV) {
    console.groupCollapsed(`[${formName}] Submitting application`)
    console.log('Form values:', {
      ...values,
      aadhar: aadhar ? `********${aadhar.slice(-4)}` : ''
    })
    console.log('Resume file:', fileInfo)
    console.groupEnd()
  } else {
    console.info(`[${formName}] Submitting application`, fileInfo ? { resume: fileInfo.name, sizeKB: fileInfo.sizeKB } : {})
  }
}

// Log full error diagnostics and return the message to show the applicant.
export function parseSubmitError(err, formName) {
  const status = err.response?.status ?? null
  const data   = err.response?.data ?? null

  // ── Console diagnostics ──
  if (DEV) {
    console.group(`[${formName}] Submission failed`)
    console.error('Full error object:', err)
    console.error('Error message:', err.message)
    console.error('HTTP status:', status ?? 'no response (network error)')
    console.error('Backend response data:', data)
    if (!err.response) {
      console.error('Network error details:', { code: err.code, browserOnline: navigator.onLine })
    }
    console.groupEnd()
  } else {
    // Compact production log — still visible in remote-debug sessions on mobile
    console.error(`[${formName}] Submission failed`, {
      status,
      code: err.code,
      message: data?.message || err.message
    })
  }

  // ── User-facing message ──
  // Request never reached the server (offline, DNS, CORS, server down)
  if (!err.response) {
    return 'Network error. Please check your internet connection.'
  }

  // Structured validation errors from the backend (array or keyed object)
  if (data?.errors) {
    const list = Array.isArray(data.errors) ? data.errors : Object.values(data.errors)
    const readable = list
      .map(e => (typeof e === 'string' ? e : e?.message))
      .filter(Boolean)
    if (readable.length) return readable.join(' • ')
  }

  // Backend message — covers duplicate Aadhar/email, missing fields,
  // resume upload errors, and rate-limit responses
  if (data?.message) return data.message

  if (status === 413) {
    return 'Your resume file is too large. Please upload a smaller file.'
  }

  return `Something went wrong on our side (error ${status}). Please try again in a moment.`
}
