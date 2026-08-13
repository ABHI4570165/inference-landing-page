import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ADMIN_HOME } from '../utils/routes'
import API from '../utils/api'
import Spinner from '../components/Spinner'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await API.post('/api/auth/login', { email, password })
      login(res.data.token, res.data.email)
      navigate(ADMIN_HOME)
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Soft depth behind the card — subtle, not a gradient wash */}
      <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-brand-800/60 pointer-events-none" />
      <div className="absolute -bottom-40 -right-24 w-[460px] h-[460px] rounded-full bg-brand-700/40 pointer-events-none" />

      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="bg-white rounded-2xl shadow-panel p-8">
          <div className="text-center mb-7">
            <img src="/logo.svg" alt="" className="w-14 h-14 object-contain mx-auto mb-4" />
            <h1 className="font-heading text-[22px] font-bold text-ink-900">Welcome back</h1>
            <p className="text-ink-500 text-[13.5px] mt-1">Sign in to the recruitment admin panel</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Email</label>
              <input type="email" className="form-input" value={email} autoComplete="username"
                onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input type="password" className="form-input" value={password} autoComplete="current-password"
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>

            {error && (
              <p className="text-[13.5px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">{error}</p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full !py-3 mt-1">
              {loading ? <><Spinner /> Signing in…</> : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-[12px] text-brand-300 mt-5">Recruitment Management Platform</p>
      </div>
    </div>
  )
}
