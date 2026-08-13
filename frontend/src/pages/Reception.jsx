import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import API from '../utils/api'
import { PublicFooter } from '../components/PublicShell'

const BRAND = '#0F4C81'

// Compress a captured frame: max 480px wide, JPEG 60% — must stay under 300KB
function compressImage(source, maxWidth = 480, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      const ratio = Math.min(1, maxWidth / img.width)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Compression failed'))
        resolve(blob)
      }, 'image/jpeg', quality)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(source)
  })
}

const RESET_SECONDS = 5

export default function Reception() {
  // Present only on the per-workspace link (/reception/:token) — absent on
  // the original bare /reception link, which resolves to the default-intake
  // workspace on the backend instead.
  const { token } = useParams()

  // welcome → verify → capture → preview → success
  const [step, setStep] = useState('welcome')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [studentId, setStudentId] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [photoBlob, setPhotoBlob] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [countdown, setCountdown] = useState(RESET_SECONDS)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // Release the camera and any preview blob when the page unmounts
  useEffect(() => () => stopCamera(), [stopCamera])
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

  const resetAll = useCallback(() => {
    stopCamera()
    setStep('welcome')
    setName('')
    setPhone('')
    setStudentId(null)
    setStudentName('')
    setPhotoBlob(null)
    setPhotoPreview('')
    setError('')
    setBusy(false)
    setCountdown(RESET_SECONDS)
  }, [stopCamera])

  // Auto-return to the welcome screen after a successful registration
  useEffect(() => {
    if (step !== 'success') return
    setCountdown(RESET_SECONDS)
    const tick = setInterval(() => setCountdown(c => c - 1), 1000)
    const done = setTimeout(resetAll, RESET_SECONDS * 1000)
    return () => { clearInterval(tick); clearTimeout(done) }
  }, [step, resetAll])

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 } },
      audio: false
    })
    streamRef.current = stream
    setStep('capture')
    // let the <video> mount before attaching the stream
    requestAnimationFrame(() => {
      if (videoRef.current) videoRef.current.srcObject = stream
    })
  }

  async function handleVerify(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await API.post('/api/reception/verify', { name: name.trim(), phone: phone.trim(), token })
      setStudentId(res.data.id)
      setStudentName(res.data.name)
      await startCamera()
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
        setError('Unable to access the camera. Please allow camera access and try again.')
      } else {
        setError(err.response?.data?.message || 'Verification failed. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  function handleCapture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob(async blob => {
      try {
        const compressed = await compressImage(blob)
        if (compressed.size > 300 * 1024) {
          setError('Photo could not be compressed enough. Please try again with better lighting.')
          return
        }
        setError('')
        setPhotoBlob(compressed)
        setPhotoPreview(URL.createObjectURL(compressed))
        stopCamera()
        setStep('preview')
      } catch {
        setError('Could not process the photo. Please try again.')
      }
    }, 'image/jpeg', 0.92)
  }

  async function handleRetake() {
    setPhotoBlob(null)
    setPhotoPreview('')
    setError('')
    try {
      await startCamera()
    } catch {
      setError('Unable to access the camera. Please allow camera access and try again.')
    }
  }

  async function handleContinue() {
    if (!photoBlob) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('studentId', studentId)
      // The link's token identifies which workspace this tablet belongs to;
      // the backend resolves it and refuses a student from any other one.
      if (token) form.append('token', token)
      form.append('photo', photoBlob, 'photo.jpg')
      await API.post('/api/reception/register', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setStep('success')
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="w-full py-4 px-6 flex items-center justify-center gap-3 shadow-md" style={{ background: BRAND }}>
        <img src="/logo.svg" alt="M H Foundation" className="h-12 w-12 object-contain bg-white rounded-full p-1" />
        <span className="text-white font-heading font-bold text-xl tracking-wide">M H Foundation</span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">

          {step === 'welcome' && (
            <div className="text-center bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-14 transition-all">
              <img src="/logo.svg" alt="" className="h-24 w-24 object-contain mx-auto mb-6" />
              <p className="text-gray-500 text-lg">Welcome to</p>
              <h1 className="font-heading text-4xl font-bold mt-1 mb-4" style={{ color: BRAND }}>M H Foundation</h1>
              <p className="text-gray-600 text-lg mb-10">Please complete Reception Registration</p>
              <button
                onClick={() => setStep('verify')}
                className="text-white text-xl font-semibold px-16 py-5 rounded-2xl shadow-lg active:scale-95 transition-transform"
                style={{ background: BRAND }}
              >
                Start
              </button>
            </div>
          )}

          {step === 'verify' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-10">
              <h2 className="font-heading text-2xl font-bold text-center mb-8" style={{ color: BRAND }}>Reception Registration</h2>
              <form onSubmit={handleVerify} className="space-y-6">
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">Full Name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': BRAND }}
                    placeholder="Enter your full name"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-700 mb-2">Mobile Number or Email</label>
                  <input
                    value={phone}
                    // Accepts either identifier: candidates who registered
                    // through a form that did not collect a phone number
                    // identify themselves by email instead. Stripping to
                    // digits here would make that impossible to type.
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-4 py-4 text-lg border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': BRAND }}
                    placeholder="Enter your mobile number or email"
                    inputMode="text"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 text-white text-lg font-semibold py-4 rounded-xl shadow active:scale-95 transition-transform disabled:opacity-60"
                    style={{ background: BRAND }}
                  >
                    {busy ? 'Verifying…' : 'Verify & Continue'}
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="px-8 py-4 text-lg border border-gray-300 rounded-xl text-gray-600 active:scale-95 transition-transform"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 'capture' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-8">
              <h2 className="font-heading text-2xl font-bold text-center mb-2" style={{ color: BRAND }}>
                Hello{studentName ? `, ${studentName}` : ''}
              </h2>
              <p className="text-center text-gray-500 mb-6">Position your face in the frame and tap Capture</p>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl border border-gray-200 bg-black"
                style={{ height: 400, objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCapture}
                  className="flex-1 text-white text-lg font-semibold py-4 rounded-xl shadow active:scale-95 transition-transform"
                  style={{ background: BRAND }}
                >
                  Capture
                </button>
                <button
                  onClick={() => { stopCamera(); setStep('verify') }}
                  className="px-8 py-4 text-lg border border-gray-300 rounded-xl text-gray-600 active:scale-95 transition-transform"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-8">
              <h2 className="font-heading text-2xl font-bold text-center mb-6" style={{ color: BRAND }}>Confirm Your Photo</h2>
              <img
                src={photoPreview}
                alt="Captured"
                className="w-full rounded-xl border border-gray-200"
                style={{ height: 400, objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleRetake}
                  disabled={busy}
                  className="px-8 py-4 text-lg border border-gray-300 rounded-xl text-gray-600 active:scale-95 transition-transform disabled:opacity-60"
                >
                  Retake
                </button>
                <button
                  onClick={handleContinue}
                  disabled={busy}
                  className="flex-1 text-white text-lg font-semibold py-4 rounded-xl shadow active:scale-95 transition-transform disabled:opacity-60"
                  style={{ background: BRAND }}
                >
                  {busy ? 'Uploading…' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center bg-white rounded-2xl shadow-lg border border-gray-100 px-8 py-14">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-heading text-3xl font-bold mb-3" style={{ color: BRAND }}>Registration Successful</h2>
              <p className="text-gray-600 text-lg">Please proceed to Counselling.</p>
              <p className="text-gray-400 text-sm mt-8">Returning to the welcome screen in {Math.max(countdown, 0)}s…</p>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-center whitespace-pre-line">
              {error}
            </div>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
