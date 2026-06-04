import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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
      navigate('/admin/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-800 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-2xl font-heading">M</span>
          </div>
          <h1 className="font-heading text-2xl font-bold text-gray-800">Admin Login</h1>
          <p className="text-gray-500 text-sm mt-1">Mandi Hariyaanna Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required />
          </div>
          <div>
            <label className="form-label">Password</label>
            <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>

          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? <><Spinner /> Logging in...</> : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
