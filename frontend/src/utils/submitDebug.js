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
// `resumeFile` (optional) is the picked resume File — included in the
// temporary on-screen diagnostics for failures that never reach the server.
export function parseSubmitError(err, formName, resumeFile = null) {
  const status = err.response?.status ?? null
  const data   = err.response?.data ?? null
  const requestUrl = [err.config?.baseURL, err.config?.url].filter(Boolean).join('')

  // ── Console diagnostics ──
  if (DEV) {
    console.group(`[${formName}] Submission failed`)
    console.error('Full error object:', err)
    console.error('Error message:', err.message)
    console.error('HTTP status:', status ?? 'no response (network error)')
    console.error('Backend response data:', data)
    console.error('Request URL:', requestUrl)
    if (!err.response) {
      console.error('Network error details:', { code: err.code, browserOnline: navigator.onLine })
    }
    console.groupEnd()
  } else {
    // Compact production log — still visible in remote-debug sessions on mobile
    console.error(`[${formName}] Submission failed`, {
      status,
      code: err.code,
      message: data?.message || err.message,
      url: requestUrl,
      online: navigator.onLine,
      userAgent: navigator.userAgent,
      fileName: resumeFile?.name,
      fileSize: resumeFile?.size,
      fileType: resumeFile?.type
    })
  }

  // ── TEMPORARY on-screen diagnostics ──
  // Shown only when the request never reached the server, so an affected
  // applicant can send a screenshot. Remove once the Android issue is closed.
  const diagnostics = () =>
    ' — Diagnostic info (please screenshot this): ' +
    `error: ${err.message} • code: ${err.code || 'n/a'} • online: ${navigator.onLine} • ` +
    `file: ${resumeFile?.name || 'none'} (${resumeFile?.size ?? 0} bytes, ${resumeFile?.type || 'unknown type'}) • ` +
    `device: ${navigator.userAgent}`

  // ── User-facing message ──
  // Upload exceeded the client timeout — slow connection, not a server fault
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return 'The upload is taking too long — your connection may be slow. Please move to a stronger network or Wi-Fi and try again.' + diagnostics()
  }

  // Request never reached the server (offline, DNS, CORS, server down, or the
  // browser aborted the upload because the picked file became unreadable —
  // net::ERR_UPLOAD_FILE_CHANGED on Android content:// files)
  if (!err.response) {
    return 'Network error. Please check your internet connection, or re-select your resume file and try again.' + diagnostics()
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
